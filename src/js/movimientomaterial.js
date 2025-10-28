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
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, tiempo);
}

/* Helper impresión */
function createPrintWindow(html) {
  try {
    const w = window.open("", "_blank", "noopener");
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    const p = setInterval(() => {
      if (w.document.readyState === "complete") {
        clearInterval(p);
        w.focus();
        w.print();
        setTimeout(() => {
          try { w.close(); } catch (err) {}
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
      // Si stockDisponible <= 0, deshabilitar input y mostrar 0
      const maxStock = Number(item.stockDisponible || 0);
      const inputDisabled = maxStock <= 0 ? "disabled" : "";
      const valor = Number(item.cantidad) && Number(item.cantidad) > 0 ? Number(item.cantidad) : 1;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.codigo)}</td>
        <td style="text-align:left;">${escapeHtml(item.descripcion)}</td>
        <td>${escapeHtml(item.um)}</td>
        <td style="text-align:center;">
          <input 
            type="number" 
            min="1" 
            step="1" 
            inputmode="numeric" 
            pattern="\\d*" 
            ${inputDisabled} 
            value="${escapeHtml(String(valor))}" 
            class="cantidad-input" 
            data-index="${index}" />
          <small style="display:block;color:#888;font-size:.75rem;">Max: ${escapeHtml(String(maxStock))}</small>
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
    // INPUT: sanitizar valor (elimina no-dígitos), asegurar min 1 y max stock
    tablaBody.addEventListener("input", (e) => {
      if (e.target && e.target.classList.contains("cantidad-input")) {
        const idx = Number(e.target.dataset.index);
        if (!Number.isInteger(idx) || !lista[idx]) return;

        // Limpiar cualquier carácter no numérico (por si pegó texto)
        let raw = String(e.target.value || "");
        raw = raw.replace(/[^\d]/g, ""); // sólo dígitos
        // Evitar campo vacío -> 1 por defecto
        let v = raw === "" ? 1 : parseInt(raw, 10);
        if (isNaN(v) || v < 1) v = 1;

        const max = Number(lista[idx]?.stockDisponible || 0);
        if (v > max) {
          mostrarAlerta(`❌ Máximo ${max} unidades disponibles`, "warning");
          v = max > 0 ? max : 1;
        }

        e.target.value = String(v);

        // Actualizar lista y localStorage
        lista[idx].cantidad = v;
        localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
        if (typeof updateVerMovimientoBadge === "function") updateVerMovimientoBadge();
      }
    });

    // KEYDOWN: prevenir caracteres no permitidos (ej. '-', 'e', '.', '+')
    tablaBody.addEventListener("keydown", (e) => {
      const tgt = e.target;
      if (!tgt || !tgt.classList.contains("cantidad-input")) return;

      // Permitir teclas de control/navigation
      const controlKeys = [
        "Backspace", "Delete", "ArrowLeft", "ArrowRight",
        "ArrowUp", "ArrowDown", "Tab", "Home", "End"
      ];
      if (controlKeys.includes(e.key)) return;

      // Prohibir estas teclas (p. ej. 'e' en chrome, '-', '.', '+')
      if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E" || e.key === ".") {
        e.preventDefault();
        return;
      }

      // Permitir sólo dígitos 0-9
      if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });

    // PASTE: limpiar lo pegado
    tablaBody.addEventListener("paste", (e) => {
      const tgt = e.target;
      if (!tgt || !tgt.classList.contains("cantidad-input")) return;
      const clip = (e.clipboardData || window.clipboardData).getData("text");
      const cleaned = String(clip || "").replace(/[^\d]/g, "");
      if (!cleaned) {
        e.preventDefault();
        // si no hay dígitos, poner 1 como fallback
        tgt.value = "1";
        tgt.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      // Si hay dígitos, insertar solo los dígitos (evita pegar signos)
      e.preventDefault();
      tgt.value = cleaned;
      tgt.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // CLICK: eliminar fila
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

  // ---- Imprimir
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
