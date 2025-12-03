// ======================================================================
// script.js — Definitieve volledige versie
// ======================================================================

import {
  sanitizeText,
  todayISO,
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
  set,
  update,
  push
} from "./firebase-imports.js";

// ======================================================================
// FIREBASE INIT
// ======================================================================
const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// Speltak bepalen
const speltak = window.location.pathname
  .split("/")
  .pop()
  .replace(".html", "")
  .toLowerCase();

// Config uit HTML
const config = window.speltakConfig || { showBert: false, showLeiding: true };

// ======================================================================
// DOM SELECTORS
// ======================================================================
const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");
const infoEditButton = document.getElementById("infoEditButton");
const colorPicker = document.getElementById("colorPicker");
const toolbarButtons = document.querySelectorAll("#infoEditorToolbar button");

const headerRowTop = document.getElementById("headerRowTop");
const tableBody = document.getElementById("tableBody");
const addOpkomstRow = document.getElementById("addOpkomstRow");

const editModeButton = document.getElementById("editModeButton");
const printButton = document.getElementById("printButton");
const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");

const openLedenbeheerButton = document.getElementById("openLedenbeheerButton");
const openMeldingenButton = document.getElementById("openMeldingenButton");

const ledenbeheerSection = document.getElementById("ledenbeheerSection");
const ledenbeheerJeugd = document.getElementById("ledenbeheerJeugd");
const ledenbeheerLeiding = document.getElementById("ledenbeheerLeiding");
const addMemberButton = document.getElementById("addMemberButton");

const fabAddOpkomst = document.getElementById("fabAddOpkomst");

const meldingenSection = document.getElementById("meldingenSection");
const meldingLeidingAan = document.getElementById("meldingLeidingAan");
const meldingOnbekendAan = document.getElementById("meldingOnbekendAan");
const leidingDrempel = document.getElementById("leidingDrempel");

const closeButtons = document.querySelectorAll(".close-section");

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

// ======================================================================
// STATE
// ======================================================================
let data = {};
let opkomsten = [];
let jeugd = [];
let leiding = [];
let nextUpcomingId = null;

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

  editModeButton.textContent =
    newMode === "bewerken" ? "Opslaan tabel" : "✏️ Tabel bewerken";

  document.querySelectorAll(".only-leiding").forEach(el => {
    el.classList.toggle("hidden", !isLeiding());
  });

  addOpkomstRow?.classList.toggle("hidden", !isBewerken());
  addMemberButton?.classList.toggle("hidden", !isBewerken());

  document.body.classList.toggle("edit-active", isBewerken());

  renderEverything();
}

// ======================================================================
// LOAD EVERYTHING
// ======================================================================
async function loadEverything() {
  const snap = await get(ref(db, speltak));
  data = snap.val() || {};

  // Opkomsten
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

  // Leden
  jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({
    id,
    naam: v.naam || "",
    hidden: !!v.hidden,
    volgorde: typeof v.volgorde === "number" ? v.volgorde : 999
  }));

  leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
    id,
    naam: v.naam || "",
    hidden: !!v.hidden,
    volgorde: typeof v.volgorde === "number" ? v.volgorde : 999
  }));

  jeugd.sort((a, b) => a.volgorde - b.volgorde);
  leiding.sort((a, b) => a.volgorde - b.volgorde);

  renderEverything();
}

// ======================================================================
// RENDER
// ======================================================================
function renderEverything() {
  loadInfo();
  renderTable();
  renderLedenbeheer();
  renderMeldingen();
}

// ======================================================================
// INFO
// ======================================================================
function loadInfo() {
  const txt = data.infotekst || "";
  infoTekst.innerHTML = txt;
  infoEdit.innerHTML = txt;
}

function toggleInfoEdit() {
  if (!isLeiding()) return alert("Alleen leiding kan info bewerken.");

  infoEditActive = !infoEditActive;

  infoEditorWrapper.classList.toggle("hidden", !infoEditActive);
  infoTekst.classList.toggle("hidden", infoEditActive);

  infoEditButton.textContent = infoEditActive
    ? "Opslaan info"
    : "Info bewerken";

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
  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  addHeaders();

  opkomsten
    .filter(o => {
      if (currentFilter === "future") return isFutureOrToday(o.datum);
      if (currentFilter === "past") return isPast(o.datum);
      return true;
    })
    .forEach(o => addRow(o));
}

function addHeaders() {
  const tr = headerRowTop;

  tr.appendChild(document.createElement("th")); // delete

  // Datum
  const thD = document.createElement("th");
  thD.textContent = "Datum";
  thD.classList.add("col-datum");
  tr.appendChild(thD);

  // Start
  const thS = document.createElement("th");
  thS.textContent = "Start";
  thS.classList.add("col-start");
  tr.appendChild(thS);

  // Eind
  const thE = document.createElement("th");
  thE.textContent = "Eind";
  thE.classList.add("col-eind");
  tr.appendChild(thE);

  // Type
  const thT = document.createElement("th");
  thT.textContent = "Type";
  tr.appendChild(thT);

  // Thema
  const thTh = document.createElement("th");
  thTh.textContent = "Thema";
  tr.appendChild(thTh);

  if (config.showBert) {
    const thB = document.createElement("th");
    thB.textContent = "Bert logeert bij";
    tr.appendChild(thB);
  }

  const thLoc = document.createElement("th");
  thLoc.textContent = "Locatie";
  thLoc.classList.add("col-locatie");
  tr.appendChild(thLoc);

  const thMat = document.createElement("th");
  thMat.textContent = "Materiaal";
  thMat.classList.add("col-materiaal");
  tr.appendChild(thMat);

  // AANWEZIGHEID VOOR JEUGD + LEIDING (3B)
  const thJ = document.createElement("th");
  thJ.textContent = "Aanw. jeugd";
  tr.appendChild(thJ);

  if (config.showLeiding) {
    const thL = document.createElement("th");
    thL.textContent = "Aanw. leiding";
    tr.appendChild(thL);
  }

  // Splitter
  if (config.showLeiding) {
    const split = document.createElement("th");
    split.classList.add("col-split");
    tr.appendChild(split);
  }

  // Jeugd headers
  jeugd.forEach(j => {
    const th = document.createElement("th");
    if (j.hidden) th.classList.add("hidden");
    th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
    tr.appendChild(th);
  });

  // Leiding headers
  if (config.showLeiding) {
    leiding.forEach(l => {
      const th = document.createElement("th");
      if (l.hidden) th.classList.add("hidden");
      th.classList.add("col-leiding");
      th.innerHTML = `<div class="name-vertical">${l.naam}</div>`;
      tr.appendChild(th);
    });
  }
}

function addRow(o) {
  const tr = document.createElement("tr");

  // Typekleur
  if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
  if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
  if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");

  if (isPast(o.datum)) tr.classList.add("row-grey");
  if (o.id === nextUpcomingId) tr.classList.add("row-next");

  // Delete
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

  // Datum
  const tdDatum = document.createElement("td");
  tdDatum.classList.add("col-datum");
  tdDatum.textContent = formatDateDisplay(o.datum);

  if (isBewerken()) {
    tdDatum.classList.add("editable-cell");
    tdDatum.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "date";
      inp.value = o.datum;
      inp.className = "inline-date";
      tdDatum.innerHTML = "";
      tdDatum.appendChild(inp);
      inp.focus();

      inp.addEventListener("blur", () => {
        if (inp.value) {
          update(ref(db, `${speltak}/opkomsten/${o.id}`), {
            datum: isoFromInput(inp.value)
          }).then(loadEverything);
        } else renderTable();
      });
    });
  }
  tr.appendChild(tdDatum);

  // Starttijd
  tr.appendChild(makeTimeCell(o, "starttijd", "col-start"));

  // Eindtijd
  tr.appendChild(makeTimeCell(o, "eindtijd", "col-eind"));

  // Type
  const tdType = document.createElement("td");
  tdType.textContent = o.typeOpkomst || "";
  if (isBewerken()) {
    tdType.classList.add("editable-cell");
    tdType.addEventListener("click", () => {
      const nieuw = prompt("Type (normaal/bijzonder/kamp/geen):", o.typeOpkomst || "");
      if (nieuw !== null) {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), {
          typeOpkomst: nieuw
        }).then(loadEverything);
      }
    });
  }
  tr.appendChild(tdType);

  // Thema
  tr.appendChild(makeEditableCell(o, "thema"));

  // Bert
  if (config.showBert) tr.appendChild(makeEditableCell(o, "bert_met"));

  // Locatie
  tr.appendChild(makeRestrictedEditable(o, "locatie", ["Clubhuis","Bos","Extern","Overig"], "col-locatie"));

  // Materiaal
  tr.appendChild(makeEditableCell(o, "materiaal", "col-materiaal"));

  // AANWEZIGHEID VOOR JEUGD + LEIDING (VOOR DE NAMEN)
  const [cntJ, cntL] = countPresence(o);

  const tdJ = document.createElement("td");
  tdJ.textContent = cntJ;
  tr.appendChild(tdJ);

  if (config.showLeiding) {
    const tdL = document.createElement("td");
    tdL.textContent = cntL;
    tr.appendChild(tdL);
  }

  // Divider
  if (config.showLeiding) {
    const split = document.createElement("td");
    split.classList.add("col-split");
    tr.appendChild(split);
  }

  // Jeugd aanwezigheid
  jeugd.forEach(j => {
    tr.appendChild(makePresenceCell(o, j.id, j.hidden, false));
  });

  // Leiding aanwezigheid
  if (config.showLeiding) {
    leiding.forEach(l => {
      tr.appendChild(makePresenceCell(o, "leiding-" + l.id, l.hidden, true));
    });
  }

  tableBody.appendChild(tr);
}

// ======================================================================
// TABEL HELPERFUNCTIES
// ======================================================================
function makeEditableCell(o, field, extraClass = "") {
  const td = document.createElement("td");
  td.textContent = o[field] || "";
  if (extraClass) td.classList.add(extraClass);

  if (!isBewerken()) return td;

  td.classList.add("editable-cell");
  td.contentEditable = true;

  td.addEventListener("blur", () => {
    update(ref(db, `${speltak}/opkomsten/${o.id}`), {
      [field]: td.textContent.trim()
    });
  });

  return td;
}

function makeRestrictedEditable(o, field, opties, className) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";
  td.classList.add(className);

  if (!isLeiding()) return td;

  if (isBewerken()) {
    td.classList.add("editable-cell");
    td.addEventListener("click", () => {
      const nieuw = prompt(`Nieuwe ${field} (${opties.join(", ")}):`, o[field] || "");
      if (nieuw !== null) {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: nieuw })
          .then(loadEverything);
      }
    });
  }

  return td;
}

function makeTimeCell(o, field, className) {
  const td = document.createElement("td");
  td.textContent = o[field] || "";
  td.classList.add(className);

  if (o.starttijd !== "10:30" || o.eindtijd !== "12:30")
    td.classList.add("tijd-afwijkend");

  if (!isBewerken()) return td;

  td.classList.add("editable-cell");
  td.addEventListener("click", () => {
    const nieuw = prompt(`Nieuwe tijd voor ${field}:`, o[field] || "");
    if (nieuw) {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        [field]: nieuw
      }).then(loadEverything);
    }
  });

  return td;
}

function makePresenceCell(o, key, hidden, isLeidingCell) {
  const td = document.createElement("td");
  if (hidden) td.classList.add("hidden");
  if (isLeidingCell) td.classList.add("col-leiding");

  const cur = (o.aanwezigheid && o.aanwezigheid[key]) || "onbekend";
  const sym = { aanwezig: "✔", afwezig: "✖", onbekend: "?" };
  td.textContent = sym[cur];

  td.classList.add("presence-cell");

  if (cur === "aanwezig") td.classList.add("presence-aanwezig");
  if (cur === "afwezig") td.classList.add("presence-afwezig");
  if (cur === "onbekend") td.classList.add("presence-reminder");

  // Jeugd altijd klikbaar
  if (!isLeidingCell) {
    td.classList.add("editable-cell");
    td.addEventListener("click", () => togglePresence(o, key));
    return td;
  }

  // Leiding alleen voor leiding
  if (isLeiding()) {
    td.classList.add("editable-cell");
    td.addEventListener("click", () => togglePresence(o, key));
  }

  return td;
}

function togglePresence(o, key) {
  const cur = (o.aanwezigheid && o.aanwezigheid[key]) || "onbekend";
  const next =
    cur === "aanwezig"
      ? "afwezig"
      : cur === "afwezig"
      ? "onbekend"
      : "aanwezig";

  update(ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid`), {
    [key]: next
  }).then(loadEverything);
}

function countPresence(o) {
  let j = 0,
    l = 0;

  jeugd.forEach(m => {
    if (!m.hidden && o.aanwezigheid?.[m.id] === "aanwezig") j++;
  });

  if (config.showLeiding) {
    leiding.forEach(m => {
      if (!m.hidden && o.aanwezigheid?.["leiding-" + m.id] === "aanwezig")
        l++;
    });
  }

  return [j, l];
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

  li.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () =>
      handleMemberAction(obj, type, btn.dataset.act)
    );
  });

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
// SECTIE OPENEN / SLUITEN
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
    target?.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

// Nieuwe opkomst
fabAddOpkomst?.addEventListener("click", () => {
  if (!isLeiding()) return;
  opModal.classList.remove("hidden");
});

cancelOpkomst?.addEventListener("click", () =>
  opModal.classList.add("hidden")
);

saveOpkomst?.addEventListener("click", () => {
  if (!isLeiding()) return;

  if (!opDatum.value) return alert("Datum verplicht");

  const newRef = push(ref(db, `${speltak}/opkomsten`));

  const newObj = {
    id: newRef.key,
    datum: isoFromInput(opDatum.value),
    thema: opThema.value,
    typeOpkomst: opType.value,
    starttijd: opStart.value || "10:30",
    eindtijd: opEind.value || "12:30",
    locatie: opLocatie.value,
    materiaal: "",
    aanwezigheid: {}
  };

  if (config.showBert) newObj.bert_met = "";

  jeugd.forEach(j => (newObj.aanwezigheid[j.id] = "onbekend"));
  if (config.showLeiding)
    leiding.forEach(l => (newObj.aanwezigheid[`leiding-${l.id}`] = "onbekend"));

  set(newRef, newObj).then(() => {
    opModal.classList.add("hidden");
    loadEverything();
  });
});

// ======================================================================
// FILTERS, PRINT, EDIT-MODE, WYSIWYG
// ======================================================================
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

printButton?.addEventListener("click", () => window.print());

editModeButton?.addEventListener("click", () => {
  if (!isLeiding() && !isBewerken()) {
    alert("Log in als leiding om te bewerken.");
    return;
  }
  setMode(isBewerken() ? "leiding" : "bewerken");
});

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

// Meldingen opslaan
meldingLeidingAan?.addEventListener("change", saveMeldingen);
meldingOnbekendAan?.addEventListener("change", saveMeldingen);
leidingDrempel?.addEventListener("input", saveMeldingen);

// ======================================================================
// INIT
// ======================================================================
setMode(mode);
loadEverything();
