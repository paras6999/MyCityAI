import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.agents import vision
from app.agents.vision import Detection
from tests.conftest import auth_header
from tests.test_ai import fake_gemini
from tests.test_complaints import citizen_token, staff_token, submit


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.media.media_root", lambda: tmp_path)


def pothole(confidence=0.9, box=(0.3, 0.6, 0.6, 0.9)):
    return Detection("pothole", "0", confidence, list(box), "pothole-hf-placeholder")


# --- label mapping -----------------------------------------------------------


def fake_yolo(names, boxes):
    """Mimics an ultralytics model: predict() -> [result with .names and .boxes]."""

    def predict(image, conf, verbose):
        result_boxes = [
            SimpleNamespace(
                cls=cls,
                conf=score,
                xyxyn=[SimpleNamespace(tolist=lambda b=box: list(b))],
            )
            for cls, score, box in boxes
            if score >= conf
        ]
        return [SimpleNamespace(names=names, boxes=result_boxes)]

    return SimpleNamespace(predict=predict)


def test_detect_maps_model_labels_to_categories(monkeypatch):
    models = [
        vision._LoadedModel(
            "pothole-hf",
            fake_yolo({0: "0"}, [(0, 0.8, (0.1, 0.1, 0.2, 0.2))]),
            {"0": "pothole"},
            0.4,
        ),
        vision._LoadedModel(
            "coco",
            fake_yolo(
                {0: "person", 16: "dog"},
                [
                    (0, 0.99, (0, 0, 1, 1)),
                    (16, 0.95, (0.5, 0.5, 0.7, 0.8)),
                    (16, 0.3, (0, 0, 0.1, 0.1)),
                ],
            ),
            {"dog": "stray_animals"},
            0.5,
        ),
    ]
    monkeypatch.setattr("app.agents.vision._load_models", lambda: models)
    png = (Path(__file__).parents[3] / "docs" / "assets" / "1_citizen_app.png").read_bytes()

    detections = vision.detect(png)

    # "person" is not a complaint category; the 0.3 dog is below that model's threshold
    assert [(d.category, d.confidence) for d in detections] == [
        ("stray_animals", 0.95),
        ("pothole", 0.8),
    ]


def test_detect_returns_none_without_models():
    assert vision.detect(b"anything") is None


def test_severity_grows_with_count_and_size():
    small = pothole(box=(0.0, 0.0, 0.1, 0.1))
    large = pothole(box=(0.0, 0.0, 0.5, 0.5))

    assert vision.severity_from("pothole", [small]) == 60
    assert vision.severity_from("pothole", [small, small, small]) == 70
    assert vision.severity_from("pothole", [large]) == 70


def test_checksum_mismatch_refuses_model(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.agents.vision.get_settings", lambda: SimpleNamespace(models_dir=tmp_path)
    )
    (tmp_path / "model.pt").write_bytes(b"not the real weights")

    entry = {"name": "x", "file": "model.pt", "sha256": "0" * 64}
    assert vision._ensure_weights(entry) is None
    entry["sha256"] = vision._sha256(tmp_path / "model.pt")
    assert vision._ensure_weights(entry) == tmp_path / "model.pt"


# --- pipeline ----------------------------------------------------------------


def test_yolo_detection_sets_category_and_boxes(client, monkeypatch):
    monkeypatch.setattr("app.agents.vision.detect", lambda image: [pothole(), pothole(0.6)])
    complaint = submit(client, citizen_token(client), description="please fix this")
    staff_view = client.get(
        f"/api/v1/staff/complaints/{complaint['id']}",
        headers=auth_header(staff_token(client, "officer.roads")),
    ).json()

    assert complaint["category"] == "pothole"
    assert staff_view["ai"]["model"] == "yolo"
    assert staff_view["ai"]["category_confidence"] == 0.9
    assert staff_view["ai"]["severity"] == 65  # default 60 + 5 for the second pothole
    assert staff_view["ai"]["detections"][0] == {
        "label": "pothole",
        "confidence": 0.9,
        "box": [0.3, 0.6, 0.6, 0.9],
    }


def test_yolo_category_beats_gemini_but_keeps_summary(client, monkeypatch):
    monkeypatch.setattr("app.agents.vision.detect", lambda image: [pothole()])
    fake_gemini(monkeypatch)  # Gemini says water_leakage
    complaint = submit(client, citizen_token(client))

    assert complaint["category"] == "pothole"
    assert complaint["ai"]["summary"].startswith("Water leaking")


def test_analyze_returns_detections(client, monkeypatch):
    monkeypatch.setattr("app.agents.vision.detect", lambda image: [pothole()])
    response = client.post(
        "/api/v1/citizen/complaints/analyze",
        data={"lat": "16.69", "lng": "74.25"},
        files={"photo": ("p.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "image/png")},
        headers=auth_header(citizen_token(client)),
    )

    assert response.json()["suggested_category"] == "pothole"
    assert response.json()["detections"][0]["label"] == "pothole"


# --- real model (opt-in: RUN_VISION_TESTS=1, needs requirements-ml.txt) --------

SAMPLE = os.environ.get("VISION_SAMPLE_IMAGE")


@pytest.mark.skipif(not os.environ.get("RUN_VISION_TESTS"), reason="set RUN_VISION_TESTS=1")
def test_real_pothole_model_finds_pothole(monkeypatch):
    monkeypatch.undo()  # use the real model loader
    vision._load_models.cache_clear()
    assert SAMPLE, "set VISION_SAMPLE_IMAGE to a pothole photo"

    detections = vision.detect(Path(SAMPLE).read_bytes())

    assert detections and detections[0].category == "pothole"
