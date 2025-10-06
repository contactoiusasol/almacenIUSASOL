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

// --- Helpers numéricos y formateo para decimales ---
function roundFloat(n, decimals = 6) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}
function formatQty(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(roundFloat(v, 6)).replace(/\.?0+$/, '');
}

// --- addPendingSalida: merges por codigo+origen+responsable nombre+apellido ---
function addPendingSalida(pendiente) {
  // Si viene como multi-orígenes (pendiente.ORIGENES = [{INVENTARIO_ORIGEN, CANTIDAD, AVAILABLE}, ...]),
  // lo añadimos como entrada independiente (no merge automático para evitar mezclar distribuciones).
  if (Array.isArray(pendiente.ORIGENES) && pendiente.ORIGENES.length > 0) {
    pendiente.ADDED_AT = pendiente.ADDED_AT || String(Date.now());
    // calcular cantidad total por seguridad (usar floats)
    pendiente.CANTIDAD = roundFloat(
      parseFloat(pendiente.CANTIDAD || pendiente.ORIGENES.reduce((s, o) => s + (parseFloat(o.CANTIDAD||0) || 0), 0)) || 0
    );
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
    // sumar como floats y redondear para evitar imprecisiones
    const existingQty = parseFloat(list[idx].CANTIDAD || 0) || 0;
    const incomingQty = parseFloat(pendiente.CANTIDAD || 0) || 0;
    list[idx].CANTIDAD = roundFloat(existingQty + incomingQty);
    list[idx].AVAILABLE = Math.min(list[idx].AVAILABLE ?? Infinity, pendiente.AVAILABLE ?? Infinity);
    if (pendiente.OBSERVACIONES) list[idx].OBSERVACIONES = ((list[idx].OBSERVACIONES || "") + " | " + pendiente.OBSERVACIONES).trim();
    if (pendiente.DESTINATARIO) list[idx].DESTINATARIO = pendiente.DESTINATARIO;
    list[idx].ADDED_AT = pendiente.ADDED_AT || list[idx].ADDED_AT || String(Date.now());
  } else {
    pendiente.ADDED_AT = pendiente.ADDED_AT || String(Date.now());
    // normalizar cantidad como float
    pendiente.CANTIDAD = roundFloat(parseFloat(pendiente.CANTIDAD || 0) || 0);
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
    // devolver como número (float)
    const val = data[colName];
    const parsed = parseFloat(String(val).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  } catch (err) {
    console.error("fetchStockForProduct error:", err);
    return null;
  }
}

// ------------------- Render pendientes (ahora async, con select editable y stock) ---
// --- Render pendientes (soporta items multi-origen) ---
async function renderPendingList() {
  if (!tablaPendientesBody) return;
  
  let tableContainer = tablaPendientesBody.closest('.salidas-table-container');
  if (!tableContainer) {
    const table = tablaPendientesBody.closest('table');
    if (table && table.id === "pendingTable") {
      tableContainer = document.createElement('div');
      tableContainer.className = 'salidas-table-container';
      table.parentNode.insertBefore(tableContainer, table);
      tableContainer.appendChild(table);
    }
  }

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
    const totalQty = roundFloat(
      parseFloat(item.CANTIDAD || (isMulti ? item.ORIGENES.reduce((s,o)=>s+ (parseFloat(o.CANTIDAD||0)||0),0) : 0)) || 0
    );

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
      <td class="col-cant">${escapeHtml(formatQty(totalQty))}</td>
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
        html += `<div class="multi-origin-row"><span style="width:110px">${escapeHtml(String(o.INVENTARIO_ORIGEN))}</span> — Cantidad: <strong>${escapeHtml(formatQty(parseFloat(o.CANTIDAD||0)||0))}</strong> (Disp: ${escapeHtml(formatQty(parseFloat(o.AVAILABLE||0)||0) || '-')})</div>`;
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
          if ((parseFloat(item.CANTIDAD || 0) || 0) > fetched) {
            const listLocal = getPendingSalidas();
            if (listLocal[idx]) {
              listLocal[idx].CANTIDAD = roundFloat(fetched);
              listLocal[idx].AVAILABLE = fetched;
              savePendingSalidas(listLocal);
            }
          }
        }
      })();
    }
  }
  

  

// delegación para eliminar (con modal estilo image.png)
tablaPendientesBody.querySelectorAll(".btn-remove").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const list = getPendingSalidas();
    if (!list[idx]) return;
    
    // Crear modal de confirmación
    const overlay = document.createElement("div");
    overlay.className = "delete-modal-overlay";
    
    overlay.innerHTML = `
      <div class="delete-modal-content">
        <div class="delete-modal-title">
          Eliminar ${list[idx].CODIGO} de la lista de salidas pendientes?
        </div>
        
        <div class="delete-modal-message">
          ¿Estás seguro de que quieres eliminar este elemento?
        </div>
        
        <div class="delete-modal-buttons">
          <button id="confirmDelete" class="delete-modal-btn-confirm">Eliminar</button>
          <button id="cancelDelete" class="delete-modal-btn-cancel">Cancelar</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Event listeners para los botones del modal
    document.getElementById('confirmDelete').addEventListener('click', () => {
      list.splice(idx, 1);
      savePendingSalidas(list);
      renderPendingList();
      updatePendingCountBadge();
      overlay.remove();
      showAlert("Salida eliminada de la lista", true, 1200);
    });
    
    document.getElementById('cancelDelete').addEventListener('click', () => {
      overlay.remove();
    });
    
    // Cerrar al hacer clic fuera del modal
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.remove();
      }
    });
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

  // helper: normaliza tokens (quita puntos, espacios y pone mayúsculas)
  function normalizeToken(t) {
    return String(t || "")
      .replace(/\./g, "")      // "U.M." -> "UM"
      .replace(/[,:;]$/g, "")  // quitar signos finales
      .trim()
      .toUpperCase();
  }

  // helper: detectar UM dentro de un item - VERSIÓN MEJORADA
  function detectUM(item) {
    const posiblesUM = [
      "PZA","PZ","PCS","M","M2","KG","G","JGO","L","MIL","CAJ","PAQ",
      "UN","UND","MT","CM","MM","LT","LTR","LTRO","KGF", "GALV"
    ];

    const keyCandidates = [
      "UM","U.M.","UNIDAD_MEDIDA","UNIDAD","Unidad","UNIDAD_DE_MEDIDA","MEDIDA","U","UNIDADMEDIDA"
    ];

    // 1) Buscar por claves conocidas
    for (const k of keyCandidates) {
      if (k in item && item[k] != null && String(item[k]).trim() !== "") {
        const raw = String(item[k]).trim();
        const tok = normalizeToken(raw);
        if (posiblesUM.includes(tok)) return tok;
        // extraer si viene como "10 kg" o "10kg"
        const m = raw.match(/([A-Za-z]{1,4})\.?$/);
        if (m) {
          const maybe = normalizeToken(m[1]);
          if (posiblesUM.includes(maybe)) return maybe;
        }
      }
    }

    // 2) BÚSQUEDA MEJORADA EN DESCRIPCIÓN
    const descripcion = item["DESCRIPCION"] ?? item["DESCRIPCIÓN"] ?? "";
    if (descripcion) {
      const descUpper = String(descripcion).toUpperCase();
      
      // Buscar patrones comunes de UM en descripción
      const umPatterns = [
        /\b(PZAS?|PIEZAS?)\b/i,
        /\b(KGS?|KILOS?|KILOGRAMOS?)\b/i,
        /\b(LTS?|LITROS?)\b/i,
        /\b(MTS?|METROS?)\b/i,
        /\b(CM|CENT[ÍI]METROS?)\b/i,
        /\b(MM|MIL[ÍI]METROS?)\b/i,
        /\b(UNDS?|UNIDADES?)\b/i,
        /\b(PARES?)\b/i,
        /\b(JGO|JUEGOS?)\b/i,
        /\b(ROLLOS?)\b/i,
        /\b(CAJAS?)\b/i,
        /\b(PAQUETES?)\b/i,
        /\b(MILES?)\b/i,
        /\b(GALV)\b/i
      ];
      
      for (const pattern of umPatterns) {
        const match = descripcion.match(pattern);
        if (match) {
          const umFound = match[1].toUpperCase();
          // Normalizar formas comunes
          if (umFound.match(/PZAS?|PIEZAS?/i)) return "PZA";
          if (umFound.match(/KGS?|KILOS?/i)) return "KG";
          if (umFound.match(/LTS?|LITROS?/i)) return "L";
          if (umFound.match(/MTS?|METROS?/i)) return "M";
          if (umFound.match(/CM|CENT[ÍI]METROS?/i)) return "CM";
          if (umFound.match(/UNDS?|UNIDADES?/i)) return "UND";
          if (umFound.match(/JGO|JUEGOS?/i)) return "JGO";
          if (umFound.match(/GALV/i)) return "GALV";
          return umFound;
        }
      }
      
      // Buscar UM al final de la descripción (patrón común)
      const endMatch = descUpper.match(/\s+([A-Z]{1,5})\s*$/);
      if (endMatch) {
        const endUM = normalizeToken(endMatch[1]);
        if (posiblesUM.includes(endUM)) return endUM;
      }
    }

    // 3) Revisar todos los valores del objeto buscando patrones
    for (const [key, rawVal] of Object.entries(item)) {
      if (rawVal == null) continue;
      const s = String(rawVal).trim();
      if (!s) continue;

      // patrón "10 kg" o "10.5kg"
      const numUnit = s.match(/^\s*\d+([.,]\d+)?\s*([A-Za-z]{1,4})\.?\s*$/);
      if (numUnit) {
        const u = normalizeToken(numUnit[2]);
        if (posiblesUM.includes(u)) return u;
      }

      // si el valor es exactamente la unidad "kg", "PZA"
      const onlyToken = s.replace(/[^A-Za-z]/g, "");
      if (onlyToken) {
        const u = normalizeToken(onlyToken);
        if (posiblesUM.includes(u)) return u;
      }

      // tokens sueltos dentro de la cadena ("Tornillo M8 PZA", "10 pcs")
      const tokens = s.split(/\s+|[,\-\/\(\)]+/).map(t => normalizeToken(t)).filter(Boolean);
      for (const t of tokens) {
        if (posiblesUM.includes(t)) return t;
      }
    }

    // Si no se encuentra, usar valor por defecto basado en el tipo de producto
    const desc = String(item["DESCRIPCION"] ?? item["DESCRIPCIÓN"] ?? "").toLowerCase();
    if (desc.includes("tornillo") || desc.includes("tuerca") || desc.includes("arandela")) return "PZA";
    if (desc.includes("galvanizado") || desc.includes("galv")) return "KG";
    if (desc.includes("lamin") || desc.includes("placa")) return "M2";
    if (desc.includes("tubo") || desc.includes("barra")) return "M";
    if (desc.includes("liquido") || desc.includes("pintura")) return "L";

    // nada detectado
    return "PZA"; // Valor por defecto en lugar de "-"
  }

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

      // AHORA se usa detectUM MEJORADA
      const um = detectUM(item);

      const inventario = item["INVENTARIO_ORIGEN"] ?? item["TIPO DE INVENTARIO"] ?? item["ORIGEN"] ?? "-";
      const cantidad = item["CANTIDAD_SALIDA"] ?? item["cantidad"] ?? item["CANTIDAD"] ?? "-";

      // CORRECCIÓN DEFINITIVA PARA FECHA/HORA - MÉTODO MÁS ROBUSTO
const fechaRaw = item["FECHA_SALIDA"] ?? item["fecha_salida"] ?? item["fecha"];
let fecha = "-";
if (fechaRaw) {
  const fechaObj = new Date(fechaRaw);
  // Ajuste a horario México con compensación automática
  const offset = fechaObj.getTimezoneOffset() * 60000; // en ms
  const fechaMexico = new Date(fechaObj.getTime() - offset);
  fecha = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Mexico_City"
  }).format(fechaMexico);
}

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

      // DEBUG: Mostrar en consola si no se detecta UM
      if (um === "PZA") { // Cambiado de "-" a "PZA" ya que ahora es el valor por defecto
        console.debug("UM detectada como valor por defecto para:", {
          codigo: codigo,
          descripcion: descripcion,
          um: um
        });
      }
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

// showConfirmModal: reemplazo no invasivo de window.confirm()
// Retorna Promise<boolean> exactamente como confirm -> true/false
function showConfirmModal({
  title = "Confirmar",
  message = "",
  confirmText = "Aceptar",
  cancelText = "Cancelar",
  danger = false
} = {}) {
  return new Promise((resolve) => {
    // si ya hay uno abierto devolvemos false para evitar duplicados
    if (document.querySelector(".custom-confirm-backdrop")) return resolve(false);

    const backdrop = document.createElement("div");
    backdrop.className = "custom-confirm-backdrop";

    const box = document.createElement("div");
    box.className = "custom-confirm" + (danger ? " danger" : "");

    box.innerHTML = `
      <div class="title">
        <span class="dot" aria-hidden="true"></span>
        <div style="font-size:16px">${title}</div>
      </div>
      <div class="message">${message}</div>
      <div class="actions">
        <button class="btn cancel" type="button">${cancelText}</button>
        <button class="btn confirm" type="button">${confirmText}</button>
      </div>
    `;

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    const btnCancel = box.querySelector(".btn.cancel");
    const btnConfirm = box.querySelector(".btn.confirm");

    // focus inicial en confirmar para comportamiento similar a confirm()
    btnConfirm.focus();

    // handlers
    const onCancel = () => cleanup(false);
    const onConfirm = () => cleanup(true);
    const onKey = (e) => {
      if (e.key === "Escape") cleanup(false);
      if (e.key === "Enter") cleanup(true);
    };
    const onBackdropClick = (e) => { if (e.target === backdrop) cleanup(false); };

    btnCancel.addEventListener("click", onCancel);
    btnConfirm.addEventListener("click", onConfirm);
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("click", onBackdropClick);

    // cleanup seguro y único
    let cleaned = false;
    function cleanup(val) {
      if (cleaned) return;
      cleaned = true;
      try {
        btnCancel.removeEventListener("click", onCancel);
        btnConfirm.removeEventListener("click", onConfirm);
        document.removeEventListener("keydown", onKey);
        backdrop.removeEventListener("click", onBackdropClick);
      } catch (e) { /* ignore */ }
      try { backdrop.remove(); } catch (e) { /* ignore */ }
      resolve(!!val);
    }
  });
}

// --- confirmAllPendings: ahora soporta items multi-origen (con decimales) ---
async function confirmAllPendings() {
  const pendientes = getPendingSalidas();
  if (!pendientes || pendientes.length === 0) {
    showToast("No hay salidas pendientes", false);
    return;
  }
 const okConfirmAll = await showConfirmModal({
  title: `Confirmar ${pendientes.length} salidas`,
  message: `¿Confirmar <strong>${pendientes.length}</strong> salidas pendientes y actualizar stock?`,
  confirmText: "Confirmar",
  cancelText: "Cancelar",
  danger: true
});
if (!okConfirmAll) return;


  if (btnConfirmAll) btnConfirmAll.disabled = true;
  let successes = 0;
  let errors = 0;
  const errorDetails = [];

  // helper local para redondear floats y evitar ruido por precisión
  const round = (v, d = 6) => {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return 0;
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
  };
  const EPS = 1e-6;

  for (const item of pendientes.slice()) {
    try {
      const responsableFinal = ((item.RESPONSABLE_NOMBRE ?? "").trim() || "").length > 0
        ? `${(item.RESPONSABLE_NOMBRE ?? "").trim()} ${(item.RESPONSABLE_APELLIDO ?? "").trim()}`.trim()
        : (item.RESPONSABLE && String(item.RESPONSABLE).trim()) || (CURRENT_USER_FULLNAME || "Usuario");

      const destinFinal = item.DESTINATARIO ?? "";
      const observBase = item.OBSERVACIONES ?? "";

      // si es multi -> iterar cada origen
      if (Array.isArray(item.ORIGENES) && item.ORIGENES.length > 0) {
        // validación: suma de ORIGENES == CANTIDAD (usar floats con tolerancia)
        const sum = item.ORIGENES.reduce((s, o) => s + (parseFloat(o.CANTIDAD || 0) || 0), 0);
        const total = parseFloat(item.CANTIDAD || sum) || sum;
        if (Math.abs(sum - total) > EPS) {
          throw new Error(`La suma de orígenes (${sum}) no coincide con cantidad total (${total}) para ${item.CODIGO}`);
        }

        // procesar cada sub-partida serialmente
        for (const origenObj of item.ORIGENES) {
          let qty = parseFloat(origenObj.CANTIDAD || 0) || 0;
          if (qty <= EPS) continue;

         const rpcPayload = {
  in_codigo: item.CODIGO,
  in_descripcion: item.DESCRIPCION,
  in_um: item.UM || detectUM(item), 
  in_cantidad: Number(qty),
  in_responsable: responsableFinal,
  in_origen: origenObj.INVENTARIO_ORIGEN,
  in_observaciones: observBase,
  in_destinatario: destinFinal
};

console.log("🔍 [RPC] Enviando:", rpcPayload);

          let rpcWorked = false;
          try {
            const rpcRes = await supabase.rpc("crear_salida", rpcPayload);
            if (!rpcRes.error) rpcWorked = true;
          } catch (eRpc) {
            console.warn("RPC crear_salida threw (multi):", eRpc);
          }

          if (!rpcWorked) {
            // Fallback: intentar insert; si falla por bigint, reintentar con entero redondeado y anotar original en observaciones
            const originalObs = observBase;
            let insertQty = qty;
            let triedRounded = false;
            let inserted = false;

            const tryInsert = async (useQty, extraObs) => {
  const salidaObj = {
    CODIGO: item.CODIGO,
    DESCRIPCION: item.DESCRIPCION,
    UM: item.UM || detectUM(item),
    CANTIDAD_SALIDA: useQty,
    FECHA_SALIDA: new Date().toISOString(),
    RESPONSABLE: responsableFinal,
    DESTINATARIO: destinFinal,
    INVENTARIO_ORIGEN: origenObj.INVENTARIO_ORIGEN,
    OBSERVACIONES: extraObs || originalObs
  };  
  const result = await supabase.from("salidas").insert([salidaObj]);
  return result;
};
            try {
              let res = await tryInsert(insertQty, originalObs);
              if (res.error) {
                // si el error parece por bigint, intentar con entero redondeado
                const msg = String(res.error?.message || res.error || "");
                if (/bigint|invalid input syntax for type bigint/i.test(msg)) {
                  triedRounded = true;
                  const roundedQty = Math.round(qty);
                  const extraObs = `${originalObs ? originalObs + " | " : ""}Cantidad original: ${qty} (redondeada a ${roundedQty} por compatibilidad)`;
                  res = await tryInsert(roundedQty, extraObs);
                  if (!res.error) {
                    inserted = true;
                    modalToast(`Nota: la cantidad ${qty} fue redondeada a ${roundedQty} al insertar (columna bigint).`, false, 4500, false);
                  } else {
                    // aún error
                    throw new Error("Insert a 'salidas' falló: " + (res.error.message || JSON.stringify(res.error)));
                  }
                } else {
                  // otro fallo al insertar
                  throw new Error("Insert a 'salidas' falló: " + (res.error.message || JSON.stringify(res.error)));
                }
              } else {
                inserted = true;
              }
            } catch (insErr) {
              console.warn("Insert fallback (multi) error:", insErr);
              throw insErr;
            }

            // si insert succeeded (inserted === true) entonces actualizamos stock (intentamos con float; si falla por bigint repetimos con rounded)
            if (inserted) {
              try {
                const prodRowRes = await supabase.from("productos").select("*").eq("CODIGO", item.CODIGO).maybeSingle();
                if (prodRowRes.error) throw prodRowRes.error;
                const prodRow = prodRowRes.data;
                if (prodRow) {
                  await ensureProductosColumnMap();
                  const realKey = getRealColForInventoryLabel(origenObj.INVENTARIO_ORIGEN) || getRealColForInventoryLabel('ALMACEN');
                  if (realKey) {
                    // intentar floatear
                    const current = parseFloat(prodRow[realKey] ?? 0) || 0;
                    const nuevoFloat = Math.max(0, round(current - qty));
                    const upd = {}; upd[realKey] = nuevoFloat;
                    const updRes = await supabase.from("productos").update(upd).eq("CODIGO", item.CODIGO);
                    if (updRes.error) {
                      // si el error menciona bigint, reintentar con entero redondeado
                      const msg = String(updRes.error?.message || updRes.error || "");
                      if (/bigint|invalid input syntax for type bigint/i.test(msg)) {
                        const roundedQty = Math.round(qty);
                        const nuevoInt = Math.max(0, Math.round(current) - roundedQty);
                        const upd2 = {}; upd2[realKey] = nuevoInt;
                        const updRes2 = await supabase.from("productos").update(upd2).eq("CODIGO", item.CODIGO);
                        if (updRes2.error) {
                          console.warn("Error actualizando stock (multi, rounded) :", updRes2.error);
                          errorDetails.push({ item, origen: origenObj, stockUpdateError: updRes2.error });
                        } else {
                          console.info(`Stock actualizado (rounded): ${item.CODIGO} -> ${realKey} = ${nuevoInt}`);
                        }
                      } else {
                        console.warn("Error actualizando stock (multi):", updRes.error);
                        errorDetails.push({ item, origen: origenObj, stockUpdateError: updRes.error });
                      }
                    } else {
                      console.info(`Stock actualizado: ${item.CODIGO} -> ${realKey} = ${nuevoFloat}`);
                    }
                  } else {
                    console.warn("No se pudo determinar columna para origen (multi):", origenObj.INVENTARIO_ORIGEN);
                  }
                } else {
                  console.warn("Producto no encontrado al intentar actualizar stock (multi):", item.CODIGO);
                }
              } catch (stockErr) {
                console.warn("Stock update failed for multi origin:", stockErr);
                errorDetails.push({ item, origen: origenObj, stockError: stockErr });
              }
            }
          } // fin fallback insert

          // contar éxito por sub-partida
          successes++;
        } // fin for each origen

        // al terminar todas las sub-partidas quitamos el pendiente completo
        const list = getPendingSalidas();
        const idx = list.findIndex(p => p.ADDED_AT === item.ADDED_AT);
        if (idx >= 0) { list.splice(idx, 1); savePendingSalidas(list); }

      } else {
        // comportamiento single-origin (ahora con decimales manejados)
        let requested = parseFloat(item.CANTIDAD || 0) || 0;
        const availableSnapshot = parseFloat(item.AVAILABLE || 0) || 0;
        if (availableSnapshot > 0 && requested - availableSnapshot > EPS) {
          throw new Error(`Cantidad (${requested}) mayor que stock disponible (${availableSnapshot}) en ${item.INVENTARIO_ORIGEN}`);
        }

        const rpcPayload = {
          in_codigo: item.CODIGO,
          in_descripcion: item.DESCRIPCION,
          UM: item.UM || detectUM(item), 
          in_cantidad: Number(requested),
          in_responsable: responsableFinal,
          in_origen: item.INVENTARIO_ORIGEN,
          in_observaciones: observBase,
          in_destinatario: destinFinal
        };

        let rpcWorked = false;
        try {
          const rpcRes = await supabase.rpc("crear_salida", rpcPayload);
          if (!rpcRes.error) rpcWorked = true;
        } catch (eRpc) {
          console.warn("RPC crear_salida threw (single):", eRpc);
        }

        if (!rpcWorked) {
          // fallback insert + manejo bigint si aplica
          const originalObs = observBase;
          let inserted = false;
          const tryInsertSingle = async (useQty, extraObs) => {
  const salidaObj = {
    CODIGO: item.CODIGO,
    DESCRIPCION: item.DESCRIPCION,
    UM: item.UM || detectUM(item),
    CANTIDAD_SALIDA: useQty,
    FECHA_SALIDA: new Date().toISOString(),
    RESPONSABLE: responsableFinal,
    DESTINATARIO: destinFinal,
    INVENTARIO_ORIGEN: item.INVENTARIO_ORIGEN,
    OBSERVACIONES: extraObs || originalObs
  };
    
  const result = await supabase.from("salidas").insert([salidaObj]);
  
  return result;
};

          try {
            let res = await tryInsertSingle(requested, originalObs);
            if (res.error) {
              const msg = String(res.error?.message || res.error || "");
              if (/bigint|invalid input syntax for type bigint/i.test(msg)) {
                // reintentar con entero redondeado y anotar original
                const roundedQty = Math.round(requested);
                const extraObs = `${originalObs ? originalObs + " | " : ""}Cantidad original: ${requested} (redondeada a ${roundedQty} por compatibilidad)`;
                const res2 = await tryInsertSingle(roundedQty, extraObs);
                if (res2.error) {
                  throw new Error("Insert a 'salidas' falló: " + (res2.error.message || JSON.stringify(res2.error)));
                } else {
                  inserted = true;
                  modalToast(`Nota: la cantidad ${requested} fue redondeada a ${roundedQty} al insertar (columna bigint).`, false, 4500, false);
                }
              } else {
                throw new Error("Insert a 'salidas' falló: " + (res.error.message || JSON.stringify(res.error)));
              }
            } else {
              inserted = true;
            }
          } catch (insErr) {
            console.warn("Insert fallback (single) error:", insErr);
            throw insErr;
          }

          // si insert succeeded, actualizar stock (intentamos float; si falla por bigint reintentar con integer)
          if (inserted) {
            try {
              const prodRowRes = await supabase.from("productos").select("*").eq("CODIGO", item.CODIGO).maybeSingle();
              if (prodRowRes.error) throw prodRowRes.error;
              const prodRow = prodRowRes.data;
              if (prodRow) {
                await ensureProductosColumnMap();
                const realKey = getRealColForInventoryLabel(item.INVENTARIO_ORIGEN);
                if (realKey) {
                  const current = parseFloat(prodRow[realKey] ?? 0) || 0;
                  const nuevoFloat = Math.max(0, round(current - requested));
                  const upd = {}; upd[realKey] = nuevoFloat;
                  const updRes = await supabase.from("productos").update(upd).eq("CODIGO", item.CODIGO);
                  if (updRes.error) {
                    const msg = String(updRes.error?.message || updRes.error || "");
                    if (/bigint|invalid input syntax for type bigint/i.test(msg)) {
                      const roundedQty = Math.round(requested);
                      const nuevoInt = Math.max(0, Math.round(current) - roundedQty);
                      const upd2 = {}; upd2[realKey] = nuevoInt;
                      const updRes2 = await supabase.from("productos").update(upd2).eq("CODIGO", item.CODIGO);
                      if (updRes2.error) {
                        console.warn("Error actualizando stock (single, rounded):", updRes2.error);
                        errorDetails.push({ item, stockUpdateError: updRes2.error });
                      } else {
                        console.info(`Stock actualizado (rounded): ${item.CODIGO} -> ${realKey} = ${nuevoInt}`);
                      }
                    } else {
                      console.warn("Error actualizando stock (single):", updRes.error);
                      errorDetails.push({ item, stockUpdateError: updRes.error });
                    }
                  } else {
                    console.info(`Stock actualizado: ${item.CODIGO} -> ${realKey} = ${nuevoFloat}`);
                  }
                } else {
                  console.warn("No se pudo determinar columna de inventario para producto (single):", item.CODIGO, "inventario:", item.INVENTARIO_ORIGEN);
                }
              }
            } catch (stockErr) {
              console.warn("Stock update failed but salida inserted (single):", stockErr);
              errorDetails.push({ item, stockError: stockErr });
            }
          }

          // contar éxito en fallback
          successes++;
        } else {
          // rpcWorked === true => contamos éxito
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

async function clearAllPendings() {
  const okClear = await showConfirmModal({
    title: "Vaciar pendientes",
    message: "¿Eliminar todas las salidas pendientes?",
    confirmText: "Eliminar",
    cancelText: "Cancelar",
    danger: true
  });
  if (!okClear) return;
  savePendingSalidas([]);
  renderPendingList();
  updatePendingCountBadge();
  showAlert("Lista de salidas pendientes vaciada", true, 1800);
}


// ------------------- responsable from usuarios -------------------
async function setResponsableFromAuth() {
  if (nombreResponsableInput) nombreResponsableInput.setAttribute("readonly", "true");

  const capitalizeWords = s => String(s||"").trim().split(/\s+/).map(w => w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" ");
  const nameFromEmail = (email) => {
    if (!email) return { full:"", first:"", last:"" };
    const local = String(email).split("@")[0].replace(/[._-]+/g," ").trim();
    const parts = local.split(/\s+/).filter(Boolean);
    const first = parts.shift() || "";
    const last = parts.join(" ") || "";
    return { full: capitalizeWords(`${first} ${last}`.trim()), first: capitalizeWords(first), last: capitalizeWords(last) };
  };

  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.warn("auth.getUser error:", authErr);
      if (nombreResponsableInput) nombreResponsableInput.value = "";
      return;
    }
    const user = authData?.user ?? null;
    if (!user) {
      if (nombreResponsableInput) {
        nombreResponsableInput.value = "";
        nombreResponsableInput.placeholder = "Usuario no autenticado";
      }
      return;
    }

    // Primero intentar buscar por EMAIL (es lo más seguro)
    let udata = null;
    try {
      if (user.email) {
        const byEmail = await supabase.from("usuarios").select("email,nombre,apellido").eq("email", user.email).limit(1).maybeSingle();
        if (!byEmail.error && byEmail.data) {
          udata = byEmail.data;
        } else if (byEmail.error) {
          // si hay error en byEmail, lo logueamos pero no abortamos
          console.warn("Consulta usuarios por email devolvió error:", byEmail.error);
        }
      }
    } catch (e) {
      console.warn("Error consultando usuarios por email:", e);
    }

    // Si no encontramos por email, intentar buscar por ID SOLO si user.id es numérico
    if (!udata && user.id) {
      const maybeIntId = parseInt(String(user.id), 10);
      if (!Number.isNaN(maybeIntId)) {
        try {
          const byId = await supabase.from("usuarios").select("email,nombre,apellido").eq("id", maybeIntId).limit(1).maybeSingle();
          if (!byId.error && byId.data) {
            udata = byId.data;
          } else if (byId.error) {
            console.warn("Consulta usuarios por id (numérico) devolvió error:", byId.error);
          }
        } catch (e2) {
          console.warn("Error consultando usuarios por id (numérico):", e2);
        }
      } else {
        // user.id NO es numérico -> avisamos y no intentamos comparar tipos distintos
        console.warn("Omitido lookup por id: user.id parece UUID y la columna usuarios.id es numérica — se buscará por email en su lugar.");
      }
    }

    // decidir finalEmail y fullname
    let finalEmail = user.email || null;
    if (udata && udata.email) finalEmail = udata.email;

    // armar nombre completo como fallback si no hay email
    let fullname = "";
    if (udata) {
      const nombre = (udata.nombre||"").trim();
      const apellido = (udata.apellido||"").trim();
      if (nombre || apellido) fullname = `${capitalizeWords(nombre)} ${capitalizeWords(apellido)}`.trim();
      else if (udata.email) fullname = nameFromEmail(udata.email).full;
    } else {
      // usar metadata o email del auth si no hay fila en usuarios
      const fallback = user.user_metadata?.full_name ?? user.email ?? "";
      if (fallback && fallback.includes("@")) fullname = nameFromEmail(fallback).full;
      else fullname = capitalizeWords(String(fallback || ""));
    }

    // setear en input: preferimos email, si no fullname
    if (nombreResponsableInput) {
      nombreResponsableInput.value = finalEmail || fullname || "";
      nombreResponsableInput.setAttribute("readonly", "true");
    }

    // Devuelve el email para uso posterior si se necesita (por ejemplo, copiar al modal)
    return finalEmail || null;
  } catch (err) {
    console.error("setResponsableFromAuth - excepción final:", err);
    if (nombreResponsableInput) nombreResponsableInput.value = "";
    return null;
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
