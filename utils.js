// ========================================================
// utils.js — algemene hulpfuncties voor OVN Jaarplanning
// ========================================================

// --------------------------------------------------------
// Veiligheid: verwijder potentieel gevaarlijke tags
// --------------------------------------------------------
export function sanitizeText(t = "") {
  return t.replace(/<\/?(script|style)[^>]*>/gi, "");
}

// --------------------------------------------------------
// Formatteert datums consistent als "YYYY-MM-DD"
// --------------------------------------------------------
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// --------------------------------------------------------
// Controle: is datum in verleden?
// --------------------------------------------------------
export function isPast(dateStr) {
  if (!dateStr) return false;
  return dateStr < todayISO();
}

// --------------------------------------------------------
// Controle: is datum vandaag of later?
// --------------------------------------------------------
export function isFutureOrToday(dateStr) {
  if (!dateStr) return false;
  return dateStr >= todayISO();
}

// --------------------------------------------------------
// Mooie weergave: "2024-05-04" → "04-05-2024"
// --------------------------------------------------------
export function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

// --------------------------------------------------------
// Zet een datum om naar een vergelijkbare tijdwaarde
// (handig voor consistent sorteren)
// --------------------------------------------------------
export function dateToNumber(dateStr) {
  if (!dateStr) return 0;
  return Number(dateStr.replace(/-/g, ""));
}

// --------------------------------------------------------
// Vergelijkstart voor datum + tijd
// (gebruik in dashboard & tabelsortering)
// --------------------------------------------------------
export function compareDateTime(a, b) {
  if (a.datum < b.datum) return -1;
  if (a.datum > b.datum) return 1;

  if (a.starttijd && b.startt
