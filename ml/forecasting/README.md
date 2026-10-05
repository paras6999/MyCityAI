# forecasting — demand forecast & anomaly detection (Utilities agent)

Used by `municipal/backend` (`app/agents/forecast.py`, `app/agents/utilities.py`).

| Part | Model | Where it runs |
|---|---|---|
| Demand forecast (next 24 h per sensor) | **LSTM** (PyTorch, TorchScript file) — trained here | backend, if PyTorch + model file present |
| Fallback forecast / "normal" value | Seasonal: average of the same hour in previous weeks | backend, always available |
| Anomalies (leak, illegal connection, outage, overload) | **Isolation Forest** (scikit-learn) on the deviation from normal | backend, trained on the fly per sensor (no file) |

## Data
No real meters yet: `municipal/backend/app/services/sensor_sim.py` simulates one water-flow and one power-load sensor per ward (daily peaks, Sunday pattern, slow drift, ±5 % noise). Replace the CSV with real SCADA / smart-meter exports later — same columns: `sensor, kind, ts, value` (hourly, UTC).

## Train the LSTM
```bash
cd municipal/backend
python -m app.simulate_sensors setup --days 120
python -m app.simulate_sensors export --out ../../ml/forecasting/readings.csv
cd ../..
python ml/forecasting/train_lstm.py --csv ml/forecasting/readings.csv --out municipal/backend/models/demand-lstm-v1.pt
```
Needs `torch` (`municipal/backend/requirements-ml.txt`). CPU is enough.
The script prints test metrics (MAE / RMSE / MAPE on the last 7 days of every sensor, never seen in training) against a "same hour last week" baseline and writes [`models.json`](models.json) (file name, SHA-256, metrics). The backend only loads a model whose checksum matches.

The `.pt` file and the CSV are **not committed** — upload the model to Drive / Hugging Face and add the link below.

| Model | Trained | Link | Test MAPE (LSTM vs naive) |
|---|---|---|---|
| demand-lstm-v1 | see models.json | *(add link)* | see models.json |

## Try the anomaly detector
```bash
cd municipal/backend
python -m app.simulate_sensors leak --ward 12              # +40 % water flow, last 6 hours
python -m app.simulate_sensors leak --ward 7 --kind power_load --percent -80   # outage
```
A suggestion appears on the water / electricity officer dashboard (AI suggestions panel, Utilities page).
