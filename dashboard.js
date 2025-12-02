// ========================================================
// DASHBOARD – OVN Jaarplanning
// ========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getDatabase, ref, onValue
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

import { todayISO } from "./utils.js";

// --------------------------
// Firebase configuratie
// --------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCFQeno5rmLIvZdscjrimvFO7ZsJW7qBTM",
  authDomain: "ovn-jaarplanning.firebaseapp.com",
  databaseURL: "https://ovn-jaarplanning-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ovn-jaarplanning",
  messagingSenderId: "311108828430",
  appId: "1:311108828430:web:40f3564fca975423972b5f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --------------------------
// Speltakken die gebruikt worden
// --------------------------
const SPELTAKKEN = ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"];

// --------------------------
// HTML elementen
// --------------------------
const dashboardHead = document.getElementById("dashboardHead");
const dashboardBody = document.getElementById("dashboardBody");
const dashboardTableWrapper = document.getElementById("dashboardTableWrapper");
const dashboardLoading = document.getElementById("dashboardLoading");


// --------------------------------------------------------
// MODE CHECK – alleen leiding mag dashboard zien
// --------------------------------------------------------
let mode = localStorage.getItem("mode");
if (mode !== "leiding" && mode !== "bewerken") {
    window.location.href = "index.html";
}

function toDisplay(d) {
  if (!d) return "";
  const [y,m,day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function sortByDateThenTime(a,b) {
  if (a.datum < b.datum) return -1;
  if (a.datum > b.datum) return 1;
  if (a.start < b.start) return -1;
  if (a.start > b.start) return 1;
  return 0;
}


// --------------------------------------------------------
// 1. laad alle speltakdata
// --------------------------------------------------------
let loadedCount = 0;
const opkomstenData = {}; // { speltak: [ opkomsten ] }

SPELTAKKEN.forEach(sp => {
  onValue(ref(db, sp), snap => {
    const d = snap.val() || {};
    const lijst = Object.entries(d.opkomsten || {}).map(([id,v]) => ({
      id,
      speltak: sp,
      datum: v.datum || "",
      procor: v.procor || "",
      start: v.starttijd || "",
      eind: v.eindtijd || "",
      locatie: v.locatie || "",
      materiaal: v.materiaal || "",
      leiding: countLeidingAanwezig(v.aanwezigheid || {}),
      type: v.typeOpkomst || ""
    }));

    opkomstenData[sp] = lijst;
    loadedCount++;

    if (loadedCount === SPELTAKKEN.length) {
      buildDashboard();
    }
  });
});


// --------------------------------------------------------
// tel leiding op “aanwezig”
// --------------------------------------------------------
function countLeidingAanwezig(aanw) {
  let count = 0;
  for (const key in aanw) {
    if (key.startsWith("leiding-") && aanw[key] === "aanwezig") count++;
  }
  return count;
}


// --------------------------------------------------------
// 2. Bepaal eerstvolgende opkomst over alle speltakken
// --------------------------------------------------------
function findNextDate() {
  let alle = [];
  SPELTAKKEN.forEach(sp => {
    alle = alle.concat(opkomstenData[sp]);
  });

  alle = alle.filter(o => o.datum && o.datum >= todayISO());
  if (alle.length === 0) return null;

  alle.sort((a,b)=> a.datum.localeCompare(b.datum));
  return alle[0].datum;
}


// --------------------------------------------------------
// 3. Bouw uiteindelijke tabel
// --------------------------------------------------------
function buildDashboard() {

  dashboardLoading.classList.add("hidden");
  dashboardTableWrapper.classList.remove("hidden");

  // Header
  dashboardHead.innerHTML = `
    <tr>
      <th>Datum</th>
      <th>Speltak</th>
      <th>Procor</th>
      <th>Tijden</th>
      <th>Locatie</th>
      <th>Materiaal</th>
      <th># Leiding</th>
    </tr>
  `;

  const startDate = findNextDate();
  if (!startDate) {
    dashboardBody.innerHTML = `<tr><td colspan="7">Geen komende opkomsten gevonden.</td></tr>`;
    return;
  }

  // Bereik: eerstvolgende + 3 dagen
  const range = [];
  let base = new Date(startDate);
  for (let i=0; i<=3; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    range.push(d.toISOString().slice(0,10));
  }

  let rows = [];

  range.forEach(date => {
    SPELTAKKEN.forEach(sp => {
      const lijst = opkomstenData[sp] || [];
      const found = lijst.filter(o => o.datum === date);
      if (found.length > 0) rows = rows.concat(found);
    });
    // lege scheidingsrij om datums visueel te scheiden
    rows.push({ separator: true, datum: date });
  });

  // sorteren op datum + starttijd
  rows.sort(sortByDateThenTime);

  dashboardBody.innerHTML = "";

  let lastDate = null;

  rows.forEach(r => {

    // ------------------------------
    // visuele lege separator
    // ------------------------------
    if (r.separator) {
      const sep = document.createElement("tr");
      sep.classList.add("date-separator-row");
      sep.innerHTML = `<td colspan="7"></td>`;
      dashboardBody.appendChild(sep);
      return;
    }

    // rij
    const tr = document.createElement("tr");

    // kleur op basis van type opkomst
    if (r.type === "bijzonder") tr.classList.add("row-bijzonder");
    if (r.type === "kamp") tr.classList.add("row-kamp");
    if (r.type === "geen") tr.classList.add("row-geenopkomst");

    // cellen
    tr.innerHTML = `
      <td>${toDisplay(r.datum)}</td>
      <td>${r.speltak}</td>
      <td>${r.procor || "—"}</td>
      <td>${(r.start || "—") + "–" + (r.eind || "—")}</td>
      <td>${r.locatie || "—"}</td>
      <td>${r.materiaal || "—"}</td>
      <td>${r.leiding}</td>
    `;

    dashboardBody.appendChild(tr);
  });
}


