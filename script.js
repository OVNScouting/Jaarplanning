// ======================================================================
// IMPORTS
// ======================================================================
import {
  sanitizeText,
  todayISO,
  isPast,
  isFutureOrToday,
  compareDateTime,
  formatDisplayDate, // juiste naam in utils.js
  isoFromInput       // alias die we toevoegen in utils.js
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
const speltak = window.location.pathname.split("/").pop().replace(".html", "");

// ======================================================================
// MODE SYSTEEM — ouder / leiding / edit
// ======================================================================
let mode = localStorage.getItem("mode") || "ouder"; // ouder is standaard
let editMode = false; // aparte boolean voor tabel-bewerken

function setMode(newMode) {
  mode = newMode;
  localStorage.setItem("mode", newMode);
  updateVisibility();
  renderTable(); // UI opnieuw tekenen
}

function isOuder() {
  return mode === "ouder";
}

function isLeiding() {
  return mode === "leiding";
}

function isEdit() {
  return isLeiding() && editMode;
}

function toggleEditMode() {
  if (!isLeiding()) return;
  editMode = !editMode;
  updateVisibility();
  renderTable();
}

// ======================================================================
// MODE-AFHANKELIJKE UI UPDATES
// ======================================================================
function updateVisibility() {
  document.querySelectorAll(".only-leiding").forEach(el => {
    el.classList.toggle("hide-ouder", !isLeiding());
  });

  document.querySelectorAll(".edit-only").forEach(el => {
    el.classList.toggle("hide-edit", !isEdit());
  });

  document.querySelectorAll(".view-hide").forEach(el => {
    el.classList.toggle("hide-view", isEdit());
  });
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
// MODE FUNCTIES
// ======================================================================
function isLeiding() {
  return mode === "leiding" || mode === "bewerken";
}

function isBewerken() {
  return mode === "bewerken";
}

function setMode(newMode) {
  mode = newMode;
  localStorage.setItem("mode", newMode);

  if (editModeButton) {
    editModeButton.textContent =
      newMode === "bewerken" ? "Opslaan tabel" : "✏️ Tabel bewerken";
  }

  if (handleidingButton) {
    handleidingButton.classList.toggle("hidden", !isLeiding());
  }

  addOpkomstRow?.classList.toggle("hidden", !isBewerken());
  addMemberButton?.classList.toggle("hidden", !isBewerken());

  document.body.classList.toggle("edit-active", isBewerken());

  renderEverything();
}

// ======================================================================
// DATA LADEN UIT FIREBASE
// ======================================================================
async function loadData() {
  const snap = await get(ref(db, speltak));
  data = snap.val() || {};

  // -------------------------------
  // Opkomsten inladen en sorteren
  // -------------------------------
  opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({
    id,
    ...v
  }));

  // Sorteer: toekomst/heden eerst, verleden erna
  opkomsten.sort((a, b) => {
    const aPast = isPast(a.datum);
    const bPast = isPast(b.datum);
    if (aPast !== bPast) return aPast ? 1 : -1;
    return compareDateTime(a, b);
  });

  // Eerstvolgende opkomst bepalen
  nextUpcomingId = null;
  for (const o of opkomsten) {
    if (!isPast(o.datum)) {
      nextUpcomingId = o.id;
      break;
    }
  }

  // -------------------------------
  // Jeugd + leiding
  // -------------------------------
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

  // -------------------------------
  // UI tekenen
  // -------------------------------
  renderTable();
  loadInfoBlock();
  renderLedenbeheer();
  renderMeldingen();
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
// TABEL — NIEUW SYSTEEM
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
// HEADERS — NIEUWE KOLOMMEN
// ======================================================================
function addHeaders() {
  const head = document.getElementById("tableHead");
  const tr = document.createElement("tr");

  // --------- 1. Verwijderen / bewerken ---------
  const thEmpty = document.createElement("th");
  thEmpty.textContent = isEdit() ? "🗑️" : "";
  tr.appendChild(thEmpty);

  // --------- 2. Datum ---------
  const thDatum = document.createElement("th");
  thDatum.textContent = "Datum";
  thDatum.classList.add("sticky-date");
  tr.appendChild(thDatum);

  // --------- 3. Starttijd ---------
  const thStart = document.createElement("th");
  thStart.textContent = "Start";
  tr.appendChild(thStart);

  // --------- 4. Eindtijd ---------
  const thEnd = document.createElement("th");
  thEnd.textContent = "Eind";
  tr.appendChild(thEnd);

  // --------- 5. Type opkomst (alleen in edit-modus) ---------
  if (isEdit()) {
    const thType = document.createElement("th");
    thType.textContent = "Type";
    tr.appendChild(thType);
  }

  // --------- 6. Thema ---------
  const thThema = document.createElement("th");
  thThema.textContent = "Thema";
  tr.appendChild(thThema);

  // --------- 7. Bert ---------
  if (!isOuder()) {
    const thBert = document.createElement("th");
    thBert.textContent = "Bert logeert bij";
    tr.appendChild(thBert);
  }

  // --------- 8. Locatie (alleen leiding) ---------
  if (!isOuder()) {
    const thLoc = document.createElement("th");
    thLoc.textContent = "Locatie";
    tr.appendChild(thLoc);
  }

  // --------- 9. Materiaal (alleen leiding) ---------
  if (!isOuder()) {
    const thMat = document.createElement("th");
    thMat.textContent = "Materiaal";
    tr.appendChild(thMat);
  }

  // --------- 10. Divider ---------
  const thDiv = document.createElement("th");
  thDiv.classList.add("col-divider");
  tr.appendChild(thDiv);

  // --------- 11. Jeugdleden ---------
  jeugd.forEach(j => {
    const th = document.createElement("th");
    th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
    if (j.hidden) th.classList.add("hidden");
    tr.appendChild(th);
  });

  // --------- 12. Leiding (alleen leiding-modus) ---------
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
// RIJ OPBOUW — NIEUWE STRUCTUUR
// ======================================================================
function addRow(o) {
  const body = document.getElementById("tableBody");
  const tr = document.createElement("tr");

  // ---------- Rijkleuren ----------
  tr.classList.add(`type-${o.typeOpkomst || "normaal"}`);
  if (isPast(o.datum)) tr.classList.add("row-grey");
  if (o.id === nextUpcomingId) tr.classList.add("row-next");

  // ---------- 1. Verwijderen ----------
  const tdDel = document.createElement("td");
  if (isEdit()) {
    tdDel.textContent = "🗑️";
    tdDel.classList.add("editable-cell");
    tdDel.addEventListener("click", () => {
      if (confirm("Opkomst verwijderen?")) {
        set(ref(db, `${speltak}/opkomsten/${o.id}`), null).then(loadData);
      }
    });
  }
  tr.appendChild(tdDel);

  // ---------- 2. Datum ----------
  const tdDatum = document.createElement("td");
  tdDatum.textContent = formatDisplayDate(o.datum);
  tdDatum.classList.add("sticky-date");
  if (isEdit()) tdDatum.addEventListener("click", () => editDate(o));
  tr.appendChild(tdDatum);

  // ---------- 3. Starttijd ----------
  tr.appendChild(makeTimeCellNew(o, "starttijd"));

  // ---------- 4. Eindtijd ----------
  tr.appendChild(makeTimeCellNew(o, "eindtijd"));

  // ---------- 5. Type (alleen edit-modus) ----------
  if (isEdit()) {
    const tdType = document.createElement("td");
    tdType.textContent = o.typeOpkomst;
    tdType.classList.add("editable-cell");
    tdType.addEventListener("click", () => editType(o));
    tr.appendChild(tdType);
  }

  // ---------- 6. Thema ----------
  const tdThema = document.createElement("td");
  tdThema.textContent = o.thema || "";
  if (isEdit()) {
    tdThema.classList.add("editable-cell");
    tdThema.addEventListener("click", () => editText(o, "thema"));
  }
  tr.appendChild(tdThema);

  // ---------- 7. Bert (leiding-modus) ----------
  if (!isOuder()) {
    const tdBert = document.createElement("td");
    tdBert.textContent = o.bert_met || "";
    if (isEdit()) tdBert.addEventListener("click", () => editText(o, "bert_met"));
    tr.appendChild(tdBert);
  }

  // ---------- 8. Locatie ----------
  if (!isOuder()) {
    const tdLoc = document.createElement("td");
    tdLoc.textContent = o.locatie || "";
    if (isEdit()) tdLoc.addEventListener("click", () => editLocatie(o));
    tr.appendChild(tdLoc);
  }

  // ---------- 9. Materiaal ----------
  if (!isOuder()) {
    const tdMat = document.createElement("td");
    tdMat.textContent = o.materiaal || "";
    if (isEdit()) tdMat.addEventListener("click", () => editText(o, "materiaal"));
    tr.appendChild(tdMat);
  }

  // ---------- 10. Divider ----------
  const tdDiv = document.createElement("td");
  tdDiv.classList.add("col-divider");
  tr.appendChild(tdDiv);

  // ---------- 11. Jeugd aanwezigheden ----------
  jeugd.forEach(j => {
    const td = makePresenceCellNew(o, j.id, j.hidden);
    tr.appendChild(td);
  });

  // ---------- 12. Leiding aanwezigheden ----------
  if (!isOuder()) {
    leiding.forEach(l => {
      const td = makePresenceCellNew(o, `leiding-${l.id}`, l.hidden);
      tr.appendChild(td);
    });
  }

  body.appendChild(tr);
}
// ======================================================================
// EDITING FUNCTIES — NIEUW SYSTEEM
// ======================================================================

// ------- Datum bewerken -------
function editDate(o) {
  const nieuw = prompt("Nieuwe datum:", o.datum);
  if (!nieuw) return;
  update(ref(db, `${speltak}/opkomsten/${o.id}`), {
    datum: isoFromInput(nieuw)
  }).then(loadData);
}

// ------- Tijd bewerken -------
function makeTimeCellNew(o, field) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";

  if (!isEdit()) return td;

  td.classList.add("editable-cell");
  td.addEventListener("click", () => {
    const nieuw = prompt(`Nieuwe ${field}:`, o[field] || "");
    if (!nieuw) return;
    update(ref(db, `${speltak}/opkomsten/${o.id}`), {
      [field]: nieuw
    }).then(loadData);
  });

  return td;
}

// ------- Thema, Bert, Materiaal -------
function editText(o, field) {
  const nieuw = prompt(`Nieuwe waarde voor ${field}:`, o[field] || "");
  if (nieuw === null) return;
  update(ref(db, `${speltak}/opkomsten/${o.id}`), {
    [field]: nieuw.trim()
  }).then(loadData);
}

// ------- Type bewerken (dropdown) -------
function editType(o) {
  const keuzes = ["normaal", "bijzonder", "kamp"];
  const nieuw = prompt(
    `Type opkomst (${keuzes.join(", ")}):`,
    o.typeOpkomst || "normaal"
  );
  if (!nieuw || !keuzes.includes(nieuw)) return;
  update(ref(db, `${speltak}/opkomsten/${o.id}`), {
    typeOpkomst: nieuw
  }).then(loadData);
}

// ------- Locatie bewerken -------
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

  const nieuw = prompt(`Kies locatie:\n${opcionesToList(opties)}`, o.locatie || "");
  if (!nieuw) return;

  update(ref(db, `${speltak}/opkomsten/${o.id}`), {
    locatie: nieuw
  }).then(loadData);
}

function opcionesToList(arr) {
  return arr.map(o => `• ${o}`).join("\n");
}

// ======================================================================
// AANWEZIGHEID — NIEUW SYSTEEM
// ======================================================================
function makePresenceCellNew(o, key, hidden) {
  const td = document.createElement("td");
  if (hidden) td.classList.add("hidden");

  const waarde = (o.aanwezigheid && o.aanwezigheid[key]) || "onbekend";

  const symbool = {
    aanwezig: "✔",
    afwezig: "✖",
    onbekend: "?"
  }[waarde];

  td.textContent = symbool;
  td.classList.add("presence-cell");

  if (waarde === "aanwezig") td.classList.add("aanwezig-groen");
  if (waarde === "afwezig") td.classList.add("aanwezig-rood");
  if (waarde === "onbekend") td.classList.add("aanwezig-onbekend");

  // Ouders mogen alleen jeugd togglen
  const isLeidingCel = key.startsWith("leiding-");
  if (isOuder() && isLeidingCel) return td;

  td.addEventListener("click", () => togglePresenceNew(o, key));

  return td;
}

function togglePresenceNew(o, key) {
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
// LEDENBEHEER
// ======================================================================
function renderLedenbeheer() {
  ledenbeheerJeugd.innerHTML = "";
  ledenbeheerLeiding.innerHTML = "";

  jeugd.forEach(j => ledenbeheerJeugd.appendChild(makeMemberRow(j, "jeugd")));
  leiding.forEach(l => ledenbeheerLeiding.appendChild(makeMemberRow(l, "leiding")));
}

function makeMemberRow(obj, type) {
  const li = document.createElement("li");
  if (obj.hidden) li.classList.add("lid-verborgen");

  const icon = obj.hidden ? "🚫" : "✅";

  li.innerHTML = `
    <span>${icon} ${obj.naam}</span>
    <div class="ledenbeheer-controls">
      <button data-act="up">↑</button>
      <button data-act="down">↓</button>
      <button data-act="toggle">${obj.hidden ? "Toon" : "Verberg"}</button>
      <button data-act="del">🗑️</button>
    </div>
  `;

  li.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () =>
      handleMemberAction(obj, type, b.dataset.act)
    )
  );

  return li;
}

function handleMemberAction(obj, type, act) {
  if (!isLeiding()) return alert("Alleen leiding kan leden beheren.");

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const baseRef = ref(db, `${speltak}/${path}/${obj.id}`);

  if (act === "del") {
    if (confirm(`Verwijder ${obj.naam}?`)) {
      set(baseRef, null).then(loadEverything);
    }
    return;
  }

  if (act === "toggle") obj.hidden = !obj.hidden;
  if (act === "up") obj.volgorde = (obj.volgorde || 999) - 1;
  if (act === "down") obj.volgorde = (obj.volgorde || 999) + 1;

  update(baseRef, obj).then(loadEverything);
}

// ======================================================================
// MELDINGEN
// ======================================================================
function renderMeldingen() {
  meldingLeidingAan.checked = !!data.meldingLeidingAan;
  meldingOnbekendAan.checked = !!data.meldingOnbekendAan;
  leidingDrempel.value =
    typeof data.leidingDrempel === "number" ? data.leidingDrempel : 2;
}

function saveMeldingen() {
  if (!isLeiding()) return;
  update(ref(db, speltak), {
    meldingLeidingAan: !!meldingLeidingAan.checked,
    meldingOnbekendAan: !!meldingOnbekendAan.checked,
    leidingDrempel: Number(leidingDrempel.value || 2)
  });
}

// ======================================================================
// SECTIES OPENEN & SLUITEN
// ======================================================================
function openSection(section) {
  if (!isLeiding()) return alert("Alleen leiding kan deze sectie openen.");
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });
}

openLedenbeheerButton?.addEventListener("click", () =>
  openSection(ledenbeheerSection)
);
openMeldingenButton?.addEventListener("click", () =>
  openSection(meldingenSection)
);

closeButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    if (target) {
      target.classList.add("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
});

// ======================================================================
// MODALS
// ======================================================================
addMemberButton?.addEventListener("click", () => {
  if (!isLeiding()) return alert("Alleen leiding kan leden toevoegen.");
  memberModal.classList.remove("hidden");
});

cancelMember?.addEventListener("click", () =>
  memberModal.classList.add("hidden")
);

saveMember?.addEventListener("click", () => {
  if (!isLeiding()) return;

  const naam = memberName.value.trim();
  if (!naam) return alert("Naam vereist");

  const path = memberType.value === "jeugd" ? "jeugdleden" : "leiding";
  const newRef = push(ref(db, `${speltak}/${path}`));

  set(newRef, { naam, hidden: false, volgorde: 999 }).then(() => {
    memberModal.classList.add("hidden");
    loadEverything();
  });
});

// ======================================================================
// FAB — NIEUWE OPKOMST POPUP
// ======================================================================
const fab = document.getElementById("fabAddOpkomst");
const modal = document.getElementById("opkomstModal");
const form = document.getElementById("opkomstForm");

// Inputvelden uit de modal
const f_date = document.getElementById("newDate");
const f_start = document.getElementById("newStart");
const f_end = document.getElementById("newEnd");
const f_type = document.getElementById("newType");
const f_loc = document.getElementById("newLocatie");
const f_thema = document.getElementById("newThema");
const f_mat = document.getElementById("newMateriaal");

// -------- FAB opent popup --------
fab?.addEventListener("click", () => {
  if (!isLeiding()) {
    alert("Alleen leiding kan opkomsten toevoegen.");
    return;
  }
  modal.showModal();
});

// -------- Popup sluiten --------
modal.addEventListener("cancel", (e) => {
  // voorkomt dat Esc key per ongeluk het dialog sluit zonder reset
  e.preventDefault();
  modal.close();
});

// -------- Opslaan nieuwe opkomst --------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isLeiding()) return;

  // ⛔ Validatie
  if (!f_date.value) {
    alert("Datum is verplicht.");
    return;
  }

  // Nieuwe Firebase key
  const newRef = push(ref(db, `${speltak}/opkomsten`));

  // Object opbouwen
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

  // Bert-veld alleen als jouw speltak-config dit toestaat
  if (data.showBert) nieuw.bert_met = "";

  // Aanwezigheid standaard voor jeugd + leiding
  jeugd.forEach(j => {
    nieuw.aanwezigheid[j.id] = "onbekend";
  });

  leiding.forEach(l => {
    nieuw.aanwezigheid[`leiding-${l.id}`] = "onbekend";
  });

  // Opslaan
  await set(newRef, nieuw);

  // Popup sluiten + velden reset
  modal.close();
  form.reset();

  // Data opnieuw laden
  loadData();
});
// ======================================================================
// INFO-BLOK — NIEUWE STRUCTUUR
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
// LEDENBEHEER — NIEUWE STRUCTUUR
// ======================================================================
function renderLedenbeheer() {
  // Deze HTML-secties bestaan nog in je site en blijven werken
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
  if (!document.getElementById("meldingLeidingAan")) return;

  meldingLeidingAan.checked = !!data.meldingLeidingAan;
  meldingOnbekendAan.checked = !!data.meldingOnbekendAan;
  leidingDrempel.value =
    typeof data.leidingDrempel === "number" ? data.leidingDrempel : 2;

  document
    .getElementById("meldingenSection")
    ?.classList.toggle("hide-ouder", !isLeiding());
}

function saveMeldingen() {
  if (!isLeiding()) return;

  update(ref(db, speltak), {
    meldingLeidingAan: !!meldingLeidingAan.checked,
    meldingOnbekendAan: !!meldingOnbekendAan.checked,
    leidingDrempel: Number(leidingDrempel.value)
  });
}

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
// EDIT-MODUS TOGGLE
// ======================================================================
document.getElementById("editModeBtn")?.addEventListener("click", () => {
  if (!isLeiding()) return alert("Alleen leiding kan bewerken.");
  toggleEditMode();
});

// ======================================================================
// INIT
// ======================================================================
setMode(mode);
loadData();
