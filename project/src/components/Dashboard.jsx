import React from "react";
import "../style/Dashboard.css";
import { FaLocationDot } from "react-icons/fa6";
import { useTranslation } from "react-i18next";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";

import API, { getUser, getCurrentLang, translateText } from "../api.js";
import { useTheme } from "../context/ThemeContext";

const BASE_URL = API;

export default function Dashboard() {
  const { t } = useTranslation();
  const userID = localStorage.getItem("uniqueID");

  const [district, setDistrict] = React.useState("");
  const [state, setState] = React.useState("");
  const [translatedDistrict, setTranslatedDistrict] = React.useState("");
  const [translatedState, setTranslatedState] = React.useState("");
  const [error, setError] = React.useState("");
  const [translatedCondition, setTranslatedCondition] = React.useState("");
  const [translatedUsername, setTranslatedUsername] = React.useState("");

  const [farmInput, setFarmInput] = React.useState("");
  const [farmDate, setFarmDate] = React.useState("");
  const [farmList, setFarmList] = React.useState([]);
  const [translatedCrops, setTranslatedCrops] = React.useState({});

  const [schemes, setSchemes] = React.useState([]);
  const [translatedSchemeDetails, setTranslatedSchemeDetails] = React.useState({});
  const [translatedSchemeNames, setTranslatedSchemeNames] = React.useState({});
  const [translatedSchemeDescriptions, setTranslatedSchemeDescriptions] = React.useState({});
  const [forecast, setForecast] = React.useState([]);
  const [weatherNow, setWeatherNow] = React.useState(null);
  const [weatherAlert, setWeatherAlert] = React.useState(null);


  const fetchWeatherForecast = async (lat, lon) => {
    const cacheKey = `forecast_${lat}_${lon}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
      const { timestamp, data } = JSON.parse(cachedData);
      const isFresh = Date.now() - timestamp < 5 * 60 * 1000; // 5 minutes

      if (isFresh && data.forecast) {
        // Use cached data
        const to12Hour = (timeStr) => {
          let [hour, minute] = timeStr.split(":");
          hour = parseInt(hour, 10);
          const suffix = hour >= 12 ? "PM" : "AM";
          hour = hour % 12 || 12;
          return `${hour}:${minute} ${suffix}`;
        };

        const formatted = data.forecast.map((item) => {
          const time24 = item.dt_txt.split(" ")[1].slice(0, 5);
          return {
            time: to12Hour(time24),
            temp: item.main.temp,
            humidity: item.main.humidity,
            rain: item.rain?.["3h"] || 0,
          };
        });

        setForecast(formatted);
        return; // Skip fetch
      }
    }

    try {
      const res = await fetch(`${BASE_URL}/api/weather/forecast?lat=${lat}&lon=${lon}&lang=${getCurrentLang()}`);
      const data = await res.json();

      if (res.ok && data.forecast) {
        // Update cache
        localStorage.setItem(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: data
        }));

        const to12Hour = (timeStr) => {
          let [hour, minute] = timeStr.split(":");
          hour = parseInt(hour, 10);
          const suffix = hour >= 12 ? "PM" : "AM";
          hour = hour % 12 || 12;
          return `${hour}:${minute} ${suffix}`;
        };

        const formatted = data.forecast.map((item) => {
          const time24 = item.dt_txt.split(" ")[1].slice(0, 5);
          return {
            time: to12Hour(time24),
            temp: item.main.temp,
            humidity: item.main.humidity,
            rain: item.rain?.["3h"] || 0,
          };
        });

        setForecast(formatted);
      }
    } catch (err) {
      console.log("Forecast error:", err);
    }
  };

  const fetchCurrentWeather = async (lat, lon) => {
    try {
      const res = await fetch(`${BASE_URL}/api/weather/current?lat=${lat}&lon=${lon}&lang=${getCurrentLang()}`);
      const data = await res.json();
      if (res.ok) {
        setWeatherNow(data);
      }
    } catch (err) {
      console.log("Current weather error:", err);
    }
  };

  const fetchWeatherAlerts = async (lat, lon) => {
    try {
      const res = await fetch(`${BASE_URL}/api/weather/forecast?lat=${lat}&lon=${lon}&lang=${getCurrentLang()}`);
      const data = await res.json();
      if (res.ok) {
        const alerts = data.alerts || null;
        setWeatherAlert(alerts ? alerts[0] : null);
      }
    } catch (err) {
      console.log("Weather alert error:", err);
    }
  };

  const fetchCrops = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/crops/get?userID=${userID}&lang=${getCurrentLang()}`);
      const data = await res.json();
      if (res.ok) setFarmList(data);
    } catch (err) {
      console.log("Fetch crops error:", err);
    }
  };

  const fetchSchemeForCrop = async (cropText, cropDate = null, shownList = []) => {
    if (!state) return null;

    try {
      const payload = { crop: cropText, state, shown_schemes: shownList, lang: getCurrentLang() };

      const res = await fetch(`${BASE_URL}/api/scheme/bycrop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.recommended_scheme) {
        return {
          ...data.recommended_scheme,
          crop: cropText,
          cropDate: cropDate || new Date().toISOString(),
        };
      } else {
        console.log("Scheme error:", data);
        return null;
      }
    } catch (err) {
      console.log("Scheme fetch error:", err);
      return null;
    }
  };

  const fetchInitialSchemes = async () => {
    if (!state) return;

    // Use active crops (farmList)
    let cropsForSchemes = [...farmList];

    // If fewer than 3 active crops, fetch history
    if (cropsForSchemes.length < 3) {
      try {
        const resHistory = await fetch(`${BASE_URL}/api/crops/history?userID=${userID}&limit=3`);
        const historyData = await resHistory.json();
        if (resHistory.ok && Array.isArray(historyData)) {
          cropsForSchemes = [...cropsForSchemes, ...historyData];
        }
      } catch (err) {
        console.log("Error fetching history for schemes:", err);
      }
    }

    if (cropsForSchemes.length === 0) return;

    const localShown = [];
    const loadedSchemes = [];

    for (const item of cropsForSchemes) {
      if (item && item.text) {
        // Pass item.date if available, else null
        const sch = await fetchSchemeForCrop(item.text, item.date, localShown);
        if (sch) {
          loadedSchemes.push(sch);
          localShown.push(sch.scheme_name);
        }
      }
    }

    setSchemes(loadedSchemes);
  };

  const addFarmDetail = async () => {
    if (!farmInput.trim() || !farmDate.trim()) return;

    const payload = { userID, text: farmInput, date: farmDate };

    try {
      const res = await fetch(`${BASE_URL}/api/crops/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFarmList((prev) => [...prev, payload]);
        setFarmInput("");
        setFarmDate("");

        const shownNow = schemes.map((s) => s.scheme_name);
        const sch = await fetchSchemeForCrop(payload.text, payload.date, shownNow);
        if (sch) setSchemes((prev) => [sch, ...prev]);
      }
    } catch (err) {
      console.log("Save error:", err);
    }
  };
  // Translate weather condition dynamically
  React.useEffect(() => {
    const translateCondition = async () => {
      if (weatherNow?.condition) {
        const translated = await translateText(weatherNow.condition);
        setTranslatedCondition(translated);
      }
    };

    translateCondition();
  }, [weatherNow, getCurrentLang()]);

  // Translate username for UI only (does NOT affect backend identity)
  React.useEffect(() => {
    const translateUsername = async () => {
      if (userID) {
        const translated = await translateText(userID);
        setTranslatedUsername(translated);
      }
    };

    translateUsername();
  }, [userID, getCurrentLang()]);


  React.useEffect(() => {
    fetchCrops();
    getLocation();
  }, []);

  React.useEffect(() => {
    if (state && schemes.length === 0) {
      fetchInitialSchemes();
    }
  }, [state, farmList]);

  // Translate location names when district/state or language changes
  React.useEffect(() => {
    const translateLocation = async () => {
      if (district) {
        const translatedD = await translateText(district);
        setTranslatedDistrict(translatedD);
      }
      if (state) {
        const translatedS = await translateText(state);
        setTranslatedState(translatedS);
      }
    };
    translateLocation();
  }, [district, state, getCurrentLang()]);

  // Translate crop names when farmList or language changes
  React.useEffect(() => {
    const translateCrops = async () => {
      const translations = {};
      for (const item of farmList) {
        if (item.text && !translations[item.text]) {
          translations[item.text] = await translateText(item.text);
        }
      }
      setTranslatedCrops(translations);
    };
    if (farmList.length > 0) {
      translateCrops();
    }
  }, [farmList, getCurrentLang()]);

  // Translate scheme states when schemes or language changes
  React.useEffect(() => {
    const translateSchemes = async () => {
      const nameTranslations = {};
      const stateTranslations = {};
      const descTranslations = {};

      for (const sch of schemes) {
        // Translate scheme name
        if (sch.scheme_name && !nameTranslations[sch.scheme_name]) {
          nameTranslations[sch.scheme_name] = await translateText(sch.scheme_name);
        }

        // Translate state ministry
        if (sch.state_ministry && !stateTranslations[sch.state_ministry]) {
          stateTranslations[sch.state_ministry] = await translateText(sch.state_ministry);
        }

        // Translate description
        if (sch.description && !descTranslations[sch.description]) {
          descTranslations[sch.description] = await translateText(sch.description);
        }
      }

      setTranslatedSchemeNames(nameTranslations);
      setTranslatedSchemeDetails(stateTranslations);
      setTranslatedSchemeDescriptions(descTranslations);
    };

    if (schemes.length > 0) {
      translateSchemes();
    }
  }, [schemes, getCurrentLang()]);

  const getLocation = () => {
    const useFallbackLocation = async () => {
      try {
        console.log("Attempting fallback location...");
        if (userID) {
          const userData = await getUser(userID);
          if (userData && userData.state) {
            const stateName = userData.state;
            const districtName = userData.district || stateName;

            setState(stateName);
            setDistrict(districtName);

            const query = userData.district
              ? `${districtName}, ${stateName}`
              : stateName;

            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`
            );
            const data = await res.json();
            if (data && data.length > 0) {
              const { lat, lon } = data[0];
              fetchWeatherAlerts(lat, lon);
              fetchWeatherForecast(lat, lon);
              fetchCurrentWeather(lat, lon);
              setError("");
              return;
            }
          }
        }
      } catch (e) {
        console.log("Fallback user fetch error:", e);
      }

      console.log("Using default location (New Delhi)");
      const defaultLat = 28.6139;
      const defaultLon = 77.2090;
      setDistrict("New Delhi");
      setState("Delhi");
      fetchWeatherAlerts(defaultLat, defaultLon);
      fetchWeatherForecast(defaultLat, defaultLon);
      fetchCurrentWeather(defaultLat, defaultLon);
      setError("");
    };

    if (!navigator.geolocation) {
      useFallbackLocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await res.json();

          const moreSpecific =
            data.address.suburb ||
            data.address.neighbourhood ||
            data.address.quarter ||
            data.address.village ||
            data.address.town ||
            data.address.city ||
            data.address.municipality ||
            data.address.city_district ||   // only if nothing else is available
            data.address.county ||
            "Unknown Area";

          setDistrict(moreSpecific);
          setState(data.address.state || "Unknown State");

          fetchWeatherAlerts(latitude, longitude);
          fetchWeatherForecast(latitude, longitude);
          fetchCurrentWeather(latitude, longitude);
          setError("");
        } catch {
          fetchWeatherAlerts(latitude, longitude);
          fetchWeatherForecast(latitude, longitude);
          fetchCurrentWeather(latitude, longitude);
          setError("Location name unavailable");
        }
      },
      (err) => {
        console.log("Geolocation error:", err);
        useFallbackLocation();
      }
    );
  };

  const getTimeLeftLabel = (targetDate) => {
    const end = new Date(targetDate).getTime();
    const now = Date.now();
    const diff = end - now;

    if (diff <= 0) return t("dashboard.completed");

    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    const months = Math.ceil(days / 30);
    const years = Math.floor(months / 12);

    if (years >= 1) return `${years} ${t("dashboard.years")} ${t("dashboard.left")}`;
    if (months > 1) return `${months} ${t("dashboard.months")} ${t("dashboard.left")}`;
    return `${days} ${t("dashboard.days")} ${t("dashboard.left")}`;
  };

  const getProgressPercent = (targetDate) => {
    const now = Date.now();
    const end = new Date(targetDate).getTime();
    const diff = end - now;

    if (diff <= 0) return 100;

    const days = diff / (1000 * 60 * 60 * 24);

    let totalCycleDays = 30;
    if (days > 365) totalCycleDays = 365 * 2;
    else if (days > 30) totalCycleDays = 365;

    const progress = 1 - days / totalCycleDays;
    return Math.min(Math.max(progress * 100, 0), 100);
  };

  const { theme } = useTheme();

  const sortedFarmList = [...farmList]
    .filter((item) => {
      const end = new Date(item.date).getTime();
      const now = Date.now();
      return end > now; // Only show future crops
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const ForecastChart = ({ data }) => {
    // Unique ID suffix to prevent conflicts if multiple charts exist
    const uid = React.useId().replace(/:/g, "");

    // Axis Color based on Theme
    const axisColor = theme === "dark" ? "#888" : "#505050ff";

    // Animation config
    const speedFactor = 2.2;
    const baseDuration = 30;
    const duration = baseDuration / speedFactor; // ~13.6s
    const durStr = `${duration.toFixed(1)}s`;

    // Custom Tooltip to filter duplicates
    const CustomTooltip = ({ active, payload, label }) => {
      if (active && payload && payload.length) {
        // Filter out duplicate dataKeys, keeping only the first one (Base line)
        const uniquePayload = [];
        const seenKeys = new Set();

        payload.forEach(item => {
          if (!seenKeys.has(item.dataKey)) {
            uniquePayload.push(item);
            seenKeys.add(item.dataKey);
          }
        });

        return (
          <div className="custom-tooltip" style={{ backgroundColor: '#fff', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
            <p className="label" style={{ margin: 0, color: '#666', fontSize: '12px', fontWeight: 'bold' }}>{label}</p>
            {uniquePayload.map((entry, index) => (
              <p key={index} style={{ color: entry.color, margin: '4px 0 0 0', fontSize: '12px', fontWeight: 'bold' }}>
                {entry.name}: {entry.value}
              </p>
            ))}
          </div>
        );
      }
      return null;
    };

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <defs>
            {/* Feathered Gradient for Mask */}
            <linearGradient id={`featherGradient-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="black" />
              <stop offset="20%" stopColor="white" />
              <stop offset="80%" stopColor="white" />
              <stop offset="100%" stopColor="black" />
            </linearGradient>

            {/* Masks with Staggered Animations */}
            {[0, 1, 2].map((i) => (
              <mask id={`glowMask-${uid}-${i}`} key={i}>
                <rect x="0" y="0" width="100%" height="100%" fill="black" />
                <rect x="-30%" y="0" width="30%" height="100%" fill={`url(#featherGradient-${uid})`}>
                  <animate
                    attributeName="x"
                    from="-30%"
                    to="130%"
                    dur={durStr}
                    begin={`${i * 1.5}s`} // Staggered start
                    repeatCount="indefinite"
                    calcMode="spline"
                    keyTimes="0; 1"
                    keySplines="0.42 0 0.58 1" // Ease-in-out cubic-bezier look-alike
                  />
                </rect>
              </mask>
            ))}

            {/* Glow Blur Filter */}
            <filter id={`glowBlur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <CartesianGrid stroke="rgba(130,130,130,0.5)" strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fill: axisColor, fontSize: 11, fontWeight: 'bold' }} stroke={axisColor} />
          <YAxis yAxisId="left" tick={{ fill: axisColor, fontSize: 11, fontWeight: 'bold' }} stroke={axisColor} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: axisColor, fontSize: 11, fontWeight: 'bold' }} stroke={axisColor} />
          <Tooltip content={<CustomTooltip />} />

          {/* BASE LINES */}
          <Line yAxisId="left" type="monotone" dataKey="temp" stroke="#ff5722" strokeWidth={2} dot={false} name={t("dashboard.temperature")} />
          <Line yAxisId="left" type="monotone" dataKey="rain" stroke="#2196f3" strokeWidth={2} dot={false} name={t("dashboard.rainfall")} />
          <Line yAxisId="left" type="monotone" dataKey="humidity" stroke="#4caf50" strokeWidth={2} dot={false} name={t("dashboard.humidity")} />

          {/* GLOW OVERLAY LINES (Blurred & Masked with Stagger) */}

          {/* Temp Glow (Delay 0) */}
          <Line
            legendType="none"
            yAxisId="left"
            type="monotone"
            dataKey="temp"
            stroke="#ff5722"
            strokeWidth={3}
            dot={false}
            mask={`url(#glowMask-${uid}-0)`}
            filter={`url(#glowBlur-${uid})`}
            isAnimationActive={false}
          />

          {/* Rain Glow (Delay 1) */}
          <Line
            legendType="none"
            yAxisId="left"
            type="monotone"
            dataKey="rain"
            stroke="#2196f3"
            strokeWidth={3}
            dot={false}
            mask={`url(#glowMask-${uid}-1)`}
            filter={`url(#glowBlur-${uid})`}
            isAnimationActive={false}
          />

          {/* Humidity Glow (Delay 2) */}
          <Line
            legendType="none"
            yAxisId="left"
            type="monotone"
            dataKey="humidity"
            stroke="#4caf50"
            strokeWidth={3}
            dot={false}
            mask={`url(#glowMask-${uid}-2)`}
            filter={`url(#glowBlur-${uid})`}
            isAnimationActive={false}
          />

          <Legend wrapperStyle={{ color: axisColor, fontWeight: 'bold' }} />
        </LineChart>
      </ResponsiveContainer>
    );
  };
  const SchemeCarousel = ({ schemes, translatedSchemeNames, translatedSchemeDetails, translatedSchemeDescriptions }) => {
    const containerRef = React.useRef(null);
    const [index, setIndex] = React.useState(0);

    // Auto Scroll every 4 seconds
    React.useEffect(() => {
      const interval = setInterval(() => {
        nextSlide();
      }, 4000);

      return () => clearInterval(interval);
    }, [index]);

    const nextSlide = () => {
      const next = (index + 1) % schemes.length;
      slideTo(next);
    };

    const prevSlide = () => {
      const prev = (index - 1 + schemes.length) % schemes.length;
      slideTo(prev);
    };

    const slideTo = (i) => {
      setIndex(i);
      const container = containerRef.current;
      const cardWidth = container.firstChild.offsetWidth;
      container.scrollTo({
        left: cardWidth * i,
        behavior: "smooth",
      });
    };

    return (
      <div className="scheme-carousel-wrapper">

        <button className="carousel-btn left-btn" onClick={prevSlide}>‹</button>

        <div className="scheme-carousel-container" ref={containerRef}>
          {schemes.map((sch, i) => (
            <div key={i} className="scheme-card">
              <a
                href={sch.scheme_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <h4 className="scheme-title">
                  {translatedSchemeNames[sch.scheme_name] || sch.scheme_name}
                </h4>

                <p className="scheme-dept">
                  {translatedSchemeDetails[sch.state_ministry] || sch.state_ministry}
                </p>

                <p className="scheme-desc">
                  {translatedSchemeDescriptions[sch.description] || sch.description || "No description available"}
                </p>
              </a>
            </div>
          ))}
        </div>

        <button className="carousel-btn right-btn" onClick={nextSlide}>›</button>

        <div className="carousel-progress">
          <div key={index} className="carousel-progress-bar"></div>
        </div>

      </div>
    );
  };


  return (
    <div className="dashboard">
      <div className="grid-container">

        {/* USER CARD */}
        <div className="dashcard name-location">
          <h1>{t("dashboard.hello")}, {translatedUsername || userID}</h1>

          <div className="loc-row">
            <FaLocationDot />
            {district && state
              ? `${translatedDistrict || district}, ${translatedState || state}`
              : t("dashboard.fetching")}
          </div>

          {weatherNow && (
            <div className="current-weather">

              <div className="cw-row">
                <img
                  src={`https://openweathermap.org/img/wn/${weatherNow.icon}@2x.png`}
                  alt={translatedCondition || weatherNow.condition}
                  className="cw-icon"
                />

                <span className="cw-temp">
                  {Math.round(weatherNow.temp)}{t("dashboard.celsius")}
                </span>
              </div>

              {/* WEATHER STATS */}
              <p className="cw-extra">
                💧 {t("dashboard.humidity")} {weatherNow.humidity}% &nbsp;|&nbsp;
                🌧 {t("dashboard.rain")} {weatherNow.rain} {t("dashboard.mm")}
              </p>

            </div>
          )}

          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>

        {/* WEATHER */}
        <div className="dashcard weather">
          <h3>{t("dashboard.weatherAlerts")}</h3>
          <div className="weather-grid">
            <div className="weather-left">
              {weatherNow ? (
                <>
                  <img
                    src={`https://openweathermap.org/img/wn/${weatherNow.icon}@2x.png`}
                    alt="icon"
                    className="weather-icon-large"
                  />
                  <p className="weather-cond-text">
                    {weatherNow.condition.replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                </>
              ) : (
                null
              )}
            </div>
            <div className="weather-right">
              {weatherAlert ? (
                <>
                  <p className="alert-title">⚠ {weatherAlert.event}</p>
                  <p className="alert-desc">
                    {weatherAlert.description.slice(0, 80)}...
                  </p>
                </>
              ) : (
                <p className="no-alerts">{t("dashboard.noAlerts")} 🌤</p>
              )}
            </div>
          </div>
        </div>

        {/* CROPS */}
        <div className="dashcard name-location-2">
          <div className="farm-wrapper">
            <h3>{t("dashboard.manageYourCrops")}</h3>
            <div className="farm-input-row">
              <input
                type="text"
                className="farm-input"
                value={farmInput}
                onChange={(e) => setFarmInput(e.target.value)}
                placeholder={t("dashboard.enterCropName")}
              />
              <input
                type="date"
                className="farm-input date-input"
                value={farmDate}
                onChange={(e) => setFarmDate(e.target.value)}
              />
              <button className="farm-btn" onClick={addFarmDetail}>
                {t("dashboard.addCrop")}
              </button>
            </div>
            <ul className="farm-list">
              {sortedFarmList.length === 0 ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>{t("dashboard.noCropsYet")}</p>
              ) : (
                sortedFarmList.map((item, i) => (
                  <li key={i} className="farm-item">
                    <span style={{ fontWeight: "bold", fontSize: "16px" }}>{translatedCrops[item.text] || item.text}</span>
                    <span style={{ marginLeft: "10px", color: "#444" }}>{getTimeLeftLabel(item.date)}</span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${getProgressPercent(item.date)}%` }}
                      ></div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* GOV SCHEMES */}
        <div className="dashcard schemes">
          <h3>{t("dashboard.govtSchemes")}</h3>

          {schemes.length === 0 ? (
            null
          ) : (
            <SchemeCarousel
              schemes={schemes}
              translatedSchemeNames={translatedSchemeNames}
              translatedSchemeDetails={translatedSchemeDetails}
              translatedSchemeDescriptions={translatedSchemeDescriptions}
            />
          )}
        </div>

        {/* FORECAST */}
        <div className="dashcard forecast">
          <div className="forecast-header">
            <h3>{t("dashboard.weatherForecast")}</h3>
            <div className="live-indicator">
              <span className="live-dot"></span>
              <span className="live-text" style={{ color: "#ffffffff" }}>Live Forecast</span>
            </div>
          </div>
          {forecast.length === 0 ? (
            <p>{t("dashboard.fetching")}</p>
          ) : (
            <ForecastChart data={forecast} />
          )}
        </div>

      </div>
    </div>
  );
}
