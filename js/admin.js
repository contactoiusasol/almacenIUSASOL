// ------------------- CONFIG SUPABASE -------------------
const SUPABASE_URL = "https://fkzlnqdzinjwpxzgwnqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZremxucWR6aW5qd3B4emd3bnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MTU3MTUsImV4cCI6MjA3MjQ5MTcxNX0.w-tyOR_J6MSF6O9JJHGHAnIGPRPfrIGrUkkbDv_B_9I";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------- MENSAJE BIENVENIDA -------------------
const adminName = "Alexis"; 
document.getElementById("welcomeMessage").textContent =
  `Bienvenido al panel de Administración, ${adminName}`;

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
