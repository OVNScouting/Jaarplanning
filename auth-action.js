/* ======================================================================
   AUTH-ACTION.JS — EIGEN FIREBASE WACHTWOORDHERSTELPAGINA
   ====================================================================== */

(() => {
  "use strict";

  const $ = id =>
    document.getElementById(id);

  const loading =
    $("actionLoading");

  const resetState =
    $("resetPasswordState");

  const successState =
    $("actionSuccessState");

  const errorState =
    $("actionErrorState");

  const errorText =
    $("actionErrorText");

  const emailElement =
    $("resetAccountEmail");

  const form =
    $("resetPasswordForm");

  const newPassword =
    $("resetNewPassword");

  const confirmPassword =
    $("resetConfirmPassword");

  const message =
    $("resetPasswordMessage");

  const submit =
    $("resetPasswordSubmit");

  let auth = null;
  let actionCode = "";


  function showOnly(element) {
    [
      loading,
      resetState,
      successState,
      errorState
    ].forEach(item => {
      item?.classList.add("hidden");
    });

    element?.classList.remove("hidden");
  }


  function setMessage(text = "") {
    message.textContent = text;

    message.classList.toggle(
      "hidden",
      !text
    );
  }


  function showError(text) {
    errorText.textContent = text;
    showOnly(errorState);
  }


  async function initialise(retries = 200) {
    if (
      !window._firebase ||
      !window.firebaseConfig
    ) {
      if (retries > 0) {
        window.setTimeout(
          () => initialise(retries - 1),
          50
        );

        return;
      }

      showError(
        "De beveiligde verbinding kon niet worden geladen. Probeer het later opnieuw."
      );

      return;
    }

    const params =
      new URLSearchParams(
        window.location.search
      );

    const mode =
      params.get("mode");

    actionCode =
      params.get("oobCode") || "";

    if (
      mode !== "resetPassword" ||
      !actionCode
    ) {
      showError(
        "Deze link bevat geen geldig wachtwoordherstelverzoek."
      );

      return;
    }

    const app =
      window._firebase.getApps().length
        ? window._firebase.getApp()
        : window._firebase.initializeApp(
            window.firebaseConfig
          );

    auth =
      window._firebase.getAuth(app);

    auth.languageCode = "nl";

    try {
      const email =
        await window._firebase
          .verifyPasswordResetCode(
            auth,
            actionCode
          );

      emailElement.textContent = email;

      showOnly(resetState);

      window.OVNPasswordUI?.initialise(
        document
      );

      window.setTimeout(
        () => newPassword.focus(),
        80
      );

    } catch (error) {
      console.error(
        "Herstellink controleren mislukt:",
        error
      );

      showError(
        "De herstellink is ongeldig, al gebruikt of verlopen. Vraag een nieuwe herstelmail aan."
      );
    }
  }


  form?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      setMessage();

      const password =
        newPassword.value;

      const confirmation =
        confirmPassword.value;

      if (password.length < 8) {
        setMessage(
          "Het wachtwoord moet minimaal 8 tekens bevatten."
        );

        newPassword.focus();
        return;
      }

      if (password !== confirmation) {
        setMessage(
          "De twee wachtwoorden komen niet overeen."
        );

        confirmPassword.focus();
        return;
      }

      submit.disabled = true;
      submit.textContent = "Opslaan…";

      try {
        await window._firebase
          .confirmPasswordReset(
            auth,
            actionCode,
            password
          );

        showOnly(successState);

      } catch (error) {
        console.error(
          "Nieuw wachtwoord opslaan mislukt:",
          error
        );

        setMessage(
          error.code === "auth/weak-password"
            ? "Kies een sterker wachtwoord."
            : "Het wachtwoord kon niet worden opgeslagen. Vraag zo nodig een nieuwe herstelmail aan."
        );

        submit.disabled = false;

        submit.textContent =
          "Nieuw wachtwoord opslaan";
      }
    }
  );


  document.addEventListener(
    "DOMContentLoaded",
    initialise
  );
})();