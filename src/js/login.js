// login.js (módulo)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CONFIG SUPABASE (usa tu key real) ---
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- TOAST SIMPLE ---
function showToast(message, type = "success") {
  const c = document.getElementById("toastContainer");
  if (!c) return alert(message);
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// --- LOGIN HANDLER ---
const form = document.getElementById("loginForm");
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!email || !password) return showToast("Completa todos los campos", "warning");

  try {
    // Autenticación Supabase
    const { data: signData, error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signError) {
      showToast("Error al iniciar sesión: " + signError.message, "error");
      return;
    }

    // Consultar la tabla 'usuarios' para traer nombre y role
    const { data: userData, error: userError } = await supabase
      .from("usuarios")
      .select("id, nombre, email, role")
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      showToast("Error al buscar usuario: " + userError.message, "error");
      return;
    }

    if (!userData) {
      showToast("No se encontró el usuario en la tabla 'usuarios'", "error");
      return;
    }

    // Normalizar el role (acepta 'role' o 'rol' si tu tabla lo tuviera distinto)
    const role = userData.role || userData.rol || "usuario";
    const nombre = userData.nombre || email.split("@")[0];

    // Guardar en localStorage como un solo objeto (clave: usuario)
    const usuarioObj = { id: userData.id || null, nombre, role, email };
    localStorage.setItem("usuario", JSON.stringify(usuarioObj));

    // Redirigir según role
    showToast("Bienvenido " + nombre, "success");
    setTimeout(() => {
      if (role.toLowerCase() === "admin") {
        window.location.href = "admin.html";
      } else {
        window.location.href = "usuario.html";
      }
    }, 700);
  } catch (err) {
    showToast("Error inesperado: " + (err.message || err), "error");
    console.error(err);
  }
});
