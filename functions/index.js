const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Helper validatie functie om te controleren of de gebruiker admin is[cite: 21]
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

/**
 * Function: approveAccountRequest (Zonder e-mail)
 * Maakt de gebruiker aan en geeft het tijdelijke wachtwoord terug aan de admin.
 */
exports.approveAccountRequest = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { requestId } = request.data;
  if (!requestId) {
    throw new HttpsError("invalid-argument", "requestId ontbreekt.");
  }

  const db = admin.database();
  const requestRef = db.ref(`accountRequests/${requestId}`);
  const snapshot = await requestRef.get();

  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "Aanvraag niet gevonden.");
  }

  const accountRequest = snapshot.val();
  const { email, fullName, requestedRoles, speltakken } = accountRequest;

  try {
    let userRecord;
    // Genereer een tijdelijk wachtwoord dat we zo teruggeven aan de admin
    const tempPassword = Math.random().toString(36).slice(-8) + "A1!";

    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        userRecord = await admin.auth().createUser({
          email,
          displayName: fullName,
          password: tempPassword,
          emailVerified: true
        });
      } else {
        throw error;
      }
    }

    const uid = userRecord.uid;

    // Claims instellen[cite: 21]
    const claims = {
      admin: !!requestedRoles?.admin,
      bestuur: !!requestedRoles?.bestuur
    };
    await admin.auth().setCustomUserClaims(uid, claims);

    // Profiel opslaan in database[cite: 21]
    const userPayload = {
      fullName,
      email,
      status: "active",
      createdAt: admin.database.ServerValue.TIMESTAMP,
      roles: {
        admin: claims.admin,
        bestuur: claims.bestuur,
        speltakken: speltakken || []
      }
    };
    await db.ref(`users/${uid}`).set(userPayload);

    // Verwijder uit de wachtrij[cite: 21]
    await requestRef.remove();

    // Geef het wachtwoord terug aan de frontend zodat de admin dit kan delen
    return {
      success: true,
      uid,
      tempPassword: tempPassword
    };

  } catch (err) {
    console.error("Error running approveAccountRequest:", err);
    throw new HttpsError("internal", err.message || "Goedkeuring is mislukt.");
  }
});

/**
 * Function: rejectAccountRequest (Zonder e-mail)
 * Verwijdert simpelweg de aanvraag.[cite: 21]
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
    await requestRef.remove(); // Verwijdert de aanvraag direct[cite: 21]
    return { success: true };
  } catch (err) {
    console.error("Error running rejectAccountRequest:", err);
    throw new HttpsError("internal", err.message || "Afwijzen is mislukt.");
  }
});