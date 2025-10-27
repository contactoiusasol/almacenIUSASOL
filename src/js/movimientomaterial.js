// ../js/movimientomaterial.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  // Elementos DOM
  const nombreSolicitanteInput = document.getElementById("nombreSolicitante");
  const tablaBody = document.querySelector("#tabla-movimiento tbody");
  const btnImprimir = document.getElementById("btnImprimir");
  const btnVaciarTodo = document.getElementById("btnVaciarTodo");
  const hojaSalida = document.getElementById("hoja-salida");
  const tablaSalida = document.getElementById("tablaSalida");
  const nombreSalida = document.getElementById("nombreSalida");
  const fechaSalida = document.getElementById("fechaSalida");

  // Modal confirm
  const overlay = document.getElementById("confirmOverlay");
  const modal = document.getElementById("confirmModal");
  const titleEl = document.getElementById("confirmTitleText");
  const textEl = document.getElementById("confirmText");
  const btnYes = document.getElementById("confirmYes");
  const btnNo = document.getElementById("confirmNo");

  // Cargar usuario desde Supabase
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.email) {
      const email = user.email;
      const { data, error } = await supabase
        .from("usuarios")
        .select("nombre, apellido")
        .eq("email", email)
        .single();

      if (error) {
        console.error("Error obteniendo usuario:", error);
        nombreSolicitanteInput.value = "Usuario no identificado";
      } else {
        const nombreCompleto = `${data?.nombre || ""} ${data?.apellido || ""}`.trim();
        nombreSolicitanteInput.value = nombreCompleto || "Usuario no identificado";
      }
    } else {
      nombreSolicitanteInput.value = "Usuario no identificado";
    }
  } catch (err) {
    console.error("Error supabase:", err);
    nombreSolicitanteInput.value = "Usuario no identificado";
  }

  // Lista desde localStorage
  let lista = JSON.parse(localStorage.getItem("movimientoMaterial")) || [];

  // Toast de alerta (compacto)
  function mostrarAlerta(mensaje, tipo = 'success') {
    const alerta = document.createElement("div");
    alerta.className = `alert ${tipo}`;
    alerta.textContent = mensaje;
    document.body.appendChild(alerta);

    // show
    setTimeout(() => alerta.classList.add("show"), 80);
    // hide
    setTimeout(() => {
      alerta.classList.remove("show");
      setTimeout(() => alerta.remove(), 350);
    }, 2600);
  }

  // Render tabla
  function renderTabla() {
    tablaBody.innerHTML = "";
    if (!lista || lista.length === 0) {
      tablaBody.innerHTML = `
        <tr><td colspan="5" style="text-align:center; padding: 20px; color: #777;">
        No hay productos en la lista de movimiento</td></tr>`;
      return;
    }

    lista.forEach((item, index) => {
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${item.codigo}</td>
        <td style="text-align:left;">${item.descripcion}</td>
        <td>${item.um}</td>
        <td style="text-align:center;">
          <input type="number" min="1" max="${item.stockDisponible}"
          value="${item.cantidad || ''}" class="cantidad-input" data-index="${index}" />
          <small style="color:#888; font-size:0.75rem; display:block;">Max: ${item.stockDisponible}</small>
        </td>
        <td style="text-align:center;"><button class="eliminar-btn" data-index="${index}">Eliminar</button></td>`;
      tablaBody.appendChild(fila);
    });
  }

  // showConfirm: Promise<boolean>
  function showConfirm(message, title = "Confirmar Acción") {
    return new Promise((resolve) => {
      titleEl.textContent = title;
      textEl.textContent = message;

      // show modal
      overlay.classList.add("show");
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
      btnNo.focus(); // focus en cancelar por defecto

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

  // Vaciar lista (usa showConfirm)
  async function vaciarListaCompleta() {
    if (!lista || lista.length === 0) {
      mostrarAlerta("📭 No hay productos en la lista para vaciar", "warning");
      return;
    }

    const confirmar = await showConfirm(`¿Estás seguro de que deseas vaciar toda la lista?\nSe eliminarán ${lista.length} producto(s).`, "Vaciar lista");

    if (confirmar) {
      lista = [];
      localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
      mostrarAlerta("✅ Lista vaciada correctamente", "success");
      renderTabla();
    } else {
      mostrarAlerta("Operación cancelada", "info");
    }
  }

  // Event listeners en tabla (delegación)
  tablaBody.addEventListener("input", (e) => {
    if (e.target.classList.contains("cantidad-input")) {
      const index = Number(e.target.dataset.index);
      const max = Number(lista[index]?.stockDisponible || 0);
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > max) {
        mostrarAlerta(`❌ No puedes pedir más de ${max} unidades disponibles`, "warning");
        val = max;
        e.target.value = max;
      }
      lista[index].cantidad = val;
      localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
    }
  });

  tablaBody.addEventListener("click", async (e) => {
    if (e.target.classList.contains("eliminar-btn")) {
      const index = Number(e.target.dataset.index);
      const item = lista[index];
      const confirmar = await showConfirm(`¿Seguro que deseas eliminar el producto con código ${item?.codigo || ''} y descripción "${item?.descripcion || ''}"?`, "Confirmar eliminación");

      if (confirmar) {
        lista.splice(index, 1);
        localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
        renderTabla();
        mostrarAlerta("🗑️ Producto eliminado", "success");
      } else {
        mostrarAlerta("Acción cancelada", "info");
      }
    }
  });

  // Botón Imprimir
  if (btnImprimir) {
    btnImprimir.addEventListener("click", () => {
      const nombre = (nombreSolicitanteInput?.value || "").trim();
      if (!nombre) return mostrarAlerta("⚠️ Escribe el nombre del solicitante", "warning");

      const listaFiltrada = lista.filter(item => item.cantidad && item.cantidad > 0);
      if (listaFiltrada.length === 0) {
        return mostrarAlerta("⚠️ No hay productos con cantidad para imprimir", "warning");
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
