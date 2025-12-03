// ======================================================================
// script.js — Centraal script voor OVN Jaarplanning / Aanwezigheid
// ======================================================================

import {
  sanitizeText,
  todayISO,
  isPast,
  isFutureOrToday,
  dateToNumber,
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
} from "./firebase-imports.js"; // via bevers.html, wordt doorgegeven

// ======================================================================
// INIT FIREBASE
// ======================================================================
const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// Speltak is altijd afgeleid van bestandsnaam
// (bijv. bevers.html → 'bevers')
const speltak = window.location.pathname
  .split("/")
  .pop()
  .replace(".html", "")
  .toLowerCase();

// ======================================================================
// DOM ELEMENTS
// ======================================================================

// Info
const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");

// Tabel
const headerRowTop = document.getElementById("headerRowTop");
const tableBody = document.getElementById("tableBody");
const addOpkomstRow = document.getElementById("addOpkomstRow");

// Knoppen
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
const leidingDrempel = document.getElementById("leidingDrempel");
const meldingOnbekendAan = document.getElementById("meldingOnbekendAan");

// Member modal
const memberModal = document.getElementById("addMemberModal");
const memberType = document.getElementById("memberType");
const memberName = document.getElementById("memberName");
const saveMember = document.getElementById("saveMember");
const cancelMember = document.getElementById("cancelMember");

// Opkomst modal
const opModal = document.getElementById("addOpkomstModal");
const opDatum = document.getElementById("opDatum");
const opStart = document.getElementById("opStart");
const opEind = document.getElementById("opEind");
const opThema = document.getElementById("opThema");
const opLocatie = document.getElementById("opLocatie");
const opType = document.getElementById("opType");
const saveOpkomst = document.getElementById("saveOpkomst");
const cancelOpkomst = document.getElementById("cancelOpkomst");

// WYSIWYG toolbar
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
let mode = localStorage.getItem("mode") || "ouder"; // ouder / leiding / bewerken

// ======================================================================
// MODE LOGIC
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

  // Bewerkknop tekst
  if (editModeButton) {
    editModeButton.textContent =
      newMode === "bewerken" ? "Opslaan" : "Bewerken";
  }

  // Handleiding alleen zichtbaar in leiding-modus
  if (handleidingButton) {
    handleidingButton.classList.toggle("hidden", !isLeiding());
  }

  // Add-knoppen alleen in bewerkmodus
  addOpkomstRow.classList.toggle("hidden", !isBewerken());
  addMemberButton.classList.toggle("hidden", !isBewerken());

  // Info-editor
  infoEditorWrapper.classList.toggle("hidden", !isBewerken());

  renderEverything();
}

// ======================================================================
// FETCH DATA
// ======================================================================
async function loadEverything() {
  const snap = await get(ref(db, speltak));
  data = snap.val() || {};

  opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({
    id,
    ...v
  }));

  jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({
    id,
    ...v
  }));

  leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
    id,
    ...v
  }));

  // sorteer op datum en tijd
  opkomsten.sort(compareDateTime);

  renderEverything();
}

// ======================================================================
// RENDER EVERYTHING
// ======================================================================
function renderEverything() {
  loadInfo();
  applyFilter();
  renderLedenbeheer();
  renderTable();
  updateMeldingenUI();
}

// ======================================================================
// INFO BLOK
// ======================================================================
function loadInfo() {
  const txt = data.infotekst || "";
  infoTekst.innerHTML = txt;

  if (isBewerken()) {
    infoEdit.innerHTML = txt;
  }
}

function saveInfo() {
  const txt = sanitizeText(infoEdit.innerHTML);
  update(ref(db, `${speltak}`), { infotekst: txt });
}

// ======================================================================
// FILTERS
// ======================================================================
function applyFilter() {
  filterAll.classList.toggle("active", currentFilter === "all");
  filterFuture.classList.toggle("active", currentFilter === "future");
  filterPast.classList.toggle("active", currentFilter === "past");
}

// ======================================================================
// LEDENBEHEER
// ======================================================================
function renderLedenbeheer() {
  ledenbeheerSection.classList.toggle("hidden", !isLeiding());

  if (!isLeiding()) return;

  ledenbeheerJeugd.innerHTML = "";
  ledenbeheerLeiding.innerHTML = "";

  jeugd
    .sort((a, b) => a.volgorde - b.volgorde)
    .forEach((j) => ledenbeheerJeugd.appendChild(makeMemberRow(j, "jeugd")));

  leiding
    .sort((a, b) => a.volgorde - b.volgorde)
    .forEach((l) => ledenbeheerLeiding.appendChild(makeMemberRow(l, "leiding")));
}

function makeMemberRow(obj, type) {
  const li = document.createElement("li");
  li.classList.toggle("lid-verborgen", obj.hidden);

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
    btn.addEventListener("click", () => handleMemberAction(obj, type, btn.dataset.act));
  });

  return li;
}

function handleMemberAction(obj, type, action) {
  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const refBase = ref(db, `${speltak}/${path}/${obj.id}`);

  if (action === "up") {
    obj.volgorde = Math.max(0, obj.volgorde - 1);
  }
  if (action === "down") {
    obj.volgorde += 1;
  }
  if (action === "toggle") {
    obj.hidden = !obj.hidden;
  }
  if (action === "del") {
    if (confirm(`Verwijder ${obj.naam}?`)) {
      update(refBase, null);
      loadEverything();
      return;
    }
  }

  update(refBase, obj);
  loadEverything();
}

// ======================================================================
// TABEL
// ======================================================================
function renderTable() {
  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  // Welke leden tonen?
  const jRender = jeugd; // altijd tonen (maar verborgen leden verbergen we met CSS)
  const lRender = leiding;

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

// Headers (vertical)
function addVerticalHeaders(jRender, lRender) {
  // Verwijder oude header eerst
  headerRowTop.innerHTML = "";

  // lege cel voor delete-kolom
  const first = document.createElement("th");
  headerRowTop.appendChild(first);

  jRender.forEach((j) => {
    const th = document.createElement("th");
    th.className = j.hidden ? "hidden" : "";
    th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
    headerRowTop.appendChild(th);
  });

  // split
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

// Render row
function addRow(o, jRender, lRender) {
  const tr = document.createElement("tr");

  // opkomst type styling
  if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
  if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
  if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");
  if (isPast(o.datum)) tr.classList.add("row-grey");
  if (o.datum === todayISO()) tr.classList.add("row-next");

  // delete cel (alleen in bewerken)
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

  // Datum
  tr.appendChild(makeEditableCell(o, "datum", "date"));

  // Tijd
  tr.appendChild(makeTimeCell(o, "starttijd"));
  tr.appendChild(makeTimeCell(o, "eindtijd"));

  // Thema
  tr.appendChild(makeEditableCell(o, "thema", "text"));

  // Locatie
  const locCell = makeEditableCell(o, "locatie", "text");
  locCell.classList.add("col-locatie");
  tr.appendChild(locCell);

  // Splitter
  const split = document.createElement("td");
  split.className = "col-split";
  tr.appendChild(split);

  // Aanwezigheid jeugd
  jRender.forEach((j) => {
    const c = makePresenceCell(o, j.id, j.hidden);
    tr.appendChild(c);
  });

  // Aanwezigheid leiding
  lRender.forEach((l) => {
    const c = makePresenceCell(o, "leiding-" + l.id, l.hidden);
    tr.appendChild(c);
  });

  // tellen
  const [cntJ, cntL] = countPresence(o);

  const countTd = document.createElement("td");
  countTd.className = "aanw-count";
  countTd.textContent = `${cntJ} / ${cntL}`;
  tr.appendChild(countTd);

  tableBody.appendChild(tr);
}

// Aanwezigheid
function makePresenceCell(o, key, hidden) {
  const td = document.createElement("td");
  if (hidden) td.classList.add("hidden");

  const cur = o.aanwezigheid?.[key] || "onbekend";

  const map = {
    aanwezig: "✔",
    afwezig: "✖",
    onbekend: "?"
  };
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

      update(
        ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid/${key}`),
        next
      );
      loadEverything();
    };
  }

  return td;
}

// Tellen (verborgen tellen niet mee)
function countPresence(o) {
  let j = 0,
    l = 0;

  jeugd.forEach((x) => {
    if (!x.hidden && o.aanwezigheid?.[x.id] === "aanwezig") j++;
  });
  leiding.forEach((x) => {
    const key = "leiding-" + x.id;
    if (!x.hidden && o.aanwezigheid?.[key] === "aanwezig") l++;
  });

  return [j, l];
}

// Editable tekstcellen
function makeEditableCell(o, field, inputType) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";

  if (isBewerken()) {
    td.contentEditable = inputType === "text";
    if (inputType === "date") {
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
        update(ref(db, `${speltak}/opkomsten/${o.id}`), {
          [field]: v
        });
      };
    }
  }

  return td;
}

// Tijdcellen
function makeTimeCell(o, field) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";

  if (o.starttijd !== "10:30" || o.eindtijd !== "12:30") {
    td.classList.add("tijd-afwijkend");
  }

  if (isBewerken()) {
    td.onclick = () => {
      const v = prompt(`Nieuwe tijd voor ${field}`, o[field]);
      if (v) {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: v });
        loadEverything();
      }
    };
  }

  return td;
}

// Locatie zichtbaar alleen voor leiding
function styleLocationColumn() {
  const locCells = document.querySelectorAll(".col-locatie");
  locCells.forEach((c) =>
    c.classList.toggle("hidden", !isLeiding())
  );
}

// ======================================================================
// MODALS
// ======================================================================

// Lid toevoegen
addMemberButton.addEventListener("click", () => {
  memberName.value = "";
  memberType.value = "jeugd";
  memberModal.classList.remove("hidden");
});
cancelMember.addEventListener("click", () => memberModal.classList.add("hidden"));

saveMember.addEventListener("click", () => {
  const naam = memberName.value.trim();
  if (!naam) return alert("Naam verplicht.");

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

// Opkomst toevoegen
addOpkomstRow.addEventListener("click", () => {
  opDatum.value = "";
  opStart.value = "10:30";
  opEind.value = "12:30";
  opThema.value = "";
  opLocatie.value = "";
  opType.value = "";

  opModal.classList.remove("hidden");
});

cancelOpkomst.addEventListener("click", () =>
  opModal.classList.add("hidden")
);

saveOpkomst.addEventListener("click", () => {
  const datum = opDatum.value;
  if (!datum) return alert("Datum verplicht.");

  const refNew = push(ref(db, `${speltak}/opkomsten`));

  const newObj = {
    id: refNew.key,
    datum,
    thema: opThema.value,
    bijzonderheden: "",
    typeOpkomst: opType.value,
    starttijd: opStart.value,
    eindtijd: opEind.value,
    locatie: opLocatie.value,
    aanwezigheid: {}
  };

  jeugd.forEach((j) => (newObj.aanwezigheid[j.id] = "onbekend"));
  leiding.forEach(
    (l) => (newObj.aanwezigheid["leiding-" + l.id] = "onbekend")
  );

  set(refNew, newObj);
  opModal.classList.add("hidden");
  loadEverything();
});

// ======================================================================
// MELDINGEN
// ======================================================================
function updateMeldingenUI() {
  meldingenSection.classList.toggle("hidden", !isLeiding());

  if (!isLeiding()) return;

  meldingLeidingAan.checked = data.meldingLeidingAan || false;
  leidingDrempel.value = data.leidingDrempel || 2;
  meldingOnbekendAan.checked = data.meldingOnbekendAan || false;
}

meldingLeidingAan?.addEventListener("change", () => {
  update(ref(db, `${speltak}`), {
    meldingLeidingAan: meldingLeidingAan.checked
  });
});

leidingDrempel?.addEventListener("change", () => {
  update(ref(db, `${speltak}`), {
    leidingDrempel: Number(leidingDrempel.value)
  });
});

meldingOnbekendAan?.addEventListener("change", () => {
  update(ref(db, `${speltak}`), {
    meldingOnbekendAan: meldingOnbekendAan.checked
  });
});

// ======================================================================
// FILTER EVENTS
// ======================================================================
filterAll.addEventListener("click", () => {
  currentFilter = "all";
  renderEverything();
});
filterFuture.addEventListener("click", () => {
  currentFilter = "future";
  renderEverything();
});
filterPast.addEventListener("click", () => {
  currentFilter = "past";
  renderEverything();
});

// ======================================================================
// PRINT
// ======================================================================
printButton.addEventListener("click", () => window.print());

// ======================================================================
// BEWERKEN / OPSLAAN
// ======================================================================
editModeButton.addEventListener("click", () => {
  if (mode === "leiding") {
    // nu naar bewerken
    setMode("bewerken");
  } else if (mode === "bewerken") {
    // opslaan
    saveInfo();
    setMode("leiding");
  }
});

// ======================================================================
// WYSIWYG
// ======================================================================
toolbarButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    document.execCommand(cmd);
    infoEdit.focus();
  });
});

colorPicker.addEventListener("change", () => {
  document.execCommand("foreColor", false, colorPicker.value);
  infoEdit.focus();
});

// ======================================================================
// START
// ======================================================================
loadEverything();
