// ======================================================================
//  Firebase Multi-CDN Loader (WORKING VERSION)
// ======================================================================

async function importModule(urls) {
    let lastErr = null;

    for (const url of urls) {
        try {
            return await import(url);
        } catch (err) {
            lastErr = err;
            console.warn("Firebase import failed:", url);
        }
    }

    throw lastErr || new Error("All Firebase sources failed to load.");
}

// --------------------------------------------------------
// Correct URLs for Firebase v10+ ESM modules
// --------------------------------------------------------

export const firebaseApp = importModule([
    "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js",
    "https://cdn.jsdelivr.net/npm/firebase@10.8.0/app/dist/index.esm.js",
    "https://unpkg.com/firebase@10.8.0/app/dist/index.esm.js"
]);

export const firebaseDB = importModule([
    "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js",
    "https://cdn.jsdelivr.net/npm/firebase@10.8.0/database/dist/index.esm.js",
    "https://unpkg.com/firebase@10.8.0/database/dist/index.esm.js"
]);
