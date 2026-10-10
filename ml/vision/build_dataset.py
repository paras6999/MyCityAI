"""Merge downloaded / exported datasets into one YOLO dataset with our 11 class names.

    python ml/vision/download_public.py            # free public data (once)
    python ml/vision/build_dataset.py --name civic-v0 --zip

Sources (all under ml/vision/data/raw/, git-ignored):
- rdd2022/              RDD2022 India images (download_public.py)
- pothole-ryukijano/    pothole dataset (download_public.py)
- roboflow/<any>/       any Roboflow "YOLOv8" export (unzip it here) — class names are
                        translated with class_aliases.json; unknown names are reported
- kolhapur/<any>/       our own labelled photos, exported from Roboflow the same way

Output: ml/vision/data/<name>/{train,valid,test}/{images,labels} + data.yaml + stats.json
(and <name>.zip for Google Colab with --zip). Class ids never change (CLASSES below), so
datasets built later with more classes stay compatible.
"""

import argparse
import json
import random
import shutil
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "data" / "raw"
SPLITS = ("train", "valid", "test")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Must match docs/ML.md §1, train.py and the "labels" in ml/vision/models.json. Order = class id.
CLASSES = [
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
]
CLASS_ID = {name: i for i, name in enumerate(CLASSES)}
SPLIT_NAMES = {"train": "train", "valid": "valid", "val": "valid", "test": "test"}


def load_aliases() -> dict[str, str | None]:
    data = json.loads((HERE / "class_aliases.json").read_text(encoding="utf-8"))
    return {k.lower(): v for k, v in data.items() if not k.startswith("_")}


def read_names(yaml_path: Path) -> list[str]:
    """Class names from a YOLO data.yaml (list or {id: name} form), without needing PyYAML."""
    text = yaml_path.read_text(encoding="utf-8")
    try:
        import yaml  # available with ultralytics

        names = yaml.safe_load(text).get("names", [])
        return [names[k] for k in sorted(names)] if isinstance(names, dict) else list(names)
    except ImportError:
        line = next(line for line in text.splitlines() if line.strip().startswith("names:"))
        return [n.strip(" '\"") for n in line.split("[", 1)[1].rsplit("]", 1)[0].split(",")]


def find_pairs(root: Path):
    """(split, image, label) for a YOLO tree: <split>/images/** with labels in the mirror folder."""
    for image in root.rglob("*"):
        if image.suffix.lower() not in IMAGE_SUFFIXES or "images" not in image.parts:
            continue
        parts = list(image.relative_to(root).parts)
        split = next((SPLIT_NAMES[p] for p in parts if p in SPLIT_NAMES), None)
        if split is None:
            continue
        index = len(parts) - 1 - parts[::-1].index("images")
        parts[index] = "labels"
        label = (root / Path(*parts)).with_suffix(".txt")
        yield split, image, label


class Builder:
    def __init__(self, out: Path, background_share: float, seed: int):
        self.out = out
        self.background_share = background_share
        self.random = random.Random(seed)
        self.items: dict[str, list[tuple[Path, list[str], str]]] = {s: [] for s in SPLITS}
        self.unknown: Counter = Counter()
        self.sources: Counter = Counter()

    def add_source(self, name: str, root: Path, mapping: dict[int, str | None]) -> None:
        added = 0
        for split, image, label in find_pairs(root):
            lines = []
            if label.exists():
                for row in label.read_text(encoding="utf-8").split("\n"):
                    fields = row.split()
                    if len(fields) < 5:
                        continue
                    target = mapping.get(int(float(fields[0])))
                    if target is None:
                        continue
                    lines.append(" ".join([str(CLASS_ID[target]), *fields[1:5]]))
            self.items[split].append((image, lines, f"{name}__{image.stem}{image.suffix.lower()}"))
            added += 1
        self.sources[name] = added
        print(f"  {name}: {added} images")

    def add_yolo_export(self, name: str, root: Path, aliases: dict[str, str | None]) -> None:
        yaml_path = next(root.rglob("data.yaml"), None)
        if yaml_path is None:
            print(f"  skip {name}: no data.yaml")
            return
        mapping = {}
        for index, class_name in enumerate(read_names(yaml_path)):
            key = str(class_name).strip().lower()
            if key in aliases:
                mapping[index] = aliases[key]
            elif key.replace(" ", "_") in CLASS_ID:
                mapping[index] = key.replace(" ", "_")
            else:
                self.unknown[f"{name}: {class_name}"] += 1
                mapping[index] = None
        self.add_source(name, yaml_path.parent, mapping)

    def write(self) -> dict:
        if self.out.exists():
            shutil.rmtree(self.out)
        stats = {"classes": CLASSES, "sources": dict(self.sources), "splits": {}}
        for split in SPLITS:
            labelled = [item for item in self.items[split] if item[1]]
            empty = [item for item in self.items[split] if not item[1]]
            # Keep some photos without any problem so the model learns not to fire on clean roads.
            limit = int(len(labelled) * self.background_share / (1 - self.background_share))
            self.random.shuffle(empty)
            chosen = labelled + empty[:limit]
            images_dir = self.out / split / "images"
            labels_dir = self.out / split / "labels"
            images_dir.mkdir(parents=True)
            labels_dir.mkdir(parents=True)
            boxes, images_per_class = Counter(), Counter()
            for image, lines, name in chosen:
                shutil.copy2(image, images_dir / name)
                (labels_dir / name).with_suffix(".txt").write_text("\n".join(lines), encoding="utf-8")
                ids = [CLASSES[int(line.split()[0])] for line in lines]
                boxes.update(ids)
                images_per_class.update(set(ids))
            stats["splits"][split] = {
                "images": len(chosen),
                "background_images": min(limit, len(empty)),
                "boxes": {c: boxes[c] for c in CLASSES if boxes[c]},
                "images_per_class": {c: images_per_class[c] for c in CLASSES if images_per_class[c]},
            }
        names = "\n".join(f"  {i}: {name}" for i, name in enumerate(CLASSES))
        (self.out / "data.yaml").write_text(
            "# Built by ml/vision/build_dataset.py — class ids must not change (docs/ML.md §1).\n"
            "# Paths are relative to this file, so the folder can be zipped and used on Colab.\n"
            f"train: train/images\nval: valid/images\ntest: test/images\n\nnc: {len(CLASSES)}\nnames:\n{names}\n",
            encoding="utf-8",
        )
        stats["unknown_class_names"] = dict(self.unknown)
        (self.out / "stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
        return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--name", default="civic-v0")
    parser.add_argument("--background", type=float, default=0.12, help="share of photos without problems")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--zip", action="store_true", help="also create <name>.zip for Colab")
    args = parser.parse_args()

    builder = Builder(HERE / "data" / args.name, args.background, args.seed)
    aliases = load_aliases()
    print("Sources:")
    if (RAW / "rdd2022").exists():
        # RDD2022 4-class export: 0-2 = longitudinal / transverse / alligator crack, 3 = "pothole".
        # Checked by eye (2026-10-11): for the INDIA images, class 3 boxes are almost all faded
        # white lane markings, not potholes (India's "white line blur" label ended up there), so
        # they are dropped. Cracks (0-2) look right. Potholes come from the other sources.
        builder.add_source(
            "rdd2022-india", RAW / "rdd2022" / "data",
            {0: "road_crack", 1: "road_crack", 2: "road_crack", 3: None},
        )
    if (RAW / "pothole-ryukijano").exists():
        builder.add_source("pothole-ryukijano", RAW / "pothole-ryukijano", {0: "pothole"})
    for group in ("roboflow", "kolhapur"):
        for folder in sorted(p for p in (RAW / group).glob("*") if p.is_dir()):
            builder.add_yolo_export(f"{group}-{folder.name}", folder, aliases)

    stats = builder.write()
    print(f"\nWrote {builder.out}")
    for split, info in stats["splits"].items():
        print(f"  {split:5s} {info['images']:6d} images ({info['background_images']} without problems)  boxes: {info['boxes']}")
    missing = [c for c in CLASSES if not any(c in s["boxes"] for s in stats["splits"].values())]
    if missing:
        print(f"\nNo data yet for: {', '.join(missing)}")
    if stats["unknown_class_names"]:
        print(f"Unknown class names (add them to class_aliases.json): {stats['unknown_class_names']}")
    if args.zip:
        archive = shutil.make_archive(str(builder.out), "zip", builder.out)
        print(f"\nZip for Google Colab: {archive} ({Path(archive).stat().st_size / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
