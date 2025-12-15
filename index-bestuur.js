// ======================================================================
// index-bestuur.js — Highlight recente bestuursitems op index
// Alleen zichtbaar voor leiding
// ======================================================================

import {
  initializeApp,
  getDatabase,
  ref,
  get
} from "./firebase-imports.js";

const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

const section = document.getElementById("bestuurHighlight");
const list = document.getElementById("bestuurHighlightList");

// Alleen laden als leiding ingelogd
const mode = localStorage.getItem("mode");
if (mode !== "leiding" && mode !== "bestuur" && mode !== "admin") {
  return;
}

loadHighlights();

async function loadHighlights() {
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
