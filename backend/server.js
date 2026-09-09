const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { OAuth2Client } = require("google-auth-library");
const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const NON_REMEMBERED_SESSION_DURATION = 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const GOOGLE_CLIENT_ID = "299926714065-f8aj1skulm7la2aonrj2lk04j6r1lh57.apps.googleusercontent.com";
app.set("trust proxy", 1);
const databaseDirectory = path.join(__dirname, "database");
const databasePath = path.join(databaseDirectory, "komodo.db");
if (!fs.existsSync(databaseDirectory)) {
  fs.mkdirSync(databaseDirectory, { recursive: true });
}
const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.prepare(
  `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at DATETIME
            DEFAULT CURRENT_TIMESTAMP
    )
`
).run();
function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((item) => item.name === column);
  if (!exists) {
    db.prepare(
      `ALTER TABLE ${table}
             ADD COLUMN ${column}
             ${definition}`
    ).run();
  }
}
addColumnIfMissing("users", "auth_provider", "TEXT NOT NULL DEFAULT 'local'");
addColumnIfMissing("users", "google_id", "TEXT");
db.prepare(
  `
    CREATE UNIQUE INDEX IF NOT EXISTS
    idx_users_google_id
    ON users(google_id)
    WHERE google_id IS NOT NULL
`
).run();
db.prepare(
  `
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    )
`
).run();
db.prepare(
  `
    CREATE INDEX IF NOT EXISTS
    idx_sessions_expires_at
    ON sessions(expires_at)
`
).run();
db.prepare(
  `
    CREATE INDEX IF NOT EXISTS
    idx_sessions_user_id
    ON sessions(user_id)
`
).run();
function cleanExpiredSessions() {
  db.prepare(
    `
        DELETE FROM sessions
        WHERE expires_at <= ?
    `
  ).run(Date.now());
}
function generateSessionToken() {
  return crypto.randomBytes(48).toString("hex");
}
function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
const rateLimitStore = new Map();
function checkRateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const existing = rateLimitStore.get(key);
  if (!existing) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (now >= existing.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= maxAttempts) {
    return false;
  }
  existing.count++;
  return true;
}
function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}
const allowedOrigins = [
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://komodo-host.site",
  "https://www.komodo-host.site"
];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (origin === "null") {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn(`[CORS] Origen bloqueado: ${origin}`);
      return callback(new Error("Origen no permitido por CORS."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204
  })
);
app.use(express.static(path.join(__dirname, "..")));
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "auth", "login.html"));
});
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "auth", "signup.html"));
});
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dashboard", "index.html"));
});
app.use(express.json({ limit: "100kb" }));
app.get("/", (req, res) => {
  res.json({
    success: true,
    status: "online",
    message: "Komodo Hosting Auth Backend",
    version: "3.0.0",
    database: "SQLite",
    authentication: "sessions",
    session_duration: "30 days",
    google_oauth: GOOGLE_CLIENT_ID ? "enabled" : "not configured",
    pterodactyl: "not integrated"
  });
});
app.get("/api/status", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({
      success: true,
      status: "online",
      service: "authentication",
      database: "connected",
      sessions: "active",
      session_duration: "30 days",
      google_oauth: GOOGLE_CLIENT_ID ? "enabled" : "not configured"
    });
  } catch (error) {
    console.error("Status error:", error);
    res.status(500).json({ success: false, status: "degraded", database: "error" });
  }
});
function createSession(userId, remember) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const createdAt = Date.now();
  const sessionDuration = remember === true ? SESSION_DURATION : NON_REMEMBERED_SESSION_DURATION;
  const expiresAt = createdAt + sessionDuration;
  db.prepare(
    `
        INSERT INTO sessions (
            user_id,
            token,
            expires_at,
            created_at
        )
        VALUES (?, ?, ?, ?)
    `
  ).run(userId, tokenHash, expiresAt, createdAt);
  return { token, expiresAt };
}
app.post("/api/auth/signup", async (req, res) => {
  try {
    const ip = getClientIp(req);
    if (!checkRateLimit(`signup:${ip}`, 10, 15 * 60 * 1000)) {
      return res
        .status(429)
        .json({ success: false, message: "Demasiados intentos. Inténtalo nuevamente más tarde." });
    }
    const { username, email, password } = req.body;
    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Todos los campos son obligatorios." });
    }
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res
        .status(400)
        .json({
          success: false,
          message: "El nombre de usuario debe tener al menos 3 caracteres."
        });
    }
    if (cleanUsername.length > 32) {
      return res
        .status(400)
        .json({
          success: false,
          message: "El nombre de usuario no puede superar los 32 caracteres."
        });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "El nombre de usuario contiene caracteres no permitidos."
        });
    }
    if (!isValidEmail(cleanEmail)) {
      return res
        .status(400)
        .json({ success: false, message: "El correo electrónico no es válido." });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ success: false, message: "La contraseña debe tener al menos 8 caracteres." });
    }
    if (password.length > 128) {
      return res.status(400).json({ success: false, message: "La contraseña es demasiado larga." });
    }
    const existingUsername = db
      .prepare(
        `
                    SELECT id
                    FROM users
                    WHERE username = ?
                    LIMIT 1
                `
      )
      .get(cleanUsername);
    if (existingUsername) {
      return res
        .status(409)
        .json({ success: false, message: "Ese nombre de usuario ya está registrado." });
    }
    const existingEmail = db
      .prepare(
        `
                    SELECT id
                    FROM users
                    WHERE email = ?
                    LIMIT 1
                `
      )
      .get(cleanEmail);
    if (existingEmail) {
      return res
        .status(409)
        .json({ success: false, message: "Ese correo electrónico ya está registrado." });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db
      .prepare(
        `
                    INSERT INTO users (
                        username,
                        email,
                        password,
                        auth_provider
                    )
                    VALUES (
                        ?,
                        ?,
                        ?,
                        'local'
                    )
                `
      )
      .run(cleanUsername, cleanEmail, passwordHash);
    return res
      .status(201)
      .json({
        success: true,
        message: "Cuenta creada correctamente.",
        user: {
          id: result.lastInsertRowid,
          username: cleanUsername,
          email: cleanEmail,
          auth_provider: "local"
        }
      });
  } catch (error) {
    console.error("Signup error:", error);
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res
        .status(409)
        .json({ success: false, message: "El usuario o correo electrónico ya está registrado." });
    }
    return res
      .status(500)
      .json({ success: false, message: "Ocurrió un error interno del servidor." });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    cleanExpiredSessions();
    const ip = getClientIp(req);
    const emailForRateLimit =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!checkRateLimit(`login:${ip}:${emailForRateLimit}`, 10, 15 * 60 * 1000)) {
      return res
        .status(429)
        .json({
          success: false,
          message: "Demasiados intentos de inicio de sesión. Inténtalo nuevamente más tarde."
        });
    }
    /*
            DATOS
            */
    const { email, password, remember } = req.body;
    /*
            VALIDACIÓN
            */
    if (typeof email !== "string" || typeof password !== "string") {
      return res
        .status(400)
        .json({
          success: false,
          message: "El correo electrónico y la contraseña son obligatorios."
        });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = db
      .prepare(
        `
                    SELECT
                        id,
                        username,
                        email,
                        password,
                        created_at,
                        auth_provider,
                        google_id
                    FROM users
                    WHERE email = ?
                    LIMIT 1
                `
      )
      .get(cleanEmail);
    if (!user) {
      return res.status(401).json({ success: false, message: "Correo o contraseña incorrectos." });
    }
    if (user.auth_provider === "google") {
      return res
        .status(401)
        .json({ success: false, message: "Esta cuenta utiliza Google para iniciar sesión." });
    }
    const passwordCorrect = await bcrypt.compare(password, user.password);
    if (!passwordCorrect) {
      return res.status(401).json({ success: false, message: "Correo o contraseña incorrectos." });
    }
    const session = createSession(user.id, remember);
    return res
      .status(200)
      .json({
        success: true,
        message: "Inicio de sesión correcto.",
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          created_at: user.created_at,
          auth_provider: user.auth_provider || "local"
        }
      });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Ocurrió un error interno del servidor." });
  }
});
app.post("/api/auth/google", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res
        .status(503)
        .json({ success: false, message: "Google Sign-In no está configurado en el servidor." });
    }
    const ip = getClientIp(req);
    if (!checkRateLimit(`google:${ip}`, 10, 15 * 60 * 1000)) {
      return res
        .status(429)
        .json({ success: false, message: "Demasiados intentos. Inténtalo nuevamente más tarde." });
    }
    const { credential, remember } = req.body;
    if (typeof credential !== "string" || credential.length < 20) {
      return res.status(400).json({ success: false, message: "Credencial de Google inválida." });
    }
    const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload) {
      return res
        .status(401)
        .json({ success: false, message: "No se pudo verificar la cuenta de Google." });
    }
    const googleId = payload.sub;
    const googleEmail = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const emailVerified = payload.email_verified === true;
    const googleName = typeof payload.name === "string" ? payload.name.trim() : "";
    /*
            VALIDACIONES
            */
    if (!googleId || !googleEmail) {
      return res
        .status(401)
        .json({ success: false, message: "La cuenta de Google no contiene información válida." });
    }
    if (!emailVerified) {
      return res
        .status(401)
        .json({ success: false, message: "El correo de Google no está verificado." });
    }
    /*
            BUSCAR POR GOOGLE ID
            */
    let user = db
      .prepare(
        `
                    SELECT
                        id,
                        username,
                        email,
                        password,
                        created_at,
                        auth_provider,
                        google_id
                    FROM users
                    WHERE google_id = ?
                    LIMIT 1
                `
      )
      .get(googleId);
    /*
            CUENTA GOOGLE EXISTENTE
            */
    if (user) {
      /*
                Verificación adicional.
                Si la cuenta existe como Google,
                el email debe coincidir con el
                email verificado actualmente.
                */
      if (user.email !== googleEmail) {
        return res
          .status(401)
          .json({ success: false, message: "La información de la cuenta de Google no coincide." });
      }
    } else {
      /*
                BUSCAR POR EMAIL.
                NO vinculamos automáticamente
                una cuenta local existente.
                Esto evita convertir un login
                Google en una vinculación silenciosa.
                */
      const existingEmail = db
        .prepare(
          `
                        SELECT
                            id,
                            username,
                            email,
                            auth_provider
                        FROM users
                        WHERE email = ?
                        LIMIT 1
                    `
        )
        .get(googleEmail);
      if (existingEmail) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Ya existe una cuenta con este correo. Inicia sesión con tu contraseña para vincular Google."
          });
      }
      /*
                GENERAR USERNAME.
                Primero usamos el nombre de Google
                sanitizado.
                Si no es válido, usamos la parte
                anterior al @.
                */
      let baseUsername = googleName.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 24);
      if (baseUsername.length < 3) {
        baseUsername = googleEmail
          .split("@")[0]
          .replace(/[^a-zA-Z0-9_.-]/g, "")
          .slice(0, 24);
      }
      if (baseUsername.length < 3) {
        baseUsername = "user";
      }
      let username = baseUsername;
      let suffix = 1;
      while (
        db
          .prepare(
            `
                        SELECT id
                        FROM users
                        WHERE username = ?
                        LIMIT 1
                    `
          )
          .get(username)
      ) {
        username = `${baseUsername}${suffix}`;
        suffix++;
        if (suffix > 999999) {
          throw new Error("No se pudo generar un nombre de usuario único.");
        }
      }
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);
      const result = db
        .prepare(
          `
                        INSERT INTO users (
                            username,
                            email,
                            password,
                            auth_provider,
                            google_id
                        )
                        VALUES (
                            ?,
                            ?,
                            ?,
                            'google',
                            ?
                        )
                    `
        )
        .run(username, googleEmail, passwordHash, googleId);
      user = db
        .prepare(
          `
                        SELECT
                            id,
                            username,
                            email,
                            password,
                            created_at,
                            auth_provider,
                            google_id
                        FROM users
                        WHERE id = ?
                        LIMIT 1
                    `
        )
        .get(result.lastInsertRowid);
    }
    const session = createSession(user.id, remember);
    return res
      .status(200)
      .json({
        success: true,
        message: "Inicio de sesión con Google correcto.",
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          created_at: user.created_at,
          auth_provider: "google"
        }
      });
  } catch (error) {
    console.error("Google authentication error:", error);
    return res
      .status(401)
      .json({ success: false, message: "No se pudo verificar la cuenta de Google." });
  }
});
function authenticate(req, res, next) {
  try {
    cleanExpiredSessions();
    const authorization = req.headers.authorization;
    if (!authorization) {
      return res
        .status(401)
        .json({ success: false, authenticated: false, message: "No estás autenticado." });
    }
    if (!authorization.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({
          success: false,
          authenticated: false,
          message: "Token de autenticación inválido."
        });
    }
    const token = authorization.slice(7).trim();
    if (!token || token.length < 32) {
      return res
        .status(401)
        .json({
          success: false,
          authenticated: false,
          message: "Token de autenticación inválido."
        });
    }
    const tokenHash = hashSessionToken(token);
    const session = db
      .prepare(
        `
                SELECT
                    sessions.id
                        AS session_id,
                    sessions.user_id,
                    sessions.expires_at,
                    users.username,
                    users.email,
                    users.created_at,
                    users.auth_provider
                FROM sessions
                INNER JOIN users
                    ON users.id =
                       sessions.user_id
                WHERE sessions.token = ?
                LIMIT 1
            `
      )
      .get(tokenHash);
    if (!session) {
      return res
        .status(401)
        .json({ success: false, authenticated: false, message: "La sesión no es válida." });
    }
    if (session.expires_at <= Date.now()) {
      db.prepare(
        `
                DELETE FROM sessions
                WHERE id = ?
            `
      ).run(session.session_id);
      return res
        .status(401)
        .json({ success: false, authenticated: false, message: "La sesión ha expirado." });
    }
    req.user = {
      id: session.user_id,
      username: session.username,
      email: session.email,
      created_at: session.created_at,
      auth_provider: session.auth_provider || "local"
    };
    req.session = { id: session.session_id, expires_at: session.expires_at };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res
      .status(500)
      .json({ success: false, authenticated: false, message: "Error interno de autenticación." });
  }
}
app.get("/api/auth/me", authenticate, (req, res) => {
  return res
    .status(200)
    .json({
      success: true,
      authenticated: true,
      user: req.user,
      session: { expires_at: req.session.expires_at }
    });
});
app.post("/api/auth/logout", authenticate, (req, res) => {
  try {
    db.prepare(
      `
                DELETE FROM sessions
                WHERE id = ?
            `
    ).run(req.session.id);
    return res.status(200).json({ success: true, message: "Sesión cerrada correctamente." });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ success: false, message: "No se pudo cerrar la sesión." });
  }
});
app.post("/api/auth/logout-all", authenticate, (req, res) => {
  try {
    db.prepare(
      `
                DELETE FROM sessions
                WHERE user_id = ?
            `
    ).run(req.user.id);
    return res.status(200).json({ success: true, message: "Todas las sesiones fueron cerradas." });
  } catch (error) {
    console.error("Logout all error:", error);
    return res.status(500).json({ success: false, message: "No se pudieron cerrar las sesiones." });
  }
});
cleanExpiredSessions();
setInterval(
  () => {
    try {
      cleanExpiredSessions();
    } catch (error) {
      console.error("Session cleanup error:", error);
    }
  },
  60 * 60 * 1000
);
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore) {
      if (now >= value.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  },
  15 * 60 * 1000
);
app.use((req, res) => {
  return res.status(404).json({ success: false, message: "Endpoint no encontrado." });
});
app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);
  if (error.message === "Origen no permitido por CORS.") {
    return res.status(403).json({ success: false, message: "Origen no permitido." });
  }
  return res.status(500).json({ success: false, message: "Error interno del servidor." });
});
const server = app.listen(PORT, () => {
  console.log("");
  console.log("=================================");
  console.log("   KOMODO HOSTING AUTH BACKEND");
  console.log("=================================");
  console.log("");
  console.log(`Server running at: http://localhost:${PORT}`);
  console.log(`Database: ${databasePath}`);
  console.log("Database: SQLite");
  console.log("Authentication: Sessions");
  console.log("Remembered sessions: 30 days");
  console.log("Normal sessions: 24 hours");
  console.log(`Google OAuth: ${GOOGLE_CLIENT_ID ? "Enabled" : "Not configured"}`);
  console.log("Pterodactyl: Not integrated");
  console.log("");
});
/*
==================================================
MANEJO DE CIERRE
==================================================
*/
function shutdown() {
  console.log("\nCerrando Komodo Auth Backend...");
  try {
    db.close();
  } catch (error) {
    console.error("Error cerrando SQLite:", error);
  }
  server.close(() => {
    console.log("Servidor detenido.");
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
