// ======================================================================
// bestuur.js — Bestuursagenda (FASE 2, opgeschoond)
// Rollen:
// - bestuur / admin: bekijken + bewerken + toevoegen
// - leiding: read-only, alleen items met toonOpDashboard
// ======================================================================

import {
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
// FIREBASE
// ======================================================================
const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// ======================================================================
// AUTH / ROLLEN
// ======================================================================
function getSession() {
  try {
    return JSON.parse(localStorage.getItem("ovn_auth_session"));
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return !!getSession();
}

function isBestuur() {
  const s = getSession();
  return !!(s?.roles?.bestuur || s?.roles?.admin);
}

// Iedereen moet ingelogd zijn
if (!isLoggedIn()) {
  document.body.innerHTML = "<p style='padding:2rem'>Geen toegang</p>";
  throw new Error("Niet ingelogd");
}

// ======================================================================
// DOM
// ======================================================================
const headerRow = document.getElementById("headerRow");
const tableBody = document.getElementById("tableBody");

const filterAll    = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast   = document.getElementById("filterPast");

const editModeButton = document.getElementById("editModeButton");
const fab = document.getElementById("fabAddBestuursItem");

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
let allItems = [];
let editMode = false;
let editingId = null;
let currentFilter = "all";

// Bestuur-only UI
if (!isBestuur()) {
  editModeButton?.classList.add("hidden");
  fab?.classList.add("hidden");
}

// ======================================================================
// INIT
// ======================================================================
loadItems();

// ======================================================================
// DATA
// ======================================================================
async function loadItems() {
  const snap = await get(ref(db, "bestuursItems"));
  const raw = snap.exists() ? snap.val() : {};

  allItems = Object.entries(raw).map(([id, v]) => ({ id, ...v }));
  sortItems();
  render();
}

function sortItems() {
  allItems.sort((a, b) => {
    if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);
    return (a.starttijd || "").localeCompare(b.starttijd || "");
  });
}

// ======================================================================
// RENDER
// ======================================================================
function getVisibleItems() {
  const bestuur = isBestuur();

  return allItems
    .filter(i => bestuur || i.toonOpDashboard)
    .filter(i => {
      if (currentFilter === "future") return isFutureOrToday(i.datum);
      if (currentFilter === "past") return isPast(i.datum);
      return true;
    });
}

function render() {
  renderHeader();
  tableBody.innerHTML = "";

  getVisibleItems().forEach(addRow);
}

function renderHeader() {
  headerRow.innerHTML = "";

  if (editMode && isBestuur()) {
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

  if (editMode && isBestuur()) {
    const del = td("🗑️");
    del.style.cursor = "pointer";
    del.onclick = () => deleteItem(item.id);
    tr.appendChild(del);
  }

  tr.appendChild(td(formatDateDisplay(item.datum)));
  tr.appendChild(td(renderTime(item)));

  const titleCell = td(item.titel);
  if (isBestuur()) {
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

// ======================================================================
// MODAL
// ======================================================================
function openNew() {
  editingId = null;
  modalTitle.textContent = "Nieuw bestuursitem";
  resetModal();
  modal.classList.remove("hidden");
}

function openEdit(item) {
  if (!isBestuur()) return;

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
  if (!isBestuur()) return;

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

  if (editingId) {
    await update(ref(db, `bestuursItems/${editingId}`), obj);
  } else {
    const r = push(ref(db, "bestuursItems"));
    await set(r, { ...obj, createdAt: Date.now() });
  }

  modal.classList.add("hidden");
  loadItems();
});

async function deleteItem(id) {
  if (!isBestuur()) return;
  if (!confirm("Dit item verwijderen?")) return;

  await set(ref(db, `bestuursItems/${id}`), null);
  loadItems();
}

cancelBtn?.addEventListener("click", () => modal.classList.add("hidden"));
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
  if (!isBestuur()) return;
  editMode = !editMode;
  editModeButton.textContent = editMode
    ? "💾 Klaar met bewerken"
    : "✏️ Items bewerken";
  render();
});

fab?.addEventListener("click", openNew);

// ======================================================================
// AUTH CHANGE
// ======================================================================
document.addEventListener("auth-changed", () => {
  editMode = false;
  render();
});

// ======================================================================
// TABLE HELPERS
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
