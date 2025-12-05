// ================================================================
//  Firebase Imports with Multi-CDN Fallback + Local Cache
//  Thijmen — the strongest possible production-safe version
// ================================================================

// --- Local Cache Helpers ----------------------------------------

async function loadScriptCached(url) {
    const cacheName = "firebase-cdn-cache-v1";
    const cache = await caches.open(cacheName);

    // Try cache first
    const cached = await cache.match(url);
    if (cached) {
        const blob = await cached.blob();
        return URL.createObjectURL(blob);
    }

    // Fetch from network
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network error loading " + url);

    // Store in cache
    cache.put(url, res.clone());

    const blob = await res.blob();
    return URL.createObjectURL(blob);
}

// --- Multi-CDN Loader --------------------------------------------

async function loadFirebaseModule(path) {
    const cdnList = [
        // 1. Google CDN (gstatic)
        `https://www.gstatic.com/firebasejs/10.8.0/${path}`,

        // 2. jsDelivr fallback
        `https://cdn.jsdelivr.net/npm/firebase@10.8.0/${path}`,

        // 3. UNPKG fallback
        `https://unpkg.com/firebase@10.8.0/${path}`
    ];

    let lastError = null;

    for (const url of cdnList) {
        try {
            const moduleUrl = await loadScriptCached(url);
            return await import(moduleUrl);  // Dynamic ES module import
        } catch (err) {
            lastError = err;
            console.warn("Firebase CDN failed:", url);
        }
    }

    throw lastError || new Error("All Firebase CDNs failed");
}

// --- Exported Firebase Modules -----------------------------------

export const appPromise = loadFirebaseModule("firebase-app.js");
export const dbPromise = loadFirebaseModule("firebase-database.js");

// Usage example in your script.js:
//
// import { appPromise, dbPromise } from "./firebase-imports.js";
//
// Promise.all([appPromise, dbPromise]).then(([appModule, dbModule]) => {
//     const { initializeApp } = appModule;
//     const { getDatabase, ref, get, set, update, push } = dbModule;
//
//     const app = initializeApp(window.firebaseConfig);
//     const db = getDatabase(app);
//
//     // Now continue with your existing code...
// });
