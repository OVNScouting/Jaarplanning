// ======================================================================
// dashboard.js — toont komende opkomsten van ALLE speltakken
// Vanaf eerstvolgende opkomst: +2 maanden
// Groepering per datum, sortering op starttijd
// Kolommen: Tijd, Thema, Procor, Type, Locatie, Materiaal, Bijzonderheden
// ======================================================================

import {
  compareDateTime,
  formatDateDisplay
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

// Speltakken die we meenemen op dashboard
const SPELTAKKEN = ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"];

// Labels + kleuren (zoals je index-kaarten / style.css)
const SPELTAK_LABEL = {
  bevers: "Bevers",
  welpen: "Welpen",
  scouts: "Scouts",
  explorers: "Explorers",
  rovers: "Rovers",
  stam: "Stam"
};

const SPELTAK_COLOR = {
  bevers: "#e61700",
  welpen: "#19b30b",
  scouts: "#c4b584",
  explorers: "#8a0a03",
  rovers: "#590501",
  stam: "#f0d800"
};

// DOM
const container = document.getElementById("dashboardOverview");

// ======================================================================
// LOAD DASHBOARD
// ======================================================================

async function loadDashboard() {
  if (!container) return;

  container.innerHTML = "<p>Dashboard laden…</p>";

  try {
    // 1) Alles ophalen en normaliseren
    const all = await loadAllOpkomsten();

    if (!all.length) {
      container.innerHTML = "<p>Geen opkomsten gevonden.</p>";
      return;
    }

    // 2) Eerstvolgende opkomstmoment bepalen (over alles heen)
    const nextMoment = getNextMoment(all);

    if (!nextMoment) {
      container.innerHTML = "<p>Geen toekomstige opkomsten.</p>";
      return;
    }

    // 3) Window: vanaf eerstvolgende t/m +2 maanden
    const endMoment = new Date(nextMoment);
    endMoment.setMonth(endMoment.getMonth() + 2);

    const windowed = all
      .filter(o => {
        const m = getMoment(o);
        return m >= nextMoment && m <= endMoment;
      })
      
      .sort((a, b) => getMoment(a) - getMoment(b));

    // 4) Groeperen op datum
    const grouped = groupByDate(windowed);

    // 5) Render
    render(grouped);

  } catch (err) {
    console.error("Fout bij laden dashboard:", err);
    container.innerHTML = "<p>Er ging iets mis bij het laden van de opkomsten.</p>";
  }
}

// ======================================================================
// DATA HELPERS
// ======================================================================

async function loadAllOpkomsten() {
  const results = [];

  for (const sp of SPELTAKKEN) {
    const snap = await get(ref(db, sp));
    if (!snap.exists()) continue;

    const data = snap.val();

    // Ondersteun beide structuren:
    // A) /speltak/opkomsten/{id: {...}}
    // B) /speltak/{id: {...}} (zoals je voorbeeld)
    const opkomstenObj =
      (data && typeof data === "object" && data.opkomsten && typeof data.opkomsten === "object")
        ? data.opkomsten
        : data;

    if (!opkomstenObj || typeof opkomstenObj !== "object") continue;

    for (const [id, o] of Object.entries(opkomstenObj)) {
      if (!o || typeof o !== "object") continue;
      if (!o.datum) continue;

      // starttijd is gewenst voor sortering; als hij ontbreekt, tonen we wel, maar met "??"
      results.push({
        speltak: sp,
        id,
        datum: o.datum,
        starttijd: o.starttijd || "",
        eindtijd: o.eindtijd || "",
        thema: o.thema || "",
        procor: o.procor || "",
        type: o.typeOpkomst || "",
        locatie: o.locatie || "",
        materiaal: o.materiaal || "",
        bijzonderheden: o.bijzonderheden || ""
      });
    }
  }

  return results;
}

function getMoment(o) {
  const t = o.starttijd || "00:00";
  return new Date(`${o.datum}T${t}`);
}

function getNextMoment(all) {
  const now = new Date();
  const future = all
    .map(getMoment)
    .filter(m => !Number.isNaN(m.getTime()) && m >= now)
    .sort((a, b) => a - b);

  return future[0] || null;
}

function groupByDate(items) {
  const grouped = {};
  for (const o of items) {
    if (!grouped[o.datum]) grouped[o.datum] = [];
    grouped[o.datum].push(o);
  }

  // Binnen elke datum op tijd sorteren
  for (const date of Object.keys(grouped)) {
grouped[date].sort((a, b) => getMoment(a) - getMoment(b));

  }

  return grouped;
}

// ======================================================================
// RENDER
// ======================================================================

function render(grouped) {
  container.innerHTML = "";

  // Eerstvolgende datum bovenaan, laatste onderaan
const dates = Object.keys(grouped).sort(
  (a, b) => new Date(a) - new Date(b)
);
;

  if (!dates.length) {
    container.innerHTML = "<p>Geen opkomsten in deze periode.</p>";
    return;
  }

  for (const date of dates) {
    // Datum header
    const h = document.createElement("h3");
    h.className = "dashboard-date";
    h.textContent = formatDateDisplay(date);
    container.appendChild(h);

    // Tabel
    const table = document.createElement("table");
    table.className = "dashboard-table";

    table.appendChild(renderThead());
    const tbody = document.createElement("tbody");

    for (const o of grouped[date]) {
      tbody.appendChild(renderRow(o));
    }

    table.appendChild(tbody);
    container.appendChild(table);
  }
}

function renderThead() {
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");

  const headers = [
    "Speltak",
    "Tijd",
    "Thema",
    "Procor",
    "Type",
    "Locatie",
    "Materiaal",
    "Bijzonderheden"
  ];

  for (const label of headers) {
    const th = document.createElement("th");
    th.textContent = label;
    tr.appendChild(th);
  }

  thead.appendChild(tr);
  return thead;
}

function renderRow(o) {
  const tr = document.createElement("tr");

  // Speltak (gekleurde cel)
  const tdSp = document.createElement("td");
  tdSp.textContent = SPELTAK_LABEL[o.speltak] || o.speltak;
  tdSp.className = "dash-speltak-cell";
  tdSp.style.background = SPELTAK_COLOR[o.speltak] || "#687a96";
  tdSp.style.color = "#fff";
  tdSp.style.fontWeight = "700";
  tr.appendChild(tdSp);

  // Tijd
  const tijd = `${o.starttijd || "??:??"}–${o.eindtijd || "??:??"}`;
  tr.appendChild(td(tijd));

  tr.appendChild(td(o.thema));
  tr.appendChild(td(o.procor));
  tr.appendChild(td(o.type));
  tr.appendChild(td(o.locatie));
  tr.appendChild(td(o.materiaal));
  tr.appendChild(td(o.bijzonderheden));

  return tr;
}

function td(value) {
  const cell = document.createElement("td");
  cell.textContent = value || "";
  return cell;
}

// ======================================================================
loadDashboard();
