// ------------------- SUPABASE -------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------- TOAST FUNCTION -------------------
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ------------------- FORMULARIO -------------------
document.getElementById("registerForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  const nombre = document.getElementById("newNombre").value.trim();
  const apellido = document.getElementById("newApellido").value.trim();
  const email = document.getElementById("newemail").value.trim();
  const pass = document.getElementById("newPassword").value.trim();
  const confirm = document.getElementById("confirmPassword").value.trim();

  if (!nombre || !apellido || !email || !pass || !confirm)
    return showToast("Completa todos los campos", "warning");

  if (pass !== confirm)
    return showToast("Las contraseñas no coinciden", "error");

  try {
    // 🔹 Verificar si ya existe el correo en la tabla usuarios
    const { data: existingUser, error: checkError } = await supabase
      .from("usuarios")
      .select("id") // solo pedimos el id para optimizar
      .eq("email", email)
      .maybeSingle();

    if (checkError) {
      console.error("Error verificando usuario:", checkError);
      return showToast("Error verificando el correo", "error");
    }

    if (existingUser) {
      return showToast("⚠️ Este correo ya está registrado", "warning");
    }

    // 🔹 Registrar en Auth
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: pass,
      options: { data: { nombre: nombre, apellido: apellido } }
    });

    if (error) {
      console.error("Error en Auth:", error);
      return showToast("Error en Supabase Auth: " + error.message, "error");
    }

    console.log("Usuario registrado en Auth:", data);

    // 🔹 Insertar en tabla usuarios
    const { data: insertData, error: insertError } = await supabase
      .from("usuarios")
      .insert([
        { 
          nombre: nombre,
          apellido: apellido,
          email: email,
          password: pass,
          role: "cliente"
        }
      ])
      .select();

    if (insertError) {
      if (insertError.code === "23505") { // Duplicado atrapado por constraint
        return showToast("⚠️ Este correo ya está registrado", "warning");
      }
      console.error("Error al insertar en usuarios:", insertError);
      return showToast("Error guardando en tabla usuarios", "error");
    }

    console.log("Registro insertado en usuarios:", insertData);

    // 🔹 Mostrar mensaje de éxito y redirigir
    const successModal = document.getElementById("successModal");
    successModal.style.display = "flex";

    setTimeout(() => {
      successModal.style.display = "none";
      window.location.href = "login.html";
    }, 2000);

  } catch (err) {
    console.error("Error inesperado:", err);
    return showToast("Error inesperado: " + err.message, "error");
  }
});
