(function () {
  'use strict';

  // ---- CONFIG (ajusta si tu login está en otra ruta) ----
  const PRIMARY_LOGIN = '/src/html/login.html'; // ruta absoluta preferida al login
  const LOGIN_PATHS = [
    PRIMARY_LOGIN,
    '/login.html',
    '/index.html',
    'login.html',
    'index.html'
  ];

  // Páginas que NUNCA deben abrirse sin comprobar rol admin
  const PROTECTED_PAGES = [
    'admin.html',
    'inventario.html',
    'entradas.html',
    'salidas.html',
    'reportes.html',
    'productos-sin-codigo.html',
    'usuarios.html'
  ];

  const LS_USER = 'usuario';
  const LS_SESSION = 'currentSessionId';
  const SS_SESSION = 'sessionId';

  // ---- utilidades ----
  function normalizePath(p) {
    try {
      return new URL(p, location.origin).pathname.toLowerCase();
    } catch (e) {
      return String(p || '').toLowerCase();
    }
  }

  function pathEndsWithAny(pathname, list) {
    const p = (pathname || '').toLowerCase();
    return list.some(name => {
      const n = name.toLowerCase();
      return p.endsWith('/' + n) || p.endsWith(n);
    });
  }

  function isLoginPage(pathname) {
    return pathEndsWithAny(pathname, LOGIN_PATHS);
  }

  function isProtectedPage(pathname) {
    return pathEndsWithAny(pathname, PROTECTED_PAGES);
  }

  function parseUser() {
    try {
      const raw = localStorage.getItem(LS_USER);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function checkAuth(requiredRole = 'admin') {
    const user = parseUser();
    const lsSess = localStorage.getItem(LS_SESSION);
    const ssSess = sessionStorage.getItem(SS_SESSION);

    if (!user || !lsSess || !ssSess) return false;
    if (lsSess !== ssSess) return false;

    const role = (user.role || user.rol || '').toString().toLowerCase();
    if (!role) return false;

    if (requiredRole) {
      return role === 'admin' || role === requiredRole.toLowerCase();
    }
    return true;
  }

  function clearSession() {
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_SESSION);
    sessionStorage.removeItem(SS_SESSION);
  }

  function redirectToLoginImmediate() {
    try {
      clearSession();
      const candidate = new URL(PRIMARY_LOGIN, location.origin).href;
      if (location.href === candidate) return;
      location.replace(candidate);
    } catch (e) {
      try {
        location.replace('login.html');
      } catch (err) {
        location.href = '/';
      }
    }
  }

  // Oculta la página temporalmente si estamos en una protegida (evitar flash)
  const currentPath = location.pathname || location.href;
  const shouldProtect = isProtectedPage(currentPath);
  if (shouldProtect) {
    try { document.documentElement.style.visibility = 'hidden'; } catch (e) {}
  }

  // Intercepta clicks en enlaces para bloquear navegación a páginas protegidas
  function interceptLinks() {
    document.addEventListener('click', function (ev) {
      const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
      if (!a || !a.href) return;
      try {
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin) return; // enlaces externos no tocar

        if (isProtectedPage(url.pathname) && !checkAuth('admin')) {
          ev.preventDefault();
          redirectToLoginImmediate();
        }
      } catch (e) {}
    }, true);
  }

  function watchHistory() {
    window.addEventListener('popstate', function () {
      if (isProtectedPage(location.pathname) && !checkAuth('admin')) {
        redirectToLoginImmediate();
      }
    });
  }

  function protectNow() {
    const pathname = location.pathname || location.href;

    // Si estamos en login y ya hay sesión válida -> redirigir según rol
    if (isLoginPage(pathname)) {
      if (checkAuth()) {
        const user = parseUser();
        const role = (user && (user.role || user.rol) || '').toString().toLowerCase();
        if (role === 'admin') {
          try { location.replace(new URL('/src/html/admin.html', location.origin).href); } catch (e) { location.replace('/src/html/admin.html'); }
        } else {
          try { location.replace(new URL('/src/html/usuario.html', location.origin).href); } catch (e) { location.replace('/src/html/usuario.html'); }
        }
      } else {
        try { document.documentElement.style.visibility = ''; } catch (e) {}
      }
      return;
    }

    // Página protegida
    if (isProtectedPage(pathname)) {
      if (!checkAuth('admin')) {
        redirectToLoginImmediate();
        return;
      }
      try { document.documentElement.style.visibility = ''; } catch (e) {}
      if (typeof displayUserInfo === 'function') {
        try { displayUserInfo(); } catch (e) {}
      }
      if (typeof setupActivityCheck === 'function') {
        try { setupActivityCheck(); } catch (e) {}
      }
      return;
    }

    // Página no protegida
    try { document.documentElement.style.visibility = ''; } catch (e) {}
  }

  // Ejecutar interceptores
  try {
    interceptLinks();
    watchHistory();

    if (document.readyState === 'loading') {
      setTimeout(protectNow, 10);
      document.addEventListener('DOMContentLoaded', protectNow, { once: true });
    } else {
      protectNow();
    }

    // Exponer funciones para debug/compatibilidad
    window.__sec_checkAuth = checkAuth;
    window.__sec_clearSession = clearSession;
    window.__sec_redirectToLogin = redirectToLoginImmediate;
  } catch (err) {
    console.error('Error en seguridad:', err);
    try { document.documentElement.style.visibility = ''; } catch (e) {}
  }

  // ------------------ EXPONER protectPage ------------------
  window.protectPage = function(requiredRole = 'admin') {
    if (!checkAuth(requiredRole)) {
      redirectToLoginImmediate();
      return false;
    }
    return true;
  };

})();
