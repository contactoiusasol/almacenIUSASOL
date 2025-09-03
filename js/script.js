document.getElementById("loginForm").addEventListener("submit", function(event) {
  event.preventDefault(); // evita recargar la página

  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value.trim();

  if (user === "" || pass === "") {
    alert("Por favor, llena todos los campos.");
    return;
  }

  // Simulación de validación
  if (user === "admin" && pass === "1234") {
    alert("¡Bienvenido " + user + "!");
    window.location.href = "dashboard.html"; // redirige
  } else {
    alert("Usuario o contraseña incorrectos.");
  }
});
