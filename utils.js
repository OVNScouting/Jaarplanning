// ========================================================
// utils.js — algemene hulpfuncties voor OVN Jaarplanning
// Drop-in vervanging (geen regressies)
// ========================================================

/* ========================================================
   SANITIZE / TEKST
   ======================================================== */

// Maak tekst veilig om in HTML te zetten (namen, titels, notities).
// Gebruik dit voor ALLES uit de database dat via innerHTML wordt getoond.
export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Oude naam: blijft bestaan zodat bestaande imports niet breken,
// maar escapet nu alles (de oude versie liet o.a. <img onerror> door).
export const sanitizeText = escapeHtml;

// Opgemaakte tekst (zoals het infoblok) opschonen met een allowlist.
// Alleen onschuldige opmaak blijft over; scripts, event-attributen
// (onclick, onerror, ...) en javascript:-links verdwijnen.
const ALLOWED_TAGS = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "BR", "P", "DIV", "SPAN", "FONT",
  "A", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "HR"
]);

const DROP_WITH_CONTENT =
  /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|SVG|MATH|NOSCRIPT|TEXTAREA|SELECT)$/;

function isSafeUrl(url = "") {
  const value = String(url).trim();
  return /^(https?:|mailto:|tel:)/i.test(value);
}

function isSafeColor(value = "") {
  return /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(
    String(value).trim()
  );
}

export function sanitizeHtml(html = "") {
  // DOMParser voert geen scripts uit en laadt geen afbeeldingen.
  const parsed = new DOMParser().parseFromString(
    `<body>${String(html ?? "")}</body>`,
    "text/html"
  );

  const clean = (source, target) => {
    source.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        target.appendChild(document.createTextNode(node.textContent));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toUpperCase();

      // Onbekende tags: tekst behouden, tag zelf niet.
      if (!ALLOWED_TAGS.has(tag)) {
        if (!DROP_WITH_CONTENT.test(tag)) clean(node, target);
        return;
      }

      const el = document.createElement(tag.toLowerCase());

      if (tag === "A") {
        const href = node.getAttribute("href");
        if (href && isSafeUrl(href)) {
          el.setAttribute("href", href.trim());
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }

      if (tag === "FONT") {
        const color = node.getAttribute("color");
        if (color && isSafeColor(color)) el.setAttribute("color", color);
      }

      // Alleen kleur en vet/cursief uit inline style overnemen.
      const style = node.style || {};
      if (style.color && isSafeColor(style.color)) el.style.color = style.color;
      if (/^(bold|normal|[1-9]00)$/.test(style.fontWeight || "")) {
        el.style.fontWeight = style.fontWeight;
      }
      if (/^(italic|normal)$/.test(style.fontStyle || "")) {
        el.style.fontStyle = style.fontStyle;
      }
      if (
        /^(\d+(\.\d+)?(px|em|rem|%)|(x{1,3}-)?(small|large)|medium|smaller|larger)$/
          .test(style.fontSize || "")
      ) {
        el.style.fontSize = style.fontSize;
      }
      if (tag === "FONT" && /^[1-7]$/.test(node.getAttribute("size") || "")) {
        el.setAttribute("size", node.getAttribute("size"));
      }

      clean(node, el);
      target.appendChild(el);
    });
  };

  const output = document.createElement("div");
  clean(parsed.body, output);
  return output.innerHTML;
}

// Platte tekst veilig tonen, met losse links klikbaar gemaakt.
export function linkifyText(text = "") {
  return escapeHtml(text).replace(
    /https?:\/\/[^\s<"']+[^\s<"'.,;:!?)\]]/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

/* ========================================================
   DATUM — BASIS
   ======================================================== */

// Vandaag als ISO-datum (YYYY-MM-DD) in de LOKALE tijd.
// (toISOString() is UTC: tussen 00:00 en 01:00/02:00 Nederlandse
// tijd gaf dat nog de datum van gisteren.)
export function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Is datum in het verleden?
// (vandaag telt NIET als verleden)
export function isPast(dateStr) {
  if (!dateStr) return false;
  return dateStr < todayISO();
}

// Is datum vandaag of later?
export function isFutureOrToday(dateStr) {
  if (!dateStr) return false;
  return dateStr >= todayISO();
}

/* ========================================================
   DATUM — FORMAT
   ======================================================== */

// "2026-03-08" → "8 maart"
export function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const delen = dateStr.split("-");
  if (delen.length !== 3) return dateStr;

  const dag = parseInt(delen[2], 10);
  const maandIndex = parseInt(delen[1], 10) - 1;

  const maanden = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"
  ];

  if (maanden[maandIndex]) {
    return `${dag} ${maanden[maandIndex]}`;
  }
  return dateStr;
}

// Omzetten naar numerieke waarde (voor eenvoudige sort)
export function dateToNumber(dateStr) {
  if (!dateStr) return 0;
  return Number(dateStr.replace(/-/g, ""));
}

// <input type="date"> geeft al yyyy-mm-dd
export function isoFromInput(v) {
  if (!v) return "";
  return v;
}

// Berekent het seizoen (bijv. 2025-2026) op basis van een datum string.
export function getSeizoenVanDatum(dateString) {
  if (!dateString) return "";
  const datum = new Date(dateString);
  const jaar = datum.getFullYear();
  const maand = datum.getMonth(); // 0-indexed (jan = 0)

  // Scoutingseizoen loopt van augustus (maand 7) t/m juli
  if (maand < 7) {
    return `${jaar - 1}-${jaar}`;
  } else {
    return `${jaar}-${jaar + 1}`;
  }
}

/**
 * Bepaalt of een seizoen toegankelijk is voor ouders 
 * (vorig seizoen, huidig seizoen, en het volgende seizoen vanaf mei t/m juli).
 * @param {string} seizoen - Bijv. "2025-2026"
 * @returns {boolean}
 */
export function isSeizoenToegestaan(seizoen) {
  const nu = new Date();
  const maand = nu.getMonth(); // 0-indexed (0 = jan, ..., 6 = jul, 7 = aug)
  const jaar = nu.getFullYear();

  // Scoutingseizoen loopt van augustus (maand 7) t/m juli
  const huidigJaar = maand < 7 ? jaar - 1 : jaar;

  const vorigSeizoen = `${huidigJaar - 1}-${huidigJaar}`;
  const huidigSeizoen = `${huidigJaar}-${huidigJaar + 1}`;
  const volgendSeizoen = `${huidigJaar + 1}-${huidigJaar + 2}`;

  // 1. Vorig en huidig seizoen zijn altijd toegestaan
  if (seizoen === huidigSeizoen || seizoen === vorigSeizoen) {
    return true;
  }

  // 2. Het aankomende seizoen al 3 maanden van tevoren openzetten 
  // Dit geldt in mei (4), juni (5) en juli (6) van het lopende seizoen
  if (seizoen === volgendSeizoen && maand >= 4 && maand <= 6) {
    return true;
  }

  return false;
}

// Formatteert een datumberijk ("2026-03-08" en "2026-03-12" → "8 maart t/m 12 maart")
export function formatDateRange(startIso, endIso) {
  if (!startIso) return "";
  const startStr = formatDateDisplay(startIso);
  if (!endIso || endIso === startIso) {
    return startStr;
  }
  const endStr = formatDateDisplay(endIso);
  return `${startStr} t/m ${endStr}`;
}

/* ========================================================
   SORTERING — BESTAAND (BACKWARDS COMPATIBLE)
   ======================================================== */

// Vergelijk op datum + starttijd
export function compareDateTime(a, b) {
  if (a.datum < b.datum) return -1;
  if (a.datum > b.datum) return 1;

  if (a.starttijd && b.starttijd) {
    if (a.starttijd < b.starttijd) return -1;
    if (a.starttijd > b.starttijd) return 1;
  }
  return 0;
}

/* ========================================================
   NIEUW — CANONIEKE OPKOMST-LOGICA (STAP 5)
   ======================================================== */

// Laatste dag van een opkomst: bij een kamp de einddatum.
// (Een lopend kamp telt zo niet al na de eerste dag als "verleden".)
export function opkomstEindDatum(o = {}) {
  if (o.einddatum && o.einddatum > (o.datum || "")) return o.einddatum;
  return o.datum;
}

// Is de opkomst helemaal voorbij (laatste dag ligt vóór vandaag)?
export function isOpkomstVoorbij(o = {}) {
  return isPast(opkomstEindDatum(o));
}

export function sortOpkomsten(opkomsten = []) {
  return [...opkomsten].sort((a, b) => {
    const aPast = isOpkomstVoorbij(a);
    const bPast = isOpkomstVoorbij(b);

    // Toekomst eerst
    if (aPast !== bPast) return aPast ? 1 : -1;

    // Daarna datum + tijd
    return compareDateTime(a, b);
  });
}

export function getNextUpcoming(opkomsten = []) {
  if (!Array.isArray(opkomsten) || !opkomsten.length) return null;

  const sorted = sortOpkomsten(opkomsten);
  return sorted.find(o => !isOpkomstVoorbij(o)) || null;
}

export function filterOpkomsten(opkomsten = [], filter = "all") {
  if (filter === "future") {
    return opkomsten.filter(o => !isOpkomstVoorbij(o));
  }
  if (filter === "past") {
    return opkomsten.filter(o => isOpkomstVoorbij(o));
  }
  return opkomsten;
}

export function isBinnen3Dagen(dateStr) {
  if (!dateStr) return false;
  // Beide datums op lokale middernacht, zodat "over 3 dagen"
  // niet afhangt van het tijdstip of de UTC-omrekening.
  const target = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= 3;
}

/* ========================================================
   MELDINGEN: "MELD EEN PROBLEEM OF IDEE"
   Eén gedeeld formulier voor alle pagina's (stond eerder
   10x gekopieerd in de HTML).
   ======================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

function ensureFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(window.firebaseConfig);
}

const MELDING_TYPES = {
  bug: {
    label: "Iets werkt niet",
    icon: "🐞",
    placeholder: "Wat deed je, waar klikte je op, en wat had er moeten gebeuren?"
  },
  wens: {
    label: "Idee of wens",
    icon: "💡",
    placeholder: "Wat zou je willen, en waarom zou het helpen?"
  },
  vraag: {
    label: "Vraag",
    icon: "❓",
    placeholder: "Waar loop je tegenaan of wat wil je weten?"
  }
};

function describeDevice() {
  const width = window.innerWidth;
  const ua = navigator.userAgent || "";
  const isTouch = navigator.maxTouchPoints > 0;
  let apparaat = "Computer";
  if (/iPad|Tablet/i.test(ua) || (isTouch && width >= 700 && width <= 1100)) apparaat = "Tablet";
  if (/Mobi|iPhone|Android.+Mobile/i.test(ua) || (isTouch && width < 700)) apparaat = "Telefoon";

  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /CrOS/.test(ua) ? "Chromebook" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Onbekend";

  const os =
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Windows/.test(ua) ? "Windows" :
    /Mac OS X/.test(ua) ? "macOS" :
    /CrOS/.test(ua) ? "ChromeOS" :
    /Linux/.test(ua) ? "Linux" : "Onbekend";

  return {
    apparaat,
    scherm: `${width}×${window.innerHeight}`,
    browser,
    systeem: os
  };
}

function describeRole() {
  const s = (() => {
    try {
      return JSON.parse(localStorage.getItem("ovn_auth_session") || "null");
    } catch {
      return null;
    }
  })();
  const roles = s?.roles || {};
  const parts = [];
  if (roles.admin) parts.push("admin");
  if (roles.bestuur) parts.push("bestuur");
  const sp = roles.speltakken && typeof roles.speltakken === "object"
    ? Object.keys(roles.speltakken).filter(k => roles.speltakken[k] === true)
    : [];
  if (sp.length) parts.push(`leiding ${sp.join("/")}`);
  return parts.join(", ") || "ingelogd";
}

function buildBugModal() {
  document.getElementById("bugModal")?.remove();

  const typeOptions = Object.entries(MELDING_TYPES)
    .map(([value, t], i) => `
      <label class="melding-type">
        <input type="radio" name="meldingType" value="${value}" ${i === 0 ? "checked" : ""}>
        <span><span aria-hidden="true">${t.icon}</span> ${t.label}</span>
      </label>`)
    .join("");

  const modal = document.createElement("div");
  modal.id = "bugModal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-content bug-modal-content melding-modal" role="dialog" aria-modal="true" aria-labelledby="bugModalTitle">
      <button id="closeBugModalBtn" class="modal-close-btn" type="button" aria-label="Sluiten">&times;</button>

      <div id="meldingFormView">
        <h2 id="bugModalTitle" class="melding-title">Meld een probleem of idee</h2>
        <p class="text-muted melding-intro">Loop je ergens tegenaan, of heb je een idee? Laat het weten.</p>

        <form id="modalBugForm" class="melding-form" novalidate>
          <fieldset class="melding-types">
            <legend>Waar gaat het over?</legend>
            ${typeOptions}
          </fieldset>

          <div class="melding-field">
            <label for="modalBugTitle">Korte titel</label>
            <input type="text" id="modalBugTitle" maxlength="120" required
              placeholder="Bijv. De knop 'Nieuwe opkomst' doet niets">
          </div>

          <div class="melding-field">
            <label for="modalBugDesc">Omschrijving</label>
            <textarea id="modalBugDesc" rows="5" maxlength="3000" required></textarea>
          </div>

          <p class="melding-context-note">
            We sturen automatisch mee: deze pagina en het soort apparaat
            (<span id="modalBugDevice"></span>). Je antwoord vind je later in
            <strong>Mijn profiel → Mijn meldingen</strong>.
          </p>

          <div id="modalBugError" class="auth-inline-message auth-inline-message-error hidden" role="alert"></div>

          <div class="bug-modal-actions">
            <button type="button" id="cancelBugModalBtn" class="pill-btn outline">Annuleren</button>
            <button type="submit" id="submitBugModalBtn" class="pill-btn primary">Verstuur melding</button>
          </div>
        </form>
      </div>

      <div id="meldingSuccessView" class="melding-success hidden" role="status" aria-live="polite">
        <div class="melding-success-icon" aria-hidden="true">✓</div>
        <h2>Bedankt voor je melding!</h2>
        <p class="text-muted">
          We bekijken hem zo snel mogelijk. De status en onze reactie vind je in
          <a href="profile.html#mijnMeldingen">Mijn profiel → Mijn meldingen</a>.
        </p>
        <div class="bug-modal-actions">
          <button type="button" id="closeBugSuccessBtn" class="pill-btn primary">Sluiten</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

export function initBugModal() {
  // Oude, losse knoppen uit de HTML opruimen; we maken er één.
  document.querySelectorAll("#openBugModalBtn").forEach(el => el.remove());

  const openBtn = document.createElement("button");
  openBtn.id = "openBugModalBtn";
  openBtn.type = "button";
  openBtn.className = "primary-btn bug-fab hidden";
  openBtn.textContent = "Meld een probleem";
  document.body.appendChild(openBtn);

  const modal = buildBugModal();
  const form = modal.querySelector("#modalBugForm");
  const titleInput = modal.querySelector("#modalBugTitle");
  const descInput = modal.querySelector("#modalBugDesc");
  const errorEl = modal.querySelector("#modalBugError");
  const submitBtn = modal.querySelector("#submitBugModalBtn");
  const formView = modal.querySelector("#meldingFormView");
  const successView = modal.querySelector("#meldingSuccessView");

  const app = ensureFirebaseApp();
  const db = getDatabase(app);
  const auth = getAuth(app);
  let currentUser = null;

  onAuthStateChanged(auth, (user) => {
    currentUser = user || null;
    openBtn.classList.toggle("hidden", !user);
  });

  const selectedType = () =>
    modal.querySelector('input[name="meldingType"]:checked')?.value || "bug";

  const updatePlaceholder = () => {
    descInput.placeholder = MELDING_TYPES[selectedType()].placeholder;
  };

  modal.querySelectorAll('input[name="meldingType"]').forEach(input =>
    input.addEventListener("change", updatePlaceholder)
  );

  const showError = (message = "") => {
    errorEl.textContent = message;
    errorEl.classList.toggle("hidden", !message);
  };

  function openModal() {
    form.reset();
    updatePlaceholder();
    showError();
    formView.classList.remove("hidden");
    successView.classList.add("hidden");
    const ctx = describeDevice();
    modal.querySelector("#modalBugDevice").textContent =
      `${ctx.apparaat}, ${ctx.scherm}`;
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    setTimeout(() => titleInput.focus(), 50);
  }

  function closeModal() {
    modal.classList.add("hidden");
    if (!document.querySelector(".modal:not(.hidden)")) {
      document.body.classList.remove("modal-open");
    }
    openBtn.focus?.();
  }

  openBtn.addEventListener("click", openModal);
  modal.querySelector("#closeBugModalBtn").addEventListener("click", closeModal);
  modal.querySelector("#cancelBugModalBtn").addEventListener("click", closeModal);
  modal.querySelector("#closeBugSuccessBtn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError();

    const titel = titleInput.value.trim();
    const beschrijving = descInput.value.trim();

    if (!titel) {
      showError("Geef je melding een korte titel.");
      titleInput.focus();
      return;
    }
    if (!beschrijving) {
      showError("Beschrijf kort wat er aan de hand is.");
      descInput.focus();
      return;
    }
    if (!currentUser) {
      showError("Je bent niet (meer) ingelogd. Log opnieuw in en probeer het nog eens.");
      return;
    }

    const now = new Date().toISOString();
    const melding = {
      titel: titel.slice(0, 120),
      beschrijving: beschrijving.slice(0, 3000),
      type: selectedType(),
      pagina: `${location.origin}${location.pathname}`.slice(0, 300),
      melder: (currentUser.email || "Onbekend").slice(0, 200),
      melderUid: currentUser.uid,
      datum: now,
      bijgewerkt: now,
      status: "Nieuw",
      context: { ...describeDevice(), rol: describeRole().slice(0, 120) }
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Versturen…";

    try {
      await push(ref(db, "bugs"), melding);
      formView.classList.add("hidden");
      successView.classList.remove("hidden");
      modal.querySelector("#closeBugSuccessBtn").focus();
    } catch (error) {
      console.error("Fout bij opslaan melding:", error);
      showError("Je melding kon niet worden verstuurd. Probeer het later opnieuw.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Verstuur melding";
    }
  });
}

// Start automatisch zodra de DOM klaar is.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBugModal);
} else {
  initBugModal();
}
