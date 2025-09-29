// ------------------- SUPABASE -------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------- TOAST FUNCTION -------------------
function showToast(message, type ="success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ------------------- LOGIN FORM -------------------
document.getElementById("loginForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value.trim();

  if (!email || !pass) return showToast("Completa todos los campos", "warning");

  try {
    // 🔹 Autenticación con Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: pass,
    });

    if (error) {
      return showToast("Error al iniciar sesión: " + error.message, "error");
    }

    console.log("Usuario autenticado:", data.user);

    // 🔹 Buscar al usuario en la tabla "usuarios"
    const { data: userData, error: userError } = await supabase
      .from("usuarios")
      .select("id, nombre, email, role")
      .eq("email", email)
      .single();

    if (userError || !userData) {
      return showToast("No se encontró el usuario en la tabla", "error");
    }

    console.log("Datos del usuario:", userData);

    // 🔹 Guardar el role en localStorage para usarlo en la app
    localStorage.setItem("userRole", userData.role);
    localStorage.setItem("userName", userData.nombre);

    // 🔹 Redirigir según el role
    if (userData.role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "usuario.html";
    }
  } catch (err) {
    return showToast("Error inesperado: " + err.message, "error");
  }
});
