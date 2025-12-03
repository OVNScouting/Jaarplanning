// ======================================================================
// script.js – Compacte volledige versie (alle functionaliteit behouden)
// ======================================================================

import {
  sanitizeText,
  isPast,
  isFutureOrToday,
  compareDateTime,
  formatDateDisplay,
  isoFromInput
} from "./utils.js";

import {
  initializeApp,
  getDatabase,
  ref,
  get,
  push,
  set,
  update
} from "./firebase-imports.js";

// ======================================================================
// FIREBASE INIT
// ======================================================================
const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);
const speltak = location.pathname.split("/").pop().replace(".html", "").toLowerCase();
const config = window.speltakConfig || { showBert: false, showLeiding: true };

// ======================================================================
// DOM ELEMENTS
// ======================================================================
const infoTekst = q("#infotekst");
const infoEdit = q("#infotekst_edit");
const infoEditorWrapper = q("#infoEditorWrapper");
const infoEditButton = q("#infoEditButton");
const headerRowTop = q("#headerRowTop");
const tableBody = q("#tableBody");
const editModeButton = q("#editModeButton");
const handleidingButton = q("#handleidingButton");
const addOpkomstRow = q("#addOpkomstRow");
const printButton = q("#printButton");
const fabAddOpkomst = q("#fabAddOpkomst");
const openLedenbeheerButton = q("#openLedenbeheerButton");
const openMeldingenButton = q("#openMeldingenButton");
const ledenbeheerSection = q("#ledenbeheerSection");
const meldingenSection = q("#meldingenSection");
const ledenbeheerJeugd = q("#ledenbeheerJeugd");
const ledenbeheerLeiding = q("#ledenbeheerLeiding");
const addMemberButton = q("#addMemberButton");
const floatingHeader = q("#floatingHeader");
const logoutButton = q("#logoutButton");

// Modals
const memberModal = q("#addMemberModal");
const memberType = q("#memberType");
const memberName = q("#memberName");
const saveMember = q("#saveMember");
const cancelMember = q("#cancelMember");

const opModal = q("#addOpkomstModal");
const opDatum = q("#opDatum");
const opStart = q("#opStart");
const opEind = q("#opEind");
const opThema = q("#opThema");
const opLocatie = q("#opLocatie");
const opType = q("#opType");
const saveOpkomst = q("#saveOpkomst");
const cancelOpkomst = q("#cancelOpkomst");

// Filters
const filterAll = q("#filterAll");
const filterFuture = q("#filterFuture");
const filterPast = q("#filterPast");

// Meldingen
const meldingLeidingAan = q("#meldingLeidingAan");
const meldingOnbekendAan = q("#meldingOnbekendAan");
const leidingDrempel = q("#leidingDrempel");

// State
let data = {};
let opkomsten = [];
let jeugd = [];
let leiding = [];
let nextUpcomingId = null;
let currentFilter = "all";
let infoEditActive = false;
let mode = localStorage.getItem("mode") || "ouder";

// ======================================================================
// HELPERS
// ======================================================================
function q(s) { return document.querySelector(s); }
function qa(s) { return [...document.querySelectorAll(s)]; }
function isLeiding() { return mode === "leiding" || mode === "bewerken"; }
function isBewerken() { return mode === "bewerken"; }

// ======================================================================
// MODE SWITCH
// ======================================================================
function setMode(m) {
  mode = m;
  localStorage.setItem("mode", m);

  qa(".only-leiding").forEach(el => el.classList.toggle("hidden", !isLeiding()));
  addOpkomstRow?.classList.toggle("hidden", !isBewerken());
  addMemberButton?.classList.toggle("hidden", !isLeiding());
  document.body.classList.toggle("edit-active", isBewerken());

  editModeButton.textContent = isBewerken() ? "Opslaan tabel" : "✏️ Tabel bewerken";

  renderEverything();
}

// ======================================================================
// DATA LOADING
// ======================================================================
async function loadEverything() {
  const snap = await get(ref(db, speltak));
  data = snap.val() || {};

  opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({ id, ...v }));
  opkomsten.sort((a, b) => {
    if (isPast(a.datum) !== isPast(b.datum)) return isPast(a.datum) ? 1 : -1;
    return compareDateTime(a, b);
  });

  nextUpcomingId = opkomsten.find(o => !isPast(o.datum))?.id || null;

  jeugd = mapMembers(data.jeugdleden);
  leiding = mapMembers(data.leiding);

  renderEverything();
}

function mapMembers(obj) {
  return Object.entries(obj || {}).map(([id, v]) => ({
    id,
    naam: v.naam,
    hidden: v.hidden,
    volgorde: v.volgorde ?? 999
  })).sort((a, b) => a.volgorde - b.volgorde);
}

// ======================================================================
// RENDER EVERYTHING
// ======================================================================
function renderEverything() {
  renderInfo();
  renderTable();
  renderLedenbeheer();
  renderMeldingen();
}

// ======================================================================
// INFO BLOK
// ======================================================================
function renderInfo() {
  infoTekst.innerHTML = data.infotekst || "";
  infoEdit.innerHTML = data.infotekst || "";
}

infoEditButton?.addEventListener("click", () => {
  if (!isLeiding()) return;

  infoEditActive = !infoEditActive;
  infoEditorWrapper.classList.toggle("hidden", !infoEditActive);
  infoTekst.classList.toggle("hidden", infoEditActive);
  infoEditButton.textContent = infoEditActive ? "Opslaan" : "✏️ Info";

  if (!infoEditActive) {
    update(ref(db, speltak), { infotekst: sanitizeText(infoEdit.innerHTML) })
      .then(() => location.reload());
  }
});

// ======================================================================
// TABELBUILD
// ======================================================================
function renderTable() {
  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  buildHeader();
  opkomsten.filter(filterFn).forEach(addRow);
}

function filterFn(o) {
  if (currentFilter === "future") return isFutureOrToday(o.datum);
  if (currentFilter === "past") return isPast(o.datum);
  return true;
}

function buildHeader() {
  const tr = headerRowTop;

  addTH(tr, ""); // delete
  addTH(tr, "Datum", "col-datum");
  addTH(tr, "Start");
  addTH(tr, "Eind");
  addTH(tr, "Type");
  addTH(tr, "Thema");
  if (config.showBert) addTH(tr, "Bert logeert bij");
  addTH(tr, "Locatie", "col-locatie");
  addTH(tr, "Materiaal", "col-materiaal");

  // Tellers
  addTH(tr, "Aanw. jeugd");
  if (config.showLeiding) addTH(tr, "Aanw. leiding");

  if (config.showLeiding) addTH(tr, "", "col-split");

  jeugd.forEach(j => addTH(tr, j.naam, j.hidden ? "hidden" : ""));
  if (config.showLeiding) leiding.forEach(l => addTH(tr, l.naam, l.hidden ? "hidden col-leiding" : "col-leiding"));
}

function addTH(tr, text, cls = "") {
  const th = document.createElement("th");
  th.innerHTML = `<div class="name-vertical">${text}</div>`;
  cls && th.classList.add(...cls.split(" "));
  tr.appendChild(th);
}

function addRow(o) {
  const tr = document.createElement("tr");

  applyTypeColor(tr, o);

  // delete
  const del = td("");
  if (isBewerken()) {
    del.textContent = "🗑️";
    del.classList.add("editable-cell");
    del.onclick = () =>
      confirm("Verwijderen?") &&
      set(ref(db, `${speltak}/opkomsten/${o.id}`), null).then(loadEverything);
  }
  tr.appendChild(del);

  // datum
  tr.appendChild(dateCell(o));

  // start/eind
  tr.appendChild(timeCell(o, "starttijd"));
  tr.appendChild(timeCell(o, "eindtijd"));

  // inline dropdowns
  tr.appendChild(typeDropdown(o));
  tr.appendChild(textCell(o, "thema"));

  if (config.showBert) tr.appendChild(textCell(o, "bert_met"));
  tr.appendChild(locationDropdown(o));
  tr.appendChild(textCell(o, "materiaal"));

  // Tellers
  const [cj, cl] = countPresence(o);
  tr.appendChild(td(cj));
  if (config.showLeiding) tr.appendChild(td(cl));

  if (config.showLeiding) tr.appendChild(td("", "col-split"));

  // jeugd
  jeugd.forEach(j => tr.appendChild(presCell(o, j.id, j.hidden, false)));

  // leiding
  if (config.showLeiding)
    leiding.forEach(l => tr.appendChild(presCell(o, "leiding-" + l.id, l.hidden, true)));

  tableBody.appendChild(tr);
}

// ======================================================================
// TABLE CELL HELPERS
// ======================================================================
function td(text, cls = "") {
  const td = document.createElement("td");
  td.textContent = text;
  cls && td.classList.add(...cls.split(" "));
  return td;
}

function dateCell(o) {
  const cell = td(formatDateDisplay(o.datum), "col-datum");
  if (!isBewerken()) return cell;

  cell.classList.add("editable-cell");
  cell.onclick = () => {
    const inp = inlineInput("date", o.datum);
    cell.innerHTML = "";
    cell.appendChild(inp);
    inp.focus();
    inp.onblur = () => {
      inp.value &&
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { datum: inp.value })
          .then(loadEverything);
    };
  };
  return cell;
}

function timeCell(o, field) {
  const cell = td(o[field]);
  if (o.starttijd !== "10:30" || o.eindtijd !== "12:30") cell.classList.add("tijd-afwijkend");

  if (!isBewerken()) return cell;

  cell.classList.add("editable-cell");
  cell.onclick = () => {
    const inp = inlineInput("time", o[field]);
    cell.innerHTML = "";
    cell.appendChild(inp);
    inp.focus();
    inp.onblur = () => {
      inp.value &&
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: inp.value })
          .then(loadEverything);
    };
  };

  return cell;
}

function inlineInput(type, val) {
  const inp = document.createElement("input");
  inp.type = type;
  inp.value = val;
  inp.className = "inline-edit";
  return inp;
}

// TYPE DROPDOWN
function typeDropdown(o) {
  const cell = td(o.typeOpkomst || "");
  if (!isBewerken()) return cell;

  cell.onclick = () => {
    const s = dropdown(["Normaal", "Bijzonder", "Kamp", "Geen opkomst"], o.typeOpkomst);
    cell.innerHTML = "";
    cell.appendChild(s);
    s.focus();
    s.onchange = () =>
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { typeOpkomst: s.value })
        .then(loadEverything);
    s.onblur = () => loadEverything();
  };

  return cell;
}

// LOCATIE DROPDOWN
function locationDropdown(o) {
  const cell = td(o.locatie || "", "col-locatie");
  if (!isLeiding()) return cell;
  if (!isBewerken()) return cell;

  cell.onclick = () => {
    const opts = [
      "Kampvuurkuil", "Zandveld", "Grasveld", "De Hoop",
      "Bever Lokaal", "Welpen Lokaal", "Van Terrein Af", "Externe Locatie"
    ];
    const s = dropdown(opts, o.locatie);
    cell.innerHTML = "";
    cell.appendChild(s);
    s.focus();
    s.onchange = () =>
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { locatie: s.value })
        .then(loadEverything);
    s.onblur = () => loadEverything();
  };

  return cell;
}

function dropdown(options, selected) {
  const s = document.createElement("select");
  options.forEach(o => {
    const op = document.createElement("option");
    op.value = op.textContent = o;
    if (o === selected) op.selected = true;
    s.appendChild(op);
  });
  return s;
}

function textCell(o, field) {
  const cell = td(o[field] || "");
  if (!isBewerken()) return cell;
  cell.classList.add("editable-cell");
  cell.contentEditable = true;
  cell.onblur = () =>
    update(ref(db, `${speltak}/opkomsten/${o.id}`), {
      [field]: cell.textContent.trim()
    });
  return cell;
}

// ======================================================================
// AANWEZIGHEID
// ======================================================================
function presCell(o, key, hidden, leidingCell) {
  const td = document.createElement("td");
  if (hidden) td.classList.add("hidden");
  if (leidingCell) td.classList.add("col-leiding");

  const cur = o.aanwezigheid?.[key] || "onbekend";
  const sym = { aanwezig: "✔", afwezig: "✖", onbekend: "?" };
  td.textContent = sym[cur];
  td.classList.add("presence-cell");

  if (!leidingCell || isLeiding()) {
    td.classList.add("editable-cell");
    td.onclick = () => togglePres(o, key);
  }

  if (cur === "aanwezig") td.classList.add("presence-aanwezig");
  if (cur === "afwezig") td.classList.add("presence-afwezig");
  if (cur === "onbekend") td.classList.add("presence-reminder");

  return td;
}

function togglePres(o, key) {
  const cur = o.aanwezigheid?.[key] || "onbekend";
  const next = cur === "aanwezig" ? "afwezig" :
    cur === "afwezig" ? "onbekend" : "aanwezig";

  update(ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid`), {
    [key]: next
  }).then(loadEverything);
}

function countPresence(o) {
  let cj = 0, cl = 0;
  jeugd.forEach(j => !j.hidden && o.aanwezigheid?.[j.id] === "aanwezig" && cj++);
  leiding.forEach(l => !l.hidden && o.aanwezigheid?.[`leiding-${l.id}`] === "aanwezig" && cl++);
  return [cj, cl];
}

// ======================================================================
// TYPE-KLEUR
// ======================================================================
function applyTypeColor(tr, o) {
  if (o.typeOpkomst === "Geen opkomst") tr.classList.add("row-geenopkomst");
  if (o.typeOpkomst === "Bijzonder") tr.classList.add("row-bijzonder");
  if (o.typeOpkomst === "Kamp") tr.classList.add("row-kamp");
  if (isPast(o.datum)) tr.classList.add("row-grey");
  if (o.id === nextUpcomingId) tr.classList.add("row-next");
}

// ======================================================================
// LEDENBEHEER
// ======================================================================
function renderLedenbeheer() {
  ledenbeheerJeugd.innerHTML = "";
  ledenbeheerLeiding.innerHTML = "";

  jeugd.forEach(j => ledenbeheerJeugd.appendChild(memberRow(j, "jeugd")));
  leiding.forEach(l => ledenbeheerLeiding.appendChild(memberRow(l, "leiding")));
}

function memberRow(obj, type) {
  const li = document.createElement("li");
  if (obj.hidden) li.classList.add("lid-verborgen");

  li.innerHTML = `
    <span>${obj.hidden ? "🚫" : "✅"} ${obj.naam}</span>
    <div class="ledenbeheer-controls">
      <button data-act="up">↑</button>
      <button data-act="down">↓</button>
      <button data-act="toggle">${obj.hidden ? "Toon" : "Verberg"}</button>
      <button data-act="del">🗑️</button>
    </div>`;

  li.querySelectorAll("button").forEach(b =>
    b.onclick = () => memberAction(obj, type, b.dataset.act)
  );
  return li;
}

function memberAction(obj, type, act) {
  if (!isLeiding()) return;
  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const base = ref(db, `${speltak}/${path}/${obj.id}`);

  if (act === "del") {
    confirm("Verwijderen?") && set(base, null).then(loadEverything);
    return;
  }

  if (act === "toggle") obj.hidden = !obj.hidden;
  if (act === "up") obj.volgorde--;
  if (act === "down") obj.volgorde++;

  update(base, obj).then(loadEverything);
}

// ======================================================================
// MELDINGEN
// ======================================================================
function renderMeldingen() {
  meldingLeidingAan.checked = !!data.meldingLeidingAan;
  meldingOnbekendAan.checked = !!data.meldingOnbekendAan;
  leidingDrempel.value = data.leidingDrempel ?? 2;
}

[meldingLeidingAan, meldingOnbekendAan, leidingDrempel].forEach(el =>
  el?.addEventListener("change", () =>
    update(ref(db, speltak), {
      meldingLeidingAan: meldingLeidingAan.checked,
      meldingOnbekendAan: meldingOnbekendAan.checked,
      leidingDrempel: Number(leidingDrempel.value)
    })
  )
);

// ======================================================================
// MODALS & OPNIEUW
// ======================================================================
addMemberButton?.addEventListener("click", () => {
  if (!isLeiding()) return;
  memberModal.classList.remove("hidden");
});

cancelMember.onclick = () => memberModal.classList.add("hidden");

saveMember.onclick = () => {
  if (!isLeiding()) return;

  const naam = memberName.value.trim();
  if (!naam) return alert("Naam vereist");

  const type = memberType.value;
  const newRef = push(ref(db, `${speltak}/${type === "jeugd" ? "jeugdleden" : "leiding"}`));

  set(newRef, { naam, hidden: false, volgorde: 999 }).then(() => {
    memberModal.classList.add("hidden");
    loadEverything();
  });
};

// Nieuwe opkomst
fabAddOpkomst.onclick = () => isLeiding() && opModal.classList.remove("hidden");
cancelOpkomst.onclick = () => opModal.classList.add("hidden");

saveOpkomst.onclick = () => {
  if (!isLeiding()) return;
  if (!opDatum.value) return alert("Datum verplicht");

  const newRef = push(ref(db, `${speltak}/opkomsten`));

  const o = {
    id: newRef.key,
    datum: isoFromInput(opDatum.value),
    starttijd: opStart.value,
    eindtijd: opEind.value,
    thema: opThema.value,
    locatie: opLocatie.value,
    typeOpkomst: opType.value,
    materiaal: "",
    aanwezigheid: {}
  };

  jeugd.forEach(j => o.aanwezigheid[j.id] = "onbekend");
  leiding.forEach(l => o.aanwezigheid[`leiding-${l.id}`] = "onbekend");

  if (config.showBert) o.bert_met = "";

  set(newRef, o).then(() => {
    opModal.classList.add("hidden");
    loadEverything();
  });
};

// ======================================================================
// FILTERS
// ======================================================================
filterAll.onclick = () => { currentFilter = "all"; setActive(filterAll); };
filterFuture.onclick = () => { currentFilter = "future"; setActive(filterFuture); };
filterPast.onclick = () => { currentFilter = "past"; setActive(filterPast); };

function setActive(el) {
  [filterAll, filterFuture, filterPast].forEach(f => f.classList.remove("active"));
  el.classList.add("active");
  renderTable();
}

// ======================================================================
// EDIT MODE
// ======================================================================
editModeButton.onclick = () => {
  if (!isLeiding() && !isBewerken()) return alert("Alleen leiding kan bewerken.");
  setMode(isBewerken() ? "leiding" : "bewerken");
};

// ======================================================================
// SECTION OPEN / CLOSE
// ======================================================================
openLedenbeheerButton.onclick = () => {
  if (!isLeiding()) return;
  ledenbeheerSection.classList.remove("hidden");
  ledenbeheerSection.scrollIntoView({ behavior: "smooth" });
};

openMeldingenButton.onclick = () => {
  if (!isLeiding()) return;
  meldingenSection.classList.remove("hidden");
  meldingenSection.scrollIntoView({ behavior: "smooth" });
};

qa(".close-section").forEach(btn =>
  btn.onclick = () =>
    q(`#${btn.dataset.target}`).classList.add("hidden")
);

// ======================================================================
// FLOATING HEADER (UX C)
// ======================================================================
document.addEventListener("scroll", () => {
  const rect = tableBody.getBoundingClientRect();
  if (rect.top < 0 && rect.bottom > 100) {
    floatingHeader.classList.remove("hidden");
    const leftCell = document.elementFromPoint(150, 130);
    if (leftCell) floatingHeader.textContent = leftCell.closest("td,th")?.innerText || "";
  } else {
    floatingHeader.classList.add("hidden");
  }
});

// ======================================================================
// LOGOUT
// ======================================================================
logoutButton.onclick = () => {
  localStorage.setItem("mode", "ouder");
  location.reload();
};

// ======================================================================
// INIT
// ======================================================================
setMode(mode);
loadEverything();
