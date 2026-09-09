document.addEventListener("DOMContentLoaded", () => {
  const API_URL = window.location.origin;
  const GOOGLE_CLIENT_ID =
    "299926714065-f8aj1skulm7la2aonrj2lk04j6r1lh57.apps.googleusercontent.com";
  const signupForm = document.getElementById("signupForm");
  const usernameInput = document.getElementById("username");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("togglePassword");
  const googleButton = document.getElementById("googleButton");
  const googleButtonContainer = document.getElementById("googleButtonContainer");
  if (!signupForm) {
    console.error("No se encontró #signupForm.");
    return;
  }
  if (passwordInput && togglePassword) {
    togglePassword.addEventListener("click", () => {
      const passwordVisible = passwordInput.type === "text";
      if (passwordVisible) {
        passwordInput.type = "password";
        togglePassword.textContent = "Mostrar";
      } else {
        passwordInput.type = "text";
        togglePassword.textContent = "Ocultar";
      }
    });
  }
  if (googleButtonContainer) {
    let googleInitialized = false;
    let googleInitializing = false;
    async function handleGoogleResponse(response) {
      if (!response || !response.credential) {
        console.error("Google no devolvió una credencial.");
        alert("No se pudo obtener la cuenta de Google.");
        return;
      }
      const originalText = googleButton ? googleButton.textContent : "Google";
      if (googleButton) {
        googleButton.disabled = true;
        googleButton.textContent = "Conectando con Google...";
      }
      try {
        const result = await fetch(`${API_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential, remember: true })
        });
        let data;
        try {
          data = await result.json();
        } catch (jsonError) {
          console.error("Respuesta inválida del servidor:", jsonError);
          data = { success: false, message: "El servidor devolvió una respuesta inválida." };
        }
        if (!result.ok) {
          console.error("Google Auth HTTP error:", result.status, data);
          alert(data.message || "No se pudo iniciar sesión con Google.");
          return;
        }
        if (data.success === true && data.token) {
          localStorage.setItem("komodo_token", data.token);
          if (data.user) {
            localStorage.setItem("komodo_user", JSON.stringify(data.user));
          }
          window.location.href = "/login";
          return;
        }
        alert(data.message || "No se pudo iniciar sesión con Google.");
      } catch (error) {
        console.error("Error Google:", error);
        alert("No se pudo conectar con el servidor de autenticación.");
      } finally {
        if (googleButton) {
          googleButton.disabled = false;
          googleButton.textContent = originalText;
        }
      }
    }
    function initializeGoogle() {
      if (googleInitialized) {
        return true;
      }
      if (googleInitializing) {
        return false;
      }
      if (
        typeof window.google === "undefined" ||
        !window.google.accounts ||
        !window.google.accounts.id
      ) {
        console.log("⏳ Google API no disponible aún, esperando...");
        return false;
      }
      googleInitializing = true;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          cancel_on_tap_outside: false,
          auto_select: false
        });
        window.google.accounts.id.renderButton(googleButtonContainer, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: "100%"
        });
        googleInitialized = true;
        console.log("✅ Google Identity Services inicializado correctamente.");
        console.log("🌐 Origen:", window.location.origin);
        console.log("✅ Botón de Google renderizado correctamente.");
        return true;
      } catch (error) {
        console.error("❌ Error inicializando Google:", error);
        return false;
      } finally {
        googleInitializing = false;
      }
    }
    function waitForGoogle() {
      if (initializeGoogle()) {
        console.log("✅ Google listo para usar");
        return;
      }
      setTimeout(waitForGoogle, 200);
    }
    waitForGoogle();
    if (document.readyState === "complete") {
      waitForGoogle();
    } else {
      window.addEventListener("load", function () {
        console.log("📄 Página completamente cargada");
        waitForGoogle();
      });
    }
    if (googleButton) {
      googleButton.style.display = "none";
    }
  }
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = usernameInput ? usernameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    /*
        ==============================================
        VALIDACIÓN
        ==============================================
        */
    if (!username || !email || !password) {
      alert("Todos los campos son obligatorios.");
      return;
    }
    /*
        ==============================================
        BOTÓN CREAR CUENTA
        ==============================================
        */
    const submitButton = signupForm.querySelector(".create-account-button");
    if (!submitButton) {
      console.error("No se encontró .create-account-button.");
      return;
    }
    const buttonText = submitButton.querySelector("span");
    const originalText = buttonText ? buttonText.textContent : "Crear cuenta";
    submitButton.disabled = true;
    if (buttonText) {
      buttonText.textContent = "Creando cuenta...";
    }
    try {
      const response = await fetch(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username, email: email, password: password })
      });
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error("Respuesta inválida:", jsonError);
        data = { success: false, message: "El servidor devolvió una respuesta inválida." };
      }
      if (!response.ok) {
        alert(data.message || "No se pudo crear la cuenta.");
        return;
      }
      if (data.success === true) {
        alert(data.message || "Cuenta creada correctamente.");
        signupForm.reset();
        window.location.href = "/login";
        return;
      }
      alert(data.message || "No se pudo crear la cuenta.");
    } catch (error) {
      console.error("Error al registrar usuario:", error);
      alert("No se pudo conectar con el servidor de autenticación.");
    } finally {
      submitButton.disabled = false;
      if (buttonText) {
        buttonText.textContent = originalText;
      }
    }
  });
});
