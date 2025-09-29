// salidas.js (module, autocontenido)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CONFIG: pon aquí tu URL y la anon key (cliente) ---
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DOM references ---
const tablaPendientesBody = document.querySelector("#pendingTable tbody");
const tablaHistorialBody = document.querySelector("#salidasTable tbody");
const btnConfirmAll = document.getElementById("btnConfirmAll");
const btnClearPending = document.getElementById("btnClearPending");
const btnRefresh = document.getElementById("btnRefresh");
const nombreResponsableInput = document.getElementById("nombreResponsable");

// --- Estado global del usuario autenticado ---
let CURRENT_USER_FULLNAME = "";
let CURRENT_USER_NOMBRE = "";
let CURRENT_USER_APELLIDO = "";


// --- Cargar datos del usuario autenticado ---
(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    // 🔹 Aquí ya puedes consultar tu tabla "usuarios"
    const { data, error } = await supabase
      .from("usuarios")
      .select("nombre, apellido")
      .eq("email", user.email)
      .single();

    if (!error && data) {
      CURRENT_USER_FULLNAME = `${data.nombre} ${data.apellido}`.trim();
      CURRENT_USER_NOMBRE = data.nombre;
      CURRENT_USER_APELLIDO = data.apellido;
    } else {
      // fallback: usar metadata o correo
      CURRENT_USER_FULLNAME = user.user_metadata?.full_name || user.email || "";
      const parts = CURRENT_USER_FULLNAME.split(" ");
      CURRENT_USER_NOMBRE = parts.shift() || "";
      CURRENT_USER_APELLIDO = parts.join(" ") || "";
    }

    // Mostrarlo en el input (readonly)
    if (nombreResponsableInput) {
      nombreResponsableInput.value = CURRENT_USER_FULLNAME;
      nombreResponsableInput.setAttribute("readonly", "true");
    }
  }
})();

// flag para evitar adjuntar listeners múltiples veces
let _pendingDelegationAttached = false;

// --- Helpers simples ---
function toNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  const cleaned = String(v).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function formatFecha(fechaRaw) {
  if (!fechaRaw) return "-";
  const d = new Date(fechaRaw);
  if (Number.isNaN(d.getTime())) return String(fechaRaw);
  return d.toLocaleString();
}
// --- Alert modal centrado (reemplaza el toast inferior) ---
function showAlert(message, success = true, autoCloseMs = 3000) {
  const existing = document.getElementById("globalAlertOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "globalAlertOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(0,0,0,0.35)";
  overlay.style.zIndex = "9999";

  const box = document.createElement("div");
  box.style.minWidth = "320px";
  box.style.maxWidth = "90%";
  box.style.padding = "58px 20px";
  box.style.borderRadius = "10px";
  box.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
  box.style.background = "#fff";
  box.style.textAlign = "center";
  box.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";

  const icon = document.createElement("div");
  icon.style.fontSize = "26px";
  icon.style.marginBottom = "6px";
  icon.textContent = success ? "✅" : "⚠️";

  const p = document.createElement("div");
  p.style.marginBottom = "10px";
  p.style.fontSize = "15px";
  p.style.color = "#111";
  p.textContent = message;

  const btnClose = document.createElement("button");
  btnClose.textContent = "Cerrar";
  btnClose.style.border = "none";
  btnClose.style.padding = "8px 12px";
  btnClose.style.borderRadius = "8px";
  btnClose.style.cursor = "pointer";
  btnClose.style.fontWeight = "600";
  btnClose.style.background = success ? "#10b981" : "#ef4444";
  btnClose.style.color = "#fff";

  btnClose.addEventListener("click", () => overlay.remove());

  box.appendChild(icon);
  box.appendChild(p);
  box.appendChild(btnClose);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  if (autoCloseMs && autoCloseMs > 0) {
    overlay._t = setTimeout(() => {
      overlay.remove();
    }, autoCloseMs);
  }
}

// Legacy wrapper (por compatibilidad con el resto del código)
function showToast(msg, ok = true) {
  showAlert(msg, ok);
}

// --- localStorage helpers ---
const PENDING_KEY = "salidas_pendientes";
function getPendingSalidas() {
  try { const raw = localStorage.getItem(PENDING_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function savePendingSalidas(list) { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); }

// --- addPendingSalida: merges por codigo+origen+responsable nombre+apellido ---
function addPendingSalida(pendiente) {
  // Si viene como multi-orígenes (pendiente.ORIGENES = [{INVENTARIO_ORIGEN, CANTIDAD, AVAILABLE}, ...]),
  // lo añadimos como entrada independiente (no merge automático para evitar mezclar distribuciones).
  if (Array.isArray(pendiente.ORIGENES) && pendiente.ORIGENES.length > 0) {
    pendiente.ADDED_AT = pendiente.ADDED_AT || String(Date.now());
    // calcular cantidad total por seguridad
    pendiente.CANTIDAD = parseInt(pendiente.CANTIDAD || pendiente.ORIGENES.reduce((s, o) => s + (parseInt(o.CANTIDAD||0,10)||0), 0), 10) || 0;
    const list = getPendingSalidas();
    list.push(pendiente);
    savePendingSalidas(list);
    return;
  }

  // comportamiento legacy (merge por codigo+origen+responsable)
  if (!pendiente.RESPONSABLE_NOMBRE || String(pendiente.RESPONSABLE_NOMBRE).trim() === "") {
    pendiente.RESPONSABLE_NOMBRE = CURRENT_USER_NOMBRE || "";
  }
  if (!pendiente.RESPONSABLE_APELLIDO || String(pendiente.RESPONSABLE_APELLIDO).trim() === "") {
    pendiente.RESPONSABLE_APELLIDO = CURRENT_USER_APELLIDO || "";
  }
  pendiente.RESPONSABLE = ((pendiente.RESPONSABLE_NOMBRE || "") + " " + (pendiente.RESPONSABLE_APELLIDO || "")).trim() || CURRENT_USER_FULLNAME || "";

  const list = getPendingSalidas();
  const idx = list.findIndex(
    (s) =>
      s.CODIGO === pendiente.CODIGO &&
      s.INVENTARIO_ORIGEN === pendiente.INVENTARIO_ORIGEN &&
      ((s.RESPONSABLE_NOMBRE ?? "") === (pendiente.RESPONSABLE_NOMBRE ?? "")) &&
      ((s.RESPONSABLE_APELLIDO ?? "") === (pendiente.RESPONSABLE_APELLIDO ?? ""))
  );
  if (idx >= 0) {
    list[idx].CANTIDAD = (parseInt(list[idx].CANTIDAD, 10) || 0) + parseInt(pendiente.CANTIDAD, 10);
    list[idx].AVAILABLE = Math.min(list[idx].AVAILABLE ?? Infinity, pendiente.AVAILABLE ?? Infinity);
    if (pendiente.OBSERVACIONES) list[idx].OBSERVACIONES = ((list[idx].OBSERVACIONES || "") + " | " + pendiente.OBSERVACIONES).trim();
    if (pendiente.DESTINATARIO) list[idx].DESTINATARIO = pendiente.DESTINATARIO;
    list[idx].ADDED_AT = pendiente.ADDED_AT || list[idx].ADDED_AT || String(Date.now());
  } else {
    pendiente.ADDED_AT = pendiente.ADDED_AT || String(Date.now());
    list.push(pendiente);
  }
  savePendingSalidas(list);
}

// --- Inventory color map (acepta claves largas y cortas) ---
const INVENTORY_COLORS = {
  "INVENTARIO I069": "#fff714ff",
  "INVENTARIO I078": "#0b78f5ff",
  "INVENTARIO I07F": "#f79125ff",
  "INVENTARIO I312": "#ff1495ff",
  "INVENTARIO I073": "#f1f65cff",
  "I069": "#ffff19ff",
  "I078": "#3560ecff",
  "I07F": "#ffaa33ff",
  "I312": "#ff13c0e0",
  "I073": "#e9f547ff",
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

// --- Consulta stock dinámico por columna (intenta seleccionar la columna) ---
async function fetchStockForProduct(codigo, inventoryCol) {
  try {
    // intentamos leer la fila completa y buscar la columna (más tolerante)
    const { data, error } = await supabase.from("productos").select("*").eq("CODIGO", codigo).single();
    if (error || !data) return null;
    // buscar columna por variantes
    const colName = (() => {
      const v = String(inventoryCol || "").trim().toUpperCase().replace(/^INVENTARIO\s*/i, "");
      const variants = [
        `INVENTARIO ${v}`,
        `inventario_${v.toLowerCase()}`,
        `inventario${v.toLowerCase()}`,
        v
      ];
      const keys = Object.keys(data);
      for (const variant of variants) {
        const found = keys.find(k => k.toLowerCase() === variant.toLowerCase());
        if (found) return found;
      }
      // fallback: cualquiera que contenga 'inventario'
      const anyInv = keys.find(k => k.toLowerCase().includes("inventario"));
      return anyInv || null;
    })();

    if (!colName) return null;
    return toNumber(data[colName]);
  } catch (err) {
    console.error("fetchStockForProduct error:", err);
    return null;
  }
}

// ------------------- Render pendientes (ahora async, con select editable y stock) ---
// --- Render pendientes (soporta items multi-origen) ---
async function renderPendingList() {
  if (!tablaPendientesBody) return;

  // aseguramos estilos mínimos (igual que antes)
  if (!document.getElementById("salidas-inline-styles")) {
    const style = document.createElement("style");
    style.id = "salidas-inline-styles";
    style.textContent = `
      .inv-select-wrap { display:inline-flex; align-items:center; gap:8px; }
      .inv-dot { display:inline-block; width:12px; height:12px; border-radius:50%; vertical-align:middle; flex:0 0 12px; box-shadow: 0 0 0 1px rgba(0,0,0,0.06) inset; }
      .pending-inv-select { min-width:110px; padding:6px 8px; border-radius:6px; border:1px solid #ddd; background:#fff; font-size:13px; }
      .inv-stock { margin-left:6px; font-size:12px; color:#444; }
      .max-note { color:#888; font-size:0.75rem; display:block; margin-top:4px; }
      .multi-breakdown { font-size:13px; color:#333; margin-top:6px; border-top:1px dashed #eee; padding-top:6px;}
      .multi-origin-row { display:flex; gap:8px; align-items:center; margin-bottom:4px; }
      #pendingTable td { white-space:nowrap; vertical-align:middle; }
      .btn-remove { background:#ef4444; color:#fff; border:none; padding:6px 8px; border-radius:6px; cursor:pointer; }
      .btn-remove:hover { opacity:0.92; }
      @media (max-width:700px) { .pending-inv-select { min-width:90px; } }
    `;
    document.head.appendChild(style);
  }

  const list = getPendingSalidas();
  tablaPendientesBody.innerHTML = "";

  if (!list || list.length === 0) {
    tablaPendientesBody.innerHTML = `<tr><td colspan="9" class="empty-note">No hay salidas pendientes</td></tr>`;
    updatePendingCountBadge();
    return;
  }

  const inventoryOptions = [
    "INVENTARIO I069",
    "INVENTARIO I078",
    "INVENTARIO I07F",
    "INVENTARIO I312",
    "INVENTARIO I073"
  ];

  for (let idx = 0; idx < list.length; idx++) {
    const item = list[idx];

    // si es multi-origen renderizamos resumen + breakdown oculto
    const isMulti = Array.isArray(item.ORIGENES) && item.ORIGENES.length > 0;
    const totalQty = parseInt(item.CANTIDAD || (isMulti ? item.ORIGENES.reduce((s,o)=>s+ (parseInt(o.CANTIDAD||0,10)||0),0) : 0), 10) || 0;

    const responsableFull = item.RESPONSABLE || `${item.RESPONSABLE_NOMBRE || ""} ${item.RESPONSABLE_APELLIDO || ""}`.trim();

    const selectedInv = isMulti ? "MULTI" : (item.INVENTARIO_ORIGEN ? item.INVENTARIO_ORIGEN : inventoryOptions[0]);
    const dotColor = invColorFor(selectedInv);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-code">${escapeHtml(item.CODIGO)}</td>
      <td class="col-desc"><span class="desc-text" title="${escapeHtml(item.DESCRIPCION)}">${escapeHtml(item.DESCRIPCION)}</span></td>
      <td class="col-um">${escapeHtml(item.UM ?? '')}</td>
      <td class="col-inv">
        <div class="inv-select-wrap">
          <span class="inv-dot" style="background:${dotColor}"></span>
          <span>${escapeHtml(isMulti ? 'MULTI' : (selectedInv.replace(/^INVENTARIO\s*/i, '')) )}</span>
        </div>
      </td>
      <td class="col-cant">${escapeHtml(String(totalQty))}</td>
      <td class="col-resp">${escapeHtml(responsableFull)}</td>
      <td class="col-dest">${escapeHtml(item.DESTINATARIO ?? '')}</td>
      <td class="col-obs">${escapeHtml(item.OBSERVACIONES ?? '')}</td>
      <td class="col-acc"><button class="btn-remove" data-idx="${idx}">Eliminar</button></td>
    `;
    tablaPendientesBody.appendChild(tr);

    // si es multi añadimos fila debajo con desglose
    if (isMulti) {
      const rowDetail = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 9;
      let html = `<div class="multi-breakdown"><strong>Desglose por inventario:</strong>`;
      item.ORIGENES.forEach((o, oi) => {
        html += `<div class="multi-origin-row"><span style="width:110px">${escapeHtml(String(o.INVENTARIO_ORIGEN))}</span> — Cantidad: <strong>${escapeHtml(String(o.CANTIDAD))}</strong> (Disp: ${escapeHtml(String(o.AVAILABLE ?? '-'))})</div>`;
      });
      html += `</div>`;
      cell.innerHTML = html;
      rowDetail.appendChild(cell);
      tablaPendientesBody.appendChild(rowDetail);
    } else {
      // para single-origin mostrar stock dinámico similar al anterior
      (async () => {
        const selInv = item.INVENTARIO_ORIGEN ? item.INVENTARIO_ORIGEN.replace(/^INVENTARIO\s*/i,'') : inventoryOptions[0].replace('INVENTARIO ','');
        const fetched = (typeof item.AVAILABLE === "number") ? item.AVAILABLE : await fetchStockForProduct(item.CODIGO, selInv);
        if (fetched !== null && fetched !== undefined) {
          // actualizar visual (posible mejora: agregar columna stock)
          // si la cantidad excede, se ajusta al renderizar
          if (parseInt(item.CANTIDAD || 0,10) > fetched) {
            const listLocal = getPendingSalidas();
            if (listLocal[idx]) {
              listLocal[idx].CANTIDAD = fetched;
              listLocal[idx].AVAILABLE = fetched;
              savePendingSalidas(listLocal);
            }
          }
        }
      })();
    }
  }
  // delegación para eliminar (idéntica a la anterior implementación)
  tablaPendientesBody.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      const list = getPendingSalidas();
      if (!list[idx]) return;
      if (!confirm(`Eliminar ${list[idx].CODIGO} de la lista de salidas pendientes?`)) return;
      list.splice(idx, 1);
      savePendingSalidas(list);
      renderPendingList();
      updatePendingCountBadge();
      showAlert("Salida eliminada de la lista", true, 1200);
    });
  });

  updatePendingCountBadge();
}

// --- Counter badge en botón Confirmar ---
function updatePendingCountBadge() {
  const btn = document.getElementById("btnConfirmAll");
  if (!btn) return;
  const count = getPendingSalidas().length;
  let badge = document.getElementById("pendingCountBadge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "pendingCountBadge";
    badge.style.background = "#ef4444";
    badge.style.color = "#fff";
    badge.style.borderRadius = "999px";
    badge.style.padding = "2px 8px";
    badge.style.marginLeft = "10px";
    badge.style.fontSize = "12px";
    badge.style.verticalAlign = "middle";
    btn.appendChild(badge);
  }
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-block" : "none";
}

// --- Historial desde DB ---
async function cargarHistorialSalidas() {
  if (!tablaHistorialBody) return;
  try {
    const { data, error } = await supabase
      .from("salidas")
      .select("*")
      .order("FECHA_SALIDA", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      tablaHistorialBody.innerHTML = `<tr><td colspan="9" class="empty-note">No hay registros de salidas</td></tr>`;
      return;
    }

    tablaHistorialBody.innerHTML = "";
    data.forEach((item) => {
      const codigo = item["CODIGO"] ?? item["CÓDIGO"] ?? "-";
      const descripcion = item["DESCRIPCION"] ?? item["DESCRIPCIÓN"] ?? "-";
      const um = item["UM"] ?? "-";
      const inventario = item["INVENTARIO_ORIGEN"] ?? item["TIPO DE INVENTARIO"] ?? item["ORIGEN"] ?? "-";
      const cantidad = item["CANTIDAD_SALIDA"] ?? item["cantidad"] ?? item["CANTIDAD"] ?? "-";
      const fecha = formatFecha(item["FECHA_SALIDA"] ?? item["fecha_salida"] ?? item["fecha"]);

      // preferir responsable_nombre + responsable_apellido
      const nombre = item["RESPONSABLE_NOMBRE"] ?? "";
      const apellido = item["RESPONSABLE_APELLIDO"] ?? "";
      const responsable = (nombre || apellido) ? `${nombre} ${apellido}`.trim() : (item["RESPONSABLE"] ?? "-");

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
    tablaHistorialBody.innerHTML = `<tr><td colspan="9">Error cargando salidas</td></tr>`;
  }
}

// --- Modal summary (UX) ---
function showSummaryModal(successes, errors) {
  const existing = document.getElementById("summaryModal");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "summaryModal";
  overlay.className = "modal";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(0,0,0,0.35)";
  overlay.style.zIndex = "9998";
  overlay.innerHTML = `
    <div class="modal-content" style="text-align:center;max-width:420px;background:#fff;padding:18px;border-radius:10px">
      <h3>Resumen de operación</h3>
      <p style="font-size:18px;margin:10px 0">Procesadas: <strong>${successes}</strong></p>
      <p style="font-size:18px;margin:10px 0">Fallidas: <strong>${errors}</strong></p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
        <button id="summaryCloseBtn" class="btn-salidas" style="padding:8px 12px;border-radius:8px;border:none;cursor:pointer;background:#111;color:#fff">Cerrar</button>
        <button id="summaryViewBtn" class="btn-add" style="padding:8px 12px;border-radius:8px;border:none;cursor:pointer;background:#10b981;color:#fff">Ver historial</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("summaryCloseBtn").addEventListener("click", () => overlay.remove());
  document.getElementById("summaryViewBtn").addEventListener("click", () => { overlay.remove(); window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'}); });
}

// --------------------- NUEVOS HELPERS (mapa columnas productos / normalización) ---------------------
function normalizeKeyName(k) {
  return String(k || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

let _productosColMap = null;

async function ensureProductosColumnMap() {
  if (_productosColMap) return _productosColMap;
  try {
    const res = await supabase.from("productos").select("*").limit(1).maybeSingle();
    if (res && !res.error && res.data) {
      _productosColMap = Object.keys(res.data).reduce((acc, k) => {
        acc[normalizeKeyName(k)] = k;
        return acc;
      }, {});
    } else {
      _productosColMap = {};
    }
  } catch (e) {
    console.warn("ensureProductosColumnMap error:", e);
    _productosColMap = {};
  }
  return _productosColMap;
}

function getRealColForInventoryLabel(label) {
  if (!label) return null;
  const short = String(label).replace(/^inventario\s*/i, "").trim();
  const nk = normalizeKeyName(short);
  if (!_productosColMap) return null;
  if (_productosColMap[nk]) return _productosColMap[nk];
  const found = Object.keys(_productosColMap).find(k => k.includes(nk));
  return found ? _productosColMap[found] : null;
}
// -----------------------------------------------------------------------------------------------

// --- confirmAllPendings: ahora soporta items multi-origen ---
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
  const errorDetails = [];

  for (const item of pendientes.slice()) {
    try {
      const responsableFinal = ((item.RESPONSABLE_NOMBRE ?? "").trim() || "").length > 0
        ? `${(item.RESPONSABLE_NOMBRE ?? "").trim()} ${(item.RESPONSABLE_APELLIDO ?? "").trim()}`.trim()
        : (item.RESPONSABLE && String(item.RESPONSABLE).trim()) || (CURRENT_USER_FULLNAME || "Usuario");

      const observacionesFinal = item.OBSERVACIONES ?? "";
      const destinatarioFinal = item.DESTINATARIO ?? "";

      // si es multi -> iterar cada origen
      if (Array.isArray(item.ORIGENES) && item.ORIGENES.length > 0) {
        // validación: suma de ORIGENES == CANTIDAD
        const sum = item.ORIGENES.reduce((s, o) => s + (parseInt(o.CANTIDAD||0,10)||0), 0);
        const total = parseInt(item.CANTIDAD || sum, 10) || sum;
        if (sum !== total) {
          throw new Error(`La suma de orígenes (${sum}) no coincide con cantidad total (${total}) para ${item.CODIGO}`);
        }

        // procesar cada sub-partida serialmente (puedes paralelizar pero dejamos secuencial para simplicidad y orden)
        for (const origenObj of item.ORIGENES) {
          const qty = parseInt(origenObj.CANTIDAD || 0, 10);
          if (qty <= 0) continue;

          const rpcPayload = {
            in_codigo: item.CODIGO,
            in_descripcion: item.DESCRIPCION,
            in_cantidad: qty,
            in_responsable: responsableFinal,
            in_origen: origenObj.INVENTARIO_ORIGEN,
            in_observaciones: observacionesFinal,
            in_destinatario: destinatarioFinal
          };

          let rpcWorked = false;
          try {
            const rpcRes = await supabase.rpc("crear_salida", rpcPayload);
            if (!rpcRes.error) rpcWorked = true;
          } catch (eRpc) {
            console.warn("RPC crear_salida threw:", eRpc);
          }

          if (!rpcWorked) {
            // fallback: insertar en salidas y actualizar stock por columna real
            const salidaObj = {
              CODIGO: item.CODIGO,
              DESCRIPCION: item.DESCRIPCION,
              CANTIDAD_SALIDA: qty,
              FECHA_SALIDA: new Date().toISOString(),
              RESPONSABLE: responsableFinal,
              DESTINATARIO: destinatarioFinal,
              INVENTARIO_ORIGEN: origenObj.INVENTARIO_ORIGEN,
              OBSERVACIONES: observacionesFinal
            };

            const insertRes = await supabase.from("salidas").insert([salidaObj]);
            if (insertRes.error) {
              throw new Error("Insert a 'salidas' falló: " + (insertRes.error.message || JSON.stringify(insertRes.error)));
            }

            // actualizar stock por origen (intentamos detectar columna real)
            try {
              const prodRowRes = await supabase.from("productos").select("*").eq("CODIGO", item.CODIGO).maybeSingle();
              if (prodRowRes.error) throw prodRowRes.error;
              const prodRow = prodRowRes.data;
              if (prodRow) {
                await ensureProductosColumnMap();
                const realKey = getRealColForInventoryLabel(origenObj.INVENTARIO_ORIGEN) || getRealColForInventoryLabel('ALMACEN');
                if (realKey) {
                  const current = parseInt(prodRow[realKey] ?? 0, 10) || 0;
                  const nuevo = Math.max(0, current - qty);
                  const upd = {}; upd[realKey] = nuevo;
                  const updRes = await supabase.from("productos").update(upd).eq("CODIGO", item.CODIGO);
                  if (updRes.error) {
                    console.warn("Error actualizando stock (no crítico):", updRes.error);
                    errorDetails.push({ item, origen: origenObj, stockUpdateError: updRes.error });
                  } else {
                    console.info(`Stock actualizado: ${item.CODIGO} -> ${realKey} = ${nuevo}`);
                  }
                } else {
                  console.warn("No se pudo determinar columna para origen:", origenObj.INVENTARIO_ORIGEN);
                }
              } else {
                console.warn("Producto no encontrado al intentar actualizar stock:", item.CODIGO);
              }
            } catch (stockErr) {
              console.warn("Stock update failed for multi origin:", stockErr);
              errorDetails.push({ item, origen: origenObj, stockError: stockErr });
            }
          } // fin rpcWorked/fallback por origen

          // contar éxito por sub-partida
          successes++;
        } // fin for each origen

        // al terminar todas las sub-partidas quitamos el pendiente completo
        const list = getPendingSalidas();
        const idx = list.findIndex(p => p.ADDED_AT === item.ADDED_AT);
        if (idx >= 0) { list.splice(idx, 1); savePendingSalidas(list); }

      } else {
        // comportamiento single-origin (igual que antes)
        const availableSnapshot = parseInt(item.AVAILABLE || 0, 10);
        if (availableSnapshot > 0 && parseInt(item.CANTIDAD, 10) > availableSnapshot) {
          throw new Error(`Cantidad (${item.CANTIDAD}) mayor que stock disponible (${availableSnapshot}) en ${item.INVENTARIO_ORIGEN}`);
        }

        const rpcPayload = {
          in_codigo: item.CODIGO,
          in_descripcion: item.DESCRIPCION,
          in_cantidad: parseInt(item.CANTIDAD, 10),
          in_responsable: responsableFinal,
          in_origen: item.INVENTARIO_ORIGEN,
          in_observaciones: observacionesFinal,
          in_destinatario: destinatarioFinal
        };

        let rpcWorked = false;
        try {
          const rpcRes = await supabase.rpc("crear_salida", rpcPayload);
          if (!rpcRes.error) rpcWorked = true;
        } catch (eRpc) {
          console.warn("RPC crear_salida threw:", eRpc);
        }

        if (!rpcWorked) {
          const salidaObj = {
            CODIGO: item.CODIGO,
            DESCRIPCION: item.DESCRIPCION,
            CANTIDAD_SALIDA: parseInt(item.CANTIDAD, 10),
            FECHA_SALIDA: new Date().toISOString(),
            RESPONSABLE: responsableFinal,
            DESTINATARIO: destinatarioFinal,
            INVENTARIO_ORIGEN: item.INVENTARIO_ORIGEN,
            OBSERVACIONES: observacionesFinal
          };

          const insertRes = await supabase.from("salidas").insert([salidaObj]);
          if (insertRes.error) throw new Error("Insert a 'salidas' falló: " + (insertRes.error.message || JSON.stringify(insertRes.error)));

          // actualizar stock single origin (misma lógica previa)
          try {
            const prodRowRes = await supabase.from("productos").select("*").eq("CODIGO", item.CODIGO).maybeSingle();
            if (prodRowRes.error) throw prodRowRes.error;
            const prodRow = prodRowRes.data;
            if (prodRow) {
              await ensureProductosColumnMap();
              const realKey = getRealColForInventoryLabel(item.INVENTARIO_ORIGEN);
              if (realKey) {
                const current = parseInt(prodRow[realKey] ?? 0, 10) || 0;
                const nuevo = Math.max(0, current - parseInt(item.CANTIDAD, 10));
                const upd = {}; upd[realKey] = nuevo;
                const updRes = await supabase.from("productos").update(upd).eq("CODIGO", item.CODIGO);
                if (updRes.error) {
                  console.warn("Error actualizando stock en productos (no crítico):", updRes.error);
                  errorDetails.push({ item, stockUpdateError: updRes.error });
                } else {
                  console.info(`Stock actualizado: ${item.CODIGO} -> ${realKey} = ${nuevo}`);
                }
              } else {
                console.warn("No se pudo determinar columna de inventario para producto:", item.CODIGO, "inventario:", item.INVENTARIO_ORIGEN);
              }
            }
          } catch (stockErr) {
            console.warn("Stock update failed but salida inserted:", stockErr);
            errorDetails.push({ item, stockError: stockErr });
          }
        } else {
          successes++;
        }

        // quitar del listado pendiente
        const list = getPendingSalidas();
        const idx = list.findIndex(
          (s) =>
            s.CODIGO === item.CODIGO &&
            s.INVENTARIO_ORIGEN === item.INVENTARIO_ORIGEN &&
            ((s.RESPONSABLE_NOMBRE ?? "") === (item.RESPONSABLE_NOMBRE ?? "")) &&
            ((s.RESPONSABLE_APELLIDO ?? "") === (item.RESPONSABLE_APELLIDO ?? ""))
        );
        if (idx >= 0) { list.splice(idx, 1); savePendingSalidas(list); }
      }

    } catch (err) {
      console.error("Error procesando pendiente:", item, err);
      errors++;
      errorDetails.push({ item, error: (err && err.message) ? err.message : String(err) });
    }
  } // fin for pendientes

  if (btnConfirmAll) btnConfirmAll.disabled = false;
  await renderPendingList();
  await cargarHistorialSalidas();
  try { if (typeof updatePendingCount === "function") updatePendingCount(); } catch (e) { console.warn("updatePendingCount missing", e); }

  if (successes > 0 || errors > 0) {
    showSummaryModal(successes, errors);
  } else {
    showToast("No se procesaron salidas", false);
  }

  if (errorDetails.length > 0) {
    console.group("Detalles de errores confirmAllPendings");
    errorDetails.forEach(d => console.error(d));
    console.groupEnd();
  }
}

// --- Clear pending list ---
function clearAllPendings() {
  if (!confirm("¿Eliminar todas las salidas pendientes?")) return;
  savePendingSalidas([]);
  renderPendingList();
  updatePendingCountBadge();
  showAlert("Lista de salidas pendientes vaciada", true, 1800);
}

// ------------------- responsable from usuarios -------------------
async function setResponsableFromAuth() {
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
    return { full: capitalizeWords(`${first} ${last}`.trim()), first: capitalizeWords(first), last: capitalizeWords(last) };
  }

  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.warn("auth.getUser error:", authErr);
      CURRENT_USER_FULLNAME = "";
      CURRENT_USER_NOMBRE = "";
      CURRENT_USER_APELLIDO = "";
      if (nombreResponsableInput) nombreResponsableInput.value = "";
      return;
    }

    const user = authData?.user ?? null;
    if (!user) {
      CURRENT_USER_FULLNAME = "";
      CURRENT_USER_NOMBRE = "";
      CURRENT_USER_APELLIDO = "";
      if (nombreResponsableInput) {
        nombreResponsableInput.value = "";
        nombreResponsableInput.placeholder = "Usuario no autenticado";
      }
      return;
    }

    // intentar buscar fila en tabla 'usuarios' por id (primero) y luego por email si no existe
    let udata = null;
    try {
      // IMPORTANTE: aquí no dejamos COMA AL FINAL en el string select
      const resById = await supabase
        .from("usuarios")
        .select("nombre,apellido,nombre_completo,email")
        .eq("id", user.id)
        .limit(1)
        .maybeSingle();

      if (resById && !resById.error && resById.data) {
        udata = resById.data;
      } else {
        // intentar por email si no hubo fila por id
        if (user.email) {
          const resByEmail = await supabase
            .from("usuarios")
            .select("nombre,apellido,nombre_completo,email")
            .eq("email", user.email)
            .limit(1)
            .maybeSingle();

          if (resByEmail && !resByEmail.error && resByEmail.data) {
            udata = resByEmail.data;
          }
        }
      }
    } catch (errQ) {
      console.warn("Error consultando tabla usuarios:", errQ);
      udata = null;
    }

    if (udata) {
      const nombre = (udata.nombre || "").trim();
      const apellido = (udata.apellido || "").trim();
      const nombreCompleto = (udata.nombre_completo || "").trim();

      if (nombre || apellido) {
        CURRENT_USER_NOMBRE = capitalizeWords(nombre);
        CURRENT_USER_APELLIDO = capitalizeWords(apellido);
        CURRENT_USER_FULLNAME = `${CURRENT_USER_NOMBRE} ${CURRENT_USER_APELLIDO}`.trim();
      } else if (nombreCompleto) {
        const parts = nombreCompleto.trim().split(/\s+/);
        CURRENT_USER_NOMBRE = capitalizeWords(parts.shift() || "");
        CURRENT_USER_APELLIDO = capitalizeWords(parts.join(" ") || "");
        CURRENT_USER_FULLNAME = capitalizeWords(nombreCompleto);
      } else if (udata.email) {
        const parsed = nameFromEmail(udata.email);
        CURRENT_USER_FULLNAME = parsed.full;
        CURRENT_USER_NOMBRE = parsed.first;
        CURRENT_USER_APELLIDO = parsed.last;
      }
    } else {
      // fallback: usar metadata o email del auth user
      const fallback = user.user_metadata?.full_name ?? user.email ?? "";
      if (fallback && fallback.includes("@")) {
        const parsed = nameFromEmail(fallback);
        CURRENT_USER_FULLNAME = parsed.full;
        CURRENT_USER_NOMBRE = parsed.first;
        CURRENT_USER_APELLIDO = parsed.last;
      } else {
        const parts = String(fallback).trim().split(/\s+/);
        CURRENT_USER_NOMBRE = capitalizeWords(parts.shift() || "");
        CURRENT_USER_APELLIDO = capitalizeWords(parts.join(" ") || "");
        CURRENT_USER_FULLNAME = `${CURRENT_USER_NOMBRE} ${CURRENT_USER_APELLIDO}`.trim();
      }
    }

    // setear en input si existe
    if (nombreResponsableInput) {
      nombreResponsableInput.value = CURRENT_USER_FULLNAME || "";
      nombreResponsableInput.setAttribute("readonly", "true");
    }
  } catch (err) {
    console.warn("No se pudo obtener responsable desde auth:", err);
    CURRENT_USER_FULLNAME = "";
    CURRENT_USER_NOMBRE = "";
    CURRENT_USER_APELLIDO = "";
    try { if (nombreResponsableInput) nombreResponsableInput.value = ""; } catch {}
  }
}

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
  await renderPendingList();
  await cargarHistorialSalidas();
  await setResponsableFromAuth();

  // handler robusto para Refresh (deshabilita mientras carga, muestra toast)
  async function _refreshHandler(e) {
    const btn = e && e.currentTarget ? e.currentTarget : document.getElementById("btnRefresh");
    try {
      if (btn) btn.disabled = true;
      // refrescar historial y pendientes por si quieres ambos
      await cargarHistorialSalidas();
      await renderPendingList();
      showToast("Actualización completada", true, 1400);
    } catch (err) {
      console.error("Error en refresh:", err);
      showToast("Error al actualizar (ver consola)", false, 3000);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // función para (re)ligar listeners a los botones — segura si se llama varias veces
  function bindControlButtons() {
    const bConfirm = document.getElementById("btnConfirmAll");
    const bClear = document.getElementById("btnClearPending");
    const bRefresh = document.getElementById("btnRefresh");

    if (bConfirm) {
      // remover antes por si ya existen listeners duplicados
      try { bConfirm.removeEventListener("click", confirmAllPendings); } catch {}
      bConfirm.addEventListener("click", confirmAllPendings);
    }
    if (bClear) {
      try { bClear.removeEventListener("click", clearAllPendings); } catch {}
      bClear.addEventListener("click", clearAllPendings);
    }
    if (bRefresh) {
      try { bRefresh.removeEventListener("click", _refreshHandler); } catch {}
      bRefresh.addEventListener("click", _refreshHandler);
    }
  }

  // bind inmediato (en la mayoría de casos esto es suficiente)
  bindControlButtons();

  // caso SPA o botón inyectado más tarde: observar DOM y volver a ligar cuando aparezca btnRefresh
  const mo = new MutationObserver((mutations, obs) => {
    if (document.getElementById("btnRefresh")) {
      bindControlButtons();
      obs.disconnect(); // ya no necesitamos observar más
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
});

