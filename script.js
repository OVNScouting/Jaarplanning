// =============================================================
// script.js — volledig herschreven voor 3 modi
// modi: ouder / leiding / bewerken
// =============================================================

// -------------------------------------------------------------
// 1. MODE SYSTEEM (LEIDING / OUDER / BEWERKEN)
// -------------------------------------------------------------

// Leest de mode:
// - "ouder" (standaard)
// - "leiding" (na inloggen op index.html)
// - "bewerken" (na drukken op Bewerkmodus)
let mode = localStorage.getItem("mode") || "ouder";

function isOuder() {
    return mode === "ouder";
}

function isLeiding() {
    return mode === "leiding";
}

function isBewerken() {
    return mode === "bewerken";
}

// Wordt aangeroepen bij BEWERKEN-knop
function enterBewerkmodus() {
    if (!isLeiding()) return;
    mode = "bewerken";
    localStorage.setItem("mode", "bewerken");
    renderAll();
}

// Wordt aangeroepen bij verlaten bewerken (zelfde knop)
function exitBewerkmodus() {
    if (!isBewerken()) return;
    mode = "leiding";
    localStorage.setItem("mode", "leiding");
    renderAll();
}

// -------------------------------------------------------------
// 2. FIREBASE INIT — NIEUW PROJECT
// -------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  push,
  remove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCFQeno5rmLIvZdscjrimvFO7ZsJW7qBTM",
  authDomain: "ovn-jaarplanning.firebaseapp.com",
  databaseURL: "https://ovn-jaarplanning-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ovn-jaarplanning",
  storageBucket: "ovn-jaarplanning.firebasestorage.app",
  messagingSenderId: "311108828430",
  appId: "1:311108828430:web:40f3564fca975423972b5f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

// -------------------------------------------------------------
// 3. GLOBALE STATE
// -------------------------------------------------------------

const body = document.body;
const speltak = body.dataset.speltak || "bevers";

let opkomsten = [];
let jeugd = [];
let leiding = [];
let infoTekst = "";
let maandbriefUrl = "";

let meldingenInstellingen = {
  leidingEnabled: false,
  leidingThreshold: 3,
  onbekendEnabled: false,
  onbekendDays: 7
};

// -------------------------------------------------------------
// 4. DOM ELEMENTS
// -------------------------------------------------------------

const headerRowTop   = document.getElementById("headerRowTop");
const tableBody      = document.getElementById("tableBody");
const addOpkomstRow  = document.getElementById("addOpkomstRow");

const editModeButton    = document.getElementById("editModeButton");
const addMemberButton   = document.getElementById("addMemberButton");
const ledenbeheerButton = document.getElementById("ledenbeheerButton");
const mailboxButton     = document.getElementById("mailboxButton");
const handleidingButton = document.getElementById("handleidingButton");
const instellingenButton= document.getElementById("instellingenButton");

const filterAll    = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast   = document.getElementById("filterPast");
const printButton  = document.getElementById("printButton");

const infoTekstP     = document.getElementById("infotekst");
const infoTekstEdit  = document.getElementById("infotekst_edit");
const saveInfoButton = document.getElementById("saveInfoButton");

const ledenbeheerSection     = document.getElementById("ledenbeheer");
const ledenbeheerJeugdList   = document.getElementById("ledenbeheerJeugd");
const ledenbeheerLeidingList = document.getElementById("ledenbeheerLeiding");

const meldingenSection          = document.getElementById("meldingen");
const meldLeidingEnabledInput   = document.getElementById("meldLeidingEnabled");
const meldLeidingThresholdInput = document.getElementById("meldLeidingThreshold");
const meldOnbekendEnabledInput  = document.getElementById("meldOnbekendEnabled");
const meldOnbekendDaysInput     = document.getElementById("meldOnbekendDays");
const saveMeldingenButton       =
  document.getElementById("saveMeldingenButton") ||
  document.getElementById("meldingenSaveButton");
const testMeldingenButton       = document.getElementById("testMeldingenButton");

// Maandbrief
const maandbriefButton = document.getElementById("maandbriefButton");
const maandbriefUpload = document.getElementById("maandbriefUpload");

// -------------------------------------------------------------
// 5. DATUMFUNCTIES
// -------------------------------------------------------------

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toDisplayDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function compareISO(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPast(iso) {
  return iso && iso < todayISO();
}

function isFutureOrToday(iso) {
  return iso && iso >= todayISO();
}

function isBinnenNDagen(iso, n) {
  if (!iso) return false;
  const doel = new Date(iso + "T00:00:00");
  const nu   = new Date();
  const diff = doel.getTime() - nu.getTime();
  const dagen = diff / (1000 * 60 * 60 * 24);
  return dagen >= 0 && dagen <= n;
}

// -------------------------------------------------------------
// 6. MAANDBRIEF FUNCTIES
// -------------------------------------------------------------

async function loadMaandbriefUrl() {
  if (!maandbriefButton) return;

  try {
    const sRef = storageRef(storage, `${speltak}/maandbrief.pdf`);
    maandbriefUrl = await getDownloadURL(sRef);
  } catch (err) {
    maandbriefUrl = "";
  }
}

async function handleMaandbriefUploadChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    alert("Alleen PDF-bestanden toegestaan.");
    event.target.value = "";
    return;
  }

  try {
    const sRef = storageRef(storage, `${speltak}/maandbrief.pdf`);
    await uploadBytes(sRef, file);
    alert("Maandbrief geüpload!");
    await loadMaandbriefUrl();
  } catch (err) {
    console.error(err);
    alert("Upload mislukt.");
  }

  event.target.value = "";
}

function handleMaandbriefButtonClick() {
  if (isLeiding() || isBewerken()) {
    // Download voor leiding ook in kijk-modus
    if (!maandbriefUrl) {
      alert("Er is nog geen maandbrief geüpload.");
      return;
    }
    window.open(maandbriefUrl, "_blank");
    return;
  }

  if (isOuder()) {
    if (!maandbriefUrl) {
      alert("Er is nog geen maandbrief geüpload.");
      return;
    }
    window.open(maandbriefUrl, "_blank");
  }
}

function updateMaandbriefButtonLabel() {
  maandbriefButton.textContent =
    isBewerken()
      ? "Maandbrief uploaden"
      : "Maandbrief downloaden";
}

// =============================================================
// script.js — DEEL 2
// =============================================================

// -------------------------------------------------------------
// 7. DATA LADEN (OPKOMSTEN, LEDEN, MELDINGEN, INFOTEKST)
// -------------------------------------------------------------

function loadData() {
  const rootRef = ref(db, speltak);

  onValue(rootRef, snapshot => {
    const data = snapshot.val() || {};

    // Infotekst
    infoTekst = data.infotekst || "";

    // Meldingen
    meldingenInstellingen = {
      leidingEnabled: !!data.meldingen?.leidingEnabled,
      leidingThreshold: data.meldingen?.leidingThreshold ?? 3,
      onbekendEnabled: !!data.meldingen?.onbekendEnabled,
      onbekendDays: data.meldingen?.onbekendDays ?? 7
    };

    // Jeugdleden
    jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({
      id,
      naam: v.naam,
      verborgen: !!v.hidden,
      volgorde: v.volgorde ?? 0
    })).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam));

    // Leiding
    leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
      id,
      naam: v.naam,
      verborgen: !!v.hidden,
      volgorde: v.volgorde ?? 0
    })).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam));

    // Opkomsten
    opkomsten = Object.entries(data.opkomsten || {})
      .map(([id, v]) => ({ id, ...v }))
      .sort(sorteerOpkomsten);

    // Render alles opnieuw
    renderAll();
  });
}

// -------------------------------------------------------------
// 8. NIEUWE SORTEERFUNCTIE
// Eerst komende opkomsten
// Dan opkomsten uit het verleden onderaan
// -------------------------------------------------------------

function sorteerOpkomsten(a, b) {

  const today = todayISO();

  const aIsVerleden = a.datum && a.datum < today;
  const bIsVerleden = b.datum && b.datum < today;

  // beide toekomst of beide verleden → normaal sorteren op datum
  if (aIsVerleden === bIsVerleden) {
    return compareISO(a.datum, b.datum);
  }

  // toekomst eerst
  if (!aIsVerleden && bIsVerleden) return -1;
  if (aIsVerleden && !bIsVerleden) return 1;

  return 0;
}

// -------------------------------------------------------------
// 9. RENDER FUNCTIES (CENTRAAL)
// -------------------------------------------------------------

function renderAll() {
  updateModeUI();
  renderInfoTekst();
  renderMeldingenInstellingen();
  renderTable();
  renderLedenbeheer();
  updateMaandbriefButtonLabel();
}

// -------------------------------------------------------------
// 10. INFOTEKST RENDEREN
// -------------------------------------------------------------

function renderInfoTekst() {
  if (infoTekstP) infoTekstP.textContent = infoTekst;
  if (infoTekstEdit) infoTekstEdit.value = infoTekst;

  if (isBewerken()) {
    infoTekstP.classList.add("hidden");
    infoTekstEdit.classList.remove("hidden");
    saveInfoButton.classList.remove("hidden");
  } else {
    infoTekstP.classList.remove("hidden");
    infoTekstEdit.classList.add("hidden");
    saveInfoButton.classList.add("hidden");
  }
}

function saveInfoTekst() {
  const nieuwe = infoTekstEdit.value;
  update(ref(db, speltak), { infotekst: nieuwe });
}

// -------------------------------------------------------------
// 11. MELDINGEN RENDEREN
// -------------------------------------------------------------

function renderMeldingenInstellingen() {
  if (!meldLeidingEnabledInput) return;

  meldLeidingEnabledInput.checked = !!meldingenInstellingen.leidingEnabled;
  meldLeidingThresholdInput.value = meldingenInstellingen.leidingThreshold;
  meldOnbekendEnabledInput.checked = !!meldingenInstellingen.onbekendEnabled;
  meldOnbekendDaysInput.value = meldingenInstellingen.onbekendDays;

  if (isBewerken()) {
    meldingenSection.classList.remove("hidden");
  } else {
    meldingenSection.classList.add("hidden");
  }
}

function saveMeldingenInstellingen() {
  if (!isBewerken()) return;

  const obj = {
    leidingEnabled: !!meldLeidingEnabledInput.checked,
    leidingThreshold: Number(meldLeidingThresholdInput.value || 3),
    onbekendEnabled: !!meldOnbekendEnabledInput.checked,
    onbekendDays: Number(meldOnbekendDaysInput.value || 7)
  };

  set(ref(db, `${speltak}/meldingen`), obj)
    .then(() => alert("Meldingen opgeslagen."));
}
// =============================================================
// script.js — DEEL 3
// =============================================================

// -------------------------------------------------------------
// 12. MODE-GEBONDEN UI
// -------------------------------------------------------------

function updateModeUI() {

  // BEWERKEN-knop zichtbaar in leiding + bewerken
  if (editModeButton) {
    if (isLeiding() || isBewerken()) editModeButton.classList.remove("hidden");
    else editModeButton.classList.add("hidden");

    editModeButton.textContent = isBewerken()
      ? "Klaar"
      : "Bewerken";
  }

  // Ledenbeheer-knop zichtbaar in leiding + bewerken
  if (ledenbeheerButton) {
    if (isLeiding() || isBewerken()) ledenbeheerButton.classList.remove("hidden");
    else ledenbeheerButton.classList.add("hidden");
  }

  // Mailbox, handleiding, meldingen-knoppen
  if (mailboxButton) mailboxButton.classList.toggle("hidden", isOuder());
  if (handleidingButton) handleidingButton.classList.toggle("hidden", isOuder());
  if (instellingenButton) instellingenButton.classList.toggle("hidden", !(isLeiding() || isBewerken()));

  // Leden toevoegen-knop alleen in bewerken
  if (addMemberButton)
    addMemberButton.classList.toggle("hidden", !isBewerken());

  // Opkomst toevoegen-knop alleen in bewerken
  if (addOpkomstRow)
    addOpkomstRow.classList.toggle("hidden", !isBewerken());
}

// -------------------------------------------------------------
// 13. TABELLEN
// -------------------------------------------------------------

function renderTable() {
  if (!headerRowTop || !tableBody) return;
  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  // Welke kolommen zichtbaar?
  const cols = determineColumnsForMode();

  // Header bouwen
  buildTableHeader(cols);

  // Body bouwen
  buildTableBody(cols);
}

// -------------------------------------------------------------
// 14. KOLOMCONFIG PER MODUS
// -------------------------------------------------------------

function determineColumnsForMode() {

  // Basis voor iedereen
  const base = [
    "delete",
    "datum",
    "thema",
    "bijzonderheden",
    "typeOpkomst",
    "starttijd",
    "eindtijd",
  ];

  if (isOuder()) {
    return [
      ...base,
      "bert_met",
      "aanwLeden",
      "aanwezigheidJeugd",
    ];
  }

  // Leiding-modus (kijkmodus)
  if (isLeiding()) {
    return [
      ...base,
      "locatie",
      "procor",
      "bert_met",
      "aanwLeden",
      "aanwLeiding",
      "aanwezigheidJeugd",
      "kijkers",
      "aanwezigheidLeiding",
      "extraLeiding",
      "materiaal"
    ];
  }

  // Bewerkmodus (volledig)
  if (isBewerken()) {
    return [
      ...base,
      "locatie",
      "procor",
      "bert_met",
      "aanwLeden",
      "aanwLeiding",
      "aanwezigheidJeugd",
      "kijkers",
      "aanwezigheidLeiding",
      "extraLeiding",
      "materiaal"
    ];
  }

  return base;
}

// -------------------------------------------------------------
// 15. HEADER RENDEREN
// -------------------------------------------------------------

function buildTableHeader(cols) {
  cols.forEach(col => {
    const th = document.createElement("th");

    const labels = {
      delete: "🗑",
      datum: "Datum",
      thema: "Thema",
      bijzonderheden: "Bijzonderheden",
      typeOpkomst: "Type",
      starttijd: "Start",
      eindtijd: "Eind",
      locatie: "Locatie",
      procor: "Procor",
      bert_met: "Bert 🧸",
      aanwLeden: "Aanw. Leden",
      aanwLeiding: "Aanw. Leiding",
      aanwezigheidJeugd: "Leden",
      aanwezigheidLeiding: "Leiding",
      kijkers: "Kijkers",
      extraLeiding: "Extra",
      materiaal: "Materiaal"
    };

    th.textContent = labels[col] || col;
    headerRowTop.appendChild(th);
  });
}

// =============================================================
// script.js — DEEL 4
// =============================================================

function buildTableBody(cols) {

  opkomsten.forEach(o => {

    const tr = document.createElement("tr");

    // Styling op basis van status
    if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
    else if (isPast(o.datum)) tr.classList.add("row-grey");
    if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
    if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");

    cols.forEach(col => {
      const td = document.createElement("td");

      switch (col) {

        case "delete":
          if (isBewerken()) {
            td.textContent = "✖";
            td.classList.add("delete-btn");
            td.addEventListener("click", () => {
              if (confirm("Opkomst verwijderen?")) {
                remove(ref(db, `${speltak}/opkomsten/${o.id}`));
              }
            });
          }
          break;

        case "datum":
          renderDatumCell(td, o);
          break;

        case "thema":
          renderEditableText(td, o, "thema", "Thema…");
          break;

        case "bijzonderheden":
          renderEditableText(td, o, "bijzonderheden", "Bijzonderheden…");
          break;

        case "typeOpkomst":
          renderTypeCell(td, o);
          break;

        case "starttijd":
          renderTimeCell(td, o, "starttijd");
          break;

        case "eindtijd":
          renderTimeCell(td, o, "eindtijd");
          break;

        case "locatie":
          renderEditableText(td, o, "locatie", "Locatie…");
          break;

        case "procor":
          renderEditableText(td, o, "procor", "Procor…");
          break;

        case "bert_met":
          renderEditableText(td, o, "bert_met", "Bert met…");
          break;

        case "materiaal":
          renderEditableText(td, o, "materiaal", "Materiaal…");
          break;

        case "aanwLeden":
        case "aanwLeiding":
          const [cntJ, cntL] = countAanwezigen(o);
          td.textContent = col === "aanwLeden" ? cntJ : cntL;
          break;

        case "aanwezigheidJeugd":
          renderPresenceRow(td, tr, o, jeugd, false);
          break;

        case "aanwezigheidLeiding":
          renderPresenceRow(td, tr, o, leiding, true);
          break;

        case "kijkers":
          renderNumberCell(td, o, "kijkers");
          break;

        case "extraLeiding":
          renderNumberCell(td, o, "extraLeiding");
          break;
      }

      tr.appendChild(td);
    });

    tableBody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// 16. AANWEZIGHEID
// -------------------------------------------------------------

function renderPresenceRow(td, tr, o, lijst, isLeiding) {
  // toevoegen van cellen per persoon
  lijst.forEach((p, idx) => {
    const cell = document.createElement("td");
    cell.classList.add("presence-cell");

    const key = isLeiding ? `leiding-${p.id}` : p.id;

    if (!o.aanwezigheid) o.aanwezigheid = {};
    if (!o.aanwezigheid[key]) o.aanwezigheid[key] = "onbekend";

    const symbols = {
      aanwezig: "✔",
      afwezig: "✖",
      onbekend: "?"
    };

    function apply() {
      const v = o.aanwezigheid[key];
      cell.textContent = symbols[v];
    }

    apply();

    // Klikbaar voor iedereen in alle modi behalve Ouder → alleen leden/leiding?
    if (isOuder()) {
      if (!isLeiding) cell.addEventListener("click", toggleAanwezigheid);
    } else {
      cell.addEventListener("click", toggleAanwezigheid);
    }

    function toggleAanwezigheid() {
      const states = ["aanwezig", "afwezig", "onbekend"];
      const cur = o.aanwezigheid[key];
      const next = states[(states.indexOf(cur) + 1) % states.length];
      o.aanwezigheid[key] = next;

      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        aanwezigheid: o.aanwezigheid
      });

      apply();
    }

    tr.appendChild(cell);
  });
}

// =============================================================
// script.js — DEEL 5
// =============================================================

// -------------------------------------------------------------
// Datum-cell
// -------------------------------------------------------------

function renderDatumCell(td, o) {
  if (isBewerken()) {
    const input = document.createElement("input");
    input.type = "date";
    input.value = o.datum || "";
    td.appendChild(input);

    input.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { datum: input.value });
    });

  } else {
    td.textContent = toDisplayDate(o.datum);
  }
}

// -------------------------------------------------------------
// Algemene editable tekstvelden
// -------------------------------------------------------------

function renderEditableText(td, o, field, placeholder) {
  if (isBewerken()) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = o[field] || "";
    input.placeholder = placeholder;
    td.appendChild(input);

    input.addEventListener("change", () => {
      const obj = {};
      obj[field] = input.value;
      update(ref(db, `${speltak}/opkomsten/${o.id}`), obj);
    });

  } else {
    td.textContent = o[field] || "";
  }
}

// -------------------------------------------------------------
// Type opkomst (dropdown)
// -------------------------------------------------------------

function renderTypeCell(td, o) {
  const types = {
    "": "Selecteer…",
    normaal: "Normale opkomst",
    bijzonder: "Bijzondere opkomst",
    kamp: "Kamp",
    geen: "Geen opkomst"
  };

  if (isBewerken()) {
    const select = document.createElement("select");

    Object.entries(types).forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (o.typeOpkomst === val) opt.selected = true;
      select.appendChild(opt);
    });

    td.appendChild(select);

    select.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        typeOpkomst: select.value
      });
    });

  } else {
    td.textContent = types[o.typeOpkomst] || "";
  }
}

// -------------------------------------------------------------
// Tijdvelden
// -------------------------------------------------------------

function renderTimeCell(td, o, field) {
  if (isBewerken()) {
    const input = document.createElement("input");
    input.type = "time";
    input.value = o[field] || "";
    td.appendChild(input);

    input.addEventListener("change", () => {
      const obj = {};
      obj[field] = input.value;
      update(ref(db, `${speltak}/opkomsten/${o.id}`), obj);
    });

  } else {
    td.textContent = o[field] || "";
  }
}

// -------------------------------------------------------------
// Nummervelden (kijkers, extra leiding)
// -------------------------------------------------------------

function renderNumberCell(td, o, field) {
  const value = Number(o[field] || 0);

  if (isBewerken()) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = value;
    td.appendChild(input);

    input.addEventListener("change", () => {
      const num = parseInt(input.value, 10) || 0;
      const obj = {};
      obj[field] = num;
      update(ref(db, `${speltak}/opkomsten/${o.id}`), obj);
    });

  } else {
    td.textContent = value;
  }
}

// =============================================================
// script.js — DEEL 6
// =============================================================

// -------------------------------------------------------------
// Aanwezigheid tellen
// -------------------------------------------------------------

function countAanwezigen(o) {
  let j = 0;
  let l = 0;

  jeugd.forEach(x => {
    if (o.aanwezigheid?.[x.id] === "aanwezig") j++;
  });

  leiding.forEach(x => {
    const key = "leiding-" + x.id;
    if (o.aanwezigheid?.[key] === "aanwezig") l++;
  });

  return [j, l];
}

// -------------------------------------------------------------
// Nieuwe opkomst toevoegen
// -------------------------------------------------------------

function addOpkomst() {
  if (!isBewerken()) return;

  const nieuwRef = push(ref(db, `${speltak}/opkomsten`));
  const id = nieuwRef.key;

  const nieuw = {
    id,
    datum: "",
    thema: "",
    bijzonderheden: "",
    typeOpkomst: "",
    starttijd: "",
    eindtijd: "",
    locatie: "",
    procor: "",
    bert_met: "",
    kijkers: 0,
    extraLeiding: 0,
    materiaal: "",
    aanwezigheid: {}
  };

  set(nieuwRef, nieuw);
}

// -------------------------------------------------------------
// LEDENBEHEER
// -------------------------------------------------------------

function renderLedenbeheer() {
  if (!ledenbeheerSection) return;

  if (!isBewerken()) {
    ledenbeheerSection.classList.add("hidden");
    return;
  }

  ledenbeheerSection.classList.remove("hidden");
  ledenbeheerJeugdList.innerHTML = "";
  ledenbeheerLeidingList.innerHTML = "";

  jeugd.forEach((lid, idx) => {
    ledenbeheerJeugdList.appendChild(buildLidItem(lid, "jeugd", idx));
  });

  leiding.forEach((lid, idx) => {
    ledenbeheerLeidingList.appendChild(buildLidItem(lid, "leiding", idx));
  });
}

function buildLidItem(lid, type, index) {
  const li = document.createElement("li");
  if (lid.verborgen) li.classList.add("lid-verborgen");

  const name = document.createElement("span");
  name.textContent = lid.naam;

  const controls = document.createElement("div");
  controls.classList.add("ledenbeheer-controls");

  controls.appendChild(makeLidBtn("▲", () => moveLid(type, index, -1)));
  controls.appendChild(makeLidBtn("▼", () => moveLid(type, index, 1)));
  controls.appendChild(makeLidBtn("✏", () => renameLid(type, lid)));
  controls.appendChild(makeLidBtn(lid.verborgen ? "👁" : "🚫", () => toggleVerborgen(type, lid)));
  controls.appendChild(makeLidBtn("🗑", () => deleteLid(type, lid)));

  li.appendChild(name);
  li.appendChild(controls);
  return li;
}

function makeLidBtn(text, fn) {
  const b = document.createElement("button");
  b.textContent = text;
  b.classList.add("ledenbeheer-btn");
  b.addEventListener("click", fn);
  return b;
}

function moveLid(type, index, delta) {
  if (!isBewerken()) return;

  const lijst = type === "jeugd" ? [...jeugd] : [...leiding];
  const nieuwIndex = index + delta;
  if (nieuwIndex < 0 || nieuwIndex >= lijst.length) return;

  const item = lijst.splice(index, 1)[0];
  lijst.splice(nieuwIndex, 0, item);

  lijst.forEach((l, i) => l.volgorde = i);

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const updates = {};

  lijst.forEach(l => {
    updates[`${path}/${l.id}/volgorde`] = l.volgorde;
  });

  update(ref(db, speltak), updates);
}

function renameLid(type, lid) {
  if (!isBewerken()) return;
  const nieuw = prompt("Nieuwe naam:", lid.naam);
  if (!nieuw) return;

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  update(ref(db, `${speltak}/${path}/${lid.id}`), { naam: nieuw });
}

function toggleVerborgen(type, lid) {
  if (!isBewerken()) return;
  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  update(ref(db, `${speltak}/${path}/${lid.id}`), { hidden: !lid.verborgen });
}

function deleteLid(type, lid) {
  if (!isBewerken()) return;
  if (!confirm(`Lid ${lid.naam} verwijderen?`)) return;

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  remove(ref(db, `${speltak}/${path}/${lid.id}`));
}

// =============================================================
// script.js — DEEL 7
// =============================================================

// -------------------------------------------------------------
// Bewerkmodus togglen
// -------------------------------------------------------------

if (editModeButton) {
  editModeButton.addEventListener("click", () => {
    if (isBewerken()) exitBewerkmodus();
    else enterBewerkmodus();
  });
}

// -------------------------------------------------------------
// Ledenbeheer togglen
// -------------------------------------------------------------

if (ledenbeheerButton) {
  ledenbeheerButton.addEventListener("click", () => {
    ledenbeheerSection.classList.toggle("hidden");
  });
}

// -------------------------------------------------------------
// Meldingen togglen
// -------------------------------------------------------------

if (instellingenButton) {
  instellingenButton.addEventListener("click", () => {
    meldingenSection.classList.toggle("hidden");
  });
}

// -------------------------------------------------------------
// Filters
// -------------------------------------------------------------

let filterMode = "all";

if (filterAll)
  filterAll.addEventListener("click", () => {
    filterMode = "all";
    renderTable();
  });

if (filterFuture)
  filterFuture.addEventListener("click", () => {
    filterMode = "future";
    renderTable();
  });

if (filterPast)
  filterPast.addEventListener("click", () => {
    filterMode = "past";
    renderTable();
  });

// -------------------------------------------------------------
// Print
// -------------------------------------------------------------

if (printButton) {
  printButton.addEventListener("click", () => window.print());
}

// -------------------------------------------------------------
// Maandbrief
// -------------------------------------------------------------

if (maandbriefButton)
  maandbriefButton.addEventListener("click", handleMaandbriefButtonClick);

if (maandbriefUpload)
  maandbriefUpload.addEventListener("change", handleMaandbriefUploadChange);

// -------------------------------------------------------------
// Meldingen opslaan / testen
// -------------------------------------------------------------

if (saveMeldingenButton)
  saveMeldingenButton.addEventListener("click", saveMeldingenInstellingen);

if (testMeldingenButton)
  testMeldingenButton.addEventListener("click", testMeldingen);

// -------------------------------------------------------------
// Opkomst toevoegen
// -------------------------------------------------------------

if (addOpkomstRow)
  addOpkomstRow.addEventListener("click", addOpkomst);

// -------------------------------------------------------------
// Infotekst opslaan
// -------------------------------------------------------------

if (saveInfoButton)
  saveInfoButton.addEventListener("click", saveInfoTekst);

// =============================================================
// script.js — DEEL 8 (INIT)
// =============================================================

function testMeldingen() {
  alert("Automatische e-mails worden later geïmplementeerd.");
}

// Starten:
loadData();
loadMaandbriefUrl();
updateModeUI();

// -------------------------------------------------------------
// EINDE SCRIPT.JS
// =============================================================
