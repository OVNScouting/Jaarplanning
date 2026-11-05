const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

/**
 * Helper validatie functie om te controleren of de gebruiker admin is
 */
async function assertAdmin(auth) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "U moet ingelogd zijn.");
  }

  const adminRef = admin.database().ref(`users/${auth.uid}/roles/admin`);
  const snapshot = await adminRef.get();

  if (!snapshot.exists() || snapshot.val() !== true) {
    throw new HttpsError("permission-denied", "Alleen admins hebben toegang tot deze actie.");
  }
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
  await assertAdmin(request.auth);

  const { uid, roles, status } = request.data;
  if (!uid) {
    throw new HttpsError("invalid-argument", "Gebruikers-ID (uid) ontbreekt.");
  }

  try {
    const db = admin.database();

    const isAdmin = !!roles?.admin;
    const isBestuur = !!roles?.bestuur;

    // Omzetten van aangevinkte lijst naar boolean-object:
    // Resultaat: { bevers: true, welpen: false, scouts: false, explorers: false, rovers: false, stam: true }
    const speltakkenObj = normalizeSpeltakken(roles?.speltakken);

    // 1. Claims bijwerken in Firebase Auth
    await admin.auth().setCustomUserClaims(uid, {
      admin: isAdmin,
      bestuur: isBestuur
    });

    // 2. Data in Realtime Database opslaan in de juiste true/false-structuur
    const updates = {
      "roles/admin": isAdmin,
      "roles/bestuur": isBestuur,
      "roles/speltakken": speltakkenObj,
      "status": status || "active"
    };

    await db.ref(`users/${uid}`).update(updates);

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
  await assertAdmin(request.auth);

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
  await assertAdmin(request.auth);

  const { requestId } = request.data;
  if (!requestId) {
    throw new HttpsError("invalid-argument", "requestId ontbreekt.");
  }

  const db = admin.database();
  const requestRef = db.ref(`accountRequests/${requestId}`);

  if (!(await requestRef.get()).exists()) {
    throw new HttpsError("not-found", "Aanvraag niet gevonden.");
  }

  try {
    await requestRef.remove(); // Verwijdert de aanvraag direct
    return { success: true };
  } catch (err) {
    console.error("Error running rejectAccountRequest:", err);
    throw new HttpsError("internal", err.message || "Afwijzen is mislukt.");
  }
});

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