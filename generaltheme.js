/* ======================================================================
   ALGEMEEN THEMA — LIGHT / DARK
   ====================================================================== */

(() => {
    "use strict";

    const STORAGE_KEY = "ovn_theme";
    const VALID_THEMES = new Set(["light", "dark"]);

    const systemThemeQuery = window.matchMedia(
        "(prefers-color-scheme: dark)"
    );

    /**
     * Lees de opgeslagen voorkeur.
     * Geeft null terug als de gebruiker nog niets gekozen heeft.
     */
    function getSavedTheme() {
        try {
            const savedTheme = localStorage.getItem(STORAGE_KEY);

            return VALID_THEMES.has(savedTheme)
                ? savedTheme
                : null;
        } catch (error) {
            console.warn("Themakeuze kon niet worden gelezen:", error);
            return null;
        }
    }

    /**
     * Gebruik de opgeslagen keuze, of anders de systeemvoorkeur.
     */
    function getPreferredTheme() {
        return getSavedTheme() ||
            (systemThemeQuery.matches ? "dark" : "light");
    }

    /**
     * Pas het thema direct toe op het html-element.
     * Dit werkt al voordat de body volledig is ingeladen.
     */
    function applyTheme(theme) {
        const safeTheme = VALID_THEMES.has(theme)
            ? theme
            : "light";

        document.documentElement.dataset.theme = safeTheme;
        document.documentElement.style.colorScheme = safeTheme;

        updateThemeButton(safeTheme);
    }

    /**
     * Werk icoon, titel en toegankelijkheidslabels bij.
     */
    function updateThemeButton(theme) {
        const button = document.getElementById("themeToggle");

        if (!button) return;

        const isDark = theme === "dark";

        button.textContent = isDark ? "☀️" : "🌙";
        button.title = isDark
            ? "Lichte modus inschakelen"
            : "Donkere modus inschakelen";

        button.setAttribute(
            "aria-label",
            button.title
        );

        button.setAttribute(
            "aria-pressed",
            String(isDark)
        );
    }

    /**
     * Sla de handmatige gebruikerskeuze op.
     */
    function saveTheme(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (error) {
            console.warn("Themakeuze kon niet worden opgeslagen:", error);
        }
    }

    /**
     * Wissel tussen licht en donker.
     */
    function toggleTheme() {
        const currentTheme =
            document.documentElement.dataset.theme ||
            getPreferredTheme();

        const nextTheme =
            currentTheme === "dark" ? "light" : "dark";

        saveTheme(nextTheme);
        applyTheme(nextTheme);
    }

    /**
     * Maak centraal de themaknop aan.
     * Daardoor hoeft de knop niet handmatig in iedere HTML te staan.
     */
    function createThemeButton() {
        if (document.getElementById("themeToggle")) return;

        const button = document.createElement("button");

        button.id = "themeToggle";
        button.type = "button";
        button.className = "theme-toggle";
        button.addEventListener("click", toggleTheme);

        /*
         * Op de meeste pagina's staat rechtsboven:
         * .topbar-right-icons
         */
        const topbarActions =
            document.querySelector(".topbar-right-icons");

        if (topbarActions) {
            /*
             * Plaats de knop vóór het speltaklogo.
             */
            const speltakIcon =
                topbarActions.querySelector(".speltak-icon");

            if (speltakIcon) {
                topbarActions.insertBefore(button, speltakIcon);
            } else {
                topbarActions.appendChild(button);
            }

            updateThemeButton(
                document.documentElement.dataset.theme
            );

            return;
        }

        /*
         * Fallback voor pagina's met een andere topbarstructuur.
         */
        const topbar = document.querySelector(".topbar");

        if (topbar) {
            button.classList.add("theme-toggle-fallback");
            topbar.appendChild(button);

            updateThemeButton(
                document.documentElement.dataset.theme
            );
        }
    }

    /*
     * Meteen uitvoeren, nog vóór DOMContentLoaded.
     * Hierdoor wordt de juiste achtergrond vroeg toegepast.
     */
    applyTheme(getPreferredTheme());

    document.addEventListener("DOMContentLoaded", () => {
        createThemeButton();
        applyTheme(getPreferredTheme());

        document.documentElement.classList.add(
            "theme-ready"
        );
    });

    /*
     * Volg de systeeminstelling zolang de gebruiker nog
     * niet zelf een thema heeft gekozen.
     */
    const handleSystemThemeChange = event => {
        if (getSavedTheme()) return;

        applyTheme(event.matches ? "dark" : "light");
    };

    if (typeof systemThemeQuery.addEventListener === "function") {
        systemThemeQuery.addEventListener(
            "change",
            handleSystemThemeChange
        );
    } else if (
        typeof systemThemeQuery.addListener === "function"
    ) {
        systemThemeQuery.addListener(
            handleSystemThemeChange
        );
    }

    /*
     * Eventueel beschikbaar maken voor andere scripts.
     */
    window.OVNTheme = {
        applyTheme,
        toggleTheme,
        getPreferredTheme
    };
})();