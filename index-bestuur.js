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


import { formatDateDisplay } from "./utils.js";


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


// ======================================================================
// LOAD HIGHLIGHTS
// ======================================================================
async function loadHighlights(db, section, list) {
  try {
    const snap = await get(ref(db, "bestuursItems"));

    // Vak moet blijven staan, ook als er geen items zijn
    section.classList.remove("hidden");


    const now = Date.now();
    const MAX_AGE = 14 * 24 * 60 * 60 * 1000; // 14 dagen

    const items = Object.entries(snap.val())
      .map(([id, v]) => ({ id, ...v }))
      .filter(i => i.toonOpDashboard)
      .filter(i => {
        const t = i.updatedAt || i.createdAt || 0;
        return now - t <= MAX_AGE;
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

     list.innerHTML = "";

    if (!snap.exists()) {
      list.innerHTML = `<div class="text-muted">Nog geen updates vanuit bestuur (laatste 14 dagen).</div>`;
      return;
    }

    if (!items.length) {
      list.innerHTML = `<div class="text-muted">Nog geen updates vanuit bestuur (laatste 14 dagen).</div>`;
      return;
    }


    items.forEach(i => {
      const row = document.createElement("div");
      row.className = "meldingen-row";
      row.style.cursor = "pointer";

      row.innerHTML = `
        <div class="meldingen-label">
          📌 ${i.titel}
        </div>
<div class="meldingen-sub">
  ${i.type} · ${formatDateDisplay(i.datum)}
</div>

      `;

      row.onclick = () => {
        window.location.href = `bestuur.html#item=${i.id}`;
      };

      list.appendChild(row);
    });

  } catch (err) {
    console.error("Fout bij laden bestuurs-highlights:", err);
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


