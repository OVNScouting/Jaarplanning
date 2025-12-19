// ======================================================================
// index-bestuur.js — Highlight recente bestuursitems op index
// Alleen zichtbaar voor leiding / bestuur / admin
// ======================================================================

import {
  initializeApp,
  getDatabase,
  ref,
  get
} from "./firebase-imports.js";

// ======================================================================
// AUTH CHECK
// ======================================================================
// FASE 0:
// mode is een UI/view-state. In FASE 1+ wordt toegang afgeleid van Firebase roles,
// maar dit script blijft “defensief” (doet niks als je geen leiding bent).
const mode = localStorage.getItem("mode");
const isLeiding = mode === "leiding" || mode === "bestuur" || mode === "admin";

// Als geen leiding → niks doen, script stopt hier netjes
if (!isLeiding) {
  // bewust leeg
} else {
  init();
}

// ======================================================================
// INIT
// ======================================================================
function init() {
  const app = initializeApp(window.firebaseConfig);
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
    if (!snap.exists()) return;

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

    if (!items.length) return;

    section.classList.remove("hidden");
    list.innerHTML = "";

    items.forEach(i => {
      const row = document.createElement("div");
      row.className = "meldingen-row";
      row.style.cursor = "pointer";

      row.innerHTML = `
        <div class="meldingen-label">
          📌 ${i.titel}
        </div>
        <div class="meldingen-sub">
          ${i.type} · ${i.datum}
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
