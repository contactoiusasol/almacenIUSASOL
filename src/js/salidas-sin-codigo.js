// salidas-sin-codigo.js
// Versión integrada: gestiona "salidas sin código": pendientes (localStorage), proceso a DB y ajuste de stock.
// Requiere @supabase/supabase-js v2 (import en tu HTML o bundler).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// -------------------- CONFIG SUPABASE --------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
let supabase;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
  // Fallback: si ya existe window.supabase (por ejemplo inyectado globalmente)
  if (window.supabase && typeof window.supabase.createClient === "function") {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    console.error("No se pudo inicializar Supabase.", e);
    supabase = null;
  }
}

// -------------------- SELECTORES DOM --------------------
const tablaPendientesBody = document.querySelector("#pendingTable tbody");
const tablaHistorialBody = document.querySelector("#salidasTable tbody");
const btnConfirmAll = document.getElementById("btnConfirmAll");
const btnClearPending = document.getElementById("btnClearPending");
const btnRefresh = document.getElementById("btnRefresh");
const nombreResponsableInput = document.getElementById("nombreResponsable");

// -------------------- CONSTANTES / ESTADO --------------------
const PENDING_KEY = "salidas_sin_codigo_pendientes";
let CURRENT_USER_FULLNAME = "";
let _productosSinCodigoColMap = null; // mapa column name normalizado -> real

// -------------------- UTILIDADES --------------------
function nl(v){ return v === null || v === undefined ? "" : String(v); }
function toNumber(v){
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
function roundFloat(n, decimals=6){
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
function formatQty(n){ 
  if (n === null || n === undefined) return "0";
  return String(n);
}
function normalizeKeyName(k){ return String(k||"").replace(/[^a-z0-9]/gi,"").toLowerCase(); }

// -------------------- MENSAJES / MODALES --------------------
function showAlert(message, success=true, autoCloseMs=2500){
  const id = "globalAlertOverlay";
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.style.position = "fixed";
  overlay.style.top = "18px";
  overlay.style.right = "18px";
  overlay.style.zIndex = "22000";
  overlay.style.minWidth = "220px";
  overlay.style.padding = "12px 14px";
  overlay.style.borderRadius = "10px";
  overlay.style.boxShadow = "0 8px 24px rgba(2,6,23,0.08)";
  overlay.style.background = success ? "linear-gradient(90deg,#ecfdf5,#bbf7d0)" : "linear-gradient(90deg,#fee2e2,#fecaca)";
  overlay.style.fontFamily = "Inter, system-ui, 'Quicksand', sans-serif";
  overlay.style.fontSize = "13px";
  overlay.textContent = message;
  document.body.appendChild(overlay);
  if (autoCloseMs && autoCloseMs>0) overlay._t = setTimeout(()=>overlay.remove(), autoCloseMs);
  overlay.addEventListener("click", ()=> overlay.remove());
}
function showToast(msg, ok=true){ showAlert(msg, ok); }

function showConfirmModal({ title="Confirmar", message="", confirmText="Aceptar", cancelText="Cancelar", danger=false } = {}) {
  return new Promise((resolve) => {
    if (document.querySelector(".custom-confirm-backdrop")) return resolve(false);
    const backdrop = document.createElement("div");
    backdrop.className = "custom-confirm-backdrop";
    Object.assign(backdrop.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.35)', zIndex:22000 });
    const box = document.createElement("div");
    box.className = "custom-confirm";
    box.style.cssText = "background:#fff;padding:16px;border-radius:10px;max-width:520px;width:92%;box-shadow:0 12px 36px rgba(2,6,23,0.12);";
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">${escapeHtml(title)}</div>
      <div style="margin-bottom:12px">${escapeHtml(message)}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="cancel-btn" style="padding:8px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;cursor:pointer">${escapeHtml(cancelText)}</button>
        <button class="confirm-btn" style="padding:8px 12px;border-radius:8px;border:none;cursor:pointer;background:${danger? '#ef4444':'#10b981'};color:#fff">${escapeHtml(confirmText)}</button>
      </div>
    `;
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    box.querySelector('.cancel-btn').addEventListener('click', ()=>{ backdrop.remove(); resolve(false); });
    box.querySelector('.confirm-btn').addEventListener('click', ()=>{ backdrop.remove(); resolve(true); });
    backdrop.addEventListener('click', (e)=>{ if (e.target===backdrop){ backdrop.remove(); resolve(false); }});
  });
}

// -------------------- localStorage PENDIENTES --------------------
function getPendingSalidas(){ try { const raw = localStorage.getItem(PENDING_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } }
function savePendingSalidas(list){ localStorage.setItem(PENDING_KEY, JSON.stringify(list)); }

// -------------------- MAPEO COLUMNAS productos_sin_codigo --------------------
async function ensureProductosSinCodigoColumnMap(){
  if (_productosSinCodigoColMap) return _productosSinCodigoColMap;
  _productosSinCodigoColMap = {};
  if (!supabase) return _productosSinCodigoColMap;
  try {
    const { data, error } = await supabase.from("productos_sin_codigo").select("*").limit(1);
    if (error) {
      console.warn("ensureProductosSinCodigoColumnMap error:", error);
      return _productosSinCodigoColMap;
    }
    if (data && data.length>0){
      const sample = data[0];
      Object.keys(sample).forEach(k => { _productosSinCodigoColMap[ normalizeKeyName(k) ] = k; });
    }
  } catch(e){ console.warn(e); }
  return _productosSinCodigoColMap;
}

function getRealColForInventoryLabel(invLabel){
  if (!invLabel) return null;
  if (!_productosSinCodigoColMap) return null;
  const candidates = [
    `INVENTARIO ${invLabel}`,
    `INVENTARIO_${invLabel}`,
    `${invLabel}`,
    invLabel.toLowerCase(),
    `inventario_${invLabel.toLowerCase()}`,
    `inventario ${invLabel}`
  ];
  for (const c of candidates){
    const nk = normalizeKeyName(c);
    if (_productosSinCodigoColMap[nk]) return _productosSinCodigoColMap[nk];
  }
  // fallback: any key that contains 'inventario' and invLabel
  for (const k in _productosSinCodigoColMap){
    if (k.includes("inventario") && k.includes(normalizeKeyName(invLabel))) return _productosSinCodigoColMap[k];
  }
  // last fallback any inventory column
  for (const k in _productosSinCodigoColMap){
    if (k.includes("inventario")) return _productosSinCodigoColMap[k];
  }
  return null;
}

// -------------------- BUSCAR stock columna dinámica --------------------
async function fetchStockForProduct(codigo, inventoryColLabel){
  if (!supabase || !codigo) return null;
  try {
    const { data, error } = await supabase.from("productos_sin_codigo").select("*").eq("CODIGO", codigo).maybeSingle();
    if (error || !data) return null;
    const keys = Object.keys(data);
    const requested = (inventoryColLabel || "").toUpperCase().replace(/^INVENTARIO\s*/i,"");
    const variants = [
      `INVENTARIO ${requested}`,
      `inventario_${requested.toLowerCase()}`,
      requested
    ];
    for (const v of variants){
      const found = keys.find(k => k.toLowerCase() === v.toLowerCase());
      if (found) return toNumber(data[found]);
    }
    // fallback: any key that contains 'inventario'
    const anyInv = keys.find(k => k.toLowerCase().includes("inventario"));
    if (anyInv) return toNumber(data[anyInv]);
    return null;
  } catch (err) {
    console.error("fetchStockForProduct error:", err);
    return null;
  }
}

// -------------------- RENDER PENDIENTES / BADGE --------------------
function updatePendingCountBadge(){
  const btn = document.getElementById("btnConfirmAll");
  const count = getPendingSalidas().length;

  // badge (crear si no existe)
  let badge = document.getElementById("pendingCountBadge");
  if (!badge && btn) {
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
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-block" : "none";
  }

  // Deshabilitar/activar botón Confirmar según exista al menos 1 pendiente
  if (btn) {
    btn.disabled = (count === 0);
    if (count === 0) {
      btn.title = "No hay salidas pendientes para procesar";
      btn.classList && btn.classList.add('disabled');
    } else {
      btn.title = "";
      btn.classList && btn.classList.remove('disabled');
    }
  }
}

// SOLUCIÓN: Eliminar la función duplicada y mantener solo una versión
async function renderPendingList(){
  if (!tablaPendientesBody) return;
  // minimal inline styles (solo una vez)
  if (!document.getElementById("salidas-sin-codigo-styles")){
    const s = document.createElement("style");
    s.id = "salidas-sin-codigo-styles";
    s.textContent = `
      #pendingTable td { vertical-align: middle; white-space: nowrap; }
      .btn-remove-pend { background:#ef4444;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer }
      .empty-note { text-align:center;color:#666;padding:8px; }
      .col-desc, .col-obs, .col-resp, .col-dest { white-space: normal; overflow-wrap:anywhere; word-break:break-word; }
      .acciones { display:flex; justify-content:flex-end; gap:8px; }
      .col-cant { text-align: center; font-weight: bold; }
    `;
    document.head.appendChild(s);
  }

  const list = getPendingSalidas();
  tablaPendientesBody.innerHTML = "";

  if (!list || list.length === 0){
    tablaPendientesBody.innerHTML = `<tr><td colspan="9" class="empty-note">No hay salidas pendientes</td></tr>`;
    updatePendingCountBadge();
    try { updateVerSalidasBadge(0); } catch(e){/* noop */ }
    return;
  }

  for (let i=0;i<list.length;i++){
    const it = list[i];
    const codigo = (it.CODIGO && String(it.CODIGO).trim() !== "") ? String(it.CODIGO) : "S/C";
    
    // 🔥 CORRECIÓN: Mostrar la cantidad completa sin formateo
    let cantidad = it.CANTIDAD || 0;
    // Si es un número, convertirlo a string sin redondeo
    if (typeof cantidad === 'number') {
      cantidad = String(cantidad);
    } else {
      cantidad = String(cantidad || 0);
    }
    
    const inventarioRaw = it.INVENTARIO_ORIGEN ?? it.inventario_origen ?? "";
    const inventarioLabel = String(inventarioRaw || "").toUpperCase().replace(/^INVENTARIO\s*/i,'INVENTARIO ');
    const invColor = typeof invColorFor === 'function' ? invColorFor(inventarioRaw) : '#6b7280';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(codigo)}</td>
      <td class="col-desc">${escapeHtml(it.DESCRIPCION || "")}</td>
      <td>${escapeHtml(it.UM || "")}</td>
      <td class="col-inv">
        <span class="inv-select-wrap">
          <span class="inv-dot" style="background:${invColor}"></span>
          <span class="inv-label">${escapeHtml(inventarioLabel)}</span>
        </span>
      </td>
      <td class="col-cant text-center">${escapeHtml(cantidad)}</td>
      <td class="col-resp">${escapeHtml(it.RESPONSABLE || "")}</td>
      <td class="col-dest">${escapeHtml(it.DESTINATARIO || "")}</td>
      <td class="col-obs">${escapeHtml(it.OBSERVACIONES || "")}</td>
      <td class="col-acc acciones"><button class="btn-remove-pend btn-delete" data-idx="${i}">Eliminar</button></td>
    `;
    tablaPendientesBody.appendChild(tr);
  }

  // attach events for remove
  tablaPendientesBody.querySelectorAll(".btn-remove-pend").forEach(b => {
    b.addEventListener("click", (e) => {
      const idx = Number(e.currentTarget.dataset.idx);
      const listNow = getPendingSalidas();
      if (!listNow[idx]) return;
      listNow.splice(idx,1);
      savePendingSalidas(listNow);
      renderPendingList();
      updatePendingCountBadge();
      try { updateVerSalidasBadge(listNow.length); } catch(e){/* noop */ }
    });
  });

  // actualizar badge y estado del botón Confirmar
  updatePendingCountBadge();
  try { updateVerSalidasBadge(list.length); } catch(e){/* noop */ }
}

// SOLUCIÓN: Eliminar la función duplicada y mantener solo una versión
function addPendingSalida(pendiente){
  // pendiente: { CODIGO?, DESCRIPCION, CANTIDAD, UM, INVENTARIO_ORIGEN, RESPONSABLE, DESTINATARIO, OBSERVACIONES, ORIGENES? }
  const list = getPendingSalidas();
  pendiente.id = pendiente.id || String(Date.now());
  
  // 🔥 CORRECIÓN: No redondear la cantidad, guardar el valor exacto
  pendiente.CANTIDAD = Number(pendiente.CANTIDAD || 0);
  pendiente.ADDED_AT = pendiente.ADDED_AT || (new Date()).toISOString();
  list.push(pendiente);
  savePendingSalidas(list);
  showToast("Salida agregada a pendientes", true);
  renderPendingList();
}

// -------------------- processPendings --------------------
async function processPendings(items) {
  if (!supabase) { showToast("Supabase no inicializado", false); return { successes:0, errors: items.length }; }
  await ensureProductosSinCodigoColumnMap();

  let successes = 0, errors = 0, errorItems = [];

  for (const it of items) {
    try {
      const insertObj = {
        descripcion: it.DESCRIPCION || it.CODIGO || "",
        cantidad_salida: Number(it.CANTIDAD || it.CANTIDAD_SALIDA || 0),
        fecha_salida: (new Date()).toISOString(),
        responsable: it.RESPONSABLE || null,
        UM: it.UM || null,
        inventario_origen: it.INVENTARIO_ORIGEN || it.inventario_origen || null,
        destinatario: it.DESTINATARIO || it.destinatario || null,
        observaciones: it.OBSERVACIONES || it.observaciones || null
      };

      const { data: insData, error: insErr } = await supabase.from("salidas_sin_codigo").insert([insertObj]);
      if (insErr) {
        console.error("Error insert salidas_sin_codigo:", insErr, insertObj);
        throw insErr;
      }

      const qty = Number(it.CANTIDAD || it.CANTIDAD_SALIDA || 0);
      if (qty > 0) {
        let prodRow = null;

        if (it.PRODUCT_ID) {
          const sel = await supabase.from("productos_sin_codigo").select("*").eq("id", it.PRODUCT_ID).maybeSingle();
          if (!sel.error) prodRow = sel.data;
          else console.warn("Error buscando por PRODUCT_ID:", sel.error);
        }

        if (!prodRow && it.CODIGO && String(it.CODIGO).trim() !== "" && String(it.CODIGO).trim().toUpperCase() !== "S/C") {
          const sel = await supabase.from("productos_sin_codigo").select("*").ilike("CODIGO", String(it.CODIGO).trim()).limit(1).maybeSingle();
          if (!sel.error) prodRow = sel.data;
          else console.warn("Error buscando por CODIGO:", sel.error);
        }

        if (!prodRow && it.DESCRIPCION && String(it.DESCRIPCION).trim() !== "") {
          const q = String(it.DESCRIPCION).replace(/'/g, "''");
          const sel = await supabase.from("productos_sin_codigo").select("*").ilike("DESCRIPCION", `%${q}%`).limit(1).maybeSingle();
          if (!sel.error) prodRow = sel.data;
          else console.warn("Error buscando por DESCRIPCION:", sel.error);
        }

        if (!prodRow) {
          console.warn("processPendings: No se encontró producto para decrementar stock. Pendiente:", it);
        } else {
          const invLabelRaw = it.INVENTARIO_ORIGEN || it.inventario_origen || "ALMACEN";
          const invLabel = String(invLabelRaw || "").replace(/^INVENTARIO\s*/i,"").trim();
          let colName = getRealColForInventoryLabel(invLabel);

          if (!colName) {
            const anyInv = Object.keys(prodRow).find(k => k.toLowerCase().includes("inventario"));
            if (anyInv) colName = anyInv;
          }

          if (!colName) {
            console.warn("processPendings: No se pudo resolver columna inventario para producto id=" + prodRow.id + ". Keys:", Object.keys(prodRow));
          } else {
            const currentVal = toNumber(prodRow[colName]);
            const nuevo = Math.max(0, roundFloat(currentVal - qty));
            const upd = {}; upd[colName] = nuevo;
            const { error: updErr } = await supabase.from("productos_sin_codigo").update(upd).eq("id", prodRow.id);
            if (updErr) {
              console.error("Error actualizando producto stock:", updErr, { id: prodRow.id, colName, nuevo, upd });
            } else {
              console.debug("Stock actualizado OK:", { id: prodRow.id, colName, before: currentVal, after: nuevo });
            }
          }
        }
      }

      successes++;
    } catch (err) {
      console.error("processPendings item err:", err, it);
      errors++;
      errorItems.push({ item: it, error: err });
    }
  }

  return { successes, errors, errorItems };
}

// -------------------- VACIAR PENDIENTES (función dedicada) --------------------
async function clearAllPendings(){
  const list = getPendingSalidas();
  if (!list || list.length === 0) {
    // Si no hay pendientes, avisar y salir (sin modal)
    showToast("No hay salidas pendientes para eliminar.", false);
    return;
  }

  // Si hay, pedir confirmación
  const ok = await showConfirmModal({
    title: "Limpiar pendientes",
    message: `¿Eliminar las ${list.length} salidas pendientes? Esta acción no puede deshacerse.`,
    confirmText: "Eliminar",
    cancelText: "Cancelar",
    danger: true
  });

  if (!ok) return;

  // Limpiar, renderizar y notificar
  savePendingSalidas([]);
  await renderPendingList();
  updatePendingCountBadge();
  try { updateVerSalidasBadge(0); } catch(e){/* noop */ }
  showToast("Pendientes eliminadas", true);
}

// -------------------- INTERFACE: Confirmar todas pendientes --------------------
async function confirmAllPendings(){
  const list = getPendingSalidas();
  if (!list || list.length === 0){
    showToast("No se puede procesar: no hay salidas pendientes.", false);
    return;
  }

  const ok = await showConfirmModal({
    title: "Confirmar pendientes",
    message: `Procesar ${list.length} salidas pendientes?`,
    confirmText: "Procesar",
    cancelText: "Cancelar"
  });
  if (!ok) return;

  const res = await processPendings(list);
  if (res.errors === 0) {
    savePendingSalidas([]);
    await renderPendingList();
    await cargarHistorialSalidas();
    showToast(`Pendientes procesadas: ${res.successes}`, true);
  } else {
    if (res.successes > 0) {
      savePendingSalidas([]); // opción: podrías guardar los fallidos en otro lugar
      await renderPendingList();
      await cargarHistorialSalidas();
    }
    showToast(`Procesadas: ${res.successes}, fallidas: ${res.errors}`, res.errors === 0);
  }
}

// -------------------- CARGAR HISTORIAL --------------------
async function cargarHistorialSalidas(){
  if (!tablaHistorialBody) return;
  try {
    const { data, error } = await supabase
      .from("salidas_sin_codigo")
      .select("id, descripcion, cantidad_salida, fecha_salida, responsable, UM, inventario_origen, destinatario, observaciones")
      .order("fecha_salida", { ascending: false })
      .limit(500);

    if (error) throw error;

    tablaHistorialBody.innerHTML = "";
    if (!data || data.length===0){
      tablaHistorialBody.innerHTML = `<tr><td colspan="9" class="empty-note">No hay registros de salidas</td></tr>`;
      return;
    }

    data.forEach(item => {
      const codigo = "S/C"; // la tabla no guarda CODIGO por ahora
      const descripcion = item.descripcion ?? "-";
      const um = item.UM ?? "-";
      const inventarioRaw = item.inventario_origen ?? "-";
      const inventarioLabel = String(inventarioRaw).toUpperCase().replace(/^INVENTARIO\s*/i,'INVENTARIO ');
      const invColor = invColorFor(inventarioRaw);
      const cantidad = item.cantidad_salida ?? "-";
      const fechaRaw = item.fecha_salida ?? item.created_at ?? null;
      const fecha = fechaRaw ? (new Date(fechaRaw)).toLocaleString() : "-";
      const responsable = item.responsable ?? "-";
      const destinatario = item.destinatario ?? "-";
      const observ = item.observaciones ?? "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="col-codigo">${escapeHtml(String(codigo))}</td>
        <td class="col-desc"><div class="desc-text" title="${escapeHtml(String(descripcion))}">${escapeHtml(String(descripcion))}</div></td>
        <td class="col-um">${escapeHtml(String(um))}</td>
        <td class="col-inv"><span class="inv-select-wrap"><span class="inv-dot" style="background:${invColor}"></span><span class="inv-label">${escapeHtml(inventarioLabel)}</span></span></td>
        <td class="col-cant">${escapeHtml(String(cantidad))}</td>
        <td class="small-muted">${escapeHtml(String(fecha))}</td>
        <td class="col-resp">${escapeHtml(String(responsable))}</td>
        <td class="col-dest">${escapeHtml(String(destinatario))}</td>
        <td class="col-obs">${escapeHtml(String(observ))}</td>
      `;
      tablaHistorialBody.appendChild(tr);
    });

  } catch (err) {
    console.error("Error cargando historial salidas:", err);
    tablaHistorialBody.innerHTML = `<tr><td colspan="9">Error cargando salidas</td></tr>`;
  }
}

// ---------------- Badge helper + debug ----------------
function updateVerSalidasBadge(count) {
  try {
    const btn = document.getElementById('btnVerSalidas');
    if (!btn) {
      console.debug("updateVerSalidasBadge: botón #btnVerSalidas no encontrado");
      return;
    }
    if (!btn.classList.contains('has-badge')) btn.classList.add('has-badge');

    let badge = document.getElementById('verSalidasBadge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'verSalidasBadge';
      badge.className = 'button-badge';
      btn.appendChild(badge);
    }

    if (!count || count === 0) {
      badge.style.display = 'none';
      console.debug("updateVerSalidasBadge: ocultando badge (count 0)");
      return;
    }

    badge.classList.remove('pulse');
    badge.style.display = 'inline-block';
    badge.textContent = count > 99 ? '99+' : String(count);
    console.debug("updateVerSalidasBadge: mostrado con count =", count);
  } catch (e) {
    console.error("updateVerSalidasBadge error:", e);
  }
}

function debugShowBadgeTest(n = 3) {
  console.log("debugShowBadgeTest: forcando badge con n =", n);
  updateVerSalidasBadge(n);
}

// -------------------- INVENTORY COLORS HELPER --------------------
const INVENTORY_COLORS = {
  "INVENTARIO I069": "#fff714", // amarillo
  "INVENTARIO I078": "#0b78f5", // azul
  "INVENTARIO I07F": "#f79125", // naranja
  "INVENTARIO I312": "#ff1495", // magenta
  "INVENTARIO I073": "#f1f65c", // amarillo claro
  "I069": "#fff714",
  "I078": "#0b78f5",
  "I07F": "#f79125",
  "I312": "#ff1495",
  "I073": "#f1f65c",
  "ALMACEN": "#6b7280"           // fallback
};

function normalizeInventoryKeyForColor(name) {
  if (!name) return "";
  let s = String(name).trim().toUpperCase();
  if (s.startsWith("INVENTARIO ")) return s;
  if (s === "ALMACEN") return "ALMACEN";
  return `INVENTARIO ${s}`;
}

function invColorFor(name) {
  if (!name) return INVENTORY_COLORS["ALMACEN"];
  const long = normalizeInventoryKeyForColor(name);
  return INVENTORY_COLORS[long] || INVENTORY_COLORS[name] || INVENTORY_COLORS["ALMACEN"];
}

// -------------------- INIT / EVENTOS --------------------
async function init(){
  // cargar usuario actual si existe
  try {
    if (supabase && supabase.auth) {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (user) {
        try {
          const { data: udata, error } = await supabase.from("usuarios").select("nombre, apellido").eq("email", user.email).maybeSingle();
          if (!error && udata){
            CURRENT_USER_FULLNAME = `${udata.nombre || ""} ${udata.apellido || ""}`.trim();
          } else {
            CURRENT_USER_FULLNAME = user.user_metadata?.full_name || user.email || "";
          }
        } catch(e){
          CURRENT_USER_FULLNAME = user.user_metadata?.full_name || user.email || "";
        }
      }
    }
  } catch(e){
    console.warn("No se pudo obtener usuario actual:", e);
  }

  if (nombreResponsableInput) {
    nombreResponsableInput.value = CURRENT_USER_FULLNAME;
    nombreResponsableInput.setAttribute("readonly", "true");
  }

  // eventos botones
  if (btnConfirmAll) btnConfirmAll.addEventListener("click", confirmAllPendings);

  if (btnClearPending) {
    btnClearPending.addEventListener("click", async (e) => {
      // prevenir múltiples clicks
      btnClearPending.disabled = true;
      try {
        await clearAllPendings();
      } finally {
        updatePendingCountBadge();
        btnClearPending.disabled = false;
      }
    });
  }

  if (btnRefresh) btnRefresh.addEventListener("click", async ()=>{
    await renderPendingList();
    await cargarHistorialSalidas();
    showToast("Refrescado", true);
  });

  // render inicial -> await para estado consistente
  await ensureProductosSinCodigoColumnMap();
  await renderPendingList();
  updatePendingCountBadge();
  await cargarHistorialSalidas();
}

// Auto-init
init().catch(e => console.error("init error:", e));

// -------------------- Exponer funciones globales --------------------
window.addPendingSalidaSinCodigo = addPendingSalida;
window.confirmAllPendingsSinCodigo = confirmAllPendings;
window.renderPendingListSinCodigo = renderPendingList;
window.cargarHistorialSalidasSinCodigo = cargarHistorialSalidas;
window.clearAllPendingsSinCodigo = clearAllPendings;
window.debugShowBadgeTest = debugShowBadgeTest;