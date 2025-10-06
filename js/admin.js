// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------- MENSAJE BIENVENIDA -------------------
document.addEventListener("DOMContentLoaded", () => {
  // Obtener el nombre del usuario guardado en localStorage
  const usuarioGuardado = localStorage.getItem("usuario") || "Administrador";
  
  // Mostrar mensaje en el panel principal
  const welcomeMessage = document.getElementById("welcomeMessage");
  welcomeMessage.textContent = `Bienvenido al panel de Administración, ${usuarioGuardado}`;

  // Mostrar animación flotante solo una vez por sesión
  const welcomeAnimation = document.getElementById("welcomeAnimation");
  const welcomeShown = sessionStorage.getItem("welcomeShown");

  if (welcomeAnimation) {
    if (welcomeShown !== "true") {
      welcomeAnimation.classList.remove("hidden");
      welcomeAnimation.innerHTML = `
        <img src="https://cdn-icons-png.flaticon.com/512/1998/1998592.png" alt="muñequito" style="width:40px;vertical-align:middle;margin-right:8px;">
        <span><strong>Bienvenido Administrador ${usuarioGuardado}</strong></span>
      `;

      setTimeout(() => {
        welcomeAnimation.classList.add("hidden");
        sessionStorage.setItem("welcomeShown", "true");
      }, 4000);
    } else {
      welcomeAnimation.classList.add("hidden");
    }
  }

  // ------------------- CERRAR SESIÓN -------------------
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario"); 
      sessionStorage.removeItem("welcomeShown");
      window.location.href = "login.html";
    });
  }
});

// ------------------- MODAL INVENTARIO -------------------
const modal = document.getElementById("inventoryModal");
const closeBtn = document.querySelector(".close");
const btnInventario = document.getElementById("btnInventario");

btnInventario.addEventListener("click", async () => {
  modal.style.display = "block";
  await loadInventory();
});

closeBtn.onclick = () => modal.style.display = "none";
window.onclick = e => { if (e.target === modal) modal.style.display = "none"; };

// ------------------- CARGAR INVENTARIO -------------------
async function loadInventory() {
  const { data, error } = await supabase
    .from("productos")
    .select("CODIGO, DESCRIPCION, UM, INVENTARIO1078");

  if (error) {
    console.error("Error cargando inventario:", error.message);
    return;
  }

  const tbody = document.querySelector("#inventoryTable tbody");
  tbody.innerHTML = "";

  data.forEach(prod => {
    const row = `
      <tr>
        <td>${prod.CODIGO}</td>
        <td>${prod.DESCRIPCION}</td>
        <td>${prod.UM}</td>
        <td>${prod.INVENTARIO1078 ?? 0}</td>
      </tr>`;
    tbody.innerHTML += row;
  });
}
