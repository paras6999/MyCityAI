"""Download the free public datasets used for the first civic-issue model (civic-v0).

    python ml/vision/download_public.py

Saves to ml/vision/data/raw/ (git-ignored). Safe to re-run: files already downloaded are skipped.

| Dataset | Source | Licence |
|---|---|---|
| RDD2022, India images only (YOLO export) | huggingface.co/datasets/dronefreak/RDD2022 | CC BY-SA 4.0 — cite the RDD2022 paper |
| Pothole detection (YOLOv8) | huggingface.co/datasets/Ryukijano/Pothole-detection-Yolov8 | OpenRAIL |
"""

import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx

RAW = Path(__file__).resolve().parent / "data" / "raw"
HF = "https://huggingface.co"
REQUESTS_PER_SECOND = 9  # stays under Hugging Face's 3,000 requests / 5 minutes
throttle = threading.Lock()


def list_files(repo: str, folder: str = "") -> list[dict]:
    """All files of a Hugging Face dataset repo (follows pagination)."""
    url = f"{HF}/api/datasets/{repo}/tree/main/{folder}?recursive=true"
    files = []
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        while url:
            response = client.get(url)
            response.raise_for_status()
            files += [f for f in response.json() if f.get("type") == "file"]
            match = re.search(r'<([^>]+)>;\s*rel="next"', response.headers.get("link", ""))
            url = match.group(1) if match else None
    return files


def download(repo: str, files: list[dict], target: Path) -> None:
    todo = [f for f in files if not (target / f["path"]).exists()]
    print(f"{repo}: {len(files)} files, {len(files) - len(todo)} already here, downloading {len(todo)}")

    def fetch(client: httpx.Client, path: str) -> None:
        for _ in range(8):
            with throttle:  # Hugging Face allows ~3,000 file requests per 5 minutes
                time.sleep(1 / REQUESTS_PER_SECOND)
            response = client.get(f"{HF}/datasets/{repo}/resolve/main/{path}")
            if response.status_code != 429:
                break
            # RateLimit header: "...";r=0;t=<seconds until the window resets>
            wait = re.search(r"t=(\d+)", response.headers.get("ratelimit", ""))
            time.sleep(int(wait.group(1)) + 1 if wait else 60)
        response.raise_for_status()
        out = target / path
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix(out.suffix + ".part")
        tmp.write_bytes(response.content)
        tmp.replace(out)

    failed = []
    with httpx.Client(timeout=60, follow_redirects=True) as client, ThreadPoolExecutor(16) as pool:
        jobs = {pool.submit(fetch, client, f["path"]): f["path"] for f in todo}
        for done, job in enumerate(as_completed(jobs), 1):
            if job.exception():
                failed.append(jobs[job])
            if done % 500 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)}")
    if failed:
        print(f"  {len(failed)} failed (re-run to retry), e.g. {failed[:3]}")


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)

    india = [f for f in list_files("dronefreak/RDD2022", "data") if f["path"].rsplit("/", 1)[-1].startswith("India_")]
    meta = [f for f in list_files("dronefreak/RDD2022") if f["path"] in ("README.md", "data.yaml")]
    download("dronefreak/RDD2022", india + meta, RAW / "rdd2022")

    pothole = list_files("Ryukijano/Pothole-detection-Yolov8")
    download("Ryukijano/Pothole-detection-Yolov8", pothole, RAW / "pothole-ryukijano")


if __name__ == "__main__":
    sys.exit(main())
