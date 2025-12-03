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
// FIREBASE INIT
// ======================================================================
const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// Speltak afgeleid van bestandsnaam
const speltak = window.location.pathname.split("/").pop().replace(".html", "").toLowerCase();

// Config per speltak (uit HTML)
const config = window.speltakConfig || { showBert: false, showLeiding: true };

// ======================================================================
// DOM ELEMENTS
// ======================================================================

// Info
const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");
const infoEditButton = document.getElementById("infoEditButton");
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

// Sectie openers
const openLedenbeheerButton = document.getElementById("openLedenbeheerButton");
const openMeldingenButton = document.getElementById("openMeldingenButton");

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
let infoEditActive = false;

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

  if (addOpkomstRow) {
    addOpkomstRow.classList.toggle("hidden", !isBewerken());
  }

  if (addMemberButton) {
    addMemberButton.classList.toggle("hidden", !isBewerken());
  }

  document.body.classList.toggle("edit-active", isBewerken());

  renderEverything();
}

// ======================================================================
// DATA LADEN
// ======================================================================
async function loadEverything() {
  const snap = await get(ref(db, speltak));
  data = snap.val() || {};

  opkeningenOpbouwen();
  ledenOpbouwen();

  renderEverything();
}

function opkeningenOpbouwen() {
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
}

function ledenOpbouwen() {
  jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({
    id,
    volgorde: typeof v.volgorde === "number" ? v.volgorde : 999,
    hidden: !!v.hidden,
    naam: v.naam || ""
  }));

  leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
    id,
    volgorde: typeof v.volgorde === "number" ? v.volgorde : 999,
    hidden: !!v.hidden,
    naam: v.naam || ""
  }));

  jeugd.sort((a, b) => a.volgorde - b.volgorde);
  leiding.sort((a, b) => a.volgorde - b.volgorde);
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
  if (!infoTekst || !infoEdit) return;
  const txt = data.infotekst || "";
  infoTekst.innerHTML = txt;
  infoEdit.innerHTML = txt;
}

function toggleInfoEdit() {
  if (!isLeiding()) {
    alert("Alleen leiding kan info bewerken.");
    return;
  }

  infoEditActive = !infoEditActive;

  infoEditorWrapper.classList.toggle("hidden", !infoEditActive);
  infoTekst.classList.toggle("hidden", infoEditActive);

  if (infoEditButton) {
    infoEditButton.textContent = infoEditActive ? "Opslaan info" : "Info bewerken";
  }

  if (!infoEditActive) {
    const sanitized = sanitizeText(infoEdit.innerHTML);
    update(ref(db, speltak), { infotekst: sanitized }).then(() => {
      window.location.reload();
    });
  }
}

// ======================================================================
// TABEL
// ======================================================================
function renderTable() {
  if (!headerRowTop || !tableBody) return;

  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  const jRender = jeugd;
  const lRender = config.showLeiding ? leiding : [];

  addHeaders(jRender, lRender);

  opkomsten
    .filter(o => {
      if (currentFilter === "future") return isFutureOrToday(o.datum);
      if (currentFilter === "past") return isPast(o.datum);
      return true;
    })
    .forEach(o => addRow(o, jRender, lRender));
}

function addHeaders(jRender, lRender) {
  const tr = headerRowTop;

  // Delete kolom
  tr.appendChild(document.createElement("th"));

  // vaste kolommen
  const fixed = ["Datum", "Start", "Eind", "Thema"];
  fixed.forEach(label => {
    const th = document.createElement("th");
    th.textContent = label;
    tr.appendChild(th);
  });

  if (config.showBert) {
    const thBert = document.createElement("th");
    thBert.textContent = "Bert logeert bij";
    tr.appendChild(thBert);
  }

  const thLoc = document.createElement("th");
  thLoc.textContent = "Locatie";
  tr.appendChild(thLoc);

  const thMat = document.createElement("th");
  thMat.textContent = "Materiaal";
  tr.appendChild(thMat);

  if (config.showLeiding) {
    const split = document.createElement("th");
    split.className = "col-split";
    tr.appendChild(split);
  }

  jRender.forEach(j => {
    const th = document.createElement("th");
    if (j.hidden) th.classList.add("hidden");
    th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
    tr.appendChild(th);
  });

  if (config.showLeiding) {
    lRender.forEach(l => {
      const th = document.createElement("th");
      if (l.hidden) th.classList.add("hidden");
      th.classList.add("col-leiding");
      th.innerHTML = `<div class="name-vertical">${l.naam}</div>`;
      tr.appendChild(th);
    });
  }

  const thCount = document.createElement("th");
  thCount.textContent = "Aanw.";
  tr.appendChild(thCount);
}

function addRow(o, jRender, lRender) {
  const tr = document.createElement("tr");

  if (isPast(o.datum)) tr.classList.add("row-grey");
  if (o.datum === todayISO()) tr.classList.add("row-next");

  // Delete-knop
  const tdDel = document.createElement("td");
  if (isBewerken()) {
    tdDel.textContent = "🗑️";
    tdDel.classList.add("editable-cell");
    tdDel.addEventListener("click", () => {
      if (confirm("Deze opkomst verwijderen?")) {
        set(ref(db, `${speltak}/opkomsten/${o.id}`), null).then(loadEverything);
      }
    });
  }
  tr.appendChild(tdDel);

  // Vaste kolommen
  tr.appendChild(makeEditableCell(o, "datum", "date"));
  tr.appendChild(makeTimeCell(o, "starttijd"));
  tr.appendChild(makeTimeCell(o, "eindtijd"));
  tr.appendChild(makeEditableCell(o, "thema", "text"));

  if (config.showBert) {
    tr.appendChild(makeEditableCell(o, "bert_met", "text"));
  }

  // Locatie met simpel dropdown-prompt
  tr.appendChild(makeDropdownCell(o, "locatie", ["Clubhuis", "Bos", "Extern", "Overig"]));

  // Materiaal
  tr.appendChild(makeEditableCell(o, "materiaal", "text"));

  // Splitter
  if (config.showLeiding) {
    const tdSplit = document.createElement("td");
    tdSplit.className = "col-split";
    tr.appendChild(tdSplit);
  }

  // Aanwezigheid jeugd
  jRender.forEach(j => {
    tr.appendChild(makePresenceCell(o, j.id, j.hidden, false));
  });

  // Aanwezigheid leiding
  if (config.showLeiding) {
    lRender.forEach(l => {
      tr.appendChild(makePresenceCell(o, "leiding-" + l.id, l.hidden, true));
    });
  }

  // telling
  const [cntJ, cntL] = countPresence(o);
  const tdCount = document.createElement("td");
  tdCount.textContent = config.showLeiding ? `${cntJ} / ${cntL}` : `${cntJ}`;
  tr.appendChild(tdCount);

  tableBody.appendChild(tr);
}

function makeEditableCell(o, field, type) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";

  if (!isBewerken()) return td;

  td.classList.add("editable-cell");

  if (type === "date") {
    td.addEventListener("click", () => {
      const nieuw = prompt("Nieuwe datum (YYYY-MM-DD):", o[field] || "");
      if (nieuw) update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: nieuw });
    });
  } else {
    td.contentEditable = true;
    td.addEventListener("blur", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        [field]: td.textContent.trim()
      });
    });
  }

  return td;
}

function makeDropdownCell(o, field, opties) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";

  if (!isBewerken()) return td;

  td.classList.add("editable-cell");
  td.addEventListener("click", () => {
    const suggestion = opties.join(", ");
    const nieuw = prompt(`Nieuwe locatie (bijv. ${suggestion}):`, o[field] || "");
    if (nieuw !== null) {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: nieuw });
      td.textContent = nieuw;
    }
  });

  return td;
}

function makeTimeCell(o, field) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";

  if (o.starttijd !== "10:30" || o.eindtijd !== "12:30") {
    td.classList.add("tijd-afwijkend");
  }

  if (!isBewerken()) return td;

  td.classList.add("editable-cell");
  td.addEventListener("click", () => {
    const nieuw = prompt(`Nieuwe tijd (${field})`, o[field] || "");
    if (nieuw) {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: nieuw });
      td.textContent = nieuw;
    }
  });

  return td;
}

function makePresenceCell(o, key, hidden, isLeidingCell) {
  const td = document.createElement("td");
  if (hidden) td.classList.add("hidden");
  if (isLeidingCell) td.classList.add("col-leiding");

  const cur = (o.aanwezigheid && o.aanwezigheid[key]) || "onbekend";
  const map = { aanwezig: "✔", afwezig: "✖", onbekend: "?" };
  td.textContent = map[cur];
  td.classList.add("presence-cell");

  if (!isBewerken()) return td;

  td.classList.add("editable-cell");
  td.addEventListener("click", () => {
    const next =
      cur === "aanwezig" ? "afwezig" : cur === "afwezig" ? "onbekend" : "aanwezig";

    update(ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid`), { [key]: next }).then(
      loadEverything
    );
  });

  return td;
}

function countPresence(o) {
  let j = 0;
  let l = 0;

  jeugd.forEach(m => {
    if (!m.hidden && o.aanwezigheid?.[m.id] === "aanwezig") j++;
  });

  if (config.showLeiding) {
    leiding.forEach(m => {
      const key = `leiding-${m.id}`;
      if (!m.hidden && o.aanwezigheid?.[key] === "aanwezig") l++;
    });
  }

  return [j, l];
}

// ======================================================================
// LEDENBEHEER
// ======================================================================
function renderLedenbeheer() {
  if (!ledenbeheerJeugd || !ledenbeheerLeiding) return;

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

  li.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () =>
      handleMemberAction(obj, type, btn.dataset.act)
    );
  });

  return li;
}

function handleMemberAction(obj, type, act) {
  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const baseRef = ref(db, `${speltak}/${path}/${obj.id}`);

  if (act === "del") {
    if (!confirm(`Verwijder ${obj.naam}?`)) return;
    set(baseRef, null).then(loadEverything);
    return;
  }

  if (act === "toggle") obj.hidden = !obj.hidden;
  if (act === "up") obj.volgorde = (obj.volgorde || 999) - 1;
  if (act === "down") obj.volgorde = (obj.volgorde || 999) + 1;

  update(baseRef, {
    naam: obj.naam,
    hidden: obj.hidden,
    volgorde: obj.volgorde
  }).then(loadEverything);
}

// ======================================================================
// MELDINGEN
// ======================================================================
function renderMeldingen() {
  if (!meldingenSection) return;

  meldingLeidingAan.checked = !!data.meldingLeidingAan;
  meldingOnbekendAan.checked = !!data.meldingOnbekendAan;
  leidingDrempel.value =
    typeof data.leidingDrempel === "number" ? data.leidingDrempel : 2;
}

function saveMeldingen() {
  const payload = {
    meldingLeidingAan: !!meldingLeidingAan.checked,
    meldingOnbekendAan: !!meldingOnbekendAan.checked,
    leidingDrempel: Number(leidingDrempel.value || 2)
  };
  update(ref(db, speltak), payload);
}

// ======================================================================
// SECTIES OPENEN + SCROLLEN
// ======================================================================
function openSection(section) {
  if (!section) return;
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });
}

// ======================================================================
// MODALS
// ======================================================================

// Lid toevoegen
addMemberButton?.addEventListener("click", () => {
  if (!isLeiding()) {
    alert("Alleen leiding kan leden beheren.");
    return;
  }
  memberName.value = "";
  memberType.value = "jeugd";
  memberModal.classList.remove("hidden");
});

cancelMember?.addEventListener("click", () => {
  memberModal.classList.add("hidden");
});

saveMember?.addEventListener("click", () => {
  const naam = memberName.value.trim();
  if (!naam) return alert("Naam verplicht");

  const path = memberType.value === "jeugd" ? "jeugdleden" : "leiding";
  const newRef = push(ref(db, `${speltak}/${path}`));
  set(newRef, { naam, hidden: false, volgorde: 999 }).then(() => {
    memberModal.classList.add("hidden");
    loadEverything();
  });
});

// Opkomst toevoegen
addOpkomstRow?.addEventListener("click", () => {
  if (!isBewerken()) return;
  opDatum.value = "";
  opStart.value = "10:30";
  opEind.value = "12:30";
  opThema.value = "";
  opLocatie.value = "";
  opType.value = "";
  opModal.classList.remove("hidden");
});

cancelOpkomst?.addEventListener("click", () => {
  opModal.classList.add("hidden");
});

saveOpkomst?.addEventListener("click", () => {
  const datum = opDatum.value;
  if (!datum) return alert("Datum is verplicht");

  const newRef = push(ref(db, `${speltak}/opkomsten`));
  const newObj = {
    id: newRef.key,
    datum,
    thema: opThema.value,
    typeOpkomst: opType.value,
    starttijd: opStart.value || "10:30",
    eindtijd: opEind.value || "12:30",
    locatie: opLocatie.value,
    materiaal: "",
    aanwezigheid: {}
  };

  if (config.showBert) newObj.bert_met = "";

  jeugd.forEach(j => {
    newObj.aanwezigheid[j.id] = "onbekend";
  });
  if (config.showLeiding) {
    leiding.forEach(l => {
      newObj.aanwezigheid[`leiding-${l.id}`] = "onbekend";
    });
  }

  set(newRef, newObj).then(() => {
    opModal.classList.add("hidden");
    loadEverything();
  });
});

// ======================================================================
// FILTERS, PRINT, EDIT-MODE, INFO, WYSIWYG, MELDINGEN
// ======================================================================

// Filters
filterAll?.addEventListener("click", () => {
  currentFilter = "all";
  filterAll.classList.add("active");
  filterFuture?.classList.remove("active");
  filterPast?.classList.remove("active");
  renderTable();
});

filterFuture?.addEventListener("click", () => {
  currentFilter = "future";
  filterFuture.classList.add("active");
  filterAll?.classList.remove("active");
  filterPast?.classList.remove("active");
  renderTable();
});

filterPast?.addEventListener("click", () => {
  currentFilter = "past";
  filterPast.classList.add("active");
  filterAll?.classList.remove("active");
  filterFuture?.classList.remove("active");
  renderTable();
});

// Print
printButton?.addEventListener("click", () => window.print());

// Tabel-bewerken
editModeButton?.addEventListener("click", () => {
  if (!isLeiding() && !isBewerken()) {
    alert("Log eerst in als leiding om de tabel te bewerken.");
    return;
  }
  if (isBewerken()) setMode("leiding");
  else setMode("bewerken");
});

// Info-bewerken
infoEditButton?.addEventListener("click", toggleInfoEdit);

// WYSIWYG
toolbarButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    if (!cmd) return;
    document.execCommand(cmd, false, null);
    infoEdit?.focus();
  });
});

colorPicker?.addEventListener("change", () => {
  document.execCommand("foreColor", false, colorPicker.value);
  infoEdit?.focus();
});

// Meldingen
meldingLeidingAan?.addEventListener("change", saveMeldingen);
meldingOnbekendAan?.addEventListener("change", saveMeldingen);
leidingDrempel?.addEventListener("input", saveMeldingen);

// Secties openen
openLedenbeheerButton?.addEventListener("click", () =>
  openSection(ledenbeheerSection)
);
openMeldingenButton?.addEventListener("click", () =>
  openSection(meldingenSection)
);

// ======================================================================
// INIT
// ======================================================================
setMode(mode);
loadEverything();
