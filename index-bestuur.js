// ======================================================================
// index-bestuur.js — Highlight recente bestuursitems op index
// Alleen zichtbaar voor leiding / bestuur / admin
// ======================================================================

import {
  initializeApp,
  getApps,
  getApp,
  getDatabase,
  ref,
  get
} from "./firebase-imports.js";


import { formatDateDisplay, isFutureOrToday, escapeHtml } from "./utils.js";

function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(window.firebaseConfig);
}



function init() {



  const app = getFirebaseApp();
  const db = getDatabase(app);


  const section = document.getElementById("bestuurHighlight");
  const list = document.getElementById("bestuurHighlightList");

  if (!section || !list) return;

  loadHighlights(db, section, list);
}

function formatBestuursTijd(item) {
  if (item.tijdType === "allday") {
    return "Hele dag";
  }

  if (
    item.tijdType === "range" &&
    item.starttijd
  ) {
    return item.eindtijd
      ? `${item.starttijd}–${item.eindtijd}`
      : item.starttijd;
  }

  return "";
}
function formatBestuursType(type) {
  const labels = {
    bestuursvergadering:
      "Bestuursvergadering",

    groepsraad:
      "Groepsraad",

    activiteit:
      "Activiteit",

    overig:
      "Overig"
  };

  return labels[type] || "Bestuursitem";
}
async function loadHighlights(
  db,
  section,
  list
) {
  try {
    const snap = await get(
      ref(db, "bestuursItems")
    );

    section.classList.remove("hidden");
    list.innerHTML = "";

    if (!snap.exists()) {
      list.innerHTML = `
        <div class="text-muted">
          Er staan geen komende bestuursitems gepland.
        </div>
      `;

      return;
    }

    const MAX_ITEMS = 3;

    const upcomingItems = Object
      .entries(snap.val())
      .map(([id, value]) => ({
        id,
        ...value
      }))
      .filter(item =>
        item.toonOpDashboard &&
        item.datum &&
        isFutureOrToday(item.datum)
      )
      .sort((a, b) => {
        const dateComparison =
          a.datum.localeCompare(b.datum);

        if (dateComparison !== 0) {
          return dateComparison;
        }

        const aTime =
          a.starttijd || "99:99";

        const bTime =
          b.starttijd || "99:99";

        return aTime.localeCompare(bTime);
      });

    if (!upcomingItems.length) {
      list.innerHTML = `
        <div class="text-muted">
          Er staan geen komende bestuursitems gepland.
        </div>
      `;

      return;
    }

    const selected =
      upcomingItems.slice(0, MAX_ITEMS);

    selected.forEach(item => {
      const row =
        document.createElement("div");

      row.className = "meldingen-row";
      row.style.cursor = "pointer";

      const formattedDate =
        formatDateDisplay(item.datum);

      const formattedTime =
        formatBestuursTijd(item);

      const dateAndTime = formattedTime
        ? `${formattedDate} · ${formattedTime}`
        : formattedDate;

      row.innerHTML = `
        <div class="meldingen-label">
          📌 ${escapeHtml(item.titel || "(zonder titel)")}
        </div>

        <div class="meldingen-sub">
          ${escapeHtml(dateAndTime)}
          · ${escapeHtml(formatBestuursType(item.type))}
        </div>
      `;

      row.onclick = () => {
        window.location.href =
          `bestuur.html#item=${encodeURIComponent(item.id)}`;
      };

      list.appendChild(row);
    });

  } catch (error) {
    console.error(
      "Fout bij laden bestuursitems:",
      error
    );

    list.innerHTML = `
      <div class="text-muted">
        Kon bestuursitems niet laden.
      </div>
    `;

    section.classList.remove("hidden");
  }
}

document.addEventListener("auth-changed", (e) => {
  const section = document.getElementById("bestuurHighlight");
  const list = document.getElementById("bestuurHighlightList");
  if (!section || !list) return;

  const loggedIn = !!e?.detail?.loggedIn;

  if (!loggedIn) {
    section.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  init();
});



