// Configuración de Supabase
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

// Crear cliente de Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Manejo del formulario
document.getElementById("registerForm").addEventListener("submit", async function(e) {
  e.preventDefault();

  const user = document.getElementById("newUser").value.trim();
  const email = document.getElementById("newEmail").value.trim();
  const pass = document.getElementById("newPassword").value.trim();
  const confirm = document.getElementById("confirmPassword").value.trim();

  if (!user || !email || !pass || !confirm) {
    alert("⚠️ Por favor, completa todos los campos.");
    return;
  }

  if (pass !== confirm) {
    alert("⚠️ Las contraseñas no coinciden.");
    return;
  }

  // Registro en Supabase
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: pass,
    options: {
      data: { username: user } // Guardar nombre como metadata
    }
  });

  if (error) {
    alert("❌ Error en el registro: " + error.message);
    console.error(error);
  } else {
    alert("✅ Registro exitoso. Revisa tu correo para confirmar tu cuenta.");
    console.log(data);
    window.location.href = "login.html"; // Redirige al login
  }
});
