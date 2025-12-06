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

// Speltak bepalen
const speltak = window.location.pathname
  .split("/")
  .pop()
  .replace(".html", "")
  .toLowerCase();

// Config uit HTML
const config = window.speltakConfig || { showBert: false, showLeiding: true };

// ======================================================================
// DOM ELEMENTS
// ======================================================================

// Info
const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");
const infoEditButton = document.getElementById("infoEditButton");
const toolbarButtons = document.querySelectorAll("#infoEditorToolbar button");
const colorPicker = document.getElementById("colorPicker");
const loadingIndicator = document.getElementById("loadingIndicator");
const errorIndicator = document.getElementById("errorIndicator");


// Table
const headerRowTop = document.getElementById("headerRowTop");
const tableBody = document.getElementById("tableBody");

// Buttons
const editModeButton = document.getElementById("editModeButton");
const printButton = document.getElementById("printButton");
const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");

const openLedenbeheerButton = document.getElementById("openLedenbeheerButton");
const openMeldingenButton = document.getElementById("openMeldingenButton");

// Sections
const ledenbeheerSection = document.getElementById("ledenbeheerSection");
const meldingenSection = document.getElementById("meldingenSection");

// Ledenbeheer
const ledenbeheerJeugd = document.getElementById("jeugdLeden");
const ledenbeheerLeiding = document.getElementById("leidingLeden");
const addMemberButton = document.getElementById("addMemberButton");

// Meldingen
const meldingLeidingAan = document.getElementById("meldingLeidingAan");
const meldingOnbekendAan = document.getElementById("meldingOnbekendAan");
const leidingDrempel = document.getElementById("leidingDrempel");

// Modals
const memberModal = document.getElementById("addMemberModal");
const memberType = document.getElementById("memberType");
const memberName = document.getElementById("memberName");
const saveMember = document.getElementById("saveMember");
const cancelMember = document.getElementById("cancelMember");

const opModal = document.getElementById("opkomstModal");
const opDatum = document.getElementById("opDatum");
const opStart = document.getElementById("opStart");
const opEind = document.getElementById("opEind");
const opProcor = document.getElementById("opProcor");
const opThema = document.getElementById("opThema");
const opLocatie = document.getElementById("opLocatie");
const opType = document.getElementById("opType");
const opMateriaal = document.getElementById("opMateriaal");

// nieuwe velden uit de opkomst-modal
const opBijzonderheden = document.getElementById("opBijzonderheden");
const opKijkers = document.getElementById("opKijkers");
const opExtraAantal = document.getElementById("opExtraAantal");
const opExtraNamen = document.getElementById("opExtraNamen");
const opBert = document.getElementById("opBert");

const saveOpkomst = document.getElementById("saveOpkomst");
const cancelOpkomst = document.getElementById("cancelOpkomst");

// Close buttons
const closeButtons = document.querySelectorAll(".close-section");

// ======================================================================
// STATE
// ======================================================================
let data = {};
let opkomsten = [];
let jeugd = [];
let leiding = [];

let nextUpcomingId = null;
let infoEditActive = false;


/* =============================
   MODES — ouder / leiding / edit
   ============================= */

let mode = localStorage.getItem("mode") || "ouder";
let editMode = false; 

const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// Mode toepassen na definiëring van mode
setMode(mode);

// Database inladen
loadEverything();
 
function isOuder() {
  return mode === "ouder";
}

function isLeiding() {
  return mode === "leiding";
}

function isEdit() {
  return mode === "bewerken";
}

function setMode(newMode) {
  mode = newMode;
  localStorage.setItem("mode", newMode);

  document.body.classList.remove("mode-ouder", "mode-leiding", "mode-bewerken");
  document.body.classList.add(`mode-${newMode}`);

  applyModeVisibility();
  renderTable();
}

function toggleEditMode() {
  if (!isLeiding()) return;
  editMode = !editMode;
  setMode(editMode ? "bewerken" : "leiding");
}

function applyModeVisibility() {
  // Leiding-only elementen verbergen voor ouders
  document.querySelectorAll(".only-leiding").forEach(el => {
    if (isOuder()) el.classList.add("hide-view");
    else el.classList.remove("hide-view");
  });

  // Kolommen die ouders niet mogen zien
  document.querySelectorAll(".col-locatie, .col-materiaal, .col-type, .col-leiding").forEach(el => {
    if (isOuder()) el.classList.add("hide-view");
    else el.classList.remove("hide-view");
  });

  // FAB (opkomst toevoegen) alleen zichtbaar voor leiding
  const fab = document.getElementById("fabAddOpkomst");
  if (fab) fab.classList.toggle("hide-view", isOuder());
  
 // === LEIDING SIDEBAR ===
    const sidebar = document.getElementById("leidingSidebar");
    if (sidebar) {
        sidebar.classList.toggle("hidden", isOuder());
    }
}
   


async function loadEverything() {

    // --- LOADING START ---
    loadingIndicator.classList.remove("hidden");
    errorIndicator.classList.add("hidden");

    try {
        const snap = await get(ref(db, speltak));

        if (!snap.exists()) {
            throw new Error("Geen data gevonden");
        }

        data = snap.val() || {};

        // Klaar met laden
        loadingIndicator.classList.add("hidden");

        // --- DE REST VAN JOUW ORIGINELE FUNCTIE ---
        opkomsten = Object.entries(data.opkomsten || {}).map(([id, value]) => ({
            id,
            ...value
        }));

        // sorteer toekomst-heden-verleden
        opkomsten.sort((a, b) => {
            const aPast = isPast(a.datum);
            const bPast = isPast(b.datum);
            if (aPast !== bPast) return aPast ? 1 : -1;
            return compareDateTime(a, b);
        });

        // eerstvolgende opkomst bepalen
        nextUpcomingId = null;
        for (const o of opkomsten) {
            if (!isPast(o.datum)) {
                nextUpcomingId = o.id;
                break;
            }
        }

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

        renderEverything();

    } catch (err) {
        console.error("Fout bij laden database:", err);

        loadingIndicator.classList.add("hidden");
        errorIndicator.classList.remove("hidden");
        errorIndicator.textContent = "Kon geen verbinding maken met de database. Probeer opnieuw.";
    }
}


let currentFilter = "all";

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
  const txt = data.infotekst || "";
  infoTekst.innerHTML = txt;
  infoEdit.innerHTML = txt;
}

function toggleInfoEdit() {
  if (!isLeiding()) return alert("Alleen leiding kan info bewerken.");

  infoEditActive = !infoEditActive;

  // BEWERK-MODUS AAN
  if (infoEditActive) {
      infoEditorWrapper.classList.remove("hidden");
      infoTekst.classList.add("hidden");
      infoEditButton.textContent = "Opslaan info";
  }

  // BEWERK-MODUS UIT (OPSLAAN)
  else {
      const sanitized = sanitizeText(infoEdit.innerHTML);

      update(ref(db, speltak), { infotekst: sanitized }).then(() => {

          // DIRECTE visuele update
          infoTekst.innerHTML = sanitized;

          // Editor sluiten
          infoEditorWrapper.classList.add("hidden");
          infoTekst.classList.remove("hidden");
          infoEditButton.textContent = "Info bewerken";

          // Sync met database
          renderEverything();
      });
  }
}

// ======================================================================
// TABEL OPBOUW
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

  // Delete column only in edit mode
if (isEdit()) {
    const thDel = document.createElement("th");
    thDel.textContent = ""; // leeg
    tr.appendChild(thDel);
}


  // Datum
  const thD = document.createElement("th");
  thD.textContent = "Datum";
  thD.classList.add("col-datum");
  tr.appendChild(thD);

  // Start
  const thS = document.createElement("th");
  thS.textContent = "Start";
  tr.appendChild(thS);

  // Eind
  const thE = document.createElement("th");
  thE.textContent = "Eind";
  tr.appendChild(thE);

// Procor (alleen zichtbaar voor leiding)
if (!isOuder()) {
    const thProcor = document.createElement("th");
    thProcor.textContent = "Procor";
    thProcor.classList.add("col-procor");
    tr.appendChild(thProcor);
}

   // Type (alleen zichtbaar in bewerkmodus, verborgen voor ouders)
  const thT = document.createElement("th");
  thT.textContent = "Type";
  thT.classList.add("col-type");
  if (isOuder()) thT.classList.add("hide-view");   
  tr.appendChild(thT);

  // Thema
  const thTh = document.createElement("th");
  thTh.textContent = "Thema";
  tr.appendChild(thTh);

  // Bijzonderheden
const thBz = document.createElement("th");
thBz.textContent = "Bijzonderheden";
tr.appendChild(thBz);

  // Bert
  if (config.showBert) {
    const thB = document.createElement("th");
    thB.textContent = "Bert logeert bij";
    tr.appendChild(thB);
  }

  const thLoc = document.createElement("th");
  thLoc.textContent = "Locatie";
  thLoc.classList.add("col-locatie");
  if (isOuder()) thLoc.classList.add("hide-view");
  tr.appendChild(thLoc);


  const thMat = document.createElement("th");
  thMat.textContent = "Materiaal";
  thMat.classList.add("col-materiaal");
  if (isOuder()) thMat.classList.add("hide-view");
  tr.appendChild(thMat);


  // Jeugdleden
jeugd.forEach(j => {
    if (j.hidden) return; // volledige kolom overslaan
    const th = document.createElement("th");
    th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
    tr.appendChild(th);
});

  // Kijkers (alleen voor leiding/edit)
if (!isOuder()) {
    const thK = document.createElement("th");
    thK.textContent = "Kijkers";
    tr.appendChild(thK);
}

// Divider exactly once, only if leiding columns are shown
const visibleJeugd = jeugd.filter(j => !j.hidden).length;
const visibleLeiding = leiding.filter(l => !l.hidden).length;

if (visibleJeugd > 0 && visibleLeiding > 0) {
    const divider = document.createElement("th");
    divider.classList.add("col-divider");
    tr.appendChild(divider);
}

  // Leiding
  if (config.showLeiding) {
    leiding.forEach(l => {
    if (l.hidden) return; // volledige kolom overslaan
    const th = document.createElement("th");
    th.classList.add("col-leiding");
    if (isOuder()) th.classList.add("hide-view");
    th.innerHTML = `<div class="name-vertical">${l.naam}</div>`;
    tr.appendChild(th);
});
  }
  
  // Extra leiding kolom
if (!isOuder()) {
    const thExtra = document.createElement("th");
    thExtra.textContent = "Extra";
    tr.appendChild(thExtra);
}

  // Twee tellers
 if (!isOuder()) {
    const thJ = document.createElement("th");
    thJ.textContent = "Aanw. jeugd";
    tr.appendChild(thJ);

    const thL = document.createElement("th");
    thL.textContent = "Aanw. leiding";
    tr.appendChild(thL);
}
}

function addRow(o) {
    const tr = document.createElement("tr");

    // Row coloring
    if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
    else if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
    else if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");

    if (isPast(o.datum) && o.typeOpkomst !== "geen") tr.classList.add("row-grey");
    if (o.id === nextUpcomingId) tr.classList.add("row-next");

    // DELETE COLUMN
    if (isEdit()) {
        const del = document.createElement("td");
        del.textContent = "🗑️";
        del.classList.add("editable-cell");
        del.addEventListener("click", () => {
            if (confirm("Deze opkomst verwijderen?")) {
                set(ref(db, `${speltak}/opkomsten/${o.id}`), null).then(loadEverything);
            }
        });
        tr.appendChild(del);
    }

    // DATUM
    tr.appendChild(makeEditableCell(o, "datum", "col-datum", "date"));

    // START / EIND
    tr.appendChild(makeEditableCell(o, "starttijd", "", "time"));
    tr.appendChild(makeEditableCell(o, "eindtijd", "", "time"));

    // PROCOR (alleen leiding)
    if (!isOuder()) {
        tr.appendChild(makeEditableCell(o, "procor", "col-procor", "text"));
    }

    // TYPE (dropdown)
   const tdType = makeRestrictedEditable(
    o,
    "typeOpkomst",
    ["normaal", "bijzonder", "kamp", "geen"],
    "col-type"
);
if (isOuder()) tdType.classList.add("hide-view");
tr.appendChild(tdType);

    // THEMA
    tr.appendChild(makeEditableCell(o, "thema"));

    // BIJZONDERHEDEN
    tr.appendChild(makeEditableCell(o, "bijzonderheden"));

    // BERT (optioneel)
    if (config.showBert) {
        tr.appendChild(makeEditableCell(o, "bert_met"));
    }

    // LOCATIE (dropdown)
  const tdLoc = makeRestrictedEditable(
    o,
    "locatie",
    ["", "Kampvuurkuil", "Zandveld", "Grasveld", "De Hoop",
     "Bever lokaal", "Welpen lokaal", "Van terrein af",
     "Externe locatie", "Overig"],
    "col-locatie"
);
if (isOuder()) tdLoc.classList.add("hide-view");
tr.appendChild(tdLoc);


    // MATERIAAL
    tr.appendChild(makeEditableCell(o, "materiaal", "col-materiaal"));

    // JEUGD AANWEZIGHEID
    jeugd.forEach(j => {
        if (!j.hidden) {
            tr.appendChild(makePresenceCell(o, j.id, j.hidden, false));
        }
    });

    // KIJKERS
    if (!isOuder()) {
        tr.appendChild(makeEditableCell(o, "kijkers", "", "number"));
    }

    // DIVIDER
    const visibleJeugd = jeugd.filter(j => !j.hidden).length;
    const visibleLeiding = leiding.filter(l => !l.hidden).length;
    if (visibleJeugd > 0 && visibleLeiding > 0) {
        const divider = document.createElement("td");
        divider.classList.add("col-divider");
        tr.appendChild(divider);
    }

    // LEIDING AANWEZIGHEID
    if (config.showLeiding) {
        leiding.forEach(l => {
            if (!l.hidden) {
                tr.appendChild(makePresenceCell(o, `leiding-${l.id}`, l.hidden, true));
            }
        });
    }

    // EXTRA LEIDING (aantal)
    if (!isOuder()) {
        tr.appendChild(makeEditableCell(o, "extraAantal", "", "number"));
    }

    // EXTRA LEIDING (namen)
    if (!isOuder()) {
        tr.appendChild(makeEditableCell(o, "extraNamen"));
    }

    // TELLERS
    if (!isOuder()) {
        const [cntJ, cntL] = countPresence(o);

        const tdJ = document.createElement("td");
        tdJ.textContent = cntJ;
        tr.appendChild(tdJ);

        const tdL = document.createElement("td");
        tdL.textContent = cntL;
        tr.appendChild(tdL);
    }

    tableBody.appendChild(tr);
}

// ======================================================================
// CELFUNCTIES
// ======================================================================
function makeEditableCell(o, field, extraClass = "", inputType = "text") {
    const td = document.createElement("td");
    if (extraClass) td.classList.add(extraClass);

    const value = o[field] || "";

    // VIEW MODE → alleen tekst
    if (!isEdit()) {
        td.textContent = value;
        return td;
    }

    // EDIT MODE → direct invoerveld tonen
    td.classList.add("editable-cell");

    const input = document.createElement("input");
    input.type = inputType;        // text, date, time
    if (inputType === "date") {
        input.value = value?.substring(0, 10) || "";
    } else {
        input.value = value;
    }
    input.classList.add("cell-input");

    // Opslaan bij blur
    input.addEventListener("blur", () => {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), {
            [field]: input.value
        });
    });

    td.appendChild(input);
    return td;
}

function makeRestrictedEditable(o, field, opties, extraClass = "") {
    const td = document.createElement("td");
    if (extraClass) td.classList.add(extraClass);

    const value = o[field] || "";

    // VIEW MODE → normale tekst
    if (!isEdit()) {
        td.textContent = value;
        return td;
    }

    // EDIT MODE → direct dropdown
    td.classList.add("editable-cell");

    const select = document.createElement("select");
    select.classList.add("cell-select");

    opties.forEach(opt => {
        const el = document.createElement("option");
        el.value = opt;
        el.textContent = opt || "—";
        if (opt === value) el.selected = true;
        select.appendChild(el);
    });

    // Opslaan bij change
    select.addEventListener("change", () => {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), {
            [field]: select.value
        });
    });

    td.appendChild(select);
    return td;
}
function makePresenceCell(o, key, hidden, isLeidingCell) {
    const td = document.createElement("td");

    if (hidden) td.classList.add("hide-view");
    if (isLeidingCell) td.classList.add("col-leiding");

    // Verborgen leden overslaan zoals voorheen
    if (key.startsWith("leiding-")) {
        const id = key.replace("leiding-", "");
        if (leiding.find(l => l.id === id)?.hidden) {
            td.classList.add("hide-view");
            return td;
        }
    } else {
        if (jeugd.find(j => j.id === key)?.hidden) {
            td.classList.add("hide-view");
            return td;
        }
    }

    const cur = o.aanwezigheid?.[key] || "onbekend";
    const sym = { aanwezig: "✔", afwezig: "✖", onbekend: "?" };

    td.textContent = sym[cur];
    td.classList.add("presence-cell", `presence-${cur}`);

    // Jeugd altijd klikbaar
    if (!isLeidingCell) {
        td.classList.add("editable-cell");
        td.addEventListener("click", () => togglePresence(o, key));
        return td;
    }

    // Leiding klikbaar voor leiding
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
  let j = 0, l = 0;

  jeugd.forEach(m => {
    if (!m.hidden && o.aanwezigheid?.[m.id] === "aanwezig") j++;
  });

  if (config.showLeiding) {
    leiding.forEach(m => {
      if (!m.hidden && o.aanwezigheid?.[`leiding-${m.id}`] === "aanwezig") l++;
    });
  }

  // Kijkers + extra leiding toevoegen
  j += Number(o.kijkers || 0);
  l += Number(o.extraAantal || 0);

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

cancelOpkomst?.addEventListener("click", () =>
  opModal.classList.add("hidden")
);

function resetOpkomstFields() {
  opDatum.value = "";
  opStart.value = "10:30";
  opEind.value = "12:30";
  opThema.value = "";
  opProcor.value = "";
  opLocatie.value = "";
  opType.value = "";
  opMateriaal.value = "";
  opBijzonderheden.value = "";
  opKijkers.value = "0";
  opExtraAantal.value = "0";
  opExtraNamen.value = "";
  if (opBert) opBert.value = "";
}


const fab = document.getElementById("fabAddOpkomst");
fab?.addEventListener("click", () => {
    if (!isLeiding()) return;
    resetOpkomstFields();
    applyPopupVisibility();
    opModal.classList.remove("hidden");
});


function applyPopupVisibility() {
    const procorField = document.querySelector(".field-procor");
    if (!procorField) return;

    if (isOuder()) procorField.classList.add("hidden");
    else procorField.classList.remove("hidden");
}

saveOpkomst?.addEventListener("click", () => {
    if (!isLeiding()) return; 
    if (!opDatum.value) return alert("Datum verplicht");

    const newRef = push(ref(db, `${speltak}/opkomsten`));

    const newObj = {
        id: newRef.key,
        datum: isoFromInput(opDatum.value),

        thema: opThema?.value || "",
        procor: opProcor?.value || "",
        bijzonderheden: opBijzonderheden?.value || "",

        typeOpkomst: opType?.value || "normaal",

        starttijd: opStart?.value || "",
        eindtijd: opEind?.value || "",

        locatie: opLocatie?.value || "",
        materiaal: opMateriaal?.value || "",

        kijkers: Number(opKijkers?.value || 0),
        extraAantal: Number(opExtraAantal?.value || 0),
        extraNamen: opExtraNamen?.value || "",

        aanwezigheid: {}
    };

    // Bert logeert bij – alleen gebruiken als de speltak dat ondersteunt
    if (config.showBert) {
        newObj.bert_met = opBert?.value || "";
    }


    jeugd.forEach(j => newObj.aanwezigheid[j.id] = "onbekend");
    if (config.showLeiding)
        leiding.forEach(l => newObj.aanwezigheid[`leiding-${l.id}`] = "onbekend");

    set(newRef, newObj).then(() => {
        opModal.classList.add("hidden");
        loadEverything();
    });
});


const logoutButton = document.getElementById("logoutButton");

logoutButton?.addEventListener("click", () => {
    localStorage.setItem("mode", "ouder");
    setMode("ouder");
});


// ======================================================================
// FILTERS, PRINT, EDIT MODE, INFO EDIT, WYSIWYG
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

printButton?.addEventListener("click", () => {
    const prevMode = mode;

    // altijd naar oudermodus voor print
    setMode("ouder");

    // wacht 150ms zodat DOM gerenderd is → dan printen
    setTimeout(() => {
        window.print();
        // na print terugzetten naar vorige modus
        setMode(prevMode);
    }, 150);
});

editModeButton?.addEventListener("click", () => {
  if (!isLeiding() && !isEdit()) return alert("Log in als leiding om te bewerken.");

  if (isEdit()) {
    // Save & terug naar normale leidingmodus
    editMode = false;
    setMode("leiding");
    editModeButton.textContent = "✏️ Opkomsten bewerken";
    renderTable();
  } else {
    // Naar bewerkmodus
    editMode = true;
    setMode("bewerken");
    editModeButton.textContent = "💾 Wijzigingen opslaan";
    renderTable();
  }
});


infoEditButton?.addEventListener("click", toggleInfoEdit);

// WYSIWYG toolbar
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
