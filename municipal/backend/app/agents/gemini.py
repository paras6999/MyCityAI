"""Google Gemini calls: photo + text understanding, and text embeddings.

Every function returns None when no API key is configured or the call fails, so callers
always fall back to non-AI behaviour instead of losing a complaint.

When the ML team's YOLOv8 weights are ready, a local detector can supply
`detected_objects` before this call (or replace it for supported categories).
"""

import logging
from functools import lru_cache

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.schemas.complaint import Category

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSIONS = 256


class IssueAnalysis(BaseModel):
    """Structured answer we ask Gemini for."""

    is_civic_issue: bool = Field(description="False if the photo shows no municipal problem")
    category: Category
    confidence: float = Field(ge=0, le=1)
    severity: int = Field(ge=0, le=100, description="0 = trivial, 100 = danger to life")
    summary: str = Field(description="One sentence, at most 20 words, in English")
    detected_objects: list[str] = Field(description="Short lowercase labels of relevant objects")
    sensitive_location: bool = Field(
        description="True if near a school, hospital, bus stop, temple or other busy public place"
    )


PROMPT = """You triage civic complaints for an Indian municipal corporation (Kolhapur).
Look at the photo and the citizen's description (may be English, Marathi or Hindi).

Choose exactly one category:
- pothole: hole or depression in a road
- road_damage: cracked, broken or dug-up road surface (not a single pothole)
- garbage: uncollected household waste, overflowing bins
- illegal_dumping: construction debris or waste dumped on public land
- water_leakage: leaking pipe, valve or tap on public supply
- no_water_supply: complaint that water is not coming
- pipeline_burst: large burst with water gushing or flooding
- contaminated_water: dirty, coloured or smelly tap water
- streetlight: street light not working or damaged
- power_outage: electricity cut for an area
- drainage_overflow: sewage or gutter overflowing
- waterlogging: rain water collected on roads
- fallen_tree: tree or large branch fallen or about to fall
- stray_animals: stray dogs, cattle or other animals causing trouble
- other: anything else

Severity guide: 90-100 immediate danger to life or major flooding; 70-89 serious hazard or
many people affected; 40-69 clear problem needing repair within days; 0-39 minor or cosmetic.

Citizen description: {description}"""


@lru_cache
def _client() -> genai.Client | None:
    settings = get_settings()
    if not settings.gemini_api_key:
        return None
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=settings.ai_timeout_seconds * 1000),
    )


def analyze_issue(image: bytes, mime_type: str, description: str | None) -> IssueAnalysis | None:
    client = _client()
    if client is None:
        return None
    try:
        response = client.models.generate_content(
            model=get_settings().gemini_model,
            contents=[
                types.Part.from_bytes(data=image, mime_type=mime_type),
                PROMPT.format(description=description or "(none)"),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=IssueAnalysis,
                temperature=0.1,
            ),
        )
        if isinstance(response.parsed, IssueAnalysis):
            return response.parsed
        return IssueAnalysis.model_validate_json(response.text or "")
    except Exception:
        logger.exception("Gemini analysis failed; using fallback classifier")
        return None


class FixCheck(BaseModel):
    """Gemini's verdict on a before/after pair."""

    fixed: bool
    confidence: float = Field(ge=0, le=1)
    reason: str = Field(description="One short sentence explaining the verdict")


FIX_PROMPT = """The first photo shows a reported civic problem (category: {category}).
The second photo was uploaded by a municipal officer as proof that it is fixed.
Decide if the second photo shows the SAME place with the problem repaired or removed.
Answer fixed=false if the problem is still visible, if the place looks different/unrelated,
or if the photo is unclear."""


def check_fix(
    before: bytes, before_mime: str, after: bytes, after_mime: str, category: str
) -> FixCheck | None:
    client = _client()
    if client is None:
        return None
    try:
        response = client.models.generate_content(
            model=get_settings().gemini_model,
            contents=[
                types.Part.from_bytes(data=before, mime_type=before_mime),
                types.Part.from_bytes(data=after, mime_type=after_mime),
                FIX_PROMPT.format(category=category),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=FixCheck,
                temperature=0.1,
            ),
        )
        if isinstance(response.parsed, FixCheck):
            return response.parsed
        return FixCheck.model_validate_json(response.text or "")
    except Exception:
        logger.exception("Gemini fix check failed")
        return None


class AnnouncementText(BaseModel):
    title: str = Field(description="Short headline, at most 8 words")
    message: str = Field(description="1-3 short sentences for citizens, with times/places")


class Translations(BaseModel):
    mr: AnnouncementText = Field(description="Marathi (Devanagari script)")
    hi: AnnouncementText = Field(description="Hindi (Devanagari script)")


DRAFT_PROMPT = """You write public notices for Kolhapur Municipal Corporation.
Turn the officer's rough note into a clear, polite announcement in simple English.
Keep every time, date, place and ward number exactly. Do not invent facts.
Department: {department}. Officer's note: {text}"""

TRANSLATE_PROMPT = """Translate this municipal announcement for citizens of Kolhapur into
Marathi and Hindi (Devanagari). Keep numbers, times, dates and place names exact.
Title: {title}
Message: {message}"""


def _structured(prompt: str, schema: type[BaseModel]):
    client = _client()
    if client is None:
        return None
    try:
        response = client.models.generate_content(
            model=get_settings().gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=schema, temperature=0.2
            ),
        )
        if isinstance(response.parsed, schema):
            return response.parsed
        return schema.model_validate_json(response.text or "")
    except Exception:
        logger.exception("Gemini %s request failed", schema.__name__)
        return None


def draft_announcement(text: str, department: str | None) -> AnnouncementText | None:
    return _structured(
        DRAFT_PROMPT.format(text=text, department=department or "general"), AnnouncementText
    )


def translate_announcement(title: str, message: str) -> Translations | None:
    return _structured(TRANSLATE_PROMPT.format(title=title, message=message), Translations)


def embed_text(text: str) -> list[float] | None:
    client = _client()
    if client is None or not text.strip():
        return None
    try:
        response = client.models.embed_content(
            model=get_settings().gemini_embedding_model,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="SEMANTIC_SIMILARITY", output_dimensionality=EMBEDDING_DIMENSIONS
            ),
        )
        values = response.embeddings[0].values if response.embeddings else None
        return list(values) if values else None
    except Exception:
        logger.exception("Gemini embedding failed; duplicate check uses location only")
        return None
