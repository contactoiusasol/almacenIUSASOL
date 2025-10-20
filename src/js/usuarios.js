// ---------------- CONFIGURACIÓN SUPABASE ----------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------- ELEMENTOS DEL DOM ----------------
const usuariosBody = document.getElementById("usuariosBody");
const modal = document.getElementById("modal");
const modalConfirmacion = document.getElementById("modalConfirmacion");
const modalNotificacion = document.getElementById("modalNotificacion");
const closeModal = document.getElementById("closeModal");
const btnNuevo = document.getElementById("btnNuevo");
const formUsuario = document.getElementById("formUsuario");
const modalTitle = document.getElementById("modalTitle");
const btnCancelarForm = document.getElementById("cancelarForm");
const btnCancelarEliminar = document.getElementById("cancelarEliminar");
const btnConfirmarEliminar = document.getElementById("confirmarEliminar");
const closeConfirmacion = document.querySelector(".confirm-close");

// Elementos de notificación
const notificacionHeader = document.getElementById("notificacionHeader");
const notificacionIcon = document.getElementById("notificacionIcon");
const notificacionTitulo = document.getElementById("notificacionTitulo");
const notificacionMensaje = document.getElementById("notificacionMensaje");
const aceptarNotificacion = document.getElementById("aceptarNotificacion");
const closeNotificacion = document.querySelector(".notificacion-close");

// Variables globales
let usuarioEliminando = null;

// ---------------- INICIALIZACIÓN ----------------
document.addEventListener('DOMContentLoaded', function() {
    cargarUsuarios();
    
    // Event Listeners
    btnNuevo.addEventListener('click', abrirModalNuevo);
    closeModal.addEventListener('click', cerrarModal);
    btnCancelarForm.addEventListener('click', cerrarModal);
    btnCancelarEliminar.addEventListener('click', cerrarModalConfirmacion);
    btnConfirmarEliminar.addEventListener('click', confirmarEliminacion);
    closeConfirmacion.addEventListener('click', cerrarModalConfirmacion);
    
    // Notificaciones
    aceptarNotificacion.addEventListener('click', cerrarNotificacion);
    closeNotificacion.addEventListener('click', cerrarNotificacion);
    
    // Cerrar modales al hacer clic fuera
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            cerrarModal();
        } else if (event.target === modalConfirmacion) {
            cerrarModalConfirmacion();
        } else if (event.target === modalNotificacion) {
            cerrarNotificacion();
        }
    });
    
    // Envío del formulario
    formUsuario.addEventListener('submit', guardarUsuario);
});

// ---------------- MOSTRAR USUARIOS ----------------
async function cargarUsuarios() {
    try {
        const { data, error } = await supabase
            .from("usuarios")
            .select("*")
            .order("id", { ascending: true });
            
        if (error) {
            throw error;
        }

        usuariosBody.innerHTML = "";

        // Validar que data sea un array
        if (!data || !Array.isArray(data) || data.length === 0) {
            mostrarNotificacion("No hay usuarios registrados", "error");
            return;
        }

        data.forEach(u => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${u.nombre}</td>
                <td>${u.apellido}</td>
                <td>${u.email}</td>
                <td><span class="role-badge ${u.role}">${u.role}</span></td>
                <td class="password-cell">${'*'.repeat(u.password?.length || 0)}</td>
                <td>
                    <button class="edit-btn" onclick="editarUsuario(${u.id})">Editar</button>
                    <button class="delete-btn" onclick="abrirModalConfirmacion(${u.id})">Eliminar</button>
                </td>
            `;
            usuariosBody.appendChild(fila);
        });
    } catch (error) {
        console.error("Error al cargar usuarios:", error);
        mostrarNotificacion("Error al cargar los usuarios", "error");
    }
}


// ---------------- ABRIR MODAL NUEVO USUARIO ----------------
function abrirModalNuevo() {
    formUsuario.reset();
    document.getElementById("usuarioId").value = "";
    modalTitle.textContent = "Nuevo Usuario";
    modal.style.display = "block";
}

// ---------------- CERRAR MODAL ----------------
function cerrarModal() {
    modal.style.display = "none";
}

// ---------------- ABRIR MODAL CONFIRMACIÓN ELIMINAR ----------------
function abrirModalConfirmacion(id) {
    usuarioEliminando = id;
    modalConfirmacion.style.display = "block";
}

// ---------------- CERRAR MODAL CONFIRMACIÓN ----------------
function cerrarModalConfirmacion() {
    modalConfirmacion.style.display = "none";
    usuarioEliminando = null;
}

// ---------------- CONFIRMAR ELIMINACIÓN ----------------
async function confirmarEliminacion() {
    if (!usuarioEliminando) return;
    
    try {
        const { error } = await supabase
            .from("usuarios")
            .delete()
            .eq("id", usuarioEliminando);
            
        if (error) {
            throw error;
        }
        
        mostrarNotificacion("Usuario eliminado correctamente", "exito");
        cargarUsuarios();
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        mostrarNotificacion("Error al eliminar usuario", "error");
    }
    
    cerrarModalConfirmacion();
}

// ---------------- GUARDAR USUARIO ----------------
// ---------------- GUARDAR USUARIO ----------------
async function guardarUsuario(e) {
    e.preventDefault();

    const id = document.getElementById("usuarioId").value;
    const nuevoUsuario = {
        nombre: document.getElementById("nombre").value.trim(),
        apellido: document.getElementById("apellido").value.trim(),
        email: document.getElementById("email").value.trim().toLowerCase(),
        role: document.getElementById("role").value
    };

    // Validaciones básicas
    if (!nuevoUsuario.nombre || !nuevoUsuario.apellido || !nuevoUsuario.email) {
        mostrarNotificacion("Todos los campos son obligatorios", "error");
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nuevoUsuario.email)) {
        mostrarNotificacion("Por favor, ingrese un email válido", "error");
        return;
    }

    try {
        // Si es edición, actualiza como siempre
        if (id) {
            const { error } = await supabase
                .from("usuarios")
                .update(nuevoUsuario)
                .eq("id", id);

            if (error) throw error;

            mostrarNotificacion("Usuario actualizado correctamente", "exito");
        } else {
            // Si es nuevo usuario, manda invitación por correo
            const response = await fetch("/api/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nuevoUsuario)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Error al enviar invitación");
            }

            mostrarNotificacion(
                "Invitación enviada. El usuario recibirá un correo para registrarse.",
                "exito"
            );
        }

        cerrarModal();
        cargarUsuarios();
    } catch (error) {
        console.error("Error al guardar usuario:", error);
        mostrarNotificacion(error.message || "Error al procesar la solicitud", "error");
    }
}


// ---------------- EDITAR USUARIO ----------------
async function editarUsuario(id) {
    try {
        const { data, error } = await supabase
            .from("usuarios")
            .select("*")
            .eq("id", id)
            .single();
            
        if (error) {
            throw error;
        }

        if (!data) {
            mostrarNotificacion("Usuario no encontrado", "error");
            return;
        }

        document.getElementById("usuarioId").value = data.id;
        document.getElementById("nombre").value = data.nombre || "";
        document.getElementById("apellido").value = data.apellido || "";
        document.getElementById("email").value = data.email || "";
        document.getElementById("password").value = data.password || "";
        document.getElementById("role").value = data.role || "cliente";

        modalTitle.textContent = "Editar Usuario";
        modal.style.display = "block";
    } catch (error) {
        console.error("Error al cargar usuario:", error);
        mostrarNotificacion("Error al cargar el usuario: " + (error.message || "Error desconocido"), "error");
    }
}
// ---------------- VERIFICAR EMAIL ÚNICO ----------------
async function verificarEmailUnico(email, usuarioId = null) {
    try {
        let query = supabase
            .from("usuarios")
            .select("id, email")
            .eq("email", email.toLowerCase());

        // Si estamos editando, excluir el usuario actual
        if (usuarioId) {
            query = query.neq("id", usuarioId);
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return data.length === 0; // true si el email es único
    } catch (error) {
        console.error("Error al verificar email:", error);
        return false;
    }
}

// ---------------- SISTEMA DE NOTIFICACIONES ----------------
function mostrarNotificacion(mensaje, tipo = "exito") {
    const config = {
        exito: {
            titulo: "Éxito",
            clase: "exito",
            icono: `<svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z"/>
                   </svg>`
        },
        error: {
            titulo: "Error",
            clase: "error",
            icono: `<svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
                   </svg>`
        }
    };

    const { titulo, clase, icono } = config[tipo] || config.error;

    // Aplicar configuración
    notificacionHeader.className = "notificacion-header " + clase;
    notificacionIcon.innerHTML = icono;
    notificacionTitulo.textContent = titulo;
    notificacionMensaje.textContent = mensaje;

    // Mostrar modal
    modalNotificacion.style.display = "block";
}

function cerrarNotificacion() {
    modalNotificacion.style.display = "none";
}