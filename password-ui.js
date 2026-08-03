/* ======================================================================
   PASSWORD-UI.JS — WACHTWOORDVELDEN TONEN/VERBERGEN
   ====================================================================== */

(() => {
  "use strict";

  function updateToggle(button, input) {
    const visible =
      input.type === "text";

    button.textContent = visible
      ? "Verbergen"
      : "Tonen";

    button.setAttribute(
      "aria-pressed",
      String(visible)
    );

    button.setAttribute(
      "aria-label",
      visible
        ? "Wachtwoord verbergen"
        : "Wachtwoord tonen"
    );
  }


  function initialisePasswordToggles(
    root = document
  ) {
    root
      .querySelectorAll("[data-password-toggle]")
      .forEach(button => {
        if (
          button.dataset.passwordToggleReady ===
          "true"
        ) {
          return;
        }

        const targetId =
          button.dataset.passwordToggle;

        const input =
          document.getElementById(targetId);

        if (!input) return;

        button.dataset.passwordToggleReady =
          "true";

        updateToggle(button, input);

        button.addEventListener(
          "click",
          () => {
            const selectionStart =
              input.selectionStart;

            const selectionEnd =
              input.selectionEnd;

            input.type =
              input.type === "password"
                ? "text"
                : "password";

            updateToggle(button, input);

            input.focus();

            if (
              selectionStart !== null &&
              selectionEnd !== null
            ) {
              input.setSelectionRange(
                selectionStart,
                selectionEnd
              );
            }
          }
        );
      });
  }


  document.addEventListener(
    "DOMContentLoaded",
    () => {
      initialisePasswordToggles();
    }
  );


  window.OVNPasswordUI = {
    initialise: initialisePasswordToggles
  };
})();