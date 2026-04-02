# Air Quality Predictor 

[![Live Demo](https://img.shields.io/badge/Live_Demo-aqi--prediction--s8m7.onrender.com-success?style=for-the-badge)](https://aqi-prediction-s8m7.onrender.com)
[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-Backend-black.svg?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-Analytics-FF6384.svg?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)

An advanced, ML-powered web application designed to predict the Air Quality Index (AQI) based on environmental and pollutant inputs. This project features a highly interactive glassmorphism UI, dual-mode inputs (sliders and direct number entries), and a comprehensive analytics dashboard mapping out real-world Indian dataset statistics.

---

##  Key Features

- **Real-Time AQI Prediction:** Input city, season, pollutant levels (PM2.5, PM10, CO, NO2, SO2, O3, Dust), and environmental factors (Humidity, Wind, Pressure, Cloud Cover) to instantly predict the AQI.
- **Advanced Machine Learning:** Powered by a highly optimized **Random Forest Regressor** trained on a massive real-world dataset.
- **Glassmorphism UI:** A sleek, premium dark-themed interface crafted with raw CSS (No external CSS frameworks required).
- **Dual-Mode Intuitiveness:** Seamlessly toggle between "Slider Mode" (drag visual inputs) and "Number Mode" (exact typing), with state tightly synchronized in real time.
- **Interactive Analytics Dashboard:** 
  - **Feature Importance:** Horizontal bar charts indicating how much each input dictates the model's prediction.
  - **AQI Category Distribution:** Doughnut charts mapping data spread.
  - **Seasonal & City Trends:** Understand pollution fluctuations over months and top polluted cities.
  - **Pollutant Radar:** Analyze multi-dimensional average pollutant concentration across the country.

---

##  The Algorithm (Machine Learning)

###  Random Forest Regressor
The backend relies exclusively on a **Random Forest Regressor** from `scikit-learn` to process input features and generate an AQI score.

#### **Model Configuration:**
- `n_estimators=30`: To maintain blazing-fast prediction speed and radically decrease the exported model size.
- `max_depth=15` and `min_samples_leaf=2`: Prunes the trees to prevent overfitting and ensure generalized predictions across different geographical constraints. 
- **Efficiency over Complexity:** Previous iterations experimented with heavy boosting algorithms (XGBoost), but the pipeline was streamlined to solitary Random Forest. This achieves an excellent RMSE (`~16.02`) while making the resulting `.pkl` file size extremely small (approx. `75 MB`).

#### **Data Pre-calculation (`compute_analytics`)**:
Instead of computing heavy dataframe aggregations dynamically via API endpoints, the application's trainer script (`model.py`) pre-calculates and caches the entire statistical distribution locally into `model_stats.json`. This keeps the Flask API completely stateless and incredibly fast on response.

---

##  Tech Stack & Architecture

- **Backend:** Python, Flask, Pandas, NumPy, Scikit-Learn, Joblib
- **Frontend:** HTML5, Vanilla JavaScript (ES6), Custom Vanilla CSS.
- **Data Visualization:** Chart.js `v4.x` (Canvas based rendering).
- **Hosting / Deployment:** Built ready to be hosted on Render.

---

##  Getting Started & Installation

### Prerequisites
Make sure you have Python 3.8+ installed on your system.

### Local Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/DIWAKARDQ/AQI-prediction.git
   cd AQI-prediction
   ```

2. **Install the dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **(Optional) Re-train the model:**
   If you have the dataset (`dataset/aqi_india_38cols_knn_final.csv`), you can retrain the model and regenerate local analytics.
   ```bash
   python model.py
   ```
   *Note: This generates `rf_model.pkl` and `city_encoder.pkl` which are required to run the server.*

4. **Launch the Flask Server:**
   ```bash
   python app.py
   ```
   Alternatively, you can start the application using `gunicorn`: 
   ```bash
   gunicorn app:app
   ```

5. **Open in Browser:** Visit `http://localhost:5000`

---

##  Common Errors & Troubleshooting

- **`ModuleNotFoundError: No module named 'X'`**
  - **The Fix:** Ensure you have activated your virtual environment (if using one) and successfully ran `pip install -r requirements.txt`.

- **`FileNotFoundError: rf_model.pkl or city_encoder.pkl not found`**
  - **The Cause:** The Flask backend needs the pre-trained weights to make predictions. 
  - **The Fix:** Ensure that LFS/Git pulled the large `.pkl` file properly, or place the dataset into the `/dataset/` folder and manually rebuild the model by running `python model.py`.

- **Chart.js Bar charts are not rendering visually (but data is there):**
  - **The Cause:** Chart.js `v4` combined with CSS wrapper animations can sometimes cause the Canvas to calculate a `height` or `width` of `NaN` or `0` on load.
  - **The Fix:** Add `.no-anim` class to the chart's section wrapper (prevents CSS transform fading) and explicitly set a physical `<canvas height="300">` attribute directly inside the HTML `index.html`.

- **Git push failure: `file exceeds GitHub's file size limit of 100 MB`**
  - **The Cause:** Initial Random Forest configurations outputted models > 1.5 GB. 
  - **The Fix:** The current `model.py` fixes this. Running it will export a heavily compressed `< 80MB` file.

---

## 🌐 Live Application
Experience the live dashboard and predictive model here: 
**[https://aqi-prediction-s8m7.onrender.com](https://aqi-prediction-s8m7.onrender.com)**

---

*Built by Diwakar B.*
