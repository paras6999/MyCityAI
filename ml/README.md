# 🧪 ml — training & evaluation

Notebooks and scripts for the AI models. **No datasets or weights in git** — store them on Google Drive / Hugging Face and list links here.

**Start with [docs/ML.md](../docs/ML.md)** — which classes to train, datasets, labelling, Colab training, and how to deploy a model to the backend via [`vision/models.json`](vision/models.json).

| Folder | Model | Used by |
|---|---|---|
| `vision/` | YOLOv8: potholes, garbage, waterlogging (complaints); accidents, congestion, crowds (police) | municipal + police backends |
| `nlp/` | Complaint classifier (Sentence-BERT all-MiniLM-L6-v2) | municipal backend |
| `forecasting/` | LSTM demand forecast, Isolation Forest anomalies (simulated sensors) — see [forecasting/README.md](forecasting/README.md) | municipal backend |

## Datasets (add links)
| Dataset | Link | Notes |
|---|---|---|
| RDD2022, **India images only** (7,706 photos, YOLO export) | https://huggingface.co/datasets/dronefreak/RDD2022 | **CC BY-SA 4.0** — cite the RDD2022 paper (Arya et al., 2022). D00/D10/D20 → `road_crack`. **Its India "pothole" (class 3) boxes are faded lane markings — checked by eye, dropped.** Used in civic-v0 for cracks only |
| Ryukijano/Pothole-detection-Yolov8 (HF, from Roboflow `project-ssayl/potholes-detection-d4rma`) | https://huggingface.co/datasets/Ryukijano/Pothole-detection-Yolov8 | HF card: OpenRAIL; Roboflow source: CC BY 4.0. ~665 photos → `pothole`. Used in civic-v0 |
| Garbage pile (Roboflow Universe) | | |
| Fallen tree (Roboflow Universe) | | |
| Waterlogging / flood (Roboflow Universe) | | |
| ~~keremberke/garbage-object-detection~~ | | **Not suitable**: single items (bottles, cardboard), not street garbage piles |
| ~~delima87/manhole_covers_dataset~~ | | **Not suitable**: closed manhole covers only (we need *open* manholes) |
| RWF-2000 (fights, police CCTV) | | Phase 9 |

## Trained weights (add links)
| Model | Version | Link | mAP / F1 |
|---|---|---|---|
| Pothole placeholder (peterhdd, Apache-2.0) | HF best.pt | https://huggingface.co/peterhdd/pothole-detection-yolov8 | not reported; false positives seen |
| YOLOv8n COCO (animals only) | v8.3.0 | https://github.com/ultralytics/assets/releases | COCO |
| **mycityai-yolov8s-v1** (ours) | — | *(Drive link when trained)* | *(fill in)* |
