/* ─────────────────────────────────────────────
   Air Quality Predictor — Client-Side Logic
   Uses Chart.js for analytics · Vanilla JS
   ───────────────────────────────────────────── */

(function () {
  "use strict";

  // ─── Constants ────────────────────────────────
  const API = "";  // same origin
  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  const POLLUTANT_DEFS = [
    { id:"pm25",   label:"PM2.5",  unit:"µg/m³", min:0, max:500, step:0.5, default:35 },
    { id:"pm10",   label:"PM10",   unit:"µg/m³", min:0, max:600, step:1,   default:60 },
    { id:"no2",    label:"NO₂",    unit:"µg/m³", min:0, max:200, step:0.5, default:25 },
    { id:"co",     label:"CO",     unit:"µg/m³", min:0, max:5000,step:10,  default:500 },
    { id:"so2",    label:"SO₂",    unit:"µg/m³", min:0, max:100, step:0.5, default:12 },
    { id:"o3",     label:"O₃",     unit:"µg/m³", min:0, max:200, step:0.5, default:40 },
  ];

  const WEATHER_DEFS = [
    { id:"humidity",     label:"Humidity",       unit:"%",    min:0, max:100,  step:1,   default:50 },
    { id:"wind",         label:"Wind Gusts",     unit:"km/h", min:0, max:150,  step:1,   default:15 },
    { id:"pressure",     label:"Pressure",       unit:"hPa",  min:950,max:1050,step:1,   default:1013 },
    { id:"cloud",        label:"Cloud Cover",    unit:"%",    min:0, max:100,  step:1,   default:40 },
    { id:"dewpoint",     label:"Dew Point",      unit:"°C",   min:-20,max:40,  step:0.5, default:15 },
    { id:"precipitation",label:"Precipitation",  unit:"mm",   min:0, max:100,  step:0.5, default:0 },
    { id:"dust",         label:"Dust",           unit:"µg/m³",min:0, max:500,  step:1,   default:30 },
  ];

  const AQI_COLORS = {
    "Good": "#00e400",
    "Moderate": "#facc15",
    "Unhealthy for Sensitive Groups": "#ff7e00",
    "Unhealthy": "#ff0000",
    "Very Unhealthy": "#8f3f97",
    "Hazardous": "#7e0023",
  };

  let modelStats = {};
  let inputMode = "sliders";
  let chartInstances = {};

  // ─── DOM Refs ─────────────────────────────────
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ─── Fetch with Retry ────────────────────────
  async function fetchWithRetry(url, options = {}, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // ─── Chart.js Global Defaults ────────────────
  function setupChartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#94a3b8";
    Chart.defaults.font.family = "'Space Grotesk', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyleWidth = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = "rgba(15,20,40,0.9)";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(56,189,248,0.3)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.titleFont = { weight: "600", size: 13 };
    Chart.defaults.scale.grid = { color: "rgba(255,255,255,0.06)" };
    Chart.defaults.scale.border = { color: "rgba(255,255,255,0.08)" };
  }

  // ─── Particles ────────────────────────────────
  function initParticles() {
    const canvas = $("#particleCanvas");
    const ctx = canvas.getContext("2d");
    let w, h;
    const particles = [];
    const COUNT = 60;

    function resize() {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.4,
        dy: (Math.random() - 0.5) * 0.4,
        o: Math.random() * 0.35 + 0.05,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56,189,248,${p.o})`;
        ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(56,189,248,${0.06 * (1 - dist / 120)})`;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }
    draw();
  }

  // ─── Build Sliders + Number Inputs ────────────
  function buildSliders(defs, containerId) {
    const container = $(containerId);
    container.innerHTML = "";
    for (const d of defs) {
      const item = document.createElement("div");
      item.className = "slider-item";
      item.innerHTML = `
        <label>
          <span>${d.label} <small style="opacity:.5">(${d.unit})</small></span>
          <span class="slider-val" id="val-${d.id}">${d.default}</span>
        </label>
        <div class="input-duo">
          <input type="range" id="slider-${d.id}"
                 min="${d.min}" max="${d.max}" step="${d.step}" value="${d.default}" class="duo-slider" />
          <input type="number" id="number-${d.id}"
                 min="${d.min}" max="${d.max}" step="${d.step}" value="${d.default}" class="duo-number" />
        </div>
      `;
      container.appendChild(item);

      const slider = item.querySelector(`#slider-${d.id}`);
      const number = item.querySelector(`#number-${d.id}`);
      const valEl = item.querySelector(".slider-val");

      slider.addEventListener("input", () => {
        number.value = slider.value;
        valEl.textContent = slider.value;
        colorSlider(slider, d);
      });
      number.addEventListener("input", () => {
        let v = parseFloat(number.value);
        if (isNaN(v)) return;
        v = Math.max(d.min, Math.min(d.max, v));
        slider.value = v;
        valEl.textContent = v;
        colorSlider(slider, d);
      });
      number.addEventListener("blur", () => {
        let v = parseFloat(number.value);
        if (isNaN(v)) v = d.default;
        v = Math.max(d.min, Math.min(d.max, v));
        number.value = v;
        slider.value = v;
        valEl.textContent = v;
        colorSlider(slider, d);
      });

      colorSlider(slider, d);
    }
    applyInputMode();
  }

  function colorSlider(input, def) {
    const pct = ((input.value - def.min) / (def.max - def.min)) * 100;
    input.style.setProperty("--pct", pct + "%");
    input.classList.remove("danger-low","danger-mid","danger-high","danger-extreme");
    if (pct < 25)      input.classList.add("danger-low");
    else if (pct < 50) input.classList.add("danger-mid");
    else if (pct < 75) input.classList.add("danger-high");
    else               input.classList.add("danger-extreme");
  }

  // ─── Input Mode Toggle ───────────────────────
  function initInputModeToggle() {
    const btnSlider = $("#btn-slider-mode");
    const btnNumber = $("#btn-number-mode");

    btnSlider.addEventListener("click", () => {
      inputMode = "sliders";
      btnSlider.classList.add("active");
      btnNumber.classList.remove("active");
      applyInputMode();
    });
    btnNumber.addEventListener("click", () => {
      inputMode = "numbers";
      btnNumber.classList.add("active");
      btnSlider.classList.remove("active");
      applyInputMode();
    });
  }

  function applyInputMode() {
    const sliders = $$(".duo-slider");
    const numbers = $$(".duo-number");
    if (inputMode === "sliders") {
      sliders.forEach(el => el.style.display = "block");
      numbers.forEach(el => el.style.display = "none");
    } else {
      sliders.forEach(el => el.style.display = "none");
      numbers.forEach(el => el.style.display = "block");
    }
  }

  // ─── Month Slider ────────────────────────────
  function initMonthSlider() {
    const slider = $("#month-slider");
    const number = $("#month-number");
    const nameEl = $("#month-name");

    slider.addEventListener("input", () => {
      number.value = slider.value;
      nameEl.textContent = MONTHS[slider.value - 1];
    });
    number.addEventListener("input", () => {
      let v = parseInt(number.value);
      if (isNaN(v) || v < 1 || v > 12) return;
      slider.value = v;
      nameEl.textContent = MONTHS[v - 1];
    });
    number.addEventListener("blur", () => {
      let v = parseInt(number.value);
      if (isNaN(v)) v = 1;
      v = Math.max(1, Math.min(12, v));
      number.value = v;
      slider.value = v;
      nameEl.textContent = MONTHS[v - 1];
    });
  }

  // ─── Fetch Cities (with retry) ────────────────
  async function fetchCities() {
    try {
      const data = await fetchWithRetry(API + "/cities");
      const sel = $("#city-select");
      sel.innerHTML = "";
      for (const c of data.cities) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
        sel.appendChild(opt);
      }
    } catch (e) {
      showError("Failed to load cities. Make sure the server is running and refresh.");
    }
  }

  // ─── Fetch Stats + Analytics (with retry) ────
  async function fetchStats() {
    try {
      const data = await fetchWithRetry(API + "/stats");
      modelStats = data;
      const rf = data.random_forest;
      if (rf) {
        $("#metric-r2").textContent = rf.r2;
        $("#metric-mae").textContent = rf.mae;
        $("#metric-rmse").textContent = rf.rmse;
      }

    } catch (e) {
      showError("Failed to load model stats. Make sure the server is running and refresh.");
    }
  }

  // ─── Predict ──────────────────────────────────
  async function predict(e) {
    e.preventDefault();
    const btn = $("#predict-btn");
    const btnText = btn.querySelector(".btn-text");
    const btnLoader = btn.querySelector(".btn-loader");
    btn.disabled = true;
    btnText.textContent = "Predicting…";
    btnLoader.hidden = false;

    const payload = {
      city: $("#city-select").value,
      month: parseInt($("#month-slider").value, 10),
      model: "random_forest",
    };
    for (const d of POLLUTANT_DEFS) {
      payload[d.id] = parseFloat($(`#slider-${d.id}`).value);
    }
    for (const d of WEATHER_DEFS) {
      payload[d.id] = parseFloat($(`#slider-${d.id}`).value);
    }

    try {
      const data = await fetchWithRetry(API + "/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, 2, 1000);
      if (data.error) throw new Error(data.error);
      showResult(data, payload.city);

    } catch (e) {
      showError(e.message || "Prediction failed. Check server connection.");
    } finally {
      btn.disabled = false;
      btnText.textContent = "Predict AQI";
      btnLoader.hidden = true;
    }
  }

  // ─── Display Result ───────────────────────────
  function showResult(data, city) {
    const card = $("#result-card");
    card.classList.remove("hidden");
    card.scrollIntoView({ behavior: "smooth", block: "center" });

    animateNumber($("#aqi-number"), data.aqi, data.color);
    $("#aqi-number").style.color = data.color;

    const badge = $("#aqi-category-badge");
    badge.textContent = data.category;
    badge.style.background = data.color;
    badge.style.color = needsDarkText(data.color) ? "#333" : "#fff";

    $("#health-advice").textContent = data.health_advice;
    animateGauge(data.aqi);

    const markerPct = Math.min(data.aqi / 500, 1) * 100;
    $("#comparison-marker").style.left = markerPct + "%";

    addToHistory(city, data);
  }

  function needsDarkText(hex) {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff, g = (rgb >> 8) & 0xff, b = rgb & 0xff;
    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
  }

  function animateNumber(el, target) {
    const duration = 1200;
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * ease);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  function animateGauge(aqi) {
    const maxArc = 251;
    const ratio = Math.min(aqi / 500, 1);
    const fill = $("#gauge-fill");
    const needle = $("#gauge-needle");

    const target = ratio * maxArc;
    fill.style.transition = "stroke-dasharray 1s ease";
    fill.setAttribute("stroke-dasharray", `${target}, 999`);

    const angle = -90 + ratio * 180;
    needle.style.transition = "transform 1s ease";
    needle.style.transformOrigin = "100px 120px";
    needle.style.transform = `rotate(${angle}deg)`;
  }

  // ─── History (localStorage) ───────────────────
  function addToHistory(city, data) {
    let history = JSON.parse(localStorage.getItem("aqi_history") || "[]");
    history.unshift({
      city,
      aqi: data.aqi,
      category: data.category,
      color: data.color,
      time: new Date().toLocaleTimeString(),
    });
    history = history.slice(0, 5);
    localStorage.setItem("aqi_history", JSON.stringify(history));
    renderHistory(history);
  }

  function renderHistory(history) {
    const list = $("#history-list");
    if (!history || history.length === 0) {
      list.innerHTML = '<p class="empty-history">No predictions yet.</p>';
      return;
    }
    list.innerHTML = history
      .map(
        (h) => `
      <div class="history-item">
        <div>
          <div class="history-city">${h.city.charAt(0).toUpperCase() + h.city.slice(1)}</div>
          <div class="history-meta">${h.time} · Random Forest</div>
        </div>
        <div style="text-align:right">
          <div class="history-aqi" style="color:${h.color}">${h.aqi}</div>
          <span class="history-cat" style="background:${h.color};color:${needsDarkText(h.color) ? '#333' : '#fff'}">${h.category}</span>
        </div>
      </div>`
      )
      .join("");
  }

  // ─── AQI Scale Tooltips ───────────────────────
  function initScaleTooltips() {
    const tip = $("#scale-tooltip");
    $$(".scale-segment").forEach((seg) => {
      seg.addEventListener("mouseenter", () => {
        tip.textContent = seg.dataset.tip;
        tip.style.opacity = 1;
      });
      seg.addEventListener("mouseleave", () => {
        tip.style.opacity = 0;
      });
    });
  }

  // ─── Error Toast ──────────────────────────────
  function showError(msg) {
    const toast = $("#error-toast");
    const msgEl = $("#error-msg");
    msgEl.textContent = msg;
    toast.classList.remove("hidden");
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 5000);
  }
  function initErrorClose() {
    $("#error-close").addEventListener("click", () => {
      $("#error-toast").classList.remove("show");
    });
  }

  // ─── Init ─────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    initParticles();
    buildSliders(POLLUTANT_DEFS, "#pollutant-sliders");
    buildSliders(WEATHER_DEFS, "#weather-sliders");
    initMonthSlider();
    initInputModeToggle();
    initScaleTooltips();
    initErrorClose();

    fetchCities();
    fetchStats();

    const saved = JSON.parse(localStorage.getItem("aqi_history") || "[]");
    renderHistory(saved);

    $("#predict-form").addEventListener("submit", predict);
  });
})();
