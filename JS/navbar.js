async function cargarNavbar() {
    const nav = await fetch("/HTML/navbar.html");
    const html = await nav.text();
    document.getElementById("navbar").innerHTML = html;
}

cargarNavbar();
