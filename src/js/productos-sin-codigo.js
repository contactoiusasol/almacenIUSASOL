(() => {
  // -------------------- CONFIG SUPABASE --------------------
  const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
  const supabase = (window.supabase && typeof window.supabase.createClient === "function")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  // -------------------- SELECTORES DOM --------------------
  const tableBody = document.querySelector("#inventoryTable tbody");
  const inventoryTable = document.getElementById("inventoryTable");
  const searchInput = document.getElementById("searchInput");
  const modal = document.getElementById("modalForm");
  const btnOpenModal = document.getElementById("btnOpenModal");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const productForm = document.getElementById("productForm");
  const btnCancelModal = document.querySelector("#btnCancelModal");
  const refreshBtn = document.getElementById("refreshReport");

  const tablaPendientesBody = document.querySelector("#pendingTable tbody") || null;
  const tablaHistorialBody = document.querySelector("#salidasTable tbody") || null;

  const btnConfirmAll = document.getElementById("btnConfirmAll");
  const btnClearPending = document.getElementById("btnClearPending");

  // -------------------- ESTADO --------------------
  let editMode = false;
  let editingId = null;
  let PRODUCTOS_SIN_CODIGO_COLUMN_MAP = null;
  let paginatedProducts = [];
  let allProductsFromServer = [];
  let currentPage = 1;
  const ITEMS_PER_PAGE = 200;
  let totalProducts = 0;

  // PENDINGS (salidas)
  const PENDINGS_KEY_SALIDAS = "salidas_sin_codigo_pendientes";
// -------------------- PENDING KEY (consistente y fallback) --------------------
const PENDING_KEY = "salidas_sin_codigo_pendientes"; // la key canonical que usamos
// posibles keys antiguas (legacy) que otros módulos podrían haber usado
const LEGACY_PENDING_KEYS = [
  "PENDINGS_KEY_SALIDAS",
  "pending_salidas",
  "salidas_pending",
  "salidas_sin_codigo_pendientes" // incluida por si acaso se guarda directamente
];

  // -------------------- UTIL --------------------
  function nl(v){ return v === null || v === undefined ? "" : String(v); }
  function toNumber(v) {
    if (v === null || v === undefined || v === "") return 0;
    const cleaned = String(v).replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isNaN(n) ? 0 : n;
  }
  // redondeo seguro (usa en todo el módulo)
function roundFloat(n, decimals = 6) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function normalizeKeyName(s) {
    if (!s) return "";
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }
  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }
  
  // -------------------- Helpers similitud / normalización --------------------
function normalizeTextForCompare(s){
  if (!s) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, "")   // quitar acentos
    .replace(/[^a-z0-9\s]/g, "")                       // quitar símbolos
    .replace(/\s+/g, " ")                              // colapsar espacios
    .trim();
}

function levenshteinDistance(a, b){
  const as = String(a || ""), bs = String(b || "");
  if (as === bs) return 0;
  const la = as.length, lb = bs.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let v0 = new Array(lb + 1), v1 = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) v0[j] = j;
  for (let i = 0; i < la; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < lb; j++) {
      const cost = as[i] === bs[j] ? 0 : 1;
      v1[j+1] = Math.min(v1[j] + 1, v0[j+1] + 1, v0[j] + cost);
    }
    // swap
    const tmp = v0; v0 = v1; v1 = tmp;
  }
  return v0[lb];
}

function similarityRatio(a, b){
  const na = normalizeTextForCompare(a);
  const nb = normalizeTextForCompare(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - (dist / maxLen);
}


function ensureToast() {
  if (!document.getElementById("toast")) {
    const t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    // estilos inline robustos para evitar que CSS externos lo oculten
    Object.assign(t.style, {
      position: "fixed",
      top: "18px",
      right: "18px",
      padding: "10px 14px",
      borderRadius: "10px",
      color: "#fff",
      zIndex: "99999",
      display: "none",
      fontFamily: "'Quicksand', sans-serif",
      fontWeight: "600",
      boxShadow: "0 6px 20px rgba(2,6,23,0.18)",
      alignItems: "center",
      justifyContent: "center"
    });
    document.body.appendChild(t);
  }
}

function showToast(msg, ok = true, time = 3000) {
  ensureToast();
  const toast = document.getElementById("toast");
  if (!toast) return;

  // debug: log para confirmar invocación
  console.debug("showToast llamado:", msg, "ok:", ok, "duration:", time);

  // aplicar background según éxito/error
  const bg = ok ? "linear-gradient(90deg,#16a34a,#059669)" : "linear-gradient(90deg,#ef4444,#dc2626)";
  toast.style.background = bg;

  // Forzar visibilidad con inline style y prioridad
  toast.style.setProperty("display", "flex", "important");
  toast.style.setProperty("opacity", "1", "important");
  toast.style.setProperty("visibility", "visible", "important");

  toast.textContent = msg;

  // cancelar timeout previo si existe
  if (toast._t) {
    clearTimeout(toast._t);
  }

  // auto-hide
  toast._t = setTimeout(() => {
    try {
      toast.style.setProperty("opacity", "0", "important");
      toast.style.setProperty("visibility", "hidden", "important");
      // luego ocultar (no important, para que la próxima llamada lo muestre de nuevo)
      setTimeout(()=> toast.style.display = "none", 200);
    } catch(e){ console.warn("Error hiding toast", e); }
  }, time);
}
// ----------------- TOAST FORZADO + DEPURACIÓN -----------------
(function setupForcedToast() {
  // inject strong CSS so external CSS can't hide it
  try {
    if (!document.getElementById("__forced_toast_styles")) {
      const style = document.createElement("style");
      style.id = "__forced_toast_styles";
      style.textContent = `
        /* regla fuerte para que el toast nunca quede oculto por CSS externo */
        #toast, .toast {
          display: -webkit-box !important;
          display: -ms-flexbox !important;
          display: flex !important;
          -webkit-box-align: center !important;
          -ms-flex-align: center !important;
          align-items: center !important;
          -webkit-box-pack: center !important;
          -ms-flex-pack: center !important;
          justify-content: center !important;
          position: fixed !important;
          top: 18px !important;
          right: 18px !important;
          z-index: 999999 !important;
          padding: 10px 14px !important;
          border-radius: 10px !important;
          color: #fff !important;
          font-weight: 600 !important;
          box-shadow: 0 6px 20px rgba(2,6,23,0.18) !important;
          transition: opacity 0.2s ease !important;
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }
        /* small helper class for error/ok colors if needed */
        #toast.ok { background: linear-gradient(90deg,#16a34a,#059669) !important; }
        #toast.err { background: linear-gradient(90deg,#ef4444,#dc2626) !important; }
      `;
      document.head.appendChild(style);
    }
  } catch (e) {
    console.warn("No se pudo inyectar estilos de toast:", e);
  }

  // create toast if not exists
  if (!document.getElementById("toast")) {
    const t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    // inline defaults (seguros)
    Object.assign(t.style, {
      display: "flex",
      position: "fixed",
      top: "18px",
      right: "18px",
      zIndex: "999999",
      padding: "10px 14px",
      borderRadius: "10px",
      color: "#fff",
      fontWeight: "600",
      boxShadow: "0 6px 20px rgba(2,6,23,0.18)",
      alignItems: "center",
      justifyContent: "center",
      transition: "opacity 0.2s ease",
      opacity: "1",
      visibility: "visible"
    });
    document.body.appendChild(t);
    console.debug("setupForcedToast: #toast creado");
  } else {
    console.debug("setupForcedToast: #toast ya existía");
  }
})();

function ensureToast() {
  // ya creado en setupForcedToast, pero por compatibilidad comprobamos
  if (!document.getElementById("toast")) {
    const t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    Object.assign(t.style, {
      display: "flex",
      position: "fixed",
      top: "18px",
      right: "18px",
      zIndex: "999999",
      padding: "10px 14px",
      borderRadius: "10px",
      color: "#fff",
      fontWeight: "600",
      boxShadow: "0 6px 20px rgba(2,6,23,0.18)",
      alignItems: "center",
      justifyContent: "center",
      transition: "opacity 0.2s ease",
      opacity: "1",
      visibility: "visible"
    });
    document.body.appendChild(t);
    console.debug("ensureToast: creado de emergencia");
  }
}

function showToast(msg, ok = true, time = 3000) {
  ensureToast();
  const toast = document.getElementById("toast");
  if (!toast) {
    // última línea de defensa
    try { alert(msg); } catch(e){ console.error("alert fallback failed", e); }
    console.warn("showToast: no hay #toast, se usó alert como fallback");
    return;
  }

  // debug: mostrar en consola cada llamada
  console.debug("showToast llamado:", { msg, ok, time });

  // aplicar clase de color
  toast.classList.remove("ok", "err");
  toast.classList.add(ok ? "ok" : "err");

  // Mensaje y visibilidad forzados (inline style con setProperty "important")
  toast.textContent = msg;
  try {
    toast.style.setProperty("display", "flex", "important");
    toast.style.setProperty("opacity", "1", "important");
    toast.style.setProperty("visibility", "visible", "important");
  } catch (e) {
    // algunos navegadores/entornos pueden no soportar third arg; aun así debe funcionar
    toast.style.display = "flex";
    toast.style.opacity = "1";
    toast.style.visibility = "visible";
  }

  // limpiar timeout previo
  if (toast._t) clearTimeout(toast._t);

  // auto hide
  toast._t = setTimeout(() => {
    try {
      toast.style.setProperty("opacity", "0", "important");
      toast.style.setProperty("visibility", "hidden", "important");
      // pequeña espera antes de ocultar del todo
      setTimeout(()=> {
        try { toast.style.display = "none"; } catch(e){}
      }, 180);
    } catch (e) {
      // fallback directo
      toast.style.opacity = "0";
      toast.style.visibility = "hidden";
      setTimeout(()=> { toast.style.display = "none"; }, 180);
    }
  }, time);

  // comprobación post-show: si por alguna razón sigue oculto -> fallback alert
  setTimeout(() => {
    try {
      const cs = getComputedStyle(toast);
      console.debug("showToast computedStyle:", { display: cs.display, visibility: cs.visibility, opacity: cs.opacity });
      if ((cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) ) {
        // fallback
        console.warn("showToast: el toast sigue oculto — uso alert() como fallback");
        try { alert(msg); } catch(e){ console.error("alert fallback failed", e); }
      }
    } catch (e) {
      console.warn("showToast: error comprobando estilo computado", e);
    }
  }, 60);
}

//  showToast y añadir logs
function showActionToast(action, success = true, details = "") {
  const actions = {
    create: { success: "✅ Producto creado exitosamente", error: "❌ Error al crear el producto" },
    update: { success: "✏️ Producto actualizado exitosamente", error: "❌ Error al actualizar el producto" },
    delete: { success: "🗑️ Producto eliminado exitosamente", error: "❌ Error al eliminar el producto" },
    load: { success: "📦 Productos cargados exitosamente", error: "❌ Error al cargar productos" },
    search: { success: "🔍 Búsqueda completada", error: "❌ Error en la búsqueda" },
    entrada: { success: "📥 Entrada registrada exitosamente", error: "❌ Error al registrar entrada" },
    salida: { success: "📦 Salida agregada a pendientes", error: "❌ Error al registrar salida" },
    pendiente: { success: "⏳ Acción en pendientes completada", error: "❌ Error en pendientes" },
    clear: { success: "🧹 Pendientes eliminados", error: "❌ Error al eliminar pendientes" },
    historial: { success: "📜 Historial cargado", error: "❌ Error al cargar historial" },
    auth: { success: "🔐 Sesión verificada", error: "❌ Error de autenticación" },
    general: { success: "✅ Acción completada", error: "❌ Error en la acción" }
  };

  const messageType = actions[action] || actions.general;
  const message = success ? messageType.success : messageType.error;
  const fullMessage = details ? `${message}: ${details}` : message;

  try {
    console.debug("showActionToast:", { action, success, details, fullMessage });
    showToast(fullMessage, success, success ? 3000 : 4500);
  } catch (e) {
    console.error("showActionToast error:", e);
    try { alert(fullMessage); } catch(e2){ console.error("alert fallback failed", e2); }
  }
}


  function showConfirm(message, onConfirm, onCancel) {
    let modalC = document.getElementById("confirmModal");
    if (!modalC) {
      modalC = document.createElement("div");
      modalC.id = "confirmModal";
      Object.assign(modalC.style, { 
        position: "fixed", 
        inset: 0, 
        display: "none", 
        alignItems: "center", 
        justifyContent: "center", 
        background: "rgba(0,0,0,0.4)", 
        zIndex: 20000 
      });
      modalC.innerHTML = `
        <div class="modal-content" style="background:#fff;padding:18px;border-radius:10px;max-width:480px;width:95%">
          <p id="confirmMessage" style="margin:0 0 16px 0;font-size:16px;color:#333"></p>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
            <button id="btnConfirmNo" style="padding:8px 16px;border:1px solid #d1d5db;background:#f9fafb;border-radius:6px;cursor:pointer">Cancelar</button>
            <button id="btnConfirmYes" style="background:#ef4444;color:#fff;padding:8px 16px;border-radius:6px;border:none;cursor:pointer">Aceptar</button>
          </div>
        </div>`;
      document.body.appendChild(modalC);
    }
    modalC.style.display = "flex";
    modalC.querySelector("#confirmMessage").textContent = message;
    const yes = modalC.querySelector("#btnConfirmYes");
    const no = modalC.querySelector("#btnConfirmNo");

    function clean() {
      modalC.style.display = "none";
      yes.removeEventListener("click", y);
      no.removeEventListener("click", n);
    }
    function y() { clean(); onConfirm?.(); }
    function n() { clean(); onCancel?.(); }
    yes.addEventListener("click", y);
    no.addEventListener("click", n);
  }

  // -------------------- MAPA DE COLUMNAS (productos_sin_codigo) --------------------
  async function ensureProductosSinCodigoColumnMap() {
    if (PRODUCTOS_SIN_CODIGO_COLUMN_MAP) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
    PRODUCTOS_SIN_CODIGO_COLUMN_MAP = {};
    if (!supabase) {
      showActionToast("auth", false, "Supabase no inicializado");
      return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
    }
    try {
      const { data, error } = await supabase.from("productos_sin_codigo").select("*").limit(1);
      if (error) {
        console.warn("ensureProductosSinCodigoColumnMap error:", error);
        showActionToast("general", false, "Error al cargar mapa de columnas");
        return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
      }
      if (data && data.length > 0) {
        const sample = data[0];
        Object.keys(sample).forEach(k => { PRODUCTOS_SIN_CODIGO_COLUMN_MAP[normalizeKeyName(k)] = k; });
        showActionToast("general", true, "Mapa de columnas cargado");
      }
    } catch (e) { 
      console.warn(e);
      showActionToast("general", false, "Excepción en mapa de columnas");
    }
    return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
  }

  function getRealColForInventoryLabel(invLabel) {
    if (!PRODUCTOS_SIN_CODIGO_COLUMN_MAP) return null;
    if (!invLabel) return null;
    const candidates = [
      `INVENTARIO ${invLabel}`,
      `INVENTARIO_${invLabel}`,
      `${invLabel}`,
      invLabel.toLowerCase(),
      `inventario_${invLabel.toLowerCase()}`,
      `inventario ${invLabel}`
    ];
    for (const c of candidates) {
      const nk = normalizeKeyName(c);
      if (PRODUCTOS_SIN_CODIGO_COLUMN_MAP[nk]) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP[nk];
    }
    for (const k in PRODUCTOS_SIN_CODIGO_COLUMN_MAP) {
      if (k.includes("inventario") && k.includes(normalizeKeyName(invLabel))) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP[k];
    }
    for (const k in PRODUCTOS_SIN_CODIGO_COLUMN_MAP) {
      if (k.includes("inventario")) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP[k];
    }
    return null;
  }

  function getStockFromProduct(productObj, inventoryLabel) {
    if (!productObj) return 0;
    const keys = Object.keys(productObj);
    const normMap = new Map(keys.map(k => [normalizeKeyName(k), k]));
    const variants = [`inventario ${inventoryLabel}`, `inventario_${inventoryLabel}`, `${inventoryLabel}`, `${inventoryLabel.toLowerCase()}`];
    for (const v of variants) {
      const nk = normalizeKeyName(v);
      if (normMap.has(nk)) return toNumber(productObj[normMap.get(nk)]);
    }
    for (const k of keys) {
      const nk = normalizeKeyName(k);
      if (nk.includes("inventario") || nk.includes("almacen")) return toNumber(productObj[k]);
    }
    return 0;
  }

  // -------------------- TABLE SCROLL CONTAINER --------------------
  function ensureTableScrollContainer() {
    let wrapper = document.querySelector(".table-scroll-container");
    if (!wrapper && inventoryTable) {
      wrapper = document.createElement("div");
      wrapper.className = "table-scroll-container";
      wrapper.style.overflow = "auto";
      wrapper.style.maxHeight = "64vh";
      wrapper.style.padding = "6px";
      wrapper.style.borderRadius = "8px";
      wrapper.style.border = "1px solid rgba(0,0,0,0.04)";
      inventoryTable.parentNode.insertBefore(wrapper, inventoryTable);
      wrapper.appendChild(inventoryTable);
    }
    return wrapper;
  }

  // -------------------- BÚSQUEDA LOCAL MEJORADA --------------------
  let localSearchIndex = [];

  function prepareLocalSearchIndex() {
    if (!allProductsFromServer || allProductsFromServer.length === 0) {
      showActionToast("search", false, "No hay datos para indexar");
      return;
    }
    
    try {
      localSearchIndex = allProductsFromServer.map(product => {
        const searchableText = [
          product.CODIGO || '',
          product.DESCRIPCION || '',
          product.UM || ''
        ].join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        return {
          id: product.id,
          searchableText: searchableText,
          product: product
        };
      });
      showActionToast("search", true, `Índice local creado con ${localSearchIndex.length} productos`);
    } catch (error) {
      console.error("Error creando índice local:", error);
      showActionToast("search", false, "Error creando índice de búsqueda");
    }
  }

  function performLocalSearch(term) {
    if (!term || term.length === 0) {
      return allProductsFromServer.slice();
    }
    
    const normalizedTerm = term.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const results = localSearchIndex
      .filter(item => item.searchableText.includes(normalizedTerm))
      .map(item => item.product)
      .slice(0, 1000);

    return results;
  }

  // -------------------- LOAD / SEARCH (PAGINATED) MEJORADO --------------------
  async function loadAllProductsWithPagination() {
    if (!supabase) { 
      showActionToast("load", false, "Supabase no inicializado"); 
      return; 
    }
    try {
      showActionToast("load", true, "Cargando productos...");
      PRODUCTOS_SIN_CODIGO_COLUMN_MAP = null;
      await ensureProductosSinCodigoColumnMap();

      // cargar en lotes
      const BATCH = 1000;
      let offset = 0;
      allProductsFromServer = [];
      while (true) {
        const { data, error } = await supabase.from("productos_sin_codigo").select("*").order("id", { ascending: true }).range(offset, offset + BATCH - 1);
        if (error) {
          showActionToast("load", false, `Error en lote ${offset}: ${error.message}`);
          throw error;
        }
        if (!data || data.length === 0) break;
        allProductsFromServer = allProductsFromServer.concat(data);
        if (data.length < BATCH) break;
        offset += data.length;
      }

      paginatedProducts = allProductsFromServer.slice();
      currentPage = 1;
      totalProducts = paginatedProducts.length;
      ensureTableScrollContainer();
      ensurePaginationControlsExist();
      renderCurrentPage();
      updatePaginationControls();
      
      // Preparar índice de búsqueda local
      prepareLocalSearchIndex();
      
      showActionToast("load", true, `${allProductsFromServer.length} productos cargados exitosamente`);
    } catch (err) {
      console.error("loadAllProductsWithPagination err:", err);
      showActionToast("load", false, `Error: ${err.message}`);
    }
  }

  async function performServerSearchWithPagination(term) {
    if (!supabase) {
      showActionToast("search", false, "Conexión no disponible");
      return;
    }
    try {
      showActionToast("search", true, "Buscando en servidor...");
      
      const q = term.replace(/'/g, "''");
      const { data, error } = await supabase.from("productos_sin_codigo").select("*").or(`DESCRIPCION.ilike.%${q}%,CODIGO.ilike.%${q}%`).order("id", { ascending: true }).limit(5000);
      
      if (error) {
        showActionToast("search", false, `Error del servidor: ${error.message}`);
        throw error;
      }
      
      paginatedProducts = data || [];
      currentPage = 1;
      renderCurrentPage();
      updatePaginationControls();
      
      const resultCount = paginatedProducts.length;
      if (resultCount > 0) {
        showActionToast("search", true, `${resultCount} productos encontrados en servidor`);
      } else {
        showActionToast("search", false, "No se encontraron productos en el servidor");
      }
    } catch (err) {
      console.error("search err:", err);
      showActionToast("search", false, `Error en búsqueda: ${err.message}`);
      
      // Fallback a búsqueda local
      const localResults = performLocalSearch(term);
      paginatedProducts = localResults;
      currentPage = 1;
      renderCurrentPage();
      updatePaginationControls();
      
      if (localResults.length > 0) {
        showActionToast("search", true, `${localResults.length} productos encontrados localmente`);
      }
    }
  }

  function setupSearchWithPagination() {
    if (!searchInput) {
      showActionToast("general", false, "Campo de búsqueda no encontrado");
      return;
    }
    
    let lastSearchTerm = '';
    let searchMode = 'local';
    
    const performSearch = debounce((term) => {
      term = term.trim();
      
      if (!term) {
        searchMode = 'local';
        paginatedProducts = allProductsFromServer.slice();
        currentPage = 1;
        renderCurrentPage();
        updatePaginationControls();
        showActionToast("search", true, "Búsqueda limpiada");
        return;
      }
      
      // Si el término es muy corto, usar búsqueda local
      if (term.length <= 2) {
        searchMode = 'local';
        const localResults = performLocalSearch(term);
        paginatedProducts = localResults;
        
        if (localResults.length > 0) {
          showActionToast("search", true, `${localResults.length} productos encontrados localmente`);
        } else {
          showActionToast("search", false, "No se encontraron productos localmente");
        }
      } 
      // Si el término es más largo, buscar en servidor
      else {
        searchMode = 'server';
        performServerSearchWithPagination(term);
        return;
      }
      
      currentPage = 1;
      renderCurrentPage();
      updatePaginationControls();
      
    }, 300);

    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.trim();
      
      if (!term) {
        searchMode = 'local';
        paginatedProducts = allProductsFromServer.slice();
        currentPage = 1;
        renderCurrentPage();
        updatePaginationControls();
        return;
      }
      
      if (!term.startsWith(lastSearchTerm)) {
        searchMode = 'local';
      }
      
      lastSearchTerm = term;
      performSearch(term);
    });

    // También buscar al pegar texto
    searchInput.addEventListener("paste", (e) => {
      setTimeout(() => {
        const term = searchInput.value.trim();
        if (term) {
          searchMode = 'local';
          performSearch(term);
        }
      }, 100);
    });
  }

  // -------------------- RENDER TABLA --------------------
  function formatShowValue(v) { return v === null || v === undefined ? "0" : String(v); }

  function renderTable(products) {
    if (!tableBody) { 
      showActionToast("general", false, "Tabla no encontrada en el DOM");
      return; 
    }
    
    try {
      tableBody.innerHTML = "";
      
      if (!products || products.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:#666;">No hay productos que coincidan con la búsqueda</td></tr>`;
        return;
      }

      const frag = document.createDocumentFragment();
      
      products.forEach((p) => {
        const i069 = getStockFromProduct(p, "I069");
        const i078 = getStockFromProduct(p, "I078");
        const i07f = getStockFromProduct(p, "I07F");
        const i312 = getStockFromProduct(p, "I312");
        const i073 = getStockFromProduct(p, "I073");
        const almacen = getStockFromProduct(p, "ALMACEN") || 0;
        const stockReal = i069 + i078 + i07f + i312 + i073 + almacen;

        const tr = document.createElement("tr");
        if (stockReal <= 1) tr.classList.add("stock-low");
        else if (stockReal <= 10) tr.classList.add("stock-medium");
        else tr.classList.add("stock-high");

        // Crear celdas más eficientemente
        tr.innerHTML = `
          <td>${escapeHtml(nl(p.CODIGO) || "S/C")}</td>
          <td>${escapeHtml(nl(p.DESCRIPCION))}</td>
          <td>${escapeHtml(nl(p.UM))}</td>
          <td>${String(i069)}</td>
          <td>${String(i078)}</td>
          <td>${String(i07f)}</td>
          <td>${String(i312)}</td>
          <td>${String(i073)}</td>
          <td>${String(stockReal)}</td>
          <td class="acciones">
            <button class="btn-edit" title="Editar">✏️</button>
            <button class="btn-delete" title="Eliminar">🗑️</button>
            <button class="btn-salida" title="Registrar Salida">📦</button>
            <button class="btn-entrada" title="Registrar Entrada">📥</button>
            <button class="btn-historial" title="Historial de entradas">📜</button>
          </td>
        `;

        // Añadir event listeners
        const btnEdit = tr.querySelector(".btn-edit");
        const btnDelete = tr.querySelector(".btn-delete");
        const btnSalida = tr.querySelector(".btn-salida");
        const btnEntrada = tr.querySelector(".btn-entrada");
        const btnHist = tr.querySelector(".btn-historial");

        btnEdit.addEventListener("click", () => editarProductoById(p.id));
        btnDelete.addEventListener("click", () => eliminarProducto(String(p.id)));
        btnSalida.addEventListener("click", () => registrarSalida(p));
        btnEntrada.addEventListener("click", () => openEntradaModalById(p));
        btnHist.addEventListener("click", () => openEntradaHistoryModal(p));

        frag.appendChild(tr);
      });

      tableBody.appendChild(frag);
      showActionToast("general", true, `${products.length} productos renderizados`);
      
    } catch (error) {
      console.error("Error renderizando tabla:", error);
      showActionToast("general", false, "Error al renderizar la tabla");
    }
  }

  // -------------------- PAGINACIÓN --------------------
  function ensurePaginationControlsExist() {
    let container = document.getElementById("paginationControls");
    if (!container) {
      container = document.createElement("div");
      container.id = "paginationControls";
      container.className = "pagination-compact";
      container.style.margin = "12px 0";
      const wrapper = document.querySelector(".table-scroll-container") || inventoryTable.parentNode;
      wrapper.parentNode.insertBefore(container, wrapper.nextSibling);
    }
    return container;
  }

  function updatePaginationControls() {
    try {
      const container = ensurePaginationControlsExist();
      const total = paginatedProducts.length;
      totalProducts = total;
      const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
      if (currentPage > totalPages) currentPage = totalPages;
      const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
      const end = Math.min(currentPage * ITEMS_PER_PAGE, total);

      container.style.display = "";
      container.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;justify-content:center;padding:8px;flex-wrap:wrap">
          <button id="firstPage" ${currentPage===1?'disabled':''} title="Primera página">⏮️</button>
          <button id="prevPage" ${currentPage===1?'disabled':''} title="Página anterior">◀️</button>
          <span>Página</span>
          <input id="pageInput" type="number" value="${currentPage}" min="1" max="${totalPages}" style="width:60px;text-align:center" title="Ir a página" />
          <span>de ${totalPages}</span>
          <button id="nextPage" ${currentPage===totalPages?'disabled':''} title="Página siguiente">▶️</button>
          <button id="lastPage" ${currentPage===totalPages?'disabled':''} title="Última página">⏭️</button>
          <div style="margin-left:12px">📊 ${total===0?0:start}-${end} de ${total}</div>
        </div>
      `;
      
      container.querySelector("#firstPage").addEventListener("click", ()=>goToPage(1));
      container.querySelector("#prevPage").addEventListener("click", ()=>goToPage(currentPage-1));
      container.querySelector("#nextPage").addEventListener("click", ()=>goToPage(currentPage+1));
      container.querySelector("#lastPage").addEventListener("click", ()=>goToPage(totalPages));
      container.querySelector("#pageInput").addEventListener("change", (e)=> {
        let p = parseInt(e.target.value) || 1;
        if (p < 1) p = 1;
        if (p > totalPages) p = totalPages;
        goToPage(p);
      });
      
    } catch (error) {
      console.error("Error actualizando controles de paginación:", error);
      showActionToast("general", false, "Error en controles de paginación");
    }
  }

  function getCurrentPageItems() {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return paginatedProducts.slice(start, start + ITEMS_PER_PAGE);
  }

  function renderCurrentPage() { 
    try {
      renderTable(getCurrentPageItems());
    } catch (error) {
      showActionToast("general", false, "Error al renderizar página actual");
    }
  }
  // intenta encontrar el botón (por id o por texto) y crear/actualizar badge
(function ensureVerSalidasBadgeOnProductsPage(){
  try {
    // buscar botón por id o por texto "ver salidas"
    const btn = document.getElementById('btnVerSalidas') ||
                Array.from(document.querySelectorAll('button,a')).find(el => el.textContent && /ver\s+salidas/i.test(el.textContent));
    if (!btn) {
      console.debug("ensureVerSalidasBadge: botón 'Ver Salidas' no encontrado en esta página");
      return;
    }
    // añadir clase para posicionar badge
    if (!btn.classList.contains('has-badge')) btn.classList.add('has-badge');

    // crear badge si no existe
    let badge = document.getElementById('verSalidasBadge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'verSalidasBadge';
      badge.className = 'button-badge';
      btn.appendChild(badge);
    }

    // actualizar con el número real
    const count = (typeof getPendingSalidas === 'function') ? getPendingSalidas().length : 0;
    if (!count) badge.style.display = 'none';
    else { badge.style.display = 'inline-block'; badge.textContent = count > 99 ? '99+' : String(count); }
    console.debug("ensureVerSalidasBadge: aplicado, count=", count);
  } catch (err) {
    console.error("ensureVerSalidasBadge error:", err);
  }
})();


  function goToPage(page) {
    try {
      const totPages = Math.max(1, Math.ceil(paginatedProducts.length / ITEMS_PER_PAGE));
      if (page < 1) page = 1;
      if (page > totPages) page = totPages;
      currentPage = page;
      renderCurrentPage();
      updatePaginationControls();
      showActionToast("general", true, `Página ${page} de ${totPages}`);
    } catch (error) {
      showActionToast("general", false, "Error al cambiar de página");
    }
  }

  // -------------------- CRUD PRODUCTOS --------------------
// Reemplaza la función saveProductFromForm por esta versión
async function saveProductFromForm(ev) {
  ev && ev.preventDefault && ev.preventDefault();
  if (!productForm) {
    showActionToast("general", false, "Formulario no disponible");
    return;
  }

  const btnSave = productForm.querySelector(".btn-save");
  const prevText = btnSave ? btnSave.textContent : null;

  // --- Helpers de similitud (se definen si no existen) ---
  if (typeof normalizeTextForCompare === "undefined") {
    window.normalizeTextForCompare = function(s){
      if (!s) return "";
      return String(s)
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };
  }
  if (typeof levenshteinDistance === "undefined") {
    window.levenshteinDistance = function(a,b){
      const as = String(a||""), bs = String(b||"");
      if (as === bs) return 0;
      const la = as.length, lb = bs.length;
      if (la === 0) return lb;
      if (lb === 0) return la;
      let v0 = new Array(lb+1), v1 = new Array(lb+1);
      for (let j=0;j<=lb;j++) v0[j]=j;
      for (let i=0;i<la;i++){
        v1[0]=i+1;
        for (let j=0;j<lb;j++){
          const cost = as[i] === bs[j] ? 0 : 1;
          v1[j+1] = Math.min(v1[j] + 1, v0[j+1] + 1, v0[j] + cost);
        }
        const tmp = v0; v0 = v1; v1 = tmp;
      }
      return v0[lb];
    };
  }
  if (typeof similarityRatio === "undefined") {
    window.similarityRatio = function(a,b){
      const na = normalizeTextForCompare(a);
      const nb = normalizeTextForCompare(b);
      if (!na && !nb) return 1;
      if (!na || !nb) return 0;
      const dist = levenshteinDistance(na, nb);
      const maxLen = Math.max(na.length, nb.length);
      return maxLen === 0 ? 1 : (1 - (dist / maxLen));
    };
  }

  try {
    if (!supabase) { showActionToast("create", false, "Conexión a BD no disponible"); return; }

    if (btnSave) { btnSave.disabled = true; btnSave.textContent = editMode ? "Guardando..." : "Creando..."; }

    const descripcion = (productForm.querySelector('[name="descripcion"]')?.value || "").trim();
    const um = (productForm.querySelector('[name="um"]')?.value || "").trim();

    if (!descripcion) {
      showActionToast("create", false, "La descripción es obligatoria");
      if (btnSave) { btnSave.disabled = false; if (prevText) btnSave.textContent = prevText; }
      return;
    }

    // --- comprobar similitud con productos existentes (solo en creación) ---
    if (!editMode) {
      try {
        // buscar candidatos por texto parecido (ilike) para limitar resultados
        const q = descripcion.replace(/'/g, "''");
        const { data: candidates, error: candErr } = await supabase
          .from("productos_sin_codigo")
          .select("id, DESCRIPCION")
          .ilike("DESCRIPCION", `%${q}%`)
          .limit(30);

        if (candErr) {
          console.warn("saveProductFromForm: error buscando candidatos:", candErr);
          // no bloqueamos si falla la búsqueda; procedemos a inserción
        } else if (Array.isArray(candidates) && candidates.length > 0) {
          const THRESHOLD = 0.70; // ajustar si quieres más o menos estricto
          const similars = [];
          for (const c of candidates) {
            const candDesc = c.DESCRIPCION || "";
            const sim = similarityRatio(descripcion, candDesc);
            if (sim >= THRESHOLD) similars.push({ id: c.id, descripcion: candDesc, score: sim });
          }
          if (similars.length > 0) {
            similars.sort((a,b) => b.score - a.score);
            const top = similars.slice(0,3).map(s => `• "${s.descripcion}" (${Math.round(s.score*100)}%)`).join("\n");
            showActionToast("create", false, `Existe(n) producto(s) muy similar(es):\n${top}`);
            if (btnSave) { btnSave.disabled = false; if (prevText) btnSave.textContent = prevText; }
            return;
          }
        }
      } catch (err) {
        console.warn("saveProductFromForm: excepción al buscar similares:", err);
        // no bloqueamos; continuamos
      }
    }

    // --- insertar o actualizar ---
    if (editMode && editingId) {
      const upd = { DESCRIPCION: descripcion, UM: um };
      const { error } = await supabase.from("productos_sin_codigo").update(upd).eq("id", editingId);

      if (error) {
        showActionToast("update", false, error.message || "Error al actualizar");
        throw error;
      }

      showActionToast("update", true, `"${descripcion}" actualizado`);
        } else {
        // --- NUEVO: comprobación de duplicados por DESCRIPCION (similar) ---
        // normalizamos la descripcion para la búsqueda
        const descripcionNorm = descripcion.replace(/'/g, "''").trim();
        if (!descripcionNorm) {
          showActionToast("create", false, "Descripción vacía");
          return;
        }

        try {
          // Buscar coincidencias aproximadas en servidor: usamos ilike con la frase completa
          // y una sub-frase (primeros 10 caracteres) para aumentar chances de detectar "similares".
          const short = descripcionNorm.substring(0, Math.min(10, descripcionNorm.length));
          const orQuery = `DESCRIPCION.ilike.%${descripcionNorm}%,DESCRIPCION.ilike.%${short}%`;
          const { data: dup, error: dupErr } = await supabase
            .from("productos_sin_codigo")
            .select("id, DESCRIPCION")
            .or(orQuery)
            .limit(1);

          if (dupErr) {
            console.warn("Error buscando duplicados:", dupErr);
            // no bloqueamos por fallo de búsqueda, pero avisamos
            showActionToast("create", false, "Error comprobando duplicados (revisa consola)");
            return;
          }
          if (dup && dup.length > 0) {
            // Si hay una coincidencia devolvemos un mensaje y no insertamos
            showActionToast("create", false, `Ya existe un producto con descripción parecida: "${dup[0].DESCRIPCION}"`);
            return;
          }
        } catch (err) {
          console.error("Error en check duplicados:", err);
          showActionToast("create", false, "Error comprobando duplicados");
          return;
        }

        // --- Preparar objeto a insertar ---
        await ensureProductosSinCodigoColumnMap();
        const insertObj = {
          CODIGO: "S/C",               // <-- importante: no puede ser null; usamos "S/C"
          DESCRIPCION: descripcion,
          UM: um || null
        };

        // inicializar las columnas de inventario (si existen) a 0
        ["I069","I078","I07F","I312","I073","ALMACEN"].forEach(lbl => {
          const col = getRealColForInventoryLabel(lbl);
          if (col) insertObj[col] = 0;
        });

        // finalmente insertar
        const { error } = await supabase.from("productos_sin_codigo").insert([insertObj]);

        if (error) {
          console.error("Error al insertar producto:", error);
          showActionToast("create", false, error.message || "Error al crear producto");
          throw error;
        }

        showActionToast("create", true, `"${descripcion}" creado`);
      }


    closeProductModal();
    await loadAllProductsWithPagination();

  } catch (err) {
    console.error("saveProductFromForm err:", err);
    showActionToast(editMode ? "update" : "create", false, (err && err.message) ? err.message : "Error inesperado");
  } finally {
    if (btnSave) { btnSave.disabled = false; if (prevText) btnSave.textContent = prevText; }
    editMode = false; editingId = null;
  }
}

  function clearProductFormFields() {
    if (!productForm) return;
    productForm.reset();
    editMode = false; 
    editingId = null;
  }

  function openProductModal() {
    if (!modal) {
      showActionToast("general", false, "Modal no disponible");
      return;
    }
    
    try {
      modal.style.display = "flex";
      const title = modal.querySelector("#modalTitle");
      if (title) title.textContent = "Agregar Producto";
      const saveBtn = productForm?.querySelector(".btn-save");
      if (saveBtn) saveBtn.textContent = "💾 Guardar";
      showActionToast("general", true, "Modal de producto abierto");
    } catch (error) {
      showActionToast("general", false, "Error al abrir modal");
    }
  }

  function closeProductModal() {
    if (!modal) return;
    
    try {
      modal.style.display = "none";
      clearProductFormFields();
      showActionToast("general", true, "Modal cerrado");
    } catch (error) {
      showActionToast("general", false, "Error al cerrar modal");
    }
  }

  function editarProductoById(id) {
    try {
      const prod = allProductsFromServer.find(x => String(x.id) === String(id));
      if (!prod) { 
        showActionToast("update", false, "Producto no encontrado"); 
        return; 
      }
      
      if (!modal || !productForm) { 
        showActionToast("update", false, "Formulario no disponible"); 
        return; 
      }
      
      editMode = true;
      editingId = prod.id;
      modal.style.display = "flex";
      const setVal = (name, val) => { 
        const el = productForm.querySelector(`[name="${name}"]`); 
        if (el) el.value = val ?? ""; 
      };
      
      setVal("descripcion", prod.DESCRIPCION ?? "");
      setVal("um", prod.UM ?? "");
      
      const title = modal.querySelector("#modalTitle"); 
      if (title) title.textContent = "Editar Producto";
      
      const saveBtn = productForm.querySelector(".btn-save"); 
      if (saveBtn) saveBtn.textContent = "Guardar Cambios";
      
      showActionToast("update", true, `Editando: ${prod.DESCRIPCION}`);
      
    } catch (error) {
      showActionToast("update", false, "Error al preparar edición");
    }
  }

  async function eliminarProducto(id) {
    if (!id) {
      showActionToast("delete", false, "ID no válido");
      return;
    }
    
    try {
      const { data: producto, error: fetchErr } = await supabase.from("productos_sin_codigo").select("DESCRIPCION").eq("id", id).maybeSingle();
      
      if (fetchErr) {
        showActionToast("delete", false, fetchErr.message);
        throw fetchErr;
      }
      
      const nombre = producto?.DESCRIPCION || `id ${id}`;
      
      showConfirm(`¿Eliminar el producto "${nombre}"? Esta acción no se puede deshacer.`, 
        async ()=> {
          try {
            const { error } = await supabase.from("productos_sin_codigo").delete().eq("id", id);
            
            if (error) { 
              showActionToast("delete", false, error.message); 
              throw error; 
            }
            
            showActionToast("delete", true, `"${nombre}" eliminado`);
            await loadAllProductsWithPagination();
            
          } catch (err) {
            console.error("eliminarProducto err:", err);
            showActionToast("delete", false, err.message);
          }
        }, 
        ()=>{
          showActionToast("delete", true, "Eliminación cancelada");
        }
      );
      
    } catch (err) {
      console.error("eliminarProducto err:", err);
      showActionToast("delete", false, err.message);
    }
  }
// -------------------- BADGE PARA VER SALIDAS --------------------
function updateVerSalidasBadge(count) {
  const btn = document.getElementById('btnVerSalidas');
  if (!btn) return;
  
  // Asegurar que el botón tenga posición relativa para el badge
  if (!btn.classList.contains('has-badge')) {
    btn.classList.add('has-badge');
    btn.style.position = 'relative';
  }

  let badge = document.getElementById('verSalidasBadge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'verSalidasBadge';
    badge.className = 'ver-salidas-badge';
    badge.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      background: #ef4444;
      color: white;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    btn.appendChild(badge);
  }

  if (!count || count === 0) {
    badge.style.display = 'none';
    return;
  }

  badge.style.display = 'flex';
  badge.textContent = count > 99 ? '99+' : String(count);
}

// Modificar la función addPendingSalida para actualizar el badge
// Lee pendientes intentando múltiples keys y normalizando
function getPendingSalidas(){
  try {
    // primero la key canonical
    let raw = localStorage.getItem(PENDING_KEY);
    // si no hay nada, buscar en legacy keys
    if (!raw) {
      for (const k of LEGACY_PENDING_KEYS) {
        const v = localStorage.getItem(k);
        if (v) { raw = v; break; }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("getPendingSalidas error:", err);
    return [];
  }
}

// Guarda pendientes usando la key canonical y actualiza el badge
function savePendingSalidas(list){
  try {
    if (!Array.isArray(list)) {
      console.warn("savePendingSalidas recibió no-array, convirtiendo a []");
      list = [];
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    // opcional: también mantener legacy keys sincronizadas (descomenta si lo deseas)
    // for (const k of LEGACY_PENDING_KEYS) localStorage.setItem(k, JSON.stringify(list));

    // actualizar badge si existe la función
    try { if (typeof updateVerSalidasBadge === 'function') updateVerSalidasBadge(getPendingSalidas().length); } catch(e){ console.warn("badge update failed", e); }

    return true;
  } catch (err) {
    console.error("savePendingSalidas error:", err);
    showToast("Error al guardar pendientes", false);
    return false;
  }
}


// Modificar renderPendingList para actualizar el badge
function renderPendingList() {
  if (!tablaPendientesBody) {
    showActionToast("pendiente", false, "Tabla de pendientes no encontrada");
    return;
  }
  
  try {
    const list = getPendingSalidas();
    tablaPendientesBody.innerHTML = "";
    
    if (!list || list.length === 0) {
      tablaPendientesBody.innerHTML = `<tr><td colspan="9" style="text-align:center">No hay salidas pendientes</td></tr>`;
      updatePendingCount();
      updateVerSalidasBadge(0); // ← Actualizar badge a 0
      showActionToast("pendiente", true, "No hay pendientes");
      return;
    }
    
    // ... resto del código de renderizado ...
    
    updatePendingCount();
    updateVerSalidasBadge(list.length); // ← Actualizar badge con el conteo actual
    showActionToast("pendiente", true, `${list.length} pendientes cargados`);
    
  } catch (error) {
    console.error("Error renderizando pendientes:", error);
    showActionToast("pendiente", false, "Error al cargar pendientes");
  }
}

// Modificar confirmAllPendings para actualizar el badge
async function confirmAllPendings() {
  const list = getPendingSalidas();
  if (!list || list.length === 0) { 
    showActionToast("confirm", false, "No hay pendientes para confirmar"); 
    return; 
  }
  
  showConfirm(`Confirmar todas las pendientes (${list.length})?`, 
    async () => {
      try {
        await processPendings(list, "salidas");
        savePendingSalidas([]);
        renderPendingList();  
        updateVerSalidasBadge(0); // ← Actualizar badge a 0 después de confirmar
        await loadAllProductsWithPagination();
        showActionToast("confirm", true, `${list.length} pendientes confirmados`);
      } catch (error) {
        showActionToast("confirm", false, "Error al confirmar pendientes");
      }
    },
    () => {
      showActionToast("confirm", true, "Confirmación cancelada");
    }
  );
}
  // -------------------- PENDIENTES SALIDAS --------------------
  function getPendingSalidas() { 
    try {
      return JSON.parse(localStorage.getItem(PENDINGS_KEY_SALIDAS) || "[]");
    } catch (error) {
      showActionToast("pendiente", false, "Error al leer pendientes");
      return [];
    }
  }
  
function savePendingSalidas(list){ 
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    // actualizar badge cuando cambian los pendientes (longitud real)
    try { updateVerSalidasBadge(getPendingSalidas().length); } catch(e){ /* noop */ }
  } catch (err) {
    console.error("savePendingSalidas error:", err);
    showToast("Error al guardar pendientes", false);
  }
}



  function addPendingSalida(pendiente) {
    try {
      const list = getPendingSalidas();
      pendiente.id = pendiente.id || String(Date.now());
      list.push(pendiente);
      savePendingSalidas(list);
      showActionToast("salida", true, "Salida agregada a pendientes");
      renderPendingList();
      updatePendingCount();
    
    } catch (error) {
      showActionToast("salida", false, "Error al agregar salida pendiente");
    }
  }

  function renderPendingList() {
  if (!tablaPendientesBody) {
    showActionToast("pendiente", false, "Tabla de pendientes no encontrada");
    return;
  }
  updatePendingCount();
// actualizar badge basado en la longitud actual
try { updateVerSalidasBadge(getPendingSalidas().length); } catch(e){/* noop */ }

  
  try {
    const list = getPendingSalidas();
    tablaPendientesBody.innerHTML = "";
    
    if (!list || list.length === 0) {
      tablaPendientesBody.innerHTML = `<tr><td colspan="9" style="text-align:center">No hay salidas pendientes</td></tr>`;
      updatePendingCount();
      // actualizar badge
      try { updateVerSalidasBadge(0); } catch(e){/* noop */ }
      showActionToast("pendiente", true, "No hay pendientes");
      return;
    }
    
    list.forEach((it, idx) => {
      const codigo = (it.CODIGO && String(it.CODIGO).trim() !== "") ? String(it.CODIGO) : "S/C";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(codigo)}</td>
        <td>${escapeHtml(it.DESCRIPCION || "")}</td>
        <td>${escapeHtml(it.UM || "")}</td>
        <td>${escapeHtml(it.INVENTARIO_ORIGEN || "")}</td>
        <td><input type="number" min="1" value="${escapeHtml(String(it.CANTIDAD || 0))}" data-idx="${idx}" class="pending-cantidad" style="width:90px" /></td>
        <td>${escapeHtml(it.RESPONSABLE || "")}</td>
        <td>${escapeHtml(it.DESTINATARIO || "")}</td>
        <td>${escapeHtml(it.OBSERVACIONES || "")}</td>
        <td>
          <button class="confirm-single" data-idx="${idx}">Confirmar</button>
          <button class="remove-pend" data-idx="${idx}">Eliminar</button>
        </td>
      `;
      tablaPendientesBody.appendChild(tr);
    });

    // events
    tablaPendientesBody.querySelectorAll(".confirm-single").forEach(b => {
      b.addEventListener("click", async (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const listNow = getPendingSalidas();
        if (!listNow[idx]) {
          showActionToast("pendiente", false, "Pendiente no encontrado");
          return;
        }
        
        try {
          // procesar solo ese item
          await processPendings([listNow[idx]], "salidas");
          // reconstruir la lista actualizada a partir de localStorage (por si processPendings la modificó)
          const newList = getPendingSalidas().filter((_,i) => i !== idx);
          savePendingSalidas(newList);
          renderPendingList();
          // actualizar badge con la longitud real
          updateVerSalidasBadge(newList.length);
          await loadAllProductsWithPagination();
          showActionToast("confirm", true, "Pendiente confirmado individualmente");
        } catch (error) {
          console.error("Error confirm-single:", error);
          showActionToast("confirm", false, "Error al confirmar pendiente individual");
        }
      });
    });
    
    tablaPendientesBody.querySelectorAll(".remove-pend").forEach(b => {
      b.addEventListener("click", (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const listNow = getPendingSalidas();
        if (!listNow[idx]) {
          showActionToast("pendiente", false, "Pendiente no encontrado");
          return;
        }
        
        listNow.splice(idx, 1);
        savePendingSalidas(listNow);
        renderPendingList();
        updateVerSalidasBadge(listNow.length);

        showActionToast("pendiente", true, "Pendiente eliminado");
      });
    });
    
    tablaPendientesBody.querySelectorAll(".pending-cantidad").forEach(inp => {
      inp.addEventListener("change", (e) => {
        const idx = Number(e.target.dataset.idx);
        const v = Number(e.target.value || 0);
        const listNow = getPendingSalidas();
        if (!listNow[idx]) return;
        listNow[idx].CANTIDAD = v;
        listNow[idx].ADDED_AT = new Date().toISOString();
        savePendingSalidas(listNow);
        showActionToast("pendiente", true, "Cantidad actualizada");
        // badge no cambia al actualizar cantidad
      });
    });

    updatePendingCount();
    // actualizar badge (longitud actual)
    updateVerSalidasBadge(list.length);
    showActionToast("pendiente", true, `${list.length} pendientes cargados`);
    
  } catch (error) {
    console.error("Error renderizando pendientes:", error);
    showActionToast("pendiente", false, "Error al cargar pendientes");
  }
}


  function updatePendingCount() {
    try {
      const count = getPendingSalidas().length;
      if (btnConfirmAll) btnConfirmAll.textContent = `Confirmar pendientes (${count})`;
    } catch (error) {
      showActionToast("pendiente", false, "Error actualizando contador");
    }
  }

  async function confirmAllPendings() {
    const list = getPendingSalidas();
    if (!list || list.length === 0) { 
      showActionToast("confirm", false, "No hay pendientes para confirmar"); 
      return; 
    }
    
    showConfirm(`Confirmar todas las pendientes (${list.length})?`, 
      async () => {
        try {
          await processPendings(list, "salidas");
          savePendingSalidas([]);
          renderPendingList();  
        try { updateVerSalidasBadge(getPendingSalidas().length); } catch(e){ /* noop */ }
        await loadAllProductsWithPagination();
          showActionToast("confirm", true, `${list.length} pendientes confirmados`);
        } catch (error) {
          showActionToast("confirm", false, "Error al confirmar pendientes");
        }
      },
      () => {
        showActionToast("confirm", true, "Confirmación cancelada");
      }
    );
  }

  // processPendings: salidas o entradas (entradas no se usan aquí pero soportado)
  async function processPendings(items, mode = "salidas") {
    if (!supabase) { 
      showActionToast("pendiente", false, "Conexión no disponible"); 
      return; 
    }
    
    let successes = 0, errors = 0;
    
    for (const it of items) {
      try {
        if (mode === "salidas" || (it.INVENTARIO_ORIGEN && mode !== "entradas")) {
          // insertar en salidas_sin_codigo
          const salidaObj = {
            PRODUCT_ID: it.PRODUCT_ID ?? null,
            CODIGO: it.CODIGO ?? null,
            DESCRIPCION: it.DESCRIPCION ?? "",
            CANTIDAD: it.CANTIDAD,
            INVENTARIO_ORIGEN: it.INVENTARIO_ORIGEN,
            RESPONSABLE: it.RESPONSABLE,
            DESTINATARIO: it.DESTINATARIO || null,
            OBSERVACIONES: it.OBSERVACIONES || null,
            FECHA: new Date().toISOString()
          };
          const { error: insErr } = await supabase.from("salidas_sin_codigo").insert([salidaObj]);
          if (insErr) throw insErr;

          // restar stock en productos_sin_codigo
          await ensureProductosSinCodigoColumnMap();
          const realCol = getRealColForInventoryLabel(it.INVENTARIO_ORIGEN);
          if (realCol && it.PRODUCT_ID) {
            const { data: prodRow, error: selErr } = await supabase.from("productos_sin_codigo").select(realCol).eq("id", it.PRODUCT_ID).maybeSingle();
            if (selErr) throw selErr;
            const current = toNumber(prodRow ? prodRow[realCol] : 0);
            const nuevo = Math.max(0, current - Number(it.CANTIDAD || 0));
            const upd = {}; upd[realCol] = nuevo;
            const { error: updErr } = await supabase.from("productos_sin_codigo").update(upd).eq("id", it.PRODUCT_ID);
            if (updErr) throw updErr;
          }
        } else {
          // entradas (si se usa)
          const entradaObj = {
            PRODUCT_ID: it.PRODUCT_ID ?? null,
            DESCRIPCION: it.DESCRIPCION ?? "",
            CANTIDAD: it.CANTIDAD,
            INVENTARIO_DESTINO: it.INVENTARIO_DESTINO || null,
            RESPONSABLE: it.RESPONSABLE || null,
            OBSERVACIONES: it.OBSERVACIONES || null,
            FECHA: new Date().toISOString()
          };
          const { error: insErr } = await supabase.from("entradas_sin_codigo").insert([entradaObj]);
          if (insErr) throw insErr;

          await ensureProductosSinCodigoColumnMap();
          const realCol = getRealColForInventoryLabel(it.INVENTARIO_DESTINO);
          if (realCol && it.PRODUCT_ID) {
            const { data: prodRow, error: selErr } = await supabase.from("productos_sin_codigo").select(realCol).eq("id", it.PRODUCT_ID).maybeSingle();
            if (selErr) throw selErr;
            const current = toNumber(prodRow ? prodRow[realCol] : 0);
            const nuevo = current + Number(it.CANTIDAD || 0);
            const upd = {}; upd[realCol] = nuevo;
            const { error: updErr } = await supabase.from("productos_sin_codigo").update(upd).eq("id", it.PRODUCT_ID);
            if (updErr) throw updErr;
          }
        }
        successes++;
      } catch (err) {
        console.error("Error procesando pendiente:", err, it);
        errors++;
      }
    }
    
    if (errors === 0) {
      showActionToast("confirm", true, `${successes} pendientes procesados exitosamente`);
    } else {
      showActionToast("confirm", false, `${successes} exitos, ${errors} errores`);
    }
    
    return { successes, errors };
  }
  
// --- Fallbacks ligeros para toasts (si no existen) ---
if (!window.MessageSystem) {
  class _MS {
    static createContainer() {
      if (document.getElementById("message-system-container")) return;
      const c = document.createElement("div");
      c.id = "message-system-container";
      c.style.cssText = "position:fixed;top:18px;right:18px;z-index:20000;display:flex;flex-direction:column;gap:8px;max-width:420px";
      document.body.appendChild(c);
    }
    static show(msg, type='info', timeout=4000) {
      try {
        this.createContainer();
        const cont = document.getElementById("message-system-container");
        const el = document.createElement("div");
        el.style.cssText = "padding:10px;border-radius:8px;background:#fff;border:1px solid #e6e6e6;box-shadow:0 6px 20px rgba(0,0,0,0.06);font-family:Inter,system-ui;max-width:360px";
        el.textContent = String(msg);
        cont.prepend(el);
        if (timeout>0) setTimeout(()=>el.remove(), timeout);
      } catch(e){ console.log(msg); }
    }
  }
  window.MessageSystem = _MS;
}

// compat wrappers (no-op pero útiles)
window.showAlertToast = window.showAlertToast || function(message, type="info", time=4000) {
  try { return window.MessageSystem.show(message, type, time); } catch(e){ console.log(message); };
};
window.showDetailedToast = window.showDetailedToast || function(title, lines = [], options = {}) {
  const parts = [title].concat(lines.map(l => typeof l==='string'?l:(l.label?`${l.label}: ${l.value}`:JSON.stringify(l))));
  return window.MessageSystem.show(parts.join("\n"), 'info', options.timeoutMs ?? 5000);
};

  // -------------------- SALIDAS: modal dinámico --------------------
  async function registrarSalida(producto) {
    try {
      await openSalidaModal(producto);
      showActionToast("salida", true, `Preparando salida para: ${producto.DESCRIPCION}`);
    } catch (error) {
      showActionToast("salida", false, "Error al abrir modal de salida");
    }
  }

 // ---------- openSalidaModal (reemplaza la versión anterior) ----------
async function openSalidaModal(producto) {
  // eliminar modal previo si existe
  const existing = document.getElementById("salidaModalOverlay");
  if (existing) existing.remove();

  // overlay
  const overlay = document.createElement("div");
  overlay.id = "salidaModalOverlay";
  overlay.className = "salida-overlay";

  // modal (con scroll y max-height)
  const modal = document.createElement("div");
  modal.className = "salida-modal";
  modal.style.overflow = "auto";
  modal.style.maxHeight = "86vh";

  modal.innerHTML = `
    <div class="header">
      <h3>Salida — ${escapeHtml(producto.CODIGO || "")} ${producto.DESCRIPCION ? "— " + escapeHtml(producto.DESCRIPCION) : ""}</h3>
      <button id="salidaCloseX" aria-label="Cerrar" style="background:transparent;border:none;font-size:18px;cursor:pointer">✕</button>
    </div>

    <div class="salida-grid">
      <div>
        <label style="font-size:13px;color:#334155">Cantidad total requerida</label>
        <input id="salidaCantidadInputModal" class="input-text" type="number" min="0" step="any" placeholder="Ej. 5" />
      </div>
      <div>
        <label style="font-size:13px;color:#334155">UM</label>
        <input id="salidaUM" class="input-text" type="text" value="${escapeHtml(producto.UM || '')}" readonly />
      </div>
    </div>

    <div style="margin-top:6px;font-weight:600;color:#0b2545">Repartir entre inventarios</div>
    <div class="distrib-list" id="salidaDistribContainer" style="margin-bottom:8px;"></div>

    <div style="display:flex;justify-content:flex-end;margin-top:6px">
      <button id="btnLimpiarDistrib" class="btn btn-clear" style="margin-right:10px">Limpiar</button>
    </div>

    <div class="form-row" style="margin-top:10px">
      <label>Responsable (autocompletado)</label>
      <input id="salida_responsable" class="input-text readonly" readonly />
      <label>Destinatario</label>
      <input id="salida_destinatario" class="input-text" placeholder="Ej. Cliente XYZ" />
      <label>Observaciones (opcional)</label>
      <textarea id="salida_obs" class="input-text" rows="3" style="resize:vertical"></textarea>
    </div>

    <div class="salida-actions">
      <button id="salidaCancelBtn" class="btn btn-cancel">Cancelar</button>
      <button id="salidaConfirmBtn" class="btn btn-primary" style="min-width:160px" disabled>Agregar a pendientes</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // elementos
  const cantidadInput = modal.querySelector("#salidaCantidadInputModal");
  const distribContainer = modal.querySelector("#salidaDistribContainer");
  const btnCancel = modal.querySelector("#salidaCancelBtn");
  const btnConfirm = modal.querySelector("#salidaConfirmBtn");
  const btnLimpiar = modal.querySelector("#btnLimpiarDistrib");
  const responsableField = modal.querySelector("#salida_responsable");
  const destinatarioField = modal.querySelector("#salida_destinatario");
  const obsField = modal.querySelector("#salida_obs");
  const closeX = modal.querySelector("#salidaCloseX");

  // precargar responsable desde sesión (si existe)
  (async () => {
    try {
      if (supabase && supabase.auth) {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user ?? null;
        if (user && user.email) {
          responsableField.value = user.email;
        } else {
          responsableField.value = "";
          responsableField.placeholder = "No autenticado";
        }
      }
    } catch (e) {
      responsableField.placeholder = "No disponible";
    }
  })();

  // helper stock
  function safeStock(prod, inv) {
    try { const s = getStockFromProduct(prod, inv); return Number.isFinite(Number(s)) ? Number(s) : 0; } catch(e){ return 0; }
  }

  const invs = ["I069","I078","I07F","I312","I073"];

  // render filas inventarios (con data-inv)
  function renderDistribRows() {
    distribContainer.innerHTML = "";
    for (const inv of invs) {
      const avail = safeStock(producto, inv);
      const row = document.createElement("div");
      row.className = "distrib-row";

      const left = document.createElement("div");
      left.className = "distrib-left";
      const small = avail > 0 ? `<span class="small">Disponible: ${String(avail)}</span>` : `<span class="small" style="color:#9ca3af">No disponible</span>`;
      left.innerHTML = `<strong>${escapeHtml(inv)}</strong> — ${small}`;

      const right = document.createElement("div");
      right.className = "distrib-right";
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.min = "0";
      input.value = "0";
      input.setAttribute("data-inv", inv);
      input.className = "input-num";
      if (avail <= 0) {
        input.disabled = true;
        input.title = "Sin stock";
      }
      // permitir pegar / escribir decimales
      input.addEventListener("input", () => {
        // normalizar valor (evitar NaN)
        if (input.value === "" || input.value === null) input.value = "0";
        // actualizar estado del botón confirmar
        updateConfirmState();
      });

      right.appendChild(input);

      row.appendChild(left);
      row.appendChild(right);
      distribContainer.appendChild(row);
    }
  }

  renderDistribRows();

  // obtener distribución actual
  function getDistrib() {
    const inputs = Array.from(distribContainer.querySelectorAll('input[data-inv]'));
    return inputs.map(i => ({ inv: i.getAttribute('data-inv'), qty: Number(i.value || 0), el: i }));
  }

  // habilitar/inhabilitar confirmar según reglas
  function updateConfirmState() {
    const totalNeeded = Number(cantidadInput.value || 0);
    if (!totalNeeded || totalNeeded <= 0) { btnConfirm.disabled = true; return; }
    const distrib = getDistrib();
    const sum = distrib.reduce((s,d) => s + Number(d.qty || 0), 0);
    const availTotal = distrib.reduce((s,d) => s + safeStock(producto, d.inv), 0);
    if (!Number.isFinite(sum)) { btnConfirm.disabled = true; return; }
    if (Math.abs(sum - totalNeeded) > 1e-6 || totalNeeded > availTotal) { btnConfirm.disabled = true; return; }
    btnConfirm.disabled = false;
  }

  // listeners
  cantidadInput.addEventListener("input", updateConfirmState);
  // si se quiere, escuchar cambios de todos los inputs delegadamente:
  distribContainer.addEventListener("input", updateConfirmState);

  btnLimpiar.addEventListener("click", () => {
    distribContainer.querySelectorAll('input[data-inv]').forEach(i => { if (!i.disabled) i.value = "0"; });
    cantidadInput.value = "";
    updateConfirmState();
  });

  const closeOverlay = () => overlay.remove();
  btnCancel.addEventListener("click", closeOverlay);
  closeX.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
  window.addEventListener("keydown", function onEsc(ev){ if (ev.key === "Escape") { closeOverlay(); window.removeEventListener("keydown", onEsc); } });

  // asegurar evaluación inicial (por si ya había valores)
  setTimeout(updateConfirmState, 50);

  // Confirm — agrega uno o varios pendientes usando addPendingSalida
  btnConfirm.addEventListener("click", () => {
    try {
      const totalNeeded = Number(cantidadInput.value || 0);
      if (!totalNeeded || totalNeeded <= 0) { showAlertToast("Cantidad inválida", "warning"); return; }

      const distrib = getDistrib().filter(d => Number(d.qty) > 0);
      if (distrib.length === 0) { showAlertToast("Distribución inválida", "warning"); return; }
      if (Math.abs(distrib.reduce((s,d) => s + Number(d.qty || 0), 0) - totalNeeded) > 1e-6) { showAlertToast("La suma por inventario debe coincidir con el total", "warning"); return; }

      const responsableVal = responsableField.value || "";
      const destinatarioVal = destinatarioField.value || "";
      const obsVal = obsField.value || "";

      // construir y añadir pendiente(s)
      if (distrib.length === 1) {
        const d = distrib[0];
        const pend = {
          PRODUCT_ID: producto.id,
          CODIGO: producto.CODIGO,
          DESCRIPCION: producto.DESCRIPCION,
          UM: producto.UM,
          INVENTARIO_ORIGEN: `INVENTARIO ${d.inv}`,
          CANTIDAD: Number(d.qty),
          RESPONSABLE: responsableVal,
          DESTINATARIO: destinatarioVal,
          OBSERVACIONES: obsVal,
          ADDED_AT: new Date().toISOString()
        };
        addPendingSalida(pend);
      } else {
        const pend = {
          PRODUCT_ID: producto.id,
          CODIGO: producto.CODIGO,
          DESCRIPCION: producto.DESCRIPCION,
          UM: producto.UM,
          ORIGENES: distrib.map(d => ({ INVENTARIO_ORIGEN: `INVENTARIO ${d.inv}`, CANTIDAD: Number(d.qty) })),
          CANTIDAD: totalNeeded,
          RESPONSABLE: responsableVal,
          DESTINATARIO: destinatarioVal,
          OBSERVACIONES: obsVal,
          ADDED_AT: new Date().toISOString()
        };
        addPendingSalida(pend);
      }

      // mostrar toast detallado y simple
      const lines = [
        { label: "Producto", value: producto.DESCRIPCION || producto.CODIGO || "(sin descripción)" },
        { label: "Total", value: totalNeeded },
        ...getDistrib().filter(d=>d.qty>0).map(d => ({ label: d.inv, value: d.qty }))
      ];
      showDetailedToast("✅ Salida agregada a pendientes", lines, { timeoutMs: 5000 });
      showToast("Salida agregada a pendientes", true, 3000);

      // refrescar vista de pendientes
      renderPendingList();

      // cerrar modal
      closeOverlay();
    } catch (err) {
      console.error("Error al agregar pendiente desde modal salida:", err);
      showAlertToast("Error al agregar pendiente", "error");
    }
  });
}
  // -------------------- Helper cleanObjectForInsert --------------------
  function cleanObjectForInsert(obj) {
    const out = {};
    for (const k in obj) {
      if (obj[k] === undefined) continue;
      out[k] = obj[k];
    }
    return out;
  }

  // -------------------- UTIL DETECT COLUMNS --------------------
  async function detectColumnsOfEntradasSinCodigo() {
    if (!supabase) {
      showActionToast("general", false, "Conexión no disponible para detectar columnas");
      return null;
    }
    
    try {
      const { data, error } = await supabase.from("entradas_sin_codigo").select("*").limit(1);
      if (error) {
        console.warn("detectColumnsOfEntradasSinCodigo warning:", error);
        showActionToast("general", false, "Error al detectar columnas");
        return null;
      }
      if (!data || data.length === 0) {
        showActionToast("general", true, "Tabla de entradas vacía");
        return null;
      }
      
      showActionToast("general", true, "Columnas de entradas detectadas");
      return Object.keys(data[0]);
    } catch (e) {
      console.error("detectColumnsOfEntradasSinCodigo ex:", e);
      showActionToast("general", false, "Excepción al detectar columnas");
      return null;
    }
  }

  function pickAllowed(obj, allowed) {
    const out = {};
    for (const k of Object.keys(obj)) {
      // allowed names are case-sensitive (returned by supabase)
      if (allowed.includes(k)) out[k] = obj[k];
    }
    return out;
  }

  // -------------------- ENTRADAS _entradas_sin_codigo (modal registrar) --------------------
  function openEntradaModalById(producto) {
    const existing = document.getElementById("entradaModalOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "entradaModalOverlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.45)",
      zIndex: 12000
    });

    const modal = document.createElement("div");
    modal.className = "entrada-modal";
    Object.assign(modal.style, {
      width: "720px",
      maxWidth: "96%",
      background: "#fff",
      borderRadius: "8px",
      padding: "16px",
      boxShadow: "0 12px 36px rgba(0,0,0,0.28)",
      fontFamily: "'Quicksand', sans-serif",
      color: "#111"
    });

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">Registrar entrada — ${escapeHtml(producto.DESCRIPCION || producto.CODIGO || '')}</h3>
        <button id="entradaCloseBtn" style="background:transparent;border:none;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:8px">
        <label>I069<input id="ent_i069" type="number" min="0" step="any" class="input-text" /></label>
        <label>I078<input id="ent_i078" type="number" min="0" step="any" class="input-text" /></label>
        <label>I07F<input id="ent_i07f" type="number" min="0" step="any" class="input-text" /></label>
        <label>I312<input id="ent_i312" type="number" min="0" step="any" class="input-text" /></label>
        <label>I073<input id="ent_i073" type="number" min="0" step="any" class="input-text" /></label>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <div style="flex:1">
          <label>Responsable
            <input id="ent_responsable" type="text" class="input-text" />
          </label>
        </div>
        <div style="width:160px">
          <label>Total
            <input id="ent_total" type="text" readonly class="input-text readonly" />
          </label>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button id="ent_cancel" class="btn-cancel">Cancelar</button>
        <button id="ent_register" class="btn-primary">Registrar entrada</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const i069 = modal.querySelector("#ent_i069");
    const i078 = modal.querySelector("#ent_i078");
    const i07f = modal.querySelector("#ent_i07f");
    const i312 = modal.querySelector("#ent_i312");
    const i073 = modal.querySelector("#ent_i073");
    const totalField = modal.querySelector("#ent_total");
    const responsableField = modal.querySelector("#ent_responsable");
    const registerBtn = modal.querySelector("#ent_register");
    const cancelBtn = modal.querySelector("#ent_cancel");
    const closeX = modal.querySelector("#entradaCloseBtn");

    // make responsable autocompleted and read-only (not editable)
    responsableField.readOnly = true;
    responsableField.tabIndex = -1;
    responsableField.title = "Autocompletado desde sesión (no editable)";
    // style visually as non-editable
    Object.assign(responsableField.style, {
      backgroundColor: "#f3f4f6",
      cursor: "not-allowed",
      borderColor: "rgba(0,0,0,0.08)"
    });

    // Prellenar responsable si hay sesión activa
    (async () => {
      try {
        if (supabase) {
          const { data: authData } = await supabase.auth.getUser();
          const user = authData?.user ?? null;
          if (user && user.email) {
            responsableField.value = user.email;
            showActionToast("auth", true, "Sesión autenticada");
          } else {
            // si no hay sesión, dejar vacío pero no editable; mostrar placeholder
            responsableField.placeholder = "No autenticado";
            responsableField.value = "";
            showActionToast("auth", false, "No hay sesión activa");
          }
        }
      } catch (e) {
        // fallback: dejar placeholder
        responsableField.placeholder = "No disponible";
        responsableField.value = "";
        showActionToast("auth", false, "Error al verificar sesión");
      }
    })();

    const parseQ = (el) => {
      const s = String(el?.value || "0").trim().replace(",", ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    const computeTotal = () => {
      const t = parseQ(i069) + parseQ(i078) + parseQ(i07f) + parseQ(i312) + parseQ(i073);
      // mostrar con hasta 3 decimales (como en tu UI)
      totalField.value = Number.isFinite(t) ? t.toFixed(3) : "0.000";
      return t;
    };
    
    [i069, i078, i07f, i312, i073].forEach(inp => inp.addEventListener("input", computeTotal));
    computeTotal();

    const closeOverlay = () => {
      overlay.remove();
      showActionToast("entrada", true, "Entrada cancelada");
    };
    
    cancelBtn.addEventListener("click", closeOverlay);
    closeX.addEventListener("click", closeOverlay);
    overlay.addEventListener("click", e => { 
      if (e.target === overlay) closeOverlay(); 
    });
    
    window.addEventListener("keydown", function onEsc(ev) {
      if (ev.key === "Escape") { 
        closeOverlay(); 
        window.removeEventListener("keydown", onEsc); 
      }
    });

    registerBtn.addEventListener("click", async () => {
      registerBtn.disabled = true;
      registerBtn.textContent = "Registrando...";

      try {
        const q069v = parseQ(i069), q078v = parseQ(i078), q07fv = parseQ(i07f), q312v = parseQ(i312), q073v = parseQ(i073);
        const total = q069v + q078v + q07fv + q312v + q073v;
        const responsable = (responsableField.value || "").trim();

        if (total <= 0) {
          showActionToast("entrada", false, "Ingresa al menos una cantidad mayor a 0");
          registerBtn.disabled = false; 
          registerBtn.textContent = "Registrar entrada"; 
          return;
        }
        
        if (!responsable) {
          showActionToast("entrada", false, "Responsable requerido (no autenticado)");
          registerBtn.disabled = false; 
          registerBtn.textContent = "Registrar entrada"; 
          return;
        }

        // --- INSERCIÓN ENTRADAS_SIN_CODIGO (forzado) ---
        const inserted = await registerEntradaImmediate(producto, {
          q069: q069v, q078: q078v, q07f: q07fv, q312: q312v, q073: q073v, total, responsable, nota: ""
        });

        // Mostrar toast detallado
        showActionToast("entrada", true, `Entrada registrada - Total: ${total}`);

        // refrescar productos
        try { 
          await loadAllProductsWithPagination(); 
        } catch (e) {
          showActionToast("load", false, "Error al actualizar productos después de entrada");
        }

        // cerrar modal un poco después para que se vea el toast
        setTimeout(closeOverlay, 700);
      } catch (err) {
        console.error("Error registrar entrada inmediata (UI):", err);
        showActionToast("entrada", false, `Error: ${err.message}`);
      } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = "Registrar entrada";
      }
    });
    
    showActionToast("entrada", true, `Modal de entrada abierto para: ${producto.DESCRIPCION}`);
  }

// Reemplazar la función existente registerEntradaImmediate por esta versión mejorada
async function registerEntradaImmediate(producto, { q069=0, q078=0, q07f=0, q312=0, q073=0, total=0, responsable="", nota="" } = {}) {
  if (!supabase) throw new Error("Supabase no inicializado");

  // fecha fallback
  function _getNowISO() {
    try { return (new Date()).toISOString(); } catch(e){ return null; }
  }
  const fechaNow = (typeof getCurrentLocalDate === 'function') ? getCurrentLocalDate() : _getNowISO();

  // insertar entrada (mantener la tabla entradas_sin_codigo)
  const entradaToInsert = {
    descripcion: producto?.DESCRIPCION ?? producto?.descripcion ?? producto?.CODIGO ?? "",
    cantidad: Number(total || 0),
    i069: Number(q069 || 0),
    i078: Number(q078 || 0),
    i07f: Number(q07f || 0),
    i312: Number(q312 || 0),
    i073: Number(q073 || 0),
    responsable: responsable || null,
    fecha: fechaNow
  };

  const { data: insertData, error: insertErr } = await supabase
    .from("entradas_sin_codigo")
    .insert([entradaToInsert])
    .select();

  if (insertErr) {
    showActionToast("entrada", false, `Error BD (insert entrada): ${insertErr.message}`);
    throw insertErr;
  }

  // cargar mapa columnas (intentar)
  try { await ensureProductosSinCodigoColumnMap(); } catch(e) { console.warn("Mapa columnas no cargado:", e); }

  // buscar producto objetivo (primero por id, sino por CODIGO)
  let prodRow = null;
  try {
    if (producto && (producto.id || producto.ID || producto.Id)) {
      const idVal = producto.id ?? producto.ID ?? producto.Id;
      const { data: pData, error: pErr } = await supabase.from("productos_sin_codigo").select("*").eq("id", idVal).maybeSingle();
      if (pErr) console.warn("Error buscando producto por id:", pErr);
      prodRow = (pErr ? null : pData) || null;
    }

    if (!prodRow) {
      const codigoVal = (producto?.CODIGO ?? producto?.codigo ?? "").toString().trim();
      if (codigoVal) {
        const { data: pData2, error: pErr2 } = await supabase.from("productos_sin_codigo").select("*").ilike("CODIGO", codigoVal).limit(1).maybeSingle();
        if (pErr2) console.warn("Error buscando producto por codigo:", pErr2);
        prodRow = (pErr2 ? null : pData2) || null;
      }
    }
  } catch (err) {
    console.warn("Excepción buscando producto:", err);
  }

  // Si no encontramos producto, devolvemos la inserción pero avisamos
  if (!prodRow) {
    showActionToast("entrada", true, "Entrada registrada; no se encontró producto para actualizar stock");
    return Array.isArray(insertData) ? insertData[0] : insertData;
  }

  // preparar cantidades por inventario
  const additions = {
    "I069": Number(q069 || 0),
    "I078": Number(q078 || 0),
    "I07F": Number(q07f || 0),
    "I312": Number(q312 || 0),
    "I073": Number(q073 || 0)
  };

  // construir objeto updates sumando a las columnas reales
  const updates = {};
  const prodKeys = Object.keys(prodRow || {});

  for (const shortInv of Object.keys(additions)) {
    const qty = Number(additions[shortInv] || 0);
    if (!qty) continue;

    // intentar obtener la columna real con tu helper
    let colName = null;
    try { colName = getRealColForInventoryLabel(shortInv); } catch(e) { colName = null; }

    // fallback: buscar en prodRow keys alguna que contenga el shortInv normalizado
    if (!colName) {
      const nkShort = normalizeKeyName(shortInv);
      colName = prodKeys.find(k => normalizeKeyName(k).includes(nkShort) && normalizeKeyName(k).includes("inventario")) || null;
    }

    // si aún no hay columna, buscar la primer columna que contenga 'inventario' + dígitos (fallback amplio)
    if (!colName) {
      colName = prodKeys.find(k => normalizeKeyName(k).includes("inventario") && /\d{2,}/.test(k)) || null;
    }

    if (colName) {
      const current = toNumber(prodRow[colName]);
      updates[colName] = roundFloat(current + qty);
      console.debug("Preparando update:", { colName, current, add: qty, newVal: updates[colName] });
    } else {
      console.warn("No se encontró columna para", shortInv, "producto id:", prodRow.id);
    }
  }

  // ahora recalcular "inventario físico" / "almacen físico" si existe alguna columna que lo represente
  // buscamos la columna física en prodRow: preferimos nombres que contengan 'fisico' o 'físico' o 'inventariofisico' o 'almacen'
  const physCol = prodKeys.find(k => {
    const nk = normalizeKeyName(k);
    return nk.includes("fisico") || nk.includes("fisinco") || nk.includes("inventariofisico") || nk.includes("inventariofisicoenalmacen") || nk.includes("fisic") || (nk.includes("almacen") && !nk.includes("inventario"));
  }) || prodKeys.find(k => normalizeKeyName(k).includes("inventario") && normalizeKeyName(k).includes("fisico")) || null;

  // calcular suma de todos los inventarios detectables (usamos prodKeys que incluyan 'inventario' o 'almacen' excepto physCol)
  let totalComputed = 0;
  prodKeys.forEach(k => {
    const nk = normalizeKeyName(k);
    if (k === physCol) return;
    // contar keys que representen inventarios (ej: inventarioi069, inventario i069, almacen)
    if (nk.includes("inventario") || nk.includes("almacen") || /\bi0?69\b/.test(nk) || /\bi0?78\b/.test(nk) || /\bi0?7f\b/.test(nk) || /\bi312\b/.test(nk) || /\bi073\b/.test(nk)) {
      // si en updates ya calculamos el nuevo valor, usarlo; si no, tomar valor actual prodRow[k]
      const val = updates.hasOwnProperty(k) ? toNumber(updates[k]) : toNumber(prodRow[k]);
      totalComputed += Number(val || 0);
    }
  });

  // si tenemos physCol actualizamos con la suma calculada
  if (physCol) {
    updates[physCol] = roundFloat(totalComputed);
    console.debug("Actualizando columna fisica:", physCol, "->", updates[physCol]);
  } else {
    console.debug("No se detectó columna 'fisico/almacen' para actualizar (se omitirá suma física).");
  }

  // si hay updates, aplicarlas en una sola llamada
  if (Object.keys(updates).length > 0) {
  try {
    console.debug("Intentando actualizar stock para producto id", prodRow.id, "updates:", updates);
    const { error: updErr } = await supabase.from("productos_sin_codigo").update(updates).eq("id", prodRow.id);
    if (updErr) {
      console.warn("Error actualizando stock:", updErr);
      showActionToast("entrada", false, "Entrada guardada, pero fallo al actualizar stock (revisa consola)");
    } else {
      console.debug("Stock actualizado correctamente para id", prodRow.id);
      showActionToast("entrada", true, `Entrada registrada y stock actualizado (+${total})`);
    }
  } catch (err) {
    console.error("Excepción al actualizar producto:", err);
    showActionToast("entrada", false, "Entrada registrada pero error al actualizar stock (ver consola)");
  }
} else {
  showActionToast("entrada", true, "Entrada registrada; no se detectaron columnas de inventario para actualizar");
}

  // devolver registro insertado
  return Array.isArray(insertData) ? insertData[0] : insertData;
}

  // -------------------- FECHAS / FORMAT --------------------
  function getCurrentLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  window.formatDate = function(dateInput) {
    if (!dateInput) return "";
    if (dateInput instanceof Date) {
      if (isNaN(dateInput)) return "";
      return dateInput.toLocaleDateString('es-MX');
    }
    const s = String(dateInput).trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m = s.match(ymd);
    if (m) { const [, y, mm, dd] = m; return `${dd}/${mm}/${y}`; }
    try {
      if (s.includes('T') || s.includes(':')) {
        const parsed = new Date(s);
        if (!isNaN(parsed)) return parsed.toLocaleDateString('es-MX');
      }
      const tryIso = s.length === 10 ? `${s}T00:00:00` : s;
      const parsed = new Date(tryIso);
      if (!isNaN(parsed)) return parsed.toLocaleDateString('es-MX');
    } catch(e){}
    return s.length >= 10 ? s.slice(0,10) : s;
  };

  // -------------------- HISTORIAL DE ENTRADAS --------------------
  async function openEntradaHistoryModal(producto) {
    const existing = document.getElementById("entradaHistoryOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "entradaHistoryOverlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.45)",
      zIndex: 20000,
      padding: "18px",
      boxSizing: "border-box"
    });

    const modal = document.createElement("div");
    modal.className = "entrada-history-modal";
    Object.assign(modal.style, {
      width: "920px",
      maxWidth: "100%",
      maxHeight: "84vh",
      overflow: "auto",
      background: "#fff",
      borderRadius: "8px",
      padding: "12px",
      boxShadow: "0 16px 48px rgba(0,0,0,0.32)",
      fontFamily: "'Quicksand', sans-serif",
      color: "#111"
    });

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0;font-weight:600">Historial de entradas — ${escapeHtml(producto.DESCRIPCION || producto.CODIGO || '')}</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="histFilterInput" placeholder="Filtrar por texto (responsable/obs)..." style="padding:8px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);width:320px" />
          <button id="histCloseBtn" style="background:transparent;border:none;font-size:18px;cursor:pointer">✕</button>
        </div>
      </div>
      <div id="histContent">Cargando historial...</div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const histContent = modal.querySelector("#histContent");
    const closeBtn = modal.querySelector("#histCloseBtn");
    const filterInput = modal.querySelector("#histFilterInput");

    function closeOverlay() { 
      overlay.remove();
      showActionToast("historial", true, "Historial cerrado");
    }

    closeBtn.addEventListener("click", closeOverlay);
    overlay.addEventListener("click", (e) => { 
      if (e.target === overlay) closeOverlay(); 
    });
    
    window.addEventListener("keydown", function onEsc(ev){ 
      if (ev.key === "Escape") { 
        closeOverlay(); 
        window.removeEventListener("keydown", onEsc); 
      } 
    });

    try {
      showActionToast("historial", true, "Cargando historial...");
      
      const cols = await detectColumnsOfEntradasSinCodigo();
      let query;
      
      if (cols && cols.includes("PRODUCT_ID")) {
        query = supabase.from("entradas_sin_codigo").select("*").eq("PRODUCT_ID", producto.id).order("fecha", { ascending: false }).limit(500);
      } else if (cols && cols.includes("product_id")) {
        query = supabase.from("entradas_sin_codigo").select("*").eq("product_id", producto.id).order("fecha", { ascending: false }).limit(500);
      } else {
        const q = (producto.DESCRIPCION || producto.descripcion || "").replace(/'/g, "''");
        query = supabase.from("entradas_sin_codigo").select("*").ilike("descripcion", `%${q}%`).order("fecha", { ascending: false }).limit(500);
      }

      const { data, error } = await query;
      
      if (error) {
        showActionToast("historial", false, error.message);
        throw error;
      }
      
      const rows = data || [];

      if (!rows || rows.length === 0) {
        histContent.innerHTML = `<div style="padding:18px">No se encontraron entradas para este producto.</div>`;
        showActionToast("historial", false, "No hay entradas registradas");
        return;
      }

      // Construir tabla con el diseño solicitado
      const tableWrap = document.createElement("div");
      tableWrap.style.overflow = "auto";

      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.fontSize = "14px";
      table.style.minWidth = "760px";

      // estilos inline para encabezado y celdas (parecida a la imagen)
      const thStyle = "text-align:left;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.06);font-weight:600;color:#374151";
      const tdStyle = "padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.04);color:#111";
      const smallTdStyle = "padding:12px 8px;border-bottom:1px solid rgba(0,0,0,0.04);color:#111;text-align:right;white-space:nowrap";

      // header
      const thead = document.createElement("thead");
      thead.innerHTML = `
        <tr style="background:#fff">
          <th style="${thStyle}">Fecha</th>
          <th style="${thStyle}">Cantidad</th>
          <th style="${thStyle};text-align:right">I069</th>
          <th style="${thStyle};text-align:right">I078</th>
          <th style="${thStyle};text-align:right">I07F</th>
          <th style="${thStyle};text-align:right">I312</th>
          <th style="${thStyle};text-align:right">I073</th>
          <th style="${thStyle}">Responsable</th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      const renderRows = (list) => {
        tbody.innerHTML = "";
        list.forEach(r => {
          const fechaRaw = r.fecha ?? r.FECHA ?? r.created_at ?? "";
          const fecha = fechaRaw ? formatDate(fechaRaw) : "";
          const total = r.cantidad ?? r.CANTIDAD ?? r.total ?? "";
          const i069 = r.i069 ?? r.I069 ?? 0;
          const i078 = r.i078 ?? r.I078 ?? 0;
          const i07f = r.i07f ?? r.I07F ?? 0;
          const i312 = r.i312 ?? r.I312 ?? 0;
          const i073 = r.i073 ?? r.I073 ?? 0;
          const responsable = r.responsable ?? r.RESPONSABLE ?? "";
          const tr = document.createElement("tr");
          tr.style.background = "transparent";
          tr.style.transition = "background .12s ease";
          tr.onmouseenter = () => tr.style.background = "rgba(15,23,42,0.03)";
          tr.onmouseleave = () => tr.style.background = "transparent";

          tr.innerHTML = `
            <td style="${tdStyle};width:120px">${escapeHtml(String(fecha))}</td>
            <td style="${tdStyle};text-align:right;width:90px">${escapeHtml(String(total))}</td>
            <td style="${smallTdStyle}">${escapeHtml(String(i069))}</td>
            <td style="${smallTdStyle}">${escapeHtml(String(i078))}</td>
            <td style="${smallTdStyle}">${escapeHtml(String(i07f))}</td>
            <td style="${smallTdStyle}">${escapeHtml(String(i312))}</td>
            <td style="${smallTdStyle}">${escapeHtml(String(i073))}</td>
            <td style="${tdStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(String(responsable))}</td>
          `;
          tbody.appendChild(tr);
        });
      };

      renderRows(rows);
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      histContent.innerHTML = "";
      histContent.appendChild(tableWrap);

      // filtro cliente
      filterInput.addEventListener("input", debounce((ev) => {
        const term = (ev.target.value || "").trim().toLowerCase();
        if (!term) { 
          renderRows(rows); 
          return; 
        }
        const filtered = rows.filter(r => {
          const txt = `${r.responsable||r.RESPONSABLE||""} ${r.observaciones||r.OBSERVACIONES||""} ${r.descripcion||r.DESCRIPCION||""}`.toLowerCase();
          return txt.includes(term);
        });
        renderRows(filtered);
        showActionToast("search", true, `${filtered.length} entradas filtradas`);
      }, 150));

      showActionToast("historial", true, `${rows.length} entradas cargadas`);

    } catch (err) {
      console.error("openEntradaHistoryModal err:", err);
      histContent.innerHTML = `<div style="padding:18px;color:#7f1d1d">Error cargando historial.</div>`;
      showActionToast("historial", false, err.message);
    }
  }

  // -------------------- SETUP & BOOT --------------------
  function setupButtonsAndEvents() {
    try {
      ensureTableScrollContainer();
      
      if (btnOpenModal) {
        btnOpenModal.addEventListener("click", openProductModal);
        showActionToast("general", true, "Botones configurados");
      }
      
      if (btnCloseModal) btnCloseModal.addEventListener("click", closeProductModal);
      if (btnCancelModal) btnCancelModal.addEventListener("click", (e)=> { e.preventDefault(); closeProductModal(); });
      if (productForm) productForm.addEventListener("submit", saveProductFromForm);
      
      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
          showActionToast("load", true, "Actualizando productos...");
          loadAllProductsWithPagination();
        });
      }
      
      if (btnConfirmAll) btnConfirmAll.addEventListener("click", confirmAllPendings);
      
      if (btnClearPending) {
        btnClearPending.addEventListener("click", ()=> {
          showConfirm("Eliminar todas las salidas pendientes?", ()=> { 
            savePendingSalidas([]); 
            renderPendingList(); 
            showActionToast("clear", true, "Todos los pendientes eliminados");
          },
          () => {
            showActionToast("clear", true, "Limpieza cancelada");
          });
        });
      }

      setupSearchWithPagination();
      showActionToast("general", true, "Sistema inicializado correctamente");
      
    } catch (error) {
      showActionToast("general", false, "Error en configuración inicial");
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      showActionToast("general", true, "Iniciando aplicación...");
      setupButtonsAndEvents();
      await loadAllProductsWithPagination();
      renderPendingList();
      updatePendingCount();
      
      // exponer funciones globales por si usas onclick inline
      window.editarProducto = editarProductoById;
      window.eliminarProducto = eliminarProducto;
      window.registrarSalida = registrarSalida;
      window.openEntradaModalById = openEntradaModalById;
      window.openEntradaHistoryModal = openEntradaHistoryModal;
      window.reloadAllProducts = loadAllProductsWithPagination;
      
      showActionToast("general", true, "Aplicación lista para usar");
      
    } catch (err) {
      console.error("init err:", err);
      showActionToast("general", false, `Error iniciando módulo: ${err.message}`);
    }
  });
})();