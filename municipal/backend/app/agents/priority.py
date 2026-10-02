"""Priority score 0-100 (docs/Architecture.md §5.2).

Severity is the base; other signals add bounded boosts so a severe new complaint is already
"high" while repeated reports, sensitive places and waiting time push it up further.
"""

MAX_DUPLICATE_BOOST = 20
SENSITIVE_BOOST = 15
MAX_WAITING_BOOST = 15
MAX_FORECAST_BOOST = 10


def compute_priority(
    severity: int,
    duplicate_count: int = 0,
    sensitive_location: bool = False,
    sla_elapsed_fraction: float = 0.0,
    forecast_risk: float = 0.0,
) -> int:
    """
    severity: 0-100 from AI (or category default)
    duplicate_count: other reports merged into this complaint
    sla_elapsed_fraction: 0 at creation, 1 at the SLA deadline (boost grows until then)
    forecast_risk: 0-1 from the Utilities agent (Phase 8)
    """
    score = severity
    score += min(MAX_DUPLICATE_BOOST, 5 * duplicate_count)
    score += SENSITIVE_BOOST if sensitive_location else 0
    score += round(MAX_WAITING_BOOST * min(1.0, max(0.0, sla_elapsed_fraction)))
    score += round(MAX_FORECAST_BOOST * min(1.0, max(0.0, forecast_risk)))
    return max(0, min(100, score))
