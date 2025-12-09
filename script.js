/* ======================================================================
   IMPORTS
   ====================================================================== */
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

/* ======================================================================
   FIREBASE INIT
   ====================================================================== */
const speltak = window.location.pathname
    .split("/")
    .pop()
    .replace(".html", "")
    .toLowerCase();

const config = window.speltakConfig || { showBert: false, showLeiding: true };

const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// Standaard start/eindtijden per speltak
const defaultTimes = {
    bevers:   { start: "10:30", eind: "12:30" },
    welpen:   { start: "14:00", eind: "17:00" },
    scouts:   { start: "14:00", eind: "17:00" },
    explorers:{ start: "19:30", eind: "22:30" },
    rovers:   { start: "19:30", eind: "22:30" },
    stam:     { start: "19:30", eind: "22:30" },
};

// fallback als speltak niet voorkomt
const defaultTime = defaultTimes[speltak] || { start: "*", eind: "*" };


/* ======================================================================
   DOM ELEMENTS
   ====================================================================== */
const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");
const infoEditButton = document.getElementById("infoEditButton");
const toolbarButtons = document.querySelectorAll("#infoEditorToolbar button");
const colorPicker = document.getElementById("colorPicker");

const loadingIndicator = document.getElementById("loadingIndicator");
const errorIndicator = document.getElementById("errorIndicator");

const headerRowTop = document.getElementById("headerRowTop");
const headerRowBottom = document.getElementById("headerRowBottom");

const tableBody = document.getElementById("tableBody");

const tableWrapper = document.querySelector(".table-wrapper");
let tableHScroll = null;
let tableHInner = null;

const editModeButton = document.getElementById("editModeButton");
const printButton = document.getElementById("printButton");

const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");

const openLedenbeheerButton = document.getElementById("openLedenbeheerButton");
const openMeldingenButton = document.getElementById("openMeldingenButton");

const ledenbeheerSection = document.getElementById("ledenbeheerSection");
const meldingenSection = document.getElementById("meldingenSection");

const ledenbeheerJeugd = document.getElementById("jeugdLeden");
const ledenbeheerLeiding = document.getElementById("leidingLeden");
const addMemberButton = document.getElementById("addMemberButton");

const meldingLeidingAan = document.getElementById("meldingLeidingAan");
const meldingOnbekendAan = document.getElementById("meldingOnbekendAan");
const leidingDrempel = document.getElementById("leidingDrempel");

const memberModal = document.getElementById("addMemberModal");
const memberType = document.getElementById("memberType");
const memberName = document.getElementById("memberName");

const memberWelpenNaam = document.getElementById("memberWelpenNaam");
const memberNest = document.getElementById("memberNest");
const memberNestLeider = document.getElementById("memberNestLeider");

const welpenExtraFields = document.getElementById("welpenExtraFields");

// Alleen tonen als speltak welpen is
if (welpenExtraFields) {
    if (speltak !== "welpen") {
        welpenExtraFields.style.display = "none";
    }
}

function toggleWelpenExtraFields() {
    if (!welpenExtraFields) return;

    if (speltak !== "welpen") {
        welpenExtraFields.style.display = "none";
        return;
    }

    // Alleen jeugdleden hebben Nest/NestLeider
    if (memberType.value === "jeugd") {
        welpenExtraFields.style.display = "block";
    } else {
        welpenExtraFields.style.display = "none";
    }
}

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

const opBijzonderheden = document.getElementById("opBijzonderheden");
const opKijkers = document.getElementById("opKijkers");
const opExtraAantal = document.getElementById("opExtraAantal");
const opExtraNamen = document.getElementById("opExtraNamen");
const opBert = document.getElementById("opBert");

const saveOpkomst = document.getElementById("saveOpkomst");
const cancelOpkomst = document.getElementById("cancelOpkomst");
const closeButtons = document.querySelectorAll(".close-section");
const fab = document.getElementById("fabAddOpkomst");
const logoutButton = document.getElementById("logoutButton");

/* ======================================================================
   HORIZONTALE SCROLLBALK – zwevend
   ====================================================================== */
function initHorizontalScrollProxy() {
    if (!tableWrapper || tableHScroll) return;

    // Maak de zwevende scrollbalk
    tableHScroll = document.createElement("div");
    tableHScroll.className = "table-h-scroll";

    tableHInner = document.createElement("div");
    tableHInner.className = "table-h-inner";
    tableHScroll.appendChild(tableHInner);

    // Voeg hem toe aan de body (zwevend boven alles)
    document.body.appendChild(tableHScroll);

    // Scroll-sync beide kanten op
    tableHScroll.addEventListener("scroll", () => {
        if (!tableWrapper) return;
        tableWrapper.scrollLeft = tableHScroll.scrollLeft;
    });

    tableWrapper.addEventListener("scroll", () => {
        if (!tableHScroll) return;
        tableHScroll.scrollLeft = tableWrapper.scrollLeft;
    });

    // Reageren op scroll en resize om positie bij te werken
    window.addEventListener("scroll", updateHorizontalScrollPosition);
    window.addEventListener("resize", () => {
        syncHorizontalScrollProxy();
    });
}

function syncHorizontalScrollProxy() {
    if (!tableWrapper || !tableHInner) return;
    // Breedte van de inhoud = breedte van de tabel (voor horizontale scroll)
    tableHInner.style.width = tableWrapper.scrollWidth + "px";
    updateHorizontalScrollPosition();
}

function updateHorizontalScrollPosition() {
    if (!tableWrapper || !tableHScroll) return;

    const rect = tableWrapper.getBoundingClientRect();

    // Check of horizontale scrollbar nodig is
    const hasOverflow = tableWrapper.scrollWidth > tableWrapper.clientWidth + 1;
    if (!hasOverflow) {
        tableHScroll.style.display = "none";
        return;
    }

    // Altijd tonen zodra er overflow is
    tableHScroll.style.display = "block";

    // Scrollbar even breed als de tabel
    tableHScroll.style.left = rect.left + "px";
    tableHScroll.style.width = rect.width + "px";

    // ⭐ Belangrijk: Vastgeplakt aan onderkant viewport
    const bottomOffset = 50; // afstand vanaf onderrand scherm
    tableHScroll.style.top = `${window.innerHeight - bottomOffset}px`;
}


// Direct bij load de proxy aanmaken
initHorizontalScrollProxy();

/* ======================================================================
   STATE
   ====================================================================== */
let data = {};
let opkomsten = [];
let jeugd = [];
let leiding = [];
let nextUpcomingId = null;
let infoEditActive = false;
let editingMemberId = null;
let editingMemberType = null;


// ----------------------------------------------------------------------
// MODE STATE
// ----------------------------------------------------------------------
let mode = localStorage.getItem("mode") || "ouder";
let editMode = false;

// Oude opgeslagen waarde 'bewerken' (of iets anders) herstellen naar 'ouder'
if (mode !== "ouder" && mode !== "leiding") {
  mode = "ouder";
  localStorage.setItem("mode", "ouder");
}

/* ======================================================================
   MODE FUNCTIONS
   ====================================================================== */
function isOuder() { 
  return mode === "ouder"; 
}

function isLeiding() { 
  return mode === "leiding"; 
}

// Edit-modus is nu een aparte vlag, en alleen geldig als je leiding bent
function isEdit() { 
  return editMode && isLeiding(); 
}

// Start met de huidige (genormaliseerde) mode
setMode(mode);
loadEverything();

function setMode(newMode) {
  // Validatie
  if (newMode !== "ouder" && newMode !== "leiding") {
    newMode = "ouder";
  }

  // Basis-modus opslaan
  mode = newMode;
  localStorage.setItem("mode", newMode);

  // ALTIJD eerst compleet resetten
  document.body.classList.remove("mode-ouder", "mode-leiding", "mode-bewerken");

  // Basis-modus toevoegen
  document.body.classList.add(`mode-${mode}`);

  // Bewerken-modus toevoegen ALS leiding + editMode true
  if (mode === "leiding" && editMode) {
    document.body.classList.add("mode-bewerken");
  }

  applyModeVisibility();
  renderTable();
}

function applyModeVisibility() {
  // Leiding-only elementen verbergen voor ouders
  document.querySelectorAll(".only-leiding").forEach(el => {
    el.classList.toggle("hide-view", isOuder());
  });

  // Kolommen die ouders niet mogen zien
  document.querySelectorAll(".col-locatie, .col-materiaal, .col-type, .col-leiding").forEach(el => {
    el.classList.toggle("hide-view", isOuder());
  });

  // FAB (opkomst toevoegen) alleen zichtbaar voor leiding
  if (fab) fab.classList.toggle("hide-view", isOuder());

  // Sidebar alleen voor leiding
  const sidebar = document.getElementById("leidingSidebar");
  if (sidebar) sidebar.classList.toggle("hidden", isOuder());
}


/* ======================================================================
   LOAD EVERYTHING
   ====================================================================== */
async function loadEverything() {
    loadingIndicator.classList.remove("hidden");
    errorIndicator.classList.add("hidden");

    try {
        const snap = await get(ref(db, speltak));
        if (!snap.exists()) throw new Error("Geen data gevonden");

        data = snap.val() || {};
        loadingIndicator.classList.add("hidden");

        opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({ id, ...v }));

        opkomsten.sort((a, b) => {
            const pa = isPast(a.datum);
            const pb = isPast(b.datum);
            if (pa !== pb) return pa ? 1 : -1;
            return compareDateTime(a, b);
        });

        nextUpcomingId = opkomsten.find(o => !isPast(o.datum))?.id || null;

        jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({
    id,
    naam: v.naam || "",
    WelpenNaam: v.WelpenNaam || "",
    // Nest altijd lowercase voor sortering
    Nest: (v.Nest || "").toLowerCase(),
    NestLeider: !!v.NestLeider,
    hidden: !!v.hidden,
    volgorde: v.volgorde ?? 999
})).sort((a, b) => a.volgorde - b.volgorde);

if (speltak === "welpen") {
    const NestOrder = { zwart: 1, bruin: 2, wit: 3, grijs: 4, "": 5, none: 5 };

    jeugd.sort((a, b) => {
        const na = NestOrder[a.Nest || "none"];
        const nb = NestOrder[b.Nest || "none"];
        if (na !== nb) return na - nb;

        // binnen een Nest eerst NestLeider
        if (a.NestLeider !== b.NestLeider) return a.NestLeider ? -1 : 1;

        return a.naam.localeCompare(b.naam);
    });
}


          leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
             id,
             naam: v.naam || "",
             WelpenNaam: v.WelpenNaam || "",
             hidden: !!v.hidden,
             volgorde: v.volgorde ?? 999
         })).sort((a, b) => a.volgorde - b.volgorde);

        renderEverything();

    } catch (err) {
        console.error(err);
        loadingIndicator.classList.add("hidden");
        errorIndicator.classList.remove("hidden");
        errorIndicator.textContent = "Kon geen verbinding maken met de database.";
    }
}

function renderEverything() {
    loadInfo();
    renderTable();
    renderLedenbeheer();
    renderMeldingen();
}

/* ======================================================================
   INFO BLOK
   ====================================================================== */
function loadInfo() {
    infoTekst.innerHTML = data.infotekst || "";
    infoEdit.innerHTML = data.infotekst || "";
}

function toggleInfoEdit() {
    if (!isLeiding()) return alert("Alleen leiding kan info bewerken.");
    infoEditActive = !infoEditActive;

    if (infoEditActive) {
        // Naar bewerk-modus
        infoEditorWrapper.classList.remove("hidden");
        infoTekst.classList.add("hidden");
        infoEditButton.textContent = "Opslaan info";
    } else {
        // Opslaan
        const sanitized = sanitizeText(infoEdit.innerHTML);

        update(ref(db, speltak), { infotekst: sanitized }).then(() => {
            // Lokale state en weergave direct bijwerken
            data.infotekst = sanitized;
            infoTekst.innerHTML = sanitized;
            infoEdit.innerHTML = sanitized;

            infoEditorWrapper.classList.add("hidden");
            infoTekst.classList.remove("hidden");
            infoEditButton.textContent = "Info bewerken";
        });
    }
}


/* ======================================================================
   TABEL — HEADER
   ====================================================================== */
function renderTable() {
    headerRowTop.innerHTML = "";
    if (headerRowBottom) headerRowBottom.innerHTML = "";
    tableBody.innerHTML = "";

    addHeaders();

    opkomsten
        .filter(o => {
            if (currentFilter === "future") return isFutureOrToday(o.datum);
            if (currentFilter === "past") return isPast(o.datum);
            return true;
        })
        .forEach(o => addRow(o));

    syncHorizontalScrollProxy();
}

function addHeaders() {
    const trTop = headerRowTop;
    const trBottom = headerRowBottom;

    const twoRows = speltak === "welpen" && trBottom;

    trTop.innerHTML = "";
    if (trBottom) trBottom.innerHTML = "";

    // Helper: header met optioneel rowSpan=2
    function addMainHeader(txt, cls) {
        const th = makeHeader(txt, cls);
        if (twoRows) th.rowSpan = 2;
        trTop.appendChild(th);
        return th;
    }

    // Extra kolom voor verwijderen in edit-modus
    if (isEdit()) {
        const th = document.createElement("th");
        if (twoRows) th.rowSpan = 2;
        trTop.appendChild(th);
    }

    addMainHeader("Datum", "col-datum");
    addMainHeader("Start");
    addMainHeader("Eind");

    if (!isOuder()) addMainHeader("Procor", "col-procor");

    const thType = addMainHeader("Type", "col-type");
    if (isOuder()) thType.classList.add("hide-view");

    addMainHeader("Thema", "col-thema");
    addMainHeader("Bijzonderheden", "col-bijzonderheden");

    if (config.showBert) addMainHeader("Bert logeert bij", "col-bert");

    const thLoc = addMainHeader("Locatie", "col-locatie");
    if (isOuder()) thLoc.classList.add("hide-view");

    const thMat = addMainHeader("Materiaal", "col-materiaal");
    if (isOuder()) thMat.classList.add("hide-view");

    // ===== JEUGD-KOLOMMEN =====
    const zichtbareJeugd = jeugd.filter(j => !j.hidden);

    if (!twoRows) {
        // Niet-welpen: bestaande verticale namen
        zichtbareJeugd.forEach(j => {
            const th = document.createElement("th");
            th.classList.add("col-jeugd");
            th.innerHTML = `<div class="name-vertical">${j.naam}</div>`;
            trTop.appendChild(th);
        });
    } else {
        // Welpen: boven WelpenNaam, onder echte naam
        zichtbareJeugd.forEach(j => {
            const Nest = (j.Nest || "").toLowerCase();
            const missing = !j.WelpenNaam || !j.WelpenNaam.trim();

            // Bovenste rij: WelpenNaam
            const thTop = document.createElement("th");
            thTop.classList.add("col-jeugd");
            if (Nest) thTop.classList.add(`nest-${Nest}`);

            const divTop = document.createElement("div");
            divTop.classList.add("name-vertical", "welpen-naam");
            if (missing) divTop.classList.add("welpen-missing");
            if (j.NestLeider) divTop.classList.add("welpen-leider");

            divTop.textContent = missing ? "❗" : j.WelpenNaam;
            thTop.appendChild(divTop);
            trTop.appendChild(thTop);

            // Onderste rij: echte naam
            const thBottom = document.createElement("th");
            thBottom.classList.add("col-jeugd");

            const divBottom = document.createElement("div");
            divBottom.classList.add("name-vertical", "welpen-naam-reallife");
            divBottom.textContent = j.naam;

            thBottom.appendChild(divBottom);
            trBottom.appendChild(thBottom);
        });
    }

    // Kijkers-kolom
    if (!isOuder()) addMainHeader("Kijkers");

    // Divider tussen jeugd en leiding
    const vJ = zichtbareJeugd.length;
    const vL = leiding.filter(l => !l.hidden).length;
    if (vJ > 0 && vL > 0) {
        const split = document.createElement("th");
        split.classList.add("col-divider");
        if (twoRows) split.rowSpan = 2;
        trTop.appendChild(split);
    }

    // ===== LEIDING-KOLOMMEN =====
    if (config.showLeiding) {
        const zichtbareLeiding = leiding.filter(l => !l.hidden);

        if (!twoRows) {
            zichtbareLeiding.forEach(l => {
                const th = document.createElement("th");
                th.classList.add("col-leiding");
                if (isOuder()) th.classList.add("hide-view");
                th.innerHTML = `<div class="name-vertical">${l.naam}</div>`;
                trTop.appendChild(th);
            });
        } else {
            zichtbareLeiding.forEach(l => {
                const missing = !l.WelpenNaam || !l.WelpenNaam.trim();

                // bovenste rij: WelpenNaam
                const thTop = document.createElement("th");
                thTop.classList.add("col-leiding");
                if (isOuder()) thTop.classList.add("hide-view");

                const divTop = document.createElement("div");
                divTop.classList.add("name-vertical", "welpen-naam");
                if (missing) divTop.classList.add("welpen-missing");
                divTop.textContent = missing ? "❗" : l.WelpenNaam;

                thTop.appendChild(divTop);
                trTop.appendChild(thTop);

                // onderste rij: echte naam
                const thBottom = document.createElement("th");
                thBottom.classList.add("col-leiding");
                if (isOuder()) thBottom.classList.add("hide-view");

                const divBottom = document.createElement("div");
                divBottom.classList.add("name-vertical", "welpen-naam-reallife");
                divBottom.textContent = l.naam;

                thBottom.appendChild(divBottom);
                trBottom.appendChild(thBottom);
            });
        }
    }

    // Extra + tellers (alleen voor leiding)
    if (!isOuder()) {
        if (isEdit()) {
            addMainHeader("Extra", "col-extra-aantal");
            addMainHeader("Extra", "col-extra-namen");
        } else {
            addMainHeader("Extra", "col-extra-namen");
        }

        addMainHeader("Aanw. jeugd");
        addMainHeader("Aanw. leiding");
    }
}

function makeHeader(txt, cls) {
    const th = document.createElement("th");
    th.textContent = txt;
    if (cls) th.classList.add(cls);
    return th;
}

function makeDivider() {
    const th = document.createElement("th");
    th.classList.add("col-divider");
    return th;
}

/* ======================================================================
   TABEL — ROWS
   ====================================================================== */
function addRow(o) {
    const tr = document.createElement("tr");
    tr.dataset.id = o.id; // nodig voor scroll + highlight na opslaan

    if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
    else if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
    else if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");

    if (isPast(o.datum) && o.typeOpkomst !== "geen") tr.classList.add("row-grey");
    if (o.id === nextUpcomingId) tr.classList.add("row-next");

    if (isEdit()) {
        const del = document.createElement("td");
        del.classList.add("editable-cell");
        del.textContent = "🗑️";
        del.addEventListener("click", () => {
            if (confirm("Deze opkomst verwijderen?")) {
                set(ref(db, `${speltak}/opkomsten/${o.id}`), null).then(loadEverything);
            }
        });
        tr.appendChild(del);
    }

    tr.appendChild(makeEditableCell(o, "datum", "col-datum", "date"));
    tr.appendChild(makeEditableCell(o, "starttijd", "", "time"));
    tr.appendChild(makeEditableCell(o, "eindtijd", "", "time"));

    if (!isOuder()) {
        tr.appendChild(makeEditableCell(o, "procor", "col-procor", "text"));
    }

    if (!isOuder()) {
        tr.appendChild(makeRestrictedEditable(
            o,
            "typeOpkomst",
            ["normaal", "bijzonder", "kamp", "geen"],
            "col-type"
        ));
    }

  tr.appendChild(makeEditableCell(o, "thema", "col-thema"));
tr.appendChild(makeEditableCell(o, "bijzonderheden", "col-bijzonderheden", "textarea"));

if (config.showBert) {
    tr.appendChild(makeEditableCell(o, "bert_met", "col-bert"));
}

    if (!isOuder()) {
        tr.appendChild(makeRestrictedEditable(
            o,
            "locatie",
            ["", "Kampvuurkuil", "Zandveld", "Grasveld", "De Hoop",
             "Bever lokaal", "Welpen lokaal", "Van terrein af",
             "Externe locatie", "Overig"],
            "col-locatie"
        ));
    }

    if (!isOuder()) {
        tr.appendChild(makeEditableCell(o, "materiaal", "col-materiaal"));
    }

    jeugd.forEach(j => {
        if (!j.hidden) tr.appendChild(makePresenceCell(o, j.id, j.hidden, false));
    });

    if (!isOuder()) {
        tr.appendChild(makeEditableCell(o, "kijkers", "", "number"));
    }

    const vJ = jeugd.filter(j => !j.hidden).length;
    const vL = leiding.filter(l => !l.hidden).length;
    if (vJ > 0 && vL > 0) tr.appendChild(makeDivider());

    if (config.showLeiding) {
        leiding.forEach(l => {
            if (!l.hidden) {
                tr.appendChild(makePresenceCell(o, `leiding-${l.id}`, l.hidden, true));
            }
        });
    }

    if (!isOuder()) {
        // In bewerkmodus: getal + namen; in view-modus: alleen namen
        if (isEdit()) {
            tr.appendChild(
                makeEditableCell(o, "extraAantal", "col-extra-aantal", "number")
            );
        }

        tr.appendChild(
            makeEditableCell(o, "extraNamen", "col-extra-namen")
        );

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

/* ======================================================================
   CELFUNCTIES — EDITABLE
   ====================================================================== */
function makeEditableCell(o, field, extraClass = "", inputType = "text") {
    const td = document.createElement("td");
    if (extraClass) td.classList.add(extraClass);

    const value = o[field] || "";

    // VIEW MODE
    if (!isEdit()) {
    if (inputType === "date" && value) {
        td.textContent = formatDateDisplay(value); // dd/mm/yyyy
    } else {
        td.textContent = value;
    }
    return td;
}

    td.classList.add("editable-cell");

    let input;

if (inputType === "textarea") {
    input = document.createElement("textarea");
    input.value = value;
    input.classList.add("cell-textarea");

    const autoSize = () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
    };

    input.addEventListener("input", autoSize);

    // eerste render
    setTimeout(autoSize, 0);
}

   else if (inputType === "date") {
        input = document.createElement("input");
        input.type = "date";
        input.value = value?.substring(0, 10) || "";
        input.classList.add("cell-input");
    } else {

        input = document.createElement("input");
        input.type = inputType;
        input.value = value;
        input.classList.add("cell-input");
    }

    input.addEventListener("blur", () => {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), {
            [field]: input.value
        });
    });

    td.appendChild(input);
    return td;
}

/* ======================================================================
   CELFUNCTIES — DROPDOWN
   ====================================================================== */
function makeRestrictedEditable(o, field, opties, extraClass = "") {
    const td = document.createElement("td");
    if (extraClass) td.classList.add(extraClass);

    const value = o[field] || "";

    if (!isEdit()) {
        td.textContent = value;
        return td;
    }

    td.classList.add("editable-cell");

    const select = document.createElement("select");
    select.classList.add("cell-select");

    opties.forEach(opt => {
        const op = document.createElement("option");
        op.value = opt;
        op.textContent = opt || "—";
        if (opt === value) op.selected = true;
        select.appendChild(op);
    });

    select.addEventListener("change", () => {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), {
            [field]: select.value
        });
    });

    td.appendChild(select);
    return td;
}

/* ======================================================================
   AANWEZIGHEID
   ====================================================================== */
function makePresenceCell(o, key, hidden, isLeidingCell) {
    const td = document.createElement("td");

    // basis-classes
    if (hidden) td.classList.add("hide-view");

    if (isLeidingCell) {
        td.classList.add("col-leiding");
        if (!isLeiding()) td.classList.add("hide-view");
    } else {
        td.classList.add("col-jeugd");
    }

    // volledig verbergen als het lid zelf verborgen is
    const isHiddenMember = key.startsWith("leiding-")
        ? leiding.find(l => l.id === key.replace("leiding-", ""))?.hidden
        : jeugd.find(j => j.id === key)?.hidden;

    if (isHiddenMember) {
        td.classList.add("hide-view");
        return td;
    }

    // huidige status + icoontje
    const cur = o.aanwezigheid?.[key] || "onbekend";
    const symbols = { aanwezig: "✔", afwezig: "✖", onbekend: "?" };

    td.textContent = symbols[cur];
    td.classList.add("presence-cell", `presence-${cur}`);

    // JEUGD: altijd klikbaar (ook voor ouders)
    if (!isLeidingCell) {
        td.classList.add("editable-cell");
        td.addEventListener("click", () => togglePresence(o, key));
    }
    // LEIDING: alleen zichtbaar/klikbaar als leiding
    else if (isLeiding()) {
        td.classList.add("editable-cell");
        td.addEventListener("click", () => togglePresence(o, key));
    }

    return td;
}

function togglePresence(o, key) {
    const cur = o.aanwezigheid?.[key] || "onbekend";
    const next =
        cur === "aanwezig" ? "afwezig" :
        cur === "afwezig" ? "onbekend" :
        "aanwezig";

    update(ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid`), {
        [key]: next
    }).then(loadEverything);
}

function countPresence(o) {
    let j = 0, l = 0;

    jeugd.forEach(x => {
        if (!x.hidden && o.aanwezigheid?.[x.id] === "aanwezig") j++;
    });

    if (config.showLeiding) {
        leiding.forEach(x => {
            if (!x.hidden && o.aanwezigheid?.[`leiding-${x.id}`] === "aanwezig") l++;
        });
    }

    j += Number(o.kijkers || 0);
    l += Number(o.extraAantal || 0);

    return [j, l];
}

/* ======================================================================
   LEDENBEHEER
   ====================================================================== */
function renderLedenbeheer() {
    ledenbeheerJeugd.innerHTML = "";
    ledenbeheerLeiding.innerHTML = "";

    jeugd.forEach(j => ledenbeheerJeugd.appendChild(makeMemberRow(j, "jeugd")));
    leiding.forEach(l => ledenbeheerLeiding.appendChild(makeMemberRow(l, "leiding")));
}
function makeMemberRow(obj, type) {
    const li = document.createElement("li");
    li.classList.add("draggable");
    li.draggable = true;
    li.dataset.id = obj.id;
    li.dataset.type = type;

    if (obj.hidden) li.classList.add("lid-verborgen");

    const icon = obj.hidden ? "🚫" : "👁️";

    li.innerHTML = `
        <span>${icon} ${obj.naam}</span>
        <div class="ledenbeheer-controls">
            <button data-act="edit">Bewerken</button>
            <button data-act="toggle">${obj.hidden ? "Toon" : "Verberg"}</button>
            <button data-act="del">🗑️</button>
        </div>
    `;

    // Buttons
    li.querySelectorAll("button").forEach(b =>
        b.addEventListener("click", (e) => {
            e.stopPropagation();
            handleMemberAction(obj, type, b.dataset.act);
        })
    );

    // Drag & drop
    function onDragStart(e) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", this.dataset.id);
    }

    function onDragOver(e) {
        e.preventDefault();
        this.classList.add("drag-over");
    }

    function onDragLeave() {
        this.classList.remove("drag-over");
    }

    function onDrop(e) {
        e.preventDefault();
        this.classList.remove("drag-over");

        const draggedId = e.dataTransfer.getData("text/plain");
        const targetId = this.dataset.id;

        if (draggedId === targetId) return;

        const list = type === "jeugd" ? jeugd : leiding;

        const fromIndex = list.findIndex(m => m.id === draggedId);
        const toIndex = list.findIndex(m => m.id === targetId);
        if (fromIndex === -1 || toIndex === -1) return;

        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);

        const updates = {};
        list.forEach((m, i) => {
            updates[`${speltak}/${type === "jeugd" ? "jeugdleden" : "leiding"}/${m.id}/volgorde`] = i + 1;
        });

        update(ref(db), updates).then(loadEverything);
    }

    li.addEventListener("dragstart", onDragStart);
    li.addEventListener("dragover", onDragOver);
    li.addEventListener("drop", onDrop);
    li.addEventListener("dragleave", onDragLeave);

    return li;
}

function handleMemberAction(obj, type, act) {
  if (!isLeiding()) {
    alert("Alleen leiding kan leden beheren.");
    return;
  }

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const list = type === "jeugd" ? jeugd : leiding;
  const baseRef = ref(db, `${speltak}/${path}/${obj.id}`);

   // Bewerken van lid
if (act === "edit") {
    if (!isLeiding()) return;

    openEditMember(obj, type);
    return;
}

  // Verwijderen
  if (act === "del") {
    if (confirm(`Verwijder ${obj.naam}?`)) {
      set(baseRef, null).then(loadEverything);
    }
    return;
  }

  // Verborgen / zichtbaar wisselen
  if (act === "toggle") {
    update(baseRef, { hidden: !obj.hidden }).then(loadEverything);
    return;
  }

}

function openEditMember(obj, type) {
    if (!isLeiding()) return;

    editingMemberId = obj.id;
    editingMemberType = type;

    // Titel aanpassen
    const title = memberModal.querySelector("h3");
    if (title) title.textContent = "Lid bewerken";

    // Type vastzetten tijdens bewerken
    memberType.value = type;
    memberType.disabled = true;

    memberName.value = obj.naam || "";

    if (speltak === "welpen" && welpenExtraFields) {
        memberWelpenNaam.value = obj.WelpenNaam || "";

        if (type === "jeugd") {
            memberNest.value = (obj.Nest || "").toLowerCase();
            memberNestLeider.checked = !!obj.NestLeider;
        } else {
            memberNest.value = "";
            memberNestLeider.checked = false;
        }
        toggleWelpenExtraFields();
    }

    memberModal.classList.remove("hidden");
}

/* ======================================================================
   MELDINGEN
   ====================================================================== */
function renderMeldingen() {
    meldingLeidingAan.checked = !!data.meldingLeidingAan;
    meldingOnbekendAan.checked = !!data.meldingOnbekendAan;
    leidingDrempel.value = typeof data.leidingDrempel === "number" ? data.leidingDrempel : 2;
}

function saveMeldingen() {
    if (!isLeiding()) return;

    update(ref(db, speltak), {
        meldingLeidingAan: !!meldingLeidingAan.checked,
        meldingOnbekendAan: !!meldingOnbekendAan.checked,
        leidingDrempel: Number(leidingDrempel.value || 2)
    });
}

meldingLeidingAan?.addEventListener("change", saveMeldingen);
meldingOnbekendAan?.addEventListener("change", saveMeldingen);
leidingDrempel?.addEventListener("input", saveMeldingen);

/* ======================================================================
   OPEN/CLOSE SECTIONS
   ====================================================================== */
function openSection(section) {
    if (!isLeiding()) return alert("Alleen leiding kan deze sectie openen.");
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth" });
}

openLedenbeheerButton?.addEventListener("click", () => openSection(ledenbeheerSection));
openMeldingenButton?.addEventListener("click", () => openSection(meldingenSection));

closeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) target.classList.add("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
});

/* ======================================================================
   MODALS — LEDEN
   ====================================================================== */
addMemberButton?.addEventListener("click", () => {
    if (!isLeiding()) return alert("Alleen leiding kan leden toevoegen.");

    editingMemberId = null;
    editingMemberType = null;

    const title = memberModal.querySelector("h3");
    if (title) title.textContent = "Nieuw lid toevoegen";

    memberType.disabled = false;
    memberType.value = "jeugd";
    memberName.value = "";

    if (speltak === "welpen" && welpenExtraFields) {
        memberWelpenNaam.value = "";
        memberNest.value = "";
        memberNestLeider.checked = false;
    }

    toggleWelpenExtraFields();
    memberModal.classList.remove("hidden");
});

cancelMember?.addEventListener("click", () => {
    memberModal.classList.add("hidden");
    editingMemberId = null;
    editingMemberType = null;
    memberType.disabled = false;
});

saveMember?.addEventListener("click", async () => {
    if (!isLeiding()) return;

    const naam = memberName.value.trim();
    if (!naam) {
        alert("Naam vereist");
        return;
    }

    const type = memberType.value === "leiding" ? "leiding" : "jeugd";
    const path = type === "jeugd" ? "jeugdleden" : "leiding";
    const isWelpen = speltak === "welpen";

    let updateObj = { naam };

    if (isWelpen) {
        const WelpNaam = (memberWelpenNaam?.value || "").trim();
        let Nest = "";
        let NestLeider = false;

        if (type === "jeugd") {
            Nest = (memberNest?.value || "").toLowerCase();
            NestLeider = memberNestLeider.checked && !!Nest;
        }

        updateObj.WelpenNaam = WelpNaam;
        updateObj.Nest = type === "jeugd" ? Nest : "";
        updateObj.NestLeider = type === "jeugd" ? NestLeider : false;
    }

    try {
        // Unieke NestLeider per Nest afdwingen
        if (isWelpen && type === "jeugd" && updateObj.Nest && updateObj.NestLeider) {
            const conflict = jeugd.find(j =>
                j.Nest === updateObj.Nest &&
                j.NestLeider &&
                j.id !== editingMemberId
            );

            if (conflict) {
                const overschrijf = confirm(
                    `Er is al een nestleider (${conflict.naam}) in Nest ${updateObj.Nest}. Overschrijven?`
                );
                if (!overschrijf) return;

                await update(ref(db, `${speltak}/jeugdleden/${conflict.id}`), {
                    NestLeider: false
                });
            }
        }

        if (editingMemberId) {
            // Bestaand lid bijwerken
            await update(ref(db, `${speltak}/${path}/${editingMemberId}`), updateObj);
        } else {
            // Nieuw lid
            const newRef = push(ref(db, `${speltak}/${path}`));
            await set(newRef, {
                hidden: false,
                volgorde: 999,
                ...updateObj
            });
        }

        memberModal.classList.add("hidden");
        editingMemberId = null;
        editingMemberType = null;

        memberType.disabled = false;
        await loadEverything();
    } catch (err) {
        console.error(err);
        alert("Opslaan mislukt, probeer het opnieuw.");
    }
});


/* ======================================================================
   MODALS — OPKOMST
   ====================================================================== */
cancelOpkomst?.addEventListener("click", () =>
    opModal.classList.add("hidden")
);

function resetOpkomstFields() {
    opDatum.value = "";
    opStart.value = defaultTime.start;
    opEind.value = defaultTime.eind;
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

fab?.addEventListener("click", () => {
    if (!isLeiding()) return;
    resetOpkomstFields();
    opModal.classList.remove("hidden");
});

saveOpkomst?.addEventListener("click", () => {
    if (!isLeiding()) return;
    if (!opDatum.value) return alert("Datum verplicht");

    const newRef = push(ref(db, `${speltak}/opkomsten`));

    const newObj = {
        id: newRef.key,
        datum: isoFromInput(opDatum.value),
        thema: opThema.value || "",
        procor: opProcor.value || "",
        bijzonderheden: opBijzonderheden.value || "",
        typeOpkomst: opType.value || "normaal",
        starttijd: opStart.value || "",
        eindtijd: opEind.value || "",
        locatie: opLocatie.value || "",
        materiaal: opMateriaal.value || "",
        kijkers: Number(opKijkers.value || 0),
        extraAantal: Number(opExtraAantal.value || 0),
        extraNamen: opExtraNamen.value || "",
        aanwezigheid: {}
    };

    if (config.showBert) newObj.bert_met = opBert.value || "";

    jeugd.forEach(j => newObj.aanwezigheid[j.id] = "onbekend");
    if (config.showLeiding)
        leiding.forEach(l => newObj.aanwezigheid[`leiding-${l.id}`] = "onbekend");
   
      set(newRef, newObj).then(() => {
    opModal.classList.add("hidden");

    loadEverything().then(() => {
        const row = document.querySelector(`tr[data-id="${newRef.key}"]`);
        if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.classList.add("row-highlight");
            setTimeout(() => row.classList.remove("row-highlight"), 2000);
        }
    });
});

});

/* ======================================================================
   PRINT / FILTERS
   ====================================================================== */
let currentFilter = "all";

filterAll?.addEventListener("click", () => {
    currentFilter = "all";
    filterAll.classList.add("active");
    filterFuture.classList.remove("active");
    filterPast.classList.remove("active");
    renderTable();
});

filterFuture?.addEventListener("click", () => {
    currentFilter = "future";
    filterFuture.classList.add("active");
    filterAll.classList.remove("active");
    filterPast.classList.remove("active");
    renderTable();
});

filterPast?.addEventListener("click", () => {
    currentFilter = "past";
    filterPast.classList.add("active");
    filterAll.classList.remove("active");
    filterFuture.classList.remove("active");
    renderTable();
});

printButton?.addEventListener("click", () => {
    const prevMode = mode;
    const prevFilter = currentFilter;

    // Print altijd als ouder
    setMode("ouder");

    // Alleen komende opkomsten tonen tijdens print
    currentFilter = "future";

    // Chips visueel updaten
    if (filterAll && filterFuture && filterPast) {
        filterAll.classList.remove("active");
        filterPast.classList.remove("active");
        filterFuture.classList.add("active");
    }

    // Tabel opnieuw renderen met alleen toekomstige opkomsten
    renderTable();

    setTimeout(() => {
        window.print();

        // Filter herstellen
        currentFilter = prevFilter;
        if (filterAll && filterFuture && filterPast) {
            filterAll.classList.remove("active");
            filterFuture.classList.remove("active");
            filterPast.classList.remove("active");

            if (prevFilter === "all")    filterAll.classList.add("active");
            if (prevFilter === "future") filterFuture.classList.add("active");
            if (prevFilter === "past")   filterPast.classList.add("active");
        }

        // Mode herstellen en tabel opnieuw tekenen
        setMode(prevMode);
    }, 150);
});

editModeButton?.addEventListener("click", () => {
    if (!isLeiding()) {
        alert("Log in als leiding om te bewerken.");
        return;
    }

    if (editMode) {
        // We gaan VAN bewerken NAAR bekijken → "opslaan"
        editMode = false;
        setMode("leiding");                 // terug naar normale leiding-weergave
        editModeButton.textContent = "✏️ Opkomsten bewerken";

        // Opnieuw uit de database laden zodat alle wijzigingen (incl. kleuren/tellers) zichtbaar zijn
        loadEverything();
    } else {
        // We gaan NAAR bewerkmodus
        editMode = true;
        setMode("leiding");                 // basis blijft leiding
        editModeButton.textContent = "💾 Wijzigingen opslaan";
    }
});

// =====================
// INFO-EDITOR SELECTIE
// =====================
let infoSelection = null;

function storeInfoSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    infoSelection = sel.getRangeAt(0);
}

function restoreInfoSelection() {
    if (!infoSelection) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(infoSelection);
}

// selectie opslaan als je in de editor klikt / typt
infoEdit?.addEventListener("mouseup", storeInfoSelection);
infoEdit?.addEventListener("keyup", storeInfoSelection);
infoEdit?.addEventListener("blur", storeInfoSelection);

/* ======================================================================
   INFO EDIT — Toolbar
   ====================================================================== */
infoEditButton?.addEventListener("click", toggleInfoEdit);

toolbarButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const cmd = btn.dataset.cmd;
        if (!cmd || !infoEdit) return;

        // focus + selectie herstellen in de editor
        infoEdit.focus();
        restoreInfoSelection();

        document.execCommand(cmd, false, null);
    });
});

colorPicker?.addEventListener("change", () => {
    if (!infoEdit) return;

    // focus + selectie herstellen in de editor
    infoEdit.focus();
    restoreInfoSelection();

    document.execCommand("foreColor", false, colorPicker.value);
});


/* ======================================================================
   LOGOUT
   ====================================================================== */
logoutButton?.addEventListener("click", () => {
    localStorage.setItem("mode", "ouder");
    setMode("ouder");
});
