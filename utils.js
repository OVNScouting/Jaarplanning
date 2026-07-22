// ========================================================
// utils.js — algemene hulpfuncties voor OVN Jaarplanning
// Drop-in vervanging (geen regressies)
// ========================================================

/* ========================================================
   SANITIZE / TEKST
   ======================================================== */

// Verwijder potentieel gevaarlijke tags
export function sanitizeText(t = "") {
  return t.replace(/<\/?(script|style)[^>]*>/gi, "");
}

/* ========================================================
   DATUM — BASIS
   ======================================================== */

// Vandaag als ISO-datum (YYYY-MM-DD)
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Is datum in het verleden?
// (vandaag telt NIET als verleden)
export function isPast(dateStr) {
  if (!dateStr) return false;
  return dateStr < todayISO();
}

// Is datum vandaag of later?
export function isFutureOrToday(dateStr) {
  if (!dateStr) return false;
  return dateStr >= todayISO();
}

/* ========================================================
   DATUM — FORMAT
   ======================================================== */

// "2026-03-08" → "8 maart"
export function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const delen = dateStr.split("-");
  if (delen.length !== 3) return dateStr;

  const dag = parseInt(delen[2], 10);
  const maandIndex = parseInt(delen[1], 10) - 1;

  const maanden = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"
  ];

  if (maanden[maandIndex]) {
    return `${dag} ${maanden[maandIndex]}`;
  }
  return dateStr;
}

// Omzetten naar numerieke waarde (voor eenvoudige sort)
export function dateToNumber(dateStr) {
  if (!dateStr) return 0;
  return Number(dateStr.replace(/-/g, ""));
}

// <input type="date"> geeft al yyyy-mm-dd
export function isoFromInput(v) {
  if (!v) return "";
  return v;
}

// Berekent het seizoen (bijv. 2025-2026) op basis van een datum string.
export function getSeizoenVanDatum(dateString) {
  if (!dateString) return "";
  const datum = new Date(dateString);
  const jaar = datum.getFullYear();
  const maand = datum.getMonth(); // 0-indexed (jan = 0)

  // Scoutingseizoen loopt van augustus (maand 7) t/m juli
  if (maand < 7) {
    return `${jaar - 1}-${jaar}`;
  } else {
    return `${jaar}-${jaar + 1}`;
  }
}

/**
 * Bepaalt of een seizoen toegankelijk is voor ouders 
 * (vorig seizoen, huidig seizoen, en het volgende seizoen vanaf mei t/m juli).
 * @param {string} seizoen - Bijv. "2025-2026"
 * @returns {boolean}
 */
export function isSeizoenToegestaan(seizoen) {
  const nu = new Date();
  const maand = nu.getMonth(); // 0-indexed (0 = jan, ..., 6 = jul, 7 = aug)
  const jaar = nu.getFullYear();

  // Scoutingseizoen loopt van augustus (maand 7) t/m juli
  const huidigJaar = maand < 7 ? jaar - 1 : jaar;

  const vorigSeizoen = `${huidigJaar - 1}-${huidigJaar}`;
  const huidigSeizoen = `${huidigJaar}-${huidigJaar + 1}`;
  const volgendSeizoen = `${huidigJaar + 1}-${huidigJaar + 2}`;

  // 1. Vorig en huidig seizoen zijn altijd toegestaan
  if (seizoen === huidigSeizoen || seizoen === vorigSeizoen) {
    return true;
  }

  // 2. Het aankomende seizoen al 3 maanden van tevoren openzetten 
  // Dit geldt in mei (4), juni (5) en juli (6) van het lopende seizoen
  if (seizoen === volgendSeizoen && maand >= 4 && maand <= 6) {
    return true;
  }

  return false;
}

/* ========================================================
   SORTERING — BESTAAND (BACKWARDS COMPATIBLE)
   ======================================================== */

// Vergelijk op datum + starttijd
export function compareDateTime(a, b) {
  if (a.datum < b.datum) return -1;
  if (a.datum > b.datum) return 1;

  if (a.starttijd && b.starttijd) {
    if (a.starttijd < b.starttijd) return -1;
    if (a.starttijd > b.starttijd) return 1;
  }
  return 0;
}

/* ========================================================
   NIEUW — CANONIEKE OPKOMST-LOGICA (STAP 5)
   ======================================================== */

export function sortOpkomsten(opkomsten = []) {
  return [...opkomsten].sort((a, b) => {
    const aPast = isPast(a.datum);
    const bPast = isPast(b.datum);

    // Toekomst eerst
    if (aPast !== bPast) return aPast ? 1 : -1;

    // Daarna datum + tijd
    return compareDateTime(a, b);
  });
}

export function getNextUpcoming(opkomsten = []) {
  if (!Array.isArray(opkomsten) || !opkomsten.length) return null;

  const sorted = sortOpkomsten(opkomsten);
  return sorted.find(o => isFutureOrToday(o.datum)) || null;
}

export function filterOpkomsten(opkomsten = [], filter = "all") {
  if (filter === "future") {
    return opkomsten.filter(o => isFutureOrToday(o.datum));
  }
  if (filter === "past") {
    return opkomsten.filter(o => isPast(o.datum));
  }
  return opkomsten;
}

export function isBinnen3Dagen(dateStr) {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  const now = new Date();
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= 3;
}

/* ========================================================
   BUG MODAL & FIREBASE INTEGRATIE
   ======================================================== */
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export function initBugModal() {
  const modal = document.getElementById("bugModal");
  let openBtn = document.getElementById("openBugModalBtn");
  const closeBtn = document.getElementById("closeBugModalBtn");
  const cancelBtn = document.getElementById("cancelBugModalBtn");
  const form = document.getElementById("modalBugForm");

  // Optioneel: Dynamisch aanmaken van de knop als deze mist in de HTML
  if (!openBtn) {
    openBtn = document.createElement("button");
    openBtn.id = "openBugModalBtn";
    openBtn.type = "button";
    openBtn.className = "primary-btn bug-fab hidden";
    openBtn.style.cssText = "display: flex; align-items: center; justify-content: center; text-decoration: none;";
    openBtn.textContent = "Meld een probleem";
    document.body.appendChild(openBtn);
  }

  const db = getDatabase();
  const auth = getAuth();
  let currentUserEmail = "Anoniem";

  // Luister naar inlogstatus om de knop te tonen/verbergen en e-mail op te slaan
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUserEmail = user.email || "Ingelogd (Geen e-mail)";
      openBtn.classList.remove("hidden");
    } else {
      currentUserEmail = "Niet ingelogd (Anoniem)";
      openBtn.classList.add("hidden");
    }
  });

  openBtn.addEventListener("click", () => {
    const emailField = document.getElementById("modalBugEmail");
    if (emailField) emailField.value = currentUserEmail;
    modal?.classList.remove("hidden");
  });

  function closeModal() {
    modal?.classList.add("hidden");
    form?.reset();
    const successMsg = document.getElementById("modalSuccessMsg");
    if (successMsg) successMsg.style.display = "none";
  }

  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);
  window.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const bugData = {
      titel: document.getElementById("modalBugTitle")?.value || "",
      beschrijving: document.getElementById("modalBugDesc")?.value || "",
      pagina: window.location.href,
      melder: currentUserEmail,
      datum: new Date().toISOString(),
      status: "Nieuw"
    };

    try {
      await push(ref(db, "bugs"), bugData);

      const successMsg = document.getElementById("modalSuccessMsg");
      if (successMsg) successMsg.style.display = "block";

      setTimeout(() => {
        closeModal();
      }, 2000);
    } catch (error) {
      console.error("Fout bij opslaan bug:", error);
      alert("Kon de melding niet verzenden. Probeer het later opnieuw.");
    }
  });
}

// Start de bug-modal automatisch zodra de DOM geladen is
document.addEventListener("DOMContentLoaded", () => {
  initBugModal();
});