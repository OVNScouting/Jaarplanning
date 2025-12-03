// ======================================================================
// dashboard.js — toont komende opkomsten van ALLE speltakken
// ======================================================================

import {
  todayISO,
  isFutureOrToday,
  compareDateTime
} from "./utils.js";

import {
  initializeApp,
  getDatabase,
  ref,
  get
} from "./firebase-imports.js";

// ======================================================================
// FIREBASE INIT
// ======================================================================

const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

const speltakken = [
  "bevers",
  "welpen",
  "scouts",
  "explorers",
  "rovers",
  "stam"
];

// DOM
const list = document.getElementById("dashboardList");

// ======================================================================
// LOAD DASHBOARD
// ======================================================================

async function loadDashboard() {
  if (!list) return;

  const today = todayISO();
  let items = [];

  try {
    for (const sp of speltakken) {
      const snap = await get(ref(db, sp));
      const data = snap.val();
      if (!data || !data.opkomsten) continue;

      const arr = Object.entries(data.opkomsten).map(([id, v]) => ({
        speltak: sp,
        id,
        ...v
      }));

      // alleen toekomstige / vandaag
      const coming = arr.filter(o =>
        o.datum && isFutureOrToday(o.datum)
      );

      items.push(...coming);
    }

    // sorteren op datum + tijd
    items.sort(compareDateTime);

    // alleen komende 4 dagen
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() + 4);
    const cutoffISO = cutoffDate.toISOString().slice(0, 10);

    items = items.filter(o => o.datum <= cutoffISO);

    renderDashboard(items);
  } catch (err) {
    console.error("Fout bij laden dashboard:", err);
    list.innerHTML = "<p>Er ging iets mis bij het laden van de opkomsten.</p>";
  }
}

// ======================================================================
// RENDER
// ======================================================================

function renderDashboard(items) {
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = "<p>Geen komende opkomsten in de komende 4 dagen.</p>";
    return;
  }

  items.forEach(item => {
    list.appendChild(makeDashboardCard(item));
  });
}

function makeDashboardCard(o) {
  const div = document.createElement("div");
  div.className = "speltak-card-dashboard";

  const color = getTypeColor(o.typeOpkomst);

  div.innerHTML = `
    <div class="dash-left">
      <div class="date-block">
        <span class="d-day">${formatDay(o.datum)}</span>
        <span class="d-month">${formatMonth(o.datum)}</span>
      </div>
    </div>

    <div class="dash-middle">
      <h3>${capitalize(o.speltak)}</h3>
      <p>${o.thema || "Geen thema"}</p>
      <p><b>${o.starttijd || ""} – ${o.eindtijd || ""}</b></p>
    </div>

    <div class="dash-right" style="border-left-color:${color}">
      <span class="type-tag" style="color:${color}">
        ${o.typeOpkomst || "normaal"}
      </span>
    </div>
  `;

  return div;
}

// ======================================================================
// HELPERS
// ======================================================================

function formatDay(dateStr = "") {
  return dateStr.split("-")[2] || "";
}

function formatMonth(dateStr = "") {
  const month = Number(dateStr.split("-")[1]);
  const months = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  return months[month - 1] || "";
}

function capitalize(s = "") {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Type kleur
function getTypeColor(t) {
  switch (t) {
    case "geen": return "#f43e3e";
    case "bijzonder": return "#be70ff";
    case "kamp": return "#ff66cc";
    default: return "#006fff";
  }
}

// ======================================================================
loadDashboard();
