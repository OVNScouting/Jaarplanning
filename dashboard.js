// ======================================================================
// dashboard.js — toont komende opkomsten + bestuursitems
// Bestuursitems:
// - altijd bovenaan per datum
// - klikbaar → bestuur.html#item=<id>
// ======================================================================

import {
  formatDateDisplay,
  isFutureOrToday
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

// ======================================================================
// CONFIG
// ======================================================================
const SPELTAKKEN = ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"];

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
  stam: "#f0d800",
  bestuur: "#1822b5"
};

const container = document.getElementById("dashboardOverview");

// ======================================================================
// LOAD DASHBOARD
// ======================================================================
async function loadDashboard() {
  if (!container) return;
  container.innerHTML = "<p>Dashboard laden…</p>";

  try {
    const [opkomsten, bestuurs] = await Promise.all([
      loadAllOpkomsten(),
      loadBestuursItems()
    ]);

    const combined = [...opkomsten, ...bestuurs]
      .filter(o => isFutureOrToday(o.datum))
      .sort((a, b) => new Date(`${a.datum}T${a.sortTime}`) - new Date(`${b.datum}T${b.sortTime}`));

    if (!combined.length) {
      container.innerHTML = "<p>Geen komende items.</p>";
      return;
    }

    const grouped = groupByDate(combined);

    // ✅ Altijd dezelfde tabelrender (desktop-style), ook op mobiel
    renderDesktop(grouped);

  } catch (err) {
    console.error("Fout bij laden dashboard:", err);
    container.innerHTML = "<p>Er ging iets mis bij het laden.</p>";
  }
}


// ======================================================================
// DATA LADEN
// ======================================================================
async function loadAllOpkomsten() {
  const results = [];

  for (const sp of SPELTAKKEN) {
    const snap = await get(ref(db, sp));
    if (!snap.exists()) continue;

    const data = snap.val();
    const opkomstenObj = data.opkomsten ?? data;
    if (!opkomstenObj) continue;

    for (const [id, o] of Object.entries(opkomstenObj)) {
      if (!o?.datum) continue;

      results.push({
        kind: "speltak",
        speltak: sp,
        label: SPELTAK_LABEL[sp],
        kleur: SPELTAK_COLOR[sp],
        id,
        datum: o.datum,
        sortTime: o.starttijd || "99:99",
        tijd: `${o.starttijd || "??:??"}–${o.eindtijd || "??:??"}`,
        titel: o.thema || "",
        type: o.typeOpkomst || "",
        locatie: o.locatie || "",
        materiaal: o.materiaal || "",
        bijzonderheden: o.bijzonderheden || ""
      });
    }
  }

  return results;
}

async function loadBestuursItems() {
  const snap = await get(ref(db, "bestuursItems"));
  if (!snap.exists()) return [];

  const items = [];

  for (const [id, b] of Object.entries(snap.val())) {
    if (!b.toonOpDashboard) continue;

    let sortTime = "00:00";
    let tijd = "—";

    if (b.tijdType === "range") {
      sortTime = b.starttijd || "00:00";
      tijd = `${b.starttijd || ""}–${b.eindtijd || ""}`;
    }

    items.push({
      kind: "bestuur",
      speltak: "bestuur",
      label: "Bestuur",
      kleur: SPELTAK_COLOR.bestuur,
      id,
      datum: b.datum,
      sortTime,
      tijd,
      titel: b.titel,
      type: b.type,
      locatie: "",        // voor uniformiteit
      materiaal: "",      // voor uniformiteit
      bijzonderheden: "",
      link: `bestuur.html#item=${id}`
    });
  }

  return items;
}

// ======================================================================
// GROUP & RENDER
// ======================================================================
function groupByDate(items) {
  const grouped = {};
  for (const o of items) {
    if (!grouped[o.datum]) grouped[o.datum] = [];
    grouped[o.datum].push(o);
  }

  for (const date of Object.keys(grouped)) {
    grouped[date].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "bestuur" ? -1 : 1;
      return a.sortTime.localeCompare(b.sortTime);
    });
  }

  return grouped;
}

// =========================
// DESKTOP RENDER (tabel)
// =========================
function renderDesktop(grouped) {
  container.innerHTML = "";
  const dates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));

  for (const date of dates) {
    const h = document.createElement("h3");
    h.className = "dashboard-date";
    h.textContent = formatDateDisplay(date);
    container.appendChild(h);

    const table = document.createElement("table");
    table.className = "dashboard-table";
    table.appendChild(renderTheadDesktop());

    const tbody = document.createElement("tbody");
    grouped[date].forEach(o => tbody.appendChild(renderRowDesktop(o)));

    table.appendChild(tbody);
    container.appendChild(table);
  }
}

function renderTheadDesktop() {
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");

  // Materiaal toegevoegd op desktop
  ["Speltak", "Tijd", "Titel", "Type", "Locatie", "Materiaal", "Bijzonderheden"].forEach(label => {
    const th = document.createElement("th");
    th.textContent = label;
    tr.appendChild(th);
  });

  thead.appendChild(tr);
  return thead;
}

function renderRowDesktop(o) {
  const tr = document.createElement("tr");

  const tdSp = document.createElement("td");
  tdSp.textContent = o.label;
  tdSp.style.background = o.kleur;
  tdSp.style.color = "#fff";
  tdSp.style.fontWeight = "700";
  tr.appendChild(tdSp);

  tr.appendChild(td(o.tijd));
  tr.appendChild(td(o.titel));
  tr.appendChild(td(o.type));
  tr.appendChild(td(o.locatie || ""));
  tr.appendChild(td(o.materiaal || ""));
  tr.appendChild(td(o.bijzonderheden || ""));

  // ✅ Alles klikbaar
  tr.style.cursor = "pointer";

  if (o.kind === "bestuur" && o.link) {
    tr.onclick = () => window.location.href = o.link;
  } else if (o.kind === "speltak") {
    tr.onclick = () => {
      // ✅ Dit matcht jouw script.js: scrollToOpkomstFromHash()
      window.location.href = `${o.speltak}.html#opkomst=${encodeURIComponent(o.datum)}`;
    };
  }

  return tr;
}


// ======================================================================
loadDashboard();

// ======================================================================
// MOBILE — login badge korter (Admin of speltaknaam)
// ======================================================================
(function simplifyLoginBadgeOnMobile() {
  const isMobileNow = window.matchMedia("(max-width: 900px)").matches;
  if (!isMobileNow) return;

  const badge = document.getElementById("loginStatus");
  if (!badge) return;

  const mode = (localStorage.getItem("mode") || "").toLowerCase();         // "admin" / "leiding" / "ouder"
  const authSpeltak = (localStorage.getItem("authSpeltak") || "").toLowerCase();

  if (mode === "admin") {
    badge.textContent = "Admin";
    return;
  }

  // Leiding: toon speltaknaam (netjes geformat)
  if (mode === "leiding" && authSpeltak) {
    const nice =
      SPELTAK_LABEL[authSpeltak] ||
      (authSpeltak.charAt(0).toUpperCase() + authSpeltak.slice(1));

    badge.textContent = nice;
    return;
  }

  // Anders leeg houden (ouder / niet ingelogd)
  badge.textContent = "";
})();

