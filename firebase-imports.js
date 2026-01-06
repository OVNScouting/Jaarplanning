// firebase-imports.js
// Laadt Firebase v9+ (modular) in een "classic script" omgeving (GitHub Pages),
// en expose't alles onder window._firebase zodat de rest van je code kan blijven zoals hij is.

(() => {
  const VERSION = "10.12.5"; // vaste versie = voorspelbaar
  const base = `https://www.gstatic.com/firebasejs/${VERSION}`;

  async function load() {
    try {
      const [
        appMod,
        authMod,
        dbMod,
        fnMod,
      ] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-database.js`),
        import(`${base}/firebase-functions.js`),
      ]);

      // Bundel alle exports die jullie in de code gebruiken in 1 namespace:
      window._firebase = {
        // app
        ...appMod,
        // auth
        ...authMod,
        // database
        ...dbMod,
        // functions
        ...fnMod,
      };

      // Handig signaal (optioneel) voor debug/latere verbeteringen
      window._firebaseReady = true;
      document.dispatchEvent(new Event("firebase-ready"));
      console.log("[firebase-imports] Firebase geladen:", VERSION);
    } catch (err) {
      console.error("[firebase-imports] Firebase laden mislukt:", err);
      window._firebaseReady = false;
    }
  }

  load();
})();
