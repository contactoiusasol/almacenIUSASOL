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
  const PENDING_KEY = "salidas_sin_codigo_pendientes";
  const LEGACY_PENDING_KEYS = [
    "PENDINGS_KEY_SALIDAS",
    "pending_salidas",
    "salidas_pending",
    "salidas_sin_codigo_pendientes"
  ];

  // -------------------- UTIL --------------------
  function nl(v){ return v === null || v === undefined ? "" : String(v); }
  function toNumber(v) {
    if (v === null || v === undefined || v === "") return 0;
    const cleaned = String(v).replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isNaN(n) ? 0 : n;
  }

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
      .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
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

  // -------------------- TOAST SIMPLIFICADO --------------------
  function showToast(msg, ok = true, time = 3000) {
    // Toast simple y discreto
    try {
      // Si no hay toast, crear uno mínimo
      let toast = document.getElementById("simpleToast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "simpleToast";
        Object.assign(toast.style, {
          position: "fixed",
          top: "20px",
          right: "20px",
          padding: "12px 16px",
          borderRadius: "6px",
          color: "#fff",
          zIndex: "9999",
          fontFamily: "'Quicksand', sans-serif",
          fontWeight: "500",
          fontSize: "14px",
          background: ok ? "#10b981" : "#ef4444",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          transition: "all 0.3s ease",
          opacity: "0",
          transform: "translateY(-20px)"
        });
        document.body.appendChild(toast);
      }

      toast.textContent = msg;
      toast.style.background = ok ? "#10b981" : "#ef4444";
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";

      // Limpiar timeout anterior
      if (toast._timeout) clearTimeout(toast._timeout);
      
      toast._timeout = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-20px)";
      }, time);

    } catch (e) {
      console.log("Toast:", msg); // Fallback a console
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

  // -------------------- MAPA DE COLUMNAS --------------------
  async function ensureProductosSinCodigoColumnMap() {
    if (PRODUCTOS_SIN_CODIGO_COLUMN_MAP) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
    PRODUCTOS_SIN_CODIGO_COLUMN_MAP = {};
    if (!supabase) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
    
    try {
      const { data, error } = await supabase.from("productos_sin_codigo").select("*").limit(1);
      if (error) {
        console.warn("Error al cargar mapa de columnas:", error);
        return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
      }
      if (data && data.length > 0) {
        const sample = data[0];
        Object.keys(sample).forEach(k => { PRODUCTOS_SIN_CODIGO_COLUMN_MAP[normalizeKeyName(k)] = k; });
      }
    } catch (e) { 
      console.warn("Excepción en mapa de columnas:", e);
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
    if (!allProductsFromServer || allProductsFromServer.length === 0) return;
    
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
    } catch (error) {
      console.error("Error creando índice local:", error);
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

  // -------------------- LOAD / SEARCH (PAGINATED) --------------------
  async function loadAllProductsWithPagination() {
    if (!supabase) { 
      showToast("Error de conexión", false);
      return; 
    }
    
    try {
      PRODUCTOS_SIN_CODIGO_COLUMN_MAP = null;
      await ensureProductosSinCodigoColumnMap();

      // cargar en lotes
      const BATCH = 1000;
      let offset = 0;
      allProductsFromServer = [];
      while (true) {
        const { data, error } = await supabase.from("productos_sin_codigo").select("*").order("id", { ascending: true }).range(offset, offset + BATCH - 1);
        if (error) {
          showToast(`Error al cargar: ${error.message}`, false);
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
      
      prepareLocalSearchIndex();
      
      showToast(`${allProductsFromServer.length} productos cargados`, true);
      
    } catch (err) {
      console.error("Error cargando productos:", err);
      showToast(`Error: ${err.message}`, false);
    }
  }

  async function performServerSearchWithPagination(term) {
    if (!supabase) {
      showToast("Conexión no disponible", false);
      return;
    }
    
    try {
      const q = term.replace(/'/g, "''");
      const { data, error } = await supabase.from("productos_sin_codigo").select("*").or(`DESCRIPCION.ilike.%${q}%,CODIGO.ilike.%${q}%`).order("id", { ascending: true }).limit(5000);
      
      if (error) {
        showToast(`Error de búsqueda: ${error.message}`, false);
        throw error;
      }
      
      paginatedProducts = data || [];
      currentPage = 1;
      renderCurrentPage();
      updatePaginationControls();
      
      const resultCount = paginatedProducts.length;
      if (resultCount > 0) {
        showToast(`${resultCount} productos encontrados`, true);
      } else {
        showToast("No se encontraron productos", false);
      }
    } catch (err) {
      console.error("Error en búsqueda:", err);
      
      // Fallback a búsqueda local
      const localResults = performLocalSearch(term);
      paginatedProducts = localResults;
      currentPage = 1;
      renderCurrentPage();
      updatePaginationControls();
      
      if (localResults.length > 0) {
        showToast(`${localResults.length} productos encontrados localmente`, true);
      }
    }
  }

  function setupSearchWithPagination() {
    if (!searchInput) return;
    
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
        return;
      }
      
      if (term.length <= 2) {
        searchMode = 'local';
        const localResults = performLocalSearch(term);
        paginatedProducts = localResults;
      } else {
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
function renderTable(products) {
  if (!tableBody) return;
  
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
      
      // Solo sumar los 5 inventarios principales
      const stockReal = i069 + i078 + i07f + i312 + i073;

      const tr = document.createElement("tr");
      if (stockReal <= 1) tr.classList.add("stock-low");
      else if (stockReal <= 10) tr.classList.add("stock-medium");
      else tr.classList.add("stock-high");

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

      // EVENT LISTENERS PARA LOS BOTONES - ESTO ES LO MÁS IMPORTANTE
      const btnEdit = tr.querySelector(".btn-edit");
      const btnDelete = tr.querySelector(".btn-delete");
      const btnSalida = tr.querySelector(".btn-salida");
      const btnEntrada = tr.querySelector(".btn-entrada");
      const btnHist = tr.querySelector(".btn-historial");

      if (btnEdit) {
        btnEdit.addEventListener("click", () => editarProductoById(p.id));
      }
      if (btnDelete) {
        btnDelete.addEventListener("click", () => eliminarProducto(String(p.id)));
      }
      if (btnSalida) {
        btnSalida.addEventListener("click", () => registrarSalida(p));
      }
      if (btnEntrada) {
        btnEntrada.addEventListener("click", () => openEntradaModalById(p));
      }
      if (btnHist) {
        btnHist.addEventListener("click", () => openEntradaHistoryModal(p));
      }

      frag.appendChild(tr);
    });

    tableBody.appendChild(frag);
    
  } catch (error) {
    console.error("Error renderizando tabla:", error);
  }
}
// AGREGA ESTAS FUNCIONES FALTANTES:

function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return dateString;
  }
}

async function detectColumnsOfEntradasSinCodigo() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from("entradas_sin_codigo").select("*").limit(1);
    if (error || !data || data.length === 0) return [];
    return Object.keys(data[0]);
  } catch (e) {
    console.error("Error detectando columnas:", e);
    return [];
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
      console.error("Error al renderizar página:", error);
    }
  }

  function goToPage(page) {
    try {
      const totPages = Math.max(1, Math.ceil(paginatedProducts.length / ITEMS_PER_PAGE));
      if (page < 1) page = 1;
      if (page > totPages) page = totPages;
      currentPage = page;
      renderCurrentPage();
      updatePaginationControls();
    } catch (error) {
      console.error("Error al cambiar de página:", error);
    }
  }

  // -------------------- CRUD PRODUCTOS --------------------
  async function saveProductFromForm(ev) {
    ev && ev.preventDefault && ev.preventDefault();
    if (!productForm) return;

    const btnSave = productForm.querySelector(".btn-save");
    const prevText = btnSave ? btnSave.textContent : null;

    try {
      if (!supabase) { 
        showToast("Conexión no disponible", false); 
        return; 
      }

      if (btnSave) { 
        btnSave.disabled = true; 
        btnSave.textContent = editMode ? "Guardando..." : "Creando..."; 
      }

      const descripcion = (productForm.querySelector('[name="descripcion"]')?.value || "").trim();
      const um = (productForm.querySelector('[name="um"]')?.value || "").trim();

      if (!descripcion) {
        showToast("La descripción es obligatoria", false);
        if (btnSave) { 
          btnSave.disabled = false; 
          if (prevText) btnSave.textContent = prevText; 
        }
        return;
      }

      // Comprobar similitud (solo en creación)
      if (!editMode) {
        try {
          const q = descripcion.replace(/'/g, "''");
          const { data: candidates, error: candErr } = await supabase
            .from("productos_sin_codigo")
            .select("id, DESCRIPCION")
            .ilike("DESCRIPCION", `%${q}%`)
            .limit(30);

          if (!candErr && Array.isArray(candidates) && candidates.length > 0) {
            const THRESHOLD = 0.70;
            const similars = [];
            for (const c of candidates) {
              const candDesc = c.DESCRIPCION || "";
              const sim = similarityRatio(descripcion, candDesc);
              if (sim >= THRESHOLD) similars.push({ id: c.id, descripcion: candDesc, score: sim });
            }
            if (similars.length > 0) {
              similars.sort((a,b) => b.score - a.score);
              const top = similars.slice(0,3).map(s => `• "${s.descripcion}" (${Math.round(s.score*100)}%)`).join("\n");
              showToast(`Productos similares:\n${top}`, false, 5000);
              if (btnSave) { 
                btnSave.disabled = false; 
                if (prevText) btnSave.textContent = prevText; 
              }
              return;
            }
          }
        } catch (err) {
          console.warn("Error buscando similares:", err);
        }
      }

      // Insertar o actualizar
      if (editMode && editingId) {
        const upd = { DESCRIPCION: descripcion, UM: um };
        const { error } = await supabase.from("productos_sin_codigo").update(upd).eq("id", editingId);

        if (error) {
          showToast(`Error al actualizar: ${error.message}`, false);
          throw error;
        }

        showToast("Producto actualizado", true);
      } else {
        // Comprobación de duplicados
        const descripcionNorm = descripcion.replace(/'/g, "''").trim();
        if (!descripcionNorm) {
          showToast("Descripción vacía", false);
          return;
        }

        try {
          const short = descripcionNorm.substring(0, Math.min(10, descripcionNorm.length));
          const orQuery = `DESCRIPCION.ilike.%${descripcionNorm}%,DESCRIPCION.ilike.%${short}%`;
          const { data: dup, error: dupErr } = await supabase
            .from("productos_sin_codigo")
            .select("id, DESCRIPCION")
            .or(orQuery)
            .limit(1);

          if (dupErr) {
            console.warn("Error buscando duplicados:", dupErr);
            showToast("Error comprobando duplicados", false);
            return;
          }
          if (dup && dup.length > 0) {
            showToast(`Ya existe producto similar: "${dup[0].DESCRIPCION}"`, false);
            return;
          }
        } catch (err) {
          console.error("Error en check duplicados:", err);
          showToast("Error comprobando duplicados", false);
          return;
        }

        // Preparar objeto a insertar
        await ensureProductosSinCodigoColumnMap();
        const insertObj = {
          CODIGO: "S/C",
          DESCRIPCION: descripcion,
          UM: um || null
        };

        ["I069","I078","I07F","I312","I073","ALMACEN"].forEach(lbl => {
          const col = getRealColForInventoryLabel(lbl);
          if (col) insertObj[col] = 0;
        });

        const { error } = await supabase.from("productos_sin_codigo").insert([insertObj]);

        if (error) {
          showToast(`Error al crear: ${error.message}`, false);
          throw error;
        }

        showToast("Producto creado", true);
      }

      closeProductModal();
      await loadAllProductsWithPagination();

    } catch (err) {
      console.error("Error guardando producto:", err);
      showToast(`Error: ${err.message}`, false);
    } finally {
      if (btnSave) { 
        btnSave.disabled = false; 
        if (prevText) btnSave.textContent = prevText; 
      }
      editMode = false; 
      editingId = null;
    }
  }

  function clearProductFormFields() {
    if (!productForm) return;
    productForm.reset();
    editMode = false; 
    editingId = null;
  }

  function openProductModal() {
    if (!modal) return;
    
    try {
      modal.style.display = "flex";
      const title = modal.querySelector("#modalTitle");
      if (title) title.textContent = "Agregar Producto";
      const saveBtn = productForm?.querySelector(".btn-save");
      if (saveBtn) saveBtn.textContent = "💾 Guardar";
    } catch (error) {
      console.error("Error al abrir modal:", error);
    }
  }

  function closeProductModal() {
    if (!modal) return;
    
    try {
      modal.style.display = "none";
      clearProductFormFields();
    } catch (error) {
      console.error("Error al cerrar modal:", error);
    }
  }

  function editarProductoById(id) {
    try {
      const prod = allProductsFromServer.find(x => String(x.id) === String(id));
      if (!prod) { 
        showToast("Producto no encontrado", false); 
        return; 
      }
      
      if (!modal || !productForm) { 
        showToast("Formulario no disponible", false); 
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
      
    } catch (error) {
      console.error("Error al preparar edición:", error);
      showToast("Error al preparar edición", false);
    }
  }

  async function eliminarProducto(id) {
    if (!id) {
      showToast("ID no válido", false);
      return;
    }
    
    try {
      const { data: producto, error: fetchErr } = await supabase.from("productos_sin_codigo").select("DESCRIPCION").eq("id", id).maybeSingle();
      
      if (fetchErr) {
        showToast(`Error: ${fetchErr.message}`, false);
        throw fetchErr;
      }
      
      const nombre = producto?.DESCRIPCION || `id ${id}`;
      
      showConfirm(`¿Eliminar el producto "${nombre}"? Esta acción no se puede deshacer.`, 
        async ()=> {
          try {
            const { error } = await supabase.from("productos_sin_codigo").delete().eq("id", id);
            
            if (error) { 
              showToast(`Error al eliminar: ${error.message}`, false); 
              throw error; 
            }
            
            showToast("Producto eliminado", true);
            await loadAllProductsWithPagination();
            
          } catch (err) {
            console.error("Error eliminando producto:", err);
            showToast(`Error: ${err.message}`, false);
          }
        }, 
        ()=>{
          // Cancelado - sin mensaje
        }
      );
      
    } catch (err) {
      console.error("Error eliminando producto:", err);
      showToast(`Error: ${err.message}`, false);
    }
  }

  // -------------------- PENDIENTES SALIDAS --------------------
  function getPendingSalidas() { 
    try {
      return JSON.parse(localStorage.getItem(PENDINGS_KEY_SALIDAS) || "[]");
    } catch (error) {
      console.error("Error al leer pendientes:", error);
      return [];
    }
  }
  
  function savePendingSalidas(list){ 
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    } catch (err) {
      console.error("Error al guardar pendientes:", err);
      showToast("Error al guardar pendientes", false);
    }
  }

  function addPendingSalida(pendiente) {
    try {
      const list = getPendingSalidas();
      pendiente.id = pendiente.id || String(Date.now());
      list.push(pendiente);
      savePendingSalidas(list);
      showToast("Salida agregada a pendientes", true);
      renderPendingList();
      updatePendingCount();
    
    } catch (error) {
      console.error("Error al agregar salida pendiente:", error);
      showToast("Error al agregar salida pendiente", false);
    }
  }

  function renderPendingList() {
    if (!tablaPendientesBody) return;
    
    updatePendingCount();
  
    try {
      const list = getPendingSalidas();
      tablaPendientesBody.innerHTML = "";
      
      if (!list || list.length === 0) {
        tablaPendientesBody.innerHTML = `<tr><td colspan="9" style="text-align:center">No hay salidas pendientes</td></tr>`;
        updatePendingCount();
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

      // Event listeners
      tablaPendientesBody.querySelectorAll(".confirm-single").forEach(b => {
        b.addEventListener("click", async (e) => {
          const idx = Number(e.currentTarget.dataset.idx);
          const listNow = getPendingSalidas();
          if (!listNow[idx]) {
            showToast("Pendiente no encontrado", false);
            return;
          }
          
          try {
            await processPendings([listNow[idx]], "salidas");
            const newList = getPendingSalidas().filter((_,i) => i !== idx);
            savePendingSalidas(newList);
            renderPendingList();
            await loadAllProductsWithPagination();
            showToast("Pendiente confirmado", true);
          } catch (error) {
            console.error("Error confirmando pendiente:", error);
            showToast("Error al confirmar pendiente", false);
          }
        });
      });
      
      tablaPendientesBody.querySelectorAll(".remove-pend").forEach(b => {
        b.addEventListener("click", (e) => {
          const idx = Number(e.currentTarget.dataset.idx);
          const listNow = getPendingSalidas();
          if (!listNow[idx]) {
            showToast("Pendiente no encontrado", false);
            return;
          }
          
          listNow.splice(idx, 1);
          savePendingSalidas(listNow);
          renderPendingList();
          showToast("Pendiente eliminado", true);
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
        });
      });

      updatePendingCount();
      
    } catch (error) {
      console.error("Error renderizando pendientes:", error);
      showToast("Error al cargar pendientes", false);
    }
  }

  function updatePendingCount() {
    try {
      const count = getPendingSalidas().length;
      if (btnConfirmAll) btnConfirmAll.textContent = `Confirmar pendientes (${count})`;
    } catch (error) {
      console.error("Error actualizando contador:", error);
    }
  }

  async function confirmAllPendings() {
    const list = getPendingSalidas();
    if (!list || list.length === 0) { 
      showToast("No hay pendientes para confirmar", false); 
      return; 
    }
    
    showConfirm(`Confirmar todas las pendientes (${list.length})?`, 
      async () => {
        try {
          await processPendings(list, "salidas");
          savePendingSalidas([]);
          renderPendingList();
          await loadAllProductsWithPagination();
          showToast(`${list.length} pendientes confirmados`, true);
        } catch (error) {
          console.error("Error confirmando pendientes:", error);
          showToast("Error al confirmar pendientes", false);
        }
      },
      () => {
        // Cancelado - sin mensaje
      }
    );
  }

  async function processPendings(items, mode = "salidas") {
    if (!supabase) { 
      showToast("Conexión no disponible", false); 
      return; 
    }
    
    let successes = 0, errors = 0;
    
    for (const it of items) {
      try {
        if (mode === "salidas" || (it.INVENTARIO_ORIGEN && mode !== "entradas")) {
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
      showToast(`${successes} pendientes procesados`, true);
    } else {
      showToast(`${successes} éxitos, ${errors} errores`, false);
    }
    
    return { successes, errors };
  }

  // -------------------- SALIDAS: modal dinámico --------------------
  async function registrarSalida(producto) {
    try {
      await openSalidaModal(producto);
    } catch (error) {
      console.error("Error al abrir modal de salida:", error);
      showToast("Error al abrir modal de salida", false);
    }
  }

  async function openSalidaModal(producto) {
    const existing = document.getElementById("salidaModalOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "salidaModalOverlay";
    overlay.className = "salida-overlay";

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

    // precargar responsable desde sesión
    (async () => {
      try {
        if (supabase && supabase.auth) {
          const { data: authData } = await supabase.auth.getUser();
          const user = authData?.user ?? null;
          if (user && user.email) {
            responsableField.value = user.email;
          }
        }
      } catch (e) {
        // Silencioso
      }
    })();

    function safeStock(prod, inv) {
      try { 
        const s = getStockFromProduct(prod, inv); 
        return Number.isFinite(Number(s)) ? Number(s) : 0; 
      } catch(e){ 
        return 0; 
      }
    }

    const invs = ["I069","I078","I07F","I312","I073"];

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
        input.addEventListener("input", () => {
          if (input.value === "" || input.value === null) input.value = "0";
          updateConfirmState();
        });

        right.appendChild(input);
        row.appendChild(left);
        row.appendChild(right);
        distribContainer.appendChild(row);
      }
    }

    renderDistribRows();

    function getDistrib() {
      const inputs = Array.from(distribContainer.querySelectorAll('input[data-inv]'));
      return inputs.map(i => ({ inv: i.getAttribute('data-inv'), qty: Number(i.value || 0), el: i }));
    }

    function updateConfirmState() {
      const totalNeeded = Number(cantidadInput.value || 0);
      if (!totalNeeded || totalNeeded <= 0) { 
        btnConfirm.disabled = true; 
        return; 
      }
      const distrib = getDistrib();
      const sum = distrib.reduce((s,d) => s + Number(d.qty || 0), 0);
      const availTotal = distrib.reduce((s,d) => s + safeStock(producto, d.inv), 0);
      if (!Number.isFinite(sum)) { 
        btnConfirm.disabled = true; 
        return; 
      }
      if (Math.abs(sum - totalNeeded) > 1e-6 || totalNeeded > availTotal) { 
        btnConfirm.disabled = true; 
        return; 
      }
      btnConfirm.disabled = false;
    }

    cantidadInput.addEventListener("input", updateConfirmState);
    distribContainer.addEventListener("input", updateConfirmState);

    btnLimpiar.addEventListener("click", () => {
      distribContainer.querySelectorAll('input[data-inv]').forEach(i => { 
        if (!i.disabled) i.value = "0"; 
      });
      cantidadInput.value = "";
      updateConfirmState();
    });

    const closeOverlay = () => overlay.remove();
    btnCancel.addEventListener("click", closeOverlay);
    closeX.addEventListener("click", closeOverlay);
    overlay.addEventListener("click", (e) => { 
      if (e.target === overlay) closeOverlay(); 
    });
    window.addEventListener("keydown", function onEsc(ev){ 
      if (ev.key === "Escape") { 
        closeOverlay(); 
        window.removeEventListener("keydown", onEsc); 
      } 
    });

    setTimeout(updateConfirmState, 50);

    btnConfirm.addEventListener("click", () => {
      try {
        const totalNeeded = Number(cantidadInput.value || 0);
        if (!totalNeeded || totalNeeded <= 0) { 
          showToast("Cantidad inválida", false); 
          return; 
        }

        const distrib = getDistrib().filter(d => Number(d.qty) > 0);
        if (distrib.length === 0) { 
          showToast("Distribución inválida", false); 
          return; 
        }
        if (Math.abs(distrib.reduce((s,d) => s + Number(d.qty || 0), 0) - totalNeeded) > 1e-6) { 
          showToast("La suma por inventario debe coincidir con el total", false); 
          return; 
        }

        const responsableVal = responsableField.value || "";
        const destinatarioVal = destinatarioField.value || "";
        const obsVal = obsField.value || "";

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

        showToast("Salida agregada a pendientes", true);
        renderPendingList();
        closeOverlay();
        
      } catch (err) {
        console.error("Error al agregar pendiente:", err);
        showToast("Error al agregar pendiente", false);
      }
    });
  }

  // -------------------- ENTRADAS --------------------
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

    responsableField.readOnly = true;
    responsableField.tabIndex = -1;
    Object.assign(responsableField.style, {
      backgroundColor: "#f3f4f6",
      cursor: "not-allowed",
      borderColor: "rgba(0,0,0,0.08)"
    });

    (async () => {
      try {
        if (supabase) {
          const { data: authData } = await supabase.auth.getUser();
          const user = authData?.user ?? null;
          if (user && user.email) {
            responsableField.value = user.email;
          }
        }
      } catch (e) {
        // Silencioso
      }
    })();

    const parseQ = (el) => {
      const s = String(el?.value || "0").trim().replace(",", ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    const computeTotal = () => {
      const t = parseQ(i069) + parseQ(i078) + parseQ(i07f) + parseQ(i312) + parseQ(i073);
      totalField.value = Number.isFinite(t) ? t.toFixed(3) : "0.000";
      return t;
    };
    
    [i069, i078, i07f, i312, i073].forEach(inp => inp.addEventListener("input", computeTotal));
    computeTotal();

    const closeOverlay = () => overlay.remove();
    
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
          showToast("Ingresa al menos una cantidad mayor a 0", false);
          registerBtn.disabled = false; 
          registerBtn.textContent = "Registrar entrada"; 
          return;
        }
        
        if (!responsable) {
          showToast("Responsable requerido", false);
          registerBtn.disabled = false; 
          registerBtn.textContent = "Registrar entrada"; 
          return;
        }

        await registerEntradaImmediate(producto, {
          q069: q069v, q078: q078v, q07f: q07fv, q312: q312v, q073: q073v, total, responsable, nota: ""
        });

        showToast("Entrada registrada", true);

        try { 
          await loadAllProductsWithPagination(); 
        } catch (e) {
          console.error("Error actualizando productos:", e);
        }

        setTimeout(closeOverlay, 700);
      } catch (err) {
        console.error("Error registrando entrada:", err);
        showToast(`Error: ${err.message}`, false);
      } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = "Registrar entrada";
      }
    });
  }

  async function registerEntradaImmediate(producto, { q069=0, q078=0, q07f=0, q312=0, q073=0, total=0, responsable="", nota="" } = {}) {
    if (!supabase) throw new Error("Supabase no inicializado");

    function _getNowISO() {
      try { return (new Date()).toISOString(); } catch(e){ return null; }
    }
    const fechaNow = (typeof getCurrentLocalDate === 'function') ? getCurrentLocalDate() : _getNowISO();

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
      showToast(`Error BD: ${insertErr.message}`, false);
      throw insertErr;
    }

    try { 
      await ensureProductosSinCodigoColumnMap(); 
    } catch(e) { 
      console.warn("Mapa columnas no cargado:", e); 
    }

    let prodRow = null;
    try {
      if (producto && (producto.id || producto.ID || producto.Id)) {
        const idVal = producto.id ?? producto.ID ?? producto.Id;
        const { data: pData, error: pErr } = await supabase.from("productos_sin_codigo").select("*").eq("id", idVal).maybeSingle();
        if (!pErr) prodRow = pData;
      }

      if (!prodRow) {
        const codigoVal = (producto?.CODIGO ?? producto?.codigo ?? "").toString().trim();
        if (codigoVal) {
          const { data: pData2, error: pErr2 } = await supabase.from("productos_sin_codigo").select("*").ilike("CODIGO", codigoVal).limit(1).maybeSingle();
          if (!pErr2) prodRow = pData2;
        }
      }
    } catch (err) {
      console.warn("Error buscando producto:", err);
    }

    if (!prodRow) {
      showToast("Entrada registrada; producto no encontrado para stock", false);
      return Array.isArray(insertData) ? insertData[0] : insertData;
    }

    const additions = {
      "I069": Number(q069 || 0),
      "I078": Number(q078 || 0),
      "I07F": Number(q07f || 0),
      "I312": Number(q312 || 0),
      "I073": Number(q073 || 0)
    };

    const updates = {};
    const prodKeys = Object.keys(prodRow || {});

    for (const shortInv of Object.keys(additions)) {
      const qty = Number(additions[shortInv] || 0);
      if (!qty) continue;

      let colName = null;
      try { colName = getRealColForInventoryLabel(shortInv); } catch(e) { colName = null; }

      if (!colName) {
        const nkShort = normalizeKeyName(shortInv);
        colName = prodKeys.find(k => normalizeKeyName(k).includes(nkShort) && normalizeKeyName(k).includes("inventario")) || null;
      }

      if (!colName) {
        colName = prodKeys.find(k => normalizeKeyName(k).includes("inventario") && /\d{2,}/.test(k)) || null;
      }

      if (colName) {
        const current = toNumber(prodRow[colName]);
        updates[colName] = roundFloat(current + qty);
      }
    }

    const physCol = prodKeys.find(k => {
      const nk = normalizeKeyName(k);
      return nk.includes("fisico") || nk.includes("fisinco") || nk.includes("inventariofisico") || nk.includes("inventariofisicoenalmacen") || nk.includes("fisic") || (nk.includes("almacen") && !nk.includes("inventario"));
    }) || prodKeys.find(k => normalizeKeyName(k).includes("inventario") && normalizeKeyName(k).includes("fisico")) || null;

    let totalComputed = 0;
    prodKeys.forEach(k => {
      const nk = normalizeKeyName(k);
      if (k === physCol) return;
      if (nk.includes("inventario") || nk.includes("almacen") || /\bi0?69\b/.test(nk) || /\bi0?78\b/.test(nk) || /\bi0?7f\b/.test(nk) || /\bi312\b/.test(nk) || /\bi073\b/.test(nk)) {
        const val = updates.hasOwnProperty(k) ? toNumber(updates[k]) : toNumber(prodRow[k]);
        totalComputed += Number(val || 0);
      }
    });

    if (physCol) {
      updates[physCol] = roundFloat(totalComputed);
    }

    if (Object.keys(updates).length > 0) {
      try {
        const { error: updErr } = await supabase.from("productos_sin_codigo").update(updates).eq("id", prodRow.id);
        if (updErr) {
          console.warn("Error actualizando stock:", updErr);
          showToast("Entrada guardada, error en stock", false);
        } else {
          showToast("Entrada registrada y stock actualizado", true);
        }
      } catch (err) {
        console.error("Error actualizando producto:", err);
        showToast("Entrada registrada, error en stock", false);
      }
    } else {
      showToast("Entrada registrada", true);
    }

    return Array.isArray(insertData) ? insertData[0] : insertData;
  }

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

    function closeOverlay() { overlay.remove(); }
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
        showToast(`Error: ${error.message}`, false);
        throw error;
      }
      
      const rows = data || [];

      if (!rows || rows.length === 0) {
        histContent.innerHTML = `<div style="padding:18px">No se encontraron entradas para este producto.</div>`;
        return;
      }

      const tableWrap = document.createElement("div");
      tableWrap.style.overflow = "auto";

      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.fontSize = "14px";
      table.style.minWidth = "760px";

      const thStyle = "text-align:left;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.06);font-weight:600;color:#374151";
      const tdStyle = "padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.04);color:#111";
      const smallTdStyle = "padding:12px 8px;border-bottom:1px solid rgba(0,0,0,0.04);color:#111;text-align:right;white-space:nowrap";

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
      }, 150));

    } catch (err) {
      console.error("Error cargando historial:", err);
      histContent.innerHTML = `<div style="padding:18px;color:#7f1d1d">Error cargando historial.</div>`;
      showToast(`Error: ${err.message}`, false);
    }
  }
// ------------------- FUNCIÓN PARA ACTUALIZAR BADGE EN BOTÓN VER SALIDAS -------------------
function updateVerSalidasBadge() {
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

  const count = getPendingSalidas().length;
  if (!count || count === 0) {
    badge.style.display = 'none';
    return;
  }

  badge.style.display = 'flex';
  badge.textContent = count > 99 ? '99+' : String(count);
}
  // -------------------- SETUP & BOOT --------------------
  function setupButtonsAndEvents() {
    try {
      ensureTableScrollContainer();
      
      if (btnOpenModal) btnOpenModal.addEventListener("click", openProductModal);
      if (btnCloseModal) btnCloseModal.addEventListener("click", closeProductModal);
      if (btnCancelModal) btnCancelModal.addEventListener("click", (e)=> { e.preventDefault(); closeProductModal(); });
      if (productForm) productForm.addEventListener("submit", saveProductFromForm);
      
      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
          loadAllProductsWithPagination();
        });
      }
      
      if (btnConfirmAll) btnConfirmAll.addEventListener("click", confirmAllPendings);
      
      if (btnClearPending) {
        btnClearPending.addEventListener("click", ()=> {
          showConfirm("Eliminar todas las salidas pendientes?", ()=> { 
            savePendingSalidas([]); 
            renderPendingList(); 
            showToast("Pendientes eliminados", true);
          });
        });
      }

      setupSearchWithPagination();
      
    } catch (error) {
      console.error("Error en configuración inicial:", error);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      setupButtonsAndEvents();
      await loadAllProductsWithPagination();
      renderPendingList();
      updatePendingCount();
      
      // exponer funciones globales
      window.editarProducto = editarProductoById;
      window.eliminarProducto = eliminarProducto;
      window.registrarSalida = registrarSalida;
      window.openEntradaModalById = openEntradaModalById;
      window.openEntradaHistoryModal = openEntradaHistoryModal;
      window.reloadAllProducts = loadAllProductsWithPagination;
      
    } catch (err) {
      console.error("Error iniciando módulo:", err);
      showToast(`Error iniciando: ${err.message}`, false);
    }
  });
})();

function renderTable(products) {
  // ... código anterior ...
  
  products.forEach((p) => {
    const i069 = getStockFromProduct(p, "I069");
    const i078 = getStockFromProduct(p, "I078");
    const i07f = getStockFromProduct(p, "I07F");
    const i312 = getStockFromProduct(p, "I312");
    const i073 = getStockFromProduct(p, "I073");
    const stockReal = i069 + i078 + i07f + i312 + i073;

    // DEBUG: Mostrar en consola para un producto específico
    if (p.CODIGO === "TU_CODIGO_PROBLEMA" || p.DESCRIPCION.includes("TU_PRODUCTO_PROBLEMA")) {
      console.log("DEBUG Stock:", {
        producto: p.DESCRIPCION,
        i069, i078, i07f, i312, i073,
        total: stockReal,
        objetoCompleto: p
      });
    }
    
    // ... resto del código
  });
}