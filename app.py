"""
Air Quality Index (AQI) Prediction - Flask Web Application
============================================================
HOW TO RUN:
  1. pip install -r requirements.txt
  2. Copy your dataset to  dataset/aqi_india_38cols_knn_final.csv
  3. python model.py          ← trains & saves model
  4. python app.py             ← starts Flask server on port 5000
  5. Open http://localhost:5000

Routes:
  GET  /         → Serves the main web page
  POST /predict  → Returns predicted AQI + category
  GET  /cities   → List of available cities
  GET  /stats    → Model metrics + analytics
"""

import os
import json
import numpy as np
import joblib
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

# ───────────────────────── Setup ─────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
CORS(app)

# ───────────────────────── Load artefacts ─────────────────
print("🔄 Loading model ...")

rf_model = joblib.load(os.path.join(BASE_DIR, "rf_model.pkl"))
city_encoder = joblib.load(os.path.join(BASE_DIR, "city_encoder.pkl"))

with open(os.path.join(BASE_DIR, "model_stats.json")) as f:
    model_stats = json.load(f)

FEATURE_COLS = model_stats["feature_cols"]

print(f"✅ Random Forest loaded  |  {len(city_encoder.classes_)} cities  |  {len(FEATURE_COLS)} features")


# ───────────────────────── Helpers ────────────────────────
def get_season(month: int) -> int:
    if month in [12, 1, 2]:
        return 0
    elif month in [3, 4, 5]:
        return 1
    elif month in [6, 7, 8, 9]:
        return 2
    else:
        return 3


def classify_aqi(aqi: float):
    """Return (category, colour hex, health advice) for a given AQI value."""
    if aqi <= 50:
        return (
            "Good",
            "#00e400",
            "Air quality is satisfactory. Enjoy outdoor activities!",
        )
    elif aqi <= 100:
        return (
            "Moderate",
            "#ffff00",
            "Air quality is acceptable. Unusually sensitive individuals should limit prolonged outdoor exertion.",
        )
    elif aqi <= 150:
        return (
            "Unhealthy for Sensitive Groups",
            "#ff7e00",
            "Members of sensitive groups may experience health effects. Limit prolonged outdoor exertion.",
        )
    elif aqi <= 200:
        return (
            "Unhealthy",
            "#ff0000",
            "Everyone may begin to experience health effects. Avoid prolonged outdoor exertion.",
        )
    elif aqi <= 300:
        return (
            "Very Unhealthy",
            "#8f3f97",
            "Health alert: everyone may experience serious health effects. Avoid all outdoor exertion.",
        )
    else:
        return (
            "Hazardous",
            "#7e0023",
            "Health warning of emergency conditions. Everyone should avoid all outdoor activity.",
        )


# ───────────────────────── Routes ─────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/cities", methods=["GET"])
def cities():
    city_list = sorted(city_encoder.classes_.tolist())
    return jsonify({"cities": city_list})


@app.route("/stats", methods=["GET"])
def stats():
    return jsonify(model_stats)


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(force=True)

        # Parse inputs
        city = data.get("city", "")
        pm25 = float(data.get("pm25", 0))
        pm10 = float(data.get("pm10", 0))
        no2 = float(data.get("no2", 0))
        co = float(data.get("co", 0))
        so2 = float(data.get("so2", 0))
        o3 = float(data.get("o3", 0))
        humidity = float(data.get("humidity", 50))
        wind = float(data.get("wind", 10))
        pressure = float(data.get("pressure", 1013))
        cloud = float(data.get("cloud", 50))
        dewpoint = float(data.get("dewpoint", 15))
        precipitation = float(data.get("precipitation", 0))
        dust = float(data.get("dust", 0))
        month = int(data.get("month", 1))

        # Encode city
        try:
            city_enc = int(city_encoder.transform([city.lower()])[0])
        except (ValueError, KeyError):
            city_enc = 0  # fallback

        season = get_season(month)
        pm_ratio = pm25 / (pm10 + 1)

        # Build feature vector in the SAME ORDER used during training
        feature_map = {
            "PM2.5": pm25,
            "PM10": pm10,
            "NO2": no2,
            "CO": co,
            "SO2": so2,
            "O3": o3,
            "Humidity": humidity,
            "Wind": wind,
            "Pressure": pressure,
            "Cloud": cloud,
            "DewPoint": dewpoint,
            "Precipitation": precipitation,
            "Dust": dust,
            "City_enc": city_enc,
            "Month": month,
            "Season": season,
            "PM_Ratio": pm_ratio,
        }

        features = np.array([[feature_map.get(c, 0) for c in FEATURE_COLS]])

        # Predict with Random Forest
        aqi_value = float(rf_model.predict(features)[0])
        aqi_value = max(0, round(aqi_value, 1))
        category, color, advice = classify_aqi(aqi_value)

        return jsonify(
            {
                "aqi": aqi_value,
                "category": category,
                "color": color,
                "health_advice": advice,
                "model_used": "random_forest",
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ───────────────────────── Run ────────────────────────────
if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=10000)
