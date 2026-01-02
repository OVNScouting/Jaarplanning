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

import { formatDateDisplay } from "./utils.js";


function getFirebaseApp() {
  return initializeApp(window.firebaseConfig);
}


function init() {
  // Alleen doorgaan als gebruiker is ingelogd (auth-consument, geen controller)
  const mode = (localStorage.getItem("mode") || "").toLowerCase();
  if (!["leiding", "bestuur", "admin"].includes(mode)) return;


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

// Re-run init zodra auth-status verandert
document.addEventListener("auth-changed", () => {
  const section = document.getElementById("bestuurHighlight");
  const list = document.getElementById("bestuurHighlightList");

  const mode = (localStorage.getItem("mode") || "").toLowerCase();
  const hasAccess = ["leiding", "bestuur", "admin"].includes(mode);

  if (!hasAccess) {
    section?.classList.add("hidden");
    if (list) list.innerHTML = "";
    return;
  }

  init();
});


