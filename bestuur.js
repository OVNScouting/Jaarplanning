// ======================================================================
// bestuursagenda.js — Overkoepelende bestuursagenda
// Rollen:
// - bestuur: view + edit + toevoegen
// - leiding: read-only, alleen items die op dashboard mogen
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
// AUTH / ROL
// ======================================================================
const authMode = localStorage.getItem("mode");
const isBestuur = authMode === "admin" || authMode === "bestuur";
const isLeiding = authMode === "leiding" || isBestuur;

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

// ======================================================================
// INIT
// ======================================================================
if (!isLeiding) {
  document.body.innerHTML = "<p>Geen toegang.</p>";
  throw new Error("Geen toegang tot bestuursagenda");
}

if (!isBestuur) {
  editModeButton?.classList.add("hidden");
  fab?.classList.add("hidden");
}

loadItems();

// ======================================================================
// LOAD
// ======================================================================
async function loadItems() {
  loadingIndicator.classList.remove("hidden");
  errorIndicator.classList.add("hidden");

  try {
    const snap = await get(ref(db, "bestuursItems"));
    const raw = snap.exists() ? snap.val() : {};

    items = Object.entries(raw).map(([id, v]) => ({ id, ...v }));

    // Leiding ziet alleen items die op dashboard mogen
    if (!isBestuur) {
      items = items.filter(i => i.toonOpDashboard);
    }

    sortItems();
    render();

    loadingIndicator.classList.add("hidden");

    // Scroll naar item via hash
    focusFromHash();

  } catch (e) {
    console.error(e);
    loadingIndicator.classList.add("hidden");
    errorIndicator.classList.remove("hidden");
  }
}

function sortItems() {
  items.sort((a, b) => {
    if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);

    // Geen tijd / hele dag bovenaan
    if (a.tijdType !== b.tijdType) {
      if (a.tijdType === "none" || a.tijdType === "allday") return -1;
      if (b.tijdType === "none" || b.tijdType === "allday") return 1;
    }

    return (a.starttijd || "").localeCompare(b.starttijd || "");
  });
}

// ======================================================================
// RENDER
// ======================================================================
function render() {
  renderHeader();
  tableBody.innerHTML = "";

  items
    .filter(filterItem)
    .forEach(addRow);
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

  // Deadline highlight
  if (item.type === "deadline" && isFutureOrToday(item.datum)) {
    const today = todayISO();
    if (item.datum <= today) {
      tr.style.borderLeft = "4px solid #dc2626";
    }
  }

  if (editMode && isBestuur) {
    const del = document.createElement("td");
    del.textContent = "🗑️";
    del.style.cursor = "pointer";
    del.onclick = () => deleteItem(item.id);
    tr.appendChild(del);
  }

  tr.appendChild(td(formatDateDisplay(item.datum)));
  tr.appendChild(td(renderTime(item)));

  const titleCell = td(item.titel);
  titleCell.style.cursor = isBestuur ? "pointer" : "default";
  if (isBestuur) {
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
// MODAL
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
// SAVE / DELETE
// ======================================================================
saveBtn?.addEventListener("click", async () => {
  if (!isBestuur) return;
  if (!biTitel.value || !biDatum.value) return alert("Titel en datum verplicht");

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

  } catch (e) {
    console.error(e);
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
// HASH NAVIGATIE
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
