function protectPage() {
  console.log("🛡️ protectPage ejecutada");
  // Aquí puedes agregar lógica de protección si es necesaria
  return true;
}
// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ------------------- Selectores DOM (si existen) -------------------
const tableBody = document.querySelector("#inventoryTable tbody");
const searchInput = document.getElementById("searchInput");
const modal = document.getElementById("modalForm"); // modal para agregar/editar producto
const btnOpenModal = document.getElementById("btnOpenModal");
const btnCloseModal = document.getElementById("btnCloseModal");
const productForm = document.getElementById("productForm");
const btnCancelModal = document.querySelector('#btnCancelModal');
const refreshBtn = document.getElementById("refreshReport");

const tablaPendientesBody = document.querySelector("#pendingTable tbody"); // usado en renderPendingList
const tablaHistorialBody = document.querySelector("#salidasTable tbody"); // usado por historial

const btnConfirmAll = document.getElementById("btnConfirmAll");
const btnClearPending = document.getElementById("btnClearPending");
const btnRefresh = document.getElementById("btnRefresh");

const nombreResponsableInput = document.getElementById("nombreResponsable");

// Estado de edición
let editMode = false;
let editingCodigo = null;
// estado global del usuario autenticado (nombre/apellido)
let CURRENT_USER_FULLNAME = "";
let CURRENT_USER_NOMBRE = "";
let CURRENT_USER_APELLIDO = "";
let PRODUCTOS_SIN_CODIGO_COLUMN_MAP = null; // map: normalizedKey -> realColumnName

// ------------------- VARIABLES PARA CARGA PROGRESIVA -------------------
let currentOffset = 0;
const BATCH_SIZE = 500;
let isLoading = false;
let hasMoreData = true;
let allLoadedProducts = []; // Acumula todos los productos cargados
let currentFilteredProducts = []; // Para búsquedas

// Helper para calcular la suma de inventarios
function calcularAlmacen(producto) {
  const i069 = getStockFromProduct(producto, 'I069') ?? 0;
  const i078 = getStockFromProduct(producto, 'I078') ?? 0;
  const i07f = getStockFromProduct(producto, 'I07F') ?? 0;
  const i312 = getStockFromProduct(producto, 'I312') ?? 0;
  const i073 = getStockFromProduct(producto, 'I073') ?? 0;

  return i069 + i078 + i07f + i312 + i073;
}

// ------------------- Función Toast -------------------
function showToast(message, success = true) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = "show"; // añade clase visible (usa CSS para animación)
  toast.style.background = success ? "linear-gradient(90deg,#16a34a,#059669)" : "linear-gradient(90deg,#ef4444,#dc2626)";
  // aseguramos z-index alto para que esté delante del overlay/modal
  toast.style.zIndex = "13000";

  // animar: la clase .show ya controla la opacidad/transform
  // remover si había timeout anterior
  if (toast._timeout) clearTimeout(toast._timeout);
  // pequeño delay para aplicar transición (si recién creado)
  setTimeout(() => toast.classList.add("show"), 20);

  toast._timeout = setTimeout(() => {
    toast.classList.remove("show");
    // limpiar texto después de animación
    setTimeout(() => { toast.textContent = ""; }, 280);
  }, 3000);
}

// ------------------- Confirmación personalizada -------------------
function showConfirm(message, onConfirm) {
  const confirmModal = document.getElementById("confirmModal");
  const confirmMessage = document.getElementById("confirmMessage");
  const btnYes = document.getElementById("btnConfirmYes");
  const btnNo = document.getElementById("btnConfirmNo");

  if (!confirmModal || !confirmMessage || !btnYes || !btnNo) {
    // Fallback si no existe el modal personalizado
    if (confirm(message)) onConfirm();
    return;
  }

  confirmMessage.textContent = message;
  confirmModal.style.display = "flex";

  btnYes.onclick = () => {
    confirmModal.style.display = "none";
    onConfirm();
  };

  btnNo.onclick = () => {
    confirmModal.style.display = "none";
  };
}

// ------------------- Helpers numéricos y de escape -------------------
const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const cleaned = String(v).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
};

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Normaliza texto para comparar nombres de columna
function normalizeKeyName(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[^a-z0-9]/g, ""); // quitar espacios/puntuación
}

// Dado un inventario como "I078" o "INVENTARIO I078" devuelve variantes esperables
function inventoryKeyVariants(inv) {
  if (!inv) return [];
  const short = String(inv).trim().toUpperCase().replace(/^INVENTARIO\s*/i, "");
  const variants = [];

  // forma con espacios y mayúsculas (antigua)
  variants.push(`INVENTARIO ${short}`); // "INVENTARIO I078"
  // forma snake_case (nueva)
  variants.push(`inventario_${short.toLowerCase()}`); // "inventario_i078"
  // otras formas posibles
  variants.push(`INVENTARIO ${short.replace(/^0+/, "")}`);
  variants.push(`inventario${short.toLowerCase()}`);
  // forma sin prefijo (por si en tu BD guardaste solo I078)
  variants.push(`${short}`);
  // normalizada (por si el nombre de la columna tenía acentos/varios)
  return [...new Set(variants)];
}

// Busca en el objeto producto la primera clave existente entre variantes y devuelve su valor numérico
function getStockFromProduct(productObj, inventoryLabel) {
  if (!productObj) return 0;
  const variants = inventoryKeyVariants(inventoryLabel);
  const keys = Object.keys(productObj || {});
  const normMap = new Map(keys.map(k => [normalizeKeyName(k), k]));

  for (const v of variants) {
    const nk = normalizeKeyName(v);
    if (normMap.has(nk)) {
      const realKey = normMap.get(nk);
      return toNumber(productObj[realKey]);
    }
  }

  // fallback: si existe alguna columna que contenga 'inventario' o 'almacen'
  for (const k of keys) {
    const nk = normalizeKeyName(k);
    if (nk.includes("inventario") || nk.includes("almacen")) {
      return toNumber(productObj[k]);
    }
  }

  return 0;
}

// muestra números con decimales si los tienen, mantiene strings tal cual
function formatShowValue(val) {
  if (val === null || val === undefined || val === "") return "";
  // si ya es número
  if (typeof val === "number") {
    // si tiene parte fraccional -> mostrar hasta 2 decimales sin eliminar ceros significativos
    if (!Number.isInteger(val)) {
      // elimina ceros finales innecesarios pero conserva al menos 1 decimal si corresponde
      return Number(val).toString();
    }
    return String(val);
  }
  // si es string que representa número, intentamos mantener su forma
  const maybeNum = Number(String(val).replace(/,/g, '.').trim());
  if (!Number.isNaN(maybeNum)) {
    if (!Number.isInteger(maybeNum)) return String(maybeNum);
    return String(maybeNum);
  }
  // fallback: texto
  return String(val);
}

if (typeof btnCancelModal !== 'undefined' && btnCancelModal && !btnCancelModal.dataset.cancelAttached) {
  btnCancelModal.addEventListener('click', (e) => {
    e.preventDefault();
    if (!productForm || !modal) return;
    // cerrar modal
    modal.style.display = 'none';
    // limpiar form
    if (typeof clearProductFormFields === 'function') clearProductFormFields();
    // resetear flags de edición
    editMode = false;
    editingCodigo = null;
    // restaurar botón guardar
    const saveBtnInside = productForm.querySelector('.btn-save');
    if (saveBtnInside) {
      saveBtnInside.disabled = false;
      saveBtnInside.textContent = "Crear Producto";
    }
  });
  btnCancelModal.dataset.cancelAttached = "true";
}

// ------------------- CONFIGURACIÓN ESPECÍFICA PARA TU ESTRUCTURA -------------------
async function ensureProductosSinCodigoColumnMap() {
  if (PRODUCTOS_SIN_CODIGO_COLUMN_MAP) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
  PRODUCTOS_SIN_CODIGO_COLUMN_MAP = {};
  if (!supabase) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
  
  try {
    console.log("🔍 Detectando estructura de columnas de productos_sin_codigo...");
    const { data, error } = await supabase.from("productos_sin_codigo").select("*").limit(5);
    
    if (error) {
      console.warn("Error al detectar columnas:", error);
      return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
    }
    
    if (data && data.length > 0) {
      const sampleRow = data[0];
      console.log("📋 Columnas reales en tu BD productos_sin_codigo:", Object.keys(sampleRow));
      
      // Mapear todas las columnas encontradas
      Object.keys(sampleRow).forEach((key) => {
        PRODUCTOS_SIN_CODIGO_COLUMN_MAP[normalizeKeyName(key)] = key;
      });
      
      console.log("🗺️ Mapa de columnas normalizado:", PRODUCTOS_SIN_CODIGO_COLUMN_MAP);
    }
    
    return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
  } catch (e) {
    console.error("Error en ensureProductosSinCodigoColumnMap:", e);
    return PRODUCTOS_SIN_CODIGO_COLUMN_MAP;
  }
}

// ------------------- FUNCIÓN ESPECÍFICA PARA TUS COLUMNAS -------------------
function getRealColForInventoryLabel(invLabel) {
  if (!PRODUCTOS_SIN_CODIGO_COLUMN_MAP) return null;
  
  console.log(`🔍 Buscando columna para: ${invLabel}`);
  
  // PARA TU ESTRUCTURA ESPECÍFICA - los nombres exactos de tus columnas
  const columnMapping = {
    'I069': 'INVENTARIO I069',
    'I078': 'INVENTARIO I078', 
    'I07F': 'INVENTARIO I07F',
    'I312': 'INVENTARIO I312',
    'I073': 'INVENTARIO I073',
    'ALMACEN': 'INVENTARIO FISICO EN ALMACEN'
  };

  // Primero intentar con el mapeo directo
  const directMap = columnMapping[invLabel];
  if (directMap && PRODUCTOS_SIN_CODIGO_COLUMN_MAP[normalizeKeyName(directMap)]) {
    const realKey = PRODUCTOS_SIN_CODIGO_COLUMN_MAP[normalizeKeyName(directMap)];
    console.log(`✅ Columna encontrada por mapeo directo: ${realKey} para ${invLabel}`);
    return realKey;
  }

  // Si no funciona, buscar variantes
  const variants = [
    `INVENTARIO ${invLabel}`,           // "INVENTARIO I069"
    `INVENTARIO ${invLabel.toLowerCase()}`, // "INVENTARIO i069"
    `INVENTARIO_${invLabel}`,           // "INVENTARIO_I069"
    `INVENTARIO_${invLabel.toLowerCase()}`, // "INVENTARIO_i069"
    `${invLabel}`,                      // "I069"
    `${invLabel.toLowerCase()}`,        // "i069"
  ];

  for (const variant of variants) {
    const normVariant = normalizeKeyName(variant);
    if (PRODUCTOS_SIN_CODIGO_COLUMN_MAP[normVariant]) {
      console.log(`✅ Columna encontrada por variante: ${PRODUCTOS_SIN_CODIGO_COLUMN_MAP[normVariant]} para ${invLabel}`);
      return PRODUCTOS_SIN_CODIGO_COLUMN_MAP[normVariant];
    }
  }
  
  console.warn(`❌ No se encontró columna para: ${invLabel}`);
  return null;
}

// ------------------- RENDER TABLE CORREGIDA CON COLUMNA CÓDIGO -------------------
function renderTable(products) {
  if (!tableBody) {
    console.error("❌ tableBody no encontrado en el DOM");
    return;
  }
  
  // Asegurarse de que products es un array válido
  if (!products || !Array.isArray(products)) {
    console.warn("⚠️ renderTable recibió datos inválidos, usando array vacío");
    products = [];
  }
  
  console.log("🎨 Renderizando tabla con", products.length, "productos");
  tableBody.innerHTML = "";

  if (products.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No hay productos que coincidan con la búsqueda</td></tr>`;
    return;
  }

  products.forEach((p, index) => {
    // Obtener el código S/C - ESTA ES LA PARTE IMPORTANTE
    const codigoSC = extraerCodigoSC(p);
    
    // Obtener stocks usando las columnas específicas de tu BD
    const i069 = getStockFromProduct(p, "I069");
    const i078 = getStockFromProduct(p, "I078");
    const i07f = getStockFromProduct(p, "I07F");
    const i312 = getStockFromProduct(p, "I312");
    const i073 = getStockFromProduct(p, "I073");

    // Calcular total
    const stockReal = i069 + i078 + i07f + i312 + i073;
    
    // Debug para los primeros 2 productos
    if (index < 2) {
      console.log(`📊 Producto ${index + 1}: Código=${codigoSC}, I069=${i069}, I078=${i078}, I07F=${i07f}, I312=${i312}, I073=${i073}, TOTAL=${stockReal}`);
    }

    // Determinar clase de stock
    let stockClass = "stock-high";
    if (stockReal <= 1) stockClass = "stock-low";
    else if (stockReal <= 10) stockClass = "stock-medium";

    // Crear fila
    const row = document.createElement("tr");
    row.className = stockClass;

    // Usar las columnas reales de tu BD
    const descripcion = p.DESCRIPCION || "";
    const um = p.UM || "";

    row.innerHTML = `
      <td>${escapeHtml(codigoSC)}</td>
      <td>${escapeHtml(descripcion)}</td>
      <td>${um}</td>
      <td>${formatShowValue(i069)}</td>
      <td>${formatShowValue(i078)}</td>
      <td>${formatShowValue(i07f)}</td>
      <td>${formatShowValue(i312)}</td>
      <td>${formatShowValue(i073)}</td>
      <td>${formatShowValue(stockReal)}</td>
      <td class="acciones">
        <button class="btn btn-edit" onclick="editarProducto(${JSON.stringify(p).replace(/"/g, '&quot;')})">
          <span class="icon-wrap" aria-hidden>✏️</span>
          <span class="label">Editar</span>
        </button>
        <button class="btn btn-delete" onclick="eliminarProducto('${p.id}')">
          <span class="icon-wrap" aria-hidden>🗑️</span>
          <span class="label">Eliminar</span>
        </button>
        <button class="btn btn-salida" onclick="openSalidaModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">
          <span class="icon-wrap" aria-hidden>📦</span>
          <span class="label">Salida</span>
        </button>
      </td>
    `;

    tableBody.appendChild(row);
  });

  console.log("✅ Tabla renderizada correctamente con columna de código");
}
// ------------------- FUNCIÓN DE DIAGNÓSTICO PARA VER COLUMNAS -------------------
async function diagnosticarColumnas() {
  console.log("🔍 DIAGNÓSTICO DE COLUMNAS - Iniciando...");
  
  try {
    // Obtener un producto de muestra para ver todas las columnas
    const { data: productoMuestra, error } = await supabase
      .from("productos_sin_codigo")
      .select("*")
      .limit(1)
      .single();
    
    if (error) {
      console.error("❌ Error al obtener producto de muestra:", error);
      return;
    }
    
    if (productoMuestra) {
      console.log("📋 TODAS LAS COLUMNAS DISPONIBLES en productos_sin_codigo:");
      console.log("---------------------------------------------------");
      Object.keys(productoMuestra).forEach((columna, index) => {
        console.log(`${index + 1}. ${columna}: ${productoMuestra[columna]}`);
      });
      console.log("---------------------------------------------------");
      
      // Probar la extracción de código
      const codigoExtraido = extraerCodigoSC(productoMuestra);
      console.log(`🔍 Código extraído: "${codigoExtraido}"`);
    }
    
  } catch (err) {
    console.error("❌ Error en diagnóstico de columnas:", err);
  }
}

// Ejecutar el diagnóstico cuando se cargue la página
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(diagnosticarColumnas, 2000);
});
// ------------------- DIAGNÓSTICO COMPLETO -------------------
async function diagnosticarProblemaCompleto() {
  console.log("🔧 DIAGNÓSTICO COMPLETO INICIADO");
  
  try {
    // 1. Contar productos totales
    const { count, error: countError } = await supabase
      .from("productos_sin_codigo")
      .select("*", { count: 'exact', head: true });
    
    if (countError) {
      console.error("❌ Error al contar productos:", countError);
    } else {
      console.log(`📊 TOTAL de productos en BD: ${count}`);
    }

    // 2. Obtener muestra de productos
    const { data: productos, error: productosError } = await supabase
      .from("productos_sin_codigo")
      .select("*")
      .limit(10);

    if (productosError) {
      console.error("❌ Error al obtener productos:", productosError);
      return;
    }

    console.log(`📦 Muestra de ${productos.length} productos obtenida`);
    
    // 3. Verificar columnas de inventario
    console.log("🔍 Verificando columnas de inventario...");
    const inventarios = ['I069', 'I078', 'I07F', 'I312', 'I073'];
    
    inventarios.forEach(inv => {
      const columna = getRealColForInventoryLabel(inv);
      if (columna) {
        console.log(`   ${inv} → ${columna}`);
      } else {
        console.log(`   ❌ ${inv} → NO ENCONTRADO`);
      }
    });

    // 4. Verificar valores de stock para los primeros productos
    console.log("📊 Verificando stocks para primeros 3 productos:");
    productos.slice(0, 3).forEach((producto, index) => {
      console.log(`   Producto ${index + 1}:`);
      inventarios.forEach(inv => {
        const stock = getStockFromProduct(producto, inv);
        console.log(`     ${inv}: ${stock}`);
      });
    });

  } catch (error) {
    console.error("❌ Error en diagnóstico completo:", error);
  }
}

function showLoadingIndicator(show, message = "Cargando más productos...") {
  let indicator = document.getElementById('loadingIndicator');
  
  if (show) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loadingIndicator';
      indicator.style.cssText = `
        text-align: center; 
        padding: 20px; 
        color: #666;
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
      `;
      
      indicator.innerHTML = `
        <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span style="margin-left: 10px;">${message}</span>
        <div style="font-size: 12px; margin-top: 5px; color: #888;">
          ${allLoadedProducts.length} productos cargados
          ${!hasMoreData ? ' • Carga completa' : ''}
        </div>
      `;
      
      if (tableBody) {
        tableBody.parentNode.appendChild(indicator);
      }
    } else {
      indicator.style.display = 'block';
    }
  } else if (indicator) {
    indicator.style.display = 'none';
  }
}

// ------------------- CARGAR TODOS LOS PRODUCTOS DE UNA VEZ -------------------
async function loadAllProductsAtOnce() {
  try {
    showLoadingIndicator(true, "Cargando todos los productos...");
    
    const { data, error } = await supabase
      .from("productos_sin_codigo")
      .select("*")
      .limit(2000); // Aumentar límite
    
    if (error) throw error;
    
    allLoadedProducts = data || [];
    hasMoreData = false;
    currentOffset = allLoadedProducts.length;
    
    renderTable(allLoadedProducts);
    showToast(`✅ Todos los ${allLoadedProducts.length} productos cargados`, true);
    
  } catch (error) {
    console.error("Error cargando todos los productos:", error);
    showToast("Error cargando todos los productos", false);
  } finally {
    showLoadingIndicator(false);
  }
}

// ------------------- BÚSQUEDA MEJORADA -------------------
function setupSearch() {
  if (searchInput) {
    searchInput.replaceWith(searchInput.cloneNode(true));
    const newSearchInput = document.getElementById("searchInput");
    
    newSearchInput.addEventListener('input', debounce(async (e) => {
      const term = e.target.value.trim();
      
      if (term === '') {
        // Mostrar productos cargados localmente
        renderTable(allLoadedProducts);
        return;
      }
      
      console.log(`🔍 Buscando en tiempo real: "${term}"`);
      
      try {
        // Búsqueda en Supabase para resultados completos
        const { data, error } = await supabase
          .from("productos_sin_codigo")
          .select("*")
          .or(`DESCRIPCION.ilike.%${term}%`)
          .limit(100);
          
        if (error) throw error;
        
        console.log(`✅ Resultados de búsqueda: ${data?.length || 0}`);
        renderTable(data || []);
        
      } catch (error) {
        console.error("Error en búsqueda:", error);
        // Fallback a búsqueda local
        const localResults = allLoadedProducts.filter(producto => {
          const descripcion = String(producto.DESCRIPCION || "").toLowerCase();
          return descripcion.includes(term.toLowerCase());
        });
        renderTable(localResults);
      }
    }, 300));
  }
}

// ------------------- CARGA PROGRESIVA OPTIMIZADA -------------------
async function loadMoreProducts() {
  if (!supabase || isLoading || !hasMoreData) return;

  try {
    isLoading = true;
    showLoadingIndicator(true);

    console.log(`🔄 Cargando productos — offset ${currentOffset} (lote ${BATCH_SIZE})...`);

    const { data, error, count } = await supabase
      .from("productos_sin_codigo")
      .select("*", { count: 'exact' })
      .range(currentOffset, currentOffset + BATCH_SIZE - 1);

    if (error) throw error;

    if (!data || data.length === 0) {
      hasMoreData = false;
      console.log("✅ Todos los productos han sido cargados");
      showToast(`Carga completa: ${allLoadedProducts.length} productos`, true);
    } else {
      // Acumular productos
      allLoadedProducts = [...allLoadedProducts, ...data];
      currentOffset += data.length;
      
      console.log(`✅ Lote cargado: ${data.length} items — Total acumulado: ${allLoadedProducts.length}`);
      
      // Solo renderizar si no hay término de búsqueda activo
      if (!searchInput || !searchInput.value.trim()) {
        renderTable(allLoadedProducts);
      }
      updatePendingCount();
    }

  } catch (ex) {
    console.error("❌ Error en loadMoreProducts:", ex);
    showToast("Error cargando productos", false);
  } finally {
    isLoading = false;
    showLoadingIndicator(false);
  }
}

// ------------------- BÚSQUEDA HÍBRIDA (LOCAL + SERVIDOR) -------------------
let searchTimeout = null;
let lastSearchTerm = "";

function performHybridSearch(term) {
  if (searchTimeout) clearTimeout(searchTimeout);
  
  if (term === '') {
    renderTable(allLoadedProducts);
    return;
  }
  
  // Búsqueda inmediata en datos locales
  const localResults = allLoadedProducts.filter(producto => {
    const descripcion = String(producto.DESCRIPCION || "").toLowerCase();
    const searchTerm = term.toLowerCase();
    
    return descripcion.includes(searchTerm);
  });
  
  console.log(`🔍 Búsqueda local: ${localResults.length} resultados`);
  renderTable(localResults);
  
  // Si tenemos todos los datos, no necesitamos buscar en servidor
  if (!hasMoreData) return;
  
  // Búsqueda en servidor después de delay (para términos largos)
  searchTimeout = setTimeout(async () => {
    if (term.length >= 3) { // Solo buscar en servidor para términos de 3+ caracteres
      await performServerSearch(term);
    }
  }, 800);
}

async function performServerSearch(term) {
  try {
    console.log(`🌐 Buscando en servidor: "${term}"`);
    
    const { data, error } = await supabase
      .from("productos_sin_codigo")
      .select("*")
      .or(`DESCRIPCION.ilike.%${term}%`)
      .limit(200);
      
    if (error) throw error;
    
    if (data && data.length > 0) {
      console.log(`✅ Resultados servidor: ${data.length}`);
      
      // Combinar con resultados locales y eliminar duplicados
      const combinedResults = [...data];
      const existingIds = new Set(data.map(p => p.id));
      
      allLoadedProducts.forEach(producto => {
        if (!existingIds.has(producto.id)) {
          const descripcion = String(producto.DESCRIPCION || "").toLowerCase();
          const searchTerm = term.toLowerCase();
          
          if (descripcion.includes(searchTerm)) {
            combinedResults.push(producto);
            existingIds.add(producto.id);
          }
        }
      });
      
      renderTable(combinedResults);
    }
  } catch (error) {
    console.error("Error en búsqueda servidor:", error);
    // Mantener resultados locales en caso de error
  }
}

function setupSearch() {
  if (searchInput) {
    searchInput.replaceWith(searchInput.cloneNode(true));
    const newSearchInput = document.getElementById("searchInput");
    
    newSearchInput.addEventListener('input', (e) => {
      const term = e.target.value.trim();
      performHybridSearch(term);
    });
    
    // Enter para forzar búsqueda en servidor
    newSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const term = e.target.value.trim();
        if (term) performServerSearch(term);
      }
    });
  }
}

function showLoadingIndicator(show, message = "Cargando más productos...") {
  let indicator = document.getElementById('loadingIndicator');
  
  if (show) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loadingIndicator';
      indicator.style.cssText = `
        text-align: center; 
        padding: 20px; 
        color: #666;
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
      `;
      
      indicator.innerHTML = `
        <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span style="margin-left: 10px;">${message}</span>
        <div style="font-size: 12px; margin-top: 5px; color: #888;">
          ${allLoadedProducts.length} productos cargados
          ${!hasMoreData ? ' • Carga completa' : ''}
        </div>
      `;
      
      if (tableBody) {
        tableBody.parentNode.appendChild(indicator);
      }
    } else {
      indicator.style.display = 'block';
    }
  } else if (indicator) {
    indicator.style.display = 'none';
  }
}

// ------------------- DEBOUNCE HELPER -------------------
function debounce(func, wait, immediate) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

// Función para cargar inicialmente
function loadInitialProducts() {
  currentOffset = 0;
  hasMoreData = true;
  allLoadedProducts = [];
  currentFilteredProducts = [];
  
  // Limpiar tabla
  if (tableBody) {
    tableBody.innerHTML = '';
  }
  
  // Ocultar controles de paginación
  const paginationControls = document.getElementById('paginationControls');
  if (paginationControls) {
    paginationControls.style.display = 'none';
  }
  
  loadMoreProducts();
}

// Indicador de carga
function showLoadingIndicator(show) {
  let indicator = document.getElementById('loadingIndicator');
  
  if (show) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loadingIndicator';
      indicator.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #666;">
          <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <span style="margin-left: 10px;">Cargando más productos...</span>
        </div>
      `;
      
      // Agregar estilos CSS para la animación
      if (!document.querySelector('#loadingStyles')) {
        const style = document.createElement('style');
        style.id = 'loadingStyles';
        style.textContent = `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }
      
      if (tableBody) {
        tableBody.parentNode.appendChild(indicator);
      }
    } else {
      indicator.style.display = 'block';
    }
  } else if (indicator) {
    indicator.style.display = 'none';
  }
}

// Configurar infinite scroll
function setupInfiniteScroll() {
  const options = {
    root: null,
    rootMargin: '100px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !isLoading && hasMoreData) {
        loadMoreProducts();
      }
    });
  }, options);

  // Crear elemento observador
  let sentinel = document.getElementById('scrollSentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'scrollSentinel';
    sentinel.style.height = '1px';
    document.querySelector('.container').appendChild(sentinel);
  }
  
  observer.observe(sentinel);
}

// ------------------- RENDER TABLE CORREGIDA -------------------
function renderTable(products) {
  if (!tableBody) {
    console.error("❌ tableBody no encontrado en el DOM");
    return;
  }
  
  // Asegurarse de que products es un array válido
  if (!products || !Array.isArray(products)) {
    console.warn("⚠️ renderTable recibió datos inválidos, usando array vacío");
    products = [];
  }
  
  console.log("🎨 Renderizando tabla con", products.length, "productos");
  tableBody.innerHTML = "";

  if (products.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No hay productos que coincidan con la búsqueda</td></tr>`;
    return;
  }

  products.forEach((p, index) => {
    // Obtener el código S/C
    const codigoSC = extraerCodigoSC(p);
    // Obtener stocks usando las columnas específicas de tu BD


    const i069 = getStockFromProduct(p, "I069");
    const i078 = getStockFromProduct(p, "I078");
    const i07f = getStockFromProduct(p, "I07F");
    const i312 = getStockFromProduct(p, "I312");
    const i073 = getStockFromProduct(p, "I073");

    // Calcular total
    const stockReal = i069 + i078 + i07f + i312 + i073;
    
    // Debug para los primeros 2 productos
    if (index < 2) {
      console.log(`📊 Producto: I069=${i069}, I078=${i078}, I07F=${i07f}, I312=${i312}, I073=${i073}, TOTAL=${stockReal}`);
    }

    // Determinar clase de stock
    let stockClass = "stock-high";
    if (stockReal <= 1) stockClass = "stock-low";
    else if (stockReal <= 10) stockClass = "stock-medium";

    // Crear fila
    const row = document.createElement("tr");
    row.className = stockClass;

    // Usar las columnas reales de tu BD
    const descripcion = p.DESCRIPCION || "";
    const um = p.UM || "";

    row.innerHTML = `
      <td>${escapeHtml(codigoSC)}</td>  
      <td>${escapeHtml(descripcion)}</td>
      <td>${um}</td>
      <td>${formatShowValue(i069)}</td>
      <td>${formatShowValue(i078)}</td>
      <td>${formatShowValue(i07f)}</td>
      <td>${formatShowValue(i312)}</td>
      <td>${formatShowValue(i073)}</td>
      <td>${formatShowValue(stockReal)}</td>
      <td class="acciones">
        <button class="btn btn-edit" onclick="editarProducto(${JSON.stringify(p).replace(/"/g, '&quot;')})">
          <span class="icon-wrap" aria-hidden>✏️</span>
          <span class="label">Editar</span>
        </button>
        <button class="btn btn-delete" onclick="eliminarProducto('${p.id}')">
          <span class="icon-wrap" aria-hidden>🗑️</span>
          <span class="label">Eliminar</span>
        </button>
        <button class="btn btn-salida" onclick="openSalidaModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">
          <span class="icon-wrap" aria-hidden>📦</span>
          <span class="label">Salida</span>
        </button>
      </td>
    `;

    tableBody.appendChild(row);
  });

  console.log("✅ Tabla renderizada correctamente");
}

// ------------------- INICIALIZACIÓN -------------------
document.addEventListener('DOMContentLoaded', function() {
  // Ocultar controles de paginación
  const paginationControls = document.getElementById('paginationControls');
  if (paginationControls) {
    paginationControls.style.display = 'none';
  }

  // Configurar infinite scroll y búsqueda
  setupInfiniteScroll();
  setupSearch();
  
  // Carga inicial
  loadInitialProducts();
  
  // Configurar botón de refresh
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadInitialProducts();
    });
  }
  
  // Configurar modal
  if (btnOpenModal && modal) {
    btnOpenModal.addEventListener('click', () => {
      modal.style.display = 'block';
    });
  }
  
  if (btnCloseModal && modal) {
    btnCloseModal.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }
});

// ------------------- FUNCIONES DE ACTUALIZACIÓN (para mantener compatibilidad) -------------------
function reloadAllProducts() {
  loadInitialProducts();
}

// Función para mantener compatibilidad con tu código existente
async function loadProducts(page = 0) {
  console.warn("⚠️ loadProducts con paginación está obsoleta, usando carga progresiva");
  loadInitialProducts();
}

// ------------------- MANTENER COMPATIBILIDAD CON FUNCIONES EXISTENTES -------------------
// Estas funciones deben mantenerse igual que en tu código original
function updatePendingCount() {
  // Tu implementación existente
}

function clearProductFormFields() {
  // Tu implementación existente  
}

function editarProducto(producto) {
  // Tu implementación existente
}

function eliminarProducto(id) {
  // Tu implementación existente
}

function openSalidaModal(producto) {
  // Tu implementación existente
}

// ------------------- FUNCIONES RESTANTES DE TU CÓDIGO ORIGINAL -------------------

// Función para escapar HTML (si no la tienes)
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getRealColForName(preferredName) {
  if (!PRODUCTOS_SIN_CODIGO_COLUMN_MAP) return null;
  const norm = normalizeKeyName(preferredName);
  return PRODUCTOS_SIN_CODIGO_COLUMN_MAP[norm] || null;
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log("🚀 Inicializando sistema de inventario con carga progresiva para productos sin código...");
}

// ------------------- RENDER TABLE MEJORADA -------------------
function renderTable(products) {
  if (!tableBody) {
    console.error("❌ tableBody no encontrado en el DOM");
    return;
  }
  
  console.log("🎨 Renderizando tabla con", products.length, "productos");
  tableBody.innerHTML = "";

  if (!products || products.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No hay productos</td></tr>`;
    return;
  }

  products.forEach((p, index) => {
    // Obtener stocks usando las columnas específicas de tu BD
    const i069 = getStockFromProduct(p, "I069");
    const i078 = getStockFromProduct(p, "I078");
    const i07f = getStockFromProduct(p, "I07F");
    const i312 = getStockFromProduct(p, "I312");
    const i073 = getStockFromProduct(p, "I073");

    // Calcular total
    const stockReal = i069 + i078 + i07f + i312 + i073;
    
    // Debug para los primeros 2 productos
    if (index < 2) {
      console.log(`📊 Producto: I069=${i069}, I078=${i078}, I07F=${i07f}, I312=${i312}, I073=${i073}, TOTAL=${stockReal}`);
    }

    // Determinar clase de stock
    let stockClass = "stock-high";
    if (stockReal <= 1) stockClass = "stock-low";
    else if (stockReal <= 10) stockClass = "stock-medium";

    // Crear fila
    const row = document.createElement("tr");
    row.className = stockClass;

    // Usar las columnas reales de tu BD
    const descripcion = p.DESCRIPCION || "";
    const um = p.UM || "";

    row.innerHTML = `
      <td>${escapeHtml(descripcion)}</td>
      <td>${um}</td>
      <td>${formatShowValue(i069)}</td>
      <td>${formatShowValue(i078)}</td>
      <td>${formatShowValue(i07f)}</td>
      <td>${formatShowValue(i312)}</td>
      <td>${formatShowValue(i073)}</td>
      <td>${formatShowValue(stockReal)}</td>
      <td class="acciones">
        <button class="btn btn-edit" onclick="editarProducto(${JSON.stringify(p).replace(/"/g, '&quot;')})">
          <span class="icon-wrap" aria-hidden>✏️</span>
          <span class="label">Editar</span>
        </button>
        <button class="btn btn-delete" onclick="eliminarProducto('${p.id}')">
          <span class="icon-wrap" aria-hidden>🗑️</span>
          <span class="label">Eliminar</span>
        </button>
        <button class="btn btn-salida" onclick="openSalidaModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">
          <span class="icon-wrap" aria-hidden>📦</span>
          <span class="label">Salida</span>
        </button>
      </td>
    `;

    tableBody.appendChild(row);
  });

  console.log("✅ Tabla renderizada correctamente");
}

// ------------------- CONFIGURACIÓN DE PAGINACIÓN MEJORADA -------------------
let currentPage = 1;
const ITEMS_PER_PAGE = 500;
let totalProducts = 0;
let paginatedProducts = [];
let allProductsFromServer = [];

// ------------------- FUNCIONES DE PAGINACIÓN -------------------
function setupPagination() {
    // Crear controles de paginación si no existen
    let paginationContainer = document.getElementById('paginationControls');
    
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'paginationControls';
        paginationContainer.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            flex-wrap: wrap;
            border: 1px solid #e9ecef;
        `;
        
        // Insertar después de la tabla
        const table = document.getElementById('inventoryTable');
        if (table) {
            table.parentNode.insertBefore(paginationContainer, table.nextSibling);
        }
    }
    
    // MOSTRAR LA PAGINACIÓN AUTOMÁTICAMENTE
    paginationContainer.style.display = 'flex';
    
    updatePaginationControls();
}

function updatePaginationControls() {
    const paginationContainer = document.getElementById('paginationControls');
    if (!paginationContainer) return;
    
    const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
    const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalProducts);
    
    paginationContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button id="firstPage" class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''}>
                ⏮️ Primera
            </button>
            <button id="prevPage" class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''}>
                ◀️ Anterior
            </button>
            
            <div style="display: flex; align-items: center; gap: 8px; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #dee2e6;">
                <span style="font-weight: 600; color: #495057;">Página</span>
                <input 
                    type="number" 
                    id="pageInput" 
                    value="${currentPage}" 
                    min="1" 
                    max="${totalPages}" 
                    style="width: 70px; padding: 6px; text-align: center; border: 1px solid #ced4da; border-radius: 4px; font-weight: bold;"
                >
                <span style="font-weight: 600; color: #495057;">de ${totalPages}</span>
            </div>
            
            <button id="nextPage" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''}>
                Siguiente ▶️
            </button>
            <button id="lastPage" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''}>
                Última ⏭️
            </button>
            
            <div style="margin-left: 10px; font-weight: 600; color: #495057; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #dee2e6;">
                📊 Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${totalProducts}</strong> productos
            </div>
        </div>
    `;
    
    // Agregar estilos a los botones si no existen
    if (!document.querySelector('#paginationStyles')) {
        const style = document.createElement('style');
        style.id = 'paginationStyles';
        style.textContent = `
            .pagination-btn {
                padding: 10px 16px;
                border: 1px solid #007bff;
                background: #007bff;
                color: white;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.3s ease;
                min-width: 100px;
            }
            .pagination-btn:hover:not(:disabled) {
                background: #0056b3;
                border-color: #0056b3;
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,123,255,0.3);
            }
            .pagination-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                background: #6c757d;
                border-color: #6c757d;
                transform: none;
                box-shadow: none;
            }
            #pageInput:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.25);
            }
        `;
        document.head.appendChild(style);
    }
    
    // Event listeners
    document.getElementById('firstPage').addEventListener('click', () => goToPage(1));
    document.getElementById('prevPage').addEventListener('click', () => goToPage(currentPage - 1));
    document.getElementById('nextPage').addEventListener('click', () => goToPage(currentPage + 1));
    document.getElementById('lastPage').addEventListener('click', () => goToPage(totalPages));
    
    const pageInput = document.getElementById('pageInput');
    pageInput.addEventListener('change', (e) => {
        const page = parseInt(e.target.value);
        if (page >= 1 && page <= totalPages) {
            goToPage(page);
        } else {
            e.target.value = currentPage;
            showToast(`Por favor ingresa un número entre 1 y ${totalPages}`, false);
        }
    });
    
    pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const page = parseInt(e.target.value);
            if (page >= 1 && page <= totalPages) {
                goToPage(page);
            }
        }
    });
}

function goToPage(page) {
    if (page < 1 || page > Math.ceil(totalProducts / ITEMS_PER_PAGE)) return;
    
    currentPage = page;
    renderCurrentPage();
    updatePaginationControls();
    
    // Scroll suave hacia la parte superior de la tabla
    const table = document.querySelector('#inventoryTable');
    if (table) {
        table.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    console.log(`📄 Navegando a página ${page}`);
}

function getCurrentPageItems() {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return paginatedProducts.slice(startIndex, endIndex);
}

function renderCurrentPage() {
    const currentItems = getCurrentPageItems();
    renderTable(currentItems);
    
    // Actualizar información en consola
    console.log(`🎨 Renderizando página ${currentPage}: ${currentItems.length} productos`);
}

// ------------------- CARGA COMPLETA DE TODOS LOS PRODUCTOS -------------------
async function loadAllProductsWithPagination() {
    if (!supabase) {
        console.error("Supabase no inicializado");
        showToast("Supabase no está inicializado", false);
        return;
    }

    try {
        console.log("🔄 Cargando TODOS los productos de Supabase desde productos_sin_codigo...");
        showToast("Cargando todos los productos...", true);
        
        // Forzar recreación del mapa de columnas
        PRODUCTOS_SIN_CODIGO_COLUMN_MAP = null;
        await ensureProductosSinCodigoColumnMap();
        
        // Primero obtener el conteo total
        const { count, error: countError } = await supabase
            .from("productos_sin_codigo")
            .select("*", { count: 'exact', head: true });
        
        if (countError) throw countError;
        
        console.log(`📊 Total de productos en BD: ${count}`);
        
        // Cargar todos los productos usando paginación interna
        const allProducts = [];
        const BATCH_SIZE = 1000;
        let hasMore = true;
        let from = 0;
        
        while (hasMore) {
            console.log(`📦 Cargando lote desde ${from}...`);
            
            const { data, error } = await supabase
                .from("productos_sin_codigo")
                .select("*")
                .range(from, from + BATCH_SIZE - 1);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                allProducts.push(...data);
                console.log(`✅ Lote cargado: ${data.length} productos`);
                
                if (data.length < BATCH_SIZE) {
                    hasMore = false;
                    console.log("🏁 Último lote alcanzado");
                } else {
                    from += BATCH_SIZE;
                }
            } else {
                hasMore = false;
                console.log("🏁 No hay más productos");
            }
        }
        
        // Actualizar variables globales
        window.allProducts = allProducts;
        allProductsFromServer = [...allProducts];
        paginatedProducts = [...allProducts];
        totalProducts = allProducts.length;
        
        console.log(`🎉 CARGA COMPLETADA: ${totalProducts} productos cargados`);
        
        // CONFIGURAR PAGINACIÓN AUTOMÁTICAMENTE
        setupPagination();
        
        // Mostrar primera página
        currentPage = 1;
        renderCurrentPage();
        updatePendingCount();
        
        showToast(`✅ ${totalProducts} productos cargados - Página 1 de ${Math.ceil(totalProducts / ITEMS_PER_PAGE)}`, true);
        
    } catch (ex) {
        console.error("❌ Error cargando productos:", ex);
        showToast("Error cargando todos los productos", false);
    }
}

// ------------------- BÚSQUEDA COMPATIBLE CON PAGINACIÓN -------------------
function setupSearchWithPagination() {
    if (searchInput) {
        searchInput.replaceWith(searchInput.cloneNode(true));
        const newSearchInput = document.getElementById("searchInput");
        
        newSearchInput.addEventListener('input', debounce(async (e) => {
            const term = e.target.value.trim();
            
            if (term === '') {
                // Restaurar todos los productos con paginación
                paginatedProducts = [...allProductsFromServer];
                totalProducts = paginatedProducts.length;
                currentPage = 1;
                renderCurrentPage();
                updatePaginationControls();
                console.log("🔄 Búsqueda limpiada - Mostrando todos los productos");
                return;
            }
            
            console.log(`🔍 Buscando: "${term}" en ${allProductsFromServer.length} productos`);
            
            try {
                // Búsqueda en los datos locales (más rápido)
                const searchResults = allProductsFromServer.filter(producto => {
                    const descripcion = String(producto.DESCRIPCION || "").toLowerCase();
                    const searchTerm = term.toLowerCase();
                    
                    return descripcion.includes(searchTerm);
                });
                
                console.log(`✅ Búsqueda local: ${searchResults.length} resultados`);
                
                // Actualizar productos paginados con resultados de búsqueda
                paginatedProducts = searchResults;
                totalProducts = paginatedProducts.length;
                currentPage = 1;
                renderCurrentPage();
                updatePaginationControls();
                
                if (searchResults.length === 0) {
                    showToast("No se encontraron productos con ese criterio", false);
                } else {
                    showToast(`Encontrados ${searchResults.length} productos`, true);
                }
                
            } catch (error) {
                console.error("Error en búsqueda:", error);
                showToast("Error en la búsqueda", false);
            }
        }, 300));
        
        // Enter para búsqueda en servidor como respaldo
        newSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim();
                if (term) performServerSearchWithPagination(term);
            }
        });
    }
}

async function performServerSearchWithPagination(term) {
    try {
        console.log(`🌐 Búsqueda en servidor: "${term}"`);
        
        const { data, error } = await supabase
            .from("productos_sin_codigo")
            .select("*", { count: 'exact' })
            .or(`DESCRIPCION.ilike.%${term}%`)
            .order("id", { ascending: true });
            
        if (error) throw error;
        
        console.log(`✅ Resultados servidor: ${data?.length || 0}`);
        
        if (data && data.length > 0) {
            paginatedProducts = data;
            totalProducts = data.length;
            currentPage = 1;
            renderCurrentPage();
            updatePaginationControls();
            showToast(`Encontrados ${data.length} productos en servidor`, true);
        }
    } catch (error) {
        console.error("Error en búsqueda servidor:", error);
        // Mantener resultados locales en caso de error
    }
}

// ------------------- BOTÓN MOSTRAR TODOS TEMPORALMENTE -------------------
function addShowAllButton() {
    const showAllBtn = document.createElement('button');
    showAllBtn.innerHTML = '📋 Ver Todos los Productos';
    showAllBtn.id = 'showAllBtn';
    showAllBtn.style.cssText = `
        position: fixed;
        bottom: 140px;
        right: 10px;
        z-index: 10000;
        background: #28a745;
        color: white;
        border: none;
        padding: 12px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
    `;
    
    showAllBtn.addEventListener('mouseenter', () => {
        showAllBtn.style.background = '#218838';
        showAllBtn.style.transform = 'translateY(-2px)';
    });
    
    showAllBtn.addEventListener('mouseleave', () => {
        showAllBtn.style.background = '#28a745';
        showAllBtn.style.transform = 'translateY(0)';
    });
    
    showAllBtn.addEventListener('click', () => {
        // Mostrar todos los productos sin paginación
        renderTable(allProductsFromServer);
        
        // Ocultar controles de paginación
        const paginationControls = document.getElementById('paginationControls');
        if (paginationControls) {
            paginationControls.style.display = 'none';
        }
        
        showAllBtn.innerHTML = '✅ Todos Visibles';
        showToast(`Mostrando todos los ${allProductsFromServer.length} productos`, true);
        
        // Restaurar paginación después de 8 segundos automáticamente
        setTimeout(() => {
            renderCurrentPage();
            if (paginationControls) {
                paginationControls.style.display = 'flex';
            }
            showAllBtn.innerHTML = '📋 Ver Todos los Productos';
            showToast("Paginación restaurada", true);
        }, 8000);
    });
    
    document.body.appendChild(showAllBtn);
}

function updatePaginationControls() {
    const paginationContainer = document.getElementById('paginationControls');
    if (!paginationContainer) return;
    
    const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
    const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalProducts);
    
    paginationContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button id="firstPage" class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''}>
                ⏮️ Primera
            </button>
            <button id="prevPage" class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''}>
                ◀️ Anterior
            </button>
            
            <div style="display: flex; align-items: center; gap: 8px; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #dee2e6;">
                <span style="font-weight: 600; color: #495057;">Página</span>
                <input 
                    type="number" 
                    id="pageInput" 
                    value="${currentPage}" 
                    min="1" 
                    max="${totalPages}" 
                    style="width: 70px; padding: 6px; text-align: center; border: 1px solid #ced4da; border-radius: 4px; font-weight: bold;"
                >
                <span style="font-weight: 600; color: #495057;">de ${totalPages}</span>
            </div>
            
            <button id="nextPage" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''}>
                Siguiente ▶️
            </button>
            <button id="lastPage" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''}>
                Última ⏭️
            </button>
            
            <div style="margin-left: 10px; font-weight: 600; color: #495057; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #dee2e6;">
                📊 Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${totalProducts}</strong> productos
            </div>
        </div>
    `;
    
    // Agregar estilos a los botones si no existen
    if (!document.querySelector('#paginationStyles')) {
        const style = document.createElement('style');
        style.id = 'paginationStyles';
        style.textContent = `
            .pagination-btn {
                padding: 10px 16px;
                border: 1px solid #007bff;
                background: #007bff;
                color: white;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.3s ease;
                min-width: 100px;
            }
            .pagination-btn:hover:not(:disabled) {
                background: #0056b3;
                border-color: #0056b3;
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,123,255,0.3);
            }
            .pagination-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                background: #6c757d;
                border-color: #6c757d;
                transform: none;
                box-shadow: none;
            }
            #pageInput:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.25);
            }
        `;
        document.head.appendChild(style);
    }
    
    // Event listeners
    document.getElementById('firstPage').addEventListener('click', () => goToPage(1));
    document.getElementById('prevPage').addEventListener('click', () => goToPage(currentPage - 1));
    document.getElementById('nextPage').addEventListener('click', () => goToPage(currentPage + 1));
    document.getElementById('lastPage').addEventListener('click', () => goToPage(totalPages));
    
    const pageInput = document.getElementById('pageInput');
    pageInput.addEventListener('change', (e) => {
        const page = parseInt(e.target.value);
        if (page >= 1 && page <= totalPages) {
            goToPage(page);
        } else {
            e.target.value = currentPage;
            showToast(`Por favor ingresa un número entre 1 y ${totalPages}`, false);
        }
    });
    
    pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const page = parseInt(e.target.value);
            if (page >= 1 && page <= totalPages) {
                goToPage(page);
            }
        }
    });
}

function goToPage(page) {
    if (page < 1 || page > Math.ceil(totalProducts / ITEMS_PER_PAGE)) return;
    
    currentPage = page;
    renderCurrentPage();
    updatePaginationControls();
    
    // Scroll suave hacia la parte superior de la tabla
    const table = document.querySelector('#inventoryTable');
    if (table) {
        table.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    console.log(`📄 Navegando a página ${page}`);
}

function getCurrentPageItems() {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return paginatedProducts.slice(startIndex, endIndex);
}

function renderCurrentPage() {
    const currentItems = getCurrentPageItems();
    renderTable(currentItems);
    
    // Actualizar información en consola
    console.log(`🎨 Renderizando página ${currentPage}: ${currentItems.length} productos`);
}

// Botones flotantes compactos
function addForceRefreshButton() {
    const btn = document.createElement('button');
    btn.innerHTML = '🔄 Recargar';
    btn.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 10px;
        z-index: 10000;
        background: #ff6b35;
        color: white;
        border: none;
        padding: 12px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
    `;
    
    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#e55a2b';
        btn.style.transform = 'translateY(-2px)';
    });
    
    btn.addEventListener('mouseleave', () => {
        btn.style.background = '#ff6b35';
        btn.style.transform = 'translateY(0)';
    });
    
    btn.addEventListener('click', async () => {
        console.log("💥 Forzando recarga completa de todos los productos...");
        btn.disabled = true;
        btn.innerHTML = '⏳ Cargando...';
        
        PRODUCTOS_SIN_CODIGO_COLUMN_MAP = null;
        allProductsFromServer = [];
        paginatedProducts = [];
        
        await loadAllProductsWithPagination();
        
        btn.disabled = false;
        btn.innerHTML = '🔄 Recargar Todos';
        setTimeout(() => {
            btn.innerHTML = '🔄 Recargar';
        }, 2000);
    });
    
    document.body.appendChild(btn);
}

// ------------------- FUNCIÓN LOADPRODUCTS CON PAGINACIÓN AUTOMÁTICA -------------------
async function loadProducts() {
    // Usar la función que incluye paginación automática
    await loadAllProductsWithPagination();
}

function setupSearch() {
    setupSearchWithPagination();
}

// ------------------- INICIALIZACIÓN -------------------
document.addEventListener('DOMContentLoaded', function() {
    console.log("📄 DOM cargado - Iniciando con paginación automática para productos sin código...");
    
    // Configurar búsqueda con paginación
    setupSearchWithPagination();
    
    // CARGAR PRODUCTOS CON PAGINACIÓN AUTOMÁTICAMENTE
    loadAllProductsWithPagination();
});

// Mantener compatibilidad con funciones existentes
function reloadAllProducts() {
    loadAllProductsWithPagination();
}

// ------------------- INIT COMPLETO -------------------
async function initializeApp() {
  console.log("🚀 Inicializando aplicación para productos sin código...");
  
  try {
    // Paso 1: Forzar detección de columnas
    PRODUCTOS_SIN_CODIGO_COLUMN_MAP = null;
    await ensureProductosSinCodigoColumnMap();
    
    // Paso 2: Diagnóstico completo
    await diagnosticarProblemaCompleto();
    
    // Paso 3: Cargar productos
    await loadProducts();
    
    // Paso 4: Actualizar UI
    await renderPendingList();
    await cargarHistorialSalidas();
    updatePendingCount();
    
    console.log("✅ Aplicación inicializada correctamente");
    
  } catch (error) {
    console.error("❌ Error en inicialización:", error);
  }
}

// ------------------- REEMPLAZAR EL EVENTO DOMContentLoaded -------------------
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 DOM cargado, iniciando aplicación para productos sin código...");
  
  await setResponsableFromAuth();
  await initializeApp();
  
  // Event listeners
  if (btnConfirmAll) btnConfirmAll.addEventListener("click", confirmAllPendings);
  if (btnClearPending) btnClearPending.addEventListener("click", clearAllPendings);
  if (btnRefresh) btnRefresh.addEventListener("click", cargarHistorialSalidas);
});

// Agregar el botón después de que cargue la página
setTimeout(addForceRefreshButton, 2000);

// Función para escapar HTML (si no la tienes)
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getRealColForName(preferredName) {
  if (!PRODUCTOS_SIN_CODIGO_COLUMN_MAP) return null;
  const norm = normalizeKeyName(preferredName);
  return PRODUCTOS_SIN_CODIGO_COLUMN_MAP[norm] || null;
}

function getRealColForInventoryLabel(invLabel) {
  if (!PRODUCTOS_SIN_CODIGO_COLUMN_MAP) return null;

  const variants = inventoryKeyVariants(invLabel);

  // soporte explícito para ALMACEN -> incluir nombres esperables
  if (String(invLabel || "").trim().toUpperCase() === "ALMACEN") {
    variants.push("INVENTARIO FISICO EN ALMACEN");
    variants.push("inventario_fisico_en_almacen");
    variants.push("almacen");
    variants.push("stock_almacen");
  }

  for (const v of variants) {
    const norm = normalizeKeyName(v);
    if (PRODUCTOS_SIN_CODIGO_COLUMN_MAP[norm]) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP[norm];
  }
  // fallback: primera columna que contenga 'inventario' o 'almacen'
  for (const norm in PRODUCTOS_SIN_CODIGO_COLUMN_MAP) {
    if (norm.includes("inventario") || norm.includes("almacen")) return PRODUCTOS_SIN_CODIGO_COLUMN_MAP[norm];
  }
  return null;
}

// ------------------- Helpers para 'salidas pendientes' en localStorage -------------------
function getPendingSalidas() {
  try {
    const raw = localStorage.getItem("salidas_pendientes_sin_codigo");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingSalidas(list) {
  localStorage.setItem("salidas_pendientes_sin_codigo", JSON.stringify(list));
}

function addPendingSalida(pendiente) {
  const list = getPendingSalidas();
  // Si ya existe el mismo id+origen+responsable, sumar cantidades en vez de duplicar
  const idx = list.findIndex(
    (s) =>
      s.id === pendiente.id &&
      s.INVENTARIO_ORIGEN === pendiente.INVENTARIO_ORIGEN &&
      ((s.RESPONSABLE_NOMBRE ?? "") === (pendiente.RESPONSABLE_NOMBRE ?? "")) &&
      ((s.RESPONSABLE_APELLIDO ?? "") === (pendiente.RESPONSABLE_APELLIDO ?? ""))
  );
  if (idx >= 0) {
    list[idx].CANTIDAD =
      (parseInt(list[idx].CANTIDAD, 10) || 0) + parseInt(pendiente.CANTIDAD, 10);
    list[idx].RESPONSABLE = pendiente.RESPONSABLE;
    list[idx].OBSERVACIONES = pendiente.OBSERVACIONES;
    list[idx].AVAILABLE = pendiente.AVAILABLE ?? list[idx].AVAILABLE;
    list[idx].ADDED_AT = pendiente.ADDED_AT;
  } else {
    list.push(pendiente);
  }
  savePendingSalidas(list);
}

function removePendingSalida(index) {
  const list = getPendingSalidas();
  list.splice(index, 1);
  savePendingSalidas(list);
}

function clearPendingSalidas() {
  localStorage.removeItem("salidas_pendientes_sin_codigo");
}

// ------------------- Render tabla pendientes (en salidas.html) -------------------
function renderPendingTable() {
  const table = document.getElementById("pendingTableBody");
  if (!table) return;

  table.innerHTML = "";
  const list = getPendingSalidas();

  list.forEach((s, idx) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.ICONO_COLOR} ${escapeHtml(s.DESCRIPCION)}</td>
      <td>${escapeHtml(s.UM)}</td>
      <td>${escapeHtml(s.INVENTARIO_ORIGEN)}</td>
      <td>${escapeHtml(String(s.CANTIDAD))}</td>
      <td>${escapeHtml(s.RESPONSABLE)}</td>
      <td>${escapeHtml(s.OBSERVACIONES)}</td>
      <td>
        <button class="btn-delete-pend" data-idx="${idx}">❌</button>
      </td>
    `;
    table.appendChild(row);
  });

  // listeners para borrar
  table.querySelectorAll(".btn-delete-pend").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      removePendingSalida(idx);
      renderPendingTable();
      updatePendingCount();
    });
  });
}

// ------------------- Mostrar contador en el botón 'Ver Salidas' -------------------
function updatePendingCount() {
  const btn = document.getElementById("btnVerSalidas");
  if (!btn) return;
  const count = getPendingSalidas().length;
  let badge = document.getElementById("pendingCountBadge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "pendingCountBadge";
    badge.style.background = "#ff5e5e";
    badge.style.color = "#fff";
    badge.style.borderRadius = "999px";
    badge.style.padding = "2px 8px";
    badge.style.marginLeft = "8px";
    badge.style.fontSize = "12px";
    badge.style.verticalAlign = "middle";
    btn.appendChild(badge);
  }
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-block" : "none";
}

// ------------------- Helpers inventario y stock -------------------
const INVENTORY_COLORS = {
  "INVENTARIO I069": "#fff714ff",
  "INVENTARIO I078": "#0b78f5ff",
  "INVENTARIO I07F": "#f79125ff",
  "INVENTARIO I312": "#ff1495ff",
  "INVENTARIO I073": "#f4ff27ff",
  // soporte por claves cortas
  "I069": "#f4ff20ff",
  "I078": "#0b65f5ff",
  "I07F": "#ffb73bff",
  "I312": "#f545c9ff",
  "I073": "#ffee36ff",
};

function normalizeInventoryKey(orig) {
  if (!orig) return "";
  let s = String(orig).trim();
  if (s.toUpperCase() === "ALMACEN") return "INVENTARIO FISICO EN ALMACEN";
  if (s.toUpperCase().startsWith("INVENTARIO ")) return s.toUpperCase();
  // corto -> prefijo INVENTARIO
  return `INVENTARIO ${s.toUpperCase()}`;
}

function invColorFor(name) {
  if (!name) return "#6b7280";
  const long = normalizeInventoryKey(name);
  return INVENTORY_COLORS[long] || INVENTORY_COLORS[name] || "#6b7280";
}

// ------------------- fetchStockForProduct (robusto) -------------------
async function fetchStockForProduct(id, inventoryCol) {
  try {
    if (!supabase) return null;
    await ensureProductosSinCodigoColumnMap();

    const { data: prodRow, error } = await supabase
      .from("productos_sin_codigo")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.warn("fetchStockForProduct - error fetching product:", error);
      return null;
    }
    if (!prodRow) return null;

    const val = getStockFromProduct(prodRow, inventoryCol);
    return val;
  } catch (err) {
    console.error("fetchStockForProduct error:", err);
    return null;
  }
}

// ------------------- Registrar Salida (alias para abrir modal) -------------------
function registrarSalida(producto) {
  // Abre el modal dinámico para registrar la salida
  openSalidaModal(producto);
}

// ------------------- openSalidaModal actualizado ----------------
async function openSalidaModal(producto) {
  const existing = document.getElementById("salidaModalOverlay");
  if (existing) existing.remove();

  // overlay & modal
  const overlay = document.createElement("div");
  overlay.id = "salidaModalOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(0,0,0,0.45)";
  overlay.style.zIndex = "10000";

  const modalDiv = document.createElement("div");
  modalDiv.className = "salida-modal";
  modalDiv.style.width = "560px";
  modalDiv.style.maxWidth = "95%";
  modalDiv.style.background = "#fffffff6";
  modalDiv.style.borderRadius = "8px";
  modalDiv.style.padding = "18px";
  modalDiv.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
  modalDiv.style.fontFamily = "'Quicksand', sans-serif";
  modalDiv.style.color = "#222";
  modalDiv.setAttribute("role", "dialog");
  modalDiv.setAttribute("aria-modal", "true");
  modalDiv.style.position = "relative"; // para posicionar toasts dentro

  modalDiv.innerHTML = `
    <h3 class="modal-title" style="margin:0 0 8px 0">Salida: ${escapeHtml(producto.DESCRIPCION || "")}</h3>

    <!-- Contenedor para mensajes locales dentro del modal (banner grande) -->
    <div id="modalInlineMsg" style="position:relative;margin-bottom:12px;"></div>

    <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:10px">
      <div style="flex:1">
        <label style="font-size:13px;color:#374151">Cantidad total requerida</label>
        <!-- <<< permitir decimales: min="0" step="any" -->
        <input id="salidaCantidadInputModal" type="number" min="0" step="any" class="input-text" style="width:100%;box-sizing:border-box" />
      </div>
      <div style="width:140px">
        <label style="font-size:13px;color:#374151">UM</label>
        <input id="salidaUM" type="text" value="${escapeHtml(producto.UM || '')}" readonly class="input-text readonly" style="width:100%;box-sizing:border-box" />
      </div>
    </div>

    <div style="margin:8px 0">
      <strong>Repartir entre inventarios</strong>
      <div id="salidaDistribucionContainer" style="margin-top:8px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="salidaClearDistribBtn" class="btn-cancel">Limpiar</button>
      </div>
    </div>

    <div style="margin-top:10px">
      <label style="font-size:13px;color:#374151">Responsable (autocompletado)</label>
      <input id="salidaResponsableInputModal" type="text" readonly class="input-text" style="width:100%;box-sizing:border-box" />
    </div>

    <div style="margin-top:8px">
      <label style="font-size:13px;color:#374151">Destinatario</label>
      <input id="salidaDestinatarioInputModal" type="text" placeholder="Ej. Cliente XYZ" class="input-text" style="width:100%;box-sizing:border-box" />
    </div>

    <div style="margin-top:8px">
      <label style="font-size:13px;color:#374151">Observaciones (opcional)</label>
      <textarea id="salidaObservacionesInputModal" rows="2" class="input-text" style="width:100%;box-sizing:border-box"></textarea>
    </div>

    <div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button id="salidaCancelBtn" type="button" class="btn-cancel">Cancelar</button>
      <button id="salidaConfirmBtn" type="button" class="btn-primary">Agregar a pendientes</button>
    </div>
  `;

  overlay.appendChild(modalDiv);
  document.body.appendChild(overlay);

  // referencias locales
  const modalMsgWrap = modalDiv.querySelector("#modalInlineMsg");
  const cantidadInput = modalDiv.querySelector("#salidaCantidadInputModal");
  const distribContainer = modalDiv.querySelector("#salidaDistribucionContainer");
  const respInput = modalDiv.querySelector("#salidaResponsableInputModal");
  const destInput = modalDiv.querySelector("#salidaDestinatarioInputModal");
  const obsInput = modalDiv.querySelector("#salidaObservacionesInputModal");
  const btnClear = modalDiv.querySelector("#salidaClearDistribBtn");
  const btnCancel = modalDiv.querySelector("#salidaCancelBtn");
  const btnConfirm = modalDiv.querySelector("#salidaConfirmBtn");

  // set responsable: preferir email del auth user; fallback a nombre completo o valor del input global
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (user && user.email) {
      respInput.value = user.email;
    } else {
      respInput.value = CURRENT_USER_FULLNAME || (nombreResponsableInput?.value || "");
    }
  } catch (e) {
    // si algo falla, usamos fallback
    respInput.value = CURRENT_USER_FULLNAME || (nombreResponsableInput?.value || "");
  }

  // SOLO los 5 inventarios
  const invs = ["I069","I078","I07F","I312","I073"];

  // helper seguro para leer stock (usa getStockFromProduct si existe)
  function safeStock(producto, inv) {
    try {
      const s = typeof getStockFromProduct === "function" ? getStockFromProduct(producto, inv) : (producto[`INVENTARIO ${inv}`] ?? producto[inv] ?? 0);
      // <<< usar parseFloat para preservar decimales (p.ej. 70.5)
      const n = parseFloat(String(s).replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    } catch (e) { return 0; }
  }

  // formatea cantidades para mostrar (quita .0 innecesarios)
  function formatQty(n) {
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(n).replace(/\.?0+$/, '');
  }

  // ===================== Modal-toast más visible =====================
  let _modalToastTimer = null;
  function modalToast(message, success = true, autoCloseMs = 3000, persistent = false) {
    modalMsgWrap.innerHTML = "";
    if (_modalToastTimer) { clearTimeout(_modalToastTimer); _modalToastTimer = null; }

    const banner = document.createElement("div");
    banner.className = "modal-banner";
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.justifyContent = "space-between";
    banner.style.gap = "12px";
    banner.style.padding = "12px 14px";
    banner.style.borderRadius = "10px";
    banner.style.boxShadow = "0 12px 30px rgba(2,6,23,0.12)";
    banner.style.fontSize = "14px";
    banner.style.fontWeight = "600";
    banner.style.lineHeight = "1.1";
    banner.style.maxWidth = "100%";
    banner.style.boxSizing = "border-box";
    banner.style.transform = "translateY(-6px)";
    banner.style.opacity = "0";
    banner.style.transition = "transform .18s ease, opacity .18s ease";

    const left = document.createElement("div");
    left.style.display = "inline-flex";
    left.style.alignItems = "center";
    left.style.gap = "10px";

    const icon = document.createElement("div");
    icon.style.fontSize = "20px";
    icon.textContent = success ? "✅" : "⚠️";
    left.appendChild(icon);

    const text = document.createElement("div");
    text.style.flex = "1";
    text.style.whiteSpace = "normal";
    text.style.fontWeight = "700";
    text.style.color = success ? "#065f46" : "#7f1d1d";
    text.textContent = message;
    left.appendChild(text);

    const right = document.createElement("div");
    right.style.marginLeft = "12px";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Cerrar mensaje";
    closeBtn.style.border = "none";
    closeBtn.style.background = "transparent";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "16px";
    closeBtn.style.color = "rgba(0,0,0,0.6)";
    closeBtn.style.padding = "4px";
    right.appendChild(closeBtn);

    banner.appendChild(left);
    banner.appendChild(right);
    banner.style.background = success ? "linear-gradient(90deg,#ecfdf5,#f0fdf4)" : "linear-gradient(90deg,#fff1f2,#fff7f7)";
    banner.style.border = success ? "1px solid rgba(6,95,70,0.08)" : "1px solid rgba(127,29,29,0.08)";

    modalMsgWrap.appendChild(banner);
    requestAnimationFrame(() => {
      banner.style.transform = "translateY(0)";
      banner.style.opacity = "1";
    });

    function closeBanner() {
      banner.style.transform = "translateY(-6px)";
      banner.style.opacity = "0";
      setTimeout(() => { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 180);
      if (_modalToastTimer) { clearTimeout(_modalToastTimer); _modalToastTimer = null; }
    }
    closeBtn.addEventListener("click", closeBanner);

    if (!persistent && autoCloseMs && autoCloseMs > 0) {
      _modalToastTimer = setTimeout(closeBanner, autoCloseMs);
    }
    return closeBanner;
  }
  // ===================================================================

  // --- handlers mejorados para inputs de distribución (soportan decimales sin "pelear" con el typing) ---
  function onDistribKeydown(e) {
    // permitir coma como separador decimal: la convertimos a punto en el input
    if (e.key === ',') {
      e.preventDefault();
      const el = e.target;
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = el.value || "";
      const newVal = val.slice(0, start) + '.' + val.slice(end);
      el.value = newVal;
      // mover caret después del punto
      const pos = start + 1;
      setTimeout(() => { el.setSelectionRange(pos, pos); }, 0);
      // disparar input manualmente para que se valide
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // dejamos al browser manejar el resto (números, punto, backspace, etc.)
  }

  function onDistribInputChange() {
    const inp = this;
    const inv = inp.dataset.inv;
    const avail = Number(safeStock(producto, inv)) || 0;

    const raw = (inp.value || "").toString().trim();
    if (raw === "" || raw === "-") {
      updateConfirmState();
      return;
    }

    const parsed = parseFloat(raw.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      updateConfirmState();
      return;
    }

    // validaciones inmediatas sin sobrescribir mientras el usuario escribe
    if (parsed < 0) {
      modalToast(`No se permiten valores negativos.`, false, 2000, false);
    } else if (parsed > avail) {
      modalToast(`La cantidad ingresada (${parsed}) excede el stock disponible (${avail}).`, false, 2200, false);
    }

    updateConfirmState();
  }

  function onDistribInputBlur() {
    const inp = this;
    const inv = inp.dataset.inv;
    const avail = Number(safeStock(producto, inv)) || 0;
    let v = parseFloat((inp.value || "0").toString().replace(',', '.'));
    if (Number.isNaN(v) || v < 0) v = 0;
    if (v > avail) {
      v = avail;
      modalToast(`Ajustado ${inv} al stock disponible (${formatQty(avail)})`, false, 2500, false);
    }
    // normalizar visualmente (si prefieres 2 decimales usa v.toFixed(2))
    inp.value = String(v);
    updateConfirmState();
  }

  function attachDistribListeners() {
    distribContainer.querySelectorAll('input[data-inv]').forEach(i => {
      i.removeEventListener("input", onDistribInputChange);
      i.removeEventListener("blur", onDistribInputBlur);
      i.removeEventListener("keydown", onDistribKeydown);
      i.addEventListener("input", onDistribInputChange);
      i.addEventListener("blur", onDistribInputBlur);
      i.addEventListener("keydown", onDistribKeydown);
    });
  }

  // render rows (muestra "No disponible" y desactiva input si stock == 0)
  async function renderDistribRows() {
    distribContainer.innerHTML = "";
    const stocks = {};
    for (const inv of invs) stocks[inv] = safeStock(producto, inv);

    invs.forEach((inv) => {
      const row = document.createElement("div");
      row.className = "salida-distrib-row";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "8px";
      row.style.marginBottom = "6px";

      const left = document.createElement("div");
      left.style.flex = "1";
      left.style.fontSize = "14px";

      if ((stocks[inv] || 0) <= 0) {
        left.innerHTML = `<strong>${escapeHtml(inv)}</strong> — <span style="color:#9ca3af;font-style:italic">No disponible</span>`;
      } else {
        left.innerHTML = `<strong>${escapeHtml(inv)}</strong> — Disponible: <span data-inv-stock="${inv}">${formatQty(stocks[inv])}</span>`;
      }

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";

      const input = document.createElement("input");
      input.setAttribute("data-inv", inv);
      input.type = "number";
      input.min = "0";
      input.step = "any";                // <<< permitir decimales
      input.value = "0";
      input.className = "input-text";
      input.style.width = "90px";
      input.style.boxSizing = "border-box";

      if ((stocks[inv] || 0) <= 0) {
        input.disabled = true;
        input.title = "Sin stock";
        input.style.opacity = "0.6";
      }

      right.appendChild(input);
      row.appendChild(left);
      row.appendChild(right);
      distribContainer.appendChild(row);
    });

    // registrar listeners robustos que permiten typing con decimales
    attachDistribListeners();

    updateConfirmState();
  }

  // calcula total disponible (sum stocks) - usa floats
  function totalAvailable() {
    const inputs = Array.from(distribContainer.querySelectorAll('input[data-inv]'));
    return inputs.reduce((acc, inp) => {
      const inv = inp.dataset.inv;
      const avail = safeStock(producto, inv) || 0;
      return acc + avail;
    }, 0);
  }

  // <-- ÚNICA versión de updateConfirmState: usa parseFloat (no dejar duplicados) -->
  function updateConfirmState() {
    const totalNeeded = parseFloat((cantidadInput.value || "0").toString().replace(',', '.')) || 0;
    const avail = totalAvailable();

    // limpiar banners temporales
    modalMsgWrap.innerHTML = "";
    if (_modalToastTimer) { clearTimeout(_modalToastTimer); _modalToastTimer = null; }

    if (avail <= 0) {
      btnConfirm.disabled = true;
      modalToast("No hay stock disponible en ningún inventario.", false, 0, true);
      return;
    }

    if (!totalNeeded || totalNeeded <= 0) {
      btnConfirm.disabled = true;
      return;
    }

    // tolerancia para comparar floats (ej. 0.000001)
    const EPS = 1e-6;
    if (totalNeeded - avail > EPS) {
      btnConfirm.disabled = true;
      modalToast(`La cantidad solicitada (${formatQty(totalNeeded)}) excede el total disponible (${formatQty(avail)}).`, false, 0, true);
      return;
    }

    btnConfirm.disabled = false;
  }

  // helpers para marcar campo inválido y limpiar marcación cuando el usuario escribe
  function markInvalid(el) {
    if (!el) return;
    el.style.outline = "2px solid rgba(220,38,38,0.25)";
    el.style.border = "1px solid #dc2626";
    const clear = () => {
      el.style.outline = "";
      el.style.border = "";
      el.removeEventListener("input", clear);
      el.removeEventListener("change", clear);
    };
    el.addEventListener("input", clear);
    el.addEventListener("change", clear);
  }

  // Clear distrib
  const clearDistribHandler = () => {
    distribContainer.querySelectorAll('input[data-inv]').forEach(i => i.value = "0");
    modalMsgWrap.innerHTML = "";
    updateConfirmState();
  };

  // Cancel handler (cierra y limpia)
  const cancelHandler = (e) => {
    e?.preventDefault?.();
    cleanupAndClose();
  };

  // VALIDACIÓN ANTES DE CONFIRMAR (todos obligatorios excepto observaciones)
  function validateBeforeConfirm() {
    const missing = [];
    // aceptar decimales en cantidad total
    const totalNeeded = parseFloat((cantidadInput.value || "0").toString().replace(',', '.')) || 0;
    if (!totalNeeded || totalNeeded <= 0) {
      missing.push("Cantidad total requerida");
      markInvalid(cantidadInput);
    }

    const destinatario = (destInput.value || "").trim();
    if (!destinatario) {
      missing.push("Destinatario");
      markInvalid(destInput);
    }

    // revisar distribución: al menos un inventario con cantidad > 0 (usar float)
    const inputs = Array.from(distribContainer.querySelectorAll('input[data-inv]'));
    const origenes = inputs.map(inp => {
      const inv = inp.dataset.inv;
      const qty = parseFloat((inp.value || "0").toString().replace(',', '.')) || 0;
      const avail = Number(safeStock(producto, inv)) || 0;
      return { INVENTARIO_ORIGEN: `INVENTARIO ${inv}`, CANTIDAD: qty, AVAILABLE: avail, el: inp };
    }).filter(o => o.CANTIDAD > 0);

    const sum = origenes.reduce((s,o) => s + (Number(o.CANTIDAD) || 0), 0);

    // comparación con tolerancia
    const EPS = 1e-6;

    if (origenes.length === 0) {
      missing.push("Distribución entre inventarios (elige al menos un inventario)");
      inputs.forEach(i => markInvalid(i));
    } else {
      if (Math.abs(sum - totalNeeded) > EPS) {
        modalToast(`La suma por inventario (${formatQty(sum)}) no coincide con la cantidad total (${formatQty(totalNeeded)}). Ajusta los valores.`, false, 4000);
        origenes.forEach(o => markInvalid(o.el));
        return { ok: false, focusEl: origenes[0]?.el || cantidadInput };
      }
      for (const o of origenes) {
        if (o.CANTIDAD - o.AVAILABLE > EPS) {
          modalToast(`La cantidad para ${o.INVENTARIO_ORIGEN} (${formatQty(o.CANTIDAD)}) excede su stock (${formatQty(o.AVAILABLE)}).`, false, 4000);
          markInvalid(o.el);
          return { ok: false, focusEl: o.el };
        }
      }
    }

    const responsable = (respInput.value || "").trim();
    if (!responsable) {
      missing.push("Responsable (inicia sesión)");
      markInvalid(respInput);
    }

    if (missing.length > 0) {
      const ms = `Completa los campos obligatorios: ${missing.join(", ")}`;
      modalToast(ms, false, 4500);
      if (missing[0].includes("Cantidad")) cantidadInput.focus();
      else if (missing[0].includes("Destinatario")) destInput.focus();
      else if (missing[0].includes("Distribución")) {
        const firstDistrib = distribContainer.querySelector('input[data-inv]');
        if (firstDistrib) firstDistrib.focus();
      } else if (missing[0].includes("Responsable")) respInput.focus();
      return { ok: false, focusEl: null };
    }

    return { ok: true, origenes, totalNeeded };
  }

  // Confirm handler (usa el email mostrado en el campo responsable)
  const confirmHandler = () => {
    const validation = validateBeforeConfirm();
    if (!validation.ok) return;

    const { origenes, totalNeeded } = validation;

    // RESPONSABLE: tomamos el valor mostrado (email preferido)
    const responsable = (respInput.value || "").trim();
    const destinatario = (destInput.value || "").trim();
    const observaciones = (obsInput.value || "").trim();

    // Build pendiente (RESPONSABLE_NOMBRE/APELLIDO vacíos para no introducir datos inconsistentes)
    if (origenes.length === 1) {
      const o = origenes[0];
      const pendiente = {
        id: producto.id,
        DESCRIPCION: producto.DESCRIPCION,
        UM: producto.UM ?? "",
        INVENTARIO_ORIGEN: o.INVENTARIO_ORIGEN,
        ICONO_COLOR: "⚪",
        CANTIDAD: o.CANTIDAD,
        RESPONSABLE: responsable,
        RESPONSABLE_NOMBRE: "",
        RESPONSABLE_APELLIDO: "",
        DESTINATARIO: destinatario,
        OBSERVACIONES: observaciones,
        AVAILABLE: o.AVAILABLE,
        ADDED_AT: new Date().toISOString()
      };
      addPendingSalida(pendiente);
    } else {
      const pendiente = {
        id: producto.id,
        DESCRIPCION: producto.DESCRIPCION,
        UM: producto.UM ?? "",
        ORIGENES: origenes.map(o => ({ INVENTARIO_ORIGEN: o.INVENTARIO_ORIGEN, CANTIDAD: o.CANTIDAD, AVAILABLE: o.AVAILABLE })),
        CANTIDAD: totalNeeded,
        ICONO_COLOR: "🔀",
        RESPONSABLE: responsable,
        RESPONSABLE_NOMBRE: "",
        RESPONSABLE_APELLIDO: "",
        DESTINATARIO: destinatario,
        OBSERVACIONES: observaciones,
        ADDED_AT: new Date().toISOString()
      };
      addPendingSalida(pendiente);
    }

    modalToast("✅ Agregado a la lista de salidas pendientes", true, 1800);
    try { updatePendingCountBadge(); } catch(e){ /* noop */ }
    try { renderPendingList(); } catch(e){ /* noop */ }
    setTimeout(() => cleanupAndClose(), 450);
  };

  // cleanup: quitar listeners y overlay
  function cleanupAndClose() {
    try { btnClear.removeEventListener("click", clearDistribHandler); } catch(e) {}
    try { btnCancel.removeEventListener("click", cancelHandler); } catch(e) {}
    try { btnConfirm.removeEventListener("click", confirmHandler); } catch(e) {}
    try { document.removeEventListener("keydown", escHandler); } catch(e) {}
    try {
      distribContainer.querySelectorAll('input[data-inv]').forEach(i => {
        i.removeEventListener("input", onDistribInputChange);
        i.removeEventListener("blur", onDistribInputBlur);
        i.removeEventListener("keydown", onDistribKeydown);
      });
    } catch(e) {}
    if (_modalToastTimer) { clearTimeout(_modalToastTimer); _modalToastTimer = null; }
    overlay.remove();
  }

  // ESC para cerrar
  const escHandler = (ev) => {
    if (ev.key === "Escape") cleanupAndClose();
  };
  document.addEventListener("keydown", escHandler);

  // listeners
  btnClear.addEventListener("click", clearDistribHandler);
  btnCancel.addEventListener("click", cancelHandler);
  btnConfirm.addEventListener("click", confirmHandler);

  // click fuera del modal -> cerrar
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cleanupAndClose();
  });

  // foco inicial y validación en tiempo real desde el campo cantidad
  setTimeout(() => {
    try { cantidadInput.focus(); } catch(e) {}
  }, 50);
  cantidadInput.addEventListener("input", updateConfirmState);

  // -- refresca producto (si usas supabase) para evitar salir con stock desactualizado
  async function refreshProductLive(producto) {
    try {
      if (typeof supabase !== "undefined") {
        const { data, error } = await supabase
          .from('productos_sin_codigo')
          .select('*')
          .eq('id', producto.id)
          .limit(1)
          .maybeSingle();
        if (!error && data) return data;
      }
    } catch (e) { /* noop */ }
    // fallback: devuelve el producto que ya tenías
    return producto;
  }

  producto = await refreshProductLive(producto);

  // render inicial
  await renderDistribRows();
  updateConfirmState();
}

async function renderPendingList() {
  if (!tablaPendientesBody) return;

  // inyectar estilos si no existen
  if (!document.getElementById("salidas-inline-styles")) {
    const style = document.createElement("style");
    style.id = "salidas-inline-styles";
    style.textContent = `
      .inv-select-wrap { display:inline-flex; align-items:center; gap:8px; }
      .inv-dot { display:inline-block; width:12px; height:12px; border-radius:50%; vertical-align:middle; flex:0 0 12px; box-shadow: 0 0 0 1px rgba(0,0,0,0.06) inset; }
      .pending-inv-select { min-width:110px; padding:6px 8px; border-radius:6px; border:1px solid #ddd; background:#fff; font-size:13px; }
      .inv-stock { margin-left:6px; font-size:12px; color:#444; }
      #pendingTable td { white-space:nowrap; }
      @media (max-width:700px) { .pending-inv-select { min-width:90px; } }
    `;
    document.head.appendChild(style);
  }

  const list = getPendingSalidas();
  tablaPendientesBody.innerHTML = "";

  if (!list || list.length === 0) {
    tablaPendientesBody.innerHTML = `<tr><td colspan="8" class="empty-note">No hay salidas pendientes</td></tr>`;
    updatePendingCount();
    return;
  }

  const inventoryOptions = [
    "INVENTARIO I069",
    "INVENTARIO I078",
    "INVENTARIO I07F",
    "INVENTARIO I312",
    "INVENTARIO I073",
    "INVENTARIO FISICO EN ALMACEN"
  ];

  for (let idx = 0; idx < list.length; idx++) {
    const item = list[idx];

    // responsable: preferimos el almacenado en el pendiente; si no existe usamos el usuario actual
    const responsableFull = item.RESPONSABLE || CURRENT_USER_FULLNAME || `${item.RESPONSABLE_NOMBRE ?? ""} ${item.RESPONSABLE_APELLIDO ?? ""}`.trim() || "Sin responsable";

    const selectedInv = item.INVENTARIO_ORIGEN ? item.INVENTARIO_ORIGEN : inventoryOptions[0];
    const dotColor = invColorFor(selectedInv);

    const tr = document.createElement("tr");

    const invSelectHTML = `
      <div class="inv-select-wrap">
        <span class="inv-dot" data-dot-idx="${idx}" style="background:${dotColor}"></span>
        <select class="pending-inv-select" data-idx="${idx}">
          ${inventoryOptions
            .map(opt => {
              const short = opt.replace("INVENTARIO ", "");
              const selected = normalizeInventoryKey(item.INVENTARIO_ORIGEN) === normalizeInventoryKey(opt) ? "selected" : "";
              return `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(short)}</option>`;
            }).join("")}
        </select>
        <span class="inv-stock" data-idx="${idx}"></span>
      </div>
    `;

    tr.innerHTML = `
      <td class="col-desc"><span class="desc-text" title="${escapeHtml(item.DESCRIPCION)}">${escapeHtml(item.DESCRIPCION)}</span></td>
      <td class="col-um">${escapeHtml(item.UM ?? '')}</td>
      <td class="col-inv">${invSelectHTML}</td>
      <td class="col-cant"><input type="number" min="1" value="${escapeHtml(String(item.CANTIDAD))}" data-idx="${idx}" class="pending-cantidad" style="width:90px"></td>
      <td class="col-resp"><span class="resp-text" data-idx="${idx}">${escapeHtml(responsableFull)}</span></td>
      <td class="col-dest"><input type="text" value="${escapeHtml(item.DESTINATARIO ?? '')}" data-idx="${idx}" class="pending-dest" placeholder="Destinatario"></td>
      <td class="col-obs"><input type="text" value="${escapeHtml(item.OBSERVACIONES ?? '')}" data-idx="${idx}" class="pending-observaciones" placeholder="Observaciones"></td>
      <td class="col-acc"><button class="btn-remove" data-idx="${idx}">Eliminar</button></td>
    `;
    tablaPendientesBody.appendChild(tr);

    // mostrar stock y fijar max en el input cantidad
    (async () => {
      const stockSpan = tablaPendientesBody.querySelector(`.inv-stock[data-idx="${idx}"]`);
      const sel = tablaPendientesBody.querySelector(`.pending-inv-select[data-idx="${idx}"]`);
      const qtyInput = tablaPendientesBody.querySelector(`.pending-cantidad[data-idx="${idx}"]`);
      if (!stockSpan || !sel || !qtyInput) return;
      const chosen = sel.value;

      if (typeof item.AVAILABLE === "number" && item.AVAILABLE !== null && item.AVAILABLE !== undefined) {
        stockSpan.textContent = `Disponible: ${item.AVAILABLE}`;
        qtyInput.max = String(item.AVAILABLE);
      } else {
        const fetched = await fetchStockForProduct(item.id, chosen);
        if (fetched !== null) {
          stockSpan.textContent = `Disponible: ${fetched}`;
          item.AVAILABLE = fetched;
          qtyInput.max = String(fetched);
          savePendingSalidas(list);
        } else {
          stockSpan.textContent = "";
          qtyInput.removeAttribute("max");
        }
      }

      // if current qty > available, adjust and force user to change inventory if they need more
      const avail = parseInt(item.AVAILABLE || 0, 10);
      const curQty = parseInt(item.CANTIDAD || 0, 10);
      if (avail > 0 && curQty > avail) {
        // ajustamos al disponible y avisamos
        const list2 = getPendingSalidas();
        list2[idx].CANTIDAD = avail;
        list2[idx].AVAILABLE = avail;
        savePendingSalidas(list2);
        qtyInput.value = avail;
        stockSpan.textContent = `Disponible: ${avail}`;
        showToast(`Stock insuficiente en ${sel.value}. Cantidad ajustada a ${avail}. Elige otro inventario si necesitas más.`, false);
      }
    })();
  }

  // cuando cambia inventario: actualizamos AVAILABLE, puntito y max del input cantidad
  tablaPendientesBody.querySelectorAll(".pending-inv-select").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const newInv = e.target.value;
      const list = getPendingSalidas();
      if (!list[idx]) return;
      list[idx].INVENTARIO_ORIGEN = newInv;
      const fetched = await fetchStockForProduct(list[idx].id, newInv);
      if (fetched !== null) {
        list[idx].AVAILABLE = fetched;
      } else {
        delete list[idx].AVAILABLE;
      }
      savePendingSalidas(list);

      // actualizar puntito
      const dot = tablaPendientesBody.querySelector(`.inv-dot[data-dot-idx="${idx}"]`);
      if (dot) dot.style.background = invColorFor(newInv);
      // actualizar stock visible y ajustar input max/value
      const stockSpan = tablaPendientesBody.querySelector(`.inv-stock[data-idx="${idx}"]`);
      const qtyInput = tablaPendientesBody.querySelector(`.pending-cantidad[data-idx="${idx}"]`);
      const available = parseInt(list[idx].AVAILABLE || 0, 10);
      if (stockSpan) stockSpan.textContent = available ? `Disponible: ${available}` : "";
      if (qtyInput) {
        if (available) {
          qtyInput.max = String(available);
          if (parseInt(qtyInput.value || "0", 10) > available) {
            qtyInput.value = available;
            list[idx].CANTIDAD = available;
            savePendingSalidas(list);
            showToast(`Cantidad ajustada a stock disponible (${available}). Si necesitas más, elige otro inventario.`, false);
          }
        } else {
          qtyInput.removeAttribute("max");
        }
      }
    });
  });

  // cantidad: validar contra AVAILABLE y forzar ajuste si supera
  tablaPendientesBody.querySelectorAll(".pending-cantidad").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const v = parseInt(e.target.value, 10);
      const list = getPendingSalidas();
      if (Number.isNaN(v) || v <= 0) {
        showToast("Cantidad inválida", false);
        renderPendingList();
        return;
      }
      const available = parseInt(list[idx].AVAILABLE || 0, 10);
      if (available > 0 && v > available) {
        showToast(`Stock insuficiente (${available}) en ${list[idx].INVENTARIO_ORIGEN}. Cambia de inventario si necesitas más.`, false);
        input.value = available;
        list[idx].CANTIDAD = available;
        savePendingSalidas(list);
        renderPendingList();
        return;
      }
      list[idx].CANTIDAD = v;
      list[idx].ADDED_AT = new Date().toISOString();
      savePendingSalidas(list);
      updatePendingCount();
    });
  });

  // destinatario / observaciones / eliminar (igual que antes)
  tablaPendientesBody.querySelectorAll(".pending-dest").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const v = String(e.target.value || "").trim();
      const list = getPendingSalidas();
      list[idx].DESTINATARIO = v;
      list[idx].ADDED_AT = new Date().toISOString();
      savePendingSalidas(list);
    });
  });

  tablaPendientesBody.querySelectorAll(".pending-observaciones").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const v = String(e.target.value || "").trim();
      const list = getPendingSalidas();
      list[idx].OBSERVACIONES = v;
      list[idx].ADDED_AT = new Date().toISOString();
      savePendingSalidas(list);
    });
  });

  tablaPendientesBody.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const list = getPendingSalidas();
      list.splice(idx, 1);
      savePendingSalidas(list);
      renderPendingList();
      updatePendingCount();
    });
  });

  updatePendingCount();
}

// ------------------- Renderizar tabla (robusta, con Stock Real y clases) -------------------
function renderTable(products) {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  products.forEach((p) => {
    // Inventarios parciales siempre como números
    const i069 = toNumber(getStockFromProduct(p, "I069"));
    const i078 = toNumber(getStockFromProduct(p, "I078"));
    const i07f = toNumber(getStockFromProduct(p, "I07F"));
    const i312 = toNumber(getStockFromProduct(p, "I312"));
    const i073 = toNumber(getStockFromProduct(p, "I073"));

    // Valor físico: primero leer directo, si no hay usar suma
    let rawFisico = getStockFromProduct(p, "INVENTARIO FISICO EN ALMACEN");
    if (rawFisico === null || rawFisico === undefined || rawFisico === "") {
      rawFisico = getStockFromProduct(p, "ALMACEN"); // fallback si existe con otro nombre
    }
    const fisicoVal =
      rawFisico === null || rawFisico === undefined || rawFisico === ""
        ? i069 + i078 + i07f + i312 + i073
        : toNumber(rawFisico);

    // Stock real = suma
    const stockReal = i069 + i078 + i07f + i312 + i073;

    // Colorear filas según stock
    let stockClass = "stock-high";
    if (stockReal <= 1) stockClass = "stock-low";
    else if (stockReal <= 10) stockClass = "stock-medium";

    // Crear fila
    const row = document.createElement("tr");
    row.className = stockClass;

    // Columnas
    const tdDesc = document.createElement("td");
    tdDesc.textContent = p["DESCRIPCION"] ?? "";

    const tdUm = document.createElement("td");
    tdUm.textContent = p["UM"] ?? "";

    const tdI069 = document.createElement("td");
    tdI069.textContent = formatShowValue(i069);

    const tdI078 = document.createElement("td");
    tdI078.textContent = formatShowValue(i078);

    const tdI07F = document.createElement("td");
    tdI07F.textContent = formatShowValue(i07f);

    const tdI312 = document.createElement("td");
    tdI312.textContent = formatShowValue(i312);

    const tdI073 = document.createElement("td");
    tdI073.textContent = formatShowValue(i073);

    const tdFisico = document.createElement("td");
    tdFisico.textContent = formatShowValue(fisicoVal);

    // Columna Acciones
    const tdAcciones = document.createElement("td");
    tdAcciones.className = "acciones"; // coincide con el CSS que usarás

    const createBtn = (btnClass, emoji, text, handler) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${btnClass}`;
      // estructura: cuadrito del icono + etiqueta
      btn.innerHTML = `<span class="icon-wrap" aria-hidden>${emoji}</span><span class="label">${text}</span>`;
      if (handler) btn.addEventListener("click", handler);
      return btn;
    };

    const btnEdit = createBtn("btn-edit", "✏️", "Editar", () => editarProducto(p));
    const btnDelete = createBtn("btn-delete", "🗑️", "Eliminar", () => eliminarProducto(p["id"]));
    const btnSalida = createBtn("btn-salida", "📦", "Salida", () => openSalidaModal(p));

    // agrega los botones (en una sola fila — el gap lo controla CSS)
    tdAcciones.appendChild(btnEdit);
    tdAcciones.appendChild(btnDelete);
    tdAcciones.appendChild(btnSalida);

    // Agregar a la fila
    row.appendChild(tdDesc);
    row.appendChild(tdUm);
    row.appendChild(tdI069);
    row.appendChild(tdI078);
    row.appendChild(tdI07F);
    row.appendChild(tdI312);
    row.appendChild(tdI073);
    row.appendChild(tdFisico);
    row.appendChild(tdAcciones);

    tableBody.appendChild(row);
  });
}

// ------------------- Helper: limpiar formulario de producto -------------------
function clearProductFormFields() {
  if (!productForm) return;
  try {
    // reset nativo
    productForm.reset();
  } catch (e) {}
  
  // limpiar manualmente todos los inputs/textarea/check
  productForm.querySelectorAll('input,textarea,select').forEach(i => {
    try {
      if (i.type === "checkbox" || i.type === "radio") i.checked = false;
      else i.value = "";
      
      // Resetear estilos
      i.removeAttribute('readonly');
      i.disabled = false;
      i.style.backgroundColor = '';
      i.style.cursor = '';
    } catch (e) {}
  });
  
  // Mostrar checkbox 'sumar' por defecto
  const chk = productForm.querySelector('[name="sumar"]');
  if (chk) {
    chk.disabled = false;
    const parent = chk.closest('div');
    if (parent) parent.style.display = 'block';
  }
}

// ------------------- Editar Producto -------------------
function editarProducto(producto) {
  if (!modal || !productForm) {
    showToast("Formulario de producto no disponible", false);
    return;
  }

  editMode = true;
  editingCodigo = producto?.id ?? null;

  if (editingCodigo !== null && editingCodigo !== undefined) {
    editingCodigo = String(editingCodigo).trim();
  }

  // Abrir modal
  modal.style.display = "flex";

  // Helper para setear valor defensivamente
  const setVal = (name, value) => {
    const el = productForm.querySelector(`[name="${name}"]`);
    if (el) el.value = (value === undefined || value === null) ? "" : value;
  };

  // Rellenar SOLO descripción y UM
  setVal('descripcion', producto?.DESCRIPCION ?? producto?.descripcion ?? "");
  setVal('um', producto?.UM ?? producto?.um ?? "");

  // OCULTAR completamente los campos de inventarios y almacén
  const camposOcultar = ['i069', 'i078', 'i07f', 'i312', 'i073', 'almacen', 'sumar'];
  
  camposOcultar.forEach(campo => {
    const field = productForm.querySelector(`[name="${campo}"]`);
    if (field) {
      const formGroup = field.closest('.form-group') || field.closest('div');
      if (formGroup) {
        formGroup.style.display = 'none';
      }
    }
  });

  // En modo EDICIÓN: BLOQUEAR UM, solo dejar descripción editable
  const camposBloquear = ['um'];
  
  camposBloquear.forEach(campo => {
    const field = productForm.querySelector(`[name="${campo}"]`);
    if (field) {
      field.setAttribute('readonly', 'true');
      field.disabled = true;
      field.style.backgroundColor = '#f5f5f5';
      field.style.cursor = 'not-allowed';
    }
  });

  // Habilitar solo descripción
  const desc = productForm.querySelector('[name="descripcion"]');
  if (desc) {
    desc.removeAttribute('readonly');
    desc.disabled = false;
    desc.style.backgroundColor = '';
    desc.style.cursor = '';
    try { desc.focus(); desc.select?.(); } catch (e) { /* noop */ }
  }
  
  // Cambiar el texto del botón para indicar que es edición
  const saveBtn = productForm.querySelector('.btn-save');
  if (saveBtn) {
    saveBtn.textContent = "Guardar Cambios";
  }
}

// ------------------- Eliminar Producto -------------------
async function eliminarProducto(id) {
  if (!supabase) {
    showToast("Supabase no está inicializado", false);
    return;
  }

  showConfirm(`⚠ ¿Seguro que deseas eliminar el producto?`, async () => {
    const { error } = await supabase
      .from("productos_sin_codigo")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("❌ Error al eliminar:", error);
      showToast("No se pudo eliminar el producto", false);
    } else {
      showToast("✅ Producto eliminado correctamente", true);
      loadProducts();
    }
  });
}

// ------------------- Modal del formulario producto (abrir/cerrar) -------------------
if (btnOpenModal) {
  btnOpenModal.addEventListener("click", () => {
    if (!productForm || !modal) return;
    editMode = false;
    editingCodigo = null;
    clearProductFormFields();
    
    // En modo NUEVO: Mostrar solo descripción y UM
    const camposMostrar = ['descripcion', 'um'];
    const camposOcultar = ['i069', 'i078', 'i07f', 'i312', 'i073', 'almacen', 'sumar'];
    
    // Mostrar campos básicos
    camposMostrar.forEach(campo => {
      const field = productForm.querySelector(`[name="${campo}"]`);
      if (field) {
        const formGroup = field.closest('.form-group') || field.closest('div');
        if (formGroup) {
          formGroup.style.display = 'block';
        }
        field.removeAttribute('readonly');
        field.disabled = false;
        field.style.backgroundColor = '';
        field.style.cursor = '';
      }
    });
    
    // Ocultar campos de inventarios
    camposOcultar.forEach(campo => {
      const field = productForm.querySelector(`[name="${campo}"]`);
      if (field) {
        const formGroup = field.closest('.form-group') || field.closest('div');
        if (formGroup) {
          formGroup.style.display = 'none';
        }
      }
    });

    modal.style.display = "flex";
    
    // Cambiar texto del botón para nuevo producto
    const saveBtn = productForm.querySelector('.btn-save');
    if (saveBtn) {
      saveBtn.textContent = "Crear Producto";
    }
    
    // Enfocar el campo descripción
    const descField = productForm.querySelector('[name="descripcion"]');
    if (descField) {
      setTimeout(() => descField.focus(), 100);
    }
  });
}

if (btnCloseModal) {
  btnCloseModal.addEventListener("click", () => {
    if (!productForm || !modal) return;
    modal.style.display = "none";
    clearProductFormFields();
    editMode = false;
    editingCodigo = null;
    
    // Resetear texto del botón
    const saveBtn = productForm.querySelector('.btn-save');
    if (saveBtn) {
      saveBtn.textContent = "Crear Producto";
    }
  });
}

window.addEventListener("click", (e) => {
  if (e.target === modal) {
    if (!productForm || !modal) return;
    modal.style.display = "none";
    clearProductFormFields();
    editMode = false;
    editingCodigo = null;
    
    // Resetear texto del botón
    const saveBtn = productForm.querySelector('.btn-save');
    if (saveBtn) {
      saveBtn.textContent = "Crear Producto";
    }
  }
});

// ------------------- Guardar Producto (robusto) -------------------
productForm?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!productForm) return;

  const saveBtn = productForm.querySelector('.btn-save');
  const originalBtnText = saveBtn?.textContent ?? "";

  // bandera para saber si la operación sí llegó a aplicar cambios
  let operationSucceeded = false;

  // --- EDICIÓN: solo actualizar DESCRIPCION ---
  if (editMode) {
    const descEl = productForm.querySelector('[name="descripcion"]');
    const nuevaDesc = (descEl?.value || "").trim();
    if (!nuevaDesc) { showToast("Descripción vacía", false); descEl?.focus(); return; }

    if (!supabase) { showToast("Supabase no inicializado", false); return; }

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Guardando..."; }

    try {
      await ensureProductosSinCodigoColumnMap?.();

      const realDescCol   = getRealColForName?.('DESCRIPCION') || getRealColForName?.('descripcion') || 'DESCRIPCION';

      if (!editingCodigo) {
        showToast("ID del producto no definido. No se puede actualizar.", false);
        return;
      }

      // pedimos select() para confirmar que la fila fue devuelta
      const resp = await supabase
        .from('productos_sin_codigo')
        .update({ [realDescCol]: nuevaDesc })
        .eq("id", editingCodigo)
        .select()
        .maybeSingle();

      const { data, error } = resp || {};

      // marcar éxito si no hay error o si data existe (Supabase a veces devuelve error con data)
      if (!error || data) {
        operationSucceeded = true;
      }

      if (operationSucceeded) {
        showToast("Descripción actualizada", true);
        try { await loadProducts(); } catch(_) {}
        if (modal) modal.style.display = 'none';
        editMode = false;
        editingCodigo = null;
      } else {
        console.error("Error al actualizar descripción:", error);
        showToast("Error actualizando descripción (ver consola)", false);
      }
    } catch (err) {
      // Si la operación había sido marcada como exitosa, no mostramos el toast de error
      if (operationSucceeded) {
        console.warn("Operación resultó exitosa pero ocurrió excepción posterior:", err);
        showToast("Descripción actualizada", true);
        try { await loadProducts(); } catch(_) {}
        if (modal) modal.style.display = 'none';
        editMode = false;
        editingCodigo = null;
      } else {
        console.error("Error inesperado al guardar descripción:", err);
        showToast("Error inesperado al guardar descripción (ver consola)", false);
      }
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalBtnText; }
    }
    return;
  }

  // --- MODO CREAR: insertar nueva fila ---
  try {
    if (!supabase) { showToast("Supabase no inicializado", false); return; }
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Creando..."; }

    await ensureProductosSinCodigoColumnMap?.();

    const formData = new FormData(productForm);
    const raw = Object.fromEntries(formData.entries());

    // Validar campos obligatorios
    const descripcion = (raw['descripcion'] || "").trim();
    const um = (raw['um'] || "").trim();

    if (!descripcion) {
      showToast("La descripción es obligatoria", false);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalBtnText; }
      return;
    }

    // Construir insert con valores por defecto para inventarios
    const insertObj = {};
    const mapCampo = (prefName, value) => {
      const real = getRealColForName?.(prefName) || getRealColForName?.(prefName.toUpperCase()) || prefName.toUpperCase();
      insertObj[real] = value;
    };

    mapCampo('DESCRIPCION', descripcion);
    mapCampo('UM', um);

    // VALORES POR DEFECTO PARA INVENTARIOS - automáticamente en 0
    const detectAndAssign = (label, val) => {
      const realCol = getRealColForInventoryLabel?.(label) || label;
      insertObj[realCol] = val || 0; // Siempre 0 para nuevo producto
    };

    detectAndAssign('I069', 0);
    detectAndAssign('I078', 0);
    detectAndAssign('I07F', 0);
    detectAndAssign('I312', 0);
    detectAndAssign('I073', 0);

    // Almacén también en 0
    const realAlmacen = getRealColForInventoryLabel?.('ALMACEN') || 'INVENTARIO FISICO EN ALMACEN';
    insertObj[realAlmacen] = 0;

    // intento de inserción
    const resp = await supabase.from('productos_sin_codigo').insert([insertObj]).select().limit(1).maybeSingle();
    const { data, error } = resp || {};

    if (!error || data) {
      operationSucceeded = true;
    }

    if (operationSucceeded) {
      showToast("✅ Producto creado exitosamente", true);
      await loadProducts();
      if (modal) modal.style.display = 'none';
    } else {
      console.error("Error creando producto:", error);
      showToast("❌ Error al crear producto", false);
    }

  } catch (err) {
    console.error("Error creando producto (capturado):", err);
    showToast("❌ Error al crear producto", false);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalBtnText; }
  }
});

// ------------------- Cargar productos -------------------
async function loadProducts() {
  if (!supabase) {
    console.error("Supabase no inicializado");
    showToast("Supabase no está inicializado", false);
    return;
  }

  try {
    // traemos todas las columnas (más robusto si renombraste columnas)
    const { data, error } = await supabase
      .from("productos_sin_codigo")
      .select("*");

    if (error) {
      console.error("❌ Error al cargar productos:", error);
      showToast("Error al cargar productos", false);
      return;
    }
    

    // inicializar map de columnas para futuras operaciones
    await ensureProductosSinCodigoColumnMap();

    renderTable(data || []);
    updatePendingCount(); // actualizar contador cada vez que recargue la tabla
  } catch (ex) {
    console.error("loadProducts exception:", ex);
    showToast("Error cargando productos (ver consola)", false);
  }
}

// ------------------- Suscripción en tiempo real -------------------
if (supabase?.channel) {
  try {
    supabase
      .channel("realtime:productos_sin_codigo")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "productos_sin_codigo" },
        (payload) => {
          console.log("📢 Cambio detectado:", payload);
          loadProducts();
        }
      )
      .subscribe();
  } catch (err) {
    console.warn("No se pudo crear canal realtime (versión supabase?):", err);
  }
}

// ------------------- Botón Ver Salidas -------------------
const btnVerSalidas = document.getElementById("btnVerSalidas");
if (btnVerSalidas) {
  btnVerSalidas.addEventListener("click", () => {
    // ir a la página donde se muestran las salidas pendientes
    // en esa página deberás leer localStorage.getItem("salidas_pendientes_sin_codigo")
    window.location.href = "salidas-sin-codigo.html";
  });
}

// ------------------- Historial desde DB -------------------
async function cargarHistorialSalidas() {
  if (!tablaHistorialBody) return;
  try {
    const { data, error } = await supabase
      .from("salidas_sin_codigo")
      .select("*")
      .order("FECHA_SALIDA", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      tablaHistorialBody.innerHTML = `<tr><td colspan="8" class="empty-note">No hay registros de salidas</td></tr>`;
      return;
    }

    tablaHistorialBody.innerHTML = "";
    data.forEach((item) => {
      const descripcion = item["DESCRIPCION"] ?? item["DESCRIPCIÓN"] ?? "-";
      const um = item["UM"] ?? "-";
      const inventario = item["INVENTARIO_ORIGEN"] ?? item["TIPO DE INVENTARIO"] ?? item["ORIGEN"] ?? "-";
      const cantidad = item["CANTIDAD_SALIDA"] ?? item["cantidad"] ?? "-";
      const fecha = formatShowValue(item["FECHA_SALIDA"] ?? item["fecha_salida"] ?? item["fecha"]);
      const responsable = item["RESPONSABLE"] ?? "-";
      const destinatario = item["DESTINATARIO"] ?? "";
      const observ = item["OBSERVACIONES"] ?? item["OBSERVACIONES_SALIDA"] ?? "";

      const color = invColorFor(inventario);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(String(descripcion))}</td>
        <td>${escapeHtml(String(um))}</td>
        <td><span class="inv-dot" title="${escapeHtml(inventario)}" style="background:${color}"></span> ${escapeHtml(String(inventario))}</td>
        <td>${escapeHtml(String(cantidad))}</td>
        <td class="small-muted">${escapeHtml(String(fecha))}</td>
        <td>${escapeHtml(String(responsable))}</td>
        <td>${escapeHtml(String(destinatario))}</td>
        <td>${escapeHtml(String(observ))}</td>
      `;
      tablaHistorialBody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error cargando historial de salidas:", err);
    tablaHistorialBody.innerHTML = `<tr><td colspan="8">Error cargando salidas</td></tr>`;
  }
}

// ------------------- Modal summary (UX) -------------------
function showSummaryModal(successes, errors) {
  const existing = document.getElementById("summaryModal");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "summaryModal";
  overlay.className = "modal";
  overlay.innerHTML = `
    <div class="modal-content" style="text-align:center;max-width:420px">
      <h3>Resumen de operación</h3>
      <p style="font-size:18px;margin:10px 0">Procesadas: <strong>${successes}</strong></p>
      <p style="font-size:18px;margin:10px 0">Fallidas: <strong>${errors}</strong></p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
        <button id="summaryCloseBtn" class="btn-salidas">Cerrar</button>
        <button id="summaryViewBtn" class="btn-add">Ver historial</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.style.display = "flex";
  document.getElementById("summaryCloseBtn").addEventListener("click", () => overlay.remove());
  document.getElementById("summaryViewBtn").addEventListener("click", () => { overlay.remove(); window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'}); });
}

// ------------------- Confirm pending items -------------------
// ------------------- Confirm pending items (con mejor diagnóstico) -------------------
async function confirmAllPendings() {
  const pendientes = getPendingSalidas();
  if (!pendientes || pendientes.length === 0) {
    showToast("No hay salidas pendientes", false);
    return;
  }

  if (!confirm(`¿Confirmar ${pendientes.length} salidas pendientes y actualizar stock?`)) return;

  if (btnConfirmAll) btnConfirmAll.disabled = true;
  let successes = 0;
  let errors = 0;

  for (const item of pendientes.slice()) {
    try {
      console.log(`🔄 Procesando pendiente:`, item);
      
      // Extraer código del producto original con mejor diagnóstico
      const { data: productoData, error: productoError } = await supabase
        .from("productos_sin_codigo")
        .select("*")
        .eq("id", item.id)
        .single();
      
      if (productoError) {
        console.error("❌ Error al obtener producto:", productoError);
        throw productoError;
      }
      
      console.log("📦 Producto obtenido para extraer código:", productoData);
      
      const codigoSC = productoData ? extraerCodigoSC(productoData) : 'S/C';
      console.log(`✅ Código extraído: ${codigoSC}`);

      const responsableFinal = ((item.RESPONSABLE_NOMBRE ?? "").trim() || "").length > 0
        ? `${(item.RESPONSABLE_NOMBRE ?? "").trim()} ${(item.RESPONSABLE_APELLIDO ?? "").trim()}`.trim()
        : (item.RESPONSABLE && String(item.RESPONSABLE).trim()) || (CURRENT_USER_FULLNAME || "Usuario");

      const observacionesFinal = item.OBSERVACIONES ?? "";
      const destinatarioFinal = item.DESTINATARIO ?? "";

      // Resto del código permanece igual...
      const origenesToProcess = Array.isArray(item.ORIGENES) ? item.ORIGENES.map(o => ({
        INVENTARIO_ORIGEN: o.INVENTARIO_ORIGEN,
        CANTIDAD: parseInt(o.CANTIDAD, 10) || 0,
        AVAILABLE: o.AVAILABLE ?? null
      })) : [{
        INVENTARIO_ORIGEN: item.INVENTARIO_ORIGEN,
        CANTIDAD: parseInt(item.CANTIDAD, 10) || 0,
        AVAILABLE: item.AVAILABLE ?? null
      }];

      // Validación de sumatoria
      if (Array.isArray(item.ORIGENES) && item.CANTIDAD) {
        const sum = origenesToProcess.reduce((s,o) => s + (o.CANTIDAD || 0), 0);
        if (sum !== parseInt(item.CANTIDAD, 10)) {
          throw new Error(`Suma de orígenes (${sum}) no coincide con total (${item.CANTIDAD})`);
        }
      }

      // Procesar cada origen
      for (const origin of origenesToProcess) {
        const availableSnapshot = parseInt(origin.AVAILABLE || 0, 10);
        if (availableSnapshot > 0 && origin.CANTIDAD > availableSnapshot) {
          throw new Error(`Cantidad (${origin.CANTIDAD}) mayor que stock disponible (${availableSnapshot}) en ${origin.INVENTARIO_ORIGEN}`);
        }

        // Intentar RPC con código S/C
        const rpcPayload = {
          in_id: item.id,
          in_codigo: codigoSC, // <- AGREGAR CÓDIGO
          in_descripcion: item.DESCRIPCION,
          in_cantidad: origin.CANTIDAD,
          in_responsable: responsableFinal,
          in_origen: origin.INVENTARIO_ORIGEN,
          in_observaciones: observacionesFinal,
          in_destinatario: destinatarioFinal
        };

        console.log("📤 Enviando RPC con payload:", rpcPayload);

        const { data: rpcData, error: rpcError } = await supabase.rpc("crear_salida_sin_codigo", rpcPayload).catch(err => ({ data: null, error: err }));
        
        if (rpcError) {
          console.warn("⚠️ RPC falló, usando método alternativo:", rpcError);
          
          // Fallback: insertar en tabla 'salidas_sin_codigo' con código
          const salidaObj = {
            CODIGO: codigoSC, // <- AGREGAR CÓDIGO
            DESCRIPCION: item.DESCRIPCION,
            CANTIDAD_SALIDA: origin.CANTIDAD,
            FECHA_SALIDA: new Date().toISOString(),
            RESPONSABLE: responsableFinal,
            DESTINATARIO: destinatarioFinal,
            INVENTARIO_ORIGEN: origin.INVENTARIO_ORIGEN,
            OBSERVACIONES: observacionesFinal
          };
          
          const { error: errorInsert } = await supabase.from("salidas_sin_codigo").insert([salidaObj]);
          if (errorInsert) throw errorInsert;

          // Actualizar stock
          await ensureProductosSinCodigoColumnMap();
          const realKey = getRealColForInventoryLabel(origin.INVENTARIO_ORIGEN);
          if (!realKey) throw new Error("No se pudo detectar columna de stock para actualizar: " + origin.INVENTARIO_ORIGEN);

          const { data: prodRow, error: prodErr } = await supabase
            .from("productos_sin_codigo")
            .select(realKey)
            .eq("id", item.id)
            .maybeSingle();
          if (prodErr) throw prodErr;
          
          const current = parseInt(prodRow ? (prodRow[realKey] ?? 0) : 0, 10) || 0;
          const nuevo = Math.max(0, current - parseInt(origin.CANTIDAD, 10));
          const upd = {}; upd[realKey] = nuevo;
          const { error: eUpd } = await supabase.from("productos_sin_codigo").update(upd).eq("id", item.id);
          if (eUpd) throw eUpd;
        } else {
          console.log("✅ RPC exitoso:", rpcData);
        }
      }

      successes++;
      
      // Borrar del pending
      const list = getPendingSalidas();
      const idx = list.findIndex(
        (s) =>
          s.id === item.id &&
          ((s.ADDED_AT && item.ADDED_AT && s.ADDED_AT === item.ADDED_AT) ||
            (s.INVENTARIO_ORIGEN === item.INVENTARIO_ORIGEN && s.CANTIDAD === item.CANTIDAD))
      );
      if (idx >= 0) { list.splice(idx, 1); savePendingSalidas(list); }
    } catch (err) {
      console.error("❌ Error confirmando pendiente:", item, err);
      errors++;
    }
  }

  if (btnConfirmAll) btnConfirmAll.disabled = false;
  await renderPendingList();
  await cargarHistorialSalidas();
  updatePendingCount();

  if (successes > 0 || errors > 0) {
    showSummaryModal(successes, errors);
  } else {
    showToast("No se procesaron salidas", false);
  }
}
// ------------------- Clear pending list -------------------
function clearAllPendings() {
  if (!confirm("¿Eliminar todas las salidas pendientes?")) return;
  savePendingSalidas([]);
  renderPendingList();
  updatePendingCount();
  showToast("Lista de salidas pendientes vaciada", true);
}

// ------------------- Asignar responsable desde tabla usuarios -------------------
async function setResponsableFromAuth() {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.warn("setResponsableFromAuth - supabase.auth.getUser error:", authErr);

    const user = authData?.user ?? null;

    // 1) Si el auth trae email, úsalo directamente
    if (user && user.email) {
      if (typeof responsableField !== "undefined" && responsableField)
        responsableField.value = user.email;
      return user.email;
    }

    // 2) Buscar en tabla usuarios
    if (user && user.id) {
      const { data: uData, error: uErr } = await supabase
        .from("usuarios")
        .select("email,nombre,apellido")
        .eq("id", user.id)
        .maybeSingle();

      if (!uErr && uData) {
        const email = uData.email || null;
        const nombreCompleto = `${(uData.nombre || "").trim()} ${(uData.apellido || "").trim()}`.trim();

        if (email) {
          if (typeof responsableField !== "undefined" && responsableField)
            responsableField.value = email;
          return email;
        } else if (nombreCompleto) {
          if (typeof responsableField !== "undefined" && responsableField)
            responsableField.value = nombreCompleto;
          return nombreCompleto;
        }
      }
    }

    // 3) Fallback
    if (typeof responsableField !== "undefined" && responsableField)
      responsableField.value = CURRENT_USER_FULLNAME || "";
    return null;
  } catch (ex) {
    console.error("setResponsableFromAuth - excepción:", ex);
    if (typeof responsableField !== "undefined" && responsableField)
      responsableField.value = CURRENT_USER_FULLNAME || "";
    return null;
  }
}

// ------------------- Cargar inventario -------------------
async function cargarInventario({ showErrors = false } = {}) {
  try {
    const { data, error } = await supabase
      .from("productos_sin_codigo")
      .select("*");

    if (error) throw error;

    // Limpiar tabla
    if (tableBody) {
      tableBody.innerHTML = "";
    }

    if (!data || data.length === 0) {
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Sin productos registrados</td></tr>`;
      }
      return;
    }

    // Renderizar filas
    data.forEach((p) => {
      if (!tableBody) return;
      
      const tr = document.createElement("tr");

      // Usar las funciones helper para obtener los valores correctamente
      const i069 = getStockFromProduct(p, 'I069') ?? 0;
      const i078 = getStockFromProduct(p, 'I078') ?? 0;
      const i07f = getStockFromProduct(p, 'I07F') ?? 0;
      const i312 = getStockFromProduct(p, 'I312') ?? 0;
      const i073 = getStockFromProduct(p, 'I073') ?? 0;

      const totalStock = i069 + i078 + i07f + i312 + i073;

      let colorClass = "";
      if (totalStock > 10) colorClass = "green";
      else if (totalStock >= 2) colorClass = "yellow";
      else colorClass = "red";

      tr.innerHTML = `
        <td>${p.DESCRIPCION || p.descripcion || ''}</td>
        <td>${p.UM || p.um || ''}</td>
        <td>${i069}</td>
        <td>${i078}</td>
        <td>${i07f}</td>
        <td>${i312}</td>
        <td>${i073}</td>
        <td class="${colorClass}">${totalStock}</td>
        <td>
          <button class="btn-edit" data-id="${p.id}">✏️</button>
          <button class="btn-delete" data-id="${p.id}">🗑️</button>
        </td>
      `;

      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error al cargar inventario:", err);
    if (showErrors) showToast("Error al cargar inventario", false);
  }
}

// ------------------- BOTÓN REFRESCAR -------------------
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "⏳ Recargando página...";
    location.reload(); // recarga toda la página
  });
}

// ------------------- FUNCIÓN PARA NOTIFICACIONES -------------------
function showToast(msg, ok = true) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast show ${ok ? "ok" : "error"}`;
  setTimeout(() => (toast.className = "toast"), 2500);
}

document.addEventListener("DOMContentLoaded", cargarInventario);

// ------------------- Init -------------------
document.addEventListener("DOMContentLoaded", async () => {
  await setResponsableFromAuth();
  await loadProducts();
  await renderPendingList();
  await cargarHistorialSalidas();
  updatePendingCount();

  if (btnConfirmAll) btnConfirmAll.addEventListener("click", confirmAllPendings);
  if (btnClearPending) btnClearPending.addEventListener("click", clearAllPendings);
  if (btnRefresh) btnRefresh.addEventListener("click", cargarHistorialSalidas);
});