// Elementos del DOM
const form = document.getElementById('loginForm');
const emailInput = document.getElementById('loginEmail');
const passwordInput = document.getElementById('loginPassword');
const togglePassword = document.getElementById('togglePassword');
const submitBtn = document.getElementById('submitBtn');
const toastContainer = document.getElementById('toastContainer');

// --- CONFIG SUPABASE ---
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

// --- UTILIDADES ---
function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showToast(message, type = 'success') {
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="${icons[type]}"></i>
    <span>${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  // Mostrar con animación
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Ocultar y eliminar después de 4 segundos
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 4000);
}

function showLoading() {
  submitBtn.classList.add('btn-loading');
  submitBtn.disabled = true;
}

function hideLoading() {
  submitBtn.classList.remove('btn-loading');
  submitBtn.disabled = false;
}

// --- CREAR NIEVE ADICIONAL ---
function createAdditionalSnow() {
  const snowContainer = document.createElement('div');
  snowContainer.className = 'additional-snow';
  document.body.appendChild(snowContainer);
  
  // Crear copos de nieve adicionales
  for (let i = 0; i < 50; i++) {
    const snowflake = document.createElement('div');
    snowflake.className = 'snowflake';
    snowflake.innerHTML = '❄';
    snowflake.style.cssText = `
      position: fixed;
      top: -20px;
      left: ${Math.random() * 100}%;
      color: white;
      opacity: ${0.3 + Math.random() * 0.7};
      font-size: ${10 + Math.random() * 20}px;
      animation: snowFall ${5 + Math.random() * 10}s linear infinite;
      animation-delay: ${Math.random() * 5}s;
      pointer-events: none;
      z-index: 0;
    `;
    
    snowContainer.appendChild(snowflake);
  }
  
  // Añadir estilos para la animación de nieve
  const style = document.createElement('style');
  style.textContent = `
    @keyframes snowFall {
      0% {
        transform: translateY(0) rotate(0deg);
      }
      100% {
        transform: translateY(100vh) rotate(360deg);
      }
    }
  `;
  document.head.appendChild(style);
}

// --- CREAR ESFERAS ADICIONALES ---
function createAdditionalOrnaments() {
  const ornamentsContainer = document.querySelector('.christmas-ornaments');
  if (!ornamentsContainer) return;
  
  // Crear más esferas
  for (let i = 0; i < 8; i++) {
    const ornament = document.createElement('div');
    const colors = ['red', 'gold', 'blue', 'green', 'silver'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    ornament.className = `ornament ${randomColor}`;
    ornament.style.cssText = `
      top: ${10 + Math.random() * 80}%;
      left: ${5 + Math.random() * 90}%;
      animation-delay: ${Math.random() * 5}s;
    `;
    
    ornamentsContainer.appendChild(ornament);
  }
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
      showToast(`¡Bienvenido de nuevo ${user.nombre || user.email}! 🎄`, "success");
      setTimeout(() => {
        const dest = (user.role && user.role.toLowerCase() === "admin") ? "../html/admin.html" : "../html/usuario.html";
        location.replace(dest);
      }, 800);
      return;
    }
  } catch (err) {
    console.error("Error en chequeo de sesión:", err);
  }

  // Configurar elementos después de verificar sesión
  setupForm();
  createAdditionalSnow();
  createAdditionalOrnaments();
});

function setupForm() {
  // Toggle de visibilidad de contraseña
  if (togglePassword) {
    togglePassword.addEventListener('click', function() {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      this.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    });
  }

  // Manejo del formulario
  if (form) {
    form.addEventListener('submit', handleLogin);
  }

  console.log('STOCK-VISION Navideño cargado correctamente');
}

// --- HANDLER FORM ---
async function handleLogin(e) {
  e.preventDefault();
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email || !password) {
    showToast('Por favor, completa todos los campos', 'error');
    return;
  }
  
  showLoading();
  
  try {
    // Cargar Supabase dinámicamente
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Intentar login
    const { data: signData, error: signError } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });

    if (signError) {
      showToast("Error al iniciar sesión: " + (signError.message || signError), "error");
      hideLoading();
      return;
    }

    // proteger contra respuestas inesperadas
    if (!signData || !signData.session) {
      showToast("No se generó sesión. Intenta de nuevo.", "error");
      console.error("signData inesperado:", signData);
      hideLoading();
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
      hideLoading();
      return;
    }
    
    if (!userData) {
      showToast("Usuario no encontrado en la tabla 'usuarios'", "error");
      hideLoading();
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

    showToast(`¡Bienvenido ${nombre}! 🧑🏻‍🎄`, "success");

    // redirigir según rol — usar replace para no dejar la página anterior en el historial
    setTimeout(() => {
      const dest = role === "admin" ? "../html/admin.html" : "../html/usuario.html";
      location.replace(dest);
    }, 1500);

  } catch (err) {
    console.error("Error inesperado login:", err);
    showToast("Error inesperado: " + (err.message || err), "error");
    hideLoading();
  }
}