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
// const btnNuevo = document.getElementById("btnNuevo"); // eliminado (ya no existe en el HTML)
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
    
    // Event Listeners (sin btnNuevo)
    if (closeModal) closeModal.addEventListener('click', cerrarModal);
    if (btnCancelarForm) btnCancelarForm.addEventListener('click', cerrarModal);
    if (btnCancelarEliminar) btnCancelarEliminar.addEventListener('click', cerrarModalConfirmacion);
    if (btnConfirmarEliminar) btnConfirmarEliminar.addEventListener('click', confirmarEliminacion);
    if (closeConfirmacion) closeConfirmacion.addEventListener('click', cerrarModalConfirmacion);
    
    // Notificaciones
    if (aceptarNotificacion) aceptarNotificacion.addEventListener('click', cerrarNotificacion);
    if (closeNotificacion) closeNotificacion.addEventListener('click', cerrarNotificacion);
    
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
    if (formUsuario) formUsuario.addEventListener('submit', guardarUsuario);
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
                <td>${escapeHtml(u.nombre)}</td>
                <td>${escapeHtml(u.apellido)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td><span class="role-badge ${escapeHtml(u.role)}">${escapeHtml(u.role)}</span></td>
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

// ---------------- ESCAPAR HTML (evita inyección al renderizar) ----------------
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ---------------- ABRIR MODAL NUEVO USUARIO ----------------
function abrirModalNuevo() {
    // Esta función puede seguir usándose si desde otra parte quieres abrir el modal
    if (!formUsuario) return;
    formUsuario.reset();
    const usuarioIdInput = document.getElementById("usuarioId");
    if (usuarioIdInput) usuarioIdInput.value = "";
    if (modalTitle) modalTitle.textContent = "Nuevo Usuario";
    if (modal) modal.style.display = "block";
}

// ---------------- CERRAR MODAL ----------------
function cerrarModal() {
    if (modal) modal.style.display = "none";
}

// ---------------- ABRIR MODAL CONFIRMACIÓN ELIMINAR ----------------
function abrirModalConfirmacion(id) {
    usuarioEliminando = id;
    if (modalConfirmacion) modalConfirmacion.style.display = "block";
}

// ---------------- CERRAR MODAL CONFIRMACIÓN ----------------
function cerrarModalConfirmacion() {
    if (modalConfirmacion) modalConfirmacion.style.display = "none";
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
        await cargarUsuarios();
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        mostrarNotificacion("Error al eliminar usuario", "error");
    }
    
    cerrarModalConfirmacion();
}

// ---------------- GUARDAR USUARIO ----------------
async function guardarUsuario(e) {
    e.preventDefault();

    const id = document.getElementById("usuarioId").value;
    const nombre = document.getElementById("nombre").value.trim();
    const apellido = document.getElementById("apellido").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value; // puede estar vacío en edición
    const role = document.getElementById("role").value;

    const nuevoUsuario = { nombre, apellido, email, role };

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
        // Verificar email único (excluyendo al usuario que editamos)
        const esUnico = await verificarEmailUnico(nuevoUsuario.email, id || null);
        if (!esUnico) {
            mostrarNotificacion("El email ya está en uso por otro usuario", "error");
            return;
        }

        if (id) {
            // Edición: construir objeto de update (no sobreescribir contraseña si está vacía)
            const updateObj = { nombre, apellido, email, role };
            if (password && password.length > 0) {
                updateObj.password = password;
            }

            const { error } = await supabase
                .from("usuarios")
                .update(updateObj)
                .eq("id", id);

            if (error) throw error;

            mostrarNotificacion("Usuario actualizado correctamente", "exito");
        } else {
            // Nuevo usuario: insertar directamente en la tabla
            // (Si deseas hashear la contraseña en el servidor, cambia la lógica;
            // aquí guardamos la contraseña tal cual según el diseño actual)
            const insertObj = {
                nombre,
                apellido,
                email,
                role,
                password: password || "" // si deseas forzar contraseña, valida antes
            };

            const { error } = await supabase
                .from("usuarios")
                .insert([insertObj]);

            if (error) throw error;

            mostrarNotificacion("Usuario creado correctamente", "exito");
        }

        cerrarModal();
        await cargarUsuarios();
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

        return !data || data.length === 0; // true si el email es único o no hay resultados
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
    if (notificacionHeader) notificacionHeader.className = "notificacion-header " + clase;
    if (notificacionIcon) notificacionIcon.innerHTML = icono;
    if (notificacionTitulo) notificacionTitulo.textContent = titulo;
    if (notificacionMensaje) notificacionMensaje.textContent = mensaje;

    // Mostrar modal
    if (modalNotificacion) modalNotificacion.style.display = "block";
}

function cerrarNotificacion() {
    if (modalNotificacion) modalNotificacion.style.display = "none";
}
