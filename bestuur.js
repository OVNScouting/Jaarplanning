// ======================================================================
// bestuur.js — Bestuursagenda (volledig en zelfvoorzienend)
// Rollen:
// - bestuur / admin: bekijken + bewerken + toevoegen
// - leiding: read-only, alleen items met toonOpDashboard
// ======================================================================

import {
  todayISO,
  isPast,
  isFutureOrToday,
  formatDateDisplay
} from "./utils.js";

import {
  initializeApp,
  getDatabase,
  ref,
  get,
  set,
  update,
  push
} from "./firebase-imports.js";

// ======================================================================
// FIREBASE INIT
// ======================================================================
const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// ======================================================================
// AUTH / ROLLEN
// ======================================================================
// FASE 0:
// authMode/mode is momenteel een UI/view-state (historisch gegroeid) en wordt hier gebruikt
// als toegangssignaal. In FASE 1+ wordt dit afgeleid van Firebase roles en gecentraliseerd.
const authMode = localStorage.getItem("mode");
const isBestuur = authMode === "admin" || authMode === "bestuur";
const isLeiding = authMode === "leiding" || isBestuur;

// Geen toegang → harde stop
if (!isLeiding) {
  document.body.innerHTML = "<p>Geen toegang tot bestuursagenda.</p>";
  throw new Error("Geen toegang");
}

// ======================================================================
// DOM
// ======================================================================
const loadingIndicator = document.getElementById("loadingIndicator");
const errorIndicator   = document.getElementById("errorIndicator");

const headerRow = document.getElementById("headerRow");
const tableBody = document.getElementById("tableBody");

const filterAll    = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast   = document.getElementById("filterPast");

const editModeButton = document.getElementById("editModeButton");
const fab = document.getElementById("fabAddBestuursItem");

// Modal
const modal = document.getElementById("bestuursItemModal");
const modalTitle = document.getElementById("modalTitle");

const biType = document.getElementById("biType");
const biTitel = document.getElementById("biTitel");
const biDatum = document.getElementById("biDatum");
const biTijdType = document.getElementById("biTijdType");
const biStart = document.getElementById("biStart");
const biEind = document.getElementById("biEind");
const biBeschrijving = document.getElementById("biBeschrijving");
const biToonDashboard = document.getElementById("biToonDashboard");
const biTimeRange = document.getElementById("biTimeRange");

const saveBtn = document.getElementById("saveBestuursItem");
const cancelBtn = document.getElementById("cancelBestuursItem");

// ======================================================================
// STATE
// ======================================================================
let items = [];
let editMode = false;
let editingId = null;
let currentFilter = "all";

// Bestuur-only UI verbergen indien nodig
if (!isBestuur) {
  editModeButton?.classList.add("hidden");
  fab?.classList.add("hidden");
}

// ======================================================================
// INIT
// ======================================================================
loadItems();

// ======================================================================
// DATA LADEN
// ======================================================================
async function loadItems() {
  loadingIndicator?.classList.remove("hidden");
  errorIndicator?.classList.add("hidden");

  try {
    const snap = await get(ref(db, "bestuursItems"));
    const raw = snap.exists() ? snap.val() : {};

    items = Object.entries(raw).map(([id, v]) => ({ id, ...v }));

    // Leiding ziet alleen dashboard-items
    if (!isBestuur) {
      items = items.filter(i => i.toonOpDashboard);
    }

    sortItems();
    render();

    loadingIndicator?.classList.add("hidden");
    focusFromHash();

  } catch (err) {
    console.error(err);
    loadingIndicator?.classList.add("hidden");
    errorIndicator?.classList.remove("hidden");
  }
}

function sortItems() {
  items.sort((a, b) => {
    if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);

    // Geen tijd / hele dag altijd bovenaan
    const aNoTime = a.tijdType === "none" || a.tijdType === "allday";
    const bNoTime = b.tijdType === "none" || b.tijdType === "allday";
    if (aNoTime && !bNoTime) return -1;
    if (!aNoTime && bNoTime) return 1;

    return (a.starttijd || "").localeCompare(b.starttijd || "");
  });
}

// ======================================================================
// RENDER
// ======================================================================
function render() {
  renderHeader();
  tableBody.innerHTML = "";

  items.filter(filterItem).forEach(addRow);
}

function renderHeader() {
  headerRow.innerHTML = "";

  if (editMode && isBestuur) {
    headerRow.appendChild(th(""));
  }

  headerRow.appendChild(th("Datum"));
  headerRow.appendChild(th("Tijd"));
  headerRow.appendChild(th("Titel"));
  headerRow.appendChild(th("Type"));
}

function addRow(item) {
  const tr = document.createElement("tr");
  tr.dataset.id = item.id;

  // Deadline → rood randje
  if (item.type === "deadline" && isFutureOrToday(item.datum)) {
    tr.style.borderLeft = "4px solid #dc2626";
  }

  if (editMode && isBestuur) {
    const del = td("🗑️");
    del.style.cursor = "pointer";
    del.onclick = () => deleteItem(item.id);
    tr.appendChild(del);
  }

  tr.appendChild(td(formatDateDisplay(item.datum)));
  tr.appendChild(td(renderTime(item)));

  const titleCell = td(item.titel);
  if (isBestuur) {
    titleCell.style.cursor = "pointer";
    titleCell.onclick = () => openEdit(item);
  }
  tr.appendChild(titleCell);

  tr.appendChild(td(item.type));

  tableBody.appendChild(tr);
}

function renderTime(item) {
  if (item.tijdType === "none") return "—";
  if (item.tijdType === "allday") return "Hele dag";
  return `${item.starttijd || ""}–${item.eindtijd || ""}`;
}

function filterItem(item) {
  if (currentFilter === "future") return isFutureOrToday(item.datum);
  if (currentFilter === "past") return isPast(item.datum);
  return true;
}

// ======================================================================
// MODAL LOGICA
// ======================================================================
function openNew() {
  editingId = null;
  modalTitle.textContent = "Nieuw bestuursitem";
  resetModal();
  modal.classList.remove("hidden");
}

function openEdit(item) {
  editingId = item.id;
  modalTitle.textContent = "Bestuursitem bewerken";

  biType.value = item.type;
  biTitel.value = item.titel;
  biDatum.value = item.datum;
  biTijdType.value = item.tijdType;
  biStart.value = item.starttijd || "";
  biEind.value = item.eindtijd || "";
  biBeschrijving.value = item.beschrijving || "";
  biToonDashboard.checked = !!item.toonOpDashboard;

  updateTimeFields();
  modal.classList.remove("hidden");
}

function resetModal() {
  biType.value = "bestuursvergadering";
  biTitel.value = "";
  biDatum.value = "";
  biTijdType.value = "none";
  biStart.value = "";
  biEind.value = "";
  biBeschrijving.value = "";
  biToonDashboard.checked = false;
  updateTimeFields();
}

function updateTimeFields() {
  biTimeRange.classList.toggle("hidden", biTijdType.value !== "range");
}

// ======================================================================
// OPSLAAN / VERWIJDEREN
// ======================================================================
saveBtn?.addEventListener("click", async () => {
  if (!isBestuur) return;
  if (!biTitel.value || !biDatum.value) {
    alert("Titel en datum zijn verplicht");
    return;
  }

  const obj = {
    type: biType.value,
    titel: biTitel.value,
    datum: biDatum.value,
    tijdType: biTijdType.value,
    starttijd: biStart.value || "",
    eindtijd: biEind.value || "",
    beschrijving: biBeschrijving.value || "",
    toonOpDashboard: !!biToonDashboard.checked,
    updatedAt: Date.now()
  };

  try {
    if (editingId) {
      await update(ref(db, `bestuursItems/${editingId}`), obj);
    } else {
      const newRef = push(ref(db, "bestuursItems"));
      await set(newRef, {
        ...obj,
        createdAt: Date.now()
      });
    }

    modal.classList.add("hidden");
    loadItems();

  } catch (err) {
    console.error(err);
    alert("Opslaan mislukt");
  }
});

async function deleteItem(id) {
  if (!confirm("Dit item verwijderen?")) return;
  await set(ref(db, `bestuursItems/${id}`), null);
  loadItems();
}

cancelBtn?.addEventListener("click", () => {
  modal.classList.add("hidden");
});

biTijdType?.addEventListener("change", updateTimeFields);

// ======================================================================
// FILTERS
// ======================================================================
filterAll?.addEventListener("click", () => setFilter("all"));
filterFuture?.addEventListener("click", () => setFilter("future"));
filterPast?.addEventListener("click", () => setFilter("past"));

function setFilter(f) {
  currentFilter = f;
  filterAll.classList.toggle("active", f === "all");
  filterFuture.classList.toggle("active", f === "future");
  filterPast.classList.toggle("active", f === "past");
  render();
}

// ======================================================================
// EDIT MODE
// ======================================================================
editModeButton?.addEventListener("click", () => {
  if (!isBestuur) return;
  editMode = !editMode;
  editModeButton.textContent = editMode
    ? "💾 Klaar met bewerken"
    : "✏️ Items bewerken";
  render();
});

fab?.addEventListener("click", openNew);

// ======================================================================
// HASH-NAVIGATIE (vanaf dashboard)
// ======================================================================
function focusFromHash() {
  const id = location.hash.replace("#item=", "");
  if (!id) return;

  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;

  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("row-highlight");
  setTimeout(() => row.classList.remove("row-highlight"), 2000);
}

// ======================================================================
// TABLE HELPERS (EXPRES HIER, GEEN AFHANKELIJKHEDEN)
// ======================================================================
function th(text) {
  const el = document.createElement("th");
  el.textContent = text;
  return el;
}

function td(text) {
  const el = document.createElement("td");
  el.textContent = text ?? "";
  return el;
}

document.addEventListener("auth-changed", async () => {
  // Edit-modus altijd resetten
  if (typeof editMode !== "undefined") {
    editMode = false;
  }

  // Mode opnieuw bepalen
  if (typeof setMode === "function") {
    setMode(isLeiding() ? "leiding" : "ouder");
  }

  // Data + UI opnieuw renderen
  if (typeof loadEverything === "function") {
    await loadEverything();
  }
});
