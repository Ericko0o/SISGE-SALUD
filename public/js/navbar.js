export async function cargarNavbar() {
    try {
        const res = await fetch("/HTML/navbar.html");
        const html = await res.text();
        document.getElementById("navbar").innerHTML = html;

        const user = JSON.parse(localStorage.getItem("user"));

        if (user) {
            if (user.rol === "Administrador") {
                document.getElementById("nav-opciones").style.display = "inline-block";
                document.getElementById("nav-opciones").textContent = "Administración";
                document.getElementById("nav-opciones").href = "/admin.html";
            }

            if (user.rol === "Doctor") {
                document.getElementById("nav-opciones").style.display = "inline-block";
                document.getElementById("nav-opciones").textContent = "Agenda";
                document.getElementById("nav-opciones").href = "/doctor.html";
            }

            if (user.rol === "Paciente") {
                document.getElementById("nav-opciones").style.display = "inline-block";
                document.getElementById("nav-opciones").textContent = "Mis Citas";
                document.getElementById("nav-opciones").href = "/paciente.html";
            }
        }

        document.getElementById("logout-btn").onclick = () => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "/login.html";
        };

    } catch (err) {
        console.error("Error cargando navbar:", err);
    }
}

cargarNavbar();
