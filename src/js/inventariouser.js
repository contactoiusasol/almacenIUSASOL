// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ------------------- VARIABLES GLOBALES -------------------
let currentPage = 1;
const ITEMS_PER_PAGE = 100;
let totalProducts = 0;
let allProducts = [];
let filteredProducts = [];

// ------------------- ELEMENTOS DOM -------------------
const tableBody = document.querySelector("#inventoryTable tbody");
const searchInput = document.getElementById("searchInput");
const paginationContainer = document.getElementById("paginationControls");
const paginationContainerBottom = document.getElementById("paginationControlsBottom");
const verMovimientoBtn = document.getElementById("verMovimientoBtn");

// ------------------- FUNCIONES UTILITARIAS -------------------
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  const cleaned = String(v).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function formatShowValue(val) {
  if (val === null || val === undefined) return "";
  return String(val);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ------------------- FUNCIONES DE DEBUG -------------------
function debugLocalStorage() {
  const movimiento = localStorage.getItem("movimientoMaterial");
  console.log("🔍 DEBUG LocalStorage movimientoMaterial:", movimiento);
  console.log("🔍 DEBUG Todos los items en localStorage:");
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    console.log(`  ${key}:`, localStorage.getItem(key));
  }
}

function verificarProductoEnLista(codigo) {
  const lista = JSON.parse(localStorage.getItem("movimientoMaterial")) || [];
  const existe = lista.some(item => item.codigo === codigo);
  console.log(`🔍 Producto ${codigo} en lista:`, existe);
  return existe;
}

function verMovimiento() {
  const lista = JSON.parse(localStorage.getItem("movimientoMaterial")) || [];
  console.log("📋 Lista de movimiento actual:", lista);
  alert(`Productos en movimiento: ${lista.length}\n${JSON.stringify(lista, null, 2)}`);
}

// ------------------- CARGAR TODOS LOS PRODUCTOS -------------------
async function loadAllProducts() {
  if (!supabase) {
    console.error("Supabase no inicializado");
    return;
  }

  try {
    console.log("🔄 Cargando todos los productos...");
    
    let allProductsData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      console.log(`📄 Cargando lote ${page + 1}...`);
      
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .order("CODIGO", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allProductsData = [...allProductsData, ...data];
        console.log(`✅ Lote ${page + 1} cargado: ${data.length} productos`);
        
        if (data.length < pageSize) {
          hasMore = false;
          console.log("🏁 Último lote alcanzado");
        } else {
          page++;
        }
      } else {
        hasMore = false;
        console.log("🏁 No hay más productos");
      }
    }

    allProducts = allProductsData;
    filteredProducts = [...allProducts];
    totalProducts = allProducts.length;

    console.log(`✅ TOTAL: ${totalProducts} productos cargados exitosamente`);
    
    setupPagination();
    currentPage = 1;
    renderCurrentPage();
    
  } catch (error) {
    console.error("❌ Error cargando productos:", error);
  }
}

// ------------------- RENDERIZAR TABLA -------------------
function renderTable(products) {
  if (!tableBody) return;
  
  tableBody.innerHTML = "";

  if (!products || products.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No hay productos que coincidan</td></tr>`;
    return;
  }

  products.forEach((producto) => {
    // Obtener valores de inventario usando el método robusto del primer código
    const i069 = getStockFromProduct(producto, "I069");
    const i078 = getStockFromProduct(producto, "I078");
    const i07f = getStockFromProduct(producto, "I07F");
    const i312 = getStockFromProduct(producto, "I312");
    const i073 = getStockFromProduct(producto, "I073");
    
    // Calcular stock total
    const stockTotal = i069 + i078 + i07f + i312 + i073;

    // Determinar clase de stock
    let stockClass = "";
    if (stockTotal <= 1) {
      stockClass = "stock-low";
    } else if (stockTotal <= 10) {
      stockClass = "stock-medium";
    } else {
      stockClass = "stock-high";
    }

    const row = document.createElement("tr");
    row.className = stockClass;

    const canAdd = stockTotal > 0;

    row.innerHTML = `
      <td>${escapeHtml(producto.CODIGO || "")}</td>
      <td>${escapeHtml(producto.DESCRIPCION || "")}</td>
      <td>${escapeHtml(producto.UM || "")}</td>
      <td>${formatShowValue(i069)}</td>
      <td>${formatShowValue(i078)}</td>
      <td>${formatShowValue(i07f)}</td>
      <td>${formatShowValue(i312)}</td>
      <td>${formatShowValue(i073)}</td>
      <td>${formatShowValue(stockTotal)}</td>
      <td>
        <button class="agregar-btn" ${canAdd ? "" : "disabled"} 
                data-codigo="${escapeHtml(producto.CODIGO || "")}"
                data-descripcion="${escapeHtml(producto.DESCRIPCION || "")}"
                data-um="${escapeHtml(producto.UM || "")}"
                data-stock="${stockTotal}">
          ${canAdd ? "Agregar" : "Sin stock"}
        </button>
      </td>
    `;

    tableBody.appendChild(row);
  });

  agregarEventListenersABotones();
}
// ------------------- AGREGAR EVENT LISTENERS A BOTONES -------------------
function agregarEventListenersABotones() {
  const botonesAgregar = document.querySelectorAll('.agregar-btn:not([disabled])');
  
  botonesAgregar.forEach((btn, index) => {
    // Clonamos para eliminar listeners previos
    const nuevoBoton = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevoBoton, btn);
    
    nuevoBoton.addEventListener('click', function() {
      const productoData = {
        codigo: this.dataset.codigo,
        descripcion: this.dataset.descripcion,
        um: this.dataset.um,
        stockDisponible: parseInt(this.dataset.stock, 10) || 0
      };
      agregarAMovimiento(productoData);
    });
  });
}

// ------------------- FUNCIONES DE INVENTARIO ROBUSTAS (del primer código) -------------------
function normalizeKeyName(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function inventoryKeyVariants(inv) {
  if (!inv) return [];
  const short = String(inv).trim().toUpperCase().replace(/^INVENTARIO\s*/i, "");
  const variants = [];
  variants.push(`INVENTARIO ${short}`);
  variants.push(`inventario_${short.toLowerCase()}`);
  variants.push(`inventario${short.toLowerCase()}`);
  variants.push(`${short}`);
  return [...new Set(variants)];
}

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

  for (const k of keys) {
    if (normalizeKeyName(k).includes("inventario")) {
      return toNumber(productObj[k]);
    }
  }

  return 0;
}

// ------------------- AGREGAR EVENT LISTENERS A BOTONES -------------------
function agregarAMovimiento(producto) {
  try {
    // Validación de stock
    const stock = Number(producto.stockDisponible ?? 0);
    if (stock <= 0) {
      mostrarAlerta("❌ No puedes agregar este producto porque no tiene cantidad disponible.", "warning");
      return;
    }

    // Cargar lista desde localStorage (con manejo de errores)
    let lista = [];
    try {
      const listaStorage = localStorage.getItem("movimientoMaterial");
      if (listaStorage) {
        lista = JSON.parse(listaStorage);
        if (!Array.isArray(lista)) lista = [];
      }
    } catch (e) {
      lista = [];
    }

    const productoExistente = lista.find(item => item.codigo === producto.codigo);

    if (!productoExistente) {
      const nuevoProducto = {
        codigo: producto.codigo,
        descripcion: producto.descripcion,
        um: producto.um,
        stockDisponible: stock,
        cantidad: 1
      };

      lista.push(nuevoProducto);

      try {
        localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
        // Actualiza el badge contador (si lo tienes)
        if (typeof updateVerMovimientoBadge === 'function') updateVerMovimientoBadge();

        mostrarAlerta(`✅ Producto ${producto.codigo} agregado a la lista de movimiento`, "success");

      } catch (storageError) {
        mostrarAlerta("❌ Error al guardar en el almacenamiento local", "error");
      }
    } else {
      // Mostrar ALERTA (en vez de imprimir objeto en consola)
      mostrarAlerta(`⚠️ El producto ${producto.codigo} ya está en la lista de movimiento`, "warning");
    }
  } catch (e) {
    mostrarAlerta("❌ Error agregando producto", "error");
  }
}


// ------------------- AGREGAR A MOVIMIENTO -------------------
function agregarAMovimiento(producto) {
  try {
    console.log("🔄 Intentando agregar producto:", producto);
    
    debugLocalStorage();
    
    const stock = Number(producto.stockDisponible ?? 0);
    if (stock <= 0) {
      mostrarAlerta("No puedes agregar este producto porque no tiene cantidad disponible.", "warning");
      return;
    }

    let lista = [];
    try {
      const listaStorage = localStorage.getItem("movimientoMaterial");
      if (listaStorage) {
        lista = JSON.parse(listaStorage);
        if (!Array.isArray(lista)) {
          console.warn("⚠️ movimientoMaterial no es un array, reiniciando...");
          lista = [];
        }
      }
    } catch (e) {
      console.error("❌ Error parseando movimientoMaterial:", e);
      lista = [];
    }

    console.log("📋 Lista actual antes de agregar:", lista);
    
    const productoExistente = lista.find(item => item.codigo === producto.codigo);
    
    if (!productoExistente) {
      const nuevoProducto = {
        codigo: producto.codigo,
        descripcion: producto.descripcion,
        um: producto.um,
        stockDisponible: stock,
        cantidad: 1
      };
      
      lista.push(nuevoProducto);
      
      try {
        localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
        updateVerMovimientoBadge();

        console.log("💾 Guardado en localStorage:", lista);
        updateVerMovimientoBadge();

        const verificacion = localStorage.getItem("movimientoMaterial");
        console.log("✅ Verificación después de guardar:", verificacion);
        
        mostrarAlerta(`✅ Producto "${producto.codigo}" agregado a la lista de movimiento`, "success");
        
        setTimeout(() => {
          verificarProductoEnLista(producto.codigo);
          debugLocalStorage();
        }, 100);
        
      } catch (storageError) {
        console.error("❌ Error guardando en localStorage:", storageError);
        mostrarAlerta("❌ Error al guardar en el almacenamiento local", "error");
      }
    } else {
      console.log("⚠️ Producto ya existe en lista:", productoExistente);
      mostrarAlerta("⚠️ Este producto ya está en la lista de movimiento", "warning");
    }
  } catch (e) {
    console.error("❌ Error crítico en agregarAMovimiento:", e);
    mostrarAlerta("❌ Error grave agregando producto", "error");
  }
}

// ------------------- ALERTAS -------------------
function mostrarAlerta(mensaje, tipo = 'success') {
  const alerta = document.createElement("div");
  alerta.className = `alert ${tipo}`;
  alerta.textContent = mensaje;
  document.body.appendChild(alerta);

  setTimeout(() => alerta.classList.add("show"), 80);
  setTimeout(() => {
    alerta.classList.remove("show");
    setTimeout(() => alerta.remove(), 350);
  }, 2600);
}

// ------------------- PAGINACIÓN -------------------
function setupPagination() {
  updatePaginationControls();
}

function updatePaginationControls() {
  const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalProducts);

  const paginationHTML = `
    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;">
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

  if (paginationContainer) paginationContainer.innerHTML = paginationHTML;
  if (paginationContainerBottom) paginationContainerBottom.innerHTML = paginationHTML;

  document.getElementById('firstPage')?.addEventListener('click', () => goToPage(1));
  document.getElementById('prevPage')?.addEventListener('click', () => goToPage(currentPage - 1));
  document.getElementById('nextPage')?.addEventListener('click', () => goToPage(currentPage + 1));
  document.getElementById('lastPage')?.addEventListener('click', () => goToPage(totalPages));
  
  const pageInput = document.getElementById('pageInput');
  if (pageInput) {
    pageInput.addEventListener('change', (e) => {
      const page = parseInt(e.target.value);
      if (page >= 1 && page <= totalPages) {
        goToPage(page);
      } else {
        e.target.value = currentPage;
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
}

function goToPage(page) {
  if (page < 1 || page > Math.ceil(totalProducts / ITEMS_PER_PAGE)) return;
  
  currentPage = page;
  renderCurrentPage();
  updatePaginationControls();
}

function getCurrentPageItems() {
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  return filteredProducts.slice(startIndex, endIndex);
}

function renderCurrentPage() {
  const currentItems = getCurrentPageItems();
  renderTable(currentItems);
}

// ------------------- BÚSQUEDA -------------------
function setupSearch() {
  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      const term = e.target.value.trim().toLowerCase();
      
      if (term === '') {
        filteredProducts = [...allProducts];
        totalProducts = filteredProducts.length;
        currentPage = 1;
        renderCurrentPage();
        updatePaginationControls();
        return;
      }
      
      filteredProducts = allProducts.filter(producto => {
        const codigo = String(producto.CODIGO || "").toLowerCase();
        const descripcion = String(producto.DESCRIPCION || "").toLowerCase();
        
        return codigo.includes(term) || descripcion.includes(term);
      });
      
      totalProducts = filteredProducts.length;
      currentPage = 1;
      renderCurrentPage();
      updatePaginationControls();
      
    }, 300));
  }
}
// ---------- Badge contador en el botón "Ver Movimiento" ----------
function ensureVerMovimientoBadge() {
  if (!verMovimientoBtn) return null;

  // Añadir clase envolvente si no existe
  if (!verMovimientoBtn.classList.contains('btn-badge')) {
    verMovimientoBtn.classList.add('btn-badge');
  }

  // Crear badge si no existe
  let badge = verMovimientoBtn.querySelector('.badge-counter');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge-counter hidden';
    badge.setAttribute('aria-live', 'polite');
    verMovimientoBtn.appendChild(badge);
  }

  return badge;
}

function getMovimientoCount() {
  try {
    const lista = JSON.parse(localStorage.getItem('movimientoMaterial')) || [];
    if (!Array.isArray(lista)) return 0;
    // contar elementos (cambiar a sumatoria de cantidad si prefieres)
    return lista.length;
  } catch (e) {
    console.warn('Error leyendo movimientoMaterial:', e);
    return 0;
  }
}

function updateVerMovimientoBadge() {
  const badge = ensureVerMovimientoBadge();
  if (!badge) return;
  const count = getMovimientoCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Exponer globalmente para poder llamarla desde otras funciones/archivos
window.updateVerMovimientoBadge = updateVerMovimientoBadge;

// Escuchar cambios en localStorage (otras pestañas)
window.addEventListener('storage', (e) => {
  if (e.key === 'movimientoMaterial') updateVerMovimientoBadge();
});


function getMovimientoCount() {
  try {
    const lista = JSON.parse(localStorage.getItem('movimientoMaterial')) || [];
    if (!Array.isArray(lista)) return 0;
    return lista.length;
  } catch (e) {
    console.warn('Error leyendo movimientoMaterial:', e);
    return 0;
  }
}

function updateVerMovimientoBadge() {
  const badge = ensureVerMovimientoBadge();
  if (!badge) return;
  const count = getMovimientoCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count); // cap visual
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// actualizar al inicio
updateVerMovimientoBadge();

// actualizar cuando la lista cambie dentro de la misma pestaña
// (llama a esta función desde las funciones que modifican la lista)
window.updateVerMovimientoBadge = updateVerMovimientoBadge;

// escuchar cambios en localStorage (otras pestañas)
window.addEventListener('storage', (e) => {
  if (e.key === 'movimientoMaterial') {
    updateVerMovimientoBadge();
  }
});

function mostrarAlerta(mensaje, tipo = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;
  toast.textContent = mensaje;

  container.appendChild(toast);

  // Animar aparición
  setTimeout(() => toast.classList.add("show"), 50);

  // Desaparecer después de 3 segundos
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ------------------- INICIALIZACIÓN -------------------
document.addEventListener('DOMContentLoaded', function() {
  console.log("👤 Inicializando vista de usuario...");
  
  setupSearch();
  
  if (verMovimientoBtn) {
    verMovimientoBtn.addEventListener('click', () => {
      window.location.href = 'movimientomaterial.html';
    });
  }
  
  loadAllProducts();
});
