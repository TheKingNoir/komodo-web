document.addEventListener("DOMContentLoaded", () => {
  const API_URL = window.location.origin;
  const GOOGLE_CLIENT_ID =
    "299926714065-f8aj1skulm7la2aonrj2lk04j6r1lh57.apps.googleusercontent.com";
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const rememberInput = document.getElementById("remember");
  const togglePassword = document.getElementById("togglePassword");
  const forgotPassword = document.getElementById("forgotPassword");
  const googleButton = document.getElementById("googleButton");
  const googleButtonContainer = document.getElementById("googleButtonContainer");
  const loginButton = document.getElementById("loginButton");
  if (!loginForm) {
    console.error("No se encontró #loginForm.");
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
  if (forgotPassword) {
    forgotPassword.addEventListener("click", (event) => {
      event.preventDefault();
      alert("La recuperación de contraseña estará disponible próximamente.");
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
          const storage = localStorage;
          storage.setItem("komodo_auth_token", data.token);
          if (data.user) {
            storage.setItem("komodo_user", JSON.stringify(data.user));
          }
          if (data.expiresAt) {
            storage.setItem("komodo_session_expires", String(data.expiresAt));
          }
          window.location.href = "../dashboard/index.html";
          return;
        }
        alert(data.message || "No se pudo iniciar sesión con Google.");
      } catch (error) {
        console.error("Error Google:", error);
        alert("No se pudo conectar con el servidor de autenticación.");
      } finally {
        if (googleButton) {
          googleButton.disabled = false;
          googleButton.textContent = "Iniciar sesión con Google";
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
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const remember = rememberInput ? rememberInput.checked : false;
    if (!email || !password) {
      alert("El correo electrónico y la contraseña son obligatorios.");
      return;
    }
    const buttonText = loginButton ? loginButton.querySelector("span") : null;
    const originalText = buttonText ? buttonText.textContent : "Iniciar sesión";
    if (loginButton) {
      loginButton.disabled = true;
    }
    if (buttonText) {
      buttonText.textContent = "Iniciando sesión...";
    }
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password, remember: remember })
      });
      let data;
      try {
        data = await response.json();
      } catch {
        data = { success: false, message: "El servidor devolvió una respuesta inválida." };
      }
      if (!response.ok) {
        alert(data.message || "No se pudo iniciar sesión.");
        return;
      }
      if (data.success === true && data.token) {
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem("komodo_auth_token", data.token);
        if (data.user) {
          storage.setItem("komodo_user", JSON.stringify(data.user));
        }
        if (data.expiresAt) {
          storage.setItem("komodo_session_expires", String(data.expiresAt));
        }
        window.location.href = "../dashboard/index.html";
        return;
      }
      alert(data.message || "No se pudo iniciar sesión.");
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      alert("No se pudo conectar con el servidor de autenticación.");
    } finally {
      if (loginButton) {
        loginButton.disabled = false;
      }
      if (buttonText) {
        buttonText.textContent = originalText;
      }
    }
  });
});
