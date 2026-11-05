// ======================================================================
// bug.js — Meldingencentrum (alleen admins)
// Open / Afgerond, types, zoeken, status + prioriteit + reactie aan melder.
// ======================================================================

import {
  initializeApp,
  getApps,
  getApp,
  getAuth,
  onAuthStateChanged,
  getDatabase,
  ref,
  get,
  onValue,
  update,
  remove
} from "./firebase-imports.js";

import { escapeHtml, linkifyText } from "./utils.js";

const app = getApps().length ? getApp() : initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const SITE_URL = "https://ovnjaarplanning.nl";

const TYPES = {
  bug: { label: "Bug", icon: "🐞" },
  wens: { label: "Wens", icon: "💡" },
  vraag: { label: "Vraag", icon: "❓" }
};

const STATUSES = ["Nieuw", "In behandeling", "Opgelost", "Niet van toepassing"];
const OPEN_STATUSES = new Set(["Nieuw", "In behandeling"]);
const PRIORITIES = { hoog: "Hoog", normaal: "Normaal", laag: "Laag" };

const state = {
  bugs: [],
  tab: "open",
  type: "alle",
  search: "",
  expandedId: null,
  // Onopgeslagen invoer per melding: blijft bewaard als de lijst
  // opnieuw opbouwt (bijv. omdat er een nieuwe melding binnenkomt).
  drafts: {}
};

const listEl = document.getElementById("meldingenList");

// ----------------------------------------------------------------------
// Toegang: alleen admins (via de rol, niet via een vast e-mailadres)
// ----------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  const loading = document.getElementById("meldingenLoading");
  const denied = document.getElementById("accessDeniedCard");
  const section = document.getElementById("adminBugSection");

  let isAdmin = false;
  if (user) {
    try {
      const snap = await get(ref(db, `users/${user.uid}`));
      const profile = snap.val() || {};
      isAdmin = profile.roles?.admin === true && profile.status !== "inactive";
    } catch (error) {
      console.warn("Kon rol niet lezen:", error);
    }
  }

  loading?.classList.add("hidden");

  if (!isAdmin) {
    denied?.classList.remove("hidden");
    section?.classList.add("hidden");
    return;
  }

  denied?.classList.add("hidden");
  section?.classList.remove("hidden");
  subscribe();
});

let unsubscribe = null;
function subscribe() {
  if (unsubscribe) return;
  unsubscribe = onValue(
    ref(db, "bugs"),
    (snapshot) => {
      const data = snapshot.val() || {};
      state.bugs = Object.entries(data).map(([id, bug]) => ({
        id,
        ...bug,
        type: TYPES[bug.type] ? bug.type : "bug",
        status: STATUSES.includes(bug.status) ? bug.status : "Nieuw"
      }));
      render();
    },
    (error) => {
      console.error("Meldingen laden mislukt:", error);
      listEl.innerHTML = `<p class="meldingen-empty">Meldingen konden niet worden geladen.</p>`;
    }
  );
}

// ----------------------------------------------------------------------
// Filters
// ----------------------------------------------------------------------
document.querySelectorAll(".meldingen-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.tab = btn.dataset.tab;
    state.expandedId = null;
    document.querySelectorAll(".meldingen-tab").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", String(active));
    });
    render();
  });
});

document.querySelectorAll(".meldingen-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.type = btn.dataset.type;
    document.querySelectorAll(".meldingen-chip").forEach((b) =>
      b.classList.toggle("is-active", b === btn)
    );
    render();
  });
});

document.getElementById("meldingenSearch")?.addEventListener("input", (e) => {
  state.search = e.target.value.trim().toLowerCase();
  render();
});

// ----------------------------------------------------------------------
// Weergave
// ----------------------------------------------------------------------
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function pageName(url = "") {
  const m = String(url).match(/([a-z0-9-]+)\.html/i);
  const name = m ? m[1] : "index";
  const labels = { index: "Home", bug: "Meldingen", profile: "Profiel", bestuur: "Bestuursagenda" };
  return labels[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

function statusClass(status) {
  return {
    "Nieuw": "is-new",
    "In behandeling": "is-busy",
    "Opgelost": "is-done",
    "Niet van toepassing": "is-skip"
  }[status] || "is-new";
}

function sortBugs(a, b) {
  const prio = { hoog: 0, normaal: 1, laag: 2 };
  if (state.tab === "open") {
    // Nieuw boven In behandeling, dan prioriteit, dan nieuwste eerst.
    if (a.status !== b.status) return a.status === "Nieuw" ? -1 : 1;
    const pa = prio[a.prioriteit] ?? 1;
    const pb = prio[b.prioriteit] ?? 1;
    if (pa !== pb) return pa - pb;
  }
  return String(b.bijgewerkt || b.datum || "").localeCompare(String(a.bijgewerkt || a.datum || ""));
}

function render() {
  const open = state.bugs.filter((b) => OPEN_STATUSES.has(b.status));
  const done = state.bugs.filter((b) => !OPEN_STATUSES.has(b.status));
  document.getElementById("countOpen").textContent = open.length;
  document.getElementById("countDone").textContent = done.length;

  const pool = state.tab === "open" ? open : done;
  const items = pool
    .filter((b) => state.type === "alle" || b.type === state.type)
    .filter((b) => {
      if (!state.search) return true;
      return [b.titel, b.beschrijving, b.melder, b.reactie]
        .some((v) => String(v || "").toLowerCase().includes(state.search));
    })
    .sort(sortBugs);

  if (!items.length) {
    const msg = state.tab === "open" && !state.search && state.type === "alle"
      ? "Geen open meldingen. Alles is afgehandeld 🎉"
      : "Geen meldingen gevonden met deze filters.";
    listEl.innerHTML = `<p class="meldingen-empty">${escapeHtml(msg)}</p>`;
    return;
  }

  listEl.innerHTML = "";
  items.forEach((bug) => listEl.appendChild(renderCard(bug)));
}

function renderCard(bug) {
  const type = TYPES[bug.type];
  const expanded = state.expandedId === bug.id;
  const ctx = bug.context || {};

  const card = document.createElement("article");
  card.className = `melding-card ${expanded ? "is-expanded" : ""}`;
  card.dataset.id = bug.id;

  const prioBadge = bug.prioriteit && bug.prioriteit !== "normaal"
    ? `<span class="melding-badge prio-${escapeHtml(bug.prioriteit)}">${escapeHtml(PRIORITIES[bug.prioriteit] || bug.prioriteit)}</span>`
    : "";

  const meta = [
    escapeHtml(bug.melder || "Onbekend"),
    escapeHtml(formatDate(bug.datum)),
    escapeHtml(pageName(bug.pagina)),
    ctx.apparaat ? escapeHtml(`${ctx.apparaat}${ctx.scherm ? ` · ${ctx.scherm}` : ""}`) : null
  ].filter(Boolean).join(" · ");

  card.innerHTML = `
    <button type="button" class="melding-summary" aria-expanded="${expanded}">
      <span class="melding-type-icon" title="${escapeHtml(type.label)}" aria-hidden="true">${type.icon}</span>
      <span class="melding-main">
        <span class="melding-title-row">
          <strong class="melding-card-title">${escapeHtml(bug.titel || "(zonder titel)")}</strong>
          ${prioBadge}
          <span class="melding-badge status ${statusClass(bug.status)}">${escapeHtml(bug.status)}</span>
        </span>
        <span class="melding-meta">${escapeHtml(type.label)} · ${meta}</span>
        ${expanded ? "" : `<span class="melding-preview">${escapeHtml(String(bug.beschrijving || "").slice(0, 160))}</span>`}
      </span>
    </button>
  `;

  card.querySelector(".melding-summary").addEventListener("click", () => {
    state.expandedId = expanded ? null : bug.id;
    render();
    if (!expanded) {
      document.querySelector(`.melding-card[data-id="${CSS.escape(bug.id)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });

  if (expanded) card.appendChild(renderDetail(bug));
  return card;
}

function renderDetail(bug) {
  const ctx = bug.context || {};
  const draft = state.drafts[bug.id] || {};
  const value = (field, fallback) => (field in draft ? draft[field] : fallback);
  const detail = document.createElement("div");
  detail.className = "melding-detail";

  const contextRows = [
    ["Pagina", bug.pagina ? `<a href="${/^https?:\/\//i.test(bug.pagina) ? escapeHtml(bug.pagina) : "#"}" target="_blank" rel="noopener noreferrer">${escapeHtml(pageName(bug.pagina))} ↗</a>` : "—"],
    ["Apparaat", escapeHtml([ctx.apparaat, ctx.scherm].filter(Boolean).join(", ") || "—")],
    ["Browser", escapeHtml([ctx.browser, ctx.systeem].filter(Boolean).join(" op ") || "—")],
    ["Rol", escapeHtml(ctx.rol || "—")],
    ["Bijgewerkt", escapeHtml(formatDate(bug.bijgewerkt || bug.datum))]
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  detail.innerHTML = `
    <div class="melding-description">${linkifyText(bug.beschrijving || "—").replace(/\n/g, "<br>")}</div>
    <dl class="melding-context">${contextRows}</dl>

    <div class="melding-ai">
      <button type="button" class="pill-btn outline melding-ai-btn">🤖 Prompt voor Claude</button>
      <span class="text-muted">Zet deze melding om in een kant-en-klare opdracht om in Claude te plakken.</span>
    </div>

    <form class="melding-edit">
      <div class="melding-edit-row">
        <label>Status
          <select name="status">
            ${STATUSES.map((s) => `<option value="${s}" ${s === value("status", bug.status) ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
        <label>Type
          <select name="type">
            ${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === value("type", bug.type) ? "selected" : ""}>${t.label}</option>`).join("")}
          </select>
        </label>
        <label>Prioriteit
          <select name="prioriteit">
            ${Object.entries(PRIORITIES).map(([k, l]) => `<option value="${k}" ${k === value("prioriteit", bug.prioriteit || "normaal") ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </label>
      </div>

      <label class="melding-reply-label">
        Reactie aan de melder
        <span class="text-muted">Zichtbaar voor ${escapeHtml(bug.melder || "de melder")} in Mijn profiel.</span>
        <textarea name="reactie" rows="3" maxlength="2000" placeholder="Bijv. Opgelost in de nieuwe versie, of: Doen we niet, omdat…">${escapeHtml(value("reactie", bug.reactie || ""))}</textarea>
      </label>

      <div class="melding-quick" aria-label="Snelle reacties">
        <button type="button" class="melding-quick-btn" data-status="Opgelost" data-text="Opgelost, bedankt voor je melding!">✓ Opgelost</button>
        <button type="button" class="melding-quick-btn" data-status="In behandeling" data-text="Dank je! We gaan ermee aan de slag.">Mee bezig</button>
        <button type="button" class="melding-quick-btn" data-status="Niet van toepassing" data-text="Dank je voor het meedenken! We hebben besloten dit niet te doen.">Niet doen</button>
      </div>

      <div class="melding-actions">
        <button type="button" class="pill-btn danger-outline melding-delete">Verwijderen</button>
        <span class="melding-actions-right">
          <button type="button" class="pill-btn outline melding-cancel">Sluiten</button>
          <button type="submit" class="pill-btn primary melding-save">Opslaan</button>
        </span>
      </div>
    </form>
  `;

  const form = detail.querySelector("form");

  const rememberDraft = () => {
    state.drafts[bug.id] = {
      status: form.status.value,
      type: form.type.value,
      prioriteit: form.prioriteit.value,
      reactie: form.reactie.value
    };
  };
  form.addEventListener("input", rememberDraft);
  form.addEventListener("change", rememberDraft);

  detail.querySelectorAll(".melding-quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      form.status.value = btn.dataset.status;
      if (!form.reactie.value.trim()) form.reactie.value = btn.dataset.text;
      rememberDraft();
      form.reactie.focus();
    });
  });

  detail.querySelector(".melding-ai-btn").addEventListener("click", () => {
    openPromptModal(bug);
  });

  detail.querySelector(".melding-cancel").addEventListener("click", () => {
    delete state.drafts[bug.id];
    state.expandedId = null;
    render();
  });

  detail.querySelector(".melding-delete").addEventListener("click", async () => {
    const ok = confirmDialog(
      `Melding "${bug.titel || "(zonder titel)"}" definitief verwijderen? ` +
      `Tip: zet hem liever op "Niet van toepassing", dan blijft hij terug te vinden.`
    );
    if (!ok) return;
    try {
      await remove(ref(db, `bugs/${bug.id}`));
      delete state.drafts[bug.id];
      state.expandedId = null;
      render();
      showToast("Melding verwijderd", "success");
    } catch (error) {
      console.error(error);
      showToast("Verwijderen mislukt", "error");
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = form.querySelector(".melding-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Opslaan…";

    const reactie = form.reactie.value.trim().slice(0, 2000);
    const updates = {
      status: form.status.value,
      type: form.type.value,
      prioriteit: form.prioriteit.value,
      bijgewerkt: new Date().toISOString(),
      reactie: reactie || null
    };

    try {
      await update(ref(db, `bugs/${bug.id}`), updates);
      delete state.drafts[bug.id];
      showToast(
        OPEN_STATUSES.has(updates.status) ? "Opgeslagen" : "Opgeslagen en naar Afgerond verplaatst",
        "success"
      );
      state.expandedId = OPEN_STATUSES.has(updates.status) === (state.tab === "open") ? bug.id : null;
      render();
    } catch (error) {
      console.error(error);
      showToast("Opslaan mislukt", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Opslaan";
    }
  });

  return detail;
}

// ----------------------------------------------------------------------
// Prompt voor Claude
// Zet een melding om in een complete, zelfstandige opdracht. Bevat
// bewust GEEN naam of e-mailadres van de melder.
// ----------------------------------------------------------------------
const REPO = "OVNScouting/Jaarplanning";
const SPELTAK_PAGES = ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"];

function pageSlug(url = "") {
  const m = String(url).match(/([a-z0-9-]+)\.html/i);
  return m ? m[1].toLowerCase() : "index";
}

function likelyFiles(bug) {
  const slug = pageSlug(bug.pagina);
  const files = new Set();

  if (SPELTAK_PAGES.includes(slug)) {
    ["script.js", "utils.js", `${slug}.html`, "style.css"].forEach((f) => files.add(f));
  } else {
    const map = {
      index: ["index.html", "index-bestuur.js", "login.js"],
      admin: ["admin.html", "admin.js", "functions/index.js"],
      bug: ["bug.html", "bug.js"],
      profile: ["profile.html", "profile.js"],
      dashboard: ["dashboard.html", "dashboard.js", "functions/index.js"],
      bestuur: ["bestuur.html", "bestuur.js"]
    };
    (map[slug] || ["index.html"]).forEach((f) => files.add(f));
    files.add("style.css");
  }

  const apparaat = String(bug.context?.apparaat || "");
  if (/Telefoon|Tablet/i.test(apparaat)) {
    files.add("mobile.css");
    files.add("mobile.js");
  }

  const text = `${bug.titel || ""} ${bug.beschrijving || ""}`.toLowerCase();
  // Trefwoorden wegen zwaarder dan de pagina: oudere meldingen werden
  // vaak vanaf de startpagina verstuurd, ook als het om een speltak ging.
  if (/opkomst|kamp|jaarplanning|planning|aanwezig|ploeg|nest|leden|lid |kolom|tabel|verleden|seizoen/.test(text)) {
    ["script.js", "utils.js", "style.css"].forEach((f) => files.add(f));
  }
  if (/dashboard/.test(text)) files.add("dashboard.js");
  if (/bestuur|agenda/.test(text)) files.add("bestuur.js");
  if (/telefoon|mobiel|scherm|zoom|swipe/.test(text)) {
    files.add("mobile.css");
    files.add("mobile.js");
  }
  if (/inlog|wachtwoord|account|login/.test(text)) files.add("login.js");
  if (/melding|probleem melden/.test(text)) files.add("utils.js");
  if (/rechten|toegang|permission|geweigerd/.test(text)) files.add("database.rules.json");

  return [...files];
}

function buildClaudePrompt(bug) {
  const type = TYPES[bug.type] || TYPES.bug;
  const ctx = bug.context || {};
  const slug = pageSlug(bug.pagina);
  const datum = bug.datum ? formatDate(bug.datum) : "onbekend";

  const aanpak = {
    bug: [
      "0. Controleer eerst of dit op main al is opgelost (recente commits en pull requests). Zo ja: zeg waar en hoe, en stop daar.",
      "1. Lees de genoemde bestanden en zoek de oorzaak. Reproduceer het probleem waar mogelijk (let op apparaat en schermbreedte).",
      "2. Leg kort uit wat de oorzaak is voordat je iets verandert.",
      "3. Los het op met een zo klein mogelijke wijziging die bestaande functionaliteit en stijl intact laat.",
      "4. Test op desktop én telefoonbreedte, in licht en donker thema."
    ],
    wens: [
      "0. Controleer eerst of dit al (deels) bestaat op main. Zo ja: zeg waar, en stop daar.",
      "1. Bekijk hoe het huidige gedrag werkt in de genoemde bestanden.",
      "2. Doe eerst een kort voorstel (wat, waar, gevolgen voor ouders/leiding/admin) en wacht op mijn akkoord voordat je bouwt.",
      "3. Houd het simpel voor vrijwilligers en ouders; geen nieuwe frameworks of build-stap.",
      "4. Test op desktop én telefoonbreedte, in licht en donker thema."
    ],
    vraag: [
      "1. Zoek in de code uit hoe het nu werkt.",
      "2. Beantwoord de vraag in gewone taal, zodat ik die aan de melder kan doorgeven.",
      "3. Stel alleen een wijziging voor als het antwoord laat zien dat er iets mis is."
    ]
  }[bug.type] || [];

  return [
    `Je werkt aan de OVN Jaarplanning, de jaarplanning-website van Scouting Olivier van Noort (${SITE_URL}).`,
    `Code: GitHub-repo ${REPO} (branch main). Statische HTML/CSS/JS op GitHub Pages, Firebase Realtime Database (rules in database.rules.json), Firebase Auth en Cloud Functions (functions/index.js, Node 22). Rollen: ouders (niet ingelogd, alleen bekijken + aanwezigheid), leiding per speltak, bestuur, admin.`,
    ``,
    `## Melding (${type.label})`,
    `Titel: ${bug.titel || "(zonder titel)"}`,
    `Gemeld op: ${datum}`,
    `Status: ${bug.status || "Nieuw"}${bug.prioriteit && bug.prioriteit !== "normaal" ? ` · prioriteit ${bug.prioriteit}` : ""}`,
    ``,
    `Omschrijving van de melder:`,
    `"""`,
    String(bug.beschrijving || "(geen omschrijving)").trim(),
    `"""`,
    ``,
    `## Technische context`,
    `- Pagina waar gemeld: ${slug}.html${bug.context ? "" : " (oudere melding: dit is waar de knop werd ingedrukt, niet per se waar het probleem zit)"}`,
    ctx.apparaat ? `- Apparaat: ${[ctx.apparaat, ctx.scherm].filter(Boolean).join(", ")}` : null,
    ctx.browser ? `- Browser: ${[ctx.browser, ctx.systeem].filter(Boolean).join(" op ")}` : null,
    ctx.rol ? `- Rol van de melder: ${ctx.rol}` : null,
    `- Waarschijnlijk betrokken bestanden: ${likelyFiles(bug).join(", ")}`,
    bug.reactie ? `- Eerdere reactie van de beheerder: ${bug.reactie}` : null,
    ``,
    `## Aanpak`,
    ...aanpak,
    ``,
    `## Werkwijze`,
    `- Werk op een nieuwe branch en open een concept-pull request; verander niets direct op main (de live site).`,
    `- Pas de database rules alleen aan als dat echt nodig is, en zeg het dan expliciet.`,
    `- Sluit af met: oorzaak/oplossing in een paar zinnen, gewijzigde bestanden, hoe ik het test, en een korte reactie die ik aan de melder kan sturen.`
  ].filter((line) => line !== null).join("\n");
}

let promptModal = null;

function openPromptModal(bug) {
  if (!promptModal) {
    promptModal = document.createElement("div");
    promptModal.className = "modal hidden";
    promptModal.id = "claudePromptModal";
    promptModal.innerHTML = `
      <div class="modal-content prompt-modal" role="dialog" aria-modal="true" aria-labelledby="claudePromptTitle">
        <button type="button" class="modal-close-btn" data-close aria-label="Sluiten">&times;</button>
        <h2 id="claudePromptTitle">Prompt voor Claude</h2>
        <p class="text-muted">Pas eventueel iets aan, kopieer de tekst en plak hem in een nieuw Claude-gesprek. Naam en e-mailadres van de melder staan er bewust niet in.</p>
        <label class="visually-hidden" for="claudePromptText">Prompt</label>
        <textarea id="claudePromptText" rows="16" spellcheck="false"></textarea>
        <label class="prompt-status-option">
          <input type="checkbox" id="claudePromptSetBusy" checked>
          Melding op "In behandeling" zetten
        </label>
        <div class="prompt-actions">
          <button type="button" class="pill-btn outline" data-close>Annuleren</button>
          <a class="pill-btn outline" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Open Claude ↗</a>
          <button type="button" class="pill-btn primary" id="claudePromptCopy">Kopieer prompt</button>
        </div>
      </div>
    `;
    document.body.appendChild(promptModal);

    const close = () => {
      promptModal.classList.add("hidden");
      document.body.classList.remove("modal-open");
    };
    promptModal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));
    promptModal.addEventListener("click", (e) => {
      if (e.target === promptModal) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !promptModal.classList.contains("hidden")) close();
    });
    promptModal._close = close;
  }

  const textarea = promptModal.querySelector("#claudePromptText");
  const busyOption = promptModal.querySelector("#claudePromptSetBusy");
  const busyLabel = busyOption.closest("label");
  textarea.value = buildClaudePrompt(bug);

  const isNew = bug.status === "Nieuw";
  busyLabel.classList.toggle("hidden", !isNew);
  busyOption.checked = isNew;

  const copyBtn = promptModal.querySelector("#claudePromptCopy");
  copyBtn.textContent = "Kopieer prompt";
  copyBtn.onclick = async () => {
    const ok = await copyText(textarea.value, textarea);
    if (!ok) {
      showToast("Kopiëren lukte niet; selecteer de tekst en kopieer hem handmatig.", "error", 4200);
      return;
    }
    copyBtn.textContent = "Gekopieerd ✓";

    if (isNew && busyOption.checked) {
      try {
        await update(ref(db, `bugs/${bug.id}`), {
          status: "In behandeling",
          bijgewerkt: new Date().toISOString()
        });
        showToast("Prompt gekopieerd · melding staat op In behandeling", "success");
      } catch (error) {
        console.error(error);
        showToast("Prompt gekopieerd, maar de status kon niet worden bijgewerkt", "error", 4200);
      }
    } else {
      showToast("Prompt gekopieerd", "success");
    }
  };

  promptModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => copyBtn.focus(), 50);
}

async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      fallbackEl.focus();
      fallbackEl.select();
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

// ----------------------------------------------------------------------
// Kleine helpers
// ----------------------------------------------------------------------
function confirmDialog(message) {
  // Native confirm is hier bewust: eenvoudig en toegankelijk.
  return window.confirm(message);
}

function showToast(message, type = "info", ms = 2600) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), ms);
}
