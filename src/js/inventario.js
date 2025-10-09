// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ------------------- Selectores DOM (si existen) -------------------
// --- Referencias DOM (una única vez, sin duplicados) ---
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
let PRODUCTOS_COLUMN_MAP = null; // map: normalizedKey -> realColumnName

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

// ---------------- Helpers para detección de columnas reales ----------------
async function ensureProductosColumnMap() {
  if (PRODUCTOS_COLUMN_MAP) return PRODUCTOS_COLUMN_MAP;
  PRODUCTOS_COLUMN_MAP = {};
  if (!supabase) return PRODUCTOS_COLUMN_MAP;
  try {
    // traer una fila (si existe) para leer las keys reales
    const { data, error } = await supabase.from("productos").select("*").limit(1).maybeSingle();
    if (error) {
      console.warn("ensureProductosColumnMap: error fetching sample row:", error);
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

function getRealColForName(preferredName) {
  if (!PRODUCTOS_COLUMN_MAP) return null;
  const norm = normalizeKeyName(preferredName);
  return PRODUCTOS_COLUMN_MAP[norm] || null;
}

function getRealColForInventoryLabel(invLabel) {
  if (!PRODUCTOS_COLUMN_MAP) return null;

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
    if (PRODUCTOS_COLUMN_MAP[norm]) return PRODUCTOS_COLUMN_MAP[norm];
  }
  // fallback: primera columna que contenga 'inventario' o 'almacen'
  for (const norm in PRODUCTOS_COLUMN_MAP) {
    if (norm.includes("inventario") || norm.includes("almacen")) return PRODUCTOS_COLUMN_MAP[norm];
  }
  return null;
}

// ------------------- Helpers para 'salidas pendientes' en localStorage -------------------
function getPendingSalidas() {
  try {
    const raw = localStorage.getItem("salidas_pendientes");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingSalidas(list) {
  localStorage.setItem("salidas_pendientes", JSON.stringify(list));
}

function addPendingSalida(pendiente) {
  const list = getPendingSalidas();
  // Si ya existe el mismo código+origen+responsable, sumar cantidades en vez de duplicar
  const idx = list.findIndex(
    (s) =>
      s.CODIGO === pendiente.CODIGO &&
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
  localStorage.removeItem("salidas_pendientes");
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
      <td>${s.ICONO_COLOR} ${escapeHtml(s.CODIGO)}</td>
      <td>${escapeHtml(s.DESCRIPCION)}</td>
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
async function fetchStockForProduct(codigo, inventoryCol) {
  try {
    if (!supabase) return null;
    await ensureProductosColumnMap();

    const { data: prodRow, error } = await supabase
      .from("productos")
      .select("*")
      .eq("CODIGO", codigo)
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
    <h3 class="modal-title" style="margin:0 0 8px 0">Salida: ${escapeHtml(producto.CODIGO)} — ${escapeHtml(producto.DESCRIPCION || "")}</h3>

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
        CODIGO: producto.CODIGO,
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
        CODIGO: producto.CODIGO,
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
          .from('productos')
          .select('*')
          .eq('CODIGO', producto.CODIGO)
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

/* ------------------ Botón / Modal para "Buscar Entradas por Código" ------------------ */
(function initEntradaLookupFeature() {
  // crear botón y colocarlo junto a btnOpenModal si existe
  const wrap = document.createElement("span");
  wrap.style.marginLeft = "8px";
  const btnEntradaLookup = document.createElement("button");
  btnEntradaLookup.id = "btnEntradaLookup";
  btnEntradaLookup.className = "btn-secondary";
  btnEntradaLookup.textContent = "📥Entradas";
  wrap.appendChild(btnEntradaLookup);
  if (btnOpenModal && btnOpenModal.parentNode) btnOpenModal.parentNode.insertBefore(wrap, btnOpenModal.nextSibling);

  btnEntradaLookup.addEventListener("click", () => openEntradaLookupModal());
})();


/* Modal dinámico para buscar entradas */
/* Modal dinámico para buscar entradas por código - VERSIÓN SIMPLIFICADA */
async function openEntradaLookupModal(prefillCodigo = "") {
  const existing = document.getElementById("entradaLookupOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "entradaLookupOverlay";
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.45)", zIndex: "11000",
  });

  const modal = document.createElement("div");
  modal.className = "entrada-lookup-modal";
  Object.assign(modal.style, {
    width: "720px", maxWidth: "96%", background: "#fff", borderRadius: "8px", padding: "16px",
    boxShadow: "0 12px 36px rgba(0,0,0,0.28)", fontFamily: "'Quicksand', sans-serif", color: "#111",
  });

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0">Buscar entradas por código</h3>
      <button id="entradaCloseBtn" aria-label="Cerrar" style="background:transparent;border:none;font-size:18px;cursor:pointer">✕</button>
    </div>

    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <input id="entradaCodigoInput" placeholder="Escribe el código (ej: 12345)" value="${escapeHtml(prefillCodigo)}" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px" />
      <button id="entradaBuscarBtn" class="btn-primary">Buscar</button>
      <button id="entradaRegistrarBtn" class="btn-secondary">Registrar entrada</button>
    </div>

    <div id="entradaInfo" style="margin-bottom:10px;font-size:13px;color:#333"></div>

    <div id="entradaSummary" style="margin-bottom:10px"></div>

    <div id="entradaListWrap" style="max-height:320px;overflow:auto;border-top:1px solid #f1f1f1;padding-top:8px"></div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
      <button id="entradaCerrarFooter" class="btn-cancel">Cerrar</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const codigoInput = modal.querySelector("#entradaCodigoInput");
  const buscarBtn = modal.querySelector("#entradaBuscarBtn");
  const registrarBtn = modal.querySelector("#entradaRegistrarBtn");
  const closeBtn = modal.querySelector("#entradaCloseBtn");
  const cerrarFooter = modal.querySelector("#entradaCerrarFooter");
  const infoDiv = modal.querySelector("#entradaInfo");
  const listWrap = modal.querySelector("#entradaListWrap");
  const summaryDiv = modal.querySelector("#entradaSummary");

  // Buscar en tabla entradas específica
  async function fetchEntradasTable(codigo) {
    if (!supabase) return { data: null, error: "Supabase no inicializado" };

    try {
      const codigoNum = parseInt(codigo);
      if (isNaN(codigoNum)) {
        return { data: [], error: null };
      }

      const { data, error } = await supabase
        .from('entradas')
        .select("*")
        .eq("codigo", codigoNum)
        .order("fecha", { ascending: false })
        .limit(500);

      if (error) {
        console.error("Error fetching entradas:", error);
        return { data: null, error };
      }

      return { data: data || [], error: null };
    } catch (e) {
      console.error("Exception fetching entradas:", e);
      return { data: null, error: e };
    }
  }

  // función para renderizar resultados - SIMPLIFICADA
  async function buscarYRenderizar() {
    const codigo = String(codigoInput.value || "").trim();
    if (!codigo) {
      showToast("Escribe un código para buscar", false);
      codigoInput.focus();
      return;
    }

    infoDiv.textContent = "Buscando producto y entradas...";
    listWrap.innerHTML = "";
    summaryDiv.innerHTML = "";

    // 1) obtener producto (si existe)
    let productoRow = null;
    try {
      if (supabase) {
        await ensureProductosColumnMap();
        const { data: prod, error: prodErr } = await supabase.from("productos").select("*").eq("CODIGO", codigo).maybeSingle();
        if (!prodErr && prod) productoRow = prod;
      }
    } catch (e) { /* noop */ }

    if (productoRow) {
      const i069 = getStockFromProduct(productoRow, 'I069');
      const i078 = getStockFromProduct(productoRow, 'I078');
      const i07f = getStockFromProduct(productoRow, 'I07F');
      const i312 = getStockFromProduct(productoRow, 'I312');
      const i073 = getStockFromProduct(productoRow, 'I073');
      const total = i069 + i078 + i07f + i312 + i073;
      infoDiv.innerHTML = `<strong>${escapeHtml(productoRow.CODIGO)}</strong> — ${escapeHtml(productoRow.DESCRIPCION || "")} — Total inventarios: ${total}`;
    } else {
      infoDiv.innerHTML = `Producto <strong>${escapeHtml(codigo)}</strong> no encontrado en tabla <code>productos</code>.`;
    }

    // 2) buscar entradas en tabla entradas
    const { data, error } = await fetchEntradasTable(codigo);

    if (error) {
      listWrap.innerHTML = `<div style="color:#dc2626">Error al buscar entradas: ${escapeHtml(error.message)}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      listWrap.innerHTML = `<div style="color:#6b7280">No hay entradas registradas para el código ${escapeHtml(codigo)}.</div>`;
      return;
    }

    // construir resumen SIMPLIFICADO
    let totalQty = 0;
    const rows = data.map(r => {
      const qty = Number(r.cantidad || 0);
      totalQty += qty;

      return {
        raw: r,
        qty: qty,
        fecha: r.fecha || "",
        responsable: r.responsable || ""
      };
    });

    // SOLO mostrar la información esencial
    summaryDiv.innerHTML = `<div style="font-size:13px;color:#111;margin-bottom:6px">Cantidad total registrada en estas entradas: <strong>${totalQty}</strong></div>`;

    // lista detallada SIMPLIFICADA
    const tableEl = document.createElement("table");
    tableEl.style.width = "100%";
    tableEl.style.borderCollapse = "collapse";
    tableEl.innerHTML = `
      <thead>
        <tr style="text-align:left;font-size:13px;color:#374151">
          <th style="padding:6px 8px;border-bottom:1px solid #eee">Fecha</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">Cantidad</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">I069</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">I078</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">I07F</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">I312</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">I073</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">Responsable</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = tableEl.querySelector("tbody");

    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(formatDate(r.fecha))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.raw.cantidad || 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.raw.i069 || 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.raw.i078 || 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.raw.i07f || 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.raw.i312 || 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.raw.i073 || 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(r.responsable)}</td>
      `;
      tbody.appendChild(tr);
    });

    listWrap.innerHTML = "";
    listWrap.appendChild(tableEl);
  }

  // Helper para formatear fecha
  function formatDate(dateString) {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES');
    } catch (e) {
      return String(dateString).slice(0, 10);
    }
  }

  // Registrar nueva entrada - MANTENIENDO LA FUNCIONALIDAD COMPLETA
  async function abrirRegistrarEntrada() {
    const codigo = String(codigoInput.value || "").trim();
    if (!codigo) { 
      showToast("Escribe un código antes de registrar", false); 
      codigoInput.focus(); 
      return; 
    }

    const formHtml = document.createElement("div");
    formHtml.style.border = "1px dashed #e5e7eb";
    formHtml.style.padding = "8px";
    formHtml.style.marginBottom = "10px";
    formHtml.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:8px;align-items:center">
          <strong style="min-width:160px">Agregar por inventario (acepta decimales)</strong>
          <small style="color:#6b7280">Usa punto (.) para decimales. Ej: 12.5</small>
        </div>

        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
          <input id="in_i069" type="number" min="0" step="0.001" placeholder="I069" class="input-text" />
          <input id="in_i078" type="number" min="0" step="0.001" placeholder="I078" class="input-text" />
          <input id="in_i07f" type="number" min="0" step="0.001" placeholder="I07F" class="input-text" />
          <input id="in_i312" type="number" min="0" step="0.001" placeholder="I312" class="input-text" />
          <input id="in_i073" type="number" min="0" step="0.001" placeholder="I073" class="input-text" />
        </div>

        <div style="display:flex;gap:8px;align-items:center">
          <div style="flex:1">
            <label style="font-size:13px;color:#374151">Responsable</label>
            <input id="entradaResponsable" type="text" class="input-text" />
          </div>
          <div style="width:160px">
            <label style="font-size:13px;color:#374151">Total a agregar</label>
            <input id="entradaTotal" type="text" readonly class="input-text readonly" />
          </div>
        </div>

        <div style="display:flex;gap:8px">
          <input id="entradaNota" placeholder="Nota (opcional)" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px" />
          <button id="entradaDo" class="btn-primary">Registrar entrada</button>
          <button id="entradaCancel" class="btn-cancel">Cancelar</button>
        </div>
      </div>
    `;
    summaryDiv.parentNode.insertBefore(formHtml, summaryDiv.nextSibling);

    const i069 = formHtml.querySelector("#in_i069");
    const i078 = formHtml.querySelector("#in_i078");
    const i07f = formHtml.querySelector("#in_i07f");
    const i312 = formHtml.querySelector("#in_i312");
    const i073 = formHtml.querySelector("#in_i073");
    const totalField = formHtml.querySelector("#entradaTotal");
    const responsableField = formHtml.querySelector("#entradaResponsable");
    const notaField = formHtml.querySelector("#entradaNota");
    const doBtn = formHtml.querySelector("#entradaDo");
    const cancelBtn = formHtml.querySelector("#entradaCancel");

    // Auto-completar responsable
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      if (user && user.email) {
        responsableField.value = user.email;
      } else {
        responsableField.value = CURRENT_USER_FULLNAME || "";
      }
    } catch (e) { 
      responsableField.value = CURRENT_USER_FULLNAME || ""; 
    }

    function parseInputQtyFloat(el) {
      if (!el) return 0;
      const sRaw = String(el.value || "0").trim();
      if (sRaw === "") return 0;
      
      let s = sRaw.replace(/,/g, '.');
      s = s.replace(/\s+/g, '');
      
      const n = Number(s);
      return Number.isNaN(n) ? 0 : n;
    }

    function computeTotal() {
      const a = parseInputQtyFloat(i069);
      const b = parseInputQtyFloat(i078);
      const c = parseInputQtyFloat(i07f);
      const d = parseInputQtyFloat(i312);
      const e = parseInputQtyFloat(i073);
      const total = a + b + c + d + e;
      return Number.isFinite(total) ? total : 0;
    }

    // Actualizar total en tiempo real
    [i069, i078, i07f, i312, i073].forEach(inp => {
      inp.addEventListener("input", () => {
        const total = computeTotal();
        totalField.value = total.toFixed(3);
      });
    });

    // Inicializar total
    totalField.value = "0.000";

    // Cancelar
    cancelBtn.addEventListener("click", () => {
      formHtml.remove();
    });

    doBtn.addEventListener("click", async () => {
      doBtn.disabled = true;
      doBtn.textContent = "Registrando...";

      try {
        const codigoVal = String(codigo || "").trim();
        if (!codigoVal) { 
          showToast("Código inválido", false); 
          doBtn.disabled = false; 
          doBtn.textContent = "Registrar entrada";
          return; 
        }

        const codigoNum = parseInt(codigoVal);
        if (isNaN(codigoNum)) {
          showToast("Código debe ser un número", false);
          doBtn.disabled = false;
          doBtn.textContent = "Registrar entrada";
          return;
        }

        // Leer cantidades ingresadas
        const q069 = parseInputQtyFloat(i069);
        const q078 = parseInputQtyFloat(i078);
        const q07f = parseInputQtyFloat(i07f);
        const q312 = parseInputQtyFloat(i312);
        const q073 = parseInputQtyFloat(i073);

        const total = q069 + q078 + q07f + q312 + q073;
        if (total <= 0) { 
          showToast("Ingresa al menos una cantidad mayor a 0", false); 
          doBtn.disabled = false; 
          doBtn.textContent = "Registrar entrada";
          return; 
        }

        // Preparar datos para insertar
        const entradaData = {
          codigo: codigoNum,
          cantidad: total,
          i069: q069,
          i078: q078,
          i07f: q07f,
          i312: q312,
          i073: q073,
          responsable: responsableField.value || CURRENT_USER_FULLNAME || "Sistema",
          fecha: new Date().toISOString().split('T')[0]
        };

        // Insertar en tabla entradas
        const { data, error } = await supabase
          .from("entradas")
          .insert([entradaData])
          .select();

        if (error) {
          console.error("Error detallado de Supabase:", error);
          throw new Error(`Error al insertar: ${error.message}`);
        }

        // Actualizar también el producto
        await actualizarProductoConEntradas(codigoVal, q069, q078, q07f, q312, q073);

        showToast("✅ Entrada registrada correctamente", true);

        // Actualizar UI
        await buscarYRenderizar();
        formHtml.remove();

      } catch (err) {
        console.error("Error registrando entradas:", err);
        showToast(`❌ Error: ${err.message}`, false);
      } finally {
        doBtn.disabled = false;
        doBtn.textContent = "Registrar entrada";
      }
    });
  }

  // Función para actualizar el producto con las nuevas entradas
  async function actualizarProductoConEntradas(codigo, q069, q078, q07f, q312, q073) {
    try {
      await ensureProductosColumnMap?.();

      const realCodigoCol = getRealColForName?.('codigo') || getRealColForName?.('CODIGO') || 'CODIGO';
      
      const { data: prodRow, error: selErr } = await supabase
        .from("productos")
        .select("*")
        .eq(realCodigoCol, codigo)
        .maybeSingle();

      if (selErr || !prodRow) {
        console.warn("No se pudo obtener el producto para actualizar:", selErr);
        return;
      }

      const colI069 = detectRealColLabel(prodRow, 'I069') || 'INVENTARIO I069';
      const colI078 = detectRealColLabel(prodRow, 'I078') || 'INVENTARIO I078';
      const colI07F = detectRealColLabel(prodRow, 'I07F') || 'INVENTARIO I07F';
      const colI312 = detectRealColLabel(prodRow, 'I312') || 'INVENTARIO I312';
      const colI073 = detectRealColLabel(prodRow, 'I073') || 'INVENTARIO I073';

      const updObj = {};
      updObj[colI069] = (Number(prodRow[colI069] || 0) + q069);
      updObj[colI078] = (Number(prodRow[colI078] || 0) + q078);
      updObj[colI07F] = (Number(prodRow[colI07F] || 0) + q07f);
      updObj[colI312] = (Number(prodRow[colI312] || 0) + q312);
      updObj[colI073] = (Number(prodRow[colI073] || 0) + q073);

      const { error: updErr } = await supabase
        .from('productos')
        .update(updObj)
        .eq(realCodigoCol, codigo);

      if (updErr) {
        console.warn("Error actualizando producto:", updErr);
      }

    } catch (error) {
      console.error("Error en actualizarProductoConEntradas:", error);
    }
  }

  // Helper para detectar columnas reales
  function detectRealColLabel(prodRow, label) {
    if (!prodRow) return null;
    if (typeof getRealColForInventoryLabel === "function") {
      const r = getRealColForInventoryLabel(label);
      if (r) return r;
    }
    const variants = [
      `INVENTARIO ${label}`,
      `inventario_${label.toLowerCase()}`,
      label,
      label.toLowerCase(),
      `INVENTARIO ${label.toUpperCase()}`
    ];
    const keys = Object.keys(prodRow || {});
    for (const v of variants) {
      const found = keys.find(k => String(k).toLowerCase() === String(v).toLowerCase());
      if (found) return found;
    }
    for (const k of keys) if (new RegExp(label, "i").test(k)) return k;
    return null;
  }

  // listeners
  buscarBtn.addEventListener("click", buscarYRenderizar);
  codigoInput.addEventListener("keyup", (ev) => { if (ev.key === "Enter") buscarYRenderizar(); });
  registrarBtn.addEventListener("click", abrirRegistrarEntrada);
  closeBtn.addEventListener("click", () => overlay.remove());
  cerrarFooter.addEventListener("click", () => overlay.remove());

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  setTimeout(() => codigoInput.focus(), 50);

  if (prefillCodigo) buscarYRenderizar();
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
    tablaPendientesBody.innerHTML = `<tr><td colspan="9" class="empty-note">No hay salidas pendientes</td></tr>`;
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
      <td class="col-code">${escapeHtml(item.CODIGO)}</td>
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
        const fetched = await fetchStockForProduct(item.CODIGO, chosen);
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
      const fetched = await fetchStockForProduct(list[idx].CODIGO, newInv);
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
    const tdCodigo = document.createElement("td");
    tdCodigo.textContent = p["CODIGO"] ?? "";

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
const btnDelete = createBtn("btn-delete", "🗑️", "Eliminar", () => eliminarProducto(p["CODIGO"]));
const btnSalida = createBtn("btn-salida", "📦", "Salida", () => openSalidaModal(p));

// agrega los botones (en una sola fila — el gap lo controla CSS)
tdAcciones.appendChild(btnEdit);
tdAcciones.appendChild(btnDelete);
tdAcciones.appendChild(btnSalida);

// Agregar a la fila
row.appendChild(tdCodigo);
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
  editingCodigo = producto?.CODIGO ?? producto?.codigo ?? null;

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

  // Rellenar SOLO código, descripción y UM
  setVal('codigo', producto?.CODIGO ?? producto?.codigo ?? "");
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

  // En modo EDICIÓN: BLOQUEAR código y UM, solo dejar descripción editable
  const camposBloquear = ['codigo', 'um'];
  
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
async function eliminarProducto(codigo) {
  if (!supabase) {
    showToast("Supabase no está inicializado", false);
    return;
  }

  showConfirm(`⚠ ¿Seguro que deseas eliminar el producto con código ${codigo}?`, async () => {
    const { error } = await supabase
      .from("productos")
      .delete()
      .eq("CODIGO", codigo);

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
    
    // En modo NUEVO: Mostrar solo código, descripción y UM
    const camposMostrar = ['codigo', 'descripcion', 'um'];
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
    
    // Enfocar el campo código
    const codigoField = productForm.querySelector('[name="codigo"]');
    if (codigoField) {
      setTimeout(() => codigoField.focus(), 100);
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
      await ensureProductosColumnMap?.();

      const realCodigoCol = getRealColForName?.('CODIGO') || getRealColForName?.('codigo') || 'CODIGO';
      const realDescCol   = getRealColForName?.('DESCRIPCION') || getRealColForName?.('descripcion') || 'DESCRIPCION';

      if (!editingCodigo) {
        showToast("Código del producto no definido. No se puede actualizar.", false);
        return;
      }

      // pedimos select() para confirmar que la fila fue devuelta
      const resp = await supabase
        .from('productos')
        .update({ [realDescCol]: nuevaDesc })
        .eq(realCodigoCol, editingCodigo)
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

    await ensureProductosColumnMap?.();

    const formData = new FormData(productForm);
    const raw = Object.fromEntries(formData.entries());

    // Validar campos obligatorios
    const codigo = (raw['codigo'] || "").trim();
    const descripcion = (raw['descripcion'] || "").trim();
    const um = (raw['um'] || "").trim();

    if (!codigo) {
      showToast("El código es obligatorio", false);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalBtnText; }
      return;
    }

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

    mapCampo('CODIGO', codigo);
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
    const resp = await supabase.from('productos').insert([insertObj]).select().limit(1).maybeSingle();
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
      // Si es error de duplicado
      if (error?.code === '23505') {
        showToast("❌ Ya existe un producto con ese código", false);
      } else {
        showToast("❌ Error al crear producto", false);
      }
    }

  } catch (err) {
    console.error("Error creando producto (capturado):", err);
    showToast("❌ Error al crear producto", false);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalBtnText; }
  }
});

// ------------------- Refresh global: normalizar inventarios y recalcular almacen -------------------
async function refreshAllInventarios({ confirmBefore = true, truncateDecimals = true } = {}) {
  // confirmación simple para evitar ejecuciones accidentales
  if (confirmBefore) {
    const ok = window.confirm("Esto actualizará TODOS los productos: normalizará inventarios y recalculará INVENTARIO FÍSICO EN ALMACÉN. ¿Continuar?");
    if (!ok) return;
  }

  if (!supabase) {
    showToast("Supabase no inicializado", false);
    return;
  }

  const btn = document.getElementById('btnRefresh');
  if (btn) { btn.disabled = true; btn.dataset._origText = btn.textContent; btn.textContent = "Actualizando..."; }

  showToast("Iniciando refresco de inventarios...");

  try {
    await ensureProductosColumnMap?.();

    // Traer todos los productos (ajusta limit si tu tabla es muy grande)
    const { data: productos, error: fetchErr } = await supabase.from('productos').select('*');
    if (fetchErr) throw fetchErr;
    if (!Array.isArray(productos) || productos.length === 0) {
      showToast("No hay productos para procesar", false);
      return;
    }

    const realCodigoCol = getRealColForName?.('CODIGO') || getRealColForName?.('codigo') || 'CODIGO';
    const realAlmacenCol = getRealColForInventoryLabel?.('ALMACEN') || 'INVENTARIO FISICO EN ALMACEN';

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // helper local para detectar columna real (por si getRealColFor... no encontró)
    const detectRealCol = (prodRow, label) => {
      const r = getRealColForInventoryLabel?.(label);
      if (r) return r;
      // heurístico sencillo
      const variants = [
        `INVENTARIO ${label}`,
        `inventario_${label.toLowerCase()}`,
        label,
        label.toLowerCase(),
        `I${label}` // por si usan I069 etc
      ];
      const keys = Object.keys(prodRow || {});
      for (const v of variants) {
        const found = keys.find(k => String(k).toLowerCase() === String(v).toLowerCase());
        if (found) return found;
      }
      // fallback: buscar primera key que contenga label
      for (const k of keys) if (new RegExp(label, "i").test(k)) return k;
      return null;
    };

    // función para convertir valores a entero seguro
    const normalizeToInt = (val) => {
      if (val === null || val === undefined || val === "") return 0;
      // si ya es número entero
      if (typeof val === 'number' && Number.isInteger(val)) return val;
      // intentar parsear como número
      const n = Number(String(val).replace(/,/g, ".").trim());
      if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
      // si pide truncar decimales -> floor, sino round
      return truncateDecimals ? Math.floor(n) : Math.round(n);
    };

    // procesar productos uno por uno (puedes paralelizar si necesitas más throughput)
    for (const prod of productos) {
      try {
        // detectar columnas reales para este producto
        const colI069 = detectRealCol(prod, 'I069') || detectRealCol(prod, '069') || 'INVENTARIO I069';
        const colI078 = detectRealCol(prod, 'I078') || detectRealCol(prod, '078') || 'INVENTARIO I078';
        const colI07F = detectRealCol(prod, 'I07F') || detectRealCol(prod, '07F') || 'INVENTARIO I07F';
        const colI312 = detectRealCol(prod, 'I312') || detectRealCol(prod, '312') || 'INVENTARIO I312';
        const colI073 = detectRealCol(prod, 'I073') || detectRealCol(prod, '073') || 'INVENTARIO I073';

        // leer valores actuales (sin alterar el objeto original)
        const rawI069 = prod[colI069];
        const rawI078 = prod[colI078];
        const rawI07F = prod[colI07F];
        const rawI312 = prod[colI312];
        const rawI073 = prod[colI073];

        // normalizar a enteros
        const newI069 = normalizeToInt(rawI069);
        const newI078 = normalizeToInt(rawI078);
        const newI07F = normalizeToInt(rawI07F);
        const newI312 = normalizeToInt(rawI312);
        const newI073 = normalizeToInt(rawI073);

        const newAlmacen = (newI069 + newI078 + newI07F + newI312 + newI073);

        // construir objeto de update solo si hay cambios
        const upd = {};
        // sólo asignar si la columna existe en la fila
        if (colI069 && String(prod[colI069]) !== String(newI069)) upd[colI069] = newI069;
        if (colI078 && String(prod[colI078]) !== String(newI078)) upd[colI078] = newI078;
        if (colI07F && String(prod[colI07F]) !== String(newI07F)) upd[colI07F] = newI07F;
        if (colI312 && String(prod[colI312]) !== String(newI312)) upd[colI312] = newI312;
        if (colI073 && String(prod[colI073]) !== String(newI073)) upd[colI073] = newI073;

        // asignar almacen si difiere
        const existingAlmVal = prod[realAlmacenCol];
        if (realAlmacenCol && String(existingAlmVal) !== String(newAlmacen)) upd[realAlmacenCol] = newAlmacen;

        if (Object.keys(upd).length === 0) {
          skippedCount++;
          continue;
        }

        // ejecutar update por fila (usamos la columna CODIGO como identificador)
        const codigoVal = prod[realCodigoCol] ?? prod['CODIGO'] ?? prod['codigo'];
        if (!codigoVal) {
          console.warn("Fila sin CODIGO detectada, se salta:", prod);
          skippedCount++;
          continue;
        }

        const { error: updErr } = await supabase.from('productos').update(upd).eq(realCodigoCol, codigoVal);
        if (updErr) {
          console.error("Error actualizando producto", codigoVal, updErr);
          errorCount++;
        } else {
          updatedCount++;
        }
      } catch (rowErr) {
        console.error("Error procesando fila durante refresh:", rowErr, prod);
        errorCount++;
      }
    } // end for

    // refrescar UI
    try { await loadProducts(); } catch(e) { /* noop */ }

    showToast(`Refresh completado: actualizados ${updatedCount}, sin cambios ${skippedCount}, errores ${errorCount}`, true);
  } catch (err) {
    console.error("Error en refreshAllInventarios:", err);
    showToast("Error al refrescar inventarios (ver consola)", false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset._origText || "Refresh"; delete btn.dataset._origText; }
  }
}

// --- conectar al botón de refresco si existe ---
const btnRefreshEl = document.getElementById('btnRefresh');
if (btnRefreshEl) btnRefreshEl.addEventListener('click', () => refreshAllInventarios({ confirmBefore: true, truncateDecimals: true }));

// ------------------- Filtro de búsqueda -------------------
// ------------------- BÚSQUEDA CLIENTE ROBUSTA - VERSIÓN MEJORADA -------------------
let allProducts = null;

function debounce(fn, delay = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, ""); // Solo mantener letras y números
}

// Helper mejorado: prueba varias claves posibles
function getFieldValue(item, keys) {
  if (!item) return "";
  
  for (const k of keys) {
    // Verificar si la clave existe y tiene valor
    if (item[k] != null && item[k] !== "") {
      const value = item[k];
      // Convertir a string y limpiar
      return String(value).trim();
    }
  }
  return "";
}

// Función mejorada para cargar productos
async function fetchAllProductsFromServer() {
  if (!supabase) {
    console.error("Supabase no inicializado");
    return [];
  }
  
  try {
    console.log("🔄 Cargando productos desde Supabase...");
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .order("CODIGO", { ascending: true });

    if (error) {
      console.error("❌ Error al cargar productos:", error);
      showToast("Error al cargar productos", false);
      return [];
    }
    
    console.log(`✅ ${data?.length || 0} productos cargados exitosamente`);
    
    // Debug: verificar si el producto 4501 está en los datos
    if (data) {
      const producto4501 = data.find(p => 
        String(p.CODIGO).trim() === "4501" || 
        String(p.codigo).trim() === "4501"
      );
      if (producto4501) {
        console.log("🔍 Producto 4501 encontrado en datos:", producto4501);
      } else {
        console.warn("⚠️ Producto 4501 NO encontrado en los datos cargados");
        // Listar algunos códigos para debug
        const primerosCodigos = data.slice(0, 5).map(p => p.CODIGO || p.codigo);
        console.log("Primeros códigos cargados:", primerosCodigos);
      }
    }
    
    return data || [];
  } catch (e) {
    console.error("❌ Excepción al cargar productos:", e);
    return [];
  }
}

// Función de búsqueda mejorada
if (searchInput) {
  const handleSearch = debounce(async () => {
    const raw = String(searchInput.value || "");
    const q = raw.trim();

    console.log(`🔍 Buscando: "${q}"`);

    // Si está vacío, mostrar todos los productos
    if (q === "") {
      try {
        if (allProducts === null) {
          allProducts = await fetchAllProductsFromServer();
        }
        renderTable(allProducts);
        console.log(`📋 Mostrando todos los ${allProducts.length} productos`);
      } catch (e) {
        console.error("Error mostrando todos los productos:", e);
        renderTable([]);
      }
      return;
    }

    // Asegurar que tenemos datos
    try {
      if (allProducts === null) {
        allProducts = await fetchAllProductsFromServer();
      }
    } catch (e) {
      console.error("No se pudieron cargar productos para búsqueda:", e);
      renderTable([]);
      return;
    }

    if (!allProducts || allProducts.length === 0) {
      console.warn("⚠️ No hay productos para buscar");
      renderTable([]);
      return;
    }

    const tokens = q
      .split(/\s+/)
      .map((t) => normalizeText(t))
      .filter(Boolean);

    console.log("Tokens de búsqueda:", tokens);

    // Columnas ampliadas para búsqueda
    const codigoKeys = ["CODIGO", "codigo", "Codigo", "CÓDIGO", "código", "Código", "CODE", "code"];
    const descKeys = ["DESCRIPCION", "descripcion", "Descripcion", "DESCRIPCIÓN", "descripción", "Descripción", "DESC", "desc", "descripcion_producto", "producto"];

    const filtered = allProducts.filter((p) => {
      const rawCodigo = getFieldValue(p, codigoKeys);
      const rawDesc = getFieldValue(p, descKeys);

      // Normalizar ambos campos por separado
      const normalizedCodigo = normalizeText(rawCodigo);
      const normalizedDesc = normalizeText(rawDesc);

      // Buscar en código Y descripción por separado
      const matchCodigo = tokens.every(tk => normalizedCodigo.includes(tk));
      const matchDesc = tokens.every(tk => normalizedDesc.includes(tk));

      // También buscar en el texto combinado como fallback
      const combined = normalizedCodigo + " " + normalizedDesc;
      const matchCombined = tokens.every(tk => combined.includes(tk));

      const matches = matchCodigo || matchDesc || matchCombined;

      // Debug para el producto 4501
      if (rawCodigo === "4501" || rawCodigo === "4501") {
        console.log("🔍 Debug producto 4501:", {
          rawCodigo,
          rawDesc,
          normalizedCodigo,
          normalizedDesc,
          tokens,
          matchCodigo,
          matchDesc,
          matchCombined,
          matches
        });
      }

      return matches;
    });

    console.log(`✅ Búsqueda: "${q}" -> ${filtered.length} resultados`);
    
    // Debug: verificar si el producto 4501 está en los resultados
    const producto4501EnResultados = filtered.find(p => 
      String(getFieldValue(p, codigoKeys)) === "4501"
    );
    if (producto4501EnResultados) {
      console.log("🎯 Producto 4501 encontrado en resultados de búsqueda");
    } else if (q.includes("4501")) {
      console.warn("⚠️ Producto 4501 NO encontrado en resultados a pesar de buscar por 4501");
    }

    renderTable(filtered);
  }, 150); // Aumenté ligeramente el debounce para mejor rendimiento

  searchInput.addEventListener("input", handleSearch);

  // También buscar al presionar Enter
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  });

  // Precarga de productos al inicio
  (async () => {
    try {
      console.log("🔄 Precargando productos...");
      if (allProducts === null) {
        allProducts = await fetchAllProductsFromServer();
        renderTable(allProducts);
        console.log(`✅ Precarga completada: ${allProducts.length} productos`);
      }
    } catch (e) {
      console.error("❌ Error en precarga:", e);
    }
  })();
}

// Función auxiliar para forzar recarga de productos
window.recargarProductos = async function() {
  console.log("🔄 Forzando recarga de productos...");
  allProducts = null;
  searchInput.value = "";
  await loadProducts();
};

// También mejorar la función loadProducts existente para que sincronice con allProducts
async function loadProducts() {
  if (!supabase) {
    console.error("Supabase no inicializado");
    showToast("Supabase no está inicializado", false);
    return;
  }

  try {
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .order("CODIGO", { ascending: true });

    if (error) {
      console.error("❌ Error al cargar productos:", error);
      showToast("Error al cargar productos", false);
      return;
    }

    // Sincronizar con allProducts
    allProducts = data || [];
    
    await ensureProductosColumnMap();
    renderTable(allProducts);
    updatePendingCount();
    
    console.log(`✅ loadProducts: ${allProducts.length} productos cargados`);
  } catch (ex) {
    console.error("loadProducts exception:", ex);
    showToast("Error cargando productos", false);
  }
}
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
      .from("productos")
      .select("*")
      .order("CODIGO", { ascending: true });

    if (error) {
      console.error("❌ Error al cargar productos:", error);
      showToast("Error al cargar productos", false);
      return;
    }
    

    // inicializar map de columnas para futuras operaciones
    await ensureProductosColumnMap();

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
      .channel("realtime:productos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "productos" },
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
    // en esa página deberás leer localStorage.getItem("salidas_pendientes")
    window.location.href = "salidas.html";
  });
}

// ------------------- Historial desde DB -------------------
async function cargarHistorialSalidas() {
  if (!tablaHistorialBody) return;
  try {
    const { data, error } = await supabase
      .from("salidas")
      .select("*")
      .order("FECHA_SALIDA", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      tablaHistorialBody.innerHTML = `<tr><td colspan="8" class="empty-note">No hay registros de salidas</td></tr>`;
      return;
    }

    tablaHistorialBody.innerHTML = "";
    data.forEach((item) => {
      const codigo = item["CODIGO"] ?? item["CÓDIGO"] ?? "-";
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
        <td>${escapeHtml(String(codigo))}</td>
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

// ------------------- Confirm pending items (mejorado multi-origen y ALMACEN) -------------------
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
      const responsableFinal = ((item.RESPONSABLE_NOMBRE ?? "").trim() || "").length > 0
        ? `${(item.RESPONSABLE_NOMBRE ?? "").trim()} ${(item.RESPONSABLE_APELLIDO ?? "").trim()}`.trim()
        : (item.RESPONSABLE && String(item.RESPONSABLE).trim()) || (CURRENT_USER_FULLNAME || "Usuario");

      const observacionesFinal = item.OBSERVACIONES ?? "";
      const destinatarioFinal = item.DESTINATARIO ?? "";

      // si es multi-origen (ORIGENES array) lo procesamos por cada origen
      const origenesToProcess = Array.isArray(item.ORIGENES) ? item.ORIGENES.map(o => ({
        INVENTARIO_ORIGEN: o.INVENTARIO_ORIGEN,
        CANTIDAD: parseInt(o.CANTIDAD, 10) || 0,
        AVAILABLE: o.AVAILABLE ?? null
      })) : [{
        INVENTARIO_ORIGEN: item.INVENTARIO_ORIGEN,
        CANTIDAD: parseInt(item.CANTIDAD, 10) || 0,
        AVAILABLE: item.AVAILABLE ?? null
      }];

      // validar sumatoria si venía multi-origen y el total no coincide
      if (Array.isArray(item.ORIGENES) && item.CANTIDAD) {
        const sum = origenesToProcess.reduce((s,o) => s + (o.CANTIDAD || 0), 0);
        if (sum !== parseInt(item.CANTIDAD, 10)) {
          throw new Error(`Suma de orígenes (${sum}) no coincide con total (${item.CANTIDAD})`);
        }
      }

      // procesar cada origen por separado
      for (const origin of origenesToProcess) {
        // validación contra snapshot AVAILABLE (si existe)
        const availableSnapshot = parseInt(origin.AVAILABLE || 0, 10);
        if (availableSnapshot > 0 && origin.CANTIDAD > availableSnapshot) {
          throw new Error(`Cantidad (${origin.CANTIDAD}) mayor que stock disponible (${availableSnapshot}) en ${origin.INVENTARIO_ORIGEN}`);
        }

        // intentar RPC primero (si tu rutina acepta origen individual)
        const rpcPayload = {
          in_codigo: item.CODIGO,
          in_descripcion: item.DESCRIPCION,
          in_cantidad: origin.CANTIDAD,
          in_responsable: responsableFinal,
          in_origen: origin.INVENTARIO_ORIGEN,
          in_observaciones: observacionesFinal,
          in_destinatario: destinatarioFinal
        };

        const { data: rpcData, error: rpcError } = await supabase.rpc("crear_salida", rpcPayload).catch(err => ({ data: null, error: err }));
        if (rpcError) {
          // fallback: insertar en tabla 'salidas'
          const salidaObj = {
            CODIGO: item.CODIGO,
            DESCRIPCION: item.DESCRIPCION,
            CANTIDAD_SALIDA: origin.CANTIDAD,
            FECHA_SALIDA: new Date().toISOString(),
            RESPONSABLE: responsableFinal,
            DESTINATARIO: destinatarioFinal,
            INVENTARIO_ORIGEN: origin.INVENTARIO_ORIGEN,
            OBSERVACIONES: observacionesFinal
          };
          const { error: errorInsert } = await supabase.from("salidas").insert([salidaObj]);
          if (errorInsert) throw errorInsert;

          // actualizar columna correspondiente en productos restando la cantidad
          await ensureProductosColumnMap();
          const realKey = getRealColForInventoryLabel(origin.INVENTARIO_ORIGEN);
          if (!realKey) throw new Error("No se pudo detectar columna de stock para actualizar: " + origin.INVENTARIO_ORIGEN);

          // leer valor actual y restar
          const { data: prodRow, error: prodErr } = await supabase
            .from("productos")
            .select(realKey)
            .eq("CODIGO", item.CODIGO)
            .maybeSingle();
          if (prodErr) throw prodErr;
          const current = parseInt(prodRow ? (prodRow[realKey] ?? 0) : 0, 10) || 0;
          const nuevo = Math.max(0, current - parseInt(origin.CANTIDAD, 10));
          const upd = {}; upd[realKey] = nuevo;
          const { error: eUpd } = await supabase.from("productos").update(upd).eq("CODIGO", item.CODIGO);
          if (eUpd) throw eUpd;
        }

        // si el RPC tuvo éxito: asumimos que el procedimiento ya actualizó inventarios
      }

      // si llegamos aquí sin excepción, considerar el item procesado con éxito
      successes++;

      // borrar del pending (si existe) usando ADDED_AT como identificador preferido
      const list = getPendingSalidas();
      const idx = list.findIndex(
        (s) =>
          s.CODIGO === item.CODIGO &&
          ((s.ADDED_AT && item.ADDED_AT && s.ADDED_AT === item.ADDED_AT) ||
            (s.INVENTARIO_ORIGEN === item.INVENTARIO_ORIGEN && s.CANTIDAD === item.CANTIDAD))
      );
      if (idx >= 0) { list.splice(idx, 1); savePendingSalidas(list); }
    } catch (err) {
      console.error("Error confirmando pendiente:", item, err);
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

// ------------------- Try to set responsable from usuarios table
async function setResponsableFromAuth() {
  try {
    console.info("setResponsableFromAuth - consultando auth");
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.warn("setResponsableFromAuth - supabase.auth.getUser error:", authErr);
    }
    const user = authData?.user ?? null;

    // 1) si auth trae email, lo usamos inmediatamente
    if (user && user.email) {
      if (typeof responsableField !== "undefined" && responsableField) responsableField.value = user.email;
      console.info("setResponsableFromAuth - email desde auth:", user.email);
      return user.email;
    }

    // 2) si user.id existe, buscar SOLO columnas seguras en tabla usuarios
    if (user && user.id) {
      const { data: uData, error: uErr } = await supabase
        .from('usuarios')
        .select('email,nombre,apellido') // <-- solo columnas seguras
        .eq('id', user.id)
        .maybeSingle();

      if (uErr) {
        console.warn("setResponsableFromAuth - error consultando usuarios:", uErr);
      } else if (uData) {
        const email = uData.email || null;
        const nombreCompleto = `${(uData.nombre||"").trim()} ${(uData.apellido||"").trim()}`.trim();
        if (email) {
          if (typeof responsableField !== "undefined" && responsableField) responsableField.value = email;
          console.info("setResponsableFromAuth - email desde tabla usuarios:", email);
          return email;
        } else if (nombreCompleto) {
          if (typeof responsableField !== "undefined" && responsableField) responsableField.value = nombreCompleto;
          console.info("setResponsableFromAuth - nombre completado desde usuarios:", nombreCompleto);
          return nombreCompleto;
        }
      }
    }

    // 3) fallback
    if (typeof responsableField !== "undefined" && responsableField) responsableField.value = CURRENT_USER_FULLNAME || "";
    return null;
  } catch (ex) {
    console.error("setResponsableFromAuth - excepción:", ex);
    if (typeof responsableField !== "undefined" && responsableField) responsableField.value = CURRENT_USER_FULLNAME || "";
    return null;
  }
}
async function cargarInventario() {
  try {
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .order("codigo", { ascending: true });

    if (error) throw error;

    // Limpiar tabla
    tableBody.innerHTML = "";

    if (!data || data.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;">Sin productos registrados</td></tr>`;
      return;
    }

    // Renderizar filas
    data.forEach((p) => {
      const tr = document.createElement("tr");

      // Determinar color según stock total
      const totalStock =
        (p.i069 || 0) + (p.i078 || 0) + (p.i07f || 0) + (p.i312 || 0) + (p.i073 || 0);
      let colorClass = "";
      if (totalStock > 10) colorClass = "green";
      else if (totalStock >= 2) colorClass = "yellow";
      else colorClass = "red";

      tr.innerHTML = `
        <td>${p.codigo}</td>
        <td>${p.descripcion}</td>
        <td>${p.um}</td>
        <td>${p.i069 ?? 0}</td>
        <td>${p.i078 ?? 0}</td>
        <td>${p.i07f ?? 0}</td>
        <td>${p.i312 ?? 0}</td>
        <td>${p.i073 ?? 0}</td>
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
    showToast("Error al cargar inventario", false);
  }
}

// ------------------- BOTÓN REFRESCAR -------------------
if (refreshBtn) {
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "⏳ Actualizando...";
    await cargarInventario();
    refreshBtn.textContent = "🔄 Refrescar";
    refreshBtn.disabled = false;
    showToast("Inventario actualizado correctamente ✅", true);
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