"""
Air Quality Index (AQI) Prediction - Model Training Script
===========================================================
This script loads the India AQI dataset, performs data cleaning,
feature engineering, trains a Random Forest regressor,
evaluates the model, saves it as a .pkl file, and pre-computes
analytics for the dashboard.

Dataset: aqi_india_38cols_knn_final.csv (placed in dataset/ folder)
"""

import os
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import warnings

warnings.filterwarnings("ignore")

# ───────────────────────── Paths ─────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "dataset", "aqi_india_38cols_knn_final.csv")
MODEL_DIR = BASE_DIR  # save .pkl files alongside app.py

RF_MODEL_PATH = os.path.join(MODEL_DIR, "rf_model.pkl")
ENCODER_PATH = os.path.join(MODEL_DIR, "city_encoder.pkl")
STATS_PATH = os.path.join(MODEL_DIR, "model_stats.json")


def get_season(month):
    """Map month number to season code."""
    if month in [12, 1, 2]:
        return 0  # Winter
    elif month in [3, 4, 5]:
        return 1  # Spring / Pre-monsoon
    elif month in [6, 7, 8, 9]:
        return 2  # Monsoon / Summer
    else:
        return 3  # Autumn / Post-monsoon


SEASON_NAMES = {0: "Winter", 1: "Spring", 2: "Monsoon", 3: "Autumn"}


def classify_aqi(aqi):
    """Return AQI category string."""
    if aqi <= 50:
        return "Good"
    elif aqi <= 100:
        return "Moderate"
    elif aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    elif aqi <= 200:
        return "Unhealthy"
    elif aqi <= 300:
        return "Very Unhealthy"
    else:
        return "Hazardous"


def load_and_clean_data():
    """Load dataset and perform cleaning."""
    print("=" * 60)
    print("  AIR QUALITY INDEX - MODEL TRAINING")
    print("=" * 60)

    # ---- Load ----
    print(f"\n📂 Loading dataset from {DATA_PATH} ...")
    df = pd.read_csv(DATA_PATH)
    print(f"   Raw shape: {df.shape}")

    # ---- Rename columns for consistency ----
    rename_map = {
        "pm2_5_ugm3": "PM2.5",
        "pm10_ugm3": "PM10",
        "co_ugm3": "CO",
        "no2_ugm3": "NO2",
        "so2_ugm3": "SO2",
        "o3_ugm3": "O3",
        "dust_ugm3": "Dust",
        "humidity_percent": "Humidity",
        "wind_gusts_kmh": "Wind",
        "pressure_msl_hpa": "Pressure",
        "cloud_cover_percent": "Cloud",
        "dew_point_c": "DewPoint",
        "precipitation_mm": "Precipitation",
        "us_aqi": "AQI",
    }
    df.rename(columns=rename_map, inplace=True)

    # ---- Drop rows where AQI is null ----
    before = len(df)
    df.dropna(subset=["AQI"], inplace=True)
    print(f"   Dropped {before - len(df)} rows with null AQI")

    # ---- Forward-fill other nulls ----
    df.sort_values(["city", "datetime"], inplace=True)
    df.ffill(inplace=True)
    df.fillna(0, inplace=True)

    print(f"   Cleaned shape: {df.shape}")
    return df


def feature_engineering(df):
    """Create features for modelling."""
    print("\n🔧 Feature Engineering ...")

    # Extract month if not already present
    if "month" in df.columns:
        df["Month"] = df["month"].astype(int)
    elif "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"], errors="coerce")
        df["Month"] = df["datetime"].dt.month

    # Season numeric
    if "season" in df.columns:
        season_map = {s: i for i, s in enumerate(df["season"].unique())}
        df["Season"] = df["season"].map(season_map)
    else:
        df["Season"] = df["Month"].apply(get_season)

    # Label-encode city
    le = LabelEncoder()
    df["City_enc"] = le.fit_transform(df["city"].astype(str))

    # Derived feature
    df["PM_Ratio"] = df["PM2.5"] / (df["PM10"] + 1)

    print(f"   Cities encoded: {len(le.classes_)}")
    print(f"   Sample classes: {list(le.classes_[:5])} ...")
    return df, le


def compute_analytics(df):
    """Pre-compute analytics from the dataset for the frontend dashboard."""
    print("\n📈 Computing analytics ...")
    analytics = {}

    # ---- Per-city average AQI ----
    city_aqi = df.groupby("city")["AQI"].mean().round(1)
    analytics["city_aqi"] = city_aqi.sort_values(ascending=False).to_dict()
    print(f"   City AQI: {len(city_aqi)} cities computed")

    # ---- AQI category distribution ----
    df["_cat"] = df["AQI"].apply(classify_aqi)
    cat_counts = df["_cat"].value_counts().to_dict()
    # Ensure all categories present in order
    ordered_cats = [
        "Good", "Moderate", "Unhealthy for Sensitive Groups",
        "Unhealthy", "Very Unhealthy", "Hazardous",
    ]
    analytics["aqi_distribution"] = {c: cat_counts.get(c, 0) for c in ordered_cats}
    print(f"   AQI distribution: {analytics['aqi_distribution']}")

    # ---- Seasonal average AQI ----
    if "Season" in df.columns:
        seasonal = df.groupby("Season")["AQI"].mean().round(1)
        analytics["seasonal_aqi"] = {
            SEASON_NAMES.get(int(k), str(k)): float(v)
            for k, v in seasonal.items()
        }
    print(f"   Seasonal AQI: {analytics.get('seasonal_aqi', {})}")

    # ---- Pollutant averages (for context) ----
    pollutant_cols = ["PM2.5", "PM10", "NO2", "CO", "SO2", "O3"]
    available_p = [c for c in pollutant_cols if c in df.columns]
    analytics["pollutant_averages"] = {
        c: round(float(df[c].mean()), 2) for c in available_p
    }

    # ---- Dataset summary ----
    analytics["dataset_info"] = {
        "total_samples": int(len(df)),
        "num_cities": int(df["city"].nunique()),
        "cities_list": sorted(df["city"].unique().tolist()),
    }

    # Clean up temp column
    df.drop(columns=["_cat"], inplace=True, errors="ignore")

    return analytics


def train_model(df, le):
    """Train Random Forest, evaluate, compute analytics, and save everything."""
    # ---- Define features ----
    feature_cols = [
        "PM2.5", "PM10", "NO2", "CO", "SO2", "O3",
        "Humidity", "Wind", "Pressure", "Cloud", "DewPoint",
        "Precipitation", "Dust",
        "City_enc", "Month", "Season", "PM_Ratio",
    ]

    # Keep only columns that exist
    available = [c for c in feature_cols if c in df.columns]
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        print(f"   ⚠️  Missing features (skipped): {missing}")
    feature_cols = available

    X = df[feature_cols].values
    y = df["AQI"].values

    print(f"\n📊 Dataset: {X.shape[0]} samples, {X.shape[1]} features")
    print(f"   Features: {feature_cols}")

    # ---- Train / Test split ----
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"   Train: {X_train.shape[0]}  |  Test: {X_test.shape[0]}")

    # ========== Random Forest ==========
    print("\n🌲 Training Random Forest Regressor ...")
    rf = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    rf_pred = rf.predict(X_test)

    rf_mae = mean_absolute_error(y_test, rf_pred)
    rf_rmse = np.sqrt(mean_squared_error(y_test, rf_pred))
    rf_r2 = r2_score(y_test, rf_pred)

    print(f"   MAE  : {rf_mae:.4f}")
    print(f"   RMSE : {rf_rmse:.4f}")
    print(f"   R²   : {rf_r2:.4f}")

    # ---- Feature importance ----
    importance = dict(zip(feature_cols, [round(float(v), 4) for v in rf.feature_importances_]))
    # Sort descending
    importance = dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))

    # ---- Pre-compute analytics ----
    analytics = compute_analytics(df)
    analytics["feature_importance"] = importance

    # ---- Save model ----
    print("\n💾 Saving artefacts ...")
    joblib.dump(rf, RF_MODEL_PATH, compress=3)
    print(f"   ✅ {RF_MODEL_PATH}")
    joblib.dump(le, ENCODER_PATH)
    print(f"   ✅ {ENCODER_PATH}")

    # ---- Save stats + analytics as JSON for the Flask app ----
    stats = {
        "feature_cols": feature_cols,
        "random_forest": {
            "mae": round(rf_mae, 4),
            "rmse": round(rf_rmse, 4),
            "r2": round(rf_r2, 4),
        },
        "analytics": analytics,
    }
    with open(STATS_PATH, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"   ✅ {STATS_PATH}")

    # ---- Summary ----
    print("\n" + "=" * 60)
    print("  RANDOM FOREST RESULTS")
    print("=" * 60)
    print(f"  MAE  : {rf_mae:.4f}")
    print(f"  RMSE : {rf_rmse:.4f}")
    print(f"  R²   : {rf_r2:.4f}")
    print("=" * 60)
    print("✅ Training complete! Run `python app.py` to start the server.\n")


if __name__ == "__main__":
    df = load_and_clean_data()
    df, le = feature_engineering(df)
    train_model(df, le)
