// src/js/login.js (módulo) - versión robusta
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CONFIG SUPABASE ---
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- UTILIDADES ---
function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
function showToast(message, type = "success") {
  const c = document.getElementById("toastContainer");
  if (!c) return alert(message);
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// --- CHEQUEO PREVIO DE SESIÓN (al cargar) ---
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const usuarioRaw = localStorage.getItem("usuario");
    const currentSessionId = localStorage.getItem("currentSessionId");
    const storedSessionId = sessionStorage.getItem("sessionId");

    if (usuarioRaw && currentSessionId && currentSessionId !== storedSessionId) {
      // sesión inválida (otra pestaña/cambios) -> limpiar
      localStorage.removeItem("usuario");
      localStorage.removeItem("currentSessionId");
      sessionStorage.removeItem("sessionId");
      showToast("Sesión cerrada por seguridad", "warning");
    }

    if (usuarioRaw && currentSessionId && currentSessionId === storedSessionId) {
      // ya hay sesión válida; redirigimos según role (sin esperar)
      const user = JSON.parse(usuarioRaw);
      showToast(`Bienvenido de nuevo ${user.nombre || user.email}`, "success");
      setTimeout(() => {
        const dest = (user.role && user.role.toLowerCase() === "admin") ? "/src/html/admin.html" : "/src/html/usuario.html";
        location.replace(dest);
      }, 800);
      return;
    }
  } catch (err) {
    console.error("Error en chequeo de sesión:", err);
  }
});

// --- HANDLER FORM ---
const form = document.getElementById("loginForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (document.getElementById("loginEmail").value || "").trim();
    const password = (document.getElementById("loginPassword").value || "").trim();

    if (!email || !password) {
      showToast("Completa todos los campos", "warning");
      return;
    }

    try {
      // intentar login con Supabase
      const { data: signData, error: signError } = await supabase.auth.signInWithPassword({ email, password });

      if (signError) {
        showToast("Error al iniciar sesión: " + (signError.message || signError), "error");
        return;
      }

      // proteger contra respuestas inesperadas
      if (!signData || !signData.session) {
        showToast("No se generó sesión. Intenta de nuevo.", "error");
        console.error("signData inesperado:", signData);
        return;
      }

      // obtener usuario de tabla 'usuarios'
      const { data: userData, error: userError } = await supabase
        .from("usuarios")
        .select("id, nombre, email, role")
        .eq("email", email)
        .maybeSingle();

      if (userError) {
        showToast("Error al consultar usuario: " + (userError.message || userError), "error");
        return;
      }
      if (!userData) {
        showToast("Usuario no encontrado en la tabla 'usuarios'", "error");
        return;
      }

      const role = (userData.role || userData.rol || "usuario").toString().toLowerCase();
      const nombre = userData.nombre || email.split("@")[0];

      // crear session id y guardarla en localStorage y sessionStorage
      const sessionId = generateSessionId();
      const usuarioObj = {
        id: userData.id || null,
        nombre,
        role,
        email,
        token: signData.session.access_token || null,
      };
      localStorage.setItem("usuario", JSON.stringify(usuarioObj));
      localStorage.setItem("currentSessionId", sessionId);
      sessionStorage.setItem("sessionId", sessionId);

      showToast("Bienvenido " + nombre, "success");

      // redirigir según rol — usar replace para no dejar la página anterior en el historial
      setTimeout(() => {
        const dest = role === "admin" ? "/src/html/admin.html" : "/src/html/usuario.html";
        location.replace(dest);
      }, 600);

    } catch (err) {
      console.error("Error inesperado login:", err);
      showToast("Error inesperado: " + (err.message || err), "error");
    }
  });
}
