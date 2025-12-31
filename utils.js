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
