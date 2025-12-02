// utils.js – algemene hulpfuncties voor de jaarplanning

// Verwijder potentieel gevaarlijke script/style tags uit tekst
export function sanitizeText(t) {
  return t.replace(/<\/?(script|style)[^>]*>/gi, "");
}

// Geef vandaag als string in formaat "YYYY-MM-DD"
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// True als datum in het verleden ligt
export function isPast(d) {
  return d < todayISO();
}

// True als datum vandaag of in de toekomst ligt
export function isFutureOrToday(d) {
  return d >= todayISO();
}
