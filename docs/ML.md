# ML.md — Training the Complaint Photo Model

**Owner:** ML team · **Used by:** `municipal/backend/app/agents/vision.py` · **Model registry:** [`ml/vision/models.json`](../ml/vision/models.json)

> **Status today:** the backend runs a **free placeholder** pothole model from Hugging Face
> ([peterhdd/pothole-detection-yolov8](https://huggingface.co/peterhdd/pothole-detection-yolov8), Apache-2.0)
> plus the standard **YOLOv8n COCO** model for stray animals. The placeholder only knows potholes
> and makes mistakes (e.g. it marked mountains as a pothole in a test photo).
> **Goal:** replace it with our own multi-class model trained on Indian street photos.

---

## 1. What the model must recognise

Not every complaint is visible in a photo. The pipeline combines three signals:
**photo (YOLO) → text (keywords / Gemini) → citizen's own choice**, so we only train YOLO on what a camera can actually see.

| Category (`shared/constants.json`) | Visible in a photo? | How we handle it | YOLO class name(s) to train |
|---|---|---|---|
| `pothole` | ✅ yes | **Detection** | `pothole` |
| `road_damage` | ✅ yes | Detection | `road_crack` |
| `garbage` | ✅ yes | Detection | `garbage_pile`, `overflowing_bin` |
| `illegal_dumping` | ✅ yes | Detection | `construction_debris` |
| `fallen_tree` | ✅ yes | Detection | `fallen_tree` |
| `streetlight` | ⚠️ partly | Detection of damage; "not working" is only visible at night → text helps | `broken_streetlight` |
| `waterlogging` | ✅ yes | Detection of the flooded area | `waterlogging` |
| `drainage_overflow` | ✅ yes | Detection | `drain_overflow`, `open_manhole` |
| `water_leakage` / `pipeline_burst` | ⚠️ partly | Detection | `water_leak` |
| `stray_animals` | ✅ yes | **Already works** — pretrained COCO model (`dog`, `cow`, `horse`, `sheep`) | — (no training) |
| `no_water_supply`, `power_outage`, `contaminated_water` | ❌ no | Text only (keywords / Gemini) | — |
| `other` | — | Text / citizen | — |

**Recommendation: one YOLOv8 detection model with ~11 classes.** One model is simpler to train, deploy and evaluate than one per category, and YOLO handles multiple classes well. (Waterlogging could later become a separate classification model if detection boxes work poorly for large flooded areas.)

## 2. Datasets (free)

| Classes | Where to start | Notes |
|---|---|---|
| `pothole`, `road_crack` | **RDD2022** (Road Damage Dataset — has an **India** subset), Roboflow Universe pothole datasets, the placeholder's dataset `Ryukijano/Pothole-detection-Yolov8` on Hugging Face | RDD2022 labels: D00/D10/D20 = cracks → `road_crack`, D40 = pothole → `pothole` |
| `garbage_pile`, `overflowing_bin`, `construction_debris` | Roboflow Universe: search "garbage detection India", "garbage pile", "dumping" | TACO dataset has single litter items (bottles), not street piles — use only as extra data |
| `fallen_tree` | Roboflow Universe: "fallen tree" | Few datasets — collect our own photos too |
| `broken_streetlight` | Roboflow Universe: "street light" | Collect photos of damaged / hanging lamps |
| `waterlogging` | Roboflow Universe: "flood", "waterlogging" | Monsoon photos from news sites work well (check licences) |
| `drain_overflow`, `open_manhole`, `water_leak` | Roboflow Universe: "manhole", "sewage", "water leakage" | Small datasets — collect our own |

**Collect our own photos in Kolhapur** (phone camera, different times of day, rain/dry). Even 50–100 local photos per class make a big difference. Always check and record each dataset's licence in [`ml/README.md`](../ml/README.md).

**Targets:** at least **300–500 labelled images per class**, plus ~10–15 % **negative** images (no labels) so the model learns *not* to fire on everything: clean roads, **repaired/patched roads**, and photos with **sky, hills, buildings and shadows** in them.

> Lesson from testing the placeholder: it marks **mountains/sky at the top of road photos as potholes** (74 % and 49 %). That false positive even blocked a genuine repair in the Phase 5 after-photo check. Negatives with hills and sky fix this.

## 3. Labelling

1. Create a free **Roboflow** project (Object Detection), upload images, import public datasets.
2. Draw a box around each object and use **exactly** the class names in the table above (lowercase, underscores).
3. Merge/rename classes from imported datasets to our names (Roboflow → *Modify Classes*).
4. Split **70 % train / 20 % valid / 10 % test**. Keep the test set untouched until the final report.
5. Augmentations (Roboflow or YOLO's built-in): flip, brightness ±25 %, blur, rotation ±10°. Don't flip vertically.
6. Export as **YOLOv8** format → you get `data.yaml` + `train/ valid/ test/` folders.

## 3b. Building the dataset (scripts in `ml/vision/`)

```bash
python ml/vision/download_public.py                     # free public data → ml/vision/data/raw/ (~540 MB)
python ml/vision/build_dataset.py --name civic-v0 --zip # merge + rename classes → ml/vision/data/civic-v0.zip
```
- Roboflow exports (format **YOLOv8**): unzip each into `ml/vision/data/raw/roboflow/<name>/`; your own labelled Kolhapur photos into `ml/vision/data/raw/kolhapur/<name>/`. Re-run `build_dataset.py` with a new name (`civic-v1`, …).
- Class names from other datasets are translated with [`class_aliases.json`](../ml/vision/class_aliases.json); unknown names are listed so you can add them. Class ids never change (order of §1), so every version stays compatible with `models.json`.
- About 12 % of photos without any problem are kept on purpose (clean / repaired roads) so the model learns not to fire on everything.
- `ml/vision/data/` is git-ignored — share datasets through Google Drive or Roboflow, never GitHub.

## 4. Training (Google Colab, free GPU)

**Easiest:** open [`ml/vision/train_colab.ipynb`](../ml/vision/train_colab.ipynb) in Google Colab (File → Upload notebook), upload `civic-v0.zip` to Google Drive → `MyCityAI/`, choose **T4 GPU** and *Run all*. It resumes after disconnects and saves the model + test metrics to Drive.


Use [`ml/vision/train.py`](../ml/vision/train.py) or these Colab cells (Runtime → Change runtime type → **T4 GPU**):

```python
!pip install ultralytics roboflow

# 1. Get the dataset (from Roboflow "Export → show download code")
from roboflow import Roboflow
rf = Roboflow(api_key="YOUR_ROBOFLOW_KEY")          # keep keys out of git
dataset = rf.workspace("mycityai").project("civic-issues").version(1).download("yolov8")

# 2. Train — start from YOLOv8s pretrained on COCO (transfer learning)
from ultralytics import YOLO
model = YOLO("yolov8s.pt")
model.train(data=f"{dataset.location}/data.yaml", epochs=100, imgsz=640, batch=16,
            patience=20, project="mycityai", name="v1")

# 3. Evaluate on the untouched test split
metrics = model.val(data=f"{dataset.location}/data.yaml", split="test")
print(metrics.box.map50, metrics.box.map)            # mAP@0.5 and mAP@0.5:0.95

# 4. Download the trained weights
from google.colab import files
files.download("mycityai/v1/weights/best.pt")
```

Tips:
- `yolov8n` = fastest, `yolov8s` = good balance (**recommended**), `yolov8m` = more accurate but slower on CPU.
- If a class has low mAP, add more (and more varied) images for it — that helps more than more epochs.
- Save `results.png`, `confusion_matrix.png` and `PR_curve.png` from the run folder for the report.

## 5. Deploying our model

1. Rename `best.pt` → `mycityai-yolov8s-v1.pt` and upload it to the team Google Drive (**never commit `.pt` files**).
2. Copy it to `municipal/backend/models/` on the machine running the backend.
3. Get its checksum: `python -c "import hashlib;print(hashlib.sha256(open('mycityai-yolov8s-v1.pt','rb').read()).hexdigest())"`
4. Edit [`ml/vision/models.json`](../ml/vision/models.json): add an entry and **remove the placeholder**:
   ```json
   {
     "name": "mycityai-v1",
     "status": "trained by the MyCityAI ML team",
     "file": "mycityai-yolov8s-v1.pt",
     "sha256": "<checksum from step 3>",
     "license": "AGPL-3.0 (Ultralytics) — our weights",
     "labels": {
       "pothole": "pothole", "road_crack": "road_damage",
       "garbage_pile": "garbage", "overflowing_bin": "garbage",
       "construction_debris": "illegal_dumping", "fallen_tree": "fallen_tree",
       "broken_streetlight": "streetlight", "waterlogging": "waterlogging",
       "drain_overflow": "drainage_overflow", "open_manhole": "drainage_overflow",
       "water_leak": "water_leakage"
     },
     "min_confidence": 0.4
   }
   ```
   Keep the `coco-yolov8n` entry for stray animals.
5. Restart the backend — the log shows `Loaded vision model mycityai-v1`.
6. Check it on a real photo:
   `RUN_VISION_TESTS=1 VISION_SAMPLE_IMAGE=path/to/pothole.jpg pytest tests/test_vision.py -k real`

No backend code changes are needed: `labels` maps our class names to complaint categories.

## 6. What to report (evaluation)

| Metric | Where it comes from |
|---|---|
| mAP@0.5 and mAP@0.5:0.95 (overall + per class) | `model.val(split="test")` |
| Precision / recall per class | same |
| Confusion matrix | `confusion_matrix.png` |
| Inference time on CPU (ms per photo) | backend log / `model.predict(..., verbose=True)` |
| **Placeholder vs our model** on the same test photos | run both — shows the value of training |
| False positives examples | e.g. the placeholder's "pothole" on mountains |

## 7. Where else models are used

| Use | Model | Phase |
|---|---|---|
| Is it really fixed? (after-photo check) | Same YOLO model: the problem seen before must be gone, **and** OpenCV feature matching must show the same place (`app/agents/scene.py`) | Phase 5 ✅ |
| Police CCTV objects (vehicles, people) | YOLOv8 (COCO) | Phase 9 |
| Police CCTV actions (accident, fight, crowd) | **V-JEPA 2** (Meta, MIT licence) video model + small classifier trained on e.g. RWF-2000 | Phase 9 |

## 8. Licences

- **Ultralytics YOLOv8 is AGPL-3.0** — fine for this open college project; a commercial product would need Ultralytics' licence.
- Each dataset has its own licence (CC BY 4.0, etc.) — record it in `ml/README.md`.
- The placeholder model is Apache-2.0.
