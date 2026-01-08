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
    isoFromInput,
    sortOpkomsten,
    getNextUpcoming
} from "./utils.js";


import {
    initializeApp,
    getApp,
    getApps,
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

/* ======================================================================
   AUTH — rollen & rechten (nieuw login-systeem)
   ====================================================================== */

function getSession() {
  // Gebruik de centrale login.js sessie als die bestaat
  if (typeof window.getAuthSession === "function") return window.getAuthSession();
  try {
    return JSON.parse(localStorage.getItem("ovn_auth_session"));
  } catch {
    return null;
  }
}

function isLoggedIn() {
  if (typeof window.isLoggedIn === "function") return window.isLoggedIn();
  return !!getSession();
}

function isAdmin() {
  const s = getSession();
  return !!s?.roles?.admin;
}

function isBestuur() {
  const s = getSession();
  return !!s?.roles?.bestuur;
}

function hasSpeltakRechten() {
  const s = getSession();
  if (!s) return false;
  if (s.roles?.admin) return true;
  if (s.roles?.bestuur) return true;

  const sp = s.roles?.speltakken;

  // Ondersteun BOTH:
  // - array: ["bevers","welpen",...]
  // - object: { bevers: true, welpen: false, ... }
  if (Array.isArray(sp)) return sp.includes(speltak);
  if (sp && typeof sp === "object") return sp[speltak] === true;

  return false;
}


const config = window.speltakConfig || { showBert: false, showLeiding: true };

const app = getApps().length ? getApp() : initializeApp(window.firebaseConfig);
const db = getDatabase(app);
const PUBLIC_ROOT = `${speltak}/public`;
const PUBLIC_OPK_FIELDS = new Set([
  "datum",
  "starttijd",
  "eindtijd",
  "thema",
  "bijzonderheden",
  "typeOpkomst",
  "buddy",
  "bert_met"
]);

function isPublicOpkomstField(field) {
  return PUBLIC_OPK_FIELDS.has(field);
}


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

const jeugdContainer = document.getElementById("jeugdLeden");
const ledenbeheerLeiding = document.getElementById("leidingLeden");
const addMemberButton = document.getElementById("addMemberButton");

const meldingLeidingAan = document.getElementById("meldingLeidingAan");
const meldingOnbekendAan = document.getElementById("meldingOnbekendAan");
const leidingDrempel = document.getElementById("leidingDrempel");

const memberModal = document.getElementById("addMemberModal");
const memberType = document.getElementById("memberType");
const memberName = document.getElementById("memberName");

const welpenExtraFields = document.getElementById("welpenExtraFields");
const memberWelpenNaam = document.getElementById("memberWelpenNaam");
const memberNest = document.getElementById("memberNest");
const memberNestLeider = document.getElementById("memberNestLeider");

const scoutsExtraFields = document.getElementById("scoutsExtraFields");
const memberPloeg = document.getElementById("memberPloeg");
const memberPL = document.getElementById("memberPL");
const memberAPL = document.getElementById("memberAPL");


// Alleen tonen als speltak welpen is
if (welpenExtraFields) {
    if (speltak !== "welpen") {
        welpenExtraFields.style.display = "none";
    }
}

function toggleWelpenExtraFields() {
    if (!welpenExtraFields) return;

    if (speltak !== "welpen") {
        welpenExtraFields.classList.add("hidden");
        welpenExtraFields.style.display = "none";
        return;
    }

  if (memberType.value === "jeugd") {
    welpenExtraFields.classList.remove("hidden");
    welpenExtraFields.style.display = "block";

const nestFields = document.getElementById("welpenNestFields");
if (nestFields) nestFields.style.display = "block";
} else {
    // Leiding: wel welpennaam, geen nestinfo
    welpenExtraFields.classList.remove("hidden");
    welpenExtraFields.style.display = "block";

    document.getElementById("welpenNestFields").style.display = "none";
}
}


function toggleScoutsExtraFields() {
    if (!scoutsExtraFields) return;

    // Alleen zichtbaar bij speltak scouts
    if (speltak !== "scouts") {
        scoutsExtraFields.classList.add("hidden");
        scoutsExtraFields.style.display = "none";
        return;
    }

    // Alleen jeugdleden hebben een ploeg + PL/APL
    if (memberType.value === "jeugd") {
        scoutsExtraFields.classList.remove("hidden");
        scoutsExtraFields.style.display = "block";

        // Dropdown altijd opnieuw vullen
        fillScoutsPloegDropdown();

        const heeftPloeg = memberPloeg.value !== "";

        memberPL.disabled = !heeftPloeg;
        memberAPL.disabled = !heeftPloeg;

        if (!heeftPloeg) {
            memberPL.checked = false;
            memberAPL.checked = false;
        }
    } else {
        // Voor leiding alles verbergen en resetten
        scoutsExtraFields.classList.add("hidden");
        scoutsExtraFields.style.display = "";
        memberPloeg.value = "";
        memberPL.checked = false;
        memberAPL.checked = false;
        memberPL.disabled = true;
        memberAPL.disabled = true;
    }
}
// PL/APL wederzijds exclusief
memberPL?.addEventListener("change", () => {
    if (memberPL.checked) memberAPL.checked = false;
});

memberAPL?.addEventListener("change", () => {
    if (memberAPL.checked) memberPL.checked = false;
});

memberPloeg?.addEventListener("change", () => {
    const heeftPloeg = memberPloeg.value !== "";

    if (!heeftPloeg) {
        memberPL.checked = false;
        memberAPL.checked = false;
    }

    memberPL.disabled = !heeftPloeg;
    memberAPL.disabled = !heeftPloeg;
});

// Scouts ploegopties dynamisch vullen
const SCOUTS_OPTIES = [
    { value: "", label: "Geen ploeg" },
    { value: "meeuw", label: "Meeuwen" },
    { value: "reiger", label: "Reigers" },
    { value: "kievit", label: "Kieviten" },
    { value: "sperwer", label: "Sperwers" }
];

function fillScoutsPloegDropdown() {
    if (!memberPloeg) return;

    memberPloeg.innerHTML = ""; // leegmaken

    SCOUTS_OPTIES.forEach(opt => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        memberPloeg.appendChild(o);
    });
}

// Type-wissel: juiste extra velden tonen
memberType?.addEventListener("change", () => {
    toggleWelpenExtraFields();
    toggleScoutsExtraFields();
});



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

let editMode = false;

// ===============================
// UNDO BUFFER — OPKOMSTEN
// ===============================
let pendingDeleteOpkomst = null; // { id, data, timeout }

/* ======================================================================
   MODE FUNCTIONS
   ====================================================================== */
function isOuder() {
    return !isLoggedIn() || !hasSpeltakRechten();
}

function isLeiding() {
    return isLoggedIn() && hasSpeltakRechten();
}

// ----------------------------------------------------------------------
// MODE STATE
// ----------------------------------------------------------------------
let mode = isLeiding() ? "leiding" : "ouder";

// Edit-modus is nu een aparte vlag, en alleen geldig als je leiding bent
function isEdit() { 
  return editMode && isLeiding(); 
}

let currentFilter = "all";

// Initiele mode + data
setMode(isLeiding() ? "leiding" : "ouder");
loadEverything();

// ==========================================
// AUTH CHANGE LISTENER (LOGIN / LOGOUT)
// ==========================================
document.addEventListener("auth-changed", async () => {
  const newMode = isLeiding() ? "leiding" : "ouder";

  // Edit-mode altijd uit bij auth switch
  editMode = false;

  setMode(newMode);

  // Volledig opnieuw laden zodat tabel, headers,
  // kolommen en rechten kloppen
  await loadEverything();
});

function setMode(newMode) {
  // Validatie
  if (newMode !== "ouder" && newMode !== "leiding") {
    newMode = "ouder";
  }

  // Basis-modus opslaan
  mode = newMode;
  // NIET opslaan in localStorage — mode is page-local

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
  loadingIndicator?.classList.remove("hidden");
  errorIndicator?.classList.add("hidden");

  try {
    if (isOuder()) {
      // Ouder: alleen public
      const pubSnap = await get(ref(db, PUBLIC_ROOT));
      if (!pubSnap.exists()) throw new Error("Geen publieke data gevonden");
      data = pubSnap.val() || {};
    } else {
      // Leiding: private + public; merge jeugd-aanwezigheid uit public
      const [privSnap, pubSnap] = await Promise.all([
        get(ref(db, speltak)),
        get(ref(db, PUBLIC_ROOT))
      ]);

      if (!privSnap.exists()) throw new Error("Geen private data gevonden");

      data = privSnap.val() || {};
      const pub = pubSnap.exists() ? (pubSnap.val() || {}) : {};
      const pubOpkomsten = pub.opkomsten || {};

      if (data.opkomsten && pubOpkomsten) {
        Object.keys(data.opkomsten).forEach((opId) => {
          const pubAanw = pubOpkomsten?.[opId]?.aanwezigheid;
          if (!pubAanw) return;

          // Alleen jeugd keys mergen (geen leiding-*)
          const jeugdAanw = {};
          for (const [k, v] of Object.entries(pubAanw)) {
            if (!String(k).startsWith("leiding-")) jeugdAanw[k] = v;
          }

          data.opkomsten[opId].aanwezigheid = {
            ...(data.opkomsten[opId].aanwezigheid || {}),
            ...jeugdAanw
          };
        });
      }
    }

    loadingIndicator?.classList.add("hidden");

    // Opkomsten
    opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({ id, ...v }));
    opkomsten = sortOpkomsten(opkomsten);

    const nextUpcoming = getNextUpcoming(opkomsten);
    nextUpcomingId = nextUpcoming ? nextUpcoming.id : null;

    // Jeugd
    jeugd = Object.entries(data.jeugdleden || {})
      .map(([id, v]) => ({
        id,
        naam: v.naam || "",
        WelpenNaam: v.WelpenNaam || "",
        Nest: (v.Nest || "").toLowerCase(),
        NestLeider: !!v.NestLeider,
        Ploeg: (v.Ploeg || "").toLowerCase(),
        PL: !!v.PL,
        APL: !!v.APL,
        hidden: !!v.hidden,
        volgorde: v.volgorde ?? 999
      }))
      .sort((a, b) => a.volgorde - b.volgorde);

    if (speltak === "welpen") {
      const NestOrder = { zwart: 1, bruin: 2, wit: 3, grijs: 4, "": 5, none: 5 };
      jeugd.sort((a, b) => {
        const na = NestOrder[a.Nest || "none"];
        const nb = NestOrder[b.Nest || "none"];
        if (na !== nb) return na - nb;
        if (a.NestLeider !== b.NestLeider) return a.NestLeider ? -1 : 1;
        return a.naam.localeCompare(b.naam);
      });
    }

    if (speltak === "scouts") {
      const PLOEG_ORDER = { meeuw: 1, reiger: 2, kievit: 3, sperwer: 4, "": 5 };
      jeugd.sort((a, b) => {
        const pa = PLOEG_ORDER[a.Ploeg || ""] || 999;
        const pb = PLOEG_ORDER[b.Ploeg || ""] || 999;
        if (pa !== pb) return pa - pb;
        if (a.PL !== b.PL) return a.PL ? -1 : 1;
        if (a.APL !== b.APL) return a.APL ? -1 : 1;
        return a.naam.localeCompare(b.naam);
      });
    }

    // Leiding
    leiding = Object.entries(data.leiding || {})
      .map(([id, v]) => ({
        id,
        naam: v.naam || "",
        WelpenNaam: v.WelpenNaam || "",
        hidden: !!v.hidden,
        volgorde: v.volgorde ?? 999
      }))
      .sort((a, b) => a.volgorde - b.volgorde);

    renderEverything();
  } catch (err) {
    console.error(err);
    loadingIndicator?.classList.add("hidden");
    errorIndicator?.classList.remove("hidden");

    const msg = String(err?.message || err || "");
    const isPerm =
      err?.code === "PERMISSION_DENIED" ||
      msg.toLowerCase().includes("permission denied");

    errorIndicator.textContent = isPerm
      ? "Geen toegang tot deze data."
      : "Jaarplanning kon niet geladen worden.";

    opkomsten = [];
    renderTable();
  }
}


function renderEverything() {
    loadInfo();
    renderTable();
    renderLedenbeheer();
    renderMeldingen();

    // Na renderen pas scrollen/highlighten (dashboard → speltak)
    scrollToOpkomstFromHash();
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

Promise.all([
  update(ref(db, speltak), { infotekst: sanitized }),
  update(ref(db, PUBLIC_ROOT), { infotekst: sanitized })
]).then(() => {
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
// ===============================================
// WELPEN – NEST ORDER HELPERS
// ===============================================
const NEST_ORDER = ["zwart", "bruin", "wit", "grijs", ""];

function getNestIndex(nest) {
    const idx = NEST_ORDER.indexOf(nest || "");
    return idx === -1 ? 999 : idx;
}

// SCOUTS – PLOEG ORDER & MAPPING
const SCOUT_PLOEGEN = ["meeuw", "reiger", "kievit", "sperwer", ""];
const SCOUT_PLOEG_LABELS = {
    "meeuw": "Meeuwen",
    "reiger": "Reigers",
    "kievit": "Kieviten",
    "sperwer": "Sperwers",
    "": "Zonder ploeg"
};

/* ======================================================================
   SCOUTS — LEDENBEHEER
====================================================================== */
function renderLedenbeheerScouts() {
    const jeugdContainer = document.getElementById("jeugdLeden");
    const leidingContainer = ledenbeheerLeiding;
    if (!jeugdContainer || !leidingContainer) return;

    jeugdContainer.innerHTML = "";
    leidingContainer.innerHTML = "";

    const ICONS = {
        "sperwer": "assets/Ploegteken-sperwer.png",
        "kievit": "assets/Ploegteken-kievit.png",
        "reiger": "assets/Ploegteken-reiger.png",
        "meeuw": "assets/Ploegteken-meeuw.png",
        "": ""
    };

    const byPloeg = {};
    SCOUT_PLOEGEN.forEach(p => (byPloeg[p] = []));

    jeugd.forEach(j => {
        const key = j.Ploeg || "";
        if (!byPloeg[key]) byPloeg[key] = [];
        byPloeg[key].push(j);
    });

    SCOUT_PLOEGEN.forEach(ploeg => {
        const leden = byPloeg[ploeg];
        const label = SCOUT_PLOEG_LABELS[ploeg];
        const icon = ICONS[ploeg];

        const header = document.createElement("div");
        header.className = `ploeg-header ploeg-${ploeg}`;
        header.innerHTML = icon
            ? `<img src="${icon}" class="ploeg-icoon"> ${label}`
            : `${label}`;
        jeugdContainer.appendChild(header);

        leden
            .sort((a, b) => {
                if (a.PL !== b.PL) return a.PL ? -1 : 1;
                if (a.APL !== b.APL) return a.APL ? -1 : 1;
                return a.naam.localeCompare(b.naam);
            })
            .forEach(j => jeugdContainer.appendChild(makeMemberRowScouts(j)));
    });

    leiding.forEach(l => leidingContainer.appendChild(makeMemberRow(l, "leiding")));
}
function makeMemberRowScouts(obj) {
    const li = document.createElement("li");
    li.classList.add("draggable");
    li.draggable = true;
    li.dataset.id = obj.id;
    li.dataset.type = "jeugd";
    li.dataset.ploeg = obj.Ploeg || "";

    const icon = obj.hidden ? "🚫" : (obj.PL ? "✪" : obj.APL ? "☆" : "👁️");

    li.innerHTML = `
        <span>${icon} ${obj.naam}</span>
        <div class="ledenbeheer-controls">
            <button data-act="edit">Bewerken</button>
            <button data-act="toggle">${obj.hidden ? "Toon" : "Verberg"}</button>
            <button data-act="del">🗑️</button>
        </div>
    `;

    li.querySelectorAll("button").forEach(b =>
        b.addEventListener("click", (e) => {
            e.stopPropagation();
            handleMemberAction(obj, type, b.dataset.act);
        })
    );

    // DRAG & DROP
    li.addEventListener("dragstart", e => {
        e.dataTransfer.setData("id", obj.id);
    });

    li.addEventListener("dragover", e => {
        e.preventDefault();
        li.classList.add("drag-over");
    });

    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));

    li.addEventListener("drop", async e => {
    e.preventDefault();
    li.classList.remove("drag-over");

    const draggedId = e.dataTransfer.getData("id");
    const targetId = obj.id;

    if (!draggedId || draggedId === targetId) return;

    const dragged = jeugd.find(j => j.id === draggedId);
    if (!dragged) return;

    const oldPloeg = dragged.Ploeg || "";
    const newPloeg = obj.Ploeg || "";

    // ===============================
    // PLOEGWISSEL?
    // ===============================
    if (oldPloeg !== newPloeg) {
        const oldLabel = SCOUT_PLOEG_LABELS[oldPloeg];
        const newLabel = SCOUT_PLOEG_LABELS[newPloeg];

        const ok = confirm(
            `${dragged.naam} verplaatsen van '${oldLabel}' naar '${newLabel}'?\n\n` +
            `Let op: PL/APL rollen vervallen bij ploegwissel.`
        );
        if (!ok) return;

await update(ref(db, `${speltak}/jeugdleden/${dragged.id}`), {
  Ploeg: newPloeg,
  PL: false,
  APL: false,
  volgorde: 999
});

await update(ref(db, `${PUBLIC_ROOT}/jeugdleden/${dragged.id}`), {
  Ploeg: newPloeg,
  PL: false,
  APL: false,
  volgorde: 999
});

return loadEverything();

    }

    // ===============================
    // ZELFDE PLOEG → HERORDENEN
    // ===============================

    const ledenZelfdePloeg = jeugd
        .filter(j => (j.Ploeg || "") === oldPloeg)
        .sort((a, b) => a.volgorde - b.volgorde);

    const from = ledenZelfdePloeg.findIndex(j => j.id === draggedId);
    const to = ledenZelfdePloeg.findIndex(j => j.id === targetId);

    if (from === -1 || to === -1) return;

    // Verplaats
    ledenZelfdePloeg.splice(from, 1);
    ledenZelfdePloeg.splice(to, 0, dragged);

    // Volgorde veilig herschrijven
    const updates = {};
    ledenZelfdePloeg.forEach((j, i) => {
updates[`${speltak}/jeugdleden/${j.id}/volgorde`] = i + 1;
updates[`${PUBLIC_ROOT}/jeugdleden/${j.id}/volgorde`] = i + 1;
    });

    await update(ref(db), updates);
    loadEverything();
});

return li;
}
/* ======================================================================
   TABEL — HEADER
   ====================================================================== */
function renderTable() {
    headerRowTop.innerHTML = "";
    if (headerRowBottom) headerRowBottom.innerHTML = "";
    tableBody.innerHTML = "";

    addHeaders();

    const visible = opkomsten.filter(o => {
        if (currentFilter === "future") return isFutureOrToday(o.datum);
        if (currentFilter === "past") return isPast(o.datum);
        return true;
    });

    // Lege staten
    if (!opkomsten || opkomsten.length === 0) {
        renderEmptyTableState("nodata");
        syncHorizontalScrollProxy();
        return;
    }

    if (visible.length === 0) {
        renderEmptyTableState("filtered");
        syncHorizontalScrollProxy();
        return;
    }

   
visible.forEach(o => addRow(o));
if (isLeiding()) addTotalsRow();

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
    th.classList.add("col-delete");
    if (twoRows) th.rowSpan = 2;
    trTop.appendChild(th);
}


    addMainHeader("Datum", "col-datum");
    addMainHeader("Start");
    addMainHeader("Eind");

    if (!isOuder()) addMainHeader("Procor", "col-procor");
   
    // Explorers: Buddy-kolom (altijd zichtbaar)
      if (["explorers", "rovers"].includes(speltak)) {
          addMainHeader("Buddy", "col-buddy");
      }


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
    zichtbareJeugd.forEach(j => {
        const th = document.createElement("th");
        th.classList.add("col-jeugd");

        // SCOUTS kleurmarkeringen
        if (speltak === "scouts") {
            const ploeg = j.Ploeg || "";
            th.classList.add(`ploeg-${ploeg}`);
        }

        // Icons bij PL/APL
        let icon = "";
        if (j.PL) icon = "✪ ";
        else if (j.APL) icon = "☆ ";

        th.innerHTML = `<div class="name-vertical">${icon}${j.naam}</div>`;
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
if (!isOuder()) addMainHeader("Kijkers", "col-kijkers");

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

addMainHeader(config.showLeiding ? "Aanw. jeugd" : "Aanw. leden", "col-aanw-jeugd");
if (config.showLeiding) addMainHeader("Aanw. leiding", "col-aanw-leiding");


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
function getTableColCount() {
  // Beste indicatie: aantal headers in de bovenste header-rij
  // (werkt ook voor Welpen met 2 header-rijen)
  return headerRowTop?.children?.length || 1;
}

function renderEmptyTableState(kind) {
  // kind: "nodata" | "filtered" | "error"
  const tr = document.createElement("tr");
  tr.classList.add("row-empty");

  const td = document.createElement("td");
  td.classList.add("empty-state-cell");
  td.colSpan = getTableColCount();

  const isLead = isLeiding();

  let title = "";
  let body = "";

  if (kind === "nodata") {
    title = "Nog geen opkomsten.";
    body = isLead
      ? "Je kunt meteen een eerste opkomst toevoegen via ‘Nieuwe opkomst +’."
      : "Er zijn nog geen opkomsten gepland. Kom later terug of vraag de leiding om de jaarplanning te vullen.";
  } else if (kind === "filtered") {
    title = "Geen opkomsten zichtbaar met dit filter.";
    body = "Zet het filter op ‘Alles’ of kies ‘Komend’/‘Verleden’ om andere opkomsten te zien.";
  } else {
    title = "Jaarplanning kon niet geladen worden.";
    body = "Controleer je verbinding en probeer het later opnieuw.";
  }

  td.innerHTML = `
    <div class="empty-state">
      <div class="empty-title">${title}</div>
      <div class="empty-body">${body}</div>
    </div>
  `;

  tr.appendChild(td);
  tableBody.appendChild(tr);
}

function showUndoBanner(message, onUndo) {
    let banner = document.getElementById("undoBanner");

    if (!banner) {
        banner = document.createElement("div");
        banner.id = "undoBanner";
        banner.className = "undo-banner";
        document.body.appendChild(banner);
    }

    banner.innerHTML = `
        <span>${message}</span>
        <button id="undoDeleteBtn">Ongedaan maken</button>
    `;

    banner.classList.add("visible");

    document.getElementById("undoDeleteBtn").onclick = () => {
        banner.classList.remove("visible");
        onUndo();
    };
}

function hideUndoBanner() {
    const banner = document.getElementById("undoBanner");
    if (banner) banner.classList.remove("visible");
}


/* ======================================================================
   TABEL — ROWS
   ====================================================================== */
function addRow(o) {
    const tr = document.createElement("tr");
    tr.dataset.id = o.id; // nodig voor scroll + highlight na opslaan
      tr.dataset.opkomstDatum = o.datum;

const past = isPast(o.datum);

// Verleden: altijd volledig grijs, geen andere kleurmarkeringen
if (past) {
  tr.classList.add("row-grey");
} else {
  // Type-kleuren (alleen voor vandaag/toekomst)
  if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
  else if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
  else if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");

  // Next-highlight mag NIET over "geen" heen
  if (o.id === nextUpcomingId && o.typeOpkomst !== "geen") {
    tr.classList.add("row-next");
  }
}


if (isEdit()) {
  const del = document.createElement("td");
  del.classList.add("editable-cell", "col-delete");
  del.textContent = "🗑️";

    del.addEventListener("click", () => {
        if (!isLeiding()) return;

        if (!confirm("Deze opkomst verwijderen?")) return;

        // Als er al een pending delete is: eerst afronden
        if (pendingDeleteOpkomst?.timeout) {
            clearTimeout(pendingDeleteOpkomst.timeout);
            pendingDeleteOpkomst = null;
            hideUndoBanner();
        }

        // Data veiligstellen
        const snapshot = { ...o };

        // UI: direct verwijderen uit lokale state
        opkomsten = opkomsten.filter(x => x.id !== o.id);
        renderTable();

        // Undo instellen
        const timeout = setTimeout(async () => {
await set(ref(db, `${speltak}/opkomsten/${o.id}`), null);
await set(ref(db, `${PUBLIC_ROOT}/opkomsten/${o.id}`), null);
pendingDeleteOpkomst = null;
hideUndoBanner();
loadEverything();

        }, 5000); // 5 seconden undo-tijd

        pendingDeleteOpkomst = {
            id: o.id,
            data: snapshot,
            timeout
        };

        showUndoBanner("Opkomst verwijderd.", () => {
            clearTimeout(timeout);
            pendingDeleteOpkomst = null;

            // Terugzetten in lokale state
            opkomsten.push(snapshot);
            // Her-sorteren + next bepalen gebeurt in loadEverything
            loadEverything();
        });
    });

    tr.appendChild(del);
}

    tr.appendChild(makeEditableCell(o, "datum", "col-datum", "date"));
    tr.appendChild(makeEditableCell(o, "starttijd", "", "time"));
    tr.appendChild(makeEditableCell(o, "eindtijd", "", "time"));

    if (!isOuder()) {
        tr.appendChild(
           makeEditableCell(o, "procor", "col-procor", "text"));
    }
   // Explorers: Buddy-veld (altijd zichtbaar)
   if (["explorers", "rovers"].includes(speltak)) {
          tr.appendChild(
              makeEditableCell(o, "buddy", "col-buddy", "text")
          );
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
      tr.appendChild(makeEditableCell(o, "kijkers", "col-kijkers", "number"));
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
tdJ.classList.add("col-aanw-jeugd");
tdJ.textContent = cntJ;
tr.appendChild(tdJ);

if (config.showLeiding) {
  const tdL = document.createElement("td");
  tdL.classList.add("col-aanw-leiding");
  tdL.textContent = cntL;
  tr.appendChild(tdL);
}


    }

    tableBody.appendChild(tr);
}
function addTotalsRow() {
  const zichtbareJeugd = jeugd.filter(j => !j.hidden);
  const zichtbareLeiding = config.showLeiding ? leiding.filter(l => !l.hidden) : [];

  // Als er geen ledenkolommen zijn, heeft een totals-row geen zin
  if (zichtbareJeugd.length === 0 && zichtbareLeiding.length === 0) return;

  // Totals tellen over ALLE opkomsten (ongeacht filter)
  const totals = {};
  zichtbareJeugd.forEach(j => (totals[j.id] = 0));
  zichtbareLeiding.forEach(l => (totals[`leiding-${l.id}`] = 0));

  (opkomsten || []).forEach(o => {
    zichtbareJeugd.forEach(j => {
      if (o.aanwezigheid?.[j.id] === "aanwezig") totals[j.id]++;
    });
    zichtbareLeiding.forEach(l => {
      const key = `leiding-${l.id}`;
      if (o.aanwezigheid?.[key] === "aanwezig") totals[key]++;
    });
  });

  const tr = document.createElement("tr");
  tr.classList.add("row-totals");

  const emptyTd = (cls = "") => {
    const td = document.createElement("td");
    if (cls) td.classList.add(cls);
    return td;
  };

  // Zelfde kolom-structuur als addRow(), maar dan leeg/label + totals in ledenkolommen
  if (isEdit()) tr.appendChild(emptyTd()); // delete-kolom

  const tdLabel = document.createElement("td");
  tdLabel.classList.add("col-datum", "totals-label");
  tdLabel.textContent = "Totaal aanwezig";
  tr.appendChild(tdLabel);

  tr.appendChild(emptyTd()); // start
  tr.appendChild(emptyTd()); // eind

  if (!isOuder()) tr.appendChild(emptyTd("col-procor"));

  if (["explorers", "rovers"].includes(speltak)) {
    tr.appendChild(emptyTd("col-buddy"));
  }

  if (!isOuder()) tr.appendChild(emptyTd("col-type"));

  tr.appendChild(emptyTd("col-thema"));
  tr.appendChild(emptyTd("col-bijzonderheden"));

  if (config.showBert) tr.appendChild(emptyTd("col-bert"));

  if (!isOuder()) tr.appendChild(emptyTd("col-locatie"));
  if (!isOuder()) tr.appendChild(emptyTd("col-materiaal"));

  // Jeugd totals
  zichtbareJeugd.forEach(j => {
    const td = document.createElement("td");
    td.classList.add("col-jeugd");
    td.textContent = String(totals[j.id] ?? 0);
    tr.appendChild(td);
  });

  // Kijkers kolom (bestaat alleen voor leiding)
  if (!isOuder()) tr.appendChild(emptyTd());

  // Divider
  if (zichtbareJeugd.length > 0 && zichtbareLeiding.length > 0) {
    const tdDiv = document.createElement("td");
    tdDiv.classList.add("col-divider");
    tr.appendChild(tdDiv);
  }

  // Leiding totals
  if (config.showLeiding) {
    zichtbareLeiding.forEach(l => {
      const key = `leiding-${l.id}`;
      const td = document.createElement("td");
      td.classList.add("col-leiding");
      if (isOuder()) td.classList.add("hide-view");
      td.textContent = String(totals[key] ?? 0);
      tr.appendChild(td);
    });
  }

  // Extra + aanw tellers kolommen (alleen leiding)
  if (!isOuder()) {
    if (isEdit()) tr.appendChild(emptyTd("col-extra-aantal"));
    tr.appendChild(emptyTd("col-extra-namen"));
    tr.appendChild(emptyTd()); // Aanw. jeugd
    tr.appendChild(emptyTd()); // Aanw. leiding
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

input.addEventListener("blur", async () => {
  let val = input.value;

  // datum consistent opslaan
  if (inputType === "date") val = isoFromInput(val);

  await update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: val });

  if (isPublicOpkomstField(field)) {
    await update(ref(db, `${PUBLIC_ROOT}/opkomsten/${o.id}`), { [field]: val });
  }
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

 select.addEventListener("change", async () => {
  const newType = select.value;

  // 1) Private opslaan
  await update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: newType });

  // 2) Public type ook bijhouden
  if (field === "typeOpkomst") {
    await update(ref(db, `${PUBLIC_ROOT}/opkomsten/${o.id}`), { typeOpkomst: newType });
  }

  // 3) Als type = "geen" → private alles afwezig + public jeugd afwezig
  if (field === "typeOpkomst" && newType === "geen") {
    const updates = {};

    // private jeugd + leiding
    jeugd.forEach(j => {
      updates[`${speltak}/opkomsten/${o.id}/aanwezigheid/${j.id}`] = "afwezig";
    });
    leiding.forEach(l => {
      updates[`${speltak}/opkomsten/${o.id}/aanwezigheid/leiding-${l.id}`] = "afwezig";
    });

    // public: alleen jeugd
    jeugd.forEach(j => {
      updates[`${PUBLIC_ROOT}/opkomsten/${o.id}/aanwezigheid/${j.id}`] = "afwezig";
    });

    await update(ref(db), updates);
  }

  // 4) Herladen
  loadEverything();
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
   const m = key.startsWith("leiding-")
    ? leiding.find(l => l.id === key.replace("leiding-", ""))
    : jeugd.find(j => j.id === key);

if (!m) {
    td.classList.add("hide-view");
    return td;
}
   // SCOUTS — kleuraccent per ploeg
if (speltak === "scouts" && !isLeidingCell) {
    const ploeg = (m.Ploeg || "").toLowerCase();
    td.classList.add("scouts-accent");

    if (ploeg === "sperwer") td.classList.add("presence-scout-sperwer");
    else if (ploeg === "kievit") td.classList.add("presence-scout-kievit");
    else if (ploeg === "reiger") td.classList.add("presence-scout-reiger");
    else if (ploeg === "meeuw") td.classList.add("presence-scout-meeuw");
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

async function togglePresence(o, key) {
  const cur = o.aanwezigheid?.[key] || "onbekend";
  const next =
    cur === "aanwezig" ? "afwezig" :
    cur === "afwezig" ? "onbekend" :
    "aanwezig";

  // Jeugd (ouders + leiding) → PUBLIC
  if (!String(key).startsWith("leiding-")) {
    await set(ref(db, `${PUBLIC_ROOT}/opkomsten/${o.id}/aanwezigheid/${key}`), next);
    return loadEverything();
  }

  // Leiding → PRIVATE (alleen als je leiding bent)
  if (!isLeiding()) return;

  await set(ref(db, `${speltak}/opkomsten/${o.id}/aanwezigheid/${key}`), next);
  return loadEverything();
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
  const jeugdContainer = document.getElementById("jeugdLeden");
  const leidingContainer = ledenbeheerLeiding;

  // jeugdContainer is verplicht; leidingContainer alleen als we leiding tonen
  if (!jeugdContainer) return;
  if (config.showLeiding && !leidingContainer) return;

  const ledenOnly = !config.showLeiding;

  // Kopjes / kolommen aanpassen in leden-only speltakken (rovers/stam)
  const jeugdCol = jeugdContainer.closest(".ledenbeheer-col");
  const jeugdH3 = jeugdCol?.querySelector("h3");
  if (jeugdH3) jeugdH3.textContent = ledenOnly ? "Leden" : "Jeugdleden";

  const leidingCol = leidingContainer?.closest(".ledenbeheer-col");
  if (leidingCol) leidingCol.style.display = ledenOnly ? "none" : "";

  // Melding “te weinig leiding” is irrelevant bij leden-only
  const leidingMeldingRow =
    document.getElementById("meldingLeidingAan")?.closest(".meldingen-row");
  if (leidingMeldingRow) leidingMeldingRow.style.display = ledenOnly ? "none" : "";

  // Scouts hebben eigen systeem
  if (speltak === "scouts") return renderLedenbeheerScouts();

  // Welpen: bestaande nestlogica
  if (speltak === "welpen") {
    jeugdContainer.innerHTML = "";
    if (leidingContainer) leidingContainer.innerHTML = "";

    const byNest = {};
    jeugd.forEach(j => {
      const key = j.Nest || "";
      if (!byNest[key]) byNest[key] = [];
      byNest[key].push(j);
    });

    Object.keys(byNest)
      .sort((a, b) => getNestIndex(a) - getNestIndex(b))
      .forEach(nest => {
        const niceName =
          nest === "zwart" ? "Zwart" :
          nest === "bruin" ? "Bruin" :
          nest === "wit"   ? "Wit" :
          nest === "grijs" ? "Grijs" :
          "Nestloos";

        const header = document.createElement("div");
        header.className = "nest-header";
        header.textContent = niceName;
        jeugdContainer.appendChild(header);

        byNest[nest]
          .sort((a, b) => a.volgorde - b.volgorde)
          .forEach(j => jeugdContainer.appendChild(makeMemberRow(j, "jeugd")));
      });

    if (!ledenOnly && leidingContainer) {
      leiding.forEach(l => leidingContainer.appendChild(makeMemberRow(l, "leiding")));
    }
    return;
  }

  // Overige speltakken: simpele lijst
  jeugdContainer.innerHTML = "";
  if (leidingContainer) leidingContainer.innerHTML = "";

  jeugd.forEach(j => jeugdContainer.appendChild(makeMemberRow(j, "jeugd")));

  if (!ledenOnly && leidingContainer) {
    leiding.forEach(l => leidingContainer.appendChild(makeMemberRow(l, "leiding")));
  }
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

    // Misdrop tussen jeugd ↔ leiding → altijd terug
    if (this.dataset.type !== type) {
        renderLedenbeheer();
        return;
    }

    const dragged = list.find(m => m.id === draggedId);
    const target  = list.find(m => m.id === targetId);

    const oldNest = dragged.Nest || "";
    const newNest = target.Nest || "";

    // ❗ Als nest verandert → popup
    if (type === "jeugd" && oldNest !== newNest) {
        const oldLabel = oldNest || "Nestloos";
        const newLabel = newNest || "Nestloos";

        const icons = {
            zwart: "⚫", bruin: "🟤", wit: "⚪", grijs: "⚫"
        };

        const iconOld = icons[oldNest] || "";
        const iconNew = icons[newNest] || "";

        const ok = confirm(
            `${dragged.naam} verplaatsen van ${iconOld} ${oldLabel} naar ${iconNew} ${newLabel}?`
        );

        if (!ok) {
            renderLedenbeheer();
            return;
        }

        // Nest daadwerkelijk aanpassen
        dragged.Nest = newNest;
        dragged.NestLeider = false; // nestleider wordt niet automatisch meegenomen
    }

    // NORMAAL sorteren
    const fromIndex = list.indexOf(dragged);
    const toIndex = list.indexOf(target);
    list.splice(fromIndex, 1);
    list.splice(toIndex, 0, dragged);

    // volgorde opslaan
    const updates = {};
    list.forEach((m, i) => {
updates[`${speltak}/${type === "jeugd" ? "jeugdleden" : "leiding"}/${m.id}/volgorde`] = i + 1;

if (type === "jeugd") {
  updates[`${speltak}/jeugdleden/${m.id}/Nest`] = m.Nest || "";

  // public mirror
  updates[`${PUBLIC_ROOT}/jeugdleden/${m.id}/volgorde`] = i + 1;
  updates[`${PUBLIC_ROOT}/jeugdleden/${m.id}/Nest`] = m.Nest || "";
}

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
Promise.all([
  set(baseRef, null),
  type === "jeugd" ? set(ref(db, `${PUBLIC_ROOT}/jeugdleden/${obj.id}`), null) : Promise.resolve()
]).then(loadEverything);
    }
    return;
  }

  // Verborgen / zichtbaar wisselen
  if (act === "toggle") {
Promise.all([
  update(baseRef, { hidden: !obj.hidden }),
  type === "jeugd"
    ? update(ref(db, `${PUBLIC_ROOT}/jeugdleden/${obj.id}`), { hidden: !obj.hidden })
    : Promise.resolve()
]).then(loadEverything);
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
        memberNest.parentElement.style.display = "block";
        memberNestLeider.parentElement.style.display = "block";

        memberNest.value = (obj.Nest || "").toLowerCase();
        memberNestLeider.checked = !!obj.NestLeider;

    } else {
        // Leiding → wel WelpenNaam, geen nestinfo
        memberNest.parentElement.style.display = "none";
        memberNestLeider.parentElement.style.display = "none";
    }

    welpenExtraFields.classList.remove("hidden");
    welpenExtraFields.style.display = "block";
}
   
    // SCOUTS — juiste werking bij bewerken
if (speltak === "scouts" && scoutsExtraFields) {

    fillScoutsPloegDropdown();

    if (type === "jeugd") {
        memberPloeg.value = obj.Ploeg || "";
        memberPL.checked = !!obj.PL;
        memberAPL.checked = !!obj.APL;

        const heeftPloeg = memberPloeg.value !== "";
        memberPL.disabled = !heeftPloeg;
        memberAPL.disabled = !heeftPloeg;

        scoutsExtraFields.classList.remove("hidden");
        scoutsExtraFields.style.display = "block";

    } else {
        // Leiding heeft geen scout-extra's
        memberPloeg.value = "";
        memberPL.checked = false;
        memberAPL.checked = false;
        memberPL.disabled = true;
        memberAPL.disabled = true;

        scoutsExtraFields.classList.add("hidden");
        scoutsExtraFields.style.display = "none";
    }
}
      memberModal.classList.remove("hidden");
}
/* ======================================================================
   MELDINGEN
   ====================================================================== */
function renderMeldingen() {
   if (!meldingLeidingAan || !meldingOnbekendAan || !leidingDrempel) return;
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
    if (!section) return;
    if (!isLeiding()) return alert("Alleen leiding kan deze sectie openen.");

    section.classList.remove("hidden");
    try { section.scrollIntoView({ behavior: "smooth" }); } catch (e) {}
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

    // WELPEN extra velden resetten
    if (speltak === "welpen" && welpenExtraFields) {
        memberWelpenNaam.value = "";
        memberNest.value = "";
        memberNestLeider.checked = false;
    }
   
// WELPEN extra velden resetten (alleen als ze bestaan)
if (welpenExtraFields) {
    welpenExtraFields.classList.add("hidden");
    welpenExtraFields.style.display = "none";
}

   // SCOUTS extra velden resetten
if (scoutsExtraFields) {
    scoutsExtraFields.classList.add("hidden");
    scoutsExtraFields.style.display = "none";
}
   
    // SCOUTS extra velden resetten
    if (speltak === "scouts" && scoutsExtraFields) {
        fillScoutsPloegDropdown();
        memberPloeg.value = "";
        memberPL.checked = false;
        memberAPL.checked = false;
        memberPL.disabled = true;
        memberAPL.disabled = true;
    }
// juiste extra velden tonen obv type + speltak
toggleWelpenExtraFields();
toggleScoutsExtraFields();
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
    const isScouts = speltak === "scouts";

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

        if (isScouts) {
                let Ploeg = "";
                let PL = false;
                let APL = false;
            
                if (type === "jeugd") {
                    Ploeg = (memberPloeg?.value || "").toLowerCase();
                    PL = memberPL.checked;
                    APL = memberAPL.checked;
                }
            
                updateObj.Ploeg = Ploeg;
                updateObj.PL = PL;
                updateObj.APL = APL;
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

            // SCOUTS — Uniciteit PL + APL per ploeg
            if (isScouts && type === "jeugd" && updateObj.Ploeg) {
            
                // Check PL
                if (updateObj.PL) {
                    const conflictPL = jeugd.find(j =>
                        j.Ploeg === updateObj.Ploeg &&
                        j.PL &&
                        j.id !== editingMemberId
                    );
            
                    if (conflictPL) {
                        const ok = confirm(
                            `Er is al een PL (${conflictPL.naam}) in ploeg ${updateObj.Ploeg}. Overschrijven?`
                        );
                        if (!ok) return;
            
                        await update(ref(db, `${speltak}/jeugdleden/${conflictPL.id}`), { PL: false });
                    }
                }
                // Check APL
                if (updateObj.APL) {
                    const conflictAPL = jeugd.find(j =>
                        j.Ploeg === updateObj.Ploeg &&
                        j.APL &&
                        j.id !== editingMemberId
                    );
            
                    if (conflictAPL) {
                        const ok = confirm(
                            `Er is al een APL (${conflictAPL.naam}) in ploeg ${updateObj.Ploeg}. Overschrijven?`
                        );
                        if (!ok) return;
            
                        await update(ref(db, `${speltak}/jeugdleden/${conflictAPL.id}`), { APL: false });
                    }
                }
            }
            
                          
if (editingMemberId) {
  // Bestaand lid bijwerken (private)
  await update(ref(db, `${speltak}/${path}/${editingMemberId}`), updateObj);

  // Jeugd ook naar public
  if (type === "jeugd") {
    await update(ref(db, `${PUBLIC_ROOT}/jeugdleden/${editingMemberId}`), updateObj);
  }
} else {
  // Nieuw lid (private)
  const newRef = push(ref(db, `${speltak}/${path}`));
  const base = { hidden: false, volgorde: 999, ...updateObj };
  await set(newRef, base);

  // Jeugd ook naar public
  if (type === "jeugd") {
    await set(ref(db, `${PUBLIC_ROOT}/jeugdleden/${newRef.key}`), base);
  }
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

    // Automatisch datum +7 dagen
    if (opkomsten.length > 0) {
        const last = opkomsten[opkomsten.length - 1];
        const nextDate = new Date(last.datum);
        nextDate.setDate(nextDate.getDate() + 7);
        opDatum.value = nextDate.toISOString().substring(0, 10);
    }

    opModal.classList.remove("hidden");
});

saveOpkomst?.addEventListener("click", async () => {
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
    buddy: (["explorers", "rovers"].includes(speltak) ? (opProcor?.value || "") : "") || "", // als je buddy apart hebt, zet hier jouw buddy input
    kijkers: Number(opKijkers.value || 0),
    extraAantal: Number(opExtraAantal.value || 0),
    extraNamen: opExtraNamen.value || "",
    aanwezigheid: {}
  };

  // BERT
  if (config.showBert) newObj.bert_met = opBert?.value || "";

  // Automatisch aanwezigheid init
  if (opType.value === "geen") {
    jeugd.forEach(j => (newObj.aanwezigheid[j.id] = "afwezig"));
    leiding.forEach(l => (newObj.aanwezigheid[`leiding-${l.id}`] = "afwezig"));
  } else {
    jeugd.forEach(j => (newObj.aanwezigheid[j.id] = "onbekend"));
    leiding.forEach(l => (newObj.aanwezigheid[`leiding-${l.id}`] = "onbekend"));
  }

  try {
    // 1) private opslaan
    await set(newRef, newObj);

    // 2) public mirror opslaan (alleen public velden + jeugd-aanwezigheid)
    const publicObj = {
      datum: newObj.datum,
      starttijd: newObj.starttijd,
      eindtijd: newObj.eindtijd,
      thema: newObj.thema,
      bijzonderheden: newObj.bijzonderheden,
      typeOpkomst: newObj.typeOpkomst || "normaal",
      buddy: newObj.buddy || "",
      bert_met: newObj.bert_met || "",
      aanwezigheid: {}
    };

    jeugd.forEach(j => {
      publicObj.aanwezigheid[j.id] = newObj.aanwezigheid?.[j.id] || "onbekend";
    });

    await set(ref(db, `${PUBLIC_ROOT}/opkomsten/${newRef.key}`), publicObj);

    opModal.classList.add("hidden");
    await loadEverything();

    const row = document.querySelector(`tr[data-id="${newRef.key}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("row-highlight");
      setTimeout(() => row.classList.remove("row-highlight"), 2000);
    }
  } catch (err) {
    console.error(err);
    alert("Opslaan mislukt, probeer het opnieuw.");
  }
});


/* ======================================================================
   PRINT / FILTERS
   ====================================================================== */


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

   scrollToOpkomstFromHash();


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

editModeButton?.addEventListener("click", async () => {
    if (!isLeiding()) {
        alert("Log in als leiding om te bewerken.");
        return;
    }

    // --- UIT bewerken: opslaan ---
    if (editMode) {
        editMode = false;
        setMode("leiding"); // hertekent tabel
        editModeButton.textContent = "✏️ Opkomsten bewerken";

        // Alleen opnieuw laden uit DB, NIET opnieuw renderen
        await loadEverything();
        return;
    }

    // --- NAAR bewerkmodus ---
    editMode = true;
    setMode("leiding");
    editModeButton.textContent = "💾 Wijzigingen opslaan";
});

function scrollToOpkomstFromHash() {
  const params = new URLSearchParams(window.location.hash.replace("#", ""));
  const targetDate = params.get("opkomst");
  if (!targetDate) return;

  const row = document.querySelector(
    `tr[data-opkomst-datum="${targetDate}"]`
  );

  if (!row) return;

  // Scroll naar rij
  row.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  // Highlight (hergebruikt bestaande CSS)
  row.classList.add("row-highlight");

  // Highlight na animatie weer verwijderen
   setTimeout(() => {
  row.classList.remove("row-highlight");
}, 2000);
   // Hash opruimen zodat we niet opnieuw gaan scrollen bij latere renders
  try {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch (e) {}

}


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

