"""Train the LSTM demand forecast used by the municipal Utilities agent.

Input: hourly readings exported by the backend
    cd municipal/backend
    python -m app.simulate_sensors setup --days 120
    python -m app.simulate_sensors export --out ../../ml/forecasting/readings.csv

Train (CPU is fine, a few minutes):
    python ml/forecasting/train_lstm.py --csv ml/forecasting/readings.csv \
        --out municipal/backend/models/demand-lstm-v1.pt

Hybrid model: the seasonal forecast (average of the same hour in the previous 3 weeks, what
the backend uses without a model) is the starting point, and the LSTM reads the last 168
hours to predict a correction (e.g. a trend the 3-week average lags behind). Values are
divided by the mean of the input window, so one model serves every ward and both water
flow and power load. It is saved as TorchScript (the backend needs only `torch`, not this
file) and listed in ml/forecasting/models.json with its checksum and test metrics. The
backend only uses it if its test error beats the seasonal baseline.
The .pt file is not committed to git (see .gitignore) — share it via Drive / Hugging Face.
"""

import argparse
import csv
import hashlib
import json
import math
import random
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

import torch
from torch import nn

LOOKBACK = 168  # one week of hours
HORIZON = 24
SEASON_WEEKS = 3  # must match expected() in municipal/backend/app/agents/forecast.py
TEST_DAYS = 7
HERE = Path(__file__).resolve().parent


class DemandLSTM(nn.Module):
    def __init__(self, hidden: int = 64):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=3, hidden_size=hidden, num_layers=1, batch_first=True
        )
        self.head = nn.Linear(hidden, HORIZON)

    def forward(self, x: torch.Tensor, base: torch.Tensor) -> torch.Tensor:
        # x: [batch, LOOKBACK, 3] scaled history; base: [batch, HORIZON] scaled seasonal forecast
        output, _ = self.lstm(x)
        return base + self.head(output[:, -1, :])  # [batch, HORIZON], scaled values


def hour_features(ts: datetime) -> tuple[float, float]:
    # Must match municipal/backend/app/agents/forecast.py: hour of day in city time (IST).
    angle = 2 * math.pi * ((ts.hour + 5.5) % 24) / 24
    return math.sin(angle), math.cos(angle)


def load(path: Path) -> dict[str, list[tuple[datetime, float]]]:
    series: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
    with path.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            ts = datetime.fromisoformat(row["ts"]).astimezone(UTC)
            series[row["sensor"]].append((ts, float(row["value"])))
    return {code: sorted(points) for code, points in series.items()}


def seasonal(history: dict, first: datetime) -> list[float]:
    """Average of the same hour in the previous SEASON_WEEKS weeks (the backend fallback)."""
    result = []
    for h in range(HORIZON):
        ts = first + timedelta(hours=h)
        weeks = range(1, SEASON_WEEKS + 1)
        same = [history[t] for k in weeks if (t := ts - timedelta(weeks=k)) in history]
        result.append(sum(same) / len(same))
    return result


def windows(points, start: int, stop: int, stride: int):
    """(x, base, y, scale, first forecast ts) for forecast starts in [start, stop)."""
    history = dict(points)
    for i in range(max(start, SEASON_WEEKS * LOOKBACK), stop - HORIZON + 1, stride):
        past = points[i - LOOKBACK : i]
        values = [v for _, v in past]
        scale = sum(values) / len(values) or 1.0
        x = [[v / scale, *hour_features(ts)] for ts, v in past]
        base = [v / scale for v in seasonal(history, points[i][0])]
        y = [v / scale for _, v in points[i : i + HORIZON]]
        yield x, base, y, scale, points[i][0]


def contiguous(points) -> bool:
    return all(b[0] - a[0] == timedelta(hours=1) for a, b in zip(points, points[1:]))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--csv", type=Path, default=HERE / "readings.csv")
    parser.add_argument(
        "--out", type=Path, required=True, help="where to save the .pt model"
    )
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--name", default="demand-lstm-v1")
    args = parser.parse_args()

    random.seed(0)
    torch.manual_seed(0)
    data = load(args.csv)
    train_x, train_base, train_y, tests = [], [], [], []
    for code, points in data.items():
        if not contiguous(points):
            print(f"skip {code}: missing hours")
            continue
        split = len(points) - TEST_DAYS * 24
        for x, base, y, _, _ in windows(points, 0, split, stride=4):
            train_x.append(x)
            train_base.append(base)
            train_y.append(y)
        history = dict(points)
        for x, base, y, scale, first in windows(points, split, len(points), stride=24):
            week_ago = [
                first + timedelta(hours=h) - timedelta(weeks=1) for h in range(HORIZON)
            ]
            naive = [history[t] for t in week_ago]
            tests.append((x, base, [v * scale for v in y], scale, naive))
    print(
        f"{len(data)} sensors, {len(train_x)} training windows, {len(tests)} test windows"
    )

    x = torch.tensor(train_x, dtype=torch.float32)
    base = torch.tensor(train_base, dtype=torch.float32)
    y = torch.tensor(train_y, dtype=torch.float32)
    model = DemandLSTM()
    optimiser = torch.optim.Adam(model.parameters(), lr=2e-3)
    loss_fn = nn.MSELoss()
    for epoch in range(args.epochs):
        order = torch.randperm(len(x))
        total = 0.0
        model.train()
        for start in range(0, len(x), 128):
            batch = order[start : start + 128]
            optimiser.zero_grad()
            loss = loss_fn(model(x[batch], base[batch]), y[batch])
            loss.backward()
            optimiser.step()
            total += loss.item() * len(batch)
        print(f"epoch {epoch + 1}/{args.epochs}  loss {total / len(x):.4f}")

    # --- evaluate on the last week of every sensor (never seen in training) ---
    model.eval()
    errors = {"lstm": [], "seasonal": [], "naive": []}
    with torch.no_grad():
        for tx, tbase, truth, scale, naive in tests:
            output = model(torch.tensor([tx]), torch.tensor([tbase]))[0].tolist()
            predicted = [v * scale for v in output]
            season = [v * scale for v in tbase]
            for name, guess in (
                ("lstm", predicted),
                ("seasonal", season),
                ("naive", naive),
            ):
                errors[name] += [
                    (g - t, abs(g - t) / max(t, 1e-6)) for g, t in zip(guess, truth)
                ]

    def metrics(pairs):
        return {
            "rmse": round(math.sqrt(sum(d * d for d, _ in pairs) / len(pairs)), 2),
            "mae": round(sum(abs(d) for d, _ in pairs) / len(pairs), 2),
            "mape": round(100 * sum(p for _, p in pairs) / len(pairs), 2),
        }

    result = {name: metrics(pairs) for name, pairs in errors.items()}
    print("test metrics (last 7 days, all sensors):", json.dumps(result))
    if result["lstm"]["mape"] < result["seasonal"]["mape"]:
        print("LSTM beats the seasonal baseline")
    else:
        print(
            "LSTM does NOT beat the seasonal baseline: the backend keeps using seasonal"
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    torch.jit.script(model).save(str(args.out))
    digest = hashlib.sha256(args.out.read_bytes()).hexdigest()
    registry = {
        "_comment": "Demand forecast used by municipal/backend (app/agents/forecast.py). Copy the "
        ".pt file to municipal/backend/models/. Retrain with ml/forecasting/train_lstm.py.",
        "models": [
            {
                "name": args.name,
                "file": args.out.name,
                "sha256": digest,
                "lookback_hours": LOOKBACK,
                "horizon_hours": HORIZON,
                "features": ["value / mean(window)", "sin(hour IST)", "cos(hour IST)"],
                "inputs": "x [1,168,3] and seasonal base [1,24], both / mean(window); "
                "output = base + correction",
                "season_weeks": SEASON_WEEKS,
                "trained_on": f"{args.csv.name}: {len(data)} sensors, simulated (app/services/sensor_sim.py)",
                "trained_at": datetime.now(UTC).date().isoformat(),
                "test_metrics": result,
            }
        ],
    }
    (HERE / "models.json").write_text(
        json.dumps(registry, indent=2) + "\n", encoding="utf-8"
    )
    print(f"saved {args.out} and ml/forecasting/models.json")


if __name__ == "__main__":
    main()
