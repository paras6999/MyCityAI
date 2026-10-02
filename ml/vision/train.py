"""Train the MyCityAI complaint-photo detector (YOLOv8). Run on Google Colab with a GPU.

    pip install ultralytics
    python train.py --data /content/civic-issues-1/data.yaml --model yolov8s.pt --epochs 100

See docs/ML.md for datasets, class names and how to deploy the result.
"""

import argparse
from pathlib import Path

from ultralytics import YOLO

# Must match docs/ML.md §1 and the "labels" in ml/vision/models.json.
EXPECTED_CLASSES = {
    "pothole",
    "road_crack",
    "garbage_pile",
    "overflowing_bin",
    "construction_debris",
    "fallen_tree",
    "broken_streetlight",
    "waterlogging",
    "drain_overflow",
    "open_manhole",
    "water_leak",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="data.yaml exported from Roboflow (YOLOv8)")
    parser.add_argument("--model", default="yolov8s.pt", help="starting weights (COCO pretrained)")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--name", default="v1")
    args = parser.parse_args()

    model = YOLO(args.model)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=20,
        project="mycityai",
        name=args.name,
    )

    trained = YOLO(Path("mycityai") / args.name / "weights" / "best.pt")
    unknown = set(trained.names.values()) - EXPECTED_CLASSES
    if unknown:
        print(f"WARNING: classes not in docs/ML.md (add them to models.json labels): {unknown}")

    metrics = trained.val(data=args.data, split="test")
    print(f"Test mAP@0.5 = {metrics.box.map50:.3f}   mAP@0.5:0.95 = {metrics.box.map:.3f}")
    for index, name in trained.names.items():
        print(f"  {name:22s} mAP@0.5:0.95 = {metrics.box.maps[index]:.3f}")


if __name__ == "__main__":
    main()
