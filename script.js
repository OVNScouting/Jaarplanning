// ======================================================================
// script.js — Centraal script voor OVN Jaarplanning / Aanwezigheid
// Universeel voor alle speltakken
// ======================================================================

import {
  sanitizeText,
  todayISO,
  isPast,
  isFutureOrToday,
  compareDateTime
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
// FIREBASE INIT & SPELTAK CONFIG
// ======================================================================

const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// speltak afgeleid van bestandsnaam (bevers.html → "bevers")
const speltak = window.location.pathname
  .split("/")
  .pop()
  .replace(".html", "")
  .toLowerCase();

// configuratie per speltak, gezet in de HTML
const config = window.speltakConfig || {
  showBert: false,
  showLeiding: true
};

// ======================================================================
// DOM ELEMENTS
// ======================================================================

// Info
const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");
const colorPicker = document.getElementById("colorPicker");
const toolbarButtons = document.querySelectorAll("#infoEditorToolbar button");

// Tabel
const headerRowTop = document.getElementById("headerRowTop");
const tableBody = document.getElementById("tableBody");
const addOpkomstRow = document.getElementById("addOpkomstRow");

// Knoppen / filters
const editModeButton = document.getElementById("editModeButton");
const printButton = document.getElementById("printButton");
const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");
const handleidingButton = document.getElementById("handleidingButton");

// Ledenbeheer
const ledenbeheerSection = document.getElementById("ledenbeheerSection");
const ledenbeheerJeugd = document.getElementById("ledenbeheerJeugd");
const ledenbeheerLeiding = document.getElementById("ledenbeheerLeiding");
const addMemberButton = document.getElementById("addMemberButton");

// Meldingen
const meldingenSection = document.getElementById("meldingenSection");
const meldingLeidingAan = document.getElementById("meldingLeidingAan");
const meldingOnbekendAan = document.getElementById("meldingOnbekendAan");
const leidingDrempel = document.getElementById("leidingDrempel");

// Modals — leden
const memberModal = document.getElementById("addMemberModal");
const memberType = document.getElementById("memberType");
const memberName = document.getElementById("memberName");
const saveMember = document.getElementById("saveMember");
const cancelMember = document.getElementById("cancelMember");

// Modals — opkomst
const opModal = document.getElementById("addOpkomstModal");
const opDatum = document.getElementById("opDatum");
const opStart = document.getElementById("opStart");
const opEind = document.getElementById("opEind");
const opThema = document.getElementById("opThema");
const opLocatie = document.getElementById("opLocatie");
const opType = document.getElementById("opType");
const saveOpkomst = document.getElementById("saveOpkomst");
const cancelOpkomst = document.getElementById("cancelOpkomst");

// ======================================================================
// STATE
// ======================================================================

let data = {};
let opkomsten = [];
let jeugd = [];
let leiding = [];

let currentFilter = "all";
let mode = localStorage.getItem("mode") || "ouder";

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
    editModeButton.textContent = newMode === "bewerken" ? "Opslaan" : "Bewerken";
  }

  if (handleidingButton) {
    handleidingButton.classList.toggle("hidden", !isLeiding());
  }

  if (addOpkomstRow) {
    addOpkomstRow.classList.toggle("hidden", !isBewerken());
  }

  if (addMemberButton) {
    addMemberButton.classList.toggle("hidden", !isBewerken());
  }

  if (infoEditorWrapper) {
    infoEditorWrapper.classList.toggle("hidden", !isBewerken());
  }

  // Ledenbeheer + meldingen alleen zichtbaar voor leiding / bewerken
  if (ledenbeheerSection) {
    ledenbeheerSection.classList.toggle("hidden", !isLeiding());
  }
  if (meldingenSection) {
    meldingenSection.classList.toggle("hidden", !isLeiding());
  }

  // Locatie kolommen direct updaten
  styleLocationColumn();
}

// ======================================================================
// DATA LADEN
// ======================================================================

async function loadEverything() {
  try {
    const snap = await get(ref(db, speltak));
    data = snap.val() || {};

    // Opkomsten
    opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({
      id,
      ...v
    }));

    // sorteer: eerst toekomst/heden, daarna verleden; binnen groep op datum+tijd
    opkomsten.sort((a, b) => {
      const aPast = isPast(a.datum);
      const bPast = isPast(b.datum);
      if (aPast !== bPast) {
        return aPast ? 1 : -1; // toekomst boven, verleden onder
      }
      return compareDateTime(a, b);
    });

    // Jeugdleden
    jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({
      id,
      naam: v.naam || "",
      hidden: !!v.hidden,
      volgorde:
        typeof v.volgorde === "number"
          ? v.volgorde
          : 999
    }));

    // Leiding
    leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
      id,
      naam: v.naam || "",
      hidden: !!v.hidden,
      volgorde:
        typeof v.volgorde === "number"
          ? v.volgorde
          : 999
    }));

    renderEverything();
  } catch (err) {
    console.error("Fout bij laden data:", err);
  }
}

// ======================================================================
// RENDER EVERYTHING
// ======================================================================

function renderEverything() {
  loadInfo();
  renderTable();
  renderLedenbeheer();
  renderMeldingen();
}

// ======================================================================
// INFO BLOK
// ======================================================================

function loadInfo() {
  if (!infoTekst) return;
  const txt = data.infotekst || "";
  infoTekst.innerHTML = txt;
  if (isBewerken() && infoEdit) {
    infoEdit.innerHTML = txt;
  }
}

function saveInfo() {
  if (!infoEdit) return;
  const txt = sanitizeText(infoEdit.innerHTML);
  update(ref(db, speltak), { infotekst: txt });
}

// ======================================================================
// TABEL
// ======================================================================

function renderTable() {
  if (!headerRowTop || !tableBody) return;

  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  const jRender = jeugd.slice().sort((a, b) => a.volgorde - b.volgorde);
  const lRender = config.showLeiding
    ? leiding.slice().sort((a, b) => a.volgorde - b.volgorde)
    : [];

  // Header
  addHeaders(jRender, lRender);

  // Rijen
  opkomsten
    .filter((o) => {
      if (currentFilter === "future") return isFutureOrToday(o.datum);
      if (currentFilter === "past") return isPast(o.datum);
      return true;
    })
    .forEach((o) => addRow(o, jRender, lRender));

  styleLocationColumn();
}

function addHeaders(jRender, lRender) {
  // volgorde kolommen:
  // [del] [Datum] [Start] [Eind] [Thema] [Bert?] [Locatie] [split?] [Jeugdleden] [Leiding?] [Telling]

  // delete
  const thDel = document.createElement("th");
  thDel.textContent = "";
  headerRowTop.appendChild(thDel);

  // vaste kolommen
  const fixed = ["Datum", "Start", "Eind", "Thema"];
  fixed.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRowTop.appendChild(th);
  });

  if (config.showBert) {
    const thBert = document.createElement("th");
    thBert.textContent = "Met Bert";
    headerRowTop.appendChild(thBert);
  }

  const thLoc = document.createElement("th");
  thLoc.textContent = "Locatie";
  thLoc.classList.add("col-locatie");
  headerRowTop.appendChild(thLoc);

  // Splitter + leden
  if (config.showLeiding) {
    const thSplit = document.createElement("th");
    thSplit.className = "col-split";
    thSplit.textContent = "";
    headerRowTop.appendChild(thSplit);
  }

  // Jeugdleden
  jRender.forEach((j) => {
    const th = document.createElement("th");
    if (j.hidden) th.classList.add("hidden");
    th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
    headerRowTop.appendChild(th);
  });

  // Leiding
  if (config.showLeiding) {
    lRender.forEach((l) => {
      const th = document.createElement("th");
      if (l.hidden) th.classList.add("hidden");
      th.innerHTML = `<div class="name-vertical">${l.naam}</div>`;
      headerRowTop.appendChild(th);
    });
  }

  const thCount = document.createElement("th");
  thCount.textContent = "Aanw.";
  thCount.classList.add("aanw-count");
  headerRowTop.appendChild(thCount);
}

function addRow(o, jRender, lRender) {
  const tr = document.createElement("tr");

  // status-styling
  if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
  if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
  if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");
  if (isPast(o.datum)) tr.classList.add("row-grey");
  if (o.datum === todayISO()) tr.classList.add("row-next");

  // delete
  const delTd = document.createElement("td");
  if (isBewerken()) {
    delTd.textContent = "🗑️";
    delTd.style.cursor = "pointer";
    delTd.addEventListener("click", () => {
      if (confirm("Deze opkomst verwijderen?")) {
        set(ref(db, `${speltak}/opkomsten/${o.id}`), null);
        loadEverything();
      }
    });
  }
  tr.appendChild(delTd);

  // datum / tijd / thema
  tr.appendChild(makeEditableCell(o, "datum", "date"));
  tr.appendChild(makeTimeCell(o, "starttijd"));
  tr.appendChild(makeTimeCell(o, "eindtijd"));
  tr.appendChild(makeEditableCell(o, "thema", "text"));

  // Bert (alleen bevers)
  if (config.showBert) {
    tr.appendChild(makeEditableCell(o, "bert_met", "text"));
  }

  // Locatie
  const locCell = makeEditableCell(o, "locatie", "text");
  locCell.classList.add("col-locatie");
  tr.appendChild(locCell);

  // splitter
  if (config.showLeiding) {
    const split = document.createElement("td");
    split.className = "col-split";
    tr.appendChild(split);
  }

  // Aanwezigheid jeugd
  jRender.forEach((j) => {
    tr.appendChild(makePresenceCell(o, j.id, j.hidden));
  });

  // Aanwezigheid leiding (optioneel)
  if (config.showLeiding) {
    lRender.forEach((l) => {
      tr.appendChild(makePresenceCell(o, `leiding-${l.id}`, l.hidden));
    });
  }

  // telling
  const [cntJ, cntL] = countPresence(o);
  const countTd = document.createElement("td");
  countTd.className = "aanw-count";
  countTd.textContent = config.showLeiding ? `${cntJ} / ${cntL}` : `${cntJ}`;
  tr.appendChild(countTd);

  tableBody.appendChild(tr);
}

function makeEditableCell(o, field, type) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";

  if (!isBewerken()) return td;

  if (type === "date") {
    td.style.cursor = "pointer";
    td.addEventListener("click", () => {
      const nieuw = prompt("Nieuwe datum (YYYY-MM-DD):", o[field] || "");
      if (nieuw) {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: nieuw });
        loadEverything();
      }
    });
  } else {
    td.contentEditable = true;
    td.addEventListener("blur", () => {
      const nieuw = td.textContent.trim();
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: nieuw });
    });
  }

  return td;
}

function makeTimeCell(o, field) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";
  if (o.starttijd !== "10:30" || o.eindtijd !== "12:30") {
    td.classList.add("tijd-afwijkend");
  }

  if (!isBewerken()) return td;

  td.style.cursor = "pointer";
  td.addEventListener("click", () => {
    const nieuw = prompt(`Nieuwe tijd (${field})`, o[field] || "");
    if (nieuw) {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: nieuw });
      loadEverything();
    }
  });

  return td;
}

function makePresenceCell(o, key, hidden) {
  const td = document.createElement("td");
  if (hidden) td.classList.add("hidden");

  const cur = (o.aanwezigheid && o.aanwezigheid[key]) || "onbekend";
  let symbol = "?";
  let cls = "presence-cell";

  if (cur === "aanwezig") {
    symbol = "✔";
    cls += " presence-aanwezig";
  } else if (cur === "afwezig") {
    symbol = "✖";
    cls += " presence-afwezig";
  } else {
    symbol = "?";
    cls += " presence-onbekend";
  }

  td.textContent = symbol;
  td.className = cls;

  if (isBewerken()) {
    td.style.cursor = "pointer";
    td.addEventListener("click", () => {
      const next =
        cur === "aanwezig"
          ? "afwezig"
          : cur === "afwezig"
          ? "onbekend"
          : "aanwezig";

      update(ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid`), {
        [key]: next
      });
      loadEverything();
    });
  }

  return td;
}

function countPresence(o) {
  let j = 0;
  let l = 0;

  if (!o.aanwezigheid) return [0, 0];

  jeugd.forEach((m) => {
    if (!m.hidden && o.aanwezigheid[m.id] === "aanwezig") j++;
  });

  if (config.showLeiding) {
    leiding.forEach((m) => {
      const key = `leiding-${m.id}`;
      if (!m.hidden && o.aanwezigheid[key] === "aanwezig") l++;
    });
  }

  return [j, l];
}

function styleLocationColumn() {
  const locCells = document.querySelectorAll(".col-locatie");
  locCells.forEach((c) => {
    c.classList.toggle("hidden", !isLeiding());
  });
}

// ======================================================================
// LEDENBEHEER
// ======================================================================

function renderLedenbeheer() {
  if (!ledenbeheerSection) return;

  if (!isLeiding()) {
    ledenbeheerSection.classList.add("hidden");
    return;
  }
  ledenbeheerSection.classList.remove("hidden");

  ledenbeheerJeugd.innerHTML = "";
  ledenbeheerLeiding.innerHTML = "";

  const jRender = jeugd.slice().sort((a, b) => a.volgorde - b.volgorde);
  const lRender = leiding.slice().sort((a, b) => a.volgorde - b.volgorde);

  jRender.forEach((j) => {
    ledenbeheerJeugd.appendChild(makeMemberRow(j, "jeugd"));
  });

  lRender.forEach((l) => {
    ledenbeheerLeiding.appendChild(makeMemberRow(l, "leiding"));
  });
}

function makeMemberRow(obj, type) {
  const li = document.createElement("li");
  if (obj.hidden) li.classList.add("lid-verborgen");

  li.innerHTML = `
    <span>${obj.naam}</span>
    <div class="ledenbeheer-controls">
      <button class="ledenbeheer-btn" data-act="up">↑</button>
      <button class="ledenbeheer-btn" data-act="down">↓</button>
      <button class="ledenbeheer-btn" data-act="toggle">${obj.hidden ? "👁️" : "🙈"}</button>
      <button class="ledenbeheer-btn" data-act="del">🗑️</button>
    </div>
  `;

  li.querySelectorAll(".ledenbeheer-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleMemberAction(obj, type, btn.dataset.act)
    );
  });

  return li;
}

function handleMemberAction(obj, type, action) {
  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const baseRef = ref(db, `${speltak}/${path}/${obj.id}`);

  if (action === "del") {
    if (!confirm(`Verwijder ${obj.naam}?`)) return;
    set(baseRef, null);
    loadEverything();
    return;
  }

  if (action === "up") {
    obj.volgorde = Math.max(0, obj.volgorde - 1);
  } else if (action === "down") {
    obj.volgorde = obj.volgorde + 1;
  } else if (action === "toggle") {
    obj.hidden = !obj.hidden;
  }

  const updates = {
    naam: obj.naam,
    hidden: obj.hidden,
    volgorde: obj.volgorde
  };
  update(baseRef, updates);
  loadEverything();
}

// ======================================================================
// MELDINGEN (basis: instellingen opslaan/laden, nog geen logica)
// ======================================================================

function renderMeldingen() {
  if (!meldingenSection) return;

  if (!isLeiding()) {
    meldingenSection.classList.add("hidden");
    return;
  }
  meldingenSection.classList.remove("hidden");

  if (meldingLeidingAan) {
    meldingLeidingAan.checked = !!data.meldingLeidingAan;
  }
  if (meldingOnbekendAan) {
    meldingOnbekendAan.checked = !!data.meldingOnbekendAan;
  }
  if (leidingDrempel) {
    leidingDrempel.value =
      typeof data.leidingDrempel === "number" ? data.leidingDrempel : 2;
  }
}

// settings opslaan
function saveMeldingen() {
  const payload = {};
  if (meldingLeidingAan)
    payload.meldingLeidingAan = !!meldingLeidingAan.checked;
  if (meldingOnbekendAan)
    payload.meldingOnbekendAan = !!meldingOnbekendAan.checked;
  if (leidingDrempel)
    payload.leidingDrempel = Number(leidingDrempel.value || 2);

  update(ref(db, speltak), payload);
}

// ======================================================================
// MODALS — EVENTS
// ======================================================================

// Lid toevoegen
if (addMemberButton && memberModal) {
  addMemberButton.addEventListener("click", () => {
    memberName.value = "";
    memberType.value = "jeugd";
    memberModal.classList.remove("hidden");
  });
}

if (cancelMember && memberModal) {
  cancelMember.addEventListener("click", () => {
    memberModal.classList.add("hidden");
  });
}

if (saveMember && memberModal) {
  saveMember.addEventListener("click", () => {
    const naam = memberName.value.trim();
    if (!naam) {
      alert("Naam is verplicht.");
      return;
    }

    const type = memberType.value;
    const path = type === "jeugd" ? "jeugdleden" : "leiding";

    const newRef = push(ref(db, `${speltak}/${path}`));
    const obj = {
      naam,
      hidden: false,
      volgorde: 999
    };

    set(newRef, obj);
    memberModal.classList.add("hidden");
    loadEverything();
  });
}

// Opkomst toevoegen
if (addOpkomstRow && opModal) {
  addOpkomstRow.addEventListener("click", () => {
    opDatum.value = "";
    opStart.value = "10:30";
    opEind.value = "12:30";
    opThema.value = "";
    opLocatie.value = "";
    opType.value = "";

    opModal.classList.remove("hidden");
  });
}

if (cancelOpkomst && opModal) {
  cancelOpkomst.addEventListener("click", () => {
    opModal.classList.add("hidden");
  });
}

if (saveOpkomst && opModal) {
  saveOpkomst.addEventListener("click", () => {
    const datum = opDatum.value;
    if (!datum) {
      alert("Datum is verplicht.");
      return;
    }

    const newRef = push(ref(db, `${speltak}/opkomsten`));

    const newObj = {
      id: newRef.key,
      datum,
      thema: opThema.value,
      typeOpkomst: opType.value,
      starttijd: opStart.value || "10:30",
      eindtijd: opEind.value || "12:30",
      locatie: opLocatie.value,
      aanwezigheid: {}
    };

    if (config.showBert) {
      newObj.bert_met = "";
    }

    // standaard alles op "onbekend"
    jeugd.forEach((j) => {
      newObj.aanwezigheid[j.id] = "onbekend";
    });
    if (config.showLeiding) {
      leiding.forEach((l) => {
        newObj.aanwezigheid[`leiding-${l.id}`] = "onbekend";
      });
    }

    set(newRef, newObj);
    opModal.classList.add("hidden");
    loadEverything();
  });
}

// ======================================================================
// FILTERS, PRINT, EDIT-MODE, WYSIWYG, MELDINGEN-EVENTS
// ======================================================================

// Filters
if (filterAll) {
  filterAll.addEventListener("click", () => {
    currentFilter = "all";
    filterAll.classList.add("active");
    filterFuture?.classList.remove("active");
    filterPast?.classList.remove("active");
    renderTable();
  });
}
if (filterFuture) {
  filterFuture.addEventListener("click", () => {
    currentFilter = "future";
    filterFuture.classList.add("active");
    filterAll?.classList.remove("active");
    filterPast?.classList.remove("active");
    renderTable();
  });
}
if (filterPast) {
  filterPast.addEventListener("click", () => {
    currentFilter = "past";
    filterPast.classList.add("active");
    filterAll?.classList.remove("active");
    filterFuture?.classList.remove("active");
    renderTable();
  });
}

// Print
if (printButton) {
  printButton.addEventListener("click", () => window.print());
}

// Bewerken / Opslaan
if (editModeButton) {
  editModeButton.addEventListener("click", () => {
    if (mode === "ouder") {
      alert("Log eerst in als leiding om te kunnen bewerken.");
      return;
    }
    if (mode === "leiding") {
      setMode("bewerken");
      renderEverything();
    } else if (mode === "bewerken") {
      saveInfo();
      setMode("leiding");
      renderEverything();
    }
  });
}

// WYSIWYG
toolbarButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    if (!cmd) return;
    document.execCommand(cmd, false, null);
    infoEdit?.focus();
  });
});

if (colorPicker) {
  colorPicker.addEventListener("change", () => {
    document.execCommand("foreColor", false, colorPicker.value);
    infoEdit?.focus();
  });
}

// Meldingen events
if (meldingLeidingAan) {
  meldingLeidingAan.addEventListener("change", saveMeldingen);
}
if (meldingOnbekendAan) {
  meldingOnbekendAan.addEventListener("change", saveMeldingen);
}
if (leidingDrempel) {
  leidingDrempel.addEventListener("input", saveMeldingen);
}

// ======================================================================
// INIT
// ======================================================================

setMode(mode);
loadEverything();
