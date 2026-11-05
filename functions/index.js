const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueWritten, onValueCreated } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

admin.initializeApp();

// De Realtime Database staat in europe-west1; database-triggers moeten
// in dezelfde regio draaien.
const DB_REGION = "europe-west1";
const SITE_URL = "https://ovnjaarplanning.nl";

// Alle beheer-mails (nieuwe melding, nieuwe accountaanvraag) gaan naar
// dit vaste adres. (Bewuste keuze: geen Google Workspace.)
const ADMIN_MAIL_TO = "ovnscouting@gmail.com";

// E-mail (Gmail + app-wachtwoord). Deze twee secrets MOETEN bestaan
// vóór "firebase deploy --only functions", anders weigert de deploy:
//   firebase functions:secrets:set MAIL_USER
//   firebase functions:secrets:set MAIL_PASS
// (Lege waarde of later uitzetten kan: dan wordt er alleen niet gemaild.)
const MAIL_USER = defineSecret("MAIL_USER");
const MAIL_PASS = defineSecret("MAIL_PASS");

/**
 * Helper validatie functie om te controleren of de gebruiker admin is
 */
async function assertAdmin(auth) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "U moet ingelogd zijn.");
  }

  const snapshot = await admin.database().ref(`users/${auth.uid}`).get();
  const profile = snapshot.val();

  if (!profile || profile.roles?.admin !== true || profile.status === "inactive") {
    throw new HttpsError("permission-denied", "Alleen admins hebben toegang tot deze actie.");
  }

  return { uid: auth.uid, name: profile.fullName || profile.email || "Admin" };
}

// ============================================================
// LOGBOEK (account- en rolwijzigingen)
// ============================================================

const ROLE_LABELS = {
  admin: "Admin",
  bestuur: "Bestuur",
  bevers: "Bevers",
  welpen: "Welpen",
  scouts: "Scouts",
  explorers: "Explorers",
  rovers: "Rovers",
  stam: "Stam"
};

/** Rollen als platte lijst: ["Admin", "Bevers", ...] */
function roleList(roles) {
  const list = [];
  if (roles?.admin) list.push(ROLE_LABELS.admin);
  if (roles?.bestuur) list.push(ROLE_LABELS.bestuur);
  const sp = normalizeSpeltakken(roles?.speltakken);
  KNOWN_SPELTAKKEN.forEach((key) => {
    if (sp[key]) list.push(ROLE_LABELS[key]);
  });
  return list;
}

/** Leesbare verschillen tussen twee profielen. */
function describeChanges(before = {}, after = {}) {
  const changes = [];

  const oldRoles = roleList(before.roles);
  const newRoles = roleList(after.roles);
  const added = newRoles.filter((r) => !oldRoles.includes(r));
  const removed = oldRoles.filter((r) => !newRoles.includes(r));
  if (added.length) changes.push(`Rol erbij: ${added.join(", ")}`);
  if (removed.length) changes.push(`Rol eraf: ${removed.join(", ")}`);

  const oldStatus = before.status || "active";
  const newStatus = after.status || "active";
  if (oldStatus !== newStatus) {
    changes.push(newStatus === "inactive" ? "Account gedeactiveerd" : "Account geactiveerd");
  }

  if ((before.fullName || "") !== (after.fullName || "")) {
    changes.push(`Naam: "${before.fullName || "—"}" → "${after.fullName || "—"}"`);
  }

  return changes;
}

/**
 * Schrijf een logboekregel. Alleen functions schrijven hier (de
 * Admin SDK); de database rules laten clients er niet bij.
 */
async function writeAudit({ actor, action, targetUid = null, targetName = "", details = [] }) {
  try {
    await admin.database().ref("auditLog").push({
      at: admin.database.ServerValue.TIMESTAMP,
      actorUid: actor?.uid || null,
      actorName: actor?.name || "Systeem",
      action,
      targetUid,
      targetName: String(targetName || "").slice(0, 120),
      details: details.map((d) => String(d).slice(0, 200)).slice(0, 20)
    });
  } catch (err) {
    // Loggen mag een actie nooit laten mislukken.
    console.error("Logboekregel schrijven mislukt:", err);
  }
}

// ============================================================
// E-MAIL AAN ADMINS
// ============================================================

/**
 * Stuurt een platte-tekstmail naar het beheeradres (ADMIN_MAIL_TO).
 * Zonder ingestelde MAIL_USER/MAIL_PASS wordt er niets verstuurd
 * (alleen een waarschuwing in de logs); de rest werkt gewoon door.
 */
async function mailAdmins(subject, text) {
  let user = "";
  let pass = "";
  try {
    user = MAIL_USER.value();
    pass = MAIL_PASS.value();
  } catch {
    // Secret niet beschikbaar
  }

  if (!user || !pass) {
    console.warn("MAIL_USER/MAIL_PASS niet ingesteld; e-mail overgeslagen:", subject);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }
  });

  try {
    await transporter.sendMail({
      from: `"OVN Jaarplanning" <${user}>`,
      to: ADMIN_MAIL_TO,
      subject: subject.replace(/[\r\n]+/g, " ").slice(0, 150),
      text
    });
  } catch (err) {
    console.error("E-mail versturen mislukt:", err);
  }
}

function clip(value, max = 500) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const KNOWN_SPELTAKKEN = ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"];

/**
 * Zet speltakken (array, {0:"bevers"} of {bevers:true}) om naar
 * één vaste vorm: { bevers: true, welpen: false, ... }
 */
function normalizeSpeltakken(raw) {
  const result = {};
  const values = raw && typeof raw === "object" ? Object.values(raw) : [];
  const asList = Array.isArray(raw) || values.every((v) => typeof v === "string")
    ? values
    : null;

  KNOWN_SPELTAKKEN.forEach((sp) => {
    result[sp] = asList ? asList.includes(sp) : !!(raw && raw[sp]);
  });
  return result;
}

/**
 * Uniek, goed leesbaar tijdelijk wachtwoord (geen 0/O/1/l/I).
 * Voorheen kreeg iedereen hetzelfde vaste wachtwoord.
 */
function generateTempPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8);
}

/**
 * Is dit een actief account met een profiel in /users?
 * (Een los Firebase Auth-account zonder goedgekeurde aanvraag telt niet.)
 */
async function assertActiveMember(auth) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Je moet ingelogd zijn.");
  }
  const snap = await admin.database().ref(`users/${auth.uid}`).get();
  const user = snap.val();
  if (!user || user.status === "inactive") {
    throw new HttpsError("permission-denied", "Je account is (nog) niet actief.");
  }
  return user;
}

/**
 * Function: updateUser
 * Past de rollen, speltakken en status van een gebruiker aan.
 */
exports.updateUser = onCall(async (request) => {
  const actor = await assertAdmin(request.auth);

  const { uid, roles, status, fullName } = request.data || {};
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "Gebruikers-ID (uid) ontbreekt.");
  }

  const db = admin.database();
  const beforeSnap = await db.ref(`users/${uid}`).get();
  if (!beforeSnap.exists()) {
    throw new HttpsError("not-found", "Gebruiker niet gevonden.");
  }
  const before = beforeSnap.val();

  // Jezelf de adminrol afnemen of deactiveren sluit je buiten.
  if (uid === actor.uid && (!roles?.admin || status === "inactive")) {
    throw new HttpsError(
      "failed-precondition",
      "Je kunt je eigen adminrol niet afnemen of je eigen account deactiveren."
    );
  }

  const isAdmin = !!roles?.admin;
  const isBestuur = !!roles?.bestuur;
  const speltakkenObj = normalizeSpeltakken(roles?.speltakken);
  const newStatus = status === "inactive" ? "inactive" : "active";

  let newName = before.fullName || "";
  if (typeof fullName === "string") {
    newName = fullName.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!newName) {
      throw new HttpsError("invalid-argument", "Naam mag niet leeg zijn.");
    }
  }

  try {
    await admin.auth().setCustomUserClaims(uid, {
      admin: isAdmin,
      bestuur: isBestuur
    });

    if (newName !== (before.fullName || "")) {
      await admin.auth().updateUser(uid, { displayName: newName });
    }

    // Gedeactiveerd? Dan ook direct uitloggen op alle apparaten.
    if (newStatus === "inactive" && before.status !== "inactive") {
      await admin.auth().revokeRefreshTokens(uid);
    }

    const after = {
      ...before,
      fullName: newName,
      status: newStatus,
      roles: { admin: isAdmin, bestuur: isBestuur, speltakken: speltakkenObj }
    };

    await db.ref(`users/${uid}`).update({
      "fullName": newName,
      "roles/admin": isAdmin,
      "roles/bestuur": isBestuur,
      "roles/speltakken": speltakkenObj,
      "status": newStatus
    });

    const details = describeChanges(before, after);
    if (details.length) {
      await writeAudit({
        actor,
        action: "Account gewijzigd",
        targetUid: uid,
        targetName: newName || before.email,
        details
      });
    }

    return { success: true };
  } catch (err) {
    console.error("Fout bij updateUser:", err);
    throw new HttpsError("internal", err.message || "Bewerken van gebruiker mislukt.");
  }
});

/**
 * Function: approveAccountRequest (Zonder e-mail)
 * Maakt de gebruiker aan en geeft het tijdelijke wachtwoord terug aan de admin.
 */
exports.approveAccountRequest = onCall(async (request) => {
  const actor = await assertAdmin(request.auth);

  const { requestId } = request.data || {};
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]+$/.test(requestId)) {
    throw new HttpsError("invalid-argument", "requestId ontbreekt of is ongeldig.");
  }

  const db = admin.database();
  const requestRef = db.ref(`accountRequests/${requestId}`);
  const snapshot = await requestRef.get();

  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "Aanvraag niet gevonden.");
  }

  const accountRequest = snapshot.val();
  const email = String(accountRequest.email || "").trim().toLowerCase();
  const fullName = String(accountRequest.fullName || "").trim();

  if (!email) {
    throw new HttpsError("invalid-argument", "De aanvraag bevat geen e-mailadres.");
  }

  // Rollen komen uit de aanvraag zoals de admin die in het
  // beoordelingsscherm heeft gecontroleerd/aangepast.
  const roles = {
    admin: !!accountRequest.requestedRoles?.admin,
    bestuur: !!accountRequest.requestedRoles?.bestuur,
    speltakken: normalizeSpeltakken(accountRequest.speltakken)
  };

  try {
    let userRecord = null;
    let tempPassword = null;
    let existing = false;

    try {
      userRecord = await admin.auth().getUserByEmail(email);
      existing = true;
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
    }

    if (!userRecord) {
      tempPassword = generateTempPassword();
      userRecord = await admin.auth().createUser({
        email,
        displayName: fullName || undefined,
        password: tempPassword,
        emailVerified: true
      });
    }

    const uid = userRecord.uid;

    await admin.auth().setCustomUserClaims(uid, {
      admin: roles.admin,
      bestuur: roles.bestuur
    });

    // update i.p.v. set: bij een bestaand account blijven andere
    // velden (zoals gekoppelde leden) behouden.
    const profile = {
      fullName,
      email,
      status: "active",
      roles
    };
    if (!existing) {
      profile.createdAt = admin.database.ServerValue.TIMESTAMP;
      profile.mustChangePassword = true;
    }

    await db.ref().update({
      [`users/${uid}/fullName`]: profile.fullName,
      [`users/${uid}/email`]: profile.email,
      [`users/${uid}/status`]: profile.status,
      [`users/${uid}/roles`]: profile.roles,
      ...(existing ? {} : {
        [`users/${uid}/createdAt`]: profile.createdAt,
        [`users/${uid}/mustChangePassword`]: true
      }),
      [`accountRequests/${requestId}`]: null
    });

    await writeAudit({
      actor,
      action: existing ? "Aanvraag goedgekeurd (bestaand account)" : "Account aangemaakt",
      targetUid: uid,
      targetName: fullName || email,
      details: [
        `E-mail: ${email}`,
        `Rollen: ${roleList(roles).join(", ") || "geen"}`
      ]
    });

    // Het tijdelijke wachtwoord gaat alleen terug naar de admin
    // die goedkeurt; het wordt nergens opgeslagen.
    return {
      success: true,
      uid,
      existing,
      tempPassword
    };

  } catch (err) {
    console.error("Error running approveAccountRequest:", err);
    throw new HttpsError("internal", err.message || "Goedkeuring is mislukt.");
  }
});

/**
 * Function: rejectAccountRequest (Zonder e-mail)
 * Verwijdert simpelweg de aanvraag.
 */
exports.rejectAccountRequest = onCall(async (request) => {
  const actor = await assertAdmin(request.auth);

  const { requestId } = request.data || {};
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]+$/.test(requestId)) {
    throw new HttpsError("invalid-argument", "requestId ontbreekt of is ongeldig.");
  }

  const db = admin.database();
  const requestRef = db.ref(`accountRequests/${requestId}`);
  const snap = await requestRef.get();

  if (!snap.exists()) {
    throw new HttpsError("not-found", "Aanvraag niet gevonden.");
  }

  const req = snap.val() || {};

  try {
    await requestRef.remove();
    await writeAudit({
      actor,
      action: "Aanvraag afgewezen",
      targetName: req.fullName || req.email,
      details: req.email ? [`E-mail: ${req.email}`] : []
    });
    return { success: true };
  } catch (err) {
    console.error("Error running rejectAccountRequest:", err);
    throw new HttpsError("internal", err.message || "Afwijzen is mislukt.");
  }
});

/**
 * Function: deleteUserAccount
 * Verwijdert het profiel ÉN de login (Firebase Auth). Voorheen werd
 * alleen het profiel gewist en bleef inloggen mogelijk.
 */
exports.deleteUserAccount = onCall(async (request) => {
  const actor = await assertAdmin(request.auth);

  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "Gebruikers-ID (uid) ontbreekt.");
  }
  if (uid === actor.uid) {
    throw new HttpsError("failed-precondition", "Je kunt je eigen account niet verwijderen.");
  }

  const db = admin.database();
  const profile = (await db.ref(`users/${uid}`).get()).val() || {};

  try {
    try {
      await admin.auth().deleteUser(uid);
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }

    await db.ref(`users/${uid}`).remove();

    await writeAudit({
      actor,
      action: "Account verwijderd",
      targetUid: uid,
      targetName: profile.fullName || profile.email || uid,
      details: [
        profile.email ? `E-mail: ${profile.email}` : null,
        `Had rollen: ${roleList(profile.roles).join(", ") || "geen"}`
      ].filter(Boolean)
    });

    return { success: true };
  } catch (err) {
    console.error("Fout bij deleteUserAccount:", err);
    throw new HttpsError("internal", err.message || "Verwijderen is mislukt.");
  }
});

/**
 * Function: getAdminOverview
 * Inloggegevens uit Firebase Auth (laatst ingelogd) per gebruiker,
 * voor het admin-startscherm.
 */
exports.getAdminOverview = onCall(async (request) => {
  await assertAdmin(request.auth);

  // Eenmalige inhaalslag: oudere meldingen (van vóór de spiegeling)
  // ook in 'Mijn meldingen' van de melder zetten.
  try {
    await backfillMeldingen();
  } catch (err) {
    console.warn("Backfill meldingen mislukt:", err);
  }

  const lastSignIn = {};
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    page.users.forEach((u) => {
      lastSignIn[u.uid] = u.metadata.lastSignInTime
        ? new Date(u.metadata.lastSignInTime).getTime()
        : null;
    });
    pageToken = page.pageToken;
  } while (pageToken);

  return { success: true, lastSignIn };
});

// ==========================================
// Meldingen (bugs) en accountaanvragen
// ==========================================

function meldingSummary(bug = {}) {
  return {
    titel: clip(bug.titel, 120),
    type: bug.type || "bug",
    status: bug.status || "Nieuw",
    reactie: clip(bug.reactie, 1000),
    datum: bug.datum || null,
    bijgewerkt: bug.bijgewerkt || bug.datum || null
  };
}

async function findMelderUid(bug) {
  if (!bug) return null;
  if (bug.melderUid) return bug.melderUid;
  const email = String(bug.melder || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  try {
    return (await admin.auth().getUserByEmail(email)).uid;
  } catch {
    return null;
  }
}

/**
 * Alleen spiegelen naar een bestaand profiel; anders zou een
 * verwijderd account terugkomen als lege rij in de gebruikerslijst.
 */
async function profileExists(uid) {
  const snap = await admin.database().ref(`users/${uid}/email`).get();
  return snap.exists();
}

/** Spiegel meldingen die nog geen samenvatting bij de melder hebben. */
async function backfillMeldingen() {
  const db = admin.database();
  const flag = db.ref("_meta/meldingenBackfilled");
  if ((await flag.get()).val() === true) return;

  const bugs = (await db.ref("bugs").get()).val() || {};
  const updates = {};
  for (const [id, bug] of Object.entries(bugs)) {
    const uid = await findMelderUid(bug);
    if (uid && (await profileExists(uid))) {
      updates[`users/${uid}/meldingen/${id}`] = meldingSummary(bug);
    }
  }
  updates["_meta/meldingenBackfilled"] = true;
  await db.ref().update(updates);
}

/**
 * Bij elke wijziging van een melding:
 * - nieuwe melding → mail naar admins
 * - samenvatting spiegelen naar users/{uid}/meldingen/{id}, zodat de
 *   melder status en reactie in zijn profiel ziet (zonder leesrecht
 *   op alle meldingen).
 */
exports.onBugWritten = onValueWritten(
  { ref: "bugs/{bugId}", region: DB_REGION, secrets: [MAIL_USER, MAIL_PASS] },
  async (event) => {
    const bugId = event.params.bugId;
    const before = event.data.before.val();
    const after = event.data.after.val();
    const db = admin.database();

    const findUid = findMelderUid;

    // Verwijderd → spiegel opruimen
    if (!after) {
      const uid = await findUid(before);
      if (uid) await db.ref(`users/${uid}/meldingen/${bugId}`).remove();
      return;
    }

    const uid = await findUid(after);
    if (uid && (await profileExists(uid))) {
      await db.ref(`users/${uid}/meldingen/${bugId}`).set(meldingSummary(after));
    }

    if (!before) {
      const typeLabel = { bug: "Bug", wens: "Wens", vraag: "Vraag" }[after.type] || "Melding";
      const context = after.context || {};
      await mailAdmins(
        `Nieuwe melding (${typeLabel}): ${clip(after.titel, 80)}`,
        [
          `Er is een nieuwe melding binnengekomen op de OVN Jaarplanning.`,
          ``,
          `Type: ${typeLabel}`,
          `Titel: ${clip(after.titel, 200)}`,
          `Van: ${clip(after.melder, 120)}`,
          `Pagina: ${clip(after.pagina, 200)}`,
          context.apparaat ? `Apparaat: ${clip(context.apparaat, 80)} (${clip(context.scherm, 20)})` : null,
          ``,
          clip(after.beschrijving, 1500),
          ``,
          `Bekijk en beantwoord: ${SITE_URL}/bug.html`
        ].filter((line) => line !== null).join("\n")
      );
    }
  }
);

/** Nieuwe accountaanvraag → mail naar admins. */
exports.onAccountRequestCreated = onValueCreated(
  { ref: "accountRequests/{requestId}", region: DB_REGION, secrets: [MAIL_USER, MAIL_PASS] },
  async (event) => {
    const req = event.data.val() || {};
    const speltakken = Object.entries(req.speltakken || {})
      .filter(([, v]) => v === true)
      .map(([k]) => ROLE_LABELS[k] || k);

    await mailAdmins(
      `Nieuwe accountaanvraag: ${clip(req.fullName || req.email, 80)}`,
      [
        `Er is een nieuwe accountaanvraag voor de OVN Jaarplanning.`,
        ``,
        `Naam: ${clip(req.fullName, 120)}`,
        `E-mail: ${clip(req.email, 120)}`,
        `Speltakken: ${speltakken.join(", ") || "—"}`,
        req.requestedRoles?.admin || req.requestedRoles?.bestuur
          ? `Vraagt ook: ${[req.requestedRoles?.admin ? "Admin" : null, req.requestedRoles?.bestuur ? "Bestuur" : null].filter(Boolean).join(", ")}`
          : null,
        ``,
        `Beoordelen: ${SITE_URL}/admin.html`
      ].filter((line) => line !== null).join("\n")
    );
  }
);

// ==========================================
// Dashboard Jaaroverzicht (Realtime Database)
// ==========================================
const SPELTAKKEN_DASHBOARD = ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"];

exports.getGlobalDashboard = onCall({ cors: true }, async (request) => {
  // 1. Alleen actieve, goedgekeurde accounts (met profiel in /users).
  //    Alleen "ingelogd" is niet genoeg: een los aangemaakt
  //    Firebase-account zou anders alle privé-planningen zien.
  await assertActiveMember(request.auth);

  try {
    const dbRef = admin.database().ref();
    const results = [];

    // 2. Loop door alle speltakken en haal de opkomsten op via Admin SDK
    for (const sp of SPELTAKKEN_DASHBOARD) {
      const snapshot = await dbRef.child(`${sp}/opkomsten`).get();
      if (!snapshot.exists()) continue;

      const opkomstenObj = snapshot.val() || {};

      for (const [id, o] of Object.entries(opkomstenObj)) {
        if (!o?.datum) continue;

        results.push({
          speltak: sp,
          id,
          ...o
        });
      }
    }

    // 3. Stuur de data veilig terug naar de frontend
    return { success: true, data: results };

  } catch (error) {
    console.error("Fout bij ophalen jaaroverzicht:", error);
    throw new HttpsError("internal", "Kon het jaaroverzicht niet ophalen.");
  }
});