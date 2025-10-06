// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const tableBody = document.querySelector("#inventoryTable tbody");
const searchInput = document.getElementById("searchInput");

// ------------------- Util helpers -------------------
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

function formatShowValue(val) {
  if (val === null || val === undefined) return "";
  return String(val);
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
  variants.push(`INVENTARIO ${short}`);           // "INVENTARIO I078"
  variants.push(`inventario_${short.toLowerCase()}`); // "inventario_i078"
  variants.push(`inventario${short.toLowerCase()}`);  // "inventarioi078"
  variants.push(`${short}`);                        // "I078"
  return [...new Set(variants)];
}

// ---------------- Helpers para detección de columnas reales ----------------
let PRODUCTOS_COLUMN_MAP = null;
async function ensureProductosColumnMap() {
  if (PRODUCTOS_COLUMN_MAP) return PRODUCTOS_COLUMN_MAP;
  PRODUCTOS_COLUMN_MAP = {};
  if (!supabase) return PRODUCTOS_COLUMN_MAP;
  try {
    const { data, error } = await supabase.from("productos").select("*").limit(1).maybeSingle();
    if (error) {
      console.warn("ensureProductosColumnMap error:", error);
      return PRODUCTOS_COLUMN_MAP;
    }
    const row = data || {};
    Object.keys(row).forEach((k) => {
      PRODUCTOS_COLUMN_MAP[normalizeKeyName(k)] = k;
    });
    return PRODUCTOS_COLUMN_MAP;
  } catch (e) {
    console.error("ensureProductosColumnMap exception:", e);
    return PRODUCTOS_COLUMN_MAP;
  }
}

function getRealColForInventoryLabel(invLabel) {
  if (!PRODUCTOS_COLUMN_MAP) return null;
  const variants = inventoryKeyVariants(invLabel);
  for (const v of variants) {
    const norm = normalizeKeyName(v);
    if (PRODUCTOS_COLUMN_MAP[norm]) return PRODUCTOS_COLUMN_MAP[norm];
  }
  // fallback: devolver la primera columna que contenga "inventario"
  for (const norm in PRODUCTOS_COLUMN_MAP) {
    if (norm.includes("inventario")) return PRODUCTOS_COLUMN_MAP[norm];
  }
  return null;
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

  // fallback: si existe alguna columna que contenga 'inventario'
  for (const k of keys) {
    if (normalizeKeyName(k).includes("inventario")) {
      return toNumber(productObj[k]);
    }
  }

  return 0;
}

// ------------------- Cargar productos -------------------
async function loadProducts() {
  if (!supabase) {
    console.error("Supabase no inicializado");
    return;
  }

  try {
    // traemos todas las columnas para ser tolerantes a renombres
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .order("CODIGO", { ascending: true });

    if (error) {
      console.error("❌ Error al cargar productos:", error);
      return;
    }

    // cachear columnas reales
    await ensureProductosColumnMap();

    renderTable(data || []);
  } catch (ex) {
    console.error("loadProducts exception:", ex);
  }
}

// ------------------- Renderizar tabla -------------------
function renderTable(products) {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  products.forEach((p) => {
    // obtener stock por inventario con helper robusto
    const i069 = getStockFromProduct(p, "I069");
    const i078 = getStockFromProduct(p, "I078");
    const i07f = getStockFromProduct(p, "I07F");
    const i312 = getStockFromProduct(p, "I312");
    const i073 = getStockFromProduct(p, "I073");
    const fisico = getStockFromProduct(p, "ALMACEN") || getStockFromProduct(p, "INVENTARIO FISICO EN ALMACEN");

    const stockReal = i069 + i078 + i07f + i312 + i073;

    // Colores por stock
    let stockClass = "stock-high";
    if (stockReal <= 1) {
      stockClass = "stock-low";
    } else if (stockReal <= 10) {
      stockClass = "stock-medium";
    }

    const row = document.createElement("tr");
    row.className = stockClass;

    row.innerHTML = `
      <td>${escapeHtml(p["CODIGO"] ?? p.codigo ?? "")}</td>
      <td>${escapeHtml(p["DESCRIPCION"] ?? p.descripcion ?? "")}</td>
      <td>${escapeHtml(p["UM"] ?? p.um ?? "")}</td>
      <td>${i069}</td>
      <td>${i078}</td>
      <td>${i07f}</td>
      <td>${i312}</td>
      <td>${i073}</td>
      <td>${formatShowValue(fisico)}</td>
      <td><button class="agregar-btn">Agregar</button></td>
    `;

    // botón para agregar a movimientoMaterial
    row.querySelector(".agregar-btn").addEventListener("click", () => {
      const stockRealForPush = i069 + i078 + i07f + i312 + i073;
      agregarAMovimiento({
        codigo: p["CODIGO"] ?? p.codigo ?? "",
        descripcion: p["DESCRIPCION"] ?? p.descripcion ?? "",
        um: p["UM"] ?? p.um ?? "",
        stockDisponible: stockRealForPush
      });
    });

    tableBody.appendChild(row);
  });
}

// ------------------- Agregar a lista de movimiento -------------------
function agregarAMovimiento(producto) {
  try {
    let lista = JSON.parse(localStorage.getItem("movimientoMaterial")) || [];
    if (!lista.some(item => item.codigo === producto.codigo)) {
      lista.push(producto);
      localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
      alert("Producto agregado a movimiento");
    } else {
      alert("Este producto ya está en la lista de movimiento");
    }
  } catch (e) {
    console.error("agregarAMovimiento error:", e);
    alert("Error agregando producto (revisa consola)");
  }
}

// ------------------- Búsqueda -------------------
if (searchInput) {
  searchInput.addEventListener("keyup", async () => {
    const search = searchInput.value.trim().toLowerCase();

    if (search === "") {
      loadProducts();
      return;
    }

    if (!supabase) return;

    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .limit(500);

    if (error) {
      console.error("Error en búsqueda:", error);
      return;
    }

    const filtered = (data || []).filter((p) => {
      const codigo = String(p["CODIGO"] ?? p.codigo ?? "").toLowerCase();
      const desc = String(p["DESCRIPCION"] ?? p.descripcion ?? "").toLowerCase();
      return codigo.includes(search) || desc.includes(search);
    });

    renderTable(filtered);
  });
}

// ------------------- Inicializar + Realtime -------------------
loadProducts();

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
          console.log("🔄 Cambio detectado:", payload);
          loadProducts();
        }
      )
      .subscribe();
  } catch (err) {
    console.warn("No se pudo crear canal realtime:", err);
  }
}

// Usar el botón que ya está en el HTML (si existe)
const verBtn = document.getElementById("verMovimientoBtn");
if (verBtn) {
  verBtn.addEventListener("click", () => {
    window.location.href = "movimientomaterial.html";
  });
}
// ------------------- SISTEMA DE ALERTAS PERSONALIZADAS -------------------
function showCustomAlert(message, type = 'success') {
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    
    // Crear alerta
    const alert = document.createElement('div');
    alert.className = `custom-alert ${type}`;
    
    alert.innerHTML = `
        <div class="custom-alert-message">${message}</div>
        <button class="custom-alert-close">Aceptar</button>
    `;
    
    // Agregar al DOM
    document.body.appendChild(overlay);
    document.body.appendChild(alert);
    
    // Mostrar con animación
    setTimeout(() => {
        overlay.classList.add('show');
        alert.classList.add('show');
    }, 10);
    
    // Configurar botón de cerrar
    const closeBtn = alert.querySelector('.custom-alert-close');
    closeBtn.addEventListener('click', () => {
        hideCustomAlert(alert, overlay);
    });
    
    // Cerrar al hacer clic en el overlay
    overlay.addEventListener('click', () => {
        hideCustomAlert(alert, overlay);
    });
    
    // Cerrar automáticamente después de 3 segundos
    setTimeout(() => {
        if (document.body.contains(alert)) {
            hideCustomAlert(alert, overlay);
        }
    }, 3000);
}

function hideCustomAlert(alert, overlay) {
    alert.classList.remove('show');
    alert.classList.add('hide');
    overlay.classList.remove('show');
    
    setTimeout(() => {
        if (document.body.contains(alert)) {
            document.body.removeChild(alert);
        }
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    }, 400);
}

// ------------------- MODIFICAR LA FUNCIÓN agregarAMovimiento -------------------
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
        console.error("agregarAMovimiento error:", e);
        showCustomAlert("❌ Error agregando producto", "error");
    }
}