"""Non-AI classification used when Gemini is unavailable."""

import re

# Typical severity per category (0-100) when no AI estimate exists.
DEFAULT_SEVERITY = {
    "pipeline_burst": 90,
    "contaminated_water": 85,
    "power_outage": 75,
    "no_water_supply": 75,
    "fallen_tree": 70,
    "pothole": 60,
    "drainage_overflow": 60,
    "waterlogging": 60,
    "water_leakage": 55,
    "road_damage": 50,
    "garbage": 50,
    "illegal_dumping": 45,
    "stray_animals": 40,
    "streetlight": 35,
    "other": 30,
}

# Keywords in English plus common Marathi/Hindi words written in Latin or Devanagari.
KEYWORDS = {
    "pipeline_burst": ["burst", "pipeline", "gushing", "फुटली", "फटी"],
    "contaminated_water": [
        "dirty water",
        "yellow water",
        "smell",
        "contaminated",
        "गढूळ",
        "गंदा पानी",
    ],
    "no_water_supply": ["no water", "water not coming", "pani nahi", "पाणी नाही", "पानी नहीं"],
    "water_leakage": ["leak", "leakage", "valve", "गळती", "रिसाव"],
    "pothole": ["pothole", "khadda", "khadde", "खड्डा", "गड्ढा"],
    "road_damage": ["road broken", "road damage", "crack", "dug up", "रस्ता खराब"],
    "garbage": ["garbage", "kachra", "trash", "waste", "bin", "कचरा"],
    "illegal_dumping": ["debris", "dumped", "dumping", "rubble"],
    "streetlight": ["street light", "streetlight", "lamp", "light not working", "दिवा"],
    "power_outage": ["power cut", "no electricity", "light gone", "outage", "बत्ती गुल", "वीज नाही"],
    "drainage_overflow": ["drain", "drainage", "sewage", "gutter", "गटार", "नाली"],
    "waterlogging": ["waterlogging", "water logging", "flooded road", "rain water", "पाणी साचले"],
    "fallen_tree": ["tree fell", "fallen tree", "branch", "tree", "झाड", "पेड़"],
    "stray_animals": ["stray", "dog", "cattle", "cow", "monkey", "कुत्रे", "कुत्ते"],
}

_SENSITIVE = re.compile(r"school|hospital|bus stop|temple|market|college|शाळा|रुग्णालय|स्कूल|अस्पताल")


def classify_text(description: str | None) -> tuple[str, float]:
    """Best category for a description, with a rough confidence."""
    text = (description or "").lower()
    best, hits = "other", 0
    for category, words in KEYWORDS.items():
        count = sum(1 for word in words if word in text)
        if count > hits:
            best, hits = category, count
    return best, (0.5 if hits else 0.2)


def mentions_sensitive_place(description: str | None) -> bool:
    return bool(_SENSITIVE.search((description or "").lower()))
