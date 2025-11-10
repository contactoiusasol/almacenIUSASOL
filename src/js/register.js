// ------------------- SUPABASE -------------------
// Usamos CDN directo en lugar de import
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

// Inicializar Supabase después de cargar la librería
function initSupabase() {
    if (window.supabase) {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return null;
}

// ------------------- TOAST FUNCTION -------------------
function showToast(message, type = "success") {
    console.log("Mostrando toast:", message, type);
    
    // Crear contenedor de toast si no existe
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    // Animación de entrada
    setTimeout(() => {
        toast.classList.add("show");
    }, 10);

    // Auto-eliminar después de 3 segundos
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}

// ------------------- PASSWORD TOGGLE FUNCTIONALITY -------------------
function setupPasswordToggles() {
    const togglePassword = document.getElementById('togglePassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function() {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
    }
    
    if (toggleConfirmPassword && confirmPasswordInput) {
        toggleConfirmPassword.addEventListener('click', function() {
            const type = confirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            confirmPasswordInput.setAttribute('type', type);
            this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
    }
}

// ------------------- FORMULARIO -------------------
function setupFormSubmission() {
    const registerForm = document.getElementById("registerForm");
    
    if (!registerForm) {
        console.error("Formulario de registro no encontrado");
        return;
    }

    registerForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const nombre = document.getElementById("firstName")?.value.trim();
        const apellido = document.getElementById("lastName")?.value.trim();
        const email = document.getElementById("email")?.value.trim();
        const pass = document.getElementById("password")?.value.trim();
        const confirm = document.getElementById("confirmPassword")?.value.trim();

        // Validación básica
        if (!nombre || !apellido || !email || !pass || !confirm) {
            return showToast("Completa todos los campos", "warning");
        }

        if (pass !== confirm) {
            return showToast("Las contraseñas no coinciden", "error");
        }

        if (pass.length < 6) {
            return showToast("La contraseña debe tener al menos 6 caracteres", "warning");
        }

        const submitBtn = document.getElementById("submitBtn");
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando cuenta...';
        submitBtn.disabled = true;

        try {
            const supabase = initSupabase();
            if (!supabase) {
                throw new Error("Supabase no está disponible");
            }

            // Verificar si ya existe el correo
            const { data: existingUser, error: checkError } = await supabase
                .from("usuarios")
                .select("id")
                .eq("email", email)
                .maybeSingle();

            if (checkError) throw new Error("Error verificando usuario: " + checkError.message);
            if (existingUser) {
                return showToast("⚠️ Este correo ya está registrado", "warning");
            }

            // Registrar en Auth
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: pass,
                options: { 
                    data: { 
                        nombre: nombre, 
                        apellido: apellido,
                        role: "cliente"
                    } 
                }
            });

            if (error) throw new Error("Error en registro: " + error.message);

            // Insertar en tabla usuarios
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
                if (insertError.code === "23505") {
                    return showToast("⚠️ Este correo ya está registrado", "warning");
                }
                throw new Error("Error guardando en tabla usuarios: " + insertError.message);
            }

            showToast("¡Cuenta creada exitosamente! Redirigiendo...", "success");

            setTimeout(() => {
                window.location.href = "login.html";
            }, 2000);

        } catch (err) {
            console.error("Error:", err);
            showToast(err.message, "error");
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ------------------- INITIALIZATION -------------------
document.addEventListener('DOMContentLoaded', function() {
    // Cargar Supabase desde CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = function() {
        // Una vez cargado Supabase, inicializar todo
        setupPasswordToggles();
        setupFormSubmission();
        
        // Toast de prueba
        setTimeout(() => {
            showToast("Sistema de registro cargado", "success");
        }, 500);
    };
    document.head.appendChild(script);
});