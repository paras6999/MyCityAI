"""Check an officer's after-photo before a complaint can be marked resolved.

Order of checks:
1. identical  — the "after" photo is the same file as the complaint photo → not fixed
2. yolo       — our model saw the problem before; is it still visible after? A "gone" result
                only counts as verified if the after-photo shows the same place (scene.py)
3. gemini     — optional before/after comparison (any category)
4. none       — no AI could judge: resolve, but mark as not checked so the citizen's
                confirmation (or reopen) is the check
"""

import hashlib
from dataclasses import dataclass
from typing import Literal

from app.agents import gemini, scene, vision

Outcome = Literal["verified", "not_fixed", "not_checked"]


@dataclass(frozen=True)
class Verification:
    outcome: Outcome
    confidence: float | None
    reason: str
    method: Literal["identical", "yolo", "gemini", "none"]

    @property
    def ai_verified(self) -> bool | None:
        """API.md §3.7: True = verified, False = not fixed, None = not checked."""
        return {"verified": True, "not_fixed": False, "not_checked": None}[self.outcome]


def _label(category: str) -> str:
    return category.replace("_", " ")


def verify_fix(
    category: str,
    before: bytes | None,
    before_mime: str | None,
    after: bytes,
    after_mime: str,
) -> Verification:
    if before is not None and hashlib.sha256(before).digest() == hashlib.sha256(after).digest():
        return Verification(
            "not_fixed", 1.0, "The after-photo is the same as the complaint photo", "identical"
        )

    if category in vision.supported_categories():
        after_hits = [d for d in vision.detect(after) or [] if d.category == category]
        if after_hits:
            top = after_hits[0].confidence
            return Verification(
                "not_fixed",
                top,
                f"{_label(category).capitalize()} still visible ({top:.0%})",
                "yolo",
            )
        before_hits = (
            [d for d in vision.detect(before) or [] if d.category == category] if before else []
        )
        if before_hits and scene.same_place(before, after) is False:
            return Verification(
                "not_checked",
                None,
                f"No {_label(category)} visible, but the after-photo does not look like the same "
                "place; the citizen will confirm",
                "yolo",
            )
        if before_hits:
            return Verification(
                "verified",
                round(before_hits[0].confidence, 2),
                f"{_label(category).capitalize()} seen before is no longer visible",
                "yolo",
            )
        # Our model never saw the problem in the complaint photo, so it cannot judge the repair.

    if before is not None and before_mime:
        check = gemini.check_fix(before, before_mime, after, after_mime, category)
        if check is not None:
            return Verification(
                "verified" if check.fixed else "not_fixed",
                round(check.confidence, 2),
                check.reason,
                "gemini",
            )

    return Verification(
        "not_checked", None, "AI could not check this repair; the citizen will confirm", "none"
    )
