// ======================================================================
// IMPORTS
// ======================================================================
import {
  sanitizeText,
  todayISO,
  isPast,
  isFutureOrToday,
  compareDateTime,
  formatDisplayDate,
  isoFromInput
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

// Speltak bepalen op basis van bestandsnaam
const speltak = window.location.pathname.split("/").pop().replace(".html", "");

// ======================================================================
// MODE SYSTEEM — ouder / leiding / edit
// ======================================================================
let mode = localStorage.getItem("mode") || "ouder"; 
let editMode = false; 

function setMode(newMode) {
  mode = newMode;
  localStorage.setItem("mode", newMode);
  updateVisibility();
  renderEverything();
}

function isOuder() { return mode === "ouder"; }
function isLeiding() { return mode === "leiding"; }
function isEdit() { return isLeiding() && editMode; }

function toggleEditMode() {
  if (!isLeiding()) return;
  editMode = !editMode;
  updateVisibility();
  renderEverything();
}

function updateVisibility() {
  document.querySelectorAll(".only-leiding")
    .forEach(el => el.classList.toggle("hide-ouder", isOuder()));
  
  document.querySelectorAll(".edit-only")
    .forEach(el => el.classList.toggle("hide-edit", !isEdit()));
  
  document.querySelectorAll(".view-hide")
    .forEach(el => el.classList.toggle("hide-view", isEdit()));
}

// ======================================================================
// DATA
// ======================================================================
let data = {};
let opkomsten = [];
let jeugd = [];
let leiding = [];
let nextUpcomingId = null;
let currentFilter = "all";

// ======================================================================
// DATA LADEN
// ======================================================================
async function loadData() {
  const snap = await get(ref(db, speltak));
  data = snap.val() || {};

  // -------- Opkomsten --------
  opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({
    id,
    ...v
  }));

  opkomsten.sort((a, b) => {
    const aPast = isPast(a.datum);
    const bPast = isPast(b.datum);
    if (aPast !== bPast) return aPast ? 1 : -1;
    return compareDateTime(a, b);
  });

  nextUpcomingId = null;
  for (const o of opkomsten) {
    if (!isPast(o.datum)) {
      nextUpcomingId = o.id;
      break;
    }
  }

  // -------- Jeugd + Leiding --------
  jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({
    id,
    naam: v.naam || "",
    volgorde: typeof v.volgorde === "number" ? v.volgorde : 999,
    hidden: !!v.hidden
  }));

  leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
    id,
    naam: v.naam || "",
    volgorde: typeof v.volgorde === "number" ? v.volgorde : 999,
    hidden: !!v.hidden
  }));

  jeugd.sort((a, b) => a.volgorde - b.volgorde);
  leiding.sort((a, b) => a.volgorde - b.volgorde);

  renderEverything();
}

// ======================================================================
// RENDER EVERYTHING
// ======================================================================
function renderEverything() {
  renderTable();
  loadInfoBlock();
  renderLedenbeheer();
  renderMeldingen();
}

// ======================================================================
// TABEL GENEREREN
// ======================================================================
function renderTable() {
  const head = document.getElementById("tableHead");
  const body = document.getElementById("tableBody");

  head.innerHTML = "";
  body.innerHTML = "";

  addHeaders();

  opkomsten
    .filter(o => {
      if (currentFilter === "future") return isFutureOrToday(o.datum);
      if (currentFilter === "past") return isPast(o.datum);
      return true;
    })
    .forEach(o => addRow(o));
}

// ======================================================================
// TABEL HEADERS
// ======================================================================
function addHeaders() {
  const head = document.getElementById("tableHead");
  const tr = document.createElement("tr");

  // Verwijderen kolom
  const thEmpty = document.createElement("th");
  thEmpty.textContent = isEdit() ? "🗑️" : "";
  tr.appendChild(thEmpty);

  // Datum
  const thDatum = document.createElement("th");
  thDatum.textContent = "Datum";
  thDatum.classList.add("sticky-date");
  tr.appendChild(thDatum);

  // Start
  const thStart = document.createElement("th");
  thStart.textContent = "Start";
  tr.appendChild(thStart);

  // Eind
  const thEnd = document.createElement("th");
  thEnd.textContent = "Eind";
  tr.appendChild(thEnd);

  // Type (alleen edit)
  if (isEdit()) {
    const thType = document.createElement("th");
    thType.textContent = "Type";
    tr.appendChild(thType);
  }

  // Thema
  const thThema = document.createElement("th");
  thThema.textContent = "Thema";
  tr.appendChild(thThema);

  // Bert (leiding)
  if (!isOuder()) {
    const thBert = document.createElement("th");
    thBert.textContent = "Bert logeert bij";
    tr.appendChild(thBert);
  }

  // Locatie (leiding)
  if (!isOuder()) {
    const thLoc = document.createElement("th");
    thLoc.textContent = "Locatie";
    tr.appendChild(thLoc);
  }

  // Materiaal (leiding)
  if (!isOuder()) {
    const thMat = document.createElement("th");
    thMat.textContent = "Materiaal";
    tr.appendChild(thMat);
  }

  // Jeugdleden
  jeugd.forEach(j => {
    const th = document.createElement("th");
    th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
    if (j.hidden) th.classList.add("hidden");
    tr.appendChild(th);
  });
  
  // Divider
  const thDiv = document.createElement("th");
  thDiv.classList.add("col-divider");
  tr.appendChild(thDiv);
  
  // Leiding (alleen leiding-modus)
  if (!isOuder()) {
    leiding.forEach(l => {
      const th = document.createElement("th");
      th.innerHTML = `<div class="name-vertical">${l.naam}</div>`;
      if (l.hidden) th.classList.add("hidden");
      tr.appendChild(th);
    });
  }

  head.appendChild(tr);
}

// ======================================================================
// TABEL RIJ
// ======================================================================
function addRow(o) {
  const body = document.getElementById("tableBody");
  const tr = document.createElement("tr");

  tr.classList.add(`type-${o.typeOpkomst || "normaal"}`);

  if (o.id === nextUpcomingId) tr.classList.add("row-next");
  if (isPast(o.datum)) tr.classList.add("row-grey");

  // Verwijderen
  const tdDel = document.createElement("td");
  if (isEdit()) {
    tdDel.textContent = "🗑️";
    tdDel.classList.add("editable-cell");
    tdDel.onclick = () => {
      if (confirm("Opkomst verwijderen?")) {
        set(ref(db, `${speltak}/opkomsten/${o.id}`), null).then(loadData);
      }
    };
  }
  tr.appendChild(tdDel);

  // Datum
  const tdDatum = document.createElement("td");
  tdDatum.textContent = formatDisplayDate(o.datum);
  tdDatum.classList.add("sticky-date");
  if (isEdit()) tdDatum.onclick = () => editDate(o);
  tr.appendChild(tdDatum);

  // Starttijd
  tr.appendChild(makeTimeCell(o, "starttijd"));

  // Eindtijd
  tr.appendChild(makeTimeCell(o, "eindtijd"));

  // Type (edit)
  if (isEdit()) {
    const tdType = document.createElement("td");
    tdType.textContent = o.typeOpkomst || "normaal";
    tdType.classList.add("editable-cell");
    tdType.onclick = () => editType(o);
    tr.appendChild(tdType);
  }

  // Thema
  const tdThema = document.createElement("td");
  tdThema.textContent = o.thema || "";
  if (isEdit()) tdThema.onclick = () => editText(o, "thema");
  tr.appendChild(tdThema);

  // Bert
  if (!isOuder()) {
    const tdBert = document.createElement("td");
    tdBert.textContent = o.bert_met || "";
    if (isEdit()) tdBert.onclick = () => editText(o, "bert_met");
    tr.appendChild(tdBert);
  }

  // Locatie
  if (!isOuder()) {
    const tdLoc = document.createElement("td");
    tdLoc.textContent = o.locatie || "";
    if (isEdit()) tdLoc.onclick = () => editLocatie(o);
    tr.appendChild(tdLoc);
  }

  // Materiaal
  if (!isOuder()) {
    const tdMat = document.createElement("td");
    tdMat.textContent = o.materiaal || "";
    if (isEdit()) tdMat.onclick = () => editText(o, "materiaal");
    tr.appendChild(tdMat);
  }

  // Divider
  const tdDiv = document.createElement("td");
  tdDiv.classList.add("col-divider");
  tr.appendChild(tdDiv);

  // Jeugd aanwezigen
  jeugd.forEach(j => {
    tr.appendChild(makePresenceCell(o, j.id, j.hidden));
  });

  // Leiding aanwezigen
  if (!isOuder()) {
    leiding.forEach(l => {
      tr.appendChild(makePresenceCell(o, `leiding-${l.id}`, l.hidden));
    });
  }

  body.appendChild(tr);
}

// ======================================================================
// CEL BEWERKFUNCTIES
// ======================================================================
function editDate(o) {
  const nieuw = prompt("Nieuwe datum:", o.datum);
  if (!nieuw) return;

  update(ref(db, `${speltak}/opkomsten/${o.id}`), {
    datum: isoFromInput(nieuw)
  }).then(loadData);
}

function makeTimeCell(o, field) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";
  if (!isEdit()) return td;

  td.classList.add("editable-cell");
  td.onclick = () => {
    const nieuw = prompt(`Nieuwe ${field}:`, o[field] || "");
    if (!nieuw) return;
    update(ref(db, `${speltak}/opkomsten/${o.id}`), {
      [field]: nieuw
    }).then(loadData);
  };
  return td;
}

function editText(o, field) {
  const nieuw = prompt(`Nieuwe waarde voor ${field}:`, o[field] || "");
  if (nieuw === null) return;
  update(ref(db, `${speltak}/opkomsten/${o.id}`), {
    [field]: nieuw.trim()
  }).then(loadData);
}

function editType(o) {
  const keuzes = ["normaal", "bijzonder", "kamp"];
  const nieuw = prompt(`Type opkomst (${keuzes.join(", ")}):`, o.typeOpkomst);
  if (!nieuw || !keuzes.includes(nieuw)) return;

  update(ref(db, `${speltak}/opkomsten/${o.id}`), {
    typeOpkomst: nieuw
  }).then(loadData);
}

function editLocatie(o) {
  const opties = [
    "Kampvuurkuil",
    "Zandveld",
    "Grasveld",
    "De Hoop",
    "Bever lokaal",
    "Welpen lokaal",
    "Van terrein af",
    "Externe locatie",
    "Overig"
  ];
  const nieuw = prompt(`Kies locatie:\n${opties.join("\n")}`, o.locatie);
  if (!nieuw) return;

  update(ref(db, `${speltak}/opkomsten/${o.id}`), {
    locatie: nieuw
  }).then(loadData);
}

// ======================================================================
// AANWEZIGHEID
// ======================================================================
function makePresenceCell(o, key, hidden) {
  const td = document.createElement("td");
  if (hidden) td.classList.add("hidden");

  const waarde =
    (o.aanwezigheid && o.aanwezigheid[key]) || "onbekend";

  const symbool = {
    aanwezig: "✔",
    afwezig: "✖",
    onbekend: "?"
  }[waarde];

  td.textContent = symbool;
  td.classList.add("presence-cell");

  td.classList.toggle("aanwezig-groen", waarde === "aanwezig");
  td.classList.toggle("aanwezig-rood", waarde === "afwezig");
  td.classList.toggle("aanwezig-onbekend", waarde === "onbekend");

  const isLeidingCel = key.startsWith("leiding-");
  if (isOuder() && isLeidingCel) return td;

  td.onclick = () => togglePresence(o, key);

  return td;
}

function togglePresence(o, key) {
  const huidige =
    (o.aanwezigheid && o.aanwezigheid[key]) || "onbekend";

  const volgende =
    huidige === "aanwezig"
      ? "afwezig"
      : huidige === "afwezig"
      ? "onbekend"
      : "aanwezig";

  update(ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid`), {
    [key]: volgende
  }).then(loadData);
}

// ======================================================================
// INFO BLOK
// ======================================================================
function loadInfoBlock() {
  const el = document.getElementById("infoText");
  const txt = data.infotekst || "";
  el.textContent = txt;

  const btn = document.getElementById("editInfoBtn");
  if (!btn) return;
  btn.classList.toggle("hide-ouder", !isLeiding());

  btn.onclick = () => {
    if (!isLeiding()) return;
    const nieuw = prompt("Pas info-tekst aan:", txt);
    if (nieuw === null) return;

    update(ref(db, `${speltak}/infotekst`), nieuw.trim()).then(loadData);
  };
}

// ======================================================================
// LEDENBEHEER
// ======================================================================
function renderLedenbeheer() {
  const jeugdList = document.getElementById("ledenbeheerJeugd");
  const leidingList = document.getElementById("ledenbeheerLeiding");
  if (!jeugdList || !leidingList) return;

  jeugdList.innerHTML = "";
  leidingList.innerHTML = "";

  jeugd.forEach(j => jeugdList.appendChild(makeMemberRow(j, "jeugd")));
  leiding.forEach(l => leidingList.appendChild(makeMemberRow(l, "leiding")));
}

function makeMemberRow(obj, type) {
  const li = document.createElement("li");
  li.innerHTML = `
    ${obj.hidden ? "🚫" : "👤"} ${obj.naam}
    <div class="ledenbeheer-controls only-leiding">
      <button data-act="up">↑</button>
      <button data-act="down">↓</button>
      <button data-act="toggle">${obj.hidden ? "Toon" : "Verberg"}</button>
      <button data-act="del">🗑️</button>
    </div>
  `;
  li.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => handleMemberAction(obj, type, btn.dataset.act);
  });
  return li;
}

function handleMemberAction(obj, type, act) {
  if (!isLeiding()) return;

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const refBase = ref(db, `${speltak}/${path}/${obj.id}`);

  if (act === "toggle") {
    update(refBase, { hidden: !obj.hidden }).then(loadData);
    return;
  }

  if (act === "del") {
    if (confirm(`Verwijder ${obj.naam}?`)) {
      set(refBase, null).then(loadData);
    }
    return;
  }

  if (act === "up") obj.volgorde--;
  if (act === "down") obj.volgorde++;

  update(refBase, obj).then(loadData);
}

// ======================================================================
// MELDINGEN
// ======================================================================
function renderMeldingen() {
  const sectie = document.getElementById("meldingenSection");
  if (!sectie) return;

  document.getElementById("meldingLeidingAan").checked =
    !!data.meldingLeidingAan;

  document.getElementById("meldingOnbekendAan").checked =
    !!data.meldingOnbekendAan;

  document.getElementById("leidingDrempel").value =
    typeof data.leidingDrempel === "number" ? data.leidingDrempel : 2;

  sectie.classList.toggle("hide-ouder", !isLeiding());
}

function saveMeldingen() {
  if (!isLeiding()) return;

  update(ref(db, speltak), {
    meldingLeidingAan: !!document.getElementById("meldingLeidingAan").checked,
    meldingOnbekendAan: !!document.getElementById("meldingOnbekendAan").checked,
    leidingDrempel: Number(document.getElementById("leidingDrempel").value)
  }).then(loadData);
}

document.getElementById("saveMeldingenBtn")?.addEventListener("click", saveMeldingen);

// ======================================================================
// FILTERS
// ======================================================================
document.getElementById("filterAll")?.addEventListener("click", () => {
  currentFilter = "all";
  renderTable();
});

document.getElementById("filterUpcoming")?.addEventListener("click", () => {
  currentFilter = "future";
  renderTable();
});

document.getElementById("filterPast")?.addEventListener("click", () => {
  currentFilter = "past";
  renderTable();
});

// ======================================================================
// PRINT
// ======================================================================
document.getElementById("printBtn")?.addEventListener("click", () => {
  window.print();
});

// ======================================================================
// EDIT-MODE KNOP
// ======================================================================
document.getElementById("editModeBtn")?.addEventListener("click", () => {
  toggleEditMode();
});

// ======================================================================
// FAB + MODAL
// ======================================================================
const fab = document.getElementById("fabAddOpkomst");
const modal = document.getElementById("opkomstModal");
const form = document.getElementById("opkomstForm");

const f_date = document.getElementById("newDate");
const f_start = document.getElementById("newStart");
const f_end = document.getElementById("newEnd");
const f_type = document.getElementById("newType");
const f_loc = document.getElementById("newLocatie");
const f_thema = document.getElementById("newThema");
const f_mat = document.getElementById("newMateriaal");

fab?.addEventListener("click", () => {
  if (!isLeiding()) return alert("Alleen leiding kan opkomsten toevoegen.");
  modal.showModal();
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isLeiding()) return;

  if (!f_date.value) {
    alert("Datum is verplicht.");
    return;
  }

  const newRef = push(ref(db, `${speltak}/opkomsten`));

  const nieuw = {
    id: newRef.key,
    datum: isoFromInput(f_date.value),
    starttijd: f_start.value || "10:30",
    eindtijd: f_end.value || "12:30",
    typeOpkomst: f_type.value || "normaal",
    thema: f_thema.value?.trim() || "",
    locatie: f_loc.value || "",
    materiaal: f_mat.value?.trim() || "",
    aanwezigheid: {}
  };

  jeugd.forEach(j => nieuw.aanwezigheid[j.id] = "onbekend");
  leiding.forEach(l => nieuw.aanwezigheid[`leiding-${l.id}`] = "onbekend");

  await set(newRef, nieuw);

  modal.close();
  form.reset();
  loadData();
});

// ======================================================================
// INIT
// ======================================================================
setMode(mode);
loadData();
