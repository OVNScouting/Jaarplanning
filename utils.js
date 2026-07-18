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

// "2024-05-04" → "04-05-2024"
export function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

// "2024-05-04" → "04/05/2024"
export function formatDateDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

//
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
 * Bepaalt of een seizoen toegankelijk is voor ouders (huidige seizoen + vorig seizoen).
 * @param {string} seizoen - Bijv. "2025-2026"
 * @returns {boolean}
 */
export function isSeizoenToegestaan(seizoen) {
  const nu = new Date();
  const huidigJaar = nu.getMonth() < 7 ? nu.getFullYear() - 1 : nu.getFullYear();
  const huidigSeizoen = `${huidigJaar}-${huidigJaar + 1}`;
  const vorigSeizoen = `${huidigJaar - 1}-${huidigJaar}`;

  return seizoen === huidigSeizoen || seizoen === vorigSeizoen;
}

/* ========================================================
   SORTERING — BESTAAND (BACKWARDS COMPATIBLE)
   ======================================================== */

// Vergelijk op datum + starttijd
// (wordt al gebruikt in script.js / dashboard.js)
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

/**
 * Sorteer opkomsten volgens projectregels:
 * 1. Toekomst (incl. vandaag) eerst
 * 2. Daarna verleden
 * 3. Binnen groepen: datum → starttijd
 *
 * @param {Array} opkomsten
 * @returns {Array} nieuwe gesorteerde array
 */
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

/**
 * Bepaal de eerstvolgende opkomst.
 * - Altijd exact één of null
 * - Nooit een verleden opkomst
 * - Onafhankelijk van filters
 *
 * @param {Array} opkomsten
 * @returns {Object|null}
 */
export function getNextUpcoming(opkomsten = []) {
  if (!Array.isArray(opkomsten) || !opkomsten.length) return null;

  const sorted = sortOpkomsten(opkomsten);
  return sorted.find(o => isFutureOrToday(o.datum)) || null;
}

/**
 * Helper voor filtergedrag zonder bijwerkingen
 *
 * @param {Array} opkomsten
 * @param {"all"|"future"|"past"} filter
 * @returns {Array}
 */
export function filterOpkomsten(opkomsten = [], filter = "all") {
  if (filter === "future") {
    return opkomsten.filter(o => isFutureOrToday(o.datum));
  }
  if (filter === "past") {
    return opkomsten.filter(o => isPast(o.datum));
  }
  return opkomsten;
}

/**
 * Checkt of een datum binnen de komende 3 dagen valt (vanaf nu)
 * @param {string} dateStr - YYYY-MM-DD
 */
export function isBinnen3Dagen(dateStr) {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  const now = new Date();
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Retourneert true als het vandaag, morgen, overmorgen of de dag erna is (0 t/m 3)
  return diffDays >= 0 && diffDays <= 3;
}