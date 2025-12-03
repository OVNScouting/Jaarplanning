// ======================================================================
// script.js — Universeel voor alle speltakken (OVN)
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
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ======================================================================
// FIREBASE INIT
// ======================================================================
const app = initializeApp(window.firebaseConfig);
const db = getDatabase(app);

// Bepaal speltaknaam uit bestandsnaam
const speltak = window.location.pathname.split("/").pop().replace(".html", "");

// Speltak-config (met defaults)
const config = window.speltakConfig || {
  showBert: false,
  showLeiding: true
};

// ======================================================================
// DOM ELEMENTEN
// ======================================================================
const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");

const headerRowTop = document.getElementById("headerRowTop");
const tableBody = document.getElementById("tableBody");
const addOpkomstRow = document.getElementById("addOpkomstRow");

const editModeButton = document.getElementById("editModeButton");
const printButton = document.getElementById("printButton");
const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");

const handleidingButton = document.getElementById("handleidingButton");

const ledenbeheerSection = document.getElementById("ledenbeheerSection");
const ledenbeheerJeugd = document.getElementById("ledenbeheerJeugd");
const ledenbeheerLeiding = document.getElementById("ledenbeheerLeiding");
const addMemberButton = document.getElementById("addMemberButton");

const meldingenSection = document.getElementById("meldingenSection");
const meldingLeidingAan = document.getElementById("meldingLeidingAan");
const leidingDrempel = document.getElementById("leidingDrempel");
const meldingOnbekendAan = document.getElementById("meldingOnbekendAan");

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

const toolbarButtons = document.querySelectorAll("#infoEditorToolbar button");
const colorPicker = document.getElementById("colorPicker");

// ======================================================================
// STATE
// ======================================================================
let data = {};
let opkomsten = [];
let jeugd = [];
let leiding = [];

let currentFilter = "all";
let mode = localStorage.getItem("mode") || "ouder";

// ======================================================================
// MODES
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

  editModeButton.textContent = newMode === "bewerken" ? "Opslaan" : "Bewerken";
  if (handleidingButton) handleidingButton.classList.toggle("hidden", !isLeiding());
  addOpkomstRow.classList.toggle("hidden", !isBewerken());
  addMemberButton.classList.toggle("hidden", !isBewerken());
  infoEditorWrapper.classList.toggle("hidden", !isBewerken());

  renderEverything();
}

// ======================================================================
// DATA LADEN
// ======================================================================
async function loadEverything() {
  const snap = await get(ref(db, speltak));
  data = snap.val() || {};

  opkomsten = Object.entries(data.opkomsten || {}).map(([id, v]) => ({ id, ...v }));
  jeugd = Object.entries(data.jeugdleden || {}).map(([id, v]) => ({ id, ...v }));
  leiding = Object.entries(data.leiding || {}).map(([id, v]) => ({ id, ...v }));

  opkomsten.sort(compareDateTime);
  renderEverything();
}

// ======================================================================
// RENDER EVERYTHING
// ======================================================================
function renderEverything() {
  renderInfo();
  applyFilter();
  renderLedenbeheer();
  renderTable();
  updateMeldingenUI();
}

// ======================================================================
// INFO BLOK
// ======================================================================
function renderInfo() {
  const txt = data.infotekst || "";
  infoTekst.innerHTML = txt;
  if (isBewerken()) infoEdit.innerHTML = txt;
}
function saveInfo() {
  const txt = sanitizeText(infoEdit.innerHTML);
  update(ref(db, `${speltak}`), { infotekst: txt });
}

// ======================================================================
// FILTERS
// ======================================================================
function applyFilter() {
  filterAll.classList.toggle("active", currentFilter === "all");
  filterFuture.classList.toggle("active", currentFilter === "future");
  filterPast.classList.toggle("active", currentFilter === "past");
}

// ======================================================================
// LEDENBEHEER
// ======================================================================
function renderLedenbeheer() {
  ledenbeheerSection.classList.toggle("hidden", !isLeiding());
  if (!isLeiding()) return;

  ledenbeheerJeugd.innerHTML = "";
  ledenbeheerLeiding.innerHTML = "";

  jeugd.sort((a,b)=>a.volgorde-b.volgorde)
    .forEach(j => ledenbeheerJeugd.appendChild(makeMemberRow(j,"jeugd")));

  if (config.showLeiding)
    leiding.sort((a,b)=>a.volgorde-b.volgorde)
      .forEach(l => ledenbeheerLeiding.appendChild(makeMemberRow(l,"leiding")));
}

function makeMemberRow(obj,type){
  const li=document.createElement("li");
  li.classList.toggle("lid-verborgen",obj.hidden);
  li.innerHTML=`
    <span>${obj.naam}</span>
    <div class="ledenbeheer-controls">
      <button class="ledenbeheer-btn" data-act="up">↑</button>
      <button class="ledenbeheer-btn" data-act="down">↓</button>
      <button class="ledenbeheer-btn" data-act="toggle">${obj.hidden?"👁️":"🙈"}</button>
      <button class="ledenbeheer-btn" data-act="del">🗑️</button>
    </div>`;
  li.querySelectorAll(".ledenbeheer-btn").forEach(btn=>{
    btn.addEventListener("click",()=>handleMemberAction(obj,type,btn.dataset.act));
  });
  return li;
}

function handleMemberAction(obj,type,action){
  const path=type==="jeugd"?"jeugdleden":"leiding";
  const r=ref(db,`${speltak}/${path}/${obj.id}`);
  if(action==="up")obj.volgorde=Math.max(0,obj.volgorde-1);
  if(action==="down")obj.volgorde+=1;
  if(action==="toggle")obj.hidden=!obj.hidden;
  if(action==="del"&&confirm(`Verwijder ${obj.naam}?`)){
    update(r,null);loadEverything();return;
  }
  update(r,obj);loadEverything();
}

// ======================================================================
// TABEL
// ======================================================================
function renderTable(){
  headerRowTop.innerHTML="";
  tableBody.innerHTML="";

  const jRender=jeugd;
  const lRender=config.showLeiding?leiding:[];
  const showBert=config.showBert;

  const filtered=opkomsten.filter(o=>{
    if(currentFilter==="future")return isFutureOrToday(o.datum);
    if(currentFilter==="past")return isPast(o.datum);
    return true;
  });

  addVerticalHeaders(jRender,lRender,showBert);

  filtered.forEach(o=>addRow(o,jRender,lRender,showBert));
}

// Headers
function addVerticalHeaders(jRender,lRender,showBert){
  const first=document.createElement("th");
  headerRowTop.appendChild(first);

  jRender.forEach(j=>{
    const th=document.createElement("th");
    th.className=j.hidden?"hidden":"";
    th.innerHTML=`<div class="name-vertical">${j.naam}</div>`;
    headerRowTop.appendChild(th);
  });

  if(showBert){
    const bert=document.createElement("th");
    bert.textContent="Bert";
    headerRowTop.appendChild(bert);
  }

  if(config.showLeiding){
    const split=document.createElement("th");
    split.className="col-split";
    headerRowTop.appendChild(split);

    lRender.forEach(l=>{
      const th=document.createElement("th");
      th.className=l.hidden?"hidden":"";
      th.innerHTML=`<div class="name-vertical">${l.naam}</div>`;
      headerRowTop.appendChild(th);
    });
  }

  const count=document.createElement("th");
  count.textContent="Telling";
  headerRowTop.appendChild(count);
}

// Row render
function addRow(o,jRender,lRender,showBert){
  const tr=document.createElement("tr");
  if(o.typeOpkomst==="geen")tr.classList.add("row-geenopkomst");
  if(o.typeOpkomst==="bijzonder")tr.classList.add("row-bijzonder");
  if(o.typeOpkomst==="kamp")tr.classList.add("row-kamp");
  if(isPast(o.datum))tr.classList.add("row-grey");
  if(o.datum===todayISO())tr.classList.add("row-next");

  const del=document.createElement("td");
  if(isBewerken()){
    del.textContent="🗑️";
    del.style.cursor="pointer";
    del.onclick=()=>{
      if(confirm("Opkomst verwijderen?")){
        update(ref(db,`${speltak}/opkomsten/${o.id}`),null);
        loadEverything();
      }
    };
  }
  tr.appendChild(del);

  tr.appendChild(makeEditableCell(o,"datum","date"));
  tr.appendChild(makeTimeCell(o,"starttijd"));
  tr.appendChild(makeTimeCell(o,"eindtijd"));
  tr.appendChild(makeEditableCell(o,"thema","text"));

  if(showBert)
    tr.appendChild(makeEditableCell(o,"bert_met","text"));

  const loc=makeEditableCell(o,"locatie","text");
  loc.classList.add("col-locatie");
  tr.appendChild(loc);

  if(config.showLeiding){
    const split=document.createElement("td");
    split.className="col-split";
    tr.appendChild(split);

    jRender.forEach(j=>tr.appendChild(makePresenceCell(o,j.id,j.hidden)));
    lRender.forEach(l=>tr.appendChild(makePresenceCell(o,"leiding-"+l.id,l.hidden)));
  }else{
    jRender.forEach(j=>tr.appendChild(makePresenceCell(o,j.id,j.hidden)));
  }

  const [cj,cl]=countPresence(o);
  const td=document.createElement("td");
  td.className="aanw-count";
  td.textContent=config.showLeiding?`${cj} / ${cl}`:`${cj}`;
  tr.appendChild(td);

  tableBody.appendChild(tr);
}

// Presence cells
function makePresenceCell(o,key,hidden){
  const td=document.createElement("td");
  if(hidden)td.classList.add("hidden");
  const cur=o.aanwezigheid?.[key]||"onbekend";
  const map={aanwezig:"✔",afwezig:"✖",onbekend:"?"};
  td.textContent=map[cur];
  if(isBewerken()){
    td.style.cursor="pointer";
    td.onclick=()=>{
      const next=cur==="aanwezig"?"afwezig":cur==="afwezig"?"onbekend":"aanwezig";
      update(ref(db,`${speltak}/opkomsten/${o.id}/aanwezigheid/${key}`),next);
      loadEverything();
    };
  }
  return td;
}

// Count presence
function countPresence(o){
  let j=0,l=0;
  jeugd.forEach(x=>{
    if(!x.hidden&&o.aanwezigheid?.[x.id]==="aanwezig")j++;
  });
  if(config.showLeiding){
    leiding.forEach(x=>{
      const k="leiding-"+x.id;
      if(!x.hidden&&o.aanwezigheid?.[k]==="aanwezig")l++;
    });
  }
  return [j,l];
}

// Editable cell
function makeEditableCell(o,f,t){
  const td=document.createElement("td");
  td.textContent=o[f]||"";
  if(isBewerken()){
    td.contentEditable=t==="text";
    if(t==="date"){
      td.onclick=()=>{
        const v=prompt("Nieuwe datum (YYYY-MM-DD):",o[f]);
        if(v){update(ref(db,`${speltak}/opkomsten/${o.id}`),{[f]:v});loadEverything();}
      };
    }else{
      td.onblur=()=>{
        const v=td.textContent.trim();
        update(ref(db,`${speltak}/opkomsten/${o.id}`),{[f]:v});
      };
    }
  }
  return td;
}

// Time cell
function makeTimeCell(o,f){
  const td=document.createElement("td");
  td.textContent=o[f]||"";
  if(o.starttijd!=="10:30"||o.eindtijd!=="12:30")td.classList.add("tijd-afwijkend");
  if(isBewerken()){
    td.onclick=()=>{
      const v=prompt(`Nieuwe tijd voor ${f}`,o[f]);
      if(v){update(ref(db,`${speltak}/opkomsten/${o.id}`),{[f]:v});loadEverything();}
    };
  }
  return td;
}

// ======================================================================
// MODALS
// ======================================================================
addMemberButton.onclick=()=>{memberName.value="";memberType.value="jeugd";memberModal.classList.remove("hidden");};
cancelMember.onclick=()=>memberModal.classList.add("hidden");
saveMember.onclick=()=>{
  const naam=memberName.value.trim();
  if(!naam)return alert("Naam verplicht.");
  const type=memberType.value;
  const path=type==="jeugd"?"jeugdleden":"leiding";
  const r=push(ref(db,`${speltak}/${path}`));
  set(r,{naam,hidden:false,volgorde:999});
  memberModal.classList.add("hidden");
  loadEverything();
};

addOpkomstRow.onclick=()=>{
  opDatum.value="";opStart.value="10:30";opEind.value="12:30";opThema.value="";opLocatie.value="";opType.value="";
  opModal.classList.remove("hidden");
};
cancelOpkomst.onclick=()=>opModal.classList.add("hidden");
saveOpkomst.onclick=()=>{
  const datum=opDatum.value;if(!datum)return alert("Datum verplicht.");
  const r=push(ref(db,`${speltak}/opkomsten`));
  const n={id:r.key,datum,thema:opThema.value,typeOpkomst:opType.value,
           starttijd:opStart.value,eindtijd:opEind.value,locatie:opLocatie.value,aanwezigheid:{}};
  jeugd.forEach(j=>n.aanwezigheid[j.id]="onbekend");
  if(config.showLeiding)
    leiding.forEach(l=>n.aanwezigheid["leiding-"+l.id]="onbekend");
  set(r,n);opModal.classList.add("hidden");loadEverything();
};

// ======================================================================
// MELDINGEN
// ======================================================================
function updateMeldingenUI(){
  meldingenSection.classList.toggle("hidden",!isLeiding());
  if(!isLeiding())return;
  meldingLeidingAan.checked=data.meldingLeidingAan||false;
  leidingDrempel.value=data.leidingDrempel||2;
  meldingOnbekendAan.checked=data.meldingOnbekendAan||false;
}
meldingLeidingAan?.addEventListener("change",()=>update(ref(db,`${speltak}`),{meldingLeidingAan:meldingLeidingAan.checked}));
leidingDrempel?.addEventListener("change",()=>update(ref(db,`${speltak}`),{leidingDrempel:Number(leidingDrempel.value)}));
meldingOnbekendAan?.addEventListener("change",()=>update(ref(db,`${speltak}`),{meldingOnbekendAan:meldingOnbekendAan.checked}));

// ======================================================================
// FILTER EVENTS
// ======================================================================
filterAll.onclick=()=>{currentFilter="all";renderEverything();};
filterFuture.onclick=()=>{currentFilter="future";renderEverything();};
filterPast.onclick=()=>{currentFilter="past";renderEverything();};

// ======================================================================
printButton.onclick=()=>window.print();
editModeButton.onclick=()=>{
  if(mode==="leiding")setMode("bewerken");
  else if(mode==="bewerken"){saveInfo();setMode("leiding");}
};

// ======================================================================
// WYSIWYG
// ======================================================================
toolbarButtons.forEach(btn=>{
  btn.onclick=()=>{document.execCommand(btn.dataset.cmd);infoEdit.focus();};
});
colorPicker.onchange=()=>{document.execCommand("foreColor",false,colorPicker.value);infoEdit.focus();};

// ======================================================================
loadEverything();
