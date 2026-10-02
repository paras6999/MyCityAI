# 🧪 ml — training & evaluation

Notebooks and scripts for the AI models. **No datasets or weights in git** — store them on Google Drive / Hugging Face and list links here.

**Start with [docs/ML.md](../docs/ML.md)** — which classes to train, datasets, labelling, Colab training, and how to deploy a model to the backend via [`vision/models.json`](vision/models.json).

| Folder | Model | Used by |
|---|---|---|
| `vision/` | YOLOv8: potholes, garbage, waterlogging (complaints); accidents, congestion, crowds (police) | municipal + police backends |
| `nlp/` | Complaint classifier (Sentence-BERT all-MiniLM-L6-v2) | municipal backend |
| `forecasting/` | LSTM demand forecast, Isolation Forest anomalies (simulated sensors) | municipal backend |

## Datasets (add links)
| Dataset | Link | Notes |
|---|---|---|
| RDD2022 (road damage, India subset) | | potholes / cracks — record licence |
| Ryukijano/Pothole-detection-Yolov8 (HF) | https://huggingface.co/datasets/Ryukijano/Pothole-detection-Yolov8 | used by the placeholder model |
| Garbage pile (Roboflow Universe) | | |
| Fallen tree (Roboflow Universe) | | |
| Waterlogging / flood (Roboflow Universe) | | |
| RWF-2000 (fights, police CCTV) | | Phase 9 |

## Trained weights (add links)
| Model | Version | Link | mAP / F1 |
|---|---|---|---|
| Pothole placeholder (peterhdd, Apache-2.0) | HF best.pt | https://huggingface.co/peterhdd/pothole-detection-yolov8 | not reported; false positives seen |
| YOLOv8n COCO (animals only) | v8.3.0 | https://github.com/ultralytics/assets/releases | COCO |
| **mycityai-yolov8s-v1** (ours) | — | *(Drive link when trained)* | *(fill in)* |
