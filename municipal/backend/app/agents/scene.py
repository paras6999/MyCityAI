"""Is the after-photo taken at the same place as the complaint photo? (free, offline)

Matches distinctive points (ORB features: building edges, road markings, trees) between the
two photos and keeps only matches that agree on one camera movement (RANSAC homography).
Same place: hundreds of such matches; different place: almost none.
"""

import logging

logger = logging.getLogger(__name__)

# Measured: same scene re-shot/cropped ≈ 390 matches, unrelated photos 0. Repairs change only
# the damaged area, so the surroundings still match.
MIN_GEOMETRIC_MATCHES = 25


def _decode_gray(image: bytes):
    import cv2
    import numpy as np

    picture = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_GRAYSCALE)
    if picture is None:
        return None
    # Compare at a common size so phone photos and thumbnails behave alike.
    scale = 1000 / max(picture.shape)
    return cv2.resize(picture, None, fx=scale, fy=scale) if scale < 1 else picture


def geometric_matches(before: bytes, after: bytes) -> int | None:
    """Number of consistent feature matches, or None if OpenCV is unavailable/decoding fails."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None
    first, second = _decode_gray(before), _decode_gray(after)
    if first is None or second is None:
        return None

    orb = cv2.ORB_create(1500)
    keys_a, desc_a = orb.detectAndCompute(first, None)
    keys_b, desc_b = orb.detectAndCompute(second, None)
    if desc_a is None or desc_b is None:
        return 0
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(desc_a, desc_b, k=2)
    good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < 0.75 * p[1].distance]
    if len(good) < 8:  # a homography needs a handful of points
        return len(good)
    src = np.float32([keys_a[m.queryIdx].pt for m in good])
    dst = np.float32([keys_b[m.trainIdx].pt for m in good])
    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    return int(mask.sum()) if mask is not None else 0


def same_place(before: bytes, after: bytes) -> bool | None:
    """True / False, or None when it cannot be judged."""
    matches = geometric_matches(before, after)
    if matches is None:
        return None
    logger.info("Scene match between before/after photos: %d geometric matches", matches)
    return matches >= MIN_GEOMETRIC_MATCHES
