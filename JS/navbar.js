// Este archivo asume que el server devolverá la sesión en /api/session (lo conectaremos después)

document.addEventListener("DOMContentLoaded", async () => {
    const nav = document.getElementById("nav-links");

    // Obtener rol desde sesión (cuando conectes backend)
    let respuesta = await fetch('/api/session');  
    let data = await respuesta.json();

    const rol = data?.rol || null;

    if (!rol) {
        // Si no hay sesión, solo mostrar inicio / login
        nav.innerHTML = `
            <li><a href="/HTML/index.html">Inicio</a></li>
            <li><a href="/HTML/login.html">Iniciar Sesión</a></li>
        `;
        return;
    }

    // NAVBAR SEGÚN ROL
    if (rol === "paciente") {
        nav.innerHTML = `
            <li><a href="/HTML/dashboard_paciente.html">Dashboard</a></li>
            <li><a href="/HTML/citas.html">Mis Citas</a></li>
            <li><a href="/HTML/recetas.html">Mis Recetas</a></li>
            <li><a href="/HTML/historial.html">Historial Clínico</a></li>
        `;
    }

    if (rol === "doctor") {
        nav.innerHTML = `
            <li><a href="/HTML/dashboard_doctor.html">Dashboard</a></li>
            <li><a href="/HTML/pacientes.html">Pacientes</a></li>
            <li><a href="/HTML/citasDoctor.html">Citas del Día</a></li>
            <li><a href="/HTML/diagnosticos.html">Diagnósticos</a></li>
        `;
    }

    if (rol === "admin") {
        nav.innerHTML = `
            <li><a href="/HTML/dashboard_admin.html">Dashboard</a></li>
            <li><a href="/HTML/usuarios.html">Usuarios</a></li>
            <li><a href="/HTML/medicamentos.html">Medicamentos</a></li>
            <li><a href="/HTML/hospitales.html">Hospitales</a></li>
        `;
    }

    document.getElementById("logoutBtn").addEventListener("click", () => {
        // Aquí luego conectarás tu endpoint /logout
        fetch('/logout', { method: 'POST' })
            .then(() => window.location.href = "/HTML/login.html");
    });
});
