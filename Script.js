// speltak.js — jaarplanning / aanwezigheid (Bevers, Welpen, etc.)

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

/* -----------------------------------------------------
   FIREBASE INIT — NIEUWE SCOUTING DATABASE
----------------------------------------------------- */

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

/* -----------------------------------------------------
   GLOBALE STATE
----------------------------------------------------- */

const body = document.body;
const speltak = body.dataset.speltak || "bevers";

const DEFAULT_ADMIN_PASSWORD = "bevers";

let isAdmin = false;
let filterMode = "all";

let opkomsten = [];
let jeugd = [];
let leiding = [];
let infoTekst = "";

let meldingenInstellingen = {
  leidingEnabled: false,
  leidingThreshold: 3,
  onbekendEnabled: false,
  onbekendDays: 7
};

let maandbriefUrl = "";

/* -----------------------------------------------------
   DOM ELEMENTEN
----------------------------------------------------- */

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

const maandbriefButton = document.getElementById("maandbriefButton");
const maandbriefUpload = document.getElementById("maandbriefUpload");

/* -----------------------------------------------------
   DATUMFUNCTIES
----------------------------------------------------- */

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

/* -----------------------------------------------------
   MAANDBRIEF (PDF)
----------------------------------------------------- */

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
  if (isAdmin) {
    maandbriefUpload.click();
  } else {
    if (!maandbriefUrl) {
      alert("Er is nog geen maandbrief geüpload.");
      return;
    }
    window.open(maandbriefUrl, "_blank");
  }
}

function updateMaandbriefButtonLabel() {
  maandbriefButton.textContent = isAdmin
    ? "Maandbrief uploaden"
    : "Maandbrief downloaden";
}

/* -----------------------------------------------------
   DATA LADEN
----------------------------------------------------- */

function loadData() {
  onValue(ref(db, speltak), snapshot => {
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
      .sort((a, b) => compareISO(a.datum, b.datum));

    renderInfoTekst();
    renderMeldingenInstellingen();
    renderTable();
    renderLedenbeheer();
  });
}

/* -----------------------------------------------------
   INFOTEKST
----------------------------------------------------- */

function renderInfoTekst() {
  infoTekstP.textContent = infoTekst;
  infoTekstEdit.value = infoTekst;
}

function saveInfoTekst() {
  update(ref(db, speltak), { infotekst: infoTekstEdit.value });
}

/* -----------------------------------------------------
   MELDINGEN
----------------------------------------------------- */

function renderMeldingenInstellingen() {
  meldLeidingEnabledInput.checked = !!meldingenInstellingen.leidingEnabled;
  meldLeidingThresholdInput.value = meldingenInstellingen.leidingThreshold;
  meldOnbekendEnabledInput.checked = !!meldingenInstellingen.onbekendEnabled;
  meldOnbekendDaysInput.value = meldingenInstellingen.onbekendDays;
}

function saveMeldingenInstellingen() {
  set(ref(db, `${speltak}/meldingen`), {
    leidingEnabled: !!meldLeidingEnabledInput.checked,
    leidingThreshold: Number(meldLeidingThresholdInput.value || 3),
    onbekendEnabled: !!meldOnbekendEnabledInput.checked,
    onbekendDays: Number(meldOnbekendDaysInput.value || 7)
  }).then(() => alert("Opgeslagen."));
}

function testMeldingenInstellingen() {
  const problemen = [];

  opkomsten.forEach(o => {
    if (!o.datum) return;

    if (meldingenInstellingen.leidingEnabled) {
      let afwezig = 0;
      leiding.forEach(l => {
        if (o.aanwezigheid?.[`leiding-${l.id}`] === "afwezig") afwezig++;
      });
      if (afwezig >= meldingenInstellingen.leidingThreshold) {
        problemen.push(`Opkomst ${toDisplayDate(o.datum)}: ${afwezig} leiding afwezig.`);
      }
    }

    if (meldingenInstellingen.onbekendEnabled &&
        isBinnenNDagen(o.datum, meldingenInstellingen.onbekendDays)) {

      let onbekend = 0;

      jeugd.forEach(j => {
        if (o.aanwezigheid?.[j.id] === "onbekend") onbekend++;
      });

      leiding.forEach(l => {
        if (o.aanwezigheid?.[`leiding-${l.id}`] === "onbekend") onbekend++;
      });

      if (onbekend > 0) {
        problemen.push(`Opkomst ${toDisplayDate(o.datum)}: ${onbekend} personen onbekend.`);
      }
    }
  });

  if (!problemen.length) {
    alert("Geen meldingen.");
    return;
  }

  const subject = encodeURIComponent("Aanwezigheidsmeldingen");
  const body = encodeURIComponent(problemen.join("\n"));
  window.location.href = `mailto:ovnscouting+${speltak}@gmail.com?subject=${subject}&body=${body}`;
}

/* -----------------------------------------------------
   HEADER / TABEL
----------------------------------------------------- */

function clearNode(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
}

function addTH(row, text, rowSpan = 1, colSpan = 1, c = "") {
  const th = document.createElement("th");
  th.textContent = text;
  th.rowSpan = rowSpan;
  th.colSpan = colSpan;
  if (c) th.classList.add(c);
  row.appendChild(th);
}

function renderTable() {
  clearNode(headerRowTop);
  clearNode(tableBody);

  const zichtbareJeugd   = jeugd.filter(j => !j.verborgen);
  const zichtbareLeiding = leiding.filter(l => !l.verborgen);

  addTH(headerRowTop, "🗑");
  addTH(headerRowTop, "Datum");
  addTH(headerRowTop, "Thema");
  addTH(headerRowTop, "Bijzonderheden");
  addTH(headerRowTop, "Type");
  addTH(headerRowTop, "Start");
  addTH(headerRowTop, "Eind");
  addTH(headerRowTop, "Locatie");

  if (isAdmin) addTH(headerRowTop, "Procor");
  addTH(headerRowTop, "Bert 🧸");

  addTH(headerRowTop, "Aanw. Leden",   1, 1, "aanw-count");
  addTH(headerRowTop, "Aanw. Leiding", 1, 1, "aanw-count");

  zichtbareJeugd.forEach(j => {
    const th = document.createElement("th");
    th.textContent = j.naam;
    th.classList.add("name-vertical");
    headerRowTop.appendChild(th);
  });

  const kijkTh = document.createElement("th");
  kijkTh.textContent = "Kijkers";
  kijkTh.classList.add("presence-col");
  headerRowTop.appendChild(kijkTh);

  zichtbareLeiding.forEach((l, idx) => {
    const th = document.createElement("th");
    th.textContent = l.naam;
    th.classList.add("name-vertical");
    if (idx === 0) th.classList.add("col-split");
    headerRowTop.appendChild(th);
  });

  const extraTh = document.createElement("th");
  extraTh.textContent = "Extra";
  extraTh.classList.add("presence-col");
  headerRowTop.appendChild(extraTh);

  let volgendeId = null;
  const toekomstige = opkomsten
    .filter(o => isFutureOrToday(o.datum))
    .sort((a, b) => compareISO(a.datum, b.datum));

  if (toekomstige.length) volgendeId = toekomstige[0].id;

  let lijst = [...opkomsten];
  if (filterMode === "future") lijst = lijst.filter(o => isFutureOrToday(o.datum));
  if (filterMode === "past")   lijst = lijst.filter(o => isPast(o.datum));

  lijst.forEach(o => {
    const tr = document.createElement("tr");

    if (!o.datum) {
    } else if (o.typeOpkomst === "geen") {
      tr.classList.add("row-geenopkomst");
    } else if (isPast(o.datum)) {
      tr.classList.add("row-grey");
    }

    if (o.id === volgendeId) tr.classList.add("row-next");
    if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
    if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");

    addDeleteCell(tr, o);
    addDatumCell(tr, o);
    addEditableTextCell(tr, o, "thema", "Typ thema…");
    addEditableTextCell(tr, o, "bijzonderheden", "Typ bijzonderheden…");
    addTypeCell(tr, o);
    addTimeCell(tr, o, "starttijd");
    addTimeCell(tr, o, "eindtijd");
    addLocatieCell(tr, o);

    if (isAdmin) addProcorCell(tr, o);
    addBertCell(tr, o);

    ensurePresenceStructure(o, zichtbareJeugd, zichtbareLeiding);

    const [cntJ, cntL] = countAanwezigen(o, zichtbareJeugd, zichtbareLeiding);
    const kijkCount = Number(o.kijkers || 0);
    const extraCount = Number(o.extraLeiding || 0);

    addStaticCell(tr, cntJ + kijkCount, "aanw-count");
    addStaticCell(tr, cntL + extraCount, "aanw-count");

    zichtbareJeugd.forEach(j => {
      const td = makePresenceCell(o, j.id);
      tr.appendChild(td);
    });

    addNumberCell(tr, o, "kijkers");

    zichtbareLeiding.forEach((l, idx) => {
      const key = `leiding-${l.id}`;
      const td = makePresenceCell(o, key);
      if (idx === 0) td.classList.add("col-split");
      tr.appendChild(td);
    });

    addNumberCell(tr, o, "extraLeiding");

    tableBody.appendChild(tr);
  });

  addOpkomstRow.classList.toggle("hidden", !isAdmin);
}

function addStaticCell(tr, text, c) {
  const td = document.createElement("td");
  td.textContent = text;
  if (c) td.classList.add(c);
  tr.appendChild(td);
}

function addNumberCell(tr, o, field) {
  const td = document.createElement("td");

  const value = Number(o[field] || 0);

  if (isAdmin) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = value ? String(value) : "";
    input.placeholder = "0";

    input.addEventListener("change", () => {
      const num = parseInt(input.value, 10) || 0;
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: num });
    });

    td.appendChild(input);
  } else {
    td.textContent = value ? String(value) : "";
  }

  tr.appendChild(td);
}

/* -----------------------------------------------------
   CELL HELPERS
----------------------------------------------------- */

function addDeleteCell(tr, o) {
  const td = document.createElement("td");

  if (isAdmin) {
    td.textContent = "✖";
    td.classList.add("delete-btn");

    td.addEventListener("click", () => {
      if (confirm("Deze opkomst verwijderen?")) {
        remove(ref(db, `${speltak}/opkomsten/${o.id}`));
      }
    });
  }

  tr.appendChild(td);
}

function addDatumCell(tr, o) {
  const td = document.createElement("td");

  if (isAdmin && !o.datum) {
    const input = document.createElement("input");
    input.type = "date";
    input.placeholder = "Datum";
    td.appendChild(input);

    input.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { datum: input.value });
    });

    tr.appendChild(td);
    return;
  }

  td.textContent = toDisplayDate(o.datum);

  if (isAdmin) {
    td.classList.add("editable");

    td.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "date";
      input.value = o.datum || "";
      td.innerHTML = "";
      td.appendChild(input);
      input.focus();

      input.addEventListener("change", () => {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { datum: input.value });
      });
    });
  }

  tr.appendChild(td);
}

function addEditableTextCell(tr, o, field, placeholder) {
  const td = document.createElement("td");

  if (isAdmin && !o[field]) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;

    input.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: input.value });
    });

    td.appendChild(input);
    tr.appendChild(td);
    return;
  }

  td.textContent = o[field] || "";

  if (isAdmin) {
    td.classList.add("editable");

    td.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = o[field] || "";
      td.innerHTML = "";
      td.appendChild(input);
      input.focus();

      input.addEventListener("change", () => {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { [field]: input.value });
      });
    });
  }

  tr.appendChild(td);
}

function addTypeCell(tr, o) {
  const td = document.createElement("td");

  const labels = {
    "": "Selecteer…",
    normaal: "Normale opkomst",
    bijzonder: "Bijzondere opkomst",
    kamp: "Kamp",
    geen: "Geen opkomst"
  };

  td.textContent = labels[o.typeOpkomst] || "Selecteer…";

  if (isAdmin) {
    td.classList.add("editable");

    td.addEventListener("click", () => {
      const select = document.createElement("select");

      [
        { value: "", label: "Selecteer…" },
        { value: "normaal", label: "Normale opkomst" },
        { value: "bijzonder", label: "Bijzondere opkomst" },
        { value: "kamp", label: "Kamp" },
        { value: "geen", label: "Geen opkomst" }
      ].forEach(opt => {
        const el = document.createElement("option");
        el.value = opt.value;
        el.textContent = opt.label;
        if (opt.value === o.typeOpkomst) el.selected = true;
        select.appendChild(el);
      });

      td.innerHTML = "";
      td.appendChild(select);
      select.focus();

      select.addEventListener("change", () => {
        update(ref(db, `${speltak}/opkomsten/${o.id}`), { typeOpkomst: select.value });
      });
    });
  }

  tr.appendChild(td);
}

function addTimeCell(tr, o, field) {
  const td = document.createElement("td");

  if (isAdmin) {
    const input = document.createElement("input");
    input.type = "time";
    input.value = o[field] || "";

    input.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        [field]: input.value
      });
    });

    td.appendChild(input);
  } else {
    td.textContent = o[field] || "";
  }

  tr.appendChild(td);
}

function addLocatieCell(tr, o) {
  const td = document.createElement("td");

  if (isAdmin) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = o.locatie || "";

    input.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        locatie: input.value
      });
    });

    td.appendChild(input);
  } else {
    td.textContent = o.locatie || "";
  }

  tr.appendChild(td);
}

function addProcorCell(tr, o) {
  const td = document.createElement("td");

  if (isAdmin) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = o.procor || "";

    input.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        procor: input.value
      });
    });

    td.appendChild(input);
  } else {
    td.textContent = o.procor || "";
  }

  tr.appendChild(td);
}

function addBertCell(tr, o) {
  const td = document.createElement("td");

  if (isAdmin) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = o.bert_met || "";

    input.addEventListener("change", () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        bert_met: input.value
      });
    });

    td.appendChild(input);
  } else {
    td.textContent = o.bert_met || "";
  }

  tr.appendChild(td);
}

/* -----------------------------------------------------
   AANWEZIGHEID
----------------------------------------------------- */

function ensurePresenceStructure(o, jeugdLijst, leidingLijst) {
  if (!o.aanwezigheid) o.aanwezigheid = {};

  jeugdLijst.forEach(j => {
    if (!o.aanwezigheid[j.id]) o.aanwezigheid[j.id] = "onbekend";
  });

  leidingLijst.forEach(l => {
    const key = "leiding-" + l.id;
    if (!o.aanwezigheid[key]) o.aanwezigheid[key] = "onbekend";
  });
}

function makePresenceCell(o, key) {
  const td = document.createElement("td");
  td.classList.add("presence-cell");

  const symbols = {
    aanwezig: "✔",
    afwezig: "✖",
    onbekend: "?"
  };

  const states = ["aanwezig", "afwezig", "onbekend"];

  const apply = () => {
    const state = o.aanwezigheid?.[key] || "onbekend";
    td.textContent = symbols[state];
    td.classList.remove("presence-aanwezig", "presence-afwezig", "presence-reminder");
    if (state === "aanwezig") td.classList.add("presence-aanwezig");
    if (state === "afwezig")  td.classList.add("presence-afwezig");
    if (state === "onbekend") td.classList.add("presence-reminder");
  };

  apply();

  td.addEventListener("click", () => {
    const current = o.aanwezigheid?.[key] || "onbekend";
    const nextState = states[(states.indexOf(current) + 1) % states.length];

    const nieuweAanw = { ...(o.aanwezigheid), [key]: nextState };
    o.aanwezigheid = nieuweAanw;

    update(ref(db, `${speltak}/opkomsten/${o.id}`), {
      aanwezigheid: nieuweAanw
    });

    apply();
  });

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

/* -----------------------------------------------------
   NIEUWE OPKOMST
----------------------------------------------------- */

function addOpkomst() {
  if (!isAdmin) return;

  const nieuwRef = push(ref(db, `${speltak}/opkomsten`));

  const nieuw = {
    id: nieuwRef.key,
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
    aanwezigheid: {}
  };

  set(nieuwRef, nieuw);
}

/* -----------------------------------------------------
   LEDENBEHEER
----------------------------------------------------- */

function renderLedenbeheer() {
  if (!isAdmin) {
    ledenbeheerJeugdList.innerHTML = "";
    ledenbeheerLeidingList.innerHTML = "";
    return;
  }

  ledenbeheerJeugdList.innerHTML = "";
  jeugd.forEach((lid, idx) => {
    ledenbeheerJeugdList.appendChild(buildLidItem(lid, "jeugd", idx));
  });

  ledenbeheerLeidingList.innerHTML = "";
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
  const nieuw = prompt("Nieuwe naam:", lid.naam);
  if (!nieuw) return;

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  update(ref(db, `${speltak}/${path}/${lid.id}`), { naam: nieuw });
}

function toggleVerborgen(type, lid) {
  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  update(ref(db, `${speltak}/${path}/${lid.id}`), { hidden: !lid.verborgen });
}

function deleteLid(type, lid) {
  if (!confirm(`Lid ${lid.naam} verwijderen?`)) return;

  const path = type === "jeugd" ? "jeugdleden" : "leiding";
  remove(ref(db, `${speltak}/${path}/${lid.id}`));
}

function addLidPopup() {
  if (!isAdmin) return;

  const type = prompt("Type lid: 'jeugd' of 'leiding'").trim().toLowerCase();
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

/* -----------------------------------------------------
   ADMIN / FILTER / PRINT
----------------------------------------------------- */

function toggleAdmin() {
  if (!isAdmin) {
    const pw = prompt("Wachtwoord:");
    if (pw !== DEFAULT_ADMIN_PASSWORD) return;
    isAdmin = true;
  } else {
    isAdmin = false;
  }

  addMemberButton.classList.toggle("hidden", !isAdmin);
  ledenbeheerButton.classList.toggle("hidden", !isAdmin);
  mailboxButton.classList.toggle("hidden", !isAdmin);
  handleidingButton.classList.toggle("hidden", !isAdmin);
  instellingenButton.classList.toggle("hidden", !isAdmin);

  infoTekstP.classList.toggle("hidden", isAdmin);
  infoTekstEdit.classList.toggle("hidden", !isAdmin);
  saveInfoButton.classList.toggle("hidden", !isAdmin);

  ledenbeheerSection.classList.add("hidden");
  meldingenSection.classList.add("hidden");

  updateMaandbriefButtonLabel();
  renderTable();
  renderLedenbeheer();
}

function toggleLedenbeheer() {
  if (!isAdmin) return;
  ledenbeheerSection.classList.toggle("hidden");
}

function toggleMeldingen() {
  if (!isAdmin) return;
  meldingenSection.classList.toggle("hidden");
}

function setFilter(mode) {
  filterMode = mode;
  filterAll.classList.toggle("active", mode === "all");
  filterFuture.classList.toggle("active", mode === "future");
  filterPast.classList.toggle("active", mode === "past");
  renderTable();
}

function doPrint() {
  window.print();
}

/* -----------------------------------------------------
   INIT
----------------------------------------------------- */

editModeButton.addEventListener("click", toggleAdmin);

if (addMemberButton) addMemberButton.addEventListener("click", addLidPopup);
if (ledenbeheerButton) ledenbeheerButton.addEventListener("click", toggleLedenbeheer);
if (instellingenButton) instellingenButton.addEventListener("click", toggleMeldingen);

if (addOpkomstRow) addOpkomstRow.addEventListener("click", addOpkomst);

if (saveInfoButton) saveInfoButton.addEventListener("click", saveInfoTekst);

if (saveMeldingenButton) saveMeldingenButton.addEventListener("click", saveMeldingenInstellingen);
if (testMeldingenButton) testMeldingenButton.addEventListener("click", testMeldingenInstellingen);

if (maandbriefButton) maandbriefButton.addEventListener("click", handleMaandbriefButtonClick);
if (maandbriefUpload) maandbriefUpload.addEventListener("change", handleMaandbriefUploadChange);

filterAll.addEventListener("click", () => setFilter("all"));
filterFuture.addEventListener("click", () => setFilter("future"));
filterPast.addEventListener("click", () => setFilter("past"));

if (printButton) printButton.addEventListener("click", doPrint);

updateMaandbriefButtonLabel();
loadData();
loadMaandbriefUrl();
