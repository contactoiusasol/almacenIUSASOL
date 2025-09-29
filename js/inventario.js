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
const tablaPendientesBody = document.querySelector("#pendingTable tbody"); // usado en renderPendingList
const tablaHistorialBody = document.querySelector("#salidasTable tbody"); // usado por historial
const btnConfirmAll = document.getElementById("btnConfirmAll");
const btnClearPending = document.getElementById("btnClearPending");
const btnRefresh = document.getElementById("btnRefresh");
const nombreResponsableInput = document.getElementById("nombreResponsable");

// ------------------- Estado -------------------
let editMode = false;
let editingCodigo = null;

// estado global del usuario autenticado (nombre/apellido)
let CURRENT_USER_FULLNAME = "";
let CURRENT_USER_NOMBRE = "";
let CURRENT_USER_APELLIDO = "";
let PRODUCTOS_COLUMN_MAP = null; // map: normalizedKey -> realColumnName

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

function formatShowValue(val) {
  if (val === null || val === undefined) return "";
  return String(val);
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
        <input id="salidaCantidadInputModal" type="number" min="1" step="1" class="input-text" style="width:100%;box-sizing:border-box" />
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
      return Number.isFinite(+s) ? parseInt(s||0,10) : 0;
    } catch (e) { return 0; }
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
        left.innerHTML = `<strong>${escapeHtml(inv)}</strong> — Disponible: <span data-inv-stock="${inv}">${stocks[inv]}</span>`;
      }

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";
      const input = document.createElement("input");
      input.setAttribute("data-inv", inv);
      input.type = "number";
      input.min = "0";
      input.step = "1";
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

    distribContainer.querySelectorAll('input[data-inv]').forEach(i => {
      i.removeEventListener("input", onDistribInputChange);
      i.addEventListener("input", onDistribInputChange);
    });

    updateConfirmState();
  }

  // calcula total disponible (sum stocks)
  function totalAvailable() {
    const inputs = Array.from(distribContainer.querySelectorAll('input[data-inv]'));
    return inputs.reduce((acc, inp) => {
      const inv = inp.dataset.inv;
      return acc + (safeStock(producto, inv) || 0);
    }, 0);
  }

  // event al cambiar cualquier input de reparto -> validar
  function onDistribInputChange() {
    const inp = this;
    const inv = inp.dataset.inv;
    const avail = safeStock(producto, inv) || 0;
    let v = parseInt(inp.value || "0", 10) || 0;
    if (v > avail) {
      inp.value = String(avail);
      modalToast(`Ajustado ${inv} al stock disponible (${avail})`, false, 3000, false);
    }
    // si el usuario puso valor negativo o no numérico -> ajustar a 0
    if (v < 0) inp.value = "0";
    updateConfirmState();
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

  // habilita/deshabilita botón Confirm y muestra mensaje si falla
  function updateConfirmState() {
    const totalNeeded = parseInt(cantidadInput.value || "0", 10) || 0;
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

    if (totalNeeded > avail) {
      btnConfirm.disabled = true;
      modalToast(`La cantidad solicitada (${totalNeeded}) excede el total disponible (${avail}).`, false, 0, true);
      return;
    }

    btnConfirm.disabled = false;
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
    const totalNeeded = parseInt(cantidadInput.value || "0", 10) || 0;
    if (!totalNeeded || totalNeeded <= 0) {
      missing.push("Cantidad total requerida");
      markInvalid(cantidadInput);
    }

    const destinatario = (destInput.value || "").trim();
    if (!destinatario) {
      missing.push("Destinatario");
      markInvalid(destInput);
    }

    // revisar distribución: al menos un inventario con cantidad > 0
    const inputs = Array.from(distribContainer.querySelectorAll('input[data-inv]'));
    const origenes = inputs.map(inp => {
      const inv = inp.dataset.inv;
      const qty = parseInt(inp.value || "0", 10) || 0;
      const avail = safeStock(producto, inv);
      return { INVENTARIO_ORIGEN: `INVENTARIO ${inv}`, CANTIDAD: qty, AVAILABLE: avail, el: inp };
    }).filter(o => o.CANTIDAD > 0);

    const sum = origenes.reduce((s,o) => s + (parseInt(o.CANTIDAD||0,10)||0), 0);

    if (origenes.length === 0) {
      missing.push("Distribución entre inventarios (elige al menos un inventario)");
      // marcar visualmente todos los inputs de distribución
      inputs.forEach(i => markInvalid(i));
    } else {
      // si hay distribución pero suma distinta -> mostrar error específico
      if (sum !== totalNeeded) {
        modalToast(`La suma por inventario (${sum}) no coincide con la cantidad total (${totalNeeded}). Ajusta los valores.`, false, 4000);
        // marcar inputs implicados
        origenes.forEach(o => markInvalid(o.el));
        // no agregar al missing list porque ya mostramos toast específico
        return { ok: false, focusEl: origenes[0]?.el || cantidadInput };
      }
      // verificar que cada cantidad no exceda su stock (onDistribInputChange ya protege esto, pero por si acaso)
      for (const o of origenes) {
        if (o.CANTIDAD > o.AVAILABLE) {
          modalToast(`La cantidad para ${o.INVENTARIO_ORIGEN} (${o.CANTIDAD}) excede su stock (${o.AVAILABLE}).`, false, 4000);
          markInvalid(o.el);
          return { ok: false, focusEl: o.el };
        }
      }
    }

    // responsable debe existir
    const responsable = (respInput.value || "").trim();
    if (!responsable) {
      missing.push("Responsable (inicia sesión)");
      markInvalid(respInput);
    }

    if (missing.length > 0) {
      const ms = `Completa los campos obligatorios: ${missing.join(", ")}`;
      modalToast(ms, false, 4500);
      // focus en el primer campo faltante
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
    try { distribContainer.querySelectorAll('input[data-inv]').forEach(i => i.removeEventListener("input", onDistribInputChange)); } catch(e) {}
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

/* Modal dinámico para buscar entradas por código */
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
      <input id="entradaCodigoInput" placeholder="Escribe el código (ej: ABC123)" value="${escapeHtml(prefillCodigo)}" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px" />
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

  // helpers: intentar leer tabla de entradas en varias tablas comunes
  async function tryFetchEntriesTable(codigo) {
    if (!supabase) return { table: null, data: null, error: "Supabase no inicializado" };

    const candidateTables = ['entradas','entradas_productos','movimientos','movimientos_entradas','historial_entradas','stock_movimientos'];
    for (const t of candidateTables) {
      try {
        const { data, error } = await supabase.from(t).select("*").eq("CODIGO", codigo).order("ADDED_AT", { ascending: false }).limit(500);
        if (error) {
          continue;
        }
        return { table: t, data: data || [] };
      } catch (e) {
        continue;
      }
    }
    return { table: null, data: null };
  }

  // función para renderizar resultados
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

    // 2) buscar entradas en tablas candidatas
    const { table, data } = await tryFetchEntriesTable(codigo);

    if (!table) {
      listWrap.innerHTML = `<div style="color:#6b7280">No se encontró una tabla de entradas conocida o no existe historial para este producto.</div>`;
      summaryDiv.innerHTML = "";
      return;
    }

    if (!data || data.length === 0) {
      listWrap.innerHTML = `<div style="color:#6b7280">No hay entradas registradas en la tabla <code>${escapeHtml(table)}</code> para el código ${escapeHtml(codigo)}.</div>`;
      summaryDiv.innerHTML = `<div style="font-size:13px;color:#374151">Entradas encontradas: 0</div>`;
      return;
    }

    // construir resumen
    let totalQty = 0;
    const byInv = {};
    const rows = data.map(r => {
      const qtyFieldNames = ['CANTIDAD','cantidad','QTY','qty','quantity','cantidad_ingresada','UNITS'];
      let qty = 0;
      for (const k of Object.keys(r)) {
        if (qtyFieldNames.includes(k)) { qty = toNumber(r[k]); break; }
      }
      if (!qty) {
        for (const k of Object.keys(r)) {
          if (typeof r[k] === 'number') { qty = Number(r[k]); break; }
        }
      }

      const invCandidates = ['INVENTARIO','inventario','ALMACEN','almacen','ORIGEN','origen'];
      let inv = null;
      for (const k of Object.keys(r)) {
        const nk = normalizeKeyName(k);
        if (invCandidates.some(c => nk.includes(normalizeKeyName(c)))) { inv = String(r[k] || "") ; break; }
      }
      inv = inv || "—";

      totalQty += Number(qty || 0);
      byInv[inv] = (byInv[inv] || 0) + Number(qty || 0);

      return {
        raw: r,
        qty: Number(qty || 0),
        inv: inv,
        at: r.ADDED_AT || r.created_at || r.inserted_at || r.fecha || r.fecha_movimiento || ""
      };
    });

    let summaryHtml = `<div style="font-size:13px;color:#111;margin-bottom:6px"><strong>${rows.length}</strong> entradas encontradas (tabla <code>${escapeHtml(table)}</code>).</div>`;
    summaryHtml += `<div style="font-size:13px;color:#111;margin-bottom:6px">Cantidad total registrada en estas entradas: <strong>${totalQty}</strong></div>`;
    summaryHtml += `<div style="font-size:13px;color:#111">Desglose por inventario:</div><ul style="margin:6px 0 0 18px">`;
    for (const k of Object.keys(byInv)) summaryHtml += `<li>${escapeHtml(k)}: ${byInv[k]}</li>`;
    summaryHtml += `</ul>`;
    summaryDiv.innerHTML = summaryHtml;

    // lista detallada
    const tableEl = document.createElement("table");
    tableEl.style.width = "100%";
    tableEl.style.borderCollapse = "collapse";
    tableEl.innerHTML = `
      <thead>
        <tr style="text-align:left;font-size:13px;color:#374151">
          <th style="padding:6px 8px;border-bottom:1px solid #eee">Fecha</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">Inventario</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">Cantidad</th>
          <th style="padding:6px 8px;border-bottom:1px solid #eee">Usuario/Nota</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = tableEl.querySelector("tbody");

    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.at || "").slice(0,19))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.inv || "—"))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.qty || 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #fafafa;font-size:13px">${escapeHtml(String(r.raw.USUARIO || r.raw.user || r.raw.NOTAS || r.raw.nota || "") )}</td>
      `;
      tbody.appendChild(tr);
    });

    listWrap.innerHTML = "";
    listWrap.appendChild(tableEl);
  } // buscarYRenderizar

  // Registrar nueva entrada — abre mini-form dentro del modal
  async function abrirRegistrarEntrada() {
    const codigo = String(codigoInput.value || "").trim();
    if (!codigo) { showToast("Escribe un código antes de registrar", false); codigoInput.focus(); return; }

    const formHtml = document.createElement("div");
    formHtml.style.border = "1px dashed #e5e7eb";
    formHtml.style.padding = "8px";
    formHtml.style.marginBottom = "10px";
    formHtml.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center">
        <input id="regEntradaCantidad" type="number" min="1" placeholder="Cantidad" style="width:120px;padding:6px;border:1px solid #ddd;border-radius:6px" />
        <select id="regEntradaInv" style="padding:6px;border:1px solid #ddd;border-radius:6px">
          <option value="INVENTARIO I069">I069</option>
          <option value="INVENTARIO I078">I078</option>
          <option value="INVENTARIO I07F">I07F</option>
          <option value="INVENTARIO I312">I312</option>
          <option value="INVENTARIO I073">I073</option>
          <option value="INVENTARIO FISICO EN ALMACEN">ALMACEN</option>
        </select>
        <input id="regEntradaNota" placeholder="Nota (opcional)" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px" />
        <button id="regEntradaDo" class="btn-primary">Registrar</button>
      </div>
    `;
    summaryDiv.parentNode.insertBefore(formHtml, summaryDiv.nextSibling);

    const qtyInput = formHtml.querySelector("#regEntradaCantidad");
    const invSelect = formHtml.querySelector("#regEntradaInv");
    const notaInput = formHtml.querySelector("#regEntradaNota");
    const doBtn = formHtml.querySelector("#regEntradaDo");

    doBtn.addEventListener("click", async () => {
  const qty = parseInt(qtyInput.value || "0", 10) || 0;
  const invLabel = invSelect.value; // ej. "INVENTARIO I069" o "ALMACEN"
  const nota = String(notaInput.value || "").trim();

  if (qty <= 0) { showToast("Cantidad inválida", false); qtyInput.focus(); return; }
  if (!supabase) { showToast("Supabase no inicializado", false); return; }

  try {
    // detectar columnas reales (si tienes helpers; si no, asumimos nombres por defecto)
    await ensureProductosColumnMap?.(); // noop si no existe
    const realCodigoCol = getRealColForName?.('codigo') || getRealColForName?.('CODIGO') || 'CODIGO';
    const realInvCol = getRealColForInventoryLabel?.(invLabel) || getRealColForInventoryLabel?.(invLabel.replace(/INVENTARIO\s*/i,'')) || null;
    const realAlmacenCol = getRealColForInventoryLabel?.('ALMACEN') || 'inventario_fisico_en_almacen' || 'almacen';

    // Buscamos el producto; SI NO EXISTE -> NO CREAMOS, solo avisamos
    const { data: prodRow, error: selErr } = await supabase
      .from("productos")
      .select("*")
      .eq(realCodigoCol, codigo)
      .maybeSingle();

    if (selErr) throw selErr;

    if (!prodRow) {
      showToast(`El producto ${codigo} no existe en 'productos'. No se creó una nueva fila.`, false);
      return;
    }

    // Determinar columna de inventario a actualizar (si no hay realInvCol, intentar heurística)
    const targetCol = realInvCol || Object.keys(prodRow).find(k => /i069|i078|i07f|i312|i073/i.test(k)) || null;
    if (!targetCol) {
      showToast("No se pudo detectar la columna de inventario para este inventario seleccionado.", false);
      console.warn("No inventory column detected for label:", invLabel, "prodRow keys:", Object.keys(prodRow));
      return;
    }

    // Calcular nuevo stock y actualizar sólo esa columna (NO insertar fila nueva)
    const currentStock = parseInt(prodRow[targetCol] || 0, 10) || 0;
    const nuevoStock = currentStock + qty;
    const updObj = {}; updObj[targetCol] = nuevoStock;

    // Intentar recalcular campo ALMACEN (sumatoria) de forma defensiva
    try {
      const invCols = ['I069','I078','I07F','I312','I073']
        .map(inv => getRealColForInventoryLabel?.(inv) || `inventario_${inv.toLowerCase()}`);
      // filtrar únicos y válidos
      const invColsFiltered = Array.from(new Set(invCols)).filter(Boolean);
      if (invColsFiltered.length) {
        const { data: rowAll, error: rErr } = await supabase
          .from("productos")
          .select(invColsFiltered.join(","))
          .eq(realCodigoCol, codigo)
          .maybeSingle();
        if (!rErr && rowAll) {
          let sum = 0;
          invColsFiltered.forEach(c => { sum += parseInt(rowAll[c] || 0, 10) || 0; });
          // si la columna que actualizamos no estaba en rowAll (raro), añadir nuevoStock
          if (!invColsFiltered.includes(targetCol)) sum += nuevoStock;
          updObj[realAlmacenCol] = sum;
        } else {
          // si no pudimos leer, simplemente no tocar almacen (no es crítico)
        }
      }
    } catch (e) {
      console.warn("No se pudo recalcular ALMACEN, operación prosigue:", e);
    }

    const { error: updErr } = await supabase
      .from("productos")
      .update(updObj)
      .eq(realCodigoCol, codigo);

    if (updErr) throw updErr;

    // Actualizar UI: recargar productos y resumen de entradas
    showToast(`✅ Se sumaron ${qty} a ${codigo} (${targetCol}). Nuevo stock: ${nuevoStock}`, true);
    await loadProducts();         // refresca la tabla principal
    if (typeof buscarYRenderizar === "function") await buscarYRenderizar(); // refresca modal/búsqueda si está abierto
    formHtml?.remove?.(); // cierra mini-form si existe

  } catch (err) {
    console.error("Registrar entrada (solo sumar) error:", err);
    showToast("❌ Error al sumar entrada (ver consola)", false);
  }
});

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
    const i069 = getStockFromProduct(p, 'I069');
    const i078 = getStockFromProduct(p, 'I078');
    const i07f = getStockFromProduct(p, 'I07F');
    const i312 = getStockFromProduct(p, 'I312');
    const i073 = getStockFromProduct(p, 'I073');
    const fisico = getStockFromProduct(p, 'ALMACEN') || getStockFromProduct(p, 'INVENTARIO FISICO EN ALMACEN');

    const stockReal = i069 + i078 + i07f + i312 + i073;

    let stockClass = "stock-high";
    if (stockReal <= 1) stockClass = "stock-low";
    else if (stockReal <= 10) stockClass = "stock-medium";

    const row = document.createElement("tr");
    row.className = stockClass;

    // Celdas
    const tdCodigo = document.createElement("td");
    tdCodigo.textContent = p["CODIGO"];

    const tdDesc = document.createElement("td");
    tdDesc.textContent = p["DESCRIPCION"] ?? "";

    const tdUm = document.createElement("td");
    tdUm.textContent = p["UM"] ?? "";

    const tdI069 = document.createElement("td");
    tdI069.textContent = i069;

    const tdI078 = document.createElement("td");
    tdI078.textContent = i078;

    const tdI07F = document.createElement("td");
    tdI07F.textContent = i07f;

    const tdI312 = document.createElement("td");
    tdI312.textContent = i312;

    const tdI073 = document.createElement("td");
    tdI073.textContent = i073;

    const tdFisico = document.createElement("td");
    tdFisico.textContent = formatShowValue(fisico);

    const tdAcciones = document.createElement("td");
    tdAcciones.className = "acciones";

    // botones
    const btnEdit = document.createElement("button");
    btnEdit.className = "btn-edit";
    btnEdit.textContent = "✏ Editar";
    btnEdit.addEventListener("click", () => editarProducto(p));

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn-delete";
    btnDelete.textContent = "🗑 Eliminar";
    btnDelete.addEventListener("click", () => eliminarProducto(p["CODIGO"]));

    const btnSalida = document.createElement("button");
    btnSalida.className = "btn-salida";
    btnSalida.textContent = "📦 Salida";
    btnSalida.addEventListener("click", () => openSalidaModal(p));

    // append
    tdAcciones.appendChild(btnEdit);
    tdAcciones.appendChild(document.createTextNode(" "));
    tdAcciones.appendChild(btnDelete);
    tdAcciones.appendChild(document.createTextNode(" "));
    tdAcciones.appendChild(btnSalida);

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
    } catch (e) {}
  });
  // si no existe el campo 'almacen' o 'sumar', no hay problema (se crearán/leerán si existen)
}

// ------------------- Editar Producto -------------------
function editarProducto(producto) {
  if (!modal || !productForm) {
    showToast("Formulario de producto no disponible", false);
    return;
  }

  editMode = true;
  editingCodigo = producto["CODIGO"];

  // Abrir modal
  modal.style.display = "flex";

  // Rellenar campos con valores actuales (getStockFromProduct usa heurísticas para detectar columnas)
  productForm.querySelector('[name="codigo"]').value = producto["CODIGO"] ?? "";
  productForm.querySelector('[name="descripcion"]').value = producto["DESCRIPCION"] ?? "";
  productForm.querySelector('[name="um"]').value = producto["UM"] ?? "";

  productForm.querySelector('[name="i069"]').value = getStockFromProduct(producto, 'I069') ?? 0;
  productForm.querySelector('[name="i078"]').value = getStockFromProduct(producto, 'I078') ?? 0;
  productForm.querySelector('[name="i07f"]').value = getStockFromProduct(producto, 'I07F') ?? 0;
  productForm.querySelector('[name="i312"]').value = getStockFromProduct(producto, 'I312') ?? 0;
  productForm.querySelector('[name="i073"]').value = getStockFromProduct(producto, 'I073') ?? 0;
  productForm.querySelector('[name="almacen"]').value = getStockFromProduct(producto, 'ALMACEN') ?? getStockFromProduct(producto, 'INVENTARIO FISICO EN ALMACEN') ?? 0;

  // Forzar actualizar visual del almacen calculado (por si usas la función de suma en el HTML)
  try { actualizarAlmacen(); } catch (e) {}

  // Dejar checkbox 'sumar' desmarcado por defecto cuando abres en modo editar
  const chk = productForm.querySelector('[name="sumar"]');
  if (chk) chk.checked = false;

  productForm.querySelector('[name="codigo"]').setAttribute("readonly", "true");
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
    const codeField = productForm.querySelector('[name="codigo"]');
    if (codeField) codeField.removeAttribute("readonly");
    modal.style.display = "flex";
  });
}

if (btnCloseModal) {
  btnCloseModal.addEventListener("click", () => {
    if (!productForm || !modal) return;
    modal.style.display = "none";
    clearProductFormFields();
    editMode = false;
    editingCodigo = null;
    const codeField = productForm.querySelector('[name="codigo"]');
    if (codeField) codeField.removeAttribute("readonly");
  });
}

window.addEventListener("click", (e) => {
  if (e.target === modal) {
    if (!productForm || !modal) return;
    modal.style.display = "none";
    clearProductFormFields();
    editMode = false;
    editingCodigo = null;
    const codeField = productForm.querySelector('[name="codigo"]');
    if (codeField) codeField.removeAttribute("readonly");
  }
});

// ------------------- Guardar Producto (robusto) -------------------
if (productForm) {
  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!supabase) {
      showToast("Supabase no está inicializado", false);
      return;
    }

    const formData = new FormData(productForm);

    // valores desde el formulario (lo que ingresó el usuario)
    const formValues = {
      CODIGO: String(formData.get("codigo") || "").trim(),
      DESCRIPCION: String(formData.get("descripcion") || "").trim(),
      UM: String(formData.get("um") || "").trim(),
      I069: parseInt(formData.get("i069")) || 0,
      I078: parseInt(formData.get("i078")) || 0,
      I07F: parseInt(formData.get("i07f")) || 0,
      I312: parseInt(formData.get("i312")) || 0,
      I073: parseInt(formData.get("i073")) || 0,
      SUMAR: !!formData.get("sumar")
    };

    // recalculamos almacen localmente (suma)
    const totalAlmacen = formValues.I069 + formValues.I078 + formValues.I07F + formValues.I312 + formValues.I073;

    try {
      await ensureProductosColumnMap();

      // nombres reales si existen
      const realCodigo = getRealColForName('codigo') || getRealColForName('CODIGO') || 'CODIGO';
      const realDescripcion = getRealColForName('descripcion') || getRealColForName('DESCRIPCION') || 'DESCRIPCION';
      const realUm = getRealColForName('um') || getRealColForName('UM') || 'UM';

      // inventarios preferidos con label (usamos label para detectar la columna real)
      const invList = [
        { label: 'I069', val: formValues.I069 },
        { label: 'I078', val: formValues.I078 },
        { label: 'I07F', val: formValues.I07F },
        { label: 'I312', val: formValues.I312 },
        { label: 'I073', val: formValues.I073 }
      ];

      // insertar nuevo producto
      if (!editMode) {
        // construir objeto para insert
        const dbObj = {};
        dbObj[realCodigo] = formValues.CODIGO;
        dbObj[realDescripcion] = formValues.DESCRIPCION;
        dbObj[realUm] = formValues.UM;

        // colocar valores por inventario (detectando column real o adivinando snake_case)
        for (const inv of invList) {
          const realKey = getRealColForInventoryLabel(inv.label) || `inventario_${inv.label.toLowerCase()}`;
          dbObj[realKey] = inv.val;
        }
        // almacen físico -> detectar columna real para 'ALMACEN'
        const realAlmacenKey = getRealColForInventoryLabel('ALMACEN') || 'inventario_fisico_en_almacen' || 'almacen';
        dbObj[realAlmacenKey] = totalAlmacen;

        const { error } = await supabase.from("productos").insert([dbObj]);
        if (error) throw error;

        showToast("✅ Producto agregado", true);
        productForm.reset();
        productForm.querySelector('[name="codigo"]').removeAttribute("readonly");
        await loadProducts();
        return;
      }

      // ------------------ MODO EDITAR ------------------
      // Si editar y SUMAR está activado => sumar cantidades sobre stock actual (entrada)
      if (editMode && formValues.SUMAR) {
        // obtener fila actual con las columnas reales
        const colsToSelect = [
          realCodigo, realDescripcion, realUm
        ];
        // añadir inventario columnas al select (si existen)
        invList.forEach(inv => {
          const rk = getRealColForInventoryLabel(inv.label) || `inventario_${inv.label.toLowerCase()}`;
          if (!colsToSelect.includes(rk)) colsToSelect.push(rk);
        });
        // intentar columna almacen real
        const realAlmacenKey = getRealColForInventoryLabel('ALMACEN') || 'inventario_fisico_en_almacen' || 'almacen';
        if (!colsToSelect.includes(realAlmacenKey)) colsToSelect.push(realAlmacenKey);

        const { data: prodRow, error: prodErr } = await supabase
          .from("productos")
          .select(colsToSelect.join(","))
          .eq(realCodigo, editingCodigo)
          .maybeSingle();

        if (prodErr) throw prodErr;
        if (!prodRow) throw new Error("No se encontró el producto a editar (fetch).");

        // construir objeto update sumando valores
        const upd = {};
        if (formValues.DESCRIPCION !== undefined) upd[realDescripcion] = formValues.DESCRIPCION;
        if (formValues.UM !== undefined) upd[realUm] = formValues.UM;
        

        // sumar por cada inventario
        let sumAlmacen = 0;
        for (const inv of invList) {
          const realKey = getRealColForInventoryLabel(inv.label) || `inventario_${inv.label.toLowerCase()}`;
          const current = parseInt(prodRow[realKey] ?? 0, 10) || 0;
          const nuevo = Math.max(0, current + (parseInt(inv.val, 10) || 0));
          upd[realKey] = nuevo;
          sumAlmacen += nuevo; // acumulamos para almacen
        }

        // fijar almacen a suma de inventarios
        upd[realAlmacenKey] = sumAlmacen;

        const { error: updErr } = await supabase
          .from("productos")
          .update(upd)
          .eq(realCodigo, editingCodigo);

        if (updErr) throw updErr;

        showToast("✅ Cantidades sumadas y producto actualizado", true);
        productForm.reset();
        editMode = false;
        editingCodigo = null;
        const readonlyField = productForm.querySelector('[name="codigo"]');
        if (readonlyField) readonlyField.removeAttribute("readonly");
        await loadProducts();
        return;
      }

      // ------------------ MODO EDITAR (REEMPLAZAR valores) ------------------
      // construimos dbObj con los valores exactos del formulario (reemplazo)
      const dbObj = {};
      dbObj[realCodigo] = formValues.CODIGO;
      dbObj[realDescripcion] = formValues.DESCRIPCION;
      dbObj[realUm] = formValues.UM;

      // asignar inventarios (detectando columna real)
      for (const inv of invList) {
        const realKey = getRealColForInventoryLabel(inv.label) || `inventario_${inv.label.toLowerCase()}`;
        dbObj[realKey] = inv.val;
      }
      // almacen físico = suma
      const realAlmacenKey2 = getRealColForInventoryLabel('ALMACEN') || 'inventario_fisico_en_almacen' || 'almacen';
      dbObj[realAlmacenKey2] = totalAlmacen;

      const { error } = await supabase
        .from("productos")
        .update(dbObj)
        .eq(realCodigo, editingCodigo);

      if (error) throw error;

      showToast("✅ Producto actualizado", true);
      productForm.reset();
      editMode = false;
      editingCodigo = null;
      const readonlyField = productForm.querySelector('[name="codigo"]');
      if (readonlyField) readonlyField.removeAttribute("readonly");
      await loadProducts();
    } catch (ex) {
      console.error("Exception guardando producto:", ex);
      showToast("Error inesperado al guardar producto (ver consola)", false);
    }
  });
}

// ------------------- Filtro de búsqueda -------------------
if (searchInput) {
  searchInput.addEventListener("keyup", async () => {
    const search = searchInput.value.trim().toLowerCase();

    if (search === "") {
      loadProducts();
      return;
    }

    if (!supabase) {
      console.error("Supabase no inicializado para búsqueda");
      return;
    }

    // usamos select('*') para evitar fallos por columnas que cambiaron de nombre
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .limit(200);

    if (error) {
      console.error("Error en búsqueda:", error);
      return;
    }

    const filtered = (data || []).filter(
      (p) =>
        String((p["CODIGO"] || "")).toLowerCase().includes(search) ||
        (String(p["DESCRIPCION"] || "")).toLowerCase().includes(search)
    );

    renderTable(filtered);
  });
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
  // marcar readonly para evitar edición manual (puedes quitar si quieres permitir edición)
  if (nombreResponsableInput) {
    nombreResponsableInput.setAttribute("readonly", "true");
  }

  function capitalizeWords(s) {
    return String(s || "")
      .trim()
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  function nameFromEmail(email) {
    if (!email) return { full: "", first: "", last: "" };
    const local = String(email).split("@")[0].replace(/[._-]+/g, " ").trim();
    const parts = local.split(/\s+/).map(p => p.trim()).filter(Boolean);
    const first = parts.shift() || "";
    const last = parts.join(" ") || "";
    return {
      full: capitalizeWords(`${first} ${last}`.trim()),
      first: capitalizeWords(first),
      last: capitalizeWords(last)
    };
  }

  // fallback helper: set from a generic string (full name or email)
  function applyFallbackName(fallbackStr) {
    const fallback = String(fallbackStr || "").trim();
    if (!fallback) {
      CURRENT_USER_FULLNAME = "";
      CURRENT_USER_NOMBRE = "";
      CURRENT_USER_APELLIDO = "";
      return;
    }
    if (fallback.includes("@")) {
      const parsed = nameFromEmail(fallback);
      CURRENT_USER_FULLNAME = parsed.full;
      CURRENT_USER_NOMBRE = parsed.first;
      CURRENT_USER_APELLIDO = parsed.last;
    } else {
      const parts = fallback.split(/\s+/).filter(Boolean);
      CURRENT_USER_NOMBRE = capitalizeWords(parts.shift() || "");
      CURRENT_USER_APELLIDO = capitalizeWords(parts.join(" ") || "");
      CURRENT_USER_FULLNAME = `${CURRENT_USER_NOMBRE} ${CURRENT_USER_APELLIDO}`.trim();
    }
  }

  try {
    // obtener usuario auth actual
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.warn("setResponsableFromAuth - supabase.auth.getUser error:", authErr);
      applyFallbackName(""); // limpiar
      if (nombreResponsableInput) nombreResponsableInput.value = "";
      return;
    }

    const user = authData?.user ?? null;
    if (!user) {
      applyFallbackName("");
      if (nombreResponsableInput) {
        nombreResponsableInput.value = "";
        nombreResponsableInput.placeholder = "Usuario no autenticado";
      }
      return;
    }

    // validar user.id antes de hacer la consulta a la tabla 'usuarios'
    const userId = user.id;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!userId || typeof userId !== "string" || !uuidRe.test(userId)) {
      // evita llamada a usuarios con id inválido (previene 400)
      console.warn("setResponsableFromAuth - userId inválido, usando fallback:", userId);
      const fallback = user.user_metadata?.full_name ?? user.email ?? "";
      applyFallbackName(fallback);
      if (nombreResponsableInput) {
        nombreResponsableInput.value = CURRENT_USER_FULLNAME || "";
        nombreResponsableInput.setAttribute("readonly", "true");
      }
      return;
    }

    // DEBUG: mostrar id en consola para depuración
    console.log("setResponsableFromAuth - consultando usuarios.id =", userId);

    // consulta segura: .eq en vez de .filter y maybeSingle() para evitar URL malformada
    const { data: udata, error: uerr } = await supabase
      .from("usuarios")
      .select("nombre,apellido,nombre_completo,email")
      .eq("id", userId)
      .maybeSingle();

    if (uerr) {
      console.warn("setResponsableFromAuth - error consultando usuarios:", uerr);
      // fallback a metadata/email del auth user
      const fallback = user.user_metadata?.full_name ?? user.email ?? "";
      applyFallbackName(fallback);
    } else if (udata) {
      const nombre = (udata.nombre || "").trim();
      const apellido = (udata.apellido || "").trim();
      const nombreCompleto = (udata.nombre_completo || "").trim();

      if (nombre || apellido) {
        CURRENT_USER_NOMBRE = capitalizeWords(nombre);
        CURRENT_USER_APELLIDO = capitalizeWords(apellido);
        CURRENT_USER_FULLNAME = `${CURRENT_USER_NOMBRE} ${CURRENT_USER_APELLIDO}`.trim();
      } else if (nombreCompleto) {
        const parts = nombreCompleto.trim().split(/\s+/).filter(Boolean);
        CURRENT_USER_NOMBRE = capitalizeWords(parts.shift() || "");
        CURRENT_USER_APELLIDO = capitalizeWords(parts.join(" ") || "");
        CURRENT_USER_FULLNAME = capitalizeWords(nombreCompleto);
      } else if (udata.email) {
        const parsed = nameFromEmail(udata.email);
        CURRENT_USER_FULLNAME = parsed.full;
        CURRENT_USER_NOMBRE = parsed.first;
        CURRENT_USER_APELLIDO = parsed.last;
      } else {
        // si no hay datos útiles en la fila, fallback a metadata/email
        const fallback = user.user_metadata?.full_name ?? user.email ?? "";
        applyFallbackName(fallback);
      }
    } else {
      // no hay fila en usuarios -> fallback a metadata/email del auth user
      const fallback = user.user_metadata?.full_name ?? user.email ?? "";
      applyFallbackName(fallback);
    }

    // setear en input si existe
    if (nombreResponsableInput) {
      nombreResponsableInput.value = CURRENT_USER_FULLNAME || "";
      nombreResponsableInput.setAttribute("readonly", "true");
    }
  } catch (err) {
    console.warn("No se pudo obtener responsable desde auth (excepción):", err);
    // fallback general
    const fallback = (typeof err === "object" && err?.user?.email) ? err.user.email : "";
    if (fallback) {
      applyFallbackName(fallback);
      if (nombreResponsableInput) nombreResponsableInput.value = CURRENT_USER_FULLNAME || "";
    } else {
      CURRENT_USER_FULLNAME = "";
      CURRENT_USER_NOMBRE = "";
      CURRENT_USER_APELLIDO = "";
      try { if (nombreResponsableInput) nombreResponsableInput.value = ""; } catch {}
    }
  }
}
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
