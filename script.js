// =============================================================
// Firebase INIT
// =============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getDatabase, ref, onValue, set, update, push, remove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
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

// =============================================================
// MODE SYSTEEM
// =============================================================
let mode = localStorage.getItem("mode");
if (mode !== "leiding" && mode !== "bewerken") mode = "ouder";

function isOuder() { return mode === "ouder"; }
function isLeiding() { return mode === "leiding"; }
function isBewerken() { return mode === "bewerken"; }

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

// =============================================================
// ELEMENTEN
// =============================================================
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

const headerRowTop = document.getElementById("headerRowTop");
const tableBody = document.getElementById("tableBody");
const addOpkomstRow = document.getElementById("addOpkomstRow");

const infoDisplay = document.getElementById("infotekstDisplay");
const infoEditor = document.getElementById("infotekstEditor");
const infoToolbar = document.getElementById("infoToolbar");
const saveInfoButton = document.getElementById("saveInfoButton");

const editModeButton = document.getElementById("editModeButton");
const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");
const printButton = document.getElementById("printButton");
const handleidingButton = document.getElementById("handleidingButton");
const mailboxButton = document.getElementById("mailboxButton");
const ledenbeheerButton = document.getElementById("ledenbeheerButton");
const instellingenButton = document.getElementById("instellingenButton");
const addMemberButton = document.getElementById("addMemberButton");

const ledenbeheerSection = document.getElementById("ledenbeheer");
const ledenbeheerJeugdList = document.getElementById("ledenbeheerJeugd");
const ledenbeheerLeidingList = document.getElementById("ledenbeheerLeiding");

const meldingenSection = document.getElementById("meldingen");
const meldLeidingEnabledInput = document.getElementById("meldLeidingEnabled");
const meldLeidingThresholdInput = document.getElementById("meldLeidingThreshold");
const meldOnbekendEnabledInput = document.getElementById("meldOnbekendEnabled");
const meldOnbekendDaysInput = document.getElementById("meldOnbekendDays");
const saveMeldingenButton = document.getElementById("saveMeldingenButton");
const testMeldingenButton = document.getElementById("testMeldingenButton");

// Popup
const popupOverlay = document.getElementById("popupOverlay");
const popupCancel = document.getElementById("popupCancel");
const popupSave = document.getElementById("popupSave");

// =============================================================
// HULPFUNCTIES
// =============================================================
function successBar(msg) {
    const bar = document.getElementById("successBar");
    bar.textContent = msg;
    bar.classList.add("show");
    setTimeout(() => bar.classList.remove("show"), 4000);
}

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
  return a < b ? -1 : (a > b ? 1 : 0);
}

function isPast(iso) { return iso && iso < todayISO(); }
function isFutureOrToday(iso) { return iso && iso >= todayISO(); }

// =============================================================
// MAANDBRIEF
// =============================================================
async function loadMaandbriefUrl() {
  try {
    const refS = storageRef(storage, `${speltak}/maandbrief.pdf`);
    maandbriefUrl = await getDownloadURL(refS);
  } catch {
    maandbriefUrl = "";
  }
}

function handleMaandbriefClick() {
  if (!handleidingButton) return;
  // Handled by href + target=_blank
}

// =============================================================
// DATA LADEN
// =============================================================
function loadData() {
  onValue(ref(db, speltak), snap => {
    const data = snap.val() || {};

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
    })).sort((a, b) => a.volgorde - b.volgorde);

    leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({
      id,
      naam: v.naam,
      verborgen: !!v.hidden,
      volgorde: v.volgorde ?? 0
    })).sort((a, b) => a.volgorde - b.volgorde);

    opkomsten = Object.entries(data.opkomsten || {})
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => {
        const aPast = isPast(a.datum);
        const bPast = isPast(b.datum);
        if (aPast === bPast) return compareISO(a.datum, b.datum);
        return aPast ? 1 : -1;
      });

    renderAll();
  });
}

// =============================================================
// UI OP BASIS VAN MODE
// =============================================================
function updateModeUI() {

  // Bewerken-knop
  if (editModeButton) {
    editModeButton.classList.toggle("hidden", isOuder());
    editModeButton.textContent = isBewerken() ? "Klaar" : "Bewerken";
  }

  // Handleiding/mailbox alleen voor leiding
  if (handleidingButton) handleidingButton.classList.toggle("hidden", isOuder());
  if (mailboxButton) mailboxButton.classList.toggle("hidden", isOuder());

  // Instellingen (meldingen) alleen bewerken
  if (instellingenButton) instellingenButton.classList.toggle("hidden", !isBewerken());

  // Ledenbeheer alleen bewerken
  if (ledenbeheerButton) ledenbeheerButton.classList.toggle("hidden", !isBewerken());
  if (addMemberButton) addMemberButton.classList.toggle("hidden", !isBewerken());

  // Nieuwe opkomst rij alleen bewerken
  if (addOpkomstRow) addOpkomstRow.classList.toggle("hidden", !isBewerken());

  // Info editor toggle
  if (isBewerken()) {
    infoDisplay.classList.add("hidden");
    infoEditor.classList.remove("hidden");
    infoToolbar.classList.remove("hidden");
    infoEditor.innerHTML = infoTekst || "";
  } else {
    infoDisplay.classList.remove("hidden");
    infoEditor.classList.add("hidden");
    infoToolbar.classList.add("hidden");
    infoDisplay.innerHTML = infoTekst || "";
  }
}

// =============================================================
// TABEL
// =============================================================
function renderTable() {
  headerRowTop.innerHTML = "";
  tableBody.innerHTML = "";

  const visibleJeugd = jeugd.filter(j => !j.verborgen);
  const visibleLeiding = leiding.filter(l => !l.verborgen);

  const volgende = opkomsten
    .filter(o => isFutureOrToday(o.datum))
    .sort((a, b) => compareISO(a.datum, b.datum))[0]?.id || null;

  let lijst = [...opkomsten];
  if (filterMode === "future") lijst = lijst.filter(o => isFutureOrToday(o.datum));
  if (filterMode === "past") lijst = lijst.filter(o => isPast(o.datum));

  // HEADER
  if (isOuder()) {
    addTH("Datum");
    addTH("Thema");
    addTH("Bijzonderheden");
    addTH("Start");
    addTH("Eind");
    addTH("Bert");
    visibleJeugd.forEach(j => addTHvertical(j.naam));
  } else {
    addTH("🗑");
    addTH("Datum");
    addTH("Procor");
    if (isBewerken()) addTH("Type");
    addTH("Thema");
    addTH("Bijzonderheden");
    addTH("Start");
    addTH("Eind");
    addTH("Locatie","col-locatie");
    addTH("Materiaal");
    addTH("Bert");
    addTH("Aanw. leden");
    addTH("Aanw. leiding");

    visibleJeugd.forEach(j => addTHvertical(j.naam));

    addTH("Kijkers");
    visibleLeiding.forEach(l => addTHvertical(l.naam));
    addTH("Extra");
  }

  // BODY
  lijst.forEach(o => {
    ensureAanwezigheid(o, visibleJeugd, visibleLeiding);
    const tr = document.createElement("tr");

    if (o.id === volgende) tr.classList.add("row-next");
    else if (isPast(o.datum)) tr.classList.add("row-grey");
    if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
    if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
    if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");

    if (isOuder()) {
      addDateCell(tr,o,false);
      addTxt(tr,o,"thema",false);
      addTxt(tr,o,"bijzonderheden",false);
      addTime(tr,o,"starttijd",false);
      addTime(tr,o,"eindtijd",false);
      addTxt(tr,o,"bert_met",false);
      visibleJeugd.forEach(j=> tr.appendChild(presenceCell(o,j.id,true)));
    }
    else {
      // delete
      const del = document.createElement("td");
      if (isBewerken()) {
        del.textContent="✖";
        del.classList.add("delete-btn");
        del.onclick = ()=> {
          if (confirm("Verwijder opkomst?"))
            remove(ref(db,`${speltak}/opkomsten/${o.id}`));
        };
      }
      tr.appendChild(del);

      addDateCell(tr,o,isBewerken());
      addTxt(tr,o,"procor",isBewerken());
      if (isBewerken()) addTypeCell(tr,o,true);
      addTxt(tr,o,"thema",isBewerken());
      addTxt(tr,o,"bijzonderheden",isBewerken());
      addTime(tr,o,"starttijd",isBewerken());
      addTime(tr,o,"eindtijd",isBewerken());
      addTxt(tr,o,"locatie",isBewerken(),"col-locatie");
      addTxt(tr,o,"materiaal",isBewerken());
      addTxt(tr,o,"bert_met",isBewerken());

      const [cJ,cL] = count(o,visibleJeugd,visibleLeiding);
      addStatic(tr,cJ);
      addStatic(tr,cL);

      visibleJeugd.forEach(j=> tr.appendChild(presenceCell(o,j.id,true)));
      addNum(tr,o,"kijkers",isBewerken());

      visibleLeiding.forEach(l=>{
        tr.appendChild(presenceCell(o,"leiding-"+l.id,true));
      });

      addNum(tr,o,"extraLeiding",isBewerken());
    }

    tableBody.appendChild(tr);
  });
}

// ------------------------------------------------------------
// TABLE HELPERS
// ------------------------------------------------------------
function addTH(text,extra) {
  const th=document.createElement("th");
  th.textContent=text;
  if (extra) th.classList.add(extra);
  headerRowTop.appendChild(th);
}
function addTHvertical(text) {
  const th=document.createElement("th");
  th.textContent=text;
  th.classList.add("name-vertical");
  headerRowTop.appendChild(th);
}

function addStatic(tr,val) {
  const td=document.createElement("td");
  td.textContent=val;
  tr.appendChild(td);
}

function addDateCell(tr,o,editable){
  const td=document.createElement("td");
  if (editable){
    const inp=document.createElement("input");
    inp.type="date";
    inp.value=o.datum||"";
    inp.onchange=()=>{
      update(ref(db,`${speltak}/opkomsten/${o.id}`),{datum:inp.value});
    };
    td.appendChild(inp);
  } else td.textContent=toDisplayDate(o.datum);
  tr.appendChild(td);
}

function addTxt(tr,o,field,editable,extraClass){
  const td=document.createElement("td");
  if (extraClass) td.classList.add(extraClass);
  const val=o[field]||"";
  if (!editable){
    td.textContent=val;
  } else {
    const inp=document.createElement("input");
    inp.type="text";
    inp.value=val;
    inp.onchange=()=>{
      const obj={}; obj[field]=inp.value;
      update(ref(db,`${speltak}/opkomsten/${o.id}`),obj);
    };
    td.appendChild(inp);
  }
  tr.appendChild(td);
}

function addTime(tr,o,field,editable){
  const td=document.createElement("td");
  const val=o[field]||"";
  if (editable){
    const inp=document.createElement("input");
    inp.type="time";
    inp.value=val;
    inp.onchange=()=>{
      const obj={}; obj[field]=inp.value;
      update(ref(db,`${speltak}/opkomsten/${o.id}`),obj);
    };
    td.appendChild(inp);
  } else td.textContent=val;

  if (o.starttijd!=="10:30" || o.eindtijd!=="12:30")
    td.classList.add("time-warning");

  tr.appendChild(td);
}

function addNum(tr,o,field,editable){
  const td=document.createElement("td");
  const val=o[field]||0;
  if (editable){
    const inp=document.createElement("input");
    inp.type="number"; inp.min="0"; inp.value=val;
    inp.onchange=()=>{
      const num = parseInt(inp.value)||0;
      const obj={}; obj[field]=num;
      update(ref(db,`${speltak}/opkomsten/${o.id}`),obj);
    };
    td.appendChild(inp);
  } else td.textContent=val;
  tr.appendChild(td);
}

function addTypeCell(tr,o,editable){
  const td=document.createElement("td");
  if (editable){
    const sel=document.createElement("select");
    const opts={
      "":"Selecteer…",
      normaal:"Normale opkomst",
      bijzonder:"Bijzondere opkomst",
      kamp:"Kamp",
      geen:"Geen opkomst"
    };
    Object.entries(opts).forEach(([v,l])=>{
      const opt=document.createElement("option");
      opt.value=v; opt.textContent=l;
      if (o.typeOpkomst===v) opt.selected=true;
      sel.appendChild(opt);
    });
    sel.onchange=()=>{
      update(ref(db,`${speltak}/opkomsten/${o.id}`),{typeOpkomst:sel.value});
    };
    td.appendChild(sel);
  }
  tr.appendChild(td);
}

function ensureAanwezigheid(o,jeugdL,leidingL){
  if (!o.aanwezigheid) o.aanwezigheid={};
  jeugdL.forEach(j=>{
    if (!o.aanwezigheid[j.id]) o.aanwezigheid[j.id]="onbekend";
  });
  leidingL.forEach(l=>{
    const k="leiding-"+l.id;
    if (!o.aanwezigheid[k]) o.aanwezigheid[k]="onbekend";
  });
}

function presenceCell(o,key,clickable){
  const td=document.createElement("td");
  const symbols={aanwezig:"✔",afwezig:"✖",onbekend:"?"};

  const apply=()=>{
    const st=o.aanwezigheid[key]||"onbekend";
    td.textContent=symbols[st];
    td.classList.remove("presence-aanwezig","presence-afwezig","presence-reminder");
    if (st==="aanwezig") td.classList.add("presence-aanwezig");
    if (st==="afwezig") td.classList.add("presence-afwezig");
    if (st==="onbekend") td.classList.add("presence-reminder");
  };
  apply();

  if (clickable){
    td.onclick=()=>{
      const states=["aanwezig","afwezig","onbekend"];
      const cur=o.aanwezigheid[key];
      const next=states[(states.indexOf(cur)+1)%3];
      o.aanwezigheid[key]=next;
      update(ref(db,`${speltak}/opkomsten/${o.id}`),{aanwezigheid:o.aanwezigheid});
      apply();
    };
  }

  return td;
}

function count(o,jeugdL,leidingL){
  let j=0,l=0;
  jeugdL.forEach(x=>{ if (o.aanwezigheid[x.id]==="aanwezig") j++; });
  leidingL.forEach(x=>{ if (o.aanwezigheid["leiding-"+x.id]==="aanwezig") l++; });
  return [j,l];
}

// =============================================================
// LEDENBEHEER
// =============================================================
function renderLedenbeheer(){
  if (!isBewerken()){
    ledenbeheerSection?.classList.add("hidden");
    return;
  }
  ledenbeheerSection?.classList.remove("hidden");

  ledenbeheerJeugdList.innerHTML="";
  ledenbeheerLeidingList.innerHTML="";

  jeugd.forEach((lid,i)=>{
    ledenbeheerJeugdList.appendChild(buildLidItem(lid,"jeugd",i));
  });
  leiding.forEach((lid,i)=>{
    ledenbeheerLeidingList.appendChild(buildLidItem(lid,"leiding",i));
  });
}

function buildLidItem(lid,type,i){
  const li=document.createElement("li");
  if (lid.verborgen) li.classList.add("lid-verborgen");

  const name=document.createElement("span");
  name.textContent=lid.naam;

  const ctr=document.createElement("div");
  ctr.classList.add("ledenbeheer-controls");

  const mkBtn=(t,fn)=>{
    const b=document.createElement("button");
    b.textContent=t; b.classList.add("ledenbeheer-btn");
    b.onclick=fn; return b;
  };

  ctr.appendChild(mkBtn("▲",()=>moveLid(type,i,-1)));
  ctr.appendChild(mkBtn("▼",()=>moveLid(type,i,1)));
  ctr.appendChild(mkBtn("✏",()=>renameLid(type,lid)));
  ctr.appendChild(mkBtn(lid.verborgen?"👁":"🚫",()=>toggleVerborgen(type,lid)));
  ctr.appendChild(mkBtn("🗑",()=>deleteLid(type,lid)));

  li.appendChild(name);
  li.appendChild(ctr);
  return li;
}

function moveLid(type,i,delta){
  const list=type==="jeugd"?[...jeugd]:[...leiding];
  const ni=i+delta;
  if (ni<0||ni>=list.length) return;

  const item=list.splice(i,1)[0];
  list.splice(ni,0,item);

  list.forEach((l,idx)=> l.volgorde=idx);

  const path=type==="jeugd"?"jeugdleden":"leiding";
  const up={};
  list.forEach(l=> up[`${path}/${l.id}/volgorde`]=l.volgorde);

  update(ref(db,speltak),up);
}

function renameLid(type,lid){
  const nieuw=prompt("Nieuwe naam:",lid.naam);
  if (!nieuw) return;
  const p=type==="jeugd"?"jeugdleden":"leiding";
  update(ref(db,`${speltak}/${p}/${lid.id}`),{naam:nieuw});
}

function toggleVerborgen(type,lid){
  const p=type==="jeugd"?"jeugdleden":"leiding";
  update(ref(db,`${speltak}/${p}/${lid.id}`),{hidden:!lid.verborgen});
}

function deleteLid(type,lid){
  if (!confirm("Verwijder lid?")) return;
  const p=type==="jeugd"?"jeugdleden":"leiding";
  remove(ref(db,`${speltak}/${p}/${lid.id}`));
}

// =============================================================
// MELDINGEN OPSLAAN
// =============================================================
function saveMeldingen(){
  if (!isBewerken()) return;
  const obj={
    leidingEnabled:!!meldLeidingEnabledInput.checked,
    leidingThreshold:Number(meldLeidingThresholdInput.value||3),
    onbekendEnabled:!!meldOnbekendEnabledInput.checked,
    onbekendDays:Number(meldOnbekendDaysInput.value||7)
  };
  set(ref(db,`${speltak}/meldingen`),obj);
  alert("Meldingen opgeslagen");
}

function testMeldingen(){
  let problemen=[];
  opkomsten.forEach(o=>{
    if (!o.datum) return;

    if (meldingenInstellingen.leidingEnabled){
      let afw=0;
      leiding.forEach(l=>{
        if (o.aanwezigheid["leiding-"+l.id]==="afwezig") afw++;
      });
      if (afw>=meldingenInstellingen.leidingThreshold)
        problemen.push(`Opkomst ${toDisplayDate(o.datum)}: ${afw} leiding afwezig.`);
    }

    if (meldingenInstellingen.onbekendEnabled){
      let onbek=0;
      jeugd.forEach(j=>{
        if (o.aanwezigheid[j.id]==="onbekend") onbek++;
      });
      leiding.forEach(l=>{
        if (o.aanwezigheid["leiding-"+l.id]==="onbekend") onbek++;
      });
      if (onbek>0) problemen.push(`Opkomst ${toDisplayDate(o.datum)}: ${onbek} personen onbekend.`);
    }
  });

  const subject=`Aanwezigheidsmeldingen ${speltak}`;
  const body=problemen.length?problemen.join("\n"):"Geen meldingen.";
  window.location.href=`mailto:ovnscouting@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// =============================================================
// INFOTEKST EDITOR
// =============================================================
function sanitizeInfo(html){
  // Geen links toegestaan
  return html
    .replace(/<a[^>]*>/gi,"")
    .replace(/<\/a>/gi,"")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"");
}

function saveInfo(){
  const clean = sanitizeInfo(infoEditor.innerHTML);
  update(ref(db,speltak),{infotekst:clean});
}

infoToolbar?.querySelectorAll(".tb-btn").forEach(btn=>{
  btn.onclick=()=>{
    const cmd=btn.dataset.cmd;
    if (cmd==="insertLineBreak") {
      document.execCommand("insertHTML", false, "<br>");
    } else {
      document.execCommand(cmd,false,null);
    }
  };
});

// =============================================================
// POPUP NIEUWE OPKOMST
// =============================================================
function openPopup(){
  popupOverlay.classList.remove("hidden");
}

function closePopup(){
  popupOverlay.classList.add("hidden");
}

function savePopup(){
  const nieuw={
    datum: document.getElementById("new_date").value || "",
    thema: document.getElementById("new_thema").value || "",
    bijzonderheden: document.getElementById("new_bijzonder").value || "",
    procor: document.getElementById("new_procor").value || "",
    locatie: document.getElementById("new_locatie").value || "",
    materiaal: document.getElementById("new_materiaal").value || "",
    starttijd: document.getElementById("new_start").value || "10:30",
    eindtijd: document.getElementById("new_eind").value || "12:30",
    typeOpkomst: document.getElementById("new_type").value || "",
    kijkers: 0,
    extraLeiding: 0,
    bert_met: "",
    aanwezigheid:{}
  };

  const refN = push(ref(db,`${speltak}/opkomsten`));
  set(refN, nieuw);
  closePopup();
}

// =============================================================
// EVENTS
// =============================================================

if (editModeButton){
  editModeButton.onclick=()=> isBewerken()? exitBewerkmodus(): enterBewerkmodus();
}

if (filterAll) filterAll.onclick=()=>{filterMode="all"; renderAll();}
if (filterFuture) filterFuture.onclick=()=>{filterMode="future"; renderAll();}
if (filterPast) filterPast.onclick=()=>{filterMode="past"; renderAll();}
if (printButton) printButton.onclick=()=> window.print();

if (ledenbeheerButton) ledenbeheerButton.onclick=()=> {
  ledenbeheerSection.classList.toggle("hidden");
};

if (instellingenButton) instellingenButton.onclick=()=> {
  meldingenSection.classList.toggle("hidden");
};

if (saveMeldingenButton) saveMeldingenButton.onclick=saveMeldingen;
if (testMeldingenButton) testMeldingenButton.onclick=testMeldingen;

if (addMemberButton) addMemberButton.onclick=()=>{
  const type = prompt("Type lid (jeugd/leiding)").trim().toLowerCase();
  if (!["jeugd","leiding"].includes(type)) return;
  const naam = prompt("Naam:");
  if (!naam) return;
  const volgorde = type==="jeugd"? jeugd.length: leiding.length;
  const path = type==="jeugd"? "jeugdleden":"leiding";
  set(push(ref(db,`${speltak}/${path}`)),{naam, hidden:false, volgorde});
};

if (addOpkomstRow) addOpkomstRow.onclick=openPopup;
popupCancel.onclick=closePopup;
popupSave.onclick=savePopup;

if (saveInfoButton) saveInfoButton.onclick=saveInfo;

// =============================================================
// INIT
// =============================================================
loadData();
loadMaandbriefUrl();
updateModeUI();
