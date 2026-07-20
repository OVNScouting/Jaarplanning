const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialiseer de Firebase Admin SDK
admin.initializeApp();

const SPELTAKKEN = ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"];

// { cors: true } zorgt ervoor dat verzoeken vanaf 127.0.0.1 / localhost worden toegestaan
exports.getGlobalDashboard = onCall({ cors: true }, async (request) => {
    // 1. Authenticatie-check
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Je moet ingelogd zijn om het dashboard te bekijken."
        );
    }

    try {
        const dbRef = admin.database().ref();
        const results = [];

        // 2. Loop door alle speltakken en haal de opkomsten op via Admin SDK
        for (const sp of SPELTAKKEN) {
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

        return { success: true, data: results };

    } catch (error) {
        console.error("Fout bij ophalen jaaroverzicht:", error);
        throw new HttpsError("internal", "Kon het jaaroverzicht niet ophalen.");
    }
});