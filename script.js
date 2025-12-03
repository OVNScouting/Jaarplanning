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
// CONFIG & FIREBASE INIT
// ======================================================================
const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

const speltak = window.location.pathname
  .split("/")
  .pop()
  .replace(".html", "")
  .toLowerCase();

// Config per speltak (HTML definieert window.speltakConfig)
const config = window.speltakConfig || {
  showBert: false,
  showLeiding: true
};

// ======================================================================
// DOM ELEMENTS
// ======================================================================

const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");

const headerRowTop = document.getElementById("headerRowTop");
const tableBody = document.getElementById("tableBody");
const addOpkomstRow = document.getElementById("addOpkomstRow");

const editModeButton = document.getElementById("editModeButton");
const printButton = document.getElementById("printButton");
const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");
const handleidingButton = document.getElementById("handleidingButton");

const ledenbeheerSection = document.getElementById("ledenbeheerSection");
const ledenbeheerJeugd = document.getElementById("ledenbeheerJeugd");
const ledenbeheerLeiding = document.getElementById("ledenbeheerLeiding");
const addMemberButton = document.getElementById("addMemberButton");

const memberModal = document.getElementById("addMemberModal");
const memberType = document.getElementById("memberType");
const memberName = document.getElementById("memberName");
const saveMember = document.getElementById("saveMember");
const cancelMember = document.getElementById("cancelMember");

const opModal = document.getElementById("addOpkomstModal");
const opDatum = document.getElementById("opDatum");
const opStart = document.getElementById("opStart");
const opEind = document.getElementById("opEind");
const opThema = document.getElementById("opThema");
const opLocatie = document.getElementById("opLocatie");
const opType = document.getElementById("opType");
const saveOpkomst = document.getElementById("saveOpkomst");
const cancelOpkomst = document.getElementById("cancelOpkomst");

const colorPicker = document.getElementById("colorPicker");
const toolbarButtons = document.querySelectorAll("#infoEditorToolbar button");

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
// MODE FUNCTIONS
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

  editModeButton.textContent = newMode === "bewerken" ? "Opslaan" : "Bewerken";
  handleidingButton?.classList.toggle("hidden", !isLeiding());
  addOpkomstRow.classList.toggle("hidden", !isBewerken());
  addMemberButton.classList.toggle("hidden", !isBewerken());
  infoEditorWrapper.classList.toggle("hidden", !isBewerken());

  renderEverything();
}

// ======================================================================
// LOAD DATA
// ======================================================================
async function loadEverything() {
  const snap = await get(ref(db, speltak));
  data = snap.val() || {};

  opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({
    id,
    ...v
  }));
  jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({ id, ...v }));
  leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({ id, ...v }));

  opkomsten.sort(compareDateTime);
  renderEverything();
}

// ======================================================================
// RENDER EVERYTHING
// ======================================================================
function renderEverything() {
  loadInfo();
  renderTable();
  renderLedenbeheer();
}

// ======================================================================
// INFO
// ======================================================================
function loadInfo() {
  const txt = data.infotekst || "";
  infoTekst.innerHTML = txt;
  if (isBewerken()) infoEdit.innerHTML = txt;
}

function saveInfo() {
  const txt = sanitizeText(infoEdit.innerHTML);
  update(ref(db, `${speltak}`), { infotekst: txt });
}

// ======================================================================
// TABLE RENDER
// ======================================================================
function renderTable() {
  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  const jRender = jeugd;
  const lRender = config.showLeiding ? leiding : [];

  opkomsten
    .filter((o) => {
      if (currentFilter === "future") return isFutureOrToday(o.datum);
      if (currentFilter === "past") return isPast(o.datum);
      return true;
    })
    .forEach((o) => addRow(o, jRender, lRender));

  addVerticalHeaders(jRender, lRender);
  styleLocationColumn();
}

// Headers
function addVerticalHeaders(jRender, lRender) {
  headerRowTop.innerHTML = "";

  const first = document.createElement("th");
  headerRowTop.appendChild(first);

  jRender.forEach((j) => {
    const th = document.createElement("th");
    th.className = j.hidden ? "hidden" : "";
    th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
    headerRowTop.appendChild(th);
  });

  if (config.showLeiding) {
    const split = document.createElement("th");
    split.className = "col-split";
    headerRowTop.appendChild(split);

    lRender.forEach((l) => {
      const th = document.createElement("th");
      th.className = l.hidden ? "hidden" : "";
      th.innerHTML = `<div class="name-vertical">${l.naam}</div>`;
      headerRowTop.appendChild(th);
    });
  }
}

// Row render
function addRow(o, jRender, lRender) {
  const tr = document.createElement("tr");

  // Styling per opkomst
  if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
  if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
  if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");
  if (isPast(o.datum)) tr.classList.add("row-grey");
  if (o.datum === todayISO()) tr.classList.add("row-next");

  // Delete knop
  const delTd = document.createElement("td");
  if (isBewerken()) {
    delTd.textContent = "🗑️";
    delTd.style.cursor = "pointer";
    delTd.onclick = () => {
      if (confirm("Opkomst verwijderen?")) {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), null);
        loadEverything();
      }
    };
  }
  tr.appendChild(delTd);

  // Datum, tijd, thema
  tr.appendChild(makeEditableCell(o, "datum", "date"));
  tr.appendChild(makeTimeCell(o, "starttijd"));
  tr.appendChild(makeTimeCell(o, "eindtijd"));
  tr.appendChild(makeEditableCell(o, "thema", "text"));

  // Bert (alleen bij Bevers)
  if (config.showBert) {
    tr.appendChild(makeEditableCell(o, "bert_met", "text"));
  }

  // Locatie
  const locCell = makeEditableCell(o, "locatie", "text");
  locCell.classList.add("col-locatie");
  tr.appendChild(locCell);

  // Split + leiding
  if (config.showLeiding) {
    const split = document.createElement("td");
    split.className = "col-split";
    tr.appendChild(split);

    jRender.forEach((j) => tr.appendChild(makePresenceCell(o, j.id, j.hidden)));
    lRender.forEach((l) =>
      tr.appendChild(makePresenceCell(o, "leiding-" + l.id, l.hidden))
    );
  } else {
    jRender.forEach((j) => tr.appendChild(makePresenceCell(o, j.id, j.hidden)));
  }

  // telling
  const [cntJ, cntL] = countPresence(o);
  const countTd = document.createElement("td");
  countTd.className = "aanw-count";
  countTd.textContent = config.showLeiding ? `${cntJ} / ${cntL}` : `${cntJ}`;
  tr.appendChild(countTd);

  tableBody.appendChild(tr);
}

// Aanwezigheid
function makePresenceCell(o, key, hidden) {
  const td = document.createElement("td");
  if (hidden) td.classList.add("hidden");
  const cur = o.aanwezigheid?.[key] || "onbekend";
  const map = { aanwezig: "✔", afwezig: "✖", onbekend: "?" };
  td.textContent = map[cur];
  if (isBewerken()) {
    td.style.cursor = "pointer";
    td.onclick = () => {
      const next =
        cur === "aanwezig"
          ? "afwezig"
          : cur === "afwezig"
          ? "onbekend"
          : "aanwezig";
      update(ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid/${key}`), next);
      loadEverything();
    };
  }
  return td;
}

// Telling
function countPresence(o) {
  let j = 0,
    l = 0;
  jeugd.forEach((x) => {
    if (!x.hidden && o.aanwezigheid?.[x.id] === "aanwezig") j++;
  });
  if (config.showLeiding) {
    leiding.forEach((x) => {
      const key = "leiding-" + x.id;
      if (!x.hidden && o.aanwezigheid?.[key] === "aanwezig") l++;
    });
  }
  return [j, l];
}

// Time cells
function makeTimeCell(o, field) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";
  if (o.starttijd !== "10:30" || o.eindtijd !== "12:30") {
    td.classList.add("tijd-afwijkend");
  }
  if (isBewerken()) {
    td.onclick = () => {
      const v = prompt(`Nieuwe tijd (${field})`, o[field]);
      if (v) {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: v });
        loadEverything();
      }
    };
  }
  return td;
}

// Editable cells
function makeEditableCell(o, field, type) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";
  if (isBewerken()) {
    td.contentEditable = type === "text";
    if (type === "date") {
      td.onclick = () => {
        const v = prompt("Nieuwe datum (YYYY-MM-DD):", o[field]);
        if (v) {
          update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: v });
          loadEverything();
        }
      };
    } else {
      td.onblur = () => {
        const v = td.textContent.trim();
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: v });
      };
    }
  }
  return td;
}

// Locatie voor leiding
function styleLocationColumn() {
  document.querySelectorAll(".col-locatie").forEach((c) =>
    c.classList.toggle("hidden", !isLeiding())
  );
}

// ======================================================================
// MODALS
// ======================================================================
addMemberButton?.addEventListener("click", () => {
  memberName.value = "";
  memberType.value = "jeugd";
  memberModal.classList.remove("hidden");
});
cancelMember?.addEventListener("click", () => memberModal.classList.add("hidden"));
saveMember?.addEventListener("click", () => {
  const naam = memberName.value.trim();
  if (!naam) return alert("Naam verplicht");
  const type = memberType.value;
  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const newRef = push(ref(db, `${speltak}/${path}`));
  set(newRef, { naam, hidden: false, volgorde: 999 });
  memberModal.classList.add("hidden");
  loadEverything();
});

addOpkomstRow?.addEventListener("click", () => {
  opDatum.value = "";
  opStart.value = "10:30";
  opEind.value = "12:30";
  opThema.value = "";
  opLocatie.value = "";
  opType.value = "";
  opModal.classList.remove("hidden");
});
cancelOpkomst?.addEventListener("click", () => opModal.classList.add("hidden"));
saveOpkomst?.addEventListener("click", () => {
  const datum = opDatum.value;
  if (!datum) return alert("Datum verplicht");
  const refNew = push(ref(db, `${speltak}/opkomsten`));
  const newObj = {
    id: refNew.key,
    datum,
    thema: opThema.value,
    typeOpkomst: opType.value,
    starttijd: opStart.value,
    eindtijd: opEind.value,
    locatie: opLocatie.value,
    bert_met: config.showBert ? "" : undefined,
    aanwezigheid: {}
  };
  jeugd.forEach((j) => (newObj.aanwezigheid[j.id] = "onbekend"));
  if (config.showLeiding) {
    leiding.forEach(
      (l) => (newObj.aanwezigheid["leiding-" + l.id] = "onbekend")
    );
  }
  set(refNew, newObj);
  opModal.classList.add("hidden");
  loadEverything();
});

// ======================================================================
// FILTERS, PRINT, MODES
// ======================================================================
filterAll?.addEventListener("click", () => { currentFilter = "all"; renderEverything(); });
filterFuture?.addEventListener("click", () => { currentFilter = "future"; renderEverything(); });
filterPast?.addEventListener("click", () => { currentFilter = "past"; renderEverything(); });
printButton?.addEventListener("click", () => window.print());
editModeButton?.addEventListener("click", () => {
  if (mode === "leiding") setMode("bewerken");
  else if (mode === "bewerken") { saveInfo(); setMode("leiding"); }
});

// ======================================================================
// WYSIWYG
// ======================================================================
toolbarButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    document.execCommand(btn.dataset.cmd);
    infoEdit.focus();
  });
});
colorPicker?.addEventListener("change", () => {
  document.execCommand("foreColor", false, colorPicker.value);
  infoEdit.focus();
});

// ======================================================================
loadEverything();
