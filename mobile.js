/* ======================================================================
   OVN Jaarplanning
   Mobile UI v2

   Module 1:
   - mobiele basisdetectie

   Module 2:
   - mobiele topbar
   - uitvouwmenu
   - koppeling met bestaande account- en themaknoppen
   ====================================================================== */

(() => {
    "use strict";


    /* ================================================================
       MOBIELE DETECTIE
    ================================================================ */

    const mobileQuery =
        window.matchMedia(
            "(max-width: 768px)"
        );


    function isMobile() {
        return mobileQuery.matches;
    }


    /* ================================================================
       HULPFUNCTIE: ELEMENT MAKEN
    ================================================================ */

    function createElement(
        tagName,
        {
            id = "",
            className = "",
            text = "",
            attributes = {}
        } = {}
    ) {
        const element =
            document.createElement(tagName);

        if (id) {
            element.id = id;
        }

        if (className) {
            element.className = className;
        }

        if (text) {
            element.textContent = text;
        }

        Object
            .entries(attributes)
            .forEach(([name, value]) => {
                element.setAttribute(
                    name,
                    value
                );
            });

        return element;
    }


    /* ================================================================
       REFERENTIES
    ================================================================ */

    let menuButton = null;
    let menuBackdrop = null;
    let menuSheet = null;
    let menuItems = null;

    let bottomNavigation = null;

    let previouslyFocusedElement = null;


    /* ================================================================
       MENUSTRUCTUUR MAKEN
    ================================================================ */

    function createMobileMenu() {
        if (
            document.getElementById(
                "mobileMenuSheet"
            )
        ) {
            menuSheet =
                document.getElementById(
                    "mobileMenuSheet"
                );

            menuBackdrop =
                document.getElementById(
                    "mobileMenuBackdrop"
                );

            menuItems =
                document.getElementById(
                    "mobileMenuItems"
                );

            return;
        }


        menuBackdrop = createElement(
            "div",
            {
                id: "mobileMenuBackdrop",
                className:
                    "mobile-menu-backdrop",

                attributes: {
                    "aria-hidden": "true"
                }
            }
        );


        menuSheet = createElement(
            "aside",
            {
                id: "mobileMenuSheet",
                className:
                    "mobile-menu-sheet",

                attributes: {
                    role: "dialog",
                    "aria-modal": "true",
                    "aria-hidden": "true",
                    "aria-labelledby":
                        "mobileMenuTitle"
                }
            }
        );


        const handle = createElement(
            "div",
            {
                className:
                    "mobile-menu-handle",

                attributes: {
                    "aria-hidden": "true"
                }
            }
        );


        const header = createElement(
            "div",
            {
                className:
                    "mobile-menu-header"
            }
        );


        const title = createElement(
            "strong",
            {
                id: "mobileMenuTitle",
                text: "Meer opties"
            }
        );


        const closeButton = createElement(
            "button",
            {
                className:
                    "mobile-menu-close",

                text: "×",

                attributes: {
                    type: "button",
                    "aria-label":
                        "Menu sluiten"
                }
            }
        );


        menuItems = createElement(
            "div",
            {
                id: "mobileMenuItems",
                className:
                    "mobile-menu-items"
            }
        );


        header.append(
            title,
            closeButton
        );


        menuSheet.append(
            handle,
            header,
            menuItems
        );


        document.body.append(
            menuBackdrop,
            menuSheet
        );


        closeButton.addEventListener(
            "click",
            closeMobileMenu
        );


        menuBackdrop.addEventListener(
            "click",
            closeMobileMenu
        );


        menuSheet.addEventListener(
            "click",
            event => {
                event.stopPropagation();
            }
        );
    }


    /* ================================================================
       HAMBURGERKNOP MAKEN
    ================================================================ */

    function createMobileMenuButton() {
        const topbarActions =
            document.querySelector(
                ".topbar-right-icons"
            );


        if (!topbarActions) {
            return;
        }


        menuButton =
            document.getElementById(
                "mobileMenuButton"
            );


        if (!menuButton) {
            menuButton = createElement(
                "button",
                {
                    id: "mobileMenuButton",

                    className:
                        "mobile-menu-button",

                    text: "☰",

                    attributes: {
                        type: "button",

                        "aria-label":
                            "Meer opties",

                        "aria-controls":
                            "mobileMenuSheet",

                        "aria-expanded":
                            "false"
                    }
                }
            );


            topbarActions.appendChild(
                menuButton
            );
        }


        menuButton.addEventListener(
            "click",
            openMobileMenu
        );
    }


    /* ================================================================
       BESTAANDE ELEMENT BESCHIKBAAR?
    ================================================================ */

    function elementIsAvailable(
        element
    ) {
        if (!element) {
            return false;
        }


        /*
         * De mobiele CSS verbergt de originele
         * topbarknoppen met display:none.
         *
         * Daarom controleren we niet de berekende
         * displaywaarde, maar uitsluitend of de
         * oorspronkelijke applicatie het element
         * met .hidden heeft verborgen.
         */

        return !element.classList.contains(
            "hidden"
        );
    }


    /* ================================================================
       MENUOPTIE MAKEN
    ================================================================ */

    function createMenuItem({
        label,
        icon,
        href = "",
        onClick = null,
        danger = false
    }) {
        const element = href
            ? createElement(
                "a",
                {
                    className:
                        "mobile-menu-item" +
                        (
                            danger
                                ? " mobile-menu-item-danger"
                                : ""
                        ),

                    attributes: {
                        href
                    }
                }
            )
            : createElement(
                "button",
                {
                    className:
                        "mobile-menu-item" +
                        (
                            danger
                                ? " mobile-menu-item-danger"
                                : ""
                        ),

                    attributes: {
                        type: "button"
                    }
                }
            );


        const iconElement =
            createElement(
                "span",
                {
                    className:
                        "mobile-menu-item-icon",

                    text: icon,

                    attributes: {
                        "aria-hidden": "true"
                    }
                }
            );


        const labelElement =
            createElement(
                "span",
                {
                    className:
                        "mobile-menu-item-label",

                    text: label
                }
            );


        element.append(
            iconElement,
            labelElement
        );


        if (onClick) {
            element.addEventListener(
                "click",
                event => {
                    event.preventDefault();

                    closeMobileMenu();

                    /*
                     * Kort wachten tot de menu-sheet
                     * sluit voordat een modal opent.
                     */

                    window.setTimeout(
                        onClick,
                        50
                    );
                }
            );
        }


        return element;
    }


    /* ================================================================
       BESTAANDE KNOP ACTIVEREN
    ================================================================ */

    function clickOriginalElement(
        element
    ) {
        if (!element) {
            return;
        }

        element.click();
    }


    /* ================================================================
       MENU-INHOUD OPBOUWEN
    ================================================================ */

    function buildMobileMenuItems() {
        if (!menuItems) {
            return;
        }


        menuItems.innerHTML = "";


        const currentPage =
            window.location.pathname
                .split("/")
                .pop()
                .toLowerCase();


        /*
         * Terug naar algemeen overzicht.
         */

        if (
            currentPage !== "index.html" &&
            currentPage !== ""
        ) {
            menuItems.appendChild(
                createMenuItem({
                    label:
                        "Naar overzicht",

                    icon: "⌂",

                    href: "index.html"
                })
            );
        }

        const accountRequestButton =
            findFirstAvailableElement([
                ".floating-account",
                "#openAccountRequestModal",
                "#openAccountModalBtn"
            ]);


        if (accountRequestButton) {
            menuItems.appendChild(
                createMenuItem({
                    label: "Account aanvragen",
                    icon: "＋",

                    onClick: () => {
                        clickOriginalElement(
                            accountRequestButton
                        );
                    }
                })
            );
        }
        const problemButton =
            findFirstAvailableElement([
                "#openBugModalBtn",
                ".bug-fab"
            ]);


        if (problemButton) {
            menuItems.appendChild(
                createMenuItem({
                    label:
                        "Probleem of idee melden",

                    icon: "💬",

                    onClick: () => {
                        clickOriginalElement(
                            problemButton
                        );
                    }
                })
            );
        }
        /*
         * Mijn profiel.
         */

        const profileLink =
            document.querySelector(
                '.topbar-right-icons a[href="profile.html"]'
            );


        if (
            currentPage !== "profile.html" &&
            elementIsAvailable(profileLink)
        ) {
            menuItems.appendChild(
                createMenuItem({
                    label:
                        "Mijn profiel",

                    icon: "👤",

                    href: "profile.html"
                })
            );
        }


        /*
         * Thema.
         *
         * generaltheme.js maakt #themeToggle
         * dynamisch aan.
         */

        const themeButton =
            document.getElementById(
                "themeToggle"
            );


        if (themeButton) {
            const isDark =
                document
                    .documentElement
                    .dataset
                    .theme === "dark";


            menuItems.appendChild(
                createMenuItem({
                    label:
                        isDark
                            ? "Licht thema"
                            : "Donker thema",

                    icon:
                        isDark
                            ? "☀️"
                            : "🌙",

                    onClick: () => {
                        clickOriginalElement(
                            themeButton
                        );
                    }
                })
            );
        }


        /*
         * Inloggen.
         */

        const loginButton =
            document.getElementById(
                "loginButton"
            );


        if (
            elementIsAvailable(loginButton)
        ) {
            menuItems.appendChild(
                createMenuItem({
                    label: "Inloggen",
                    icon: "↪",

                    onClick: () => {
                        clickOriginalElement(
                            loginButton
                        );
                    }
                })
            );
        }


        /*
         * Uitloggen.
         *
         * Profiel gebruikt #btnLogout.
         * Andere pagina's gebruiken #logoutButton.
         */

        const logoutButton =
            document.getElementById(
                "logoutButton"
            ) ||
            document.getElementById(
                "btnLogout"
            );


        if (
            elementIsAvailable(logoutButton)
        ) {
            menuItems.appendChild(
                createMenuItem({
                    label: "Uitloggen",
                    icon: "↩",
                    danger: true,

                    onClick: () => {
                        clickOriginalElement(
                            logoutButton
                        );
                    }
                })
            );
        }


        /*
         * Fallback wanneer geen opties bestaan.
         */

        if (!menuItems.children.length) {
            const message =
                createElement(
                    "p",
                    {
                        className:
                            "text-muted",

                        text:
                            "Er zijn momenteel geen extra opties."
                    }
                );


            menuItems.appendChild(
                message
            );
        }
    }

    /* ================================================================
       MODULE 3
       MOBIELE ONDERNAVIGATIE
    ================================================================ */


    /* ================================================================
       HUIDIGE PAGINA BEPALEN
    ================================================================ */

    function getCurrentPage() {
        const fileName =
            window.location.pathname
                .split("/")
                .pop()
                .toLowerCase();

        return fileName || "index.html";
    }


    /* ================================================================
       MOBIELE NAVIGATIE AANMAKEN
    ================================================================ */

    function createMobileBottomNavigation() {
        bottomNavigation =
            document.getElementById(
                "mobileBottomNavigation"
            );


        if (!bottomNavigation) {
            bottomNavigation =
                createElement(
                    "nav",
                    {
                        id:
                            "mobileBottomNavigation",

                        className:
                            "mobile-bottom-nav",

                        attributes: {
                            "aria-label":
                                "Mobiele navigatie"
                        }
                    }
                );


            document.body.appendChild(
                bottomNavigation
            );
        }


        buildMobileBottomNavigation();
    }


    /* ================================================================
       NAVIGATIE-ITEM MAKEN
    ================================================================ */

    function createBottomNavigationItem({
        label,
        icon,
        href = "",
        onClick = null,
        primary = false,
        current = false
    }) {
        const classNames = [
            "mobile-bottom-nav-item"
        ];


        if (primary) {
            classNames.push(
                "is-primary"
            );
        }


        if (current) {
            classNames.push(
                "is-current"
            );
        }


        const element = href
            ? createElement(
                "a",
                {
                    className:
                        classNames.join(" "),

                    attributes: {
                        href
                    }
                }
            )
            : createElement(
                "button",
                {
                    className:
                        classNames.join(" "),

                    attributes: {
                        type: "button"
                    }
                }
            );


        const iconElement =
            createElement(
                "span",
                {
                    className:
                        "mobile-bottom-nav-icon",

                    text: icon,

                    attributes: {
                        "aria-hidden": "true"
                    }
                }
            );


        const labelElement =
            createElement(
                "span",
                {
                    className:
                        "mobile-bottom-nav-label",

                    text: label
                }
            );


        element.append(
            iconElement,
            labelElement
        );


        if (onClick) {
            element.addEventListener(
                "click",
                event => {
                    event.preventDefault();

                    onClick();
                }
            );
        }


        return element;
    }


    /* ================================================================
       SOEPEL NAAR ONDERDEEL SCROLLEN
    ================================================================ */

    function scrollToPageSection(
        selector
    ) {
        const target =
            document.querySelector(
                selector
            );


        if (!target) {
            return;
        }


        target.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }


    /* ================================================================
       BESTAANDE ACTIEKNOP ZOEKEN
    ================================================================ */

    function findFirstAvailableElement(
        selectors
    ) {
        for (const selector of selectors) {
            const element =
                document.querySelector(
                    selector
                );


            if (
                elementIsAvailable(
                    element
                )
            ) {
                return element;
            }
        }


        return null;
    }


    /* ================================================================
       ONDERNAVIGATIE OPBOUWEN
    ================================================================ */

    function buildMobileBottomNavigation() {
        if (!bottomNavigation) {
            return;
        }


        bottomNavigation.innerHTML = "";

        const currentPage =
            getCurrentPage();

        const loginButton =
            document.getElementById(
                "loginButton"
            );

        const logoutButton =
            document.getElementById(
                "logoutButton"
            ) ||
            document.getElementById(
                "btnLogout"
            );

        const isLoggedIn =
            elementIsAvailable(
                logoutButton
            ) &&
            !elementIsAvailable(
                loginButton
            );


        /*
         * Uitgelogde bezoekers krijgen geen
         * mobiele ondernavigatie.
         */

        if (!isLoggedIn) {
            bottomNavigation.classList.add(
                "hidden"
            );

            return;
        }


        bottomNavigation.classList.remove(
            "hidden"
        );

        const isSpeltakPage = [
            "bevers.html",
            "welpen.html",
            "scouts.html",
            "explorers.html",
            "rovers.html",
            "stam.html"
        ].includes(currentPage);


        const isBestuurPage =
            currentPage === "bestuur.html";


        /*
         * Actie 1:
         * Planning of overzicht.
         */

        if (
            isSpeltakPage ||
            isBestuurPage
        ) {
            bottomNavigation.appendChild(
                createBottomNavigationItem({
                    label: "Planning",
                    icon: "▤",
                    current: true,

                    onClick: () => {
                        scrollToPageSection(
                            ".planning-section"
                        );
                    }
                })
            );
        } else {
            bottomNavigation.appendChild(
                createBottomNavigationItem({
                    label: "Overzicht",
                    icon: "⌂",
                    current:
                        currentPage ===
                        "index.html",

                    href: "index.html"
                })
            );
        }


        /*
         * Actie 2:
         * Ledenbeheer wanneer beschikbaar.
         * Anders Account aanvragen.
         */

        const ledenbeheerButton =
            findFirstAvailableElement([
                "#openLedenbeheerButton",
                '.leiding-sidebar button[onclick*="leden"]',
                '.leiding-sidebar a[href*="leden"]'
            ]);


        if (ledenbeheerButton) {
            bottomNavigation.appendChild(
                createBottomNavigationItem({
                    label: "Leden",
                    icon: "👥",

                    onClick: () => {
                        clickOriginalElement(
                            ledenbeheerButton
                        );
                    }
                })
            );
        }


        /*
         * Actie 3:
         * Nieuwe opkomst / bestuursitem.
         * Wanneer niet beschikbaar: probleem melden.
         */

        const addItemButton =
            findFirstAvailableElement([
                "#fabAddOpkomst",
                "#fabAddBestuursItem",
                ".fab-add-opkomst"
            ]);


        if (addItemButton) {
            bottomNavigation.appendChild(
                createBottomNavigationItem({
                    label:
                        isBestuurPage
                            ? "Nieuw item"
                            : "Opkomst",

                    icon: "＋",
                    primary: true,

                    onClick: () => {
                        clickOriginalElement(
                            addItemButton
                        );
                    }
                })
            );
        }


        /*
         * Actie 4:
         * Uitgebreid menu.
         */

        bottomNavigation.appendChild(
            createBottomNavigationItem({
                label: "Meer",
                icon: "•••",

                onClick: () => {
                    openMobileMenu();
                }
            })
        );
    }
    /* ================================================================
       MENU OPENEN
    ================================================================ */

    function openMobileMenu() {
        if (!isMobile()) {
            return;
        }


        buildMobileMenuItems();


        previouslyFocusedElement =
            document.activeElement;


        menuBackdrop.classList.add(
            "is-open"
        );


        menuSheet.classList.add(
            "is-open"
        );


        menuBackdrop.setAttribute(
            "aria-hidden",
            "false"
        );


        menuSheet.setAttribute(
            "aria-hidden",
            "false"
        );


        menuButton?.setAttribute(
            "aria-expanded",
            "true"
        );


        document.body.classList.add(
            "mobile-menu-open"
        );


        requestAnimationFrame(() => {
            menuSheet
                .querySelector(
                    "button, a[href]"
                )
                ?.focus();
        });
    }


    /* ================================================================
       MENU SLUITEN
    ================================================================ */

    function closeMobileMenu() {
        if (!menuSheet) {
            return;
        }


        menuBackdrop.classList.remove(
            "is-open"
        );


        menuSheet.classList.remove(
            "is-open"
        );


        menuBackdrop.setAttribute(
            "aria-hidden",
            "true"
        );


        menuSheet.setAttribute(
            "aria-hidden",
            "true"
        );


        menuButton?.setAttribute(
            "aria-expanded",
            "false"
        );


        document.body.classList.remove(
            "mobile-menu-open"
        );


        if (
            previouslyFocusedElement &&
            typeof
            previouslyFocusedElement
                .focus === "function"
        ) {
            previouslyFocusedElement.focus();
        }
    }


    /* ================================================================
       AUTH-WIJZIGINGEN VOLGEN
    ================================================================ */

    function observeTopbarChanges() {
        const topbar =
            document.querySelector(
                ".topbar"
            );


        if (!topbar) {
            return;
        }


        const observer =
            new MutationObserver(() => {
                /*
                 * Alleen opnieuw opbouwen wanneer
                 * het menu momenteel open staat.
                 */

                if (
                    menuSheet?.classList.contains(
                        "is-open"
                    )
                ) {
                    buildMobileMenuItems();
                }


                /*
                 * Bij inloggen of uitloggen kunnen
                 * Ledenbeheer en Nieuwe opkomst
                 * zichtbaar of verborgen worden.
                 */

                buildMobileBottomNavigation();
                initMobileLegends();
            });


        observer.observe(
            topbar,
            {
                subtree: true,

                attributes: true,

                attributeFilter: [
                    "class",
                    "style"
                ]
            }
        );
    }


    /* ================================================================
       ESCAPE
    ================================================================ */

    function handleKeyDown(event) {
        if (
            event.key === "Escape" &&
            menuSheet?.classList.contains(
                "is-open"
            )
        ) {
            closeMobileMenu();
        }
    }


    /* ================================================================
       BREAKPOINTWIJZIGING
    ================================================================ */

   function handleMobileChange() {
    if (!isMobile()) {
        closeMobileMenu();


        /*
         * Mobiele legendaknoppen verwijderen wanneer
         * het scherm naar desktopformaat gaat.
         */

        document
            .querySelectorAll(
                ".mobile-legend-toggle"
            )
            .forEach(
                button =>
                    button.remove()
            );


        document
            .querySelectorAll(
                ".planning-header-right.mobile-legend-open"
            )
            .forEach(
                container =>
                    container.classList.remove(
                        "mobile-legend-open"
                    )
            );

        return;
    }


    /*
     * Bij terugschakelen naar mobiel de knoppen
     * opnieuw toevoegen.
     */

    initMobileLegends();
}

    /* ================================================================
       MODULE 4
       INKLAPBARE MOBIELE LEGENDA
    ================================================================ */


    /* ================================================================
       LEGENDAKNOP AANMAKEN
    ================================================================ */

  function createMobileLegendToggle(
    planningHeaderRight
) {
    if (!planningHeaderRight) {
        return;
    }


    /*
     * Deze knop bestaat uitsluitend in de mobiele UI.
     */

    if (!isMobile()) {
        planningHeaderRight
            .querySelector(
                ".mobile-legend-toggle"
            )
            ?.remove();

        planningHeaderRight.classList.remove(
            "mobile-legend-open"
        );

        return;
    }


        const legendContainer =
            planningHeaderRight.querySelector(
                ".legend-container"
            );


        if (!legendContainer) {
            return;
        }


        /*
         * Voorkom dat dezelfde knop meerdere
         * keren wordt aangemaakt.
         */

        if (
            planningHeaderRight.querySelector(
                ".mobile-legend-toggle"
            )
        ) {
            return;
        }


        const toggleButton =
            createElement(
                "button",
                {
                    className:
                        "mobile-legend-toggle",

                    text:
                        "Legenda tonen",

                    attributes: {
                        type: "button",

                        "aria-expanded":
                            "false",

                        "aria-label":
                            "Legenda van opkomstkleuren tonen"
                    }
                }
            );


        /*
         * Plaats de knop vóór de bewerkknop.
         */

        const editButton =
            planningHeaderRight.querySelector(
                ".tabel-edit-btn, " +
                ".primary-tabel-edit-btn, " +
                "#editModeButton"
            );


        planningHeaderRight.insertBefore(
            toggleButton,
            editButton || legendContainer
        );


        toggleButton.addEventListener(
            "click",
            () => {
                const isOpen =
                    planningHeaderRight
                        .classList
                        .toggle(
                            "mobile-legend-open"
                        );


                toggleButton.textContent =
                    isOpen
                        ? "Legenda verbergen"
                        : "Legenda tonen";


                toggleButton.setAttribute(
                    "aria-expanded",
                    String(isOpen)
                );


                toggleButton.setAttribute(
                    "aria-label",
                    isOpen
                        ? "Legenda van opkomstkleuren verbergen"
                        : "Legenda van opkomstkleuren tonen"
                );
            }
        );
    }


    /* ================================================================
       ALLE PLANNINGHEADERS CONTROLEREN
    ================================================================ */

    function initMobileLegends() {
        document
            .querySelectorAll(
                ".planning-header-right"
            )
            .forEach(
                createMobileLegendToggle
            );
    }

    /* ================================================================
       MODULE 5B
       MOBIELE TABELSCROLL EN VEEGHINT
    ================================================================ */


    /*
     * Houdt bij welke wrappers al zijn ingesteld.
     * Zo krijgen dynamisch opnieuw gerenderde tabellen
     * geen dubbele listeners of meldingen.
     */

    const enhancedMobileTableWrappers =
        new WeakSet();


    /* ================================================================
       CONTROLEREN OF EEN TABEL ZIJWAARTS KAN SCROLLEN
    ================================================================ */

    function tableWrapperHasOverflow(
        wrapper
    ) {
        return (
            wrapper.scrollWidth >
            wrapper.clientWidth + 4
        );
    }


    /* ================================================================
       CONTROLEREN OF DE TABEL AAN HET EINDE STAAT
    ================================================================ */

    function updateMobileTableEdgeState(
        wrapper
    ) {
        const remainingScroll =
            wrapper.scrollWidth
            -
            wrapper.clientWidth
            -
            wrapper.scrollLeft;


        wrapper.classList.toggle(
            "mobile-scrolled-end",
            remainingScroll <= 4
        );
    }


  

    /* ================================================================
       ÉÉN TABELWRAPPER INSTELLEN
    ================================================================ */

    function enhanceMobileTableWrapper(
        wrapper
    ) {
        if (
            !wrapper ||
            enhancedMobileTableWrappers.has(
                wrapper
            )
        ) {
            return;
        }


        const planningTable =
            wrapper.querySelector(
                ".planning-table"
            );


        if (!planningTable) {
            return;
        }


        enhancedMobileTableWrappers.add(
            wrapper
        );


      const updateOverflowState = () => {
    const hasOverflow =
        tableWrapperHasOverflow(
            wrapper
        );


    /*
     * Alleen nog gebruiken voor de subtiele
     * schaduw aan de rechterkant.
     */
    wrapper.classList.toggle(
        "mobile-has-overflow",
        hasOverflow
    );


    updateMobileTableEdgeState(
        wrapper
    );
};

        /*
         * Bij scrollen de rechterrand bijwerken en
         * de instructie laten verdwijnen.
         */

   wrapper.addEventListener(
    "scroll",
    () => {
        updateMobileTableEdgeState(
            wrapper
        );
    },
    {
        passive: true
    }
);




        requestAnimationFrame(
            updateOverflowState
        );


        /*
         * Reageer op schermrotatie of veranderende
         * tabelbreedte.
         */

        if (
            "ResizeObserver" in window
        ) {
            const resizeObserver =
                new ResizeObserver(
                    updateOverflowState
                );


            resizeObserver.observe(
                wrapper
            );


            resizeObserver.observe(
                planningTable
            );
        }
    }


    /* ================================================================
       ALLE BESTAANDE TABELWRAPPERS INSTELLEN
    ================================================================ */

    function initMobileTableScrolling() {
        document
            .querySelectorAll(
                ".table-wrapper"
            )
            .forEach(
                enhanceMobileTableWrapper
            );
    }


    /* ================================================================
       DYNAMISCH GERENDERDE TABELLEN VOLGEN
    ================================================================ */

    function observeMobileTables() {
        const observer =
            new MutationObserver(
                () => {
                    initMobileTableScrolling();
                }
            );


        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );
    }
    /* ================================================================
       INITIALISATIE
    ================================================================ */
    function initMobileUI() {
        const currentPage =
            getCurrentPage()
                .replace(".html", "");

        document.body.dataset.mobilePage =
            currentPage;


        document.documentElement.classList.add(
            "mobile-ui-ready"
        );


        createMobileMenu();
        createMobileMenuButton();
        createMobileBottomNavigation();
        initMobileLegends();
        initMobileTableScrolling();
        observeMobileTables();
        observeTopbarChanges();


        document.addEventListener(
            "keydown",
            handleKeyDown
        );


        if (
            typeof
            mobileQuery
                .addEventListener ===
            "function"
        ) {
            mobileQuery.addEventListener(
                "change",
                handleMobileChange
            );
        } else {
            mobileQuery.addListener(
                handleMobileChange
            );
        }
    }


    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initMobileUI,
            {
                once: true
            }
        );
    } else {
        initMobileUI();
    }

})();