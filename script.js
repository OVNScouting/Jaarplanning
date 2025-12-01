// =============================================================
// script.js — Scouting OVN Jaarplanning
// 3 modi: ouder / leiding / bewerken
// =============================================================

// -------------------------------------------------------------
// 1. Firebase imports en init
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
// 2. Mode-systeem (ouder / leiding / bewerken)
// -------------------------------------------------------------

let mode = localStorage.getItem("mode");
if (mode !== "leiding" && mode !== "bewerken") {
  mode = "ouder";
}

function isOuder() {
  return mode === "ouder";
}

function isLeiding() {
  return mode === "leiding";
}

function isBewerken() {
  return mode === "bewerken";
}

function enterBewerkmodus() {
  if (!isLeiding() && !isBewerken()) return;
  mode = "bewerken";
  localStorage.setItem("mode", "bewerken");
  renderAll();
}

function exitBewerkmodus() {
  mode = "leiding";
  localStorage.setItem("mode", "leiding");
  renderAll();
}

// -------------------------------------------------------------
// 3. Globale state & DOM-elementen
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

let filterMode = "all";

// Tabel
const headerRowTop   = document.getElementById("headerRowTop");
const tableBody      = document.getElementById("tableBody");
const addOpkomstRow  = document.getElementById("addOpkomstRow");

// Buttons / UI
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

// Info-tekst
const infoTekstP     = document.getElementById("infotekst");
const infoTekstEdit  = document.getElementById("infotekst_edit");
const saveInfoButton = document.getElementById("saveInfoButton");

// Ledenbeheer
const ledenbeheerSection     = document.getElementById("ledenbeheer");
const ledenbeheerJeugdList   = document.getElementById("ledenbeheerJeugd");
const ledenbeheerLeidingList = document.getElementById("ledenbeheerLeiding");

// Meldingen
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
// 4. Datum & sorteer helpers
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

// eerst toekomst, dan verleden
function sorteerOpkomsten(a, b) {
  const today = todayISO();
  const aVerleden = a.datum && a.datum < today;
  const bVerleden = b.datum && b.datum < today;

  if (aVerleden === bVerleden) {
    return compareISO(a.datum, b.datum);
  }
  if (!aVerleden && bVerleden) return -1;
  if (aVerleden && !bVerleden) return 1;
  return 0;
}

// -------------------------------------------------------------
// 5. Maandbrief
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
  if (isBewerken()) {
    if (!maandbriefUpload) return;
    maandbriefUpload.click();
    return;
  }

  if (!maandbriefUrl) {
    alert("Er is nog geen maandbrief geüpload.");
    return;
  }
  window.open(maandbriefUrl, "_blank");
}

function updateMaandbriefButtonLabel() {
  if (!maandbriefButton) return;
  maandbriefButton.textContent = isBewerken()
    ? "Maandbrief uploaden"
    : "Maandbrief downloaden";
}

// -------------------------------------------------------------
// 6. Data uit Firebase laden
// -------------------------------------------------------------

function loadData() {
  const rootRef = ref(db, speltak);

  onValue(rootRef, snapshot => {
    const data = snapshot.val() || {};

    infoTekst = data.infotekst || "";

    meldingenInstellingen = {
      leidingEnabled: !!data.meldingen?.leidingEnabled,
      leidingThreshold: data.meldingen?.leidingThreshold ?? 3,
      onbekendEnabled: !!data.meldingen?.onbekendEnabled,
      onbekendDays: data.meldingen?.onbekendDays ?? 7
    };

    jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({
      id,
      naam: v.naam,
      verborgen: !!v.hidden,
      volgorde: v.volgorde ?? 0
    })).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam));

    leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
      id,
      naam: v.naam,
      verborgen: !!v.hidden,
      volgorde: v.volgorde ?? 0
    })).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam));

    opkomsten = Object.entries(data.opkomsten || {})
      .map(([id, v]) => ({ id, ...v }))
      .sort(sorteerOpkomsten);

    renderAll();
  });
}

// -------------------------------------------------------------
// 7. Centrale render-functie
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
// 8. Infotekst
// -------------------------------------------------------------

function renderInfoTekst() {
  if (infoTekstP) infoTekstP.textContent = infoTekst;
  if (infoTekstEdit) infoTekstEdit.value = infoTekst;

  if (isBewerken()) {
    infoTekstP && infoTekstP.classList.add("hidden");
    infoTekstEdit && infoTekstEdit.classList.remove("hidden");
    saveInfoButton && saveInfoButton.classList.remove("hidden");
  } else {
    infoTekstP && infoTekstP.classList.remove("hidden");
    infoTekstEdit && infoTekstEdit.classList.add("hidden");
    saveInfoButton && saveInfoButton.classList.add("hidden");
  }
}

function saveInfoTekst() {
  if (!isBewerken()) return;
  const nieuwe = infoTekstEdit.value;
  update(ref(db, speltak), { infotekst: nieuwe });
}

// -------------------------------------------------------------
// 9. Meldingen-instellingen
// -------------------------------------------------------------

function renderMeldingenInstellingen() {
  if (!meldLeidingEnabledInput) return;

  meldLeidingEnabledInput.checked = !!meldingenInstellingen.leidingEnabled;
  meldLeidingThresholdInput.value = meldingenInstellingen.leidingThreshold;
  meldOnbekendEnabledInput.checked = !!meldingenInstellingen.onbekendEnabled;
  meldOnbekendDaysInput.value = meldingenInstellingen.onbekendDays;

  if (!isBewerken()) {
    meldingenSection && meldingenSection.classList.add("hidden");
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

function testMeldingen() {
  const problemen = [];

  opkomsten.forEach(o => {
    if (!o.datum) return;

    // te weinig leiding
    if (meldingenInstellingen.leidingEnabled) {
      let afwezig = 0;
      leiding.forEach(l => {
        const k = "leiding-" + l.id;
        if (o.aanwezigheid?.[k] === "afwezig") afwezig++;
      });
      if (afwezig >= meldingenInstellingen.leidingThreshold) {
        problemen.push(
          `Opkomst ${toDisplayDate(o.datum)}: ${afwezig} leiding afwezig.`
        );
      }
    }

    // onbekend status binnen N dagen
    if (meldingenInstellingen.onbekendEnabled &&
        isBinnenNDagen(o.datum, meldingenInstellingen.onbekendDays)) {

      let onbekend = 0;

      jeugd.forEach(j => {
        if (o.aanwezigheid?.[j.id] === "onbekend") onbekend++;
      });
      leiding.forEach(l => {
        const k = "leiding-" + l.id;
        if (o.aanwezigheid?.[k] === "onbekend") onbekend++;
      });

      if (onbekend > 0) {
        problemen.push(
          `Opkomst ${toDisplayDate(o.datum)}: ${onbekend} personen nog onbekend.`
        );
      }
    }
  });

  const subject = encodeURIComponent(`Aanwezigheidsmeldingen ${speltak}`);
  const body = encodeURIComponent(
    problemen.length ? problemen.join("\n") : "Geen meldingen."
  );

  window.location.href = `mailto:ovnscouting@gmail.com?subject=${subject}&body=${body}`;
}

// -------------------------------------------------------------
// 10. UI op basis van mode
// -------------------------------------------------------------

function updateModeUI() {
  // Bewerk-knop
  if (editModeButton) {
    if (isLeiding() || isBewerken()) {
      editModeButton.classList.remove("hidden");
    } else {
      editModeButton.classList.add("hidden");
    }
    editModeButton.textContent = isBewerken() ? "Klaar" : "Bewerken";
  }

  // Ledenbeheer-knop alleen in bewerkmodus
  if (ledenbeheerButton) {
    ledenbeheerButton.classList.toggle("hidden", !isBewerken());
  }

  // Mailbox, handleiding, meldingen-knop alleen in leiding/bewerken
  if (mailboxButton) {
    mailboxButton.classList.toggle("hidden", isOuder());
  }
  if (handleidingButton) {
    handleidingButton.classList.toggle("hidden", isOuder());
  }
  if (instellingenButton) {
    instellingenButton.classList.toggle("hidden", !isBewerken());
  }

  // Lid toevoegen-knop alleen in bewerken
  if (addMemberButton) {
    addMemberButton.classList.toggle("hidden", !isBewerken());
  }

  // Opkomst toevoegen alleen in bewerken
  if (addOpkomstRow) {
    addOpkomstRow.classList.toggle("hidden", !isBewerken());
  }

  // Filters active state
  if (filterAll) {
    filterAll.classList.toggle("active", filterMode === "all");
  }
  if (filterFuture) {
    filterFuture.classList.toggle("active", filterMode === "future");
  }
  if (filterPast) {
    filterPast.classList.toggle("active", filterMode === "past");
  }
}

// -------------------------------------------------------------
// 11. Tabel-rendering
// -------------------------------------------------------------

function renderTable() {
  if (!headerRowTop || !tableBody) return;

  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  const visibleJeugd   = jeugd.filter(j => !j.verborgen);
  const visibleLeiding = leiding.filter(l => !l.verborgen);

  // Volgende opkomst (voor highlight)
  let volgendeId = null;
  const toekomstige = opkomsten
    .filter(o => isFutureOrToday(o.datum))
    .sort((a, b) => compareISO(a.datum, b.datum));
  if (toekomstige.length) volgendeId = toekomstige[0].id;

  // Filter lijst
  let lijst = opkomsten.slice();
  if (filterMode === "future") {
    lijst = lijst.filter(o => isFutureOrToday(o.datum));
  } else if (filterMode === "past") {
    lijst = lijst.filter(o => isPast(o.datum));
  }

  // HEADER
  if (isOuder()) {
    addTH("Datum");
    addTH("Thema");
    addTH("Bijzonderheden");
    addTH("Type");
    addTH("Start");
    addTH("Eind");
    addTH("Bert 🧸");

    visibleJeugd.forEach(j => {
      const th = document.createElement("th");
      th.textContent = j.naam;
      th.classList.add("name-vertical");
      headerRowTop.appendChild(th);
    });

  } else {
    // leiding / bewerken
    addTH("🗑");
    addTH("Datum");
    addTH("Thema");
    addTH("Bijzonderheden");
    addTH("Type");
    addTH("Start");
    addTH("Eind");
    addTH("Locatie");
    addTH("Procor");
    addTH("Bert 🧸");
    addTH("Aanw. Leden", "aanw-count");
    addTH("Aanw. Leiding", "aanw-count");

    visibleJeugd.forEach(j => {
      const th = document.createElement("th");
      th.textContent = j.naam;
      th.classList.add("name-vertical");
      headerRowTop.appendChild(th);
    });

    addTH("Kijkers");
    visibleLeiding.forEach((l, idx) => {
      const th = document.createElement("th");
      th.textContent = l.naam;
      th.classList.add("name-vertical");
      if (idx === 0) th.classList.add("col-split");
      headerRowTop.appendChild(th);
    });
    addTH("Extra");
    addTH("Materiaal");
  }

  // BODY
  lijst.forEach(o => {
    ensureAanwezigheidStructure(o, visibleJeugd, visibleLeiding);

    const tr = document.createElement("tr");

    if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
    else if (isPast(o.datum)) tr.classList.add("row-grey");
    if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
    if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");
    if (o.id === volgendeId) tr.classList.add("row-next");

    if (isOuder()) {
      // OUDER-MODUS
      addDatumCell(tr, o, false);
      addTextCell(tr, o, "thema", false);
      addTextCell(tr, o, "bijzonderheden", false);
      addTypeCell(tr, o, false);
      addTimeCell(tr, o, "starttijd", false);
      addTimeCell(tr, o, "eindtijd", false);
      addTextCell(tr, o, "bert_met", false);

      // per jeugdlid: aanwezigheid
      visibleJeugd.forEach(j => {
        const key = j.id;
        const cell = makePresenceCell(o, key, true); // ouders mogen jeugd klikken
        tr.appendChild(cell);
      });

    } else {
      // LEIDING / BEWERKEN
      // delete
      const delTd = document.createElement("td");
      if (isBewerken()) {
        delTd.textContent = "✖";
        delTd.classList.add("delete-btn");
        delTd.addEventListener("click", () => {
          if (confirm("Opkomst verwijderen?")) {
            remove(ref(db, `${speltak}/opkomsten/${o.id}`));
          }
        });
      }
      tr.appendChild(delTd);

      addDatumCell(tr, o, isBewerken());
      addTextCell(tr, o, "thema", isBewerken());
      addTextCell(tr, o, "bijzonderheden", isBewerken());
      addTypeCell(tr, o, isBewerken());
      addTimeCell(tr, o, "starttijd", isBewerken());
      addTimeCell(tr, o, "eindtijd", isBewerken());
      addTextCell(tr, o, "locatie", isBewerken());
      addTextCell(tr, o, "procor", isBewerken());
      addTextCell(tr, o, "bert_met", isBewerken());

      const [cntJ, cntL] = countAanwezigen(o, visibleJeugd, visibleLeiding);
      addStaticCell(tr, String(cntJ), "aanw-count");
      addStaticCell(tr, String(cntL), "aanw-count");

      visibleJeugd.forEach(j => {
        const key = j.id;
        const cell = makePresenceCell(o, key, true);
        tr.appendChild(cell);
      });

      // kijkers
      addNumberCell(tr, o, "kijkers", isBewerken());

      // leiding-aanwezigheid
      visibleLeiding.forEach((l, idx) => {
        const key = "leiding-" + l.id;
        const cell = makePresenceCell(o, key, true);
        if (idx === 0) cell.classList.add("col-split");
        tr.appendChild(cell);
      });

      // extra leiding
      addNumberCell(tr, o, "extraLeiding", isBewerken());

      // materiaal
      addTextCell(tr, o, "materiaal", isBewerken(), "Materiaal…");
    }

    tableBody.appendChild(tr);
  });
}

// Kleine helpers voor header & cellen
function addTH(label, extraClass) {
  const th = document.createElement("th");
  th.textContent = label;
  if (extraClass) th.classList.add(extraClass);
  headerRowTop.appendChild(th);
}

function addStaticCell(tr, text, extraClass) {
  const td = document.createElement("td");
  td.textContent = text;
  if (extraClass) td.classList.add(extraClass);
  tr.appendChild(td);
}

// -------------------------------------------------------------
// 12. Aanwezigheid helpers
// -------------------------------------------------------------

function ensureAanwezigheidStructure(o, jeugdLijst, leidingLijst) {
  if (!o.aanwezigheid) o.aanwezigheid = {};
  jeugdLijst.forEach(j => {
    if (!o.aanwezigheid[j.id]) o.aanwezigheid[j.id] = "onbekend";
  });
  leidingLijst.forEach(l => {
    const key = "leiding-" + l.id;
    if (!o.aanwezigheid[key]) o.aanwezigheid[key] = "onbekend";
  });
}

function makePresenceCell(o, key, allowClick) {
  const td = document.createElement("td");
  td.classList.add("presence-cell");

  const symbols = {
    aanwezig: "✔",
    afwezig: "✖",
    onbekend: "?"
  };

  function apply() {
    const state = o.aanwezigheid?.[key] || "onbekend";
    td.textContent = symbols[state];
    td.classList.remove("presence-aanwezig", "presence-afwezig", "presence-reminder");
    if (state === "aanwezig") td.classList.add("presence-aanwezig");
    if (state === "afwezig")  td.classList.add("presence-afwezig");
    if (state === "onbekend") td.classList.add("presence-reminder");
  }

  apply();

  if (allowClick) {
    td.addEventListener("click", () => {
      const states = ["aanwezig", "afwezig", "onbekend"];
      const cur = o.aanwezigheid?.[key] || "onbekend";
      const next = states[(states.indexOf(cur) + 1) % states.length];
      const nieuwe = { ...(o.aanwezigheid || {}), [key]: next };

      o.aanwezigheid = nieuwe;
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { aanwezigheid: nieuwe });
      apply();
    });
  }

  return td;
}

function countAanwezigen(o, jeugdLijst, leidingLijst) {
  let j = 0;
  let l = 0;
  jeugdLijst.forEach(x => {
    if (o.aanwezigheid?.[x.id] === "aanwezig") j++;
  });
  leidingLijst.forEach(x => {
    const key = "leiding-" + x.id;
    if (o.aanwezigheid?.[key] === "aanwezig") l++;
  });
  return [j, l];
}

// -------------------------------------------------------------
// 13. Cell-render helpers (datum, tekst, tijd, nummer, type)
// -------------------------------------------------------------

function addDatumCell(tr, o, editable) {
  const td = document.createElement("td");
  if (editable) {
    const input = document.createElement("input");
    input.type = "date";
    input.value = o.datum || "";
    input.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { datum: input.value });
    });
    td.appendChild(input);
  } else {
    td.textContent = toDisplayDate(o.datum);
  }
  tr.appendChild(td);
}

function addTextCell(tr, o, field, editable, placeholder) {
  const td = document.createElement("td");
  const value = o[field] || "";
  if (editable) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener("change", () => {
      const obj = {};
      obj[field] = input.value;
      update(ref(db, `${speltak}/opkomsten/${o.id}`), obj);
    });
    td.appendChild(input);
  } else {
    td.textContent = value;
  }
  tr.appendChild(td);
}

function addTimeCell(tr, o, field, editable) {
  const td = document.createElement("td");
  const value = o[field] || "";
  if (editable) {
    const input = document.createElement("input");
    input.type = "time";
    input.value = value;
    input.addEventListener("change", () => {
      const obj = {};
      obj[field] = input.value;
      update(ref(db, `${speltak}/opkomsten/${o.id}`), obj);
    });
    td.appendChild(input);
  } else {
    td.textContent = value;
  }
  tr.appendChild(td);
}

function addNumberCell(tr, o, field, editable) {
  const td = document.createElement("td");
  const value = Number(o[field] || 0);
  if (editable) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = value;
    input.addEventListener("change", () => {
      const num = parseInt(input.value, 10) || 0;
      const obj = {};
      obj[field] = num;
      update(ref(db, `${speltak}/opkomsten/${o.id}`), obj);
    });
    td.appendChild(input);
  } else {
    td.textContent = value || "";
  }
  tr.appendChild(td);
}

function addTypeCell(tr, o, editable) {
  const td = document.createElement("td");
  const types = {
    "": "Selecteer…",
    normaal: "Normale opkomst",
    bijzonder: "Bijzondere opkomst",
    kamp: "Kamp",
    geen: "Geen opkomst"
  };

  if (editable) {
    const select = document.createElement("select");
    Object.entries(types).forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (o.typeOpkomst === val) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        typeOpkomst: select.value
      });
    });
    td.appendChild(select);
  } else {
    td.textContent = types[o.typeOpkomst] || "";
  }

  tr.appendChild(td);
}

// -------------------------------------------------------------
// 14. Opkomsten & ledenbeheer
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

function renderLedenbeheer() {
  if (!ledenbeheerSection || !ledenbeheerJeugdList || !ledenbeheerLeidingList) return;

  if (!isBewerken()) {
    ledenbeheerSection.classList.add("hidden");
    return;
  }

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

  lijst.forEach((l, i) => (l.volgorde = i));

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

function addLidPopup() {
  if (!isBewerken()) return;

  const type = prompt("Type lid: 'jeugd' of 'leiding'")?.trim().toLowerCase();
  if (type !== "jeugd" && type !== "leiding") {
    alert("Type moet 'jeugd' of 'leiding' zijn.");
    return;
  }

  const naam = prompt("Naam:");
  if (!naam) return;

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  const lijst = type === "jeugd" ? jeugd : leiding;
  const volgorde = lijst.length;

  const nieuwRef = push(ref(db, `${speltak}/${path}`));
  set(nieuwRef, {
    naam,
    hidden: false,
    volgorde
  });
}

// -------------------------------------------------------------
// 15. Event listeners
// -------------------------------------------------------------

// Bewerkmodus-knop
if (editModeButton) {
  editModeButton.addEventListener("click", () => {
    if (isBewerken()) exitBewerkmodus();
    else enterBewerkmodus();
  });
}

// Ledenbeheer-paneel togglen (alleen in bewerken, maar check anyway)
if (ledenbeheerButton && ledenbeheerSection) {
  ledenbeheerButton.addEventListener("click", () => {
    ledenbeheerSection.classList.toggle("hidden");
  });
}

// Meldingen-paneel togglen
if (instellingenButton && meldingenSection) {
  instellingenButton.addEventListener("click", () => {
    meldingenSection.classList.toggle("hidden");
  });
}

// Filters
if (filterAll) {
  filterAll.addEventListener("click", () => {
    filterMode = "all";
    renderAll();
  });
}
if (filterFuture) {
  filterFuture.addEventListener("click", () => {
    filterMode = "future";
    renderAll();
  });
}
if (filterPast) {
  filterPast.addEventListener("click", () => {
    filterMode = "past";
    renderAll();
  });
}

// Print
if (printButton) {
  printButton.addEventListener("click", () => window.print());
}

// Maandbrief
if (maandbriefButton) {
  maandbriefButton.addEventListener("click", handleMaandbriefButtonClick);
}
if (maandbriefUpload) {
  maandbriefUpload.addEventListener("change", handleMaandbriefUploadChange);
}

// Meldingen
if (saveMeldingenButton) {
  saveMeldingenButton.addEventListener("click", saveMeldingenInstellingen);
}
if (testMeldingenButton) {
  testMeldingenButton.addEventListener("click", testMeldingen);
}

// Opkomst toevoegen
if (addOpkomstRow) {
  addOpkomstRow.addEventListener("click", addOpkomst);
}

// Infotekst
if (saveInfoButton) {
  saveInfoButton.addEventListener("click", saveInfoTekst);
}

// Lid toevoegen
if (addMemberButton) {
  addMemberButton.addEventListener("click", addLidPopup);
}

// -------------------------------------------------------------
// 16. Init
// -------------------------------------------------------------

loadData();
loadMaandbriefUrl();
updateModeUI();
