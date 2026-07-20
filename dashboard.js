// ======================================================================
// dashboard.js — toont komende opkomsten + bestuursitems
// ======================================================================

import {
  formatDateDisplay,
  isFutureOrToday
} from "./utils.js";

import {
  initializeApp,
  getApps,
  getApp,
  getDatabase,
  ref,
  get
} from "./firebase-imports.js";

function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(window.firebaseConfig);
}

const app = getFirebaseApp();
const db = getDatabase(app);

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
// LOAD DASHBOARD (Via Cloud Function)
// ======================================================================
async function loadDashboard() {
  if (!container) return;
  container.innerHTML = "<p>Dashboard laden…</p>";

  try {
    const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js");
    const functions = getFunctions(app);
    const getGlobalDashboard = httpsCallable(functions, "getGlobalDashboard");

    const response = await getGlobalDashboard();
    const rawOpkomsten = response.data.data;

    const opkomsten = rawOpkomsten.map(o => ({
      kind: "speltak",
      speltak: o.speltak,
      label: SPELTAK_LABEL[o.speltak],
      kleur: SPELTAK_COLOR[o.speltak],
      id: o.id,
      datum: o.datum,
      sortTime: o.starttijd || "99:99",
      tijd: `${o.starttijd || "??:??"}–${o.eindtijd || "??:??"}`,
      titel: o.thema || "",
      type: o.typeOpkomst || "",
      locatie: o.locatie || "",
      materiaal: o.materiaal || "",
      bijzonderheden: o.bijzonderheden || ""
    }));

    const bestuurs = await loadBestuursItems();

    const combined = [...opkomsten, ...bestuurs]
      .filter(o => isFutureOrToday(o.datum))
      .sort((a, b) => {
        if (a.datum !== b.datum) {
          return a.datum.localeCompare(b.datum);
        }
        return a.sortTime.localeCompare(b.sortTime);
      });

    if (!combined.length) {
      container.innerHTML = "<p>Geen komende items.</p>";
      return;
    }

    const grouped = groupByDate(combined);
    renderDesktop(grouped);

  } catch (err) {
    console.error("Fout bij laden dashboard:", err);
    container.innerHTML = "<p>Je moet ingelogd zijn om het dashboard te bekijken.</p>";
  }
}

// ======================================================================
// DATA LADEN (Alleen bestuursitems direct, opkomsten gaan via Cloud Function)
// ======================================================================
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
      locatie: "",
      materiaal: "",
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

function renderDesktop(grouped) {
  container.innerHTML = "";
  const dates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));

  for (const date of dates) {
    const h = document.createElement("h3");
    h.className = "dashboard-date";
    h.textContent = formatDateDisplay(date);
    container.appendChild(h);

    const wrapper = document.createElement("div");
    wrapper.className = "dashboard-table-wrapper";

    let swipeHint = null;
    if (window.matchMedia("(max-width: 900px)").matches) {
      swipeHint = document.createElement("div");
      swipeHint.className = "table-swipe-hint";
      swipeHint.innerHTML = "<span>← swipe →</span>";
      wrapper.appendChild(swipeHint);
    }

    const table = document.createElement("table");
    table.className = "dashboard-table";
    table.appendChild(renderTheadDesktop());

    wrapper.appendChild(table);

    if (swipeHint) {
      wrapper.addEventListener("scroll", () => {
        swipeHint.classList.add("hidden");
      }, { once: true });
    }

    const tbody = document.createElement("tbody");
    grouped[date].forEach(o => tbody.appendChild(renderRowDesktop(o)));

    table.appendChild(tbody);
    container.appendChild(wrapper);
  }
}

function renderTheadDesktop() {
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");

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
  const tdType = document.createElement("td");
  tdType.textContent = o.type || "";

  if (o.kind === "speltak") {
    const t = (o.type || "").toLowerCase().trim();
    tdType.classList.add("dashboard-type-cell");
    if (t === "geen" || t === "bijzonder" || t === "kamp") {
      tdType.classList.add(`op-type-${t}`);
    }
  }

  tr.appendChild(tdType);
  tr.appendChild(td(o.locatie || ""));
  tr.appendChild(td(o.materiaal || ""));
  tr.appendChild(td(o.bijzonderheden || ""));

  tr.style.cursor = "pointer";

  if (o.kind === "bestuur" && o.link) {
    tr.onclick = () => window.location.href = o.link;
  } else if (o.kind === "speltak") {
    tr.onclick = () => {
      window.location.href = `${o.speltak}.html#opkomst=${encodeURIComponent(o.datum)}`;
    };
  }

  return tr;
}

function td(value) {
  const cell = document.createElement("td");
  cell.textContent = value || "";
  return cell;
}

loadDashboard();

// Mobile login badge helper
(function simplifyLoginBadgeOnMobile() {
  const isMobileNow = window.matchMedia("(max-width: 900px)").matches;
  if (!isMobileNow) return;

  const badge = document.getElementById("loginStatus");
  if (!badge) return;

  const mode = (localStorage.getItem("mode") || "").toLowerCase();
  const authSpeltak = (localStorage.getItem("authSpeltak") || "").toLowerCase();

  if (mode === "admin") {
    badge.textContent = "Admin";
    return;
  }

  if (mode === "leiding" && authSpeltak) {
    const nice =
      SPELTAK_LABEL[authSpeltak] ||
      (authSpeltak.charAt(0).toUpperCase() + authSpeltak.slice(1));

    badge.textContent = nice;
    return;
  }

  badge.textContent = "";
})();