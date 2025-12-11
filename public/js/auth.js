// Manejo de login y registro
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si estamos en la página de login
    if (!document.getElementById('loginFormElement') && !document.getElementById('registerFormElement')) {
        return;
    }

    // Manejar formulario de login
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Manejar formulario de registro
    const registerForm = document.getElementById('registerFormElement');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Verificar si hay parámetros en la URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('registro') === 'true') {
        showRegister();
    }
});

// Mostrar formulario de registro
function showRegister() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm && registerForm) {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        window.history.pushState({}, '', '/login.html?registro=true');
    }
}

// Mostrar formulario de login
function showLogin() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm && registerForm) {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        window.history.pushState({}, '', '/login.html');
    }
}

// Manejar login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const messageDiv = document.getElementById('authMessage');
    
    // Validaciones básicas
    if (!email || !password) {
        showMessage('Por favor complete todos los campos', 'error', messageDiv);
        return;
    }
    
    showMessage('Verificando credenciales...', 'loading', messageDiv);
    
    try {
        const result = await apiClient.login(email, password);
        
        if (result.success) {
            showMessage('¡Inicio de sesión exitoso! Redirigiendo...', 'success', messageDiv);
            
            // Guardar token y usuario
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            
            // Redirigir según rol
            setTimeout(() => {
                const rol = result.user.rol;
                if (rol === 'Paciente') window.location.href = '/paciente.html';
                else if (rol === 'Doctor') window.location.href = '/doctor.html';
                else if (rol === 'Administrador') window.location.href = '/admin.html';
                else window.location.href = '/';
            }, 1500);
            
        } else {
            showMessage(result.message || 'Error en el login', 'error', messageDiv);
        }
        
    } catch (error) {
        console.error('Error en login:', error);
        showMessage('Error de conexión. Verifica tu internet.', 'error', messageDiv);
    }
}

// Manejar registro
async function handleRegister(e) {
    e.preventDefault();
    
    // Obtener datos del formulario
    const pacienteData = {
        dni: document.getElementById('regDni').value,
        nombres: document.getElementById('regNombres').value,
        apellidos: document.getElementById('regApellidos').value,
        fecha_nacimiento: document.getElementById('regFechaNacimiento').value || null,
        sexo: document.getElementById('regSexo').value || null,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value
    };
    
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const messageDiv = document.getElementById('authMessage');
    
    // Validaciones
    if (!pacienteData.dni || !pacienteData.nombres || !pacienteData.apellidos || 
        !pacienteData.email || !pacienteData.password) {
        showMessage('Todos los campos son requeridos', 'error', messageDiv);
        return;
    }
    
    if (pacienteData.password.length < 6) {
        showMessage('La contraseña debe tener al menos 6 caracteres', 'error', messageDiv);
        return;
    }
    
    if (pacienteData.password !== confirmPassword) {
        showMessage('Las contraseñas no coinciden', 'error', messageDiv);
        return;
    }
    
    if (pacienteData.dni.length !== 8) {
        showMessage('El DNI debe tener 8 dígitos', 'error', messageDiv);
        return;
    }
    
    showMessage('Registrando paciente...', 'loading', messageDiv);
    
    try {
        const result = await apiClient.register(pacienteData);
        
        if (result.success) {
            showMessage('¡Registro exitoso! Iniciando sesión...', 'success', messageDiv);
            
            // Guardar token y usuario
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            
            // Redirigir a dashboard de paciente
            setTimeout(() => {
                window.location.href = '/paciente.html';
            }, 1500);
            
        } else {
            showMessage(result.message || 'Error en el registro', 'error', messageDiv);
        }
        
    } catch (error) {
        console.error('Error en registro:', error);
        showMessage('Error en el registro. Intenta nuevamente.', 'error', messageDiv);
    }
}

// Mostrar mensajes en el formulario de auth
function showMessage(message, type, container) {
    if (!container) return;
    
    const icon = type === 'loading' ? 'spinner fa-spin' :
                 type === 'success' ? 'check-circle' :
                 type === 'error' ? 'exclamation-circle' : 'info-circle';
    
    container.innerHTML = `
        <div class="message ${type}">
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        </div>
    `;
    container.style.display = 'block';
}

// Verificar si hay sesión activa al cargar páginas protegidas
function checkSession() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!token) {
        // Redirigir a login si no hay token
        if (!window.location.pathname.includes('login.html') && 
            !window.location.pathname.includes('index.html')) {
            window.location.href = '/login.html';
        }
        return false;
    }
    
    // Verificar token con el servidor
    apiClient.verifyToken().then(result => {
        if (!result.success) {
            logout();
        }
    }).catch(() => {
        logout();
    });
    
    return true;
}

// Inicializar verificación de sesión
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkSession);
} else {
    checkSession();
}