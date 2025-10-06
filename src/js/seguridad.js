const SECURITY_CONFIG = {
    adminPages: ['admin.html', 'inventario.html', 'usuarios.html', 'reportes.html'],
    userPages: ['usuario.html', 'inventariouser.html', 'movimientomaterial.html'],
    loginPage: 'login.html'
};

// Verificar autenticación
function checkAuth() {
    const userData = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const currentPage = window.location.pathname.split('/').pop();
    
    // Si no hay usuario logueado, redirigir al login
    if (!userData.email) {
        if (currentPage !== SECURITY_CONFIG.loginPage) {
            window.location.href = SECURITY_CONFIG.loginPage;
        }
        return null;
    }
    
    // Verificar permisos según la página actual
    if (userData.role === 'admin') {
        if (SECURITY_CONFIG.userPages.includes(currentPage)) {
            window.location.href = 'admin.html'; // Redirigir a panel admin
        }
    } else if (userData.role === 'user') {
        if (SECURITY_CONFIG.adminPages.includes(currentPage)) {
            window.location.href = 'usuario.html'; // Redirigir a panel usuario
        }
    }
    
    return userData;
}

// Verificar rol específico
function hasRole(requiredRole) {
    const userData = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return userData.role === requiredRole;
}

// Cerrar sesión
function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionToken');
    window.location.href = SECURITY_CONFIG.loginPage;
}

// Verificar expiración de sesión
function checkSessionExpiry() {
    const sessionData = JSON.parse(localStorage.getItem('sessionToken') || '{}');
    if (sessionData.expiry && new Date() > new Date(sessionData.expiry)) {
        logout();
        return false;
    }
    return true;
}

// Inicializar seguridad en cada página
function initSecurity() {
    // Verificar autenticación
    const user = checkAuth();
    if (!user) return;
    
    // Verificar expiración de sesión cada minuto
    setInterval(checkSessionExpiry, 60000);
    
    // Configurar logout automático al cerrar pestaña/ventana
    window.addEventListener('beforeunload', () => {
        // Opcional: mantener sesión o limpiar según necesidades
    });
    
    return user;
}

// Proteger contra acceso desde otros navegadores/ventanas
function setupSessionSecurity() {
    const sessionId = Math.random().toString(36).substr(2, 9);
    localStorage.setItem('sessionId', sessionId);
    
    window.addEventListener('storage', (e) => {
        if (e.key === 'sessionId' && e.oldValue !== e.newValue) {
            logout();
        }
    });
}

export { 
    checkAuth, 
    hasRole, 
    logout, 
    initSecurity, 
    setupSessionSecurity,
    SECURITY_CONFIG 
};