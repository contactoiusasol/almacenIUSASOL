// ------------------- CONFIG SUPABASE -------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------- CARGAR NOMBRE DE USUARIO LOGUEADO -------------------
document.addEventListener("DOMContentLoaded", async () => {
  const nombreSolicitanteInput = document.getElementById("nombreSolicitante");

  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const email = user.email;

    // 🔹 Traer nombre y apellido
    const { data, error } = await supabase
      .from("usuarios")
      .select("nombre, apellido")
      .eq("email", email)
      .single();

    if (error) {
      console.error("Error obteniendo usuario:", error);
      nombreSolicitanteInput.value = "Usuario no identificado";
      return;
    }

    // 🔹 Concatenar nombre + apellido
    const nombreCompleto = `${data?.nombre || ""} ${data?.apellido || ""}`.trim();
    nombreSolicitanteInput.value = nombreCompleto || "Usuario no identificado";

  } else {
    nombreSolicitanteInput.value = "Usuario no identificado";
  }
});

// ------------------- FUNCIONALIDAD DE MOVIMIENTO MATERIAL -------------------
document.addEventListener("DOMContentLoaded", () => {
  const tablaBody = document.querySelector("#tabla-movimiento tbody");
  const lista = JSON.parse(localStorage.getItem("movimientoMaterial")) || [];

  const btnImprimir = document.getElementById("btnImprimir");
  const nombreSolicitanteInput = document.getElementById("nombreSolicitante");
  const hojaSalida = document.getElementById("hoja-salida");
  const tablaSalida = document.getElementById("tablaSalida");
  const nombreSalida = document.getElementById("nombreSalida");
  const fechaSalida = document.getElementById("fechaSalida");

  function mostrarAlerta(mensaje) {
    const alerta = document.createElement("div");
    alerta.className = "alert";
    alerta.textContent = mensaje;
    document.body.appendChild(alerta);
    setTimeout(() => alerta.classList.add("show"), 100);
    setTimeout(() => {
      alerta.classList.remove("show");
      setTimeout(() => alerta.remove(), 500);
    }, 3000);
  }

  function renderTabla() {
    tablaBody.innerHTML = "";
    if (lista.length === 0) {
      tablaBody.innerHTML = `
        <tr><td colspan="5" style="text-align:center; padding: 20px; color: #777;">
        No hay productos en la lista de movimiento</td></tr>`;
      return;
    }

    lista.forEach((item, index) => {
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${item.codigo}</td>
        <td>${item.descripcion}</td>
        <td>${item.um}</td>
        <td>
          <input type="number" min="1" max="${item.stockDisponible}"
          value="${item.cantidad || ''}" class="cantidad-input" data-index="${index}" />
          <small style="color:#888; font-size:0.75rem;">Max: ${item.stockDisponible}</small>
        </td>
        <td><button class="eliminar-btn" data-index="${index}">Eliminar</button></td>`;
      tablaBody.appendChild(fila);
    });
  }

  tablaBody.addEventListener("input", (e) => {
    if (e.target.classList.contains("cantidad-input")) {
      const index = e.target.dataset.index;
      const max = lista[index].stockDisponible;
      let val = parseInt(e.target.value, 10);
      if (val > max) {
        mostrarAlerta(`❌ No puedes pedir más de ${max} unidades disponibles`);
        val = max; e.target.value = max;
      }
      lista[index].cantidad = val;
      localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
    }
  });

  tablaBody.addEventListener("click", (e) => {
    if (e.target.classList.contains("eliminar-btn")) {
      const index = e.target.dataset.index;
      lista.splice(index, 1);
      localStorage.setItem("movimientoMaterial", JSON.stringify(lista));
      renderTabla();
    }
  });

  btnImprimir.addEventListener("click", () => {
  const nombre = nombreSolicitanteInput.value.trim();
  if (!nombre) return mostrarAlerta("⚠️ Escribe el nombre del solicitante");

  const listaFiltrada = lista.filter(item => item.cantidad && item.cantidad > 0);
  if (listaFiltrada.length === 0)
    return mostrarAlerta("⚠️ No hay productos con cantidad para imprimir");

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

  renderTabla();
});
// ------------------- ESCUCHAR CAMBIO DE SESIÓN -------------------
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_OUT") {
    // 🔹 Si cerró sesión, borrar la lista de movimiento
    localStorage.removeItem("movimientoMaterial");
    console.log("✅ Lista limpiada al cerrar sesión");
  }

  if (event === "SIGNED_IN") {
    // 🔹 Al iniciar sesión también limpiamos la lista
    localStorage.removeItem("movimientoMaterial");
    console.log("✅ Lista limpia al iniciar nueva sesión");
  }
});
