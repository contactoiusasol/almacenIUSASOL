// movimientomaterial.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener("DOMContentLoaded", init);

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function ensureToastContainer() {
  let c = document.querySelector(".toast-container");
  if (!c) {
    c = document.createElement("div");
    c.className = "toast-container";
    document.body.appendChild(c);
  }
  return c;
}

function mostrarAlerta(mensaje, tipo = "success", tiempo = 2600) {
  const c = ensureToastContainer();
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  t.innerHTML = `<span class="icon">${tipo === 'success' ? '✅' : tipo === 'warning' ? '⚠️' : '❌'}</span><div style="flex:1">${escapeHtml(mensaje)}</div>`;
  c.appendChild(t);
  // force reflow
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, tiempo);
}

/* Helper impresión: intenta abrir ventana e imprimir; si falla, usa iframe fallback */
function createPrintWindow(html) {
  try {
    const w = window.open("", "_blank", "noopener");
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Esperar a que el contenido cargue
    const p = setInterval(() => {
      if (w.document.readyState === "complete") {
        clearInterval(p);
        w.focus();
        w.print();
        // cerrar ventana tras imprimir (opcional): se hace con timeout para evitar bloquear algunos navegadores
        setTimeout(() => {
          try { w.close(); } catch (err) { /* ignore */ }
        }, 600);
      }
    }, 80);
    return true;
  } catch (e) {
    return false;
  }
}

function createIframePrint(html) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(html);
  idoc.close();
  iframe.contentWindow.focus();
  // Delay para asegurarse carga
  setTimeout(() => {
    try {
      iframe.contentWindow.print();
    } catch (e) {
      console.error("Print fallback failed:", e);
    }
    setTimeout(() => iframe.remove(), 800);
  }, 300);
}

async function init() {
  // DOM elements
  const nombreSolicitanteInput = document.getElementById("nombreSolicitante");
  const tablaBody = document.querySelector("#tabla-movimiento tbody");
  const btnImprimir = document.getElementById("btnImprimir");
  const btnVaciarTodo = document.getElementById("btnVaciarTodo");
  const hojaSalida = document.getElementById("hoja-salida");
  const tablaSalida = document.getElementById("tablaSalida");
  const nombreSalida = document.getElementById("nombreSalida");
  const fechaSalida = document.getElementById("fechaSalida");

  const overlay = document.getElementById("confirmOverlay");
  const modal = document.getElementById("confirmModal");
  const titleEl = document.getElementById("confirmTitleText");
  const textEl = document.getElementById("confirmText");
  const btnYes = document.getElementById("confirmYes");
  const btnNo = document.getElementById("confirmNo");

  // intentar obtener usuario (si tienes sesión Supabase)
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (user && user.email) {
      const { data: udata, error } = await supabase.from("usuarios").select("nombre, apellido").eq("email", user.email).single();
      if (!error && udata) {
        nombreSolicitanteInput.value = `${udata.nombre || ""} ${udata.apellido || ""}`.trim();
      } else {
        nombreSolicitanteInput.value = nombreSolicitanteInput.value || "Usuario no identificado";
      }
    } else {
      nombreSolicitanteInput.value = nombreSolicitanteInput.value || "Usuario no identificado";
    }
  } catch (err) {
    console.warn("No se obtuvo usuario supabase:", err);
    nombreSolicitanteInput.value = nombreSolicitanteInput.value || "Usuario no identificado";
  }

  // cargar lista desde localStorage
  let lista = JSON.parse(localStorage.getItem("movimientoMaterial") || "[]");
  if (!Array.isArray(lista)) lista = [];

  // Render tabla
  function renderTabla() {
    if (!tablaBody) return;
    tablaBody.innerHTML = "";
    if (!lista || lista.length === 0) {
      tablaBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#777;">No hay productos en la lista de movimiento</td></tr>`;
      return;
    }
    lista.forEach((item, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.codigo)}</td>
        <td style="text-align:left;">${escapeHtml(item.descripcion)}</td>
        <td>${escapeHtml(item.um)}</td>
        <td style="text-align:center;">
          <input type="number" min="1" max="${Number(item.stockDisponible||0)}" value="${escapeHtml(String(item.cantidad||1))}" class="cantidad-input" data-index="${index}" />
          <small style="display:block;color:#888;font-size:.75rem;">Max: ${escapeHtml(String(item.stockDisponible||0))}</small>
        </td>
        <td style="text-align:center;"><button class="eliminar-btn" data-index="${index}">Eliminar</button></td>
      `;
      tablaBody.appendChild(tr);
    });
  }

  // Modal confirm (promise)
  function showConfirm(message, title = "Confirmar acción") {
    return new Promise((resolve) => {
      if (!overlay || !modal || !titleEl || !textEl || !btnYes || !btnNo) {
        // si no hay modal físico, usar confirm() nativo
        resolve(window.confirm(message));
        return;
      }
      titleEl.textContent = title;
      textEl.textContent = message;
      overlay.classList.add("show");
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
      btnNo.focus();

      const cleanup = (result) => {
        overlay.classList.remove("show");
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        btnYes.removeEventListener("click", onYes);
        btnNo.removeEventListener("click", onNo);
        document.removeEventListener("keydown", onKey);
        resolve(result);
      };

      const onYes = () => cleanup(true);
      const onNo = () => cleanup(false);
      const onKey = (e) => {
        if (e.key === "Escape") cleanup(false);
        if (e.key === "Enter") cleanup(true);
      };

      btnYes.addEventListener("click", onYes);
      btnNo.addEventListener("click", onNo);
      document.addEventListener("keydown", onKey);
    });
  }

  // Vaciar lista completa
  async function vaciarListaCompleta() {
    if (!lista || lista.length === 0) {
      mostrarAlerta("📭 No hay productos en la lista para vaciar", "warning");
      return;
    }
    const confirmar = await showConfirm(`¿Estás seguro de que deseas vaciar toda la lista?\nSe eliminarán ${lista.length} producto(s).`, "Vaciar lista");
    if (confirmar) {
      lista = [];
      localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
      renderTabla();
      if (typeof updateVerMovimientoBadge === "function") updateVerMovimientoBadge();
      mostrarAlerta("✅ Lista vaciada correctamente", "success");
    } else {
      mostrarAlerta("Operación cancelada", "warning");
    }
  }

  // Eventos delegados en la tabla
  if (tablaBody) {
    tablaBody.addEventListener("input", (e) => {
      if (e.target && e.target.classList.contains("cantidad-input")) {
        const idx = Number(e.target.dataset.index);
        const max = Number(lista[idx]?.stockDisponible || 0);
        let v = parseInt(e.target.value, 10);
        if (isNaN(v) || v < 1) v = 1;
        if (v > max) {
          mostrarAlerta(`❌ Máximo ${max} unidades disponibles`, "warning");
          v = max;
          e.target.value = max;
        }
        if (lista[idx]) {
          lista[idx].cantidad = v;
          localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
        }
      }
    });

    tablaBody.addEventListener("click", async (e) => {
      if (e.target && e.target.classList.contains("eliminar-btn")) {
        const idx = Number(e.target.dataset.index);
        const item = lista[idx];
        const confirmar = await showConfirm(`¿Eliminar producto ${item?.codigo || ''}?\n"${item?.descripcion || ''}"`, "Confirmar eliminación");
        if (confirmar) {
          lista.splice(idx, 1);
          localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
          renderTabla();
          if (typeof updateVerMovimientoBadge === "function") updateVerMovimientoBadge();
          mostrarAlerta("🗑️ Producto eliminado", "success");
        } else {
          mostrarAlerta("Acción cancelada", "warning");
        }
      }
    });
  }

  // Botón vaciar todo
  if (btnVaciarTodo) btnVaciarTodo.addEventListener("click", vaciarListaCompleta);

  // ---- Imprimir: rellenar tablaSalida y generar HTML forzado ----
   if (btnImprimir) {
    btnImprimir.addEventListener("click", () => {
      const nombre = (nombreSolicitanteInput?.value || "").trim();
      if (!nombre) return mostrarAlerta("⚠️ Escribe el nombre del solicitante", "warning");

      const listaFiltrada = lista.filter(item => item.cantidad && item.cantidad > 0);
      if (listaFiltrada.length === 0) {
        return mostrarAlerta(" No hay productos con cantidad para imprimir", "warning");
      }

      nombreSalida.textContent = nombre;
      fechaSalida.textContent = new Date().toLocaleString();
      tablaSalida.querySelector("tbody").innerHTML = "";

      listaFiltrada.forEach(item => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
          <td>${item.codigo}</td>
          <td>${item.descripcion}</td>
          <td>${item.um}</td>
          <td>${item.cantidad}</td>`;
        tablaSalida.querySelector("tbody").appendChild(fila);
      });

      hojaSalida.style.display = "block";
      window.print();
      hojaSalida.style.display = "none";
    });
  }

  // Botón Vaciar Todo
  if (btnVaciarTodo) {
    btnVaciarTodo.addEventListener("click", vaciarListaCompleta);
  }

  // Inicial render
  renderTabla();

  // Escuchar cambios de sesión Supabase
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
      localStorage.removeItem("movimientoMaterial");
      lista = [];
      renderTabla();
      console.log("✅ Lista limpiada por cambio de sesión:", event);
    }
  });
}
