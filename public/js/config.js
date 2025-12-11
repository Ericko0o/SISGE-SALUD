// Configuración global y event handlers
window.Config = {
    init: function() {
        this.setupNavigation();
        this.setupModals();
        this.setupButtons();
    },
    
    setupNavigation: function() {
        // Navegación sidebar
        const navItems = document.querySelectorAll('.nav-item:not(.logout)');
        navItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const section = this.getAttribute('href').replace('#', '');
                if (section) {
                    loadSection(section, false, e);
                }
            });
        });
        
        // Logout
        const logoutBtn = document.querySelector('.nav-item.logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                logout();
            });
        }
    },
    
    setupModals: function() {
        // Cerrar modal al hacer click fuera
        window.addEventListener('click', function(e) {
            const modal = document.getElementById('newAppointmentModal');
            if (e.target === modal) {
                closeModal();
            }
        });
    },
    
    setupButtons: function() {
        // Botón nueva cita en header
        const nuevaCitaBtn = document.querySelector('.header-actions .btn-primary');
        if (nuevaCitaBtn) {
            nuevaCitaBtn.addEventListener('click', function(e) {
                e.preventDefault();
                loadSection('citas', true, e);
            });
        }
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    Config.init();
});