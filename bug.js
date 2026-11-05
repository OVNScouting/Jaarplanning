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
