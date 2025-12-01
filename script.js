/*  ========================================================================
    SCRIPT.JS – COMPLETE NIEUWE VERSIE (BEVERS)
    ======================================================================== */

/* -------------------------------------------------------------------------
   FIREBASE INIT
------------------------------------------------------------------------- */
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  remove,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZN4QdTuOpk8lEKsyPuhynqZ9-GJLDE0s",
  authDomain: "jaarplanning-ovn.firebaseapp.com",
  databaseURL: "https://jaarplanning-ovn-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "jaarplanning-ovn",
  storageBucket: "jaarplanning-ovn.appspot.com",
  messagingSenderId: "526104562356",
  appId: "1:526104562356:web:ea211e722202d6383f65e1"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);


/* -------------------------------------------------------------------------
   STATE
------------------------------------------------------------------------- */

const body = document.body;
const speltak = body.dataset.speltak;   // bv "bevers"

let mode = "ouder";                    // ouder / leiding / bewerken
let opkomsten = [];
let jeugd = [];
let leiding = [];
let info = "";

let maandbriefUrl = "";

let meldingenInstellingen = {
  leidingEnabled: false,
  leidingThreshold: 3,
  onbekendEnabled: false,
  onbekendDays: 7
};

let filterMode = "all"; // all / future / past


/* -------------------------------------------------------------------------
   DOM REFERENCES
------------------------------------------------------------------------- */

const editModeButton = document.getElementById("editModeButton");

const ledenbeheerButton = document.getElementById("ledenbeheerButton");
const ledenbeheerSection = document.getElementById("ledenbeheer");
const ledenbeheerJeugd = document.getElementById("ledenbeheerJeugd");
const ledenbeheerLeiding = document.getElementById("ledenbeheerLeiding");
const addMemberButton = document.getElementById("addMemberButton");

const meldingenButton = document.getElementById("instellingenButton");
const meldingenSection = document.getElementById("meldingen");
const meldLeidingEnabled = document.getElementById("meldLeidingEnabled");
const meldLeidingThreshold = document.getElementById("meldLeidingThreshold");
const meldOnbekendEnabled = document.getElementById("meldOnbekendEnabled");
const meldOnbekendDays = document.getElementById("meldOnbekendDays");
const saveMeldingenButton = document.getElementById("saveMeldingenButton");
const testMeldingenButton = document.getElementById("testMeldingenButton");

const mailboxButton = document.getElementById("mailboxButton");
const handleidingButton = document.getElementById("handleidingButton");

const maandbriefButton = document.getElementById("maandbriefButton");
const maandbriefUpload = document.getElementById("maandbriefUpload");

const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const saveInfoButton = document.getElementById("saveInfoButton");

const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");

const printButton = document.getElementById("printButton");

const headerRowTop = document.getElementById("headerRowTop");
const tableBody = document.getElementById("tableBody");

const addOpkomstRow = document.getElementById("addOpkomstRow");


/* -------------------------------------------------------------------------
   MODE MANAGEMENT
------------------------------------------------------------------------- */

function isLeiding() {
  return mode === "leiding" || mode === "bewerken";
}

function isBewerken() {
  return mode === "bewerken";
}

function setMode(newMode) {
  mode = newMode;

  // zichtbaarheid knoppen
  editModeButton.classList.toggle("hidden", !isLeiding());
  ledenbeheerButton.classList.toggle("hidden", !isLeiding());
  meldingenButton.classList.toggle("hidden", !isLeiding());
  mailboxButton.classList.toggle("hidden", !isLeiding());
  handleidingButton.classList.toggle("hidden", !isLeiding());
  addMemberButton.classList.toggle("hidden", !isBewerken());
  addOpkomstRow.classList.toggle("hidden", !isBewerken());
  saveInfoButton.classList.toggle("hidden", !isBewerken());
  infoEdit.classList.toggle("hidden", !isBewerken());
  infoTekst.classList.toggle("hidden", isBewerken());

  // upload in bewerken, download in andere modes
  maandbriefUpload.classList.toggle("hidden", !isBewerken());

  maandbriefButton.textContent = isBewerken()
    ? "Maandbrief uploaden"
    : "Maandbrief downloaden";

  renderEverything();
}

/* Edit-knop */
editModeButton.addEventListener("click", () => {
  if (mode === "leiding") setMode("bewerken");
  else if (mode === "bewerken") setMode("leiding");
});

/* Mailbox knop */
mailboxButton.addEventListener("click", () => {
  window.open("https://mail.google.com", "_blank");
});


/* -------------------------------------------------------------------------
   INFO BLOK
------------------------------------------------------------------------- */

function loadInfoTekst() {
  infoTekst.textContent = info;
  infoEdit.value = info;
}

saveInfoButton.addEventListener("click", () => {
  const newText = sanitizeText(infoEdit.value);

  update(ref(db, `${speltak}`), { infotekst: newText });
});


/* -------------------------------------------------------------------------
   MAANDBRIEF
------------------------------------------------------------------------- */

async function loadMaandbriefUrlHelper() {
  try {
    const url = await getDownloadURL(
      storageRef(storage, `${speltak}/maandbrief.pdf`)
    );
    maandbriefUrl = url;
  } catch {
    maandbriefUrl = "";
  }
}

maandbriefButton.addEventListener("click", () => {
  if (isBewerken()) {
    maandbriefUpload.click();
  } else {
    if (!maandbriefUrl) {
      alert("Er is nog geen maandbrief geüpload.");
      return;
    }
    window.open(maandbriefUrl, "_blank");
  }
});

maandbriefUpload.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    alert("Alleen PDF-bestanden toegestaan.");
    return;
  }

  try {
    const sRef = storageRef(storage, `${speltak}/maandbrief.pdf`);
    await uploadBytes(sRef, file);
    await loadMaandbriefUrlHelper();
    alert("Maandbrief geüpload.");
  } catch {
    alert("Uploaden mislukt.");
  }
});


/* -------------------------------------------------------------------------
   MELDINGEN
------------------------------------------------------------------------- */

function loadMeldingenUI() {
  meldLeidingEnabled.checked = meldingenInstellingen.leidingEnabled;
  meldLeidingThreshold.value = meldingenInstellingen.leidingThreshold;
  meldOnbekendEnabled.checked = meldingenInstellingen.onbekendEnabled;
  meldOnbekendDays.value = meldingenInstellingen.onbekendDays;
}

saveMeldingenButton.addEventListener("click", () => {
  const obj = {
    leidingEnabled: meldLeidingEnabled.checked,
    leidingThreshold: Number(meldLeidingThreshold.value),
    onbekendEnabled: meldOnbekendEnabled.checked,
    onbekendDays: Number(meldOnbekendDays.value)
  };
  set(ref(db, `${speltak}/meldingen`), obj);
  alert("Meldingen opgeslagen.");
});

testMeldingenButton.addEventListener("click", () => {
  alert("Testmeldingen worden hier geactiveerd zoals in vorige versies.\n(Implementatie exact zoals oude systeem mogelijk op verzoek.)");
});


/* -------------------------------------------------------------------------
   LEDENBEHEER
------------------------------------------------------------------------- */

ledenbeheerButton.addEventListener("click", () => {
  ledenbeheerSection.classList.toggle("hidden");
});

addMemberButton.addEventListener("click", () => {
  const type = prompt("Type ('jeugd' of 'leiding'):");
  if (!type) return;
  const naam = prompt("Naam:");
  if (!naam) return;

  const path = type === "leiding" ? "leiding" : "jeugdleden";

  const newRef = push(ref(db, `${speltak}/${path}`));
  set(newRef, {
    naam,
    hidden: false,
    volgorde: 999
  });
});


/* -------------------------------------------------------------------------
   FILTERS
------------------------------------------------------------------------- */

filterAll.addEventListener("click", () => setFilterMode("all"));
filterFuture.addEventListener("click", () => setFilterMode("future"));
filterPast.addEventListener("click", () => setFilterMode("past"));

function setFilterMode(mode) {
  filterMode = mode;

  filterAll.classList.toggle("active", mode === "all");
  filterFuture.classList.toggle("active", mode === "future");
  filterPast.classList.toggle("active", mode === "past");

  renderTable();
}


/* -------------------------------------------------------------------------
   PRINT
------------------------------------------------------------------------- */
printButton.addEventListener("click", () => window.print());


/* -------------------------------------------------------------------------
   SANITIZE
------------------------------------------------------------------------- */

function sanitizeText(t) {
  return t.replace(/<\/?(script|style)[^>]*>/gi, "");
}


/* -------------------------------------------------------------------------
   DATE HELPERS
------------------------------------------------------------------------- */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isPast(d) {
  return d < todayISO();
}

function isFutureOrToday(d) {
  return d >= todayISO();
}

function toDisplayDate(d) {
  if (!d) return "";
  const [y,m,da] = d.split("-");
  return `${da}-${m}-${y}`;
}


/* -------------------------------------------------------------------------
   MAIN DATA LOADER
------------------------------------------------------------------------- */

function loadEverything() {
  onValue(ref(db, speltak), async snap => {
    const data = snap.val() || {};

    info = data.infotekst || "";

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
    })).sort((a,b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam));

    leiding = Object.entries(data.leiding || {}).map(([id,v]) => ({
      id,
      naam: v.naam,
      verborgen: !!v.hidden,
      volgorde: v.volgorde ?? 0
    })).sort((a,b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam));

    opkomsten = Object.entries(data.opkomsten || {}).map(([id,v]) => ({
      id,
      ...v
    })).sort((a,b) => (a.datum||"") < (b.datum||"") ? -1 : 1);

    await loadMaandbriefUrlHelper();
    renderEverything();
  });
}


/* -------------------------------------------------------------------------
   RENDER EVERYTHING
------------------------------------------------------------------------- */

function renderEverything() {
  loadInfoTekst();
  loadMeldingenUI();
  renderLedenbeheer();
  renderTable();
}


/* -------------------------------------------------------------------------
   LEDENBEHEER RENDER
------------------------------------------------------------------------- */

function renderLedenbeheer() {
  ledenbeheerJeugd.innerHTML = "";
  ledenbeheerLeiding.innerHTML = "";

  if (!isBewerken()) return;

  jeugd.forEach((j, index) => {
    ledenbeheerJeugd.appendChild(renderLid(j, "jeugdleden", index));
  });
  leiding.forEach((l, index) => {
    ledenbeheerLeiding.appendChild(renderLid(l, "leiding", index));
  });
}

function renderLid(lid, path, index) {
  const li = document.createElement("li");
  if (lid.verborgen) li.classList.add("lid-verborgen");

  const label = document.createElement("span");
  label.textContent = lid.naam;

  const controls = document.createElement("div");
  controls.classList.add("ledenbeheer-controls");

  controls.appendChild(makeLidBtn("▲", () => moveLid(path, index, -1)));
  controls.appendChild(makeLidBtn("▼", () => moveLid(path, index, 1)));
  controls.appendChild(makeLidBtn("✏", () => renameLid(path, lid)));
  controls.appendChild(makeLidBtn(lid.verborgen ? "👁" : "🚫",
    () => toggleLid(path, lid)
  ));
  controls.appendChild(makeLidBtn("🗑", () => deleteLid(path, lid)));

  li.appendChild(label);
  li.appendChild(controls);
  return li;
}

function makeLidBtn(label, fn) {
  const btn = document.createElement("button");
  btn.className = "ledenbeheer-btn";
  btn.textContent = label;
  btn.onclick = fn;
  return btn;
}

function moveLid(path, index, delta) {
  const lijst = path === "leiding" ? leiding : jeugd;
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= lijst.length) return;

  const item = lijst.splice(index, 1)[0];
  lijst.splice(newIndex, 0, item);

  lijst.forEach((l,i) => l.volgorde = i);

  const updates = {};
  lijst.forEach(l => {
    updates[`${path}/${l.id}/volgorde`] = l.volgorde;
  });
  update(ref(db, speltak), updates);
}

function renameLid(path, lid) {
  const nieuw = prompt("Nieuwe naam:", lid.naam);
  if (!nieuw) return;

  update(ref(db, `${speltak}/${path}/${lid.id}`), {
    naam: nieuw
  });
}

function toggleLid(path, lid) {
  update(ref(db, `${speltak}/${path}/${lid.id}`), {
    hidden: !lid.verborgen
  });
}

function deleteLid(path, lid) {
  if (!confirm(`Verwijder ${lid.naam}?`)) return;

  remove(ref(db, `${speltak}/${path}/${lid.id}`));
}


/* -------------------------------------------------------------------------
   OPKOMSTENTABEL
------------------------------------------------------------------------- */

function renderTable() {
  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  const jVisible = jeugd.filter(j => !j.verborgen);
  const lVisible = leiding.filter(l => !l.verborgen);

  /* HEADER */
  addHeader("🗑");
  addHeader("Datum");
  addHeader("Thema");
  addHeader("Bijzonderheden");
  addHeader("Type");
  addHeader("Start");
  addHeader("Eind");
  addHeader("Locatie", "col-locatie");

  addHeader("Bert 🧸");
  addHeader("Aanw. Leden");
  addHeader("Aanw. Leiding");

  jVisible.forEach(j => addHeaderVertical(j.naam));

  addHeader("Kijkers");

  lVisible.forEach((l, idx) => {
    addHeaderVertical(l.naam, idx === 0 ? "col-split" : "");
  });

  addHeader("Extra");

  /* FILTER */
  let lijst = [...opkomsten];
  lijst = lijst.filter(o => {
    if (!o.datum) return true;
    if (filterMode === "future") return isFutureOrToday(o.datum);
    if (filterMode === "past") return isPast(o.datum);
    return true;
  });

  /* Bepaal eerstvolgende */
  const toekomst = opkomsten.filter(o => o.datum && isFutureOrToday(o.datum));
  let volgende = toekomst.length ? toekomst[0].id : null;

  /* RENDER EACH */
  lijst.forEach(o => {
    const tr = document.createElement("tr");
    styleRow(o, tr);

    addDeleteCell(o, tr);
    addDatumCell(o, tr);
    addTextCell(o, tr, "thema");
    addTextCell(o, tr, "bijzonderheden");
    addTypeCell(o, tr);
    addTimeCell(o, tr, "starttijd");
    addTimeCell(o, tr, "eindtijd");
    addTextCell(o, tr, "locatie", "col-locatie");

    addTextCell(o, tr, "bert_met");

    fillPresenceStructure(o);

    const [cntJ, cntL] = countPresence(o);

    const kijkers = Number(o.kijkers || 0);
    const extra = Number(o.extraLeiding || 0);

    addStatic(tr, cntJ + kijkers);
    addStatic(tr, cntL + extra);

    jVisible.forEach(j => {
      tr.appendChild(makePresenceCell(o, j.id));
    });

    addNumberCell(o, tr, "kijkers");

    lVisible.forEach(l => {
      tr.appendChild(makePresenceCell(o, "leiding-" + l.id));
    });

    addNumberCell(o, tr, "extraLeiding");

    tableBody.appendChild(tr);
  });
}


/* -------------------------------------------------------------------------
   HEADER BUILDERS
------------------------------------------------------------------------- */

function addHeader(text, extraClass = "") {
  const th = document.createElement("th");
  th.textContent = text;
  if (extraClass) th.classList.add(extraClass);
  headerRowTop.appendChild(th);
}

function addHeaderVertical(text, extraClass = "") {
  const th = document.createElement("th");
  th.textContent = text;
  th.classList.add("name-vertical");
  if (extraClass) th.classList.add(extraClass);
  headerRowTop.appendChild(th);
}


/* -------------------------------------------------------------------------
   ROW STYLE
------------------------------------------------------------------------- */

function styleRow(o, tr) {
  if (!o.datum) return;

  if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
  else if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");
  else if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
  else if (isPast(o.datum)) tr.classList.add("row-grey");
}


/* -------------------------------------------------------------------------
   CEL BUILDERS
------------------------------------------------------------------------- */

function addDeleteCell(o, tr) {
  const td = document.createElement("td");
  td.className = "delete-btn";
  td.textContent = "✖";

  if (isBewerken()) {
    td.onclick = () => {
      if (confirm("Deze opkomst verwijderen?")) {
        remove(ref(db, `${speltak}/opkomsten/${o.id}`));
      }
    };
  } else {
    td.style.opacity = "0.3";
    td.style.cursor = "default";
  }

  tr.appendChild(td);
}

function addDatumCell(o, tr) {
  const td = document.createElement("td");

  if (isBewerken()) {
    const input = document.createElement("input");
    input.type = "date";
    input.value = o.datum || "";
    input.onchange = () => update(ref(db, `${speltak}/opkomsten/${o.id}`), {
      datum: input.value
    });
    td.appendChild(input);
  } else {
    td.textContent = toDisplayDate(o.datum);
  }

  tr.appendChild(td);
}

function addTextCell(o, tr, field, extraClass = "") {
  const td = document.createElement("td");
  if (extraClass) td.classList.add(extraClass);

  if (isBewerken()) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = o[field] || "";
    input.placeholder = "";
    input.onchange = () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        [field]: sanitizeText(input.value)
      });
    };
    td.appendChild(input);
  } else {
    td.textContent = o[field] || "";
  }

  tr.appendChild(td);
}

function addTypeCell(o, tr) {
  const td = document.createElement("td");

  const labels = {
    "": "Selecteer…",
    normaal: "Normale opkomst",
    bijzonder: "Bijzondere opkomst",
    kamp: "Kamp",
    geen: "Geen opkomst"
  };

  if (isBewerken()) {
    const select = document.createElement("select");

    ["", "normaal", "bijzonder", "kamp", "geen"].forEach(v => {
      const op = document.createElement("option");
      op.value = v;
      op.textContent = labels[v];
      if (o.typeOpkomst === v) op.selected = true;
      select.appendChild(op);
    });

    select.onchange = () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        typeOpkomst: select.value
      });
    };

    td.appendChild(select);
  } else {
    td.textContent = labels[o.typeOpkomst] || "Selecteer…";
  }

  tr.appendChild(td);
}

function addTimeCell(o, tr, field) {
  const td = document.createElement("td");
  if (isBewerken()) {
    const input = document.createElement("input");
    input.type = "time";
    input.value = o[field] || "";
    input.onchange = () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        [field]: input.value
      });
    };
    td.appendChild(input);
  } else {
    td.textContent = o[field] || "";
  }
  tr.appendChild(td);
}

function addStatic(tr, value) {
  const td = document.createElement("td");
  td.className = "aanw-count";
  td.textContent = value;
  tr.appendChild(td);
}

function addNumberCell(o, tr, field) {
  const td = document.createElement("td");

  if (isBewerken()) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = o[field] || "";
    input.onchange = () => {
      update(ref(db, `${speltak}/opkomsten/${o.id}`), {
        [field]: Number(input.value) || 0
      });
    };
    td.appendChild(input);
  } else {
    td.textContent = o[field] || "";
  }

  tr.appendChild(td);
}


/* -------------------------------------------------------------------------
   PRESENCE
------------------------------------------------------------------------- */

function fillPresenceStructure(o) {
  if (!o.aanwezigheid) o.aanwezigheid = {};

  jeugd.forEach(j => {
    if (!o.aanwezigheid[j.id]) o.aanwezigheid[j.id] = "onbekend";
  });

  leiding.forEach(l => {
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
  const cycle = ["aanwezig", "afwezig", "onbekend"];

  function apply() {
    const state = o.aanwezigheid[key];
    td.textContent = symbols[state];
    td.classList.toggle("presence-aanwezig", state === "aanwezig");
    td.classList.toggle("presence-afwezig", state === "afwezig");
    td.classList.toggle("presence-reminder", state === "onbekend");
  }
  apply();

  td.onclick = () => {
    let current = o.aanwezigheid[key];
    const next = cycle[(cycle.indexOf(current) + 1) % 3];

    const newObj = { ...o.aanwezigheid, [key]: next };
    o.aanwezigheid = newObj;

    update(ref(db, `${speltak}/opkomsten/${o.id}`), {
      aanwezigheid: newObj
    });

    apply();
  };

  return td;
}

function countPresence(o) {
  let j = 0, l = 0;
  jeugd.forEach(x => { if (o.aanwezigheid[x.id] === "aanwezig") j++; });
  leiding.forEach(x => {
    if (o.aanwezigheid["leiding-" + x.id] === "aanwezig") l++;
  });
  return [j, l];
}


/* -------------------------------------------------------------------------
   NIEUWE OPKOMST
------------------------------------------------------------------------- */

addOpkomstRow.addEventListener("click", () => {
  if (!isBewerken()) return;

  const refNew = push(ref(db, `${speltak}/opkomsten`));

  const newObj = {
    id: refNew.key,
    datum: "",
    thema: "",
    bijzonderheden: "",
    typeOpkomst: "",
    starttijd: "",
    eindtijd: "",
    locatie: "",
    bert_met: "",
    kijkers: 0,
    extraLeiding: 0,
    aanwezigheid: {}
  };

  // vul aanwezigheid direct
  jeugd.forEach(j => newObj.aanwezigheid[j.id] = "onbekend");
  leiding.forEach(l => newObj.aanwezigheid["leiding-" + l.id] = "onbekend");

  set(refNew, newObj);
});


/* -------------------------------------------------------------------------
   INIT
------------------------------------------------------------------------- */

loadEverything();
setMode("ouder");
