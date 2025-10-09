// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ------------------- ELEMENTOS DOM (se obtienen al cargar) -------------
let tableBody = null;
let searchInput = null;
let verBtn = null;

// ------------------- ESTADO GLOBALS -------------------
let PRODUCTOS_COLUMN_MAP = null; // map: normalizedKey -> realColumnName
let allProducts = null; // cache global de productos

// ------------------- UTILS -------------------
function log(...args) { console.log("[INV]", ...args); }
function warn(...args) { console.warn("[INV]", ...args); }
function error(...args) { console.error("[INV]", ...args); }

function debounce(fn, delay = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// normaliza texto: minúsculas + quitar acentos
function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// normaliza nombres de columnas (quita tildes y no-alfa)
function normalizeKeyName(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[^a-z0-9]/g, ""); // quitar espacios/puntuación
}

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const cleaned = String(v).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
};

function formatShowValue(val) {
  if (val === null || val === undefined) return "";
  return String(val);
}

// ------------------- VARIANTES DE INVENTARIO -------------------
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

// ------------------- MAPA DE COLUMNAS (detecta nombres reales) -----------
async function ensureProductosColumnMap() {
  if (PRODUCTOS_COLUMN_MAP) return PRODUCTOS_COLUMN_MAP;
  PRODUCTOS_COLUMN_MAP = {};
  if (!supabase) return PRODUCTOS_COLUMN_MAP;
  try {
    const { data, error } = await supabase.from("productos").select("*").limit(1).maybeSingle();
    if (error) {
      warn("ensureProductosColumnMap error:", error);
      return PRODUCTOS_COLUMN_MAP;
    }
    const row = data || {};
    Object.keys(row).forEach((k) => {
      PRODUCTOS_COLUMN_MAP[normalizeKeyName(k)] = k;
    });
    log("PRODUCTOS_COLUMN_MAP inicializado:", PRODUCTOS_COLUMN_MAP);
    return PRODUCTOS_COLUMN_MAP;
  } catch (e) {
    error("ensureProductosColumnMap exception:", e);
    return PRODUCTOS_COLUMN_MAP;
  }
}

// dada una etiqueta de inventario y un objeto producto -> devuelve número
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

  // fallback: si existe alguna columna que contenga 'inventario'
  for (const k of keys) {
    if (normalizeKeyName(k).includes("inventario")) {
      return toNumber(productObj[k]);
    }
  }

  return 0;
}

// ------------------- RENDERIZADO DE TABLA -------------------
// ------------------- RENDERIZADO DE TABLA (con bloqueo de "Agregar" si no hay stock) -------------------
function renderTable(products) {
  if (!tableBody) {
    console.warn("renderTable: tableBody no definido");
    return;
  }
  tableBody.innerHTML = "";

  (products || []).forEach((p) => {
    // obtener stock por inventario con helper robusto
    const i069 = getStockFromProduct(p, "I069");
    const i078 = getStockFromProduct(p, "I078");
    const i07f = getStockFromProduct(p, "I07F");
    const i312 = getStockFromProduct(p, "I312");
    const i073 = getStockFromProduct(p, "I073");
    const fisico = getStockFromProduct(p, "ALMACEN") || getStockFromProduct(p, "INVENTARIO FISICO EN ALMACEN");

    const stockReal = Number(i069) + Number(i078) + Number(i07f) + Number(i312) + Number(i073);

    // Colores por stock
    let stockClass = "stock-high";
    if (stockReal <= 1) {
      stockClass = "stock-low";
    } else if (stockReal <= 10) {
      stockClass = "stock-medium";
    }

    const codigoVal = p["CODIGO"] ?? p.codigo ?? getValueFromProduct(p, ["CODIGO"]);
    const descripcionVal = p["DESCRIPCION"] ?? p.descripcion ?? getValueFromProduct(p, ["DESCRIPCION"]);

    const row = document.createElement("tr");
    row.className = stockClass;

    // Si no hay stock real, deshabilitamos el botón y añadimos clase para estilo
    const canAdd = stockReal > 0;

    row.innerHTML = `
      <td>${escapeHtml(codigoVal)}</td>
      <td>${escapeHtml(descripcionVal)}</td>
      <td>${escapeHtml(p["UM"] ?? p.um ?? "")}</td>
      <td>${i069}</td>
      <td>${i078}</td>
      <td>${i07f}</td>
      <td>${i312}</td>
      <td>${i073}</td>
      <td>${formatShowValue(fisico)}</td>
      <td>
        <button class="agregar-btn" ${canAdd ? "" : "disabled aria-disabled='true'"}>${canAdd ? "Agregar" : "Sin stock"}</button>
      </td>
    `;

    const btn = row.querySelector(".agregar-btn");
    if (btn) {
      // añadir clase visual si está deshabilitado
      if (!canAdd) btn.classList.add("disabled");

      btn.addEventListener("click", () => {
        // protección extra: si está deshabilitado no hace nada
        if (!canAdd) {
          showCustomAlert("No hay cantidad disponible para agregar este producto.", "warning");
          return;
        }

        const stockRealForPush = stockReal; // ya es la suma
        agregarAMovimiento({
          codigo: String(codigoVal ?? "") ,
          descripcion: String(descripcionVal ?? "") ,
          um: p["UM"] ?? p.um ?? "",
          stockDisponible: Number(stockRealForPush)
        });
      });
    }

    tableBody.appendChild(row);
  });
}

// ------------------- AGREGAR A MOVIMIENTO (valida stock > 0) -------------------
function agregarAMovimiento(producto) {
  try {
    const stock = Number(producto.stockDisponible ?? 0);
    if (stock <= 0) {
      // No permitir agregar productos con stock 0 o negativo
      showCustomAlert("No puedes agregar este producto porque no tiene cantidad disponible.", "warning");
      return;
    }

    let lista = JSON.parse(localStorage.getItem("movimientoMaterial")) || [];
    if (!lista.some(item => item.codigo === producto.codigo)) {
      lista.push(producto);
      localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
      showCustomAlert("✅😉 Producto agregado a la lista de movimiento", "success");
    } else {
      showCustomAlert("😉 Este producto ya está en la lista de movimiento", "warning");
    }
  } catch (e) {
    console.error("agregarAMovimiento error:", e);
    showCustomAlert("❌ Error agregando producto", "error");
  }
}


// Helper usado por render (buscar valor entre posibles claves)
function getValueFromProduct(item, possibleKeys) {
  for (const k of possibleKeys) {
    if (Object.prototype.hasOwnProperty.call(item, k) && item[k] != null && item[k] !== "") {
      return item[k];
    }
  }
  // fallback por nombres parecidos
  for (const k of Object.keys(item || {})) {
    const nk = normalizeKeyName(k);
    if (nk.includes("codigo")) return item[k];
  }
  for (const k of Object.keys(item || {})) {
    const nk = normalizeKeyName(k);
    if (nk.includes("descripcion") || nk.includes("desc")) return item[k];
  }
  return "";
}

// ------------------- MOVIMIENTO (localStorage) -------------------
function showCustomAlert(message, type = 'success') {
  // crea alert simple no intrusiva
  const overlay = document.createElement('div');
  overlay.className = 'custom-alert-overlay';
  const alert = document.createElement('div');
  alert.className = `custom-alert ${type}`;
  alert.innerHTML = `
    <div class="custom-alert-message">${message}</div>
    <button class="custom-alert-close">Aceptar</button>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(alert);
  setTimeout(() => overlay.classList.add('show'), 10);
  setTimeout(() => alert.classList.add('show'), 10);
  alert.querySelector('.custom-alert-close')?.addEventListener('click', () => hideCustomAlert(alert, overlay));
  overlay.addEventListener('click', () => hideCustomAlert(alert, overlay));
  setTimeout(() => { if (document.body.contains(alert)) hideCustomAlert(alert, overlay); }, 3000);
}
function hideCustomAlert(alert, overlay) {
  alert.classList.remove('show'); alert.classList.add('hide');
  overlay.classList.remove('show');
  setTimeout(() => {
    if (document.body.contains(alert)) document.body.removeChild(alert);
    if (document.body.contains(overlay)) document.body.removeChild(overlay);
  }, 400);
}
function agregarAMovimiento(producto) {
  try {
    let lista = JSON.parse(localStorage.getItem("movimientoMaterial")) || [];
    if (!lista.some(item => item.codigo === producto.codigo)) {
      lista.push(producto);
      localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
      showCustomAlert("✅😉 Producto agregado a la lista de movimiento", "success");
    } else {
      showCustomAlert("😉 Este producto ya está en la lista de movimiento", "warning");
    }
  } catch (e) {
    error("agregarAMovimiento error:", e);
    showCustomAlert("❌ Error agregando producto", "error");
  }
}

// ------------------- FETCH / CACHE DE PRODUCTOS -------------------
async function fetchAllProductsFromServer() {
  if (!supabase) throw new Error("Supabase no inicializado");
  try {
    const { data, error } = await supabase.from("productos").select("*").order("CODIGO", { ascending: true });
    if (error) {
      error("Error fetchAllProductsFromServer:", error);
      return [];
    }
    return data || [];
  } catch (e) {
    error("fetchAllProductsFromServer exception:", e);
    return [];
  }
}

async function loadProducts() {
  if (!supabase) {
    error("Supabase no inicializado");
    return;
  }
  try {
    const data = await fetchAllProductsFromServer();
    // rellenar map de columnas si hace falta
    if (!PRODUCTOS_COLUMN_MAP || Object.keys(PRODUCTOS_COLUMN_MAP).length === 0) {
      PRODUCTOS_COLUMN_MAP = {};
      const sample = (data && data[0]) || {};
      Object.keys(sample).forEach((k) => {
        PRODUCTOS_COLUMN_MAP[normalizeKeyName(k)] = k;
      });
      log("PRODUCTOS_COLUMN_MAP (auto):", PRODUCTOS_COLUMN_MAP);
    }
    allProducts = data || [];
    renderTable(allProducts);
  } catch (ex) {
    error("loadProducts exception:", ex);
  }
}

// ------------------- BÚSQUEDA CLIENTE ROBUSTA -------------------
function resolvePossibleKeys(keywordNorm) {
  if (!PRODUCTOS_COLUMN_MAP) return [];
  const found = [];
  for (const norm in PRODUCTOS_COLUMN_MAP) {
    if (norm.includes(keywordNorm)) found.push(PRODUCTOS_COLUMN_MAP[norm]);
  }
  return found;
}

function setupSearchListener() {
  if (!searchInput) {
    warn("No se encontró searchInput en DOM");
    return;
  }

  const handleSearch = debounce(async () => {
    const raw = String(searchInput.value || "");
    const q = raw.trim();

    if (q === "") {
      if (allProducts === null) {
        await loadProducts();
      } else {
        renderTable(allProducts);
      }
      return;
    }

    if (allProducts === null) {
      allProducts = await fetchAllProductsFromServer();
      await ensureProductosColumnMap();
    }

    const tokens = q.split(/\s+/).map(t => normalizeText(t)).filter(Boolean);

    const codigoKeys = [...resolvePossibleKeys("codigo"), "CODIGO", "codigo", "Codigo", "code", "Code"];
    const descKeys = [...resolvePossibleKeys("descripcion"), ...resolvePossibleKeys("desc"), "DESCRIPCION", "descripcion", "Descripcion", "DESC", "desc", "descripcion_producto", "descripcionlarga"];

    const filtered = (allProducts || []).filter((p) => {
      const rawCodigo = getValueFromProduct(p, codigoKeys);
      const rawDesc = getValueFromProduct(p, descKeys);
      const combined = normalizeText(`${rawCodigo} ${rawDesc}`);
      return tokens.every((tk) => combined.includes(tk));
    });

    // fallback digits
    if (filtered.length === 0 && /^\d+$/.test(q)) {
      const digitFiltered = (allProducts || []).filter((p) => {
        const rawCodigo = getValueFromProduct(p, codigoKeys);
        return String(rawCodigo ?? "").toLowerCase().includes(q.toLowerCase());
      });
      log("Busqueda digits fallback, matches:", digitFiltered.length);
      renderTable(digitFiltered);
      return;
    }

    renderTable(filtered);
  }, 90);

  searchInput.addEventListener("input", handleSearch);
}

// ------------------- INICIALIZACIÓN (espera DOM) -------------------
document.addEventListener("DOMContentLoaded", async () => {
  try {
    tableBody = document.querySelector("#inventoryTable tbody");
    searchInput = document.getElementById("searchInput");
    verBtn = document.getElementById("verMovimientoBtn");

    // Setup search (si existe)
    setupSearchListener();

    // Inicializar realtime si soportado
    if (supabase?.channel) {
      try {
        supabase
          .channel("productos-changes")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "productos",
            },
            (payload) => {
              log("🔄 Cambio detectado:", payload);
              loadProducts();
            }
          )
          .subscribe();
      } catch (err) {
        warn("No se pudo crear canal realtime:", err);
      }
    }

    if (verBtn) {
      verBtn.addEventListener("click", () => {
        window.location.href = "movimientomaterial.html";
      });
    }

    // Cargar productos inicialmente
    await loadProducts();
  } catch (e) {
    error("Inicialización exception:", e);
  }
});
