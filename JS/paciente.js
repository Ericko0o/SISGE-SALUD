// JS/paciente.js


// SPA mínima: cambiar vistas
document.addEventListener('DOMContentLoaded', ()=>{
const menuItems = Array.from(document.querySelectorAll('.menu-item'));
const views = Array.from(document.querySelectorAll('.view'));


function showView(name){
views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
menuItems.forEach(m => m.classList.toggle('active', m.dataset.view === name));
}


menuItems.forEach(it => {
it.addEventListener('click', ()=> showView(it.dataset.view));
});


// Default view
showView('perfil');


// Botones de ejemplo
document.getElementById('nueva-cita').addEventListener('click', ()=>{
// Aquí abrirías un modal o formulario para agendar cita.
// TODO: invocar endpoint POST '/api/paciente/citas' con datos.
alert('Abrir formulario para agendar nueva cita (conectar con endpoint).');
});


document.getElementById('editar-perfil').addEventListener('click', ()=>{
// TODO: mostrar formulario de edición -> endpoint PUT '/api/paciente/perfil'
alert('Editar perfil (conectar con endpoint).');
});


document.getElementById('btn-logout').addEventListener('click', ()=>{
// TODO: Invocar endpoint de logout en server (ej: POST '/auth/logout')
// fetch('/auth/logout', {method:'POST', credentials:'include'})...
alert('Cerrar sesión (conectar con endpoint de logout).');
});
});