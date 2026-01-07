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

function getUpdatedMs(i) {
  const v =
    i.updatedAt ??
    i.lastUpdated ??
    i.modifiedAt ??
    i.changedAt ??
    i.createdAt ??
    0;

  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? 0 : ms;
  }

  // als je ooit Firestore timestamps zou krijgen
  if (v && typeof v === "object" && typeof v.seconds === "number") {
    return v.seconds * 1000;
  }

  return 0;
}

function formatUpdatedNL(ms) {
  if (!ms) return "onbekend";
  return new Date(ms).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

async function loadHighlights(db, section, list) {
  try {
    const snap = await get(ref(db, "bestuursItems"));

    // Vak moet altijd kunnen renderen (binnen .only-auth bepaalt login.js zichtbaarheid)
    section.classList.remove("hidden");
    list.innerHTML = "";

    if (!snap.exists()) {
      list.innerHTML = `<div class="text-muted">Nog geen bestuursitems.</div>`;
      return;
    }

    const now = Date.now();
    const MAX_AGE = 14 * 24 * 60 * 60 * 1000; // 14 dagen
    const MAX_ITEMS = 3;

    const all = Object.entries(snap.val())
      .map(([id, v]) => ({ id, ...v }))
      .filter((i) => i.toonOpDashboard);

    if (!all.length) {
      list.innerHTML = `<div class="text-muted">Nog geen bestuursitems.</div>`;
      return;
    }

    // Sorteer op "laatst gewijzigd"
    const sorted = all
      .map((i) => ({ ...i, _updatedMs: getUpdatedMs(i) }))
      .sort((a, b) => (b._updatedMs || 0) - (a._updatedMs || 0));

    // 14-dagen venster als hoofdselectie
    const recent = sorted.filter((i) => now - (i._updatedMs || 0) <= MAX_AGE);

    // Altijd minimaal 1 item: als er niks recent is, pak de meest recente (ook als ouder)
    const selected = (recent.length ? recent : sorted).slice(0, MAX_ITEMS);

    selected.forEach((i) => {
      const row = document.createElement("div");
      row.className = "meldingen-row";
      row.style.cursor = "pointer";

      const changedLabel =
        now - (i._updatedMs || 0) <= MAX_AGE ? "" : " (ouder)";

      row.innerHTML = `
        <div class="meldingen-label">📌 ${i.titel || "(zonder titel)"}</div>
        <div class="meldingen-sub">
          ${(i.type || "Bestuur")} · gewijzigd ${formatUpdatedNL(i._updatedMs)}${changedLabel}
        </div>
      `;

      row.onclick = () => {
        window.location.href = `bestuur.html#item=${i.id}`;
      };

      list.appendChild(row);
    });
  } catch (err) {
    console.error("Fout bij laden bestuurs-highlights:", err);
    // Laat het vak staan met foutmelding ipv verdwijnen
    try {
      list.innerHTML = `<div class="text-muted">Kon bestuursitems niet laden.</div>`;
      section.classList.remove("hidden");
    } catch {}
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



