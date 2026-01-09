"use strict";

/* ============================================================
   Imports
============================================================ */
const { onRequest, onCall, HttpsError } =
  require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const { onSchedule } = require("firebase-functions/v2/scheduler");

const admin = require("firebase-admin");
const nodemailer = require("nodemailer");


/* ============================================================
   Global options
============================================================ */
setGlobalOptions({ maxInstances: 10 });

/* ============================================================
   Firebase Admin init
============================================================ */
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.database();

/* ============================================================
   Helpers
============================================================ */
async function assertAdmin(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Niet ingelogd");
  }

  if (request.auth?.token?.admin === true) return;

  // fallback: check DB (self-heal, maar force token refresh)
  const snap = await db.ref(`users/${uid}/roles/admin`).get();
  if (snap.exists() && snap.val() === true) {
    await setAdminClaim(uid, true);
    throw new HttpsError(
      "permission-denied",
      "Adminrechten zijn bijgewerkt. Log uit en weer in."
    );
  }

  throw new HttpsError(
    "permission-denied",
    "Geen toegang (admin vereist)"
  );
}


async function setAdminClaim(uid, isAdmin) {
  // Lees bestaande claims om niks anders kapot te maken
  const user = await admin.auth().getUser(uid);
  const currentClaims = user.customClaims || {};

  const nextClaims = { ...currentClaims };

  if (isAdmin) {
    nextClaims.admin = true;
  } else {
    delete nextClaims.admin;
  }

  await admin.auth().setCustomUserClaims(uid, nextClaims);
}


async function countAdmins() {
  const snap = await db.ref("users").get();
  if (!snap.exists()) return 0;

  const users = snap.val() || {};
  return Object.values(users).filter(
    u => u?.roles?.admin === true && u?.status !== "inactive"
  ).length;
}
function speltakkenToMap(input) {
  if (!input) return {};

  // al map/object → filter alleen true keys
  if (typeof input === "object" && !Array.isArray(input)) {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === true) out[k] = true;
    }
    return out;
  }

  // array → { key: true }
  if (Array.isArray(input)) {
    const out = {};
    for (const s of input) {
      if (typeof s === "string" && s.trim()) out[s.trim()] = true;
    }
    return out;
  }

  return {};
}


function getTransporter() {
  const user = process.env.GMAIL_EMAIL;
  const pass = process.env.GMAIL_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "GMAIL_EMAIL/GMAIL_PASSWORD ontbreken (secrets niet geïnjecteerd)"
    );
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

/* ============================================================
   Cleanup helpers (accountRequests)
============================================================ */
async function cleanupRejectedAccountRequestsOlderThan(ms) {
  const cutoff = Date.now() - ms;

  // startAt(1) om null/ontbrekende rejectedAt uit te sluiten
  const snap = await db
    .ref("accountRequests")
    .orderByChild("rejectedAt")
    .startAt(1)
    .endAt(cutoff)
    .get();

  if (!snap.exists()) return { removed: 0 };

  const updates = {};
  let removed = 0;

  snap.forEach((child) => {
    const v = child.val();
    if (v?.status === "rejected") {
      updates[child.key] = null; // delete
      removed++;
    }
  });

  if (removed > 0) {
    await db.ref("accountRequests").update(updates);
  }

  return { removed };
}

/* ============================================================
   Test mail (HTTP)
============================================================ */
exports.testMail = onRequest(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (req, res) => {
    try {
      const transporter = getTransporter();

      await transporter.sendMail({
        from: `"OVN Scouting" <${process.env.GMAIL_EMAIL}>`,
        to: process.env.GMAIL_EMAIL,
        subject: "Testmail OVN Jaarplanning",
        text: "Als je dit leest, werkt de mailfunctie 🎉",
      });

      res.status(200).send("Mail verzonden");
    } catch (err) {
      logger.error("Mail fout", err);
      res.status(500).send("Fout bij verzenden");
    }
  }
);

/* ============================================================
   Account request (HTTP)
============================================================ */
exports.sendAccountRequest = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {


    try {
const {
  firstName,
  lastName,
  email,
  requestedRoles = {},
  speltakken = [],
  message = "",
} = request.data || {};

const fullName = `${firstName || ""} ${lastName || ""}`.trim();



if (!firstName || !lastName || !email) {
  throw new HttpsError(
    "invalid-argument",
    "Voornaam, achternaam en email zijn verplicht"
  );
}

// Duplicate check: email
const emailLower = String(email).trim().toLowerCase();


// check bestaande aanvragen
const reqSnap = await db
  .ref("accountRequests")
  .orderByChild("email")
  .equalTo(emailLower)
  .get();

if (reqSnap.exists()) {
  throw new HttpsError(
    "already-exists",
    "Er bestaat al een aanvraag met dit e-mailadres"
  );
}
      

      const ref = db.ref("accountRequests").push();
      const requestData = {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        fullName: String(fullName).trim(),
        email: emailLower,/*  */

        requestedRoles: {
          admin: !!requestedRoles.admin,
          bestuur: !!requestedRoles.bestuur,
        },
        speltakken: Array.isArray(speltakken) ? speltakken : [],
        message: String(message || "").trim(),
        status: "pending",
        createdAt: admin.database.ServerValue.TIMESTAMP,
      };

      await ref.set(requestData);

      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"OVN Scouting" <${process.env.GMAIL_EMAIL}>`,
        to: "ovnscouting+it@gmail.com",
      subject: `Nieuwe accountaanvraag: ${requestData.fullName}`,
        text:
          `Nieuwe accountaanvraag\n\n` +
          `Naam: ${requestData.fullName}\n` +
          `Email: ${requestData.email}`,

      });

      logger.info("Account request ontvangen", { id: ref.key });
return { ok: true };
} catch (err) {
  logger.error("Account request fout", err);

  if (err instanceof HttpsError) {
    throw err;
  }

  throw new HttpsError(
    "internal",
    "Interne fout bij verwerken accountaanvraag"
  );
}

  }
);

/* ============================================================
   Approve account request (CALLABLE)
============================================================ */
exports.approveAccountRequest = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {
    await assertAdmin(request);

 const requestId = request.data?.requestId;
if (!requestId || typeof requestId !== "string") {
  throw new HttpsError(
    "invalid-argument",
    "requestId ontbreekt of is ongeldig"
  );
}


    const snap = await db.ref(`accountRequests/${requestId}`).get();
    if (!snap.exists()) {
      throw new HttpsError("not-found", "Aanvraag niet gevonden");
    }

    const reqData = snap.val();

    if (reqData.status === "approved" && reqData.uid) {
      return { ok: true, uid: reqData.uid };
    }

    if (reqData.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "Aanvraag is al verwerkt"
      );
    }

let user;
try {
  user = await admin.auth().createUser({
    email: reqData.email,
    displayName: reqData.fullName,
  });
} catch (err) {
  if (err.code === "auth/email-already-exists") {
    user = await admin.auth().getUserByEmail(reqData.email);
  } else {
logger.error("Interne fout", err);
throw new HttpsError("internal", "Interne serverfout");
  }
}


    const uid = user.uid;

    // ============================================================
// Zet admin custom claim indien aangevraagd
// ============================================================
if (reqData?.requestedRoles?.admin === true) {
  await setAdminClaim(uid, true);
}


await db.ref(`users/${uid}`).update({
    email: reqData.email,
  firstName: reqData.firstName,
  lastName: reqData.lastName,
  fullName: reqData.fullName,

roles: {
  admin: !!reqData.requestedRoles?.admin,
  bestuur: !!reqData.requestedRoles?.bestuur,
  speltakken: speltakkenToMap(reqData.speltakken),
},


createdAt: admin.database.ServerValue.TIMESTAMP,
      createdFromRequest: requestId,
    });

    await db.ref(`accountRequests/${requestId}`).update({
      status: "approved",
      approvedAt: admin.database.ServerValue.TIMESTAMP,
      uid,
    });

    try {
      const resetLink =
        await admin.auth().generatePasswordResetLink(reqData.email);
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"OVN Scouting" <${process.env.GMAIL_EMAIL}>`,
        to: reqData.email,
        subject: "Stel je wachtwoord in (OVN Jaarplanning)",
text:
  `Hoi ${reqData.firstName},\n\n` +
  `Je account voor de OVN Jaarplanning is goedgekeurd.\n\n` +
  `Stel hier je wachtwoord in:\n${resetLink}`,
      });
    } catch (mailErr) {
      logger.error("Resetmail mislukt", mailErr);
    }

    logger.info("Account request approved", { requestId, uid });
    return { ok: true, uid };
  }
);

/* ============================================================
   Update user roles (CALLABLE)
============================================================ */
exports.updateUserRoles = onCall(async (request) => {
  await assertAdmin(request);

  const { uid, roles } = request.data || {};
  if (!uid || typeof roles !== "object") {
    throw new HttpsError("invalid-argument", "uid of roles ontbreekt");
  }

  if (roles.admin === false) {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      throw new HttpsError(
        "failed-precondition",
        "Er moet minimaal één admin blijven"
      );
    }
  }

// ============================================================
// Admin custom claim synchroon zetten met rol
// ============================================================



  const snap = await db.ref(`users/${uid}/roles`).get();
  const current = snap.val() || {};

await db.ref(`users/${uid}/roles`).set({
  admin: roles.admin ?? current.admin ?? false,
  bestuur: roles.bestuur ?? current.bestuur ?? false,
  speltakken: speltakkenToMap(
    roles.speltakken != null ? roles.speltakken : current.speltakken
  ),
});


  if (typeof roles.admin === "boolean") {
  await setAdminClaim(uid, roles.admin);
}
  return { ok: true };
});

/* ============================================================
   Set user status (CALLABLE)
============================================================ */
exports.setUserStatus = onCall(async (request) => {
  await assertAdmin(request);

  const { uid, status } = request.data || {};
  if (!uid || !["active", "inactive"].includes(status)) {
    throw new HttpsError("invalid-argument", "uid of status ongeldig");
  }

  const snap = await db.ref(`users/${uid}`).get();
  if (!snap.exists()) {
    throw new HttpsError("not-found", "Gebruiker niet gevonden");
  }

  if (status === "inactive" && snap.val()?.roles?.admin) {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      throw new HttpsError(
        "failed-precondition",
        "Er moet minimaal één admin actief blijven"
      );
    }
  }

  await admin.auth().updateUser(uid, { disabled: status === "inactive" });
  await db.ref(`users/${uid}/status`).set(status);

  return { ok: true };
});
/* ============================================================
   Update user (roles + status) in één call (CALLABLE)
============================================================ */
exports.updateUser = onCall(async (request) => {
  await assertAdmin(request);

  const { uid, roles, status } = request.data || {};

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid ontbreekt of is ongeldig");
  }
  if (roles != null && (typeof roles !== "object" || Array.isArray(roles))) {
    throw new HttpsError("invalid-argument", "roles is ongeldig");
  }
  if (status != null && !["active", "inactive"].includes(status)) {
    throw new HttpsError("invalid-argument", "status is ongeldig");
  }

  const snap = await db.ref(`users/${uid}`).get();
  if (!snap.exists()) {
    throw new HttpsError("not-found", "Gebruiker niet gevonden");
  }

  const current = snap.val() || {};
  const currentRoles = current.roles || {};

  const nextRoles = {
    admin: roles?.admin ?? currentRoles.admin ?? false,
    bestuur: roles?.bestuur ?? currentRoles.bestuur ?? false,
    speltakken: speltakkenToMap(
      roles?.speltakken != null ? roles.speltakken : currentRoles.speltakken
    ),
  };

  const nextStatus = status ?? current.status ?? "active";

  // voorkomen dat je de laatste actieve admin uitzet
  const currentIsActiveAdmin =
    currentRoles.admin === true && current.status !== "inactive";
  const nextIsActiveAdmin =
    nextRoles.admin === true && nextStatus !== "inactive";

  if (currentIsActiveAdmin && !nextIsActiveAdmin) {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      throw new HttpsError(
        "failed-precondition",
        "Er moet minimaal één admin actief blijven"
      );
    }
  }

  // Auth sync (disabled)
  await admin.auth().updateUser(uid, { disabled: nextStatus === "inactive" });

  // DB sync (roles + status)
  await db.ref().update({
    [`users/${uid}/roles`]: nextRoles,
    [`users/${uid}/status`]: nextStatus,
  });

  // Admin-claim sync: alleen setten als expliciet aangepast, of als er verschil is
  const currentClaimAdmin = !!currentRoles.admin;
  const wantClaimAdmin = !!nextRoles.admin;

  if (typeof roles?.admin === "boolean" || currentClaimAdmin !== wantClaimAdmin) {
    await setAdminClaim(uid, wantClaimAdmin);
  }

  return { ok: true };
});


/* ============================================================
   Delete user (CALLABLE)
============================================================ */
exports.deleteUser = onCall(async (request) => {
  await assertAdmin(request);

  const { uid } = request.data || {};
  if (!uid) {
    throw new HttpsError("invalid-argument", "uid ontbreekt");
  }

  const snap = await db.ref(`users/${uid}`).get();
  if (!snap.exists()) {
    throw new HttpsError("not-found", "Gebruiker niet gevonden");
  }

  if (snap.val()?.roles?.admin) {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      throw new HttpsError(
        "failed-precondition",
        "Er moet minimaal één admin blijven"
      );
    }
  }

  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      throw new HttpsError("internal", err.message);
    }
  }

  await db.ref(`users/${uid}`).remove();
  return { ok: true };
});

/* ============================================================
   Sync admin claims from database (ONE-TIME TOOL)
============================================================ */

exports.syncAdminClaimsFromDb = onCall(async (request) => {
  await assertAdmin(request);

  const snap = await db.ref("users").get();
  const users = snap.exists() ? snap.val() : {};

  const adminUids = new Set(
    Object.keys(users).filter(
      uid =>
        users[uid]?.roles?.admin === true &&
        users[uid]?.status !== "inactive"
    )
  );

  let nextPageToken;
  do {
    const res = await admin.auth().listUsers(1000, nextPageToken);
    nextPageToken = res.pageToken;

    for (const u of res.users) {
      const hasAdmin = u.customClaims?.admin === true;
      const shouldHaveAdmin = adminUids.has(u.uid);

      if (hasAdmin !== shouldHaveAdmin) {
        await admin.auth().setCustomUserClaims(u.uid, {
          ...(u.customClaims || {}),
          admin: shouldHaveAdmin,
        });
      }
    }
  } while (nextPageToken);

  return { ok: true };
});
/* ============================================================
   Reject account request (CALLABLE)
============================================================ */
exports.rejectAccountRequest = onCall(
  { secrets: ["GMAIL_EMAIL", "GMAIL_PASSWORD"] },
  async (request) => {
  await assertAdmin(request);

  const { requestId } = request.data || {};
  if (!requestId || typeof requestId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "requestId ontbreekt of is ongeldig"
    );
  }

  const ref = db.ref(`accountRequests/${requestId}`);
  const snap = await ref.get();

  if (!snap.exists()) {
    throw new HttpsError("not-found", "Aanvraag niet gevonden");
  }

  const data = snap.val();
  if (data.status !== "pending") {
    throw new HttpsError(
      "failed-precondition",
      "Aanvraag is al verwerkt"
    );
  }

  const { reason } = request.data || {};
  const reasonText =
    typeof reason === "string" ? reason.trim().slice(0, 500) : "";

  const transporter = getTransporter();

  const mailText =
    `Hoi ${data.fullName || ""},\n\n` +
    `Je accountaanvraag voor OVN Jaarplanning is afgewezen.\n` +
    (reasonText ? `\nReden: ${reasonText}\n` : "\n") +
    `Voor vragen of opmerkingen kun je mailen naar: ovnscouting+it@gmail.com\n\n` +
    `Groet,\nOVN Scouting`;

  await transporter.sendMail({
    from: `"OVN Scouting" <${process.env.GMAIL_EMAIL}>`,
    to: data.email,
    subject: "Je aanvraag is afgewezen",
    text: mailText,
    
  });

  // Pas verwijderen als mail is gelukt (anders kan admin opnieuw proberen)
  await ref.remove();


  logger.info("Account request rejected", { requestId });
  return { ok: true };
}
);


/* ============================================================
   Undo reject (CALLABLE)
============================================================ */
exports.undoRejectAccountRequest = onCall(async (request) => {
  await assertAdmin(request);

  const { requestId } = request.data || {};
  if (!requestId || typeof requestId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "requestId ontbreekt of is ongeldig"
    );
  }

  const ref = db.ref(`accountRequests/${requestId}`);
  const snap = await ref.get();

  if (!snap.exists()) {
    throw new HttpsError("not-found", "Aanvraag niet gevonden");
  }

  const data = snap.val();
  if (data.status !== "rejected") {
    throw new HttpsError(
      "failed-precondition",
      "Undo kan alleen bij afgewezen aanvragen"
    );
  }

  await ref.update({
    status: "pending",
    rejectedAt: null,
    undoneAt: admin.database.ServerValue.TIMESTAMP,
  });

  logger.info("Account request undo", { requestId });
  return { ok: true };
});

/* ============================================================
   Scheduled cleanup: delete rejected requests after 5 minutes
============================================================ */
exports.cleanupRejectedAccountRequests = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Europe/Amsterdam" },
  async () => {
    const res = await cleanupRejectedAccountRequestsOlderThan(5 * 60 * 1000);
    logger.info("cleanupRejectedAccountRequests", res);
  }
);
