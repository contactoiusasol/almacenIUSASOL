// cleanup.js - Limpieza de sesiones antiguas
function cleanupOldSessions() {
    console.log('🧹 Verificando sesiones antiguas...');
    
    // Limpiar datos de sesión antiguos
    const oldKeys = ['usuario', 'currentSessionId', 'sessionId'];
    oldKeys.forEach(key => {
        if (localStorage.getItem(key)) {
            localStorage.removeItem(key);
            console.log('🗑️ Eliminado:', key);
        }
        if (sessionStorage.getItem(key)) {
            sessionStorage.removeItem(key);
            console.log('🗑️ Eliminado session:', key);
        }
    });
}

// Ejecutar al cargar
document.addEventListener('DOMContentLoaded', cleanupOldSessions);