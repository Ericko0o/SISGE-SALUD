// Funciones específicas para el dashboard de paciente
class PacienteDashboard {
    constructor() {
        this.api = apiClient;
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.init();
    }

    init() {
        // Verificar que el usuario es paciente
        if (this.user.rol !== 'Paciente') {
            window.location.href = '/login.html';
            return;
        }

        // Cargar perfil del paciente
        this.loadPerfil();
        
        // Configurar eventos
        this.setupEvents();
        
        // Verificar token periódicamente
        this.startTokenCheck();
    }

    setupEvents() {
        // Navegación del sidebar
        document.querySelectorAll('.nav-item').forEach(item => {
            if (!item.classList.contains('logout')) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const section = item.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 
                                   item.getAttribute('href')?.replace('#', '');
                    this.loadSection(section);
                });
            }
        });

        // Botón de nueva cita
        const newAppointmentBtn = document.querySelector('[onclick*="loadSection(\'citas\', true)"]');
        if (newAppointmentBtn) {
            newAppointmentBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.loadSection('citas', true);
            });
        }

        // Botón de logout
        const logoutBtn = document.querySelector('.logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }

        // Modal de nueva cita
        const appointmentForm = document.getElementById('appointmentForm');
        if (appointmentForm) {
            appointmentForm.addEventListener('submit', (e) => this.handleNewAppointment(e));
        }

        // Configurar fecha mínima para citas
        const dateInput = document.getElementById('appointmentDate');
        if (dateInput) {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            dateInput.min = now.toISOString().slice(0, 16);
        }
    }

    async loadPerfil() {
        try {
            const result = await this.api.getPerfilPaciente();
            
            if (result.success) {
                this.perfil = result.perfil;
                this.updateUI();
            } else {
                showNotification('Error al cargar el perfil', 'error');
            }
        } catch (error) {
            console.error('Error cargando perfil:', error);
            showNotification('Error de conexión', 'error');
        }
    }

    updateUI() {
        // Actualizar nombre en el sidebar
        const userNameElement = document.getElementById('userName');
        if (userNameElement && this.perfil.nombre) {
            userNameElement.textContent = this.perfil.nombre;
        }

        // Actualizar título de la página
        const pageTitle = document.getElementById('pageTitle');
        const pageSubtitle = document.getElementById('pageSubtitle');
        
        if (pageTitle && pageSubtitle) {
            pageTitle.textContent = 'Dashboard Paciente';
            pageSubtitle.textContent = `Bienvenido, ${this.perfil.nombre}`;
        }
    }

    async loadSection(section, showModal = false) {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        // Actualizar navegación activa
        this.updateActiveNav(section);

        // Mostrar loading
        contentArea.innerHTML = this.getLoadingHTML();

        // Cargar sección específica
        switch (section) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'perfil':
                await this.loadPerfilSection();
                break;
            case 'citas':
                await this.loadCitasSection();
                if (showModal) {
                    setTimeout(() => this.openNewAppointmentModal(), 300);
                }
                break;
            case 'recetas':
                await this.loadRecetasSection();
                break;
            case 'examenes':
                await this.loadExamenesSection();
                break;
            default:
                await this.loadDashboard();
        }
    }

    updateActiveNav(section) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const navItem = document.querySelector(`[href="#${section}"], [onclick*="'${section}'"]`);
        if (navItem) {
            navItem.classList.add('active');
        }
    }

    getLoadingHTML() {
        return `
            <div class="loading-section">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando...</p>
            </div>
        `;
    }

    async loadDashboard() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const [citasResult, recetasResult, examenesResult] = await Promise.all([
                this.api.getCitasPaciente(),
                this.api.getRecetasPaciente(),
                this.api.getExamenesPaciente()
            ]);

            const stats = {
                totalCitas: citasResult.success ? citasResult.citas?.length || 0 : 0,
                citasPendientes: citasResult.success ? 
                    citasResult.citas?.filter(c => c.estado === 'Pendiente').length || 0 : 0,
                totalRecetas: recetasResult.success ? recetasResult.recetas?.length || 0 : 0,
                totalExamenes: examenesResult.success ? examenesResult.examenes?.length || 0 : 0
            };

            // Obtener próxima cita
            let proximaCita = null;
            if (citasResult.success && citasResult.citas) {
                const ahora = new Date();
                const citasFuturas = citasResult.citas.filter(cita => {
                    const fechaCita = new Date(cita.fecha_hora);
                    return fechaCita > ahora && cita.estado !== 'Cancelada';
                }).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
                
                if (citasFuturas.length > 0) {
                    proximaCita = citasFuturas[0];
                }
            }

            contentArea.innerHTML = this.getDashboardHTML(stats, proximaCita);

        } catch (error) {
            console.error('Error cargando dashboard:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar el dashboard');
        }
    }

    getDashboardHTML(stats, proximaCita) {
        const proximaCitaHTML = proximaCita ? `
            <div class="appointment-info">
                <p><strong>Doctor:</strong> ${proximaCita.doctor_nombre || 'No especificado'}</p>
                <p><strong>Fecha:</strong> ${new Date(proximaCita.fecha_hora).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}</p>
                <p><strong>Estado:</strong> <span class="status ${proximaCita.estado.toLowerCase()}">${proximaCita.estado}</span></p>
            </div>
        ` : `
            <div class="no-data">
                <i class="fas fa-calendar-times"></i>
                <p>No tienes citas programadas</p>
                <button class="btn btn-primary btn-small" onclick="pacienteDashboard.loadSection('citas', true)">
                    Agendar ahora
                </button>
            </div>
        `;

        return `
            <div class="dashboard">
                <div class="dashboard-header">
                    <h2>Resumen de tu Salud</h2>
                    <p>Aquí tienes un resumen de tu actividad médica</p>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.totalCitas}</h3>
                            <p>Citas Totales</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.citasPendientes}</h3>
                            <p>Citas Pendientes</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-prescription-bottle-alt"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.totalRecetas}</h3>
                            <p>Recetas Activas</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-file-medical"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.totalExamenes}</h3>
                            <p>Exámenes Realizados</p>
                        </div>
                    </div>
                </div>
                
                <div class="dashboard-sections">
                    <div class="section-card">
                        <h3><i class="fas fa-calendar-check"></i> Próxima Cita</h3>
                        <div id="nextAppointment">
                            ${proximaCitaHTML}
                        </div>
                    </div>
                    
                    <div class="section-card">
                        <h3><i class="fas fa-history"></i> Acciones Rápidas</h3>
                        <div class="quick-actions">
                            <button class="btn btn-primary" onclick="pacienteDashboard.loadSection('citas', true)">
                                <i class="fas fa-calendar-plus"></i> Agendar Cita
                            </button>
                            <button class="btn btn-secondary" onclick="pacienteDashboard.loadSection('recetas')">
                                <i class="fas fa-prescription-bottle-alt"></i> Ver Recetas
                            </button>
                            <button class="btn btn-outline" onclick="pacienteDashboard.loadSection('examenes')">
                                <i class="fas fa-file-medical-alt"></i> Ver Exámenes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadPerfilSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getPerfilPaciente();
            
            if (result.success && result.perfil.detalles) {
                const detalles = result.perfil.detalles;
                const edad = detalles.fecha_nacimiento ? 
                    this.calcularEdad(detalles.fecha_nacimiento) : null;
                
                contentArea.innerHTML = this.getPerfilHTML(detalles, edad);
            } else {
                contentArea.innerHTML = this.getErrorHTML('Error al cargar el perfil');
            }
        } catch (error) {
            console.error('Error cargando perfil:', error);
            contentArea.innerHTML = this.getErrorHTML('Error de conexión');
        }
    }

    getPerfilHTML(detalles, edad) {
        return `
            <div class="profile-section">
                <div class="profile-header">
                    <div class="profile-avatar">
                        <i class="fas fa-user-injured"></i>
                    </div>
                    <div class="profile-info">
                        <h2>${detalles.nombres || ''} ${detalles.apellidos || ''}</h2>
                        <p><i class="fas fa-user-tag"></i> Paciente</p>
                        <p><i class="fas fa-envelope"></i> ${this.user.email}</p>
                    </div>
                </div>
                
                <div class="profile-details">
                    <div class="detail-card">
                        <h3><i class="fas fa-id-card"></i> Información Personal</h3>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>DNI:</label>
                                <span>${detalles.dni || 'No registrado'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Fecha de Nacimiento:</label>
                                <span>${detalles.fecha_nacimiento ? 
                                    new Date(detalles.fecha_nacimiento).toLocaleDateString('es-ES') : 
                                    'No registrada'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Sexo:</label>
                                <span>${detalles.sexo || 'No registrado'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Edad:</label>
                                <span>${edad ? edad + ' años' : 'No registrada'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-card">
                        <h3><i class="fas fa-chart-bar"></i> Estadísticas</h3>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>Citas Totales:</label>
                                <span>${detalles.total_citas || 0}</span>
                            </div>
                            <div class="detail-item">
                                <label>Citas Pendientes:</label>
                                <span>${detalles.citas_pendientes || 0}</span>
                            </div>
                            <div class="detail-item">
                                <label>Usuario desde:</label>
                                <span>${this.user.creado_en ? 
                                    new Date(this.user.creado_en).toLocaleDateString('es-ES') : 
                                    'Fecha no disponible'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="profile-actions">
                    <button class="btn btn-outline" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                        <i class="fas fa-edit"></i> Editar Información
                    </button>
                    <button class="btn btn-outline" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                        <i class="fas fa-key"></i> Cambiar Contraseña
                    </button>
                </div>
            </div>
        `;
    }

    async loadCitasSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getCitasPaciente();
            
            if (result.success && result.citas) {
                contentArea.innerHTML = this.getCitasHTML(result.citas);
                this.setupCitasEvents();
            } else {
                contentArea.innerHTML = this.getEmptyStateHTML(
                    'No tienes citas programadas',
                    'Comienza agendando tu primera cita médica',
                    'Agendar mi primera cita',
                    () => this.openNewAppointmentModal()
                );
            }
        } catch (error) {
            console.error('Error cargando citas:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar las citas');
        }
    }

    getCitasHTML(citas) {
        const citasHTML = citas.map(cita => `
            <tr>
                <td>
                    <strong>${new Date(cita.fecha_hora).toLocaleDateString('es-ES')}</strong><br>
                    <small>${new Date(cita.fecha_hora).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}</small>
                </td>
                <td>${cita.doctor_nombre || 'No especificado'}</td>
                <td>${cita.hospital_nombre || 'No especificado'}</td>
                <td>
                    <span class="status ${cita.estado.toLowerCase()}">
                        ${cita.estado}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        ${cita.estado === 'Pendiente' ? `
                            <button class="btn-icon" title="Cancelar cita" onclick="pacienteDashboard.cancelarCita('${cita.id_cita}')">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                        <button class="btn-icon" title="Ver detalles" onclick="pacienteDashboard.verDetallesCita('${cita.id_cita}')">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        return `
            <div class="citas-section">
                <div class="section-header">
                    <h2>Mis Citas Médicas</h2>
                    <button class="btn btn-primary" onclick="pacienteDashboard.openNewAppointmentModal()">
                        <i class="fas fa-plus"></i> Nueva Cita
                    </button>
                </div>
                
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Fecha y Hora</th>
                                <th>Doctor</th>
                                <th>Hospital</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${citasHTML}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    setupCitasEvents() {
        // Los eventos ya están configurados en los botones con onclick
    }

    async cancelarCita(citaId) {
        if (!confirm('¿Estás seguro de cancelar esta cita?')) return;
        
        try {
            const result = await this.api.cancelarCita(citaId);
            
            if (result.success) {
                showNotification('Cita cancelada exitosamente', 'success');
                this.loadCitasSection();
            } else {
                showNotification(result.message || 'Error al cancelar la cita', 'error');
            }
        } catch (error) {
            console.error('Error cancelando cita:', error);
            showNotification('Error al cancelar la cita', 'error');
        }
    }

    verDetallesCita(citaId) {
        showNotification('Funcionalidad en desarrollo', 'info');
    }

    async openNewAppointmentModal() {
        const modal = document.getElementById('newAppointmentModal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        
        try {
            // Cargar doctores
            const doctoresResult = await this.api.getDoctores();
            const hospitalesResult = await this.api.getHospitales();
            
            const doctorSelect = document.getElementById('appointmentDoctor');
            const hospitalSelect = document.getElementById('appointmentHospital');
            
            if (doctoresResult.success && doctoresResult.doctores) {
                doctorSelect.innerHTML = '<option value="">Seleccionar doctor...</option>';
                doctoresResult.doctores.forEach(doctor => {
                    const option = document.createElement('option');
                    option.value = doctor.id_doctor;
                    option.textContent = `${doctor.nombres} ${doctor.apellidos}${doctor.especialidad ? ` - ${doctor.especialidad}` : ''}`;
                    doctorSelect.appendChild(option);
                });
            }
            
            if (hospitalesResult.success && hospitalesResult.hospitales) {
                hospitalSelect.innerHTML = '<option value="">Seleccionar hospital...</option>';
                hospitalesResult.hospitales.forEach(hospital => {
                    const option = document.createElement('option');
                    option.value = hospital.id_hospital;
                    option.textContent = hospital.nombre;
                    hospitalSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error cargando datos para modal:', error);
        }
    }

    closeNewAppointmentModal() {
        const modal = document.getElementById('newAppointmentModal');
        if (modal) {
            modal.style.display = 'none';
            const form = document.getElementById('appointmentForm');
            if (form) form.reset();
        }
    }

    async handleNewAppointment(e) {
        e.preventDefault();
        
        const doctorId = document.getElementById('appointmentDoctor').value;
        const hospitalId = document.getElementById('appointmentHospital').value || null;
        const fechaHora = document.getElementById('appointmentDate').value;
        const motivo = document.getElementById('appointmentReason').value;
        
        if (!doctorId || !fechaHora) {
            showNotification('Por favor completa todos los campos requeridos', 'error');
            return;
        }
        
        try {
            const result = await this.api.agendarCita({
                id_doctor: doctorId,
                id_hospital: hospitalId,
                fecha_hora: fechaHora,
                motivo: motivo
            });
            
            if (result.success) {
                showNotification('¡Cita agendada exitosamente!', 'success');
                this.closeNewAppointmentModal();
                this.loadCitasSection();
            } else {
                showNotification(result.message || 'Error al agendar la cita', 'error');
            }
        } catch (error) {
            console.error('Error agendando cita:', error);
            showNotification('Error de conexión al agendar la cita', 'error');
        }
    }

    async loadRecetasSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getRecetasPaciente();
            
            if (result.success && result.recetas && result.recetas.length > 0) {
                contentArea.innerHTML = this.getRecetasHTML(result.recetas);
            } else {
                contentArea.innerHTML = this.getEmptyStateHTML(
                    'No tienes recetas registradas',
                    'Tu historial de recetas aparecerá aquí después de tus consultas médicas',
                    null
                );
            }
        } catch (error) {
            console.error('Error cargando recetas:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar las recetas');
        }
    }

    getRecetasHTML(recetas) {
        const recetasHTML = recetas.map(receta => {
            const medicamentosHTML = receta.medicamentos && receta.medicamentos.length > 0 ?
                receta.medicamentos.map(med => `
                    <li>
                        <strong>${med.nombre}</strong>
                        <small>${med.presentacion}</small>
                        <span>${med.indicaciones}</span>
                    </li>
                `).join('') : '<li>No se especificaron medicamentos</li>';
            
            return `
                <div class="receta-card">
                    <div class="receta-header">
                        <h3>
                            <i class="fas fa-prescription-bottle-alt"></i>
                            Receta #${receta.id_receta.substring(0, 8)}
                        </h3>
                        <span class="receta-date">
                            ${new Date(receta.fecha).toLocaleDateString('es-ES')}
                        </span>
                    </div>
                    
                    <div class="receta-info">
                        <p><strong>Doctor:</strong> ${receta.doctor_nombre}</p>
                        <p><strong>Especialidad:</strong> ${receta.especialidad || 'General'}</p>
                        <p><strong>Tipo:</strong> ${receta.tipo_atencion}</p>
                    </div>
                    
                    <div class="receta-medicamentos">
                        <h4><i class="fas fa-pills"></i> Medicamentos:</h4>
                        <ul>
                            ${medicamentosHTML}
                        </ul>
                    </div>
                    
                    <div class="receta-actions">
                        <button class="btn btn-outline btn-small" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                            <i class="fas fa-print"></i> Imprimir
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="recetas-section">
                <div class="section-header">
                    <h2>Mis Recetas Médicas</h2>
                    <p>${recetas.length} receta(s) encontrada(s)</p>
                </div>
                
                <div class="recetas-grid">
                    ${recetasHTML}
                </div>
            </div>
        `;
    }

    async loadExamenesSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getExamenesPaciente();
            
            if (result.success && result.examenes && result.examenes.length > 0) {
                contentArea.innerHTML = this.getExamenesHTML(result.examenes);
            } else {
                contentArea.innerHTML = this.getEmptyStateHTML(
                    'No tienes exámenes registrados',
                    'Tu historial de exámenes aparecerá aquí después de que te sean ordenados',
                    null
                );
            }
        } catch (error) {
            console.error('Error cargando exámenes:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar los exámenes');
        }
    }

    getExamenesHTML(examenes) {
        const examenesHTML = examenes.map(examen => `
            <tr>
                <td>
                    <strong>${examen.tipo_examen}</strong>
                </td>
                <td>
                    <span class="status ${examen.estado.toLowerCase().replace(' ', '-')}">
                        ${examen.estado}
                    </span>
                </td>
                <td>
                    ${examen.ultimo_resultado ? 
                        `<span class="truncate">${examen.ultimo_resultado.substring(0, 50)}${examen.ultimo_resultado.length > 50 ? '...' : ''}</span>` : 
                        '<span class="text-muted">Sin resultados aún</span>'
                    }
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" title="Ver detalles" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${examen.ultimo_resultado ? `
                            <button class="btn-icon" title="Descargar" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                                <i class="fas fa-download"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        return `
            <div class="examenes-section">
                <div class="section-header">
                    <h2>Mis Exámenes Médicos</h2>
                    <p>${examenes.length} examen(es) encontrado(s)</p>
                </div>
                
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Tipo de Examen</th>
                                <th>Estado</th>
                                <th>Último Resultado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${examenesHTML}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    getEmptyStateHTML(title, description, buttonText, buttonClick) {
        const buttonHTML = buttonText ? `
            <button class="btn btn-primary" onclick="${buttonClick}">
                <i class="fas fa-calendar-plus"></i> ${buttonText}
            </button>
        ` : '';
        
        return `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <h3>${title}</h3>
                <p>${description}</p>
                ${buttonHTML}
            </div>
        `;
    }

    getErrorHTML(message) {
        return `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="pacienteDashboard.loadSection('dashboard')">
                    <i class="fas fa-home"></i> Volver al Inicio
                </button>
            </div>
        `;
    }

    calcularEdad(fechaNacimiento) {
        const nacimiento = new Date(fechaNacimiento);
        const hoy = new Date();
        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        const mes = hoy.getMonth() - nacimiento.getMonth();
        
        if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
            edad--;
        }
        
        return edad;
    }

    startTokenCheck() {
        // Verificar token cada 5 minutos
        setInterval(() => {
            this.api.verifyToken().then(result => {
                if (!result.success) {
                    logout();
                }
            });
        }, 5 * 60 * 1000);
    }
}

// Instancia global del dashboard de paciente
let pacienteDashboard;

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.pathname.includes('paciente.html')) {
            pacienteDashboard = new PacienteDashboard();
            pacienteDashboard.loadSection('dashboard');
        }
    });
} else {
    if (window.location.pathname.includes('paciente.html')) {
        pacienteDashboard = new PacienteDashboard();
        pacienteDashboard.loadSection('dashboard');
    }
}