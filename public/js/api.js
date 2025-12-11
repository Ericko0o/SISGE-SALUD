// Cliente API para comunicación con el backend
class ApiClient {
    constructor() {
        this.baseURL = '/api';
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
    }

    // Configurar headers con token
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }

    // Manejo de errores comunes
    handleError(error) {
        console.error('Error de API:', error);
        
        if (error.status === 401) {
            // Token expirado o inválido
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
            return { success: false, message: 'Sesión expirada' };
        }
        
        if (error.status === 403) {
            return { success: false, message: 'Acceso no autorizado' };
        }
        
        return { 
            success: false, 
            message: error.message || 'Error de conexión' 
        };
    }

    // Método genérico para peticiones
    async request(endpoint, options = {}) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            const defaultOptions = {
                headers: this.getHeaders(),
                ...options
            };

            const response = await fetch(url, defaultOptions);
            
            // Intentar parsear la respuesta como JSON
            let data;
            try {
                data = await response.json();
            } catch (e) {
                data = { success: false, message: 'Respuesta inválida del servidor' };
            }

            if (!response.ok) {
                throw { 
                    status: response.status, 
                    message: data.message || 'Error en la petición',
                    data 
                };
            }

            return data;

        } catch (error) {
            return this.handleError(error);
        }
    }

    // Métodos HTTP específicos
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // Métodos específicos de la aplicación

    // Auth
    async login(email, password) {
        return this.post('/login', { email, password });
    }

    async register(pacienteData) {
        return this.post('/registro', pacienteData);
    }

    async verifyToken() {
        return this.get('/verify-token');
    }

    // Paciente
    async getPerfilPaciente() {
        return this.get('/perfil');
    }

    async getCitasPaciente() {
        return this.get('/citas/paciente');
    }

    async agendarCita(citaData) {
        return this.post('/citas', citaData);
    }

    async cancelarCita(citaId) {
        return this.put(`/citas/${citaId}/cancelar`);
    }

    async getRecetasPaciente() {
        return this.get('/recetas/paciente');
    }

    async getExamenesPaciente() {
        return this.get('/examenes/paciente');
    }

    // Doctor
    async getCitasHoy() {
        return this.get('/doctor/citas/hoy');
    }

    async crearAtencion(atencionData) {
        return this.post('/atenciones', atencionData);
    }

    async crearReceta(recetaData) {
        return this.post('/recetas', recetaData);
    }

    async crearExamen(examenData) {
        return this.post('/examenes', examenData);
    }

    async getCitaDetalles(citaId) {
        return this.get(`/citas/${citaId}`);
    }

    // Admin
    async getUsuarios() {
        return this.get('/admin/usuarios');
    }

    async crearDoctor(doctorData) {
        return this.post('/admin/doctores', doctorData);
    }

    // Catálogos
    async getDoctores() {
        return this.get('/doctores');
    }

    async getHospitales() {
        return this.get('/hospitales');
    }

    async getMedicamentos() {
        return this.get('/medicamentos');
    }

    async getEspecialidades() {
        return this.get('/especialidades');
    }
}

// Instancia global del cliente API
const apiClient = new ApiClient();

// Función para mostrar notificaciones
function showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icon = type === 'success' ? 'check-circle' : 
                 type === 'error' ? 'exclamation-circle' : 'info-circle';
    
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    
    // Agregar al body
    document.body.appendChild(notification);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Función para verificar autenticación
function checkAuth(requiredRole = null) {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    
    if (requiredRole && user.rol !== requiredRole) {
        window.location.href = '/login.html';
        return false;
    }
    
    return true;
}

// Función para logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}