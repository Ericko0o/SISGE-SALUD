// Funciones específicas para el dashboard de doctor
class DoctorDashboard {
    constructor() {
        this.api = apiClient;
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.init();
    }

    init() {
        // Verificar que el usuario es doctor
        if (this.user.rol !== 'Doctor') {
            window.location.href = '/login.html';
            return;
        }

        // Cargar perfil del doctor
        this.loadPerfil();
        
        // Configurar eventos
        this.setupEvents();
        
        // Actualizar hora cada minuto
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
        
        // Verificar token periódicamente
        this.startTokenCheck();
    }

    updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const dateString = now.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.innerHTML = `<i class="fas fa-clock"></i> ${timeString} - ${dateString}`;
        }
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

        // Botón de logout
        const logoutBtn = document.querySelector('.logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }

        // Modal de atención de paciente
        const attendForm = document.getElementById('attendPatientForm');
        if (attendForm) {
            attendForm.addEventListener('submit', (e) => this.handleAtencionPaciente(e));
        }

        // Modal de receta
        const prescriptionForm = document.getElementById('prescriptionForm');
        if (prescriptionForm) {
            prescriptionForm.addEventListener('submit', (e) => this.handleCrearReceta(e));
        }

        // Modal de examen
        const examForm = document.getElementById('examForm');
        if (examForm) {
            examForm.addEventListener('submit', (e) => this.handleCrearExamen(e));
        }

        // Cerrar modales al hacer clic fuera
        window.addEventListener('click', (e) => {
            const modals = ['attendPatientModal', 'prescriptionModal', 'examModal'];
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && e.target === modal) {
                    if (modalId === 'attendPatientModal') this.closeAttendModal();
                    else if (modalId === 'prescriptionModal') this.closePrescriptionModal();
                    else if (modalId === 'examModal') this.closeExamModal();
                }
            });
        });
    }

    async loadPerfil() {
        try {
            const result = await this.api.getPerfilPaciente(); // Reutilizamos el endpoint
            
            if (result.success) {
                this.perfil = result.perfil;
                this.updateUI();
            }
        } catch (error) {
            console.error('Error cargando perfil:', error);
        }
    }

    updateUI() {
        // Actualizar nombre en el sidebar
        const userNameElement = document.getElementById('userName');
        if (userNameElement && this.perfil.nombre) {
            userNameElement.textContent = this.perfil.nombre;
        }

        // Actualizar especialidad
        const specialtyElement = document.getElementById('doctorSpecialty');
        if (specialtyElement && this.perfil.detalles?.especialidad) {
            specialtyElement.textContent = this.perfil.detalles.especialidad;
        }
    }

    async loadSection(section) {
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
            case 'agenda':
                await this.loadAgendaSection();
                break;
            case 'atender':
                await this.loadAtenderSection();
                break;
            case 'recetar':
                await this.loadRecetarSection();
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
            const citasResult = await this.api.getCitasHoy();
            
            const stats = {
                citasHoy: citasResult.success ? citasResult.citas?.length || 0 : 0,
                citasPendientes: citasResult.success ? 
                    citasResult.citas?.filter(c => c.estado === 'Pendiente').length || 0 : 0,
                pacientesAtendidos: 0, // Esto vendría de un endpoint específico
                recetasHoy: 0 // Esto vendría de un endpoint específico
            };

            contentArea.innerHTML = this.getDashboardHTML(stats, citasResult.citas || []);
            
            // Cargar actividad reciente
            await this.loadRecentActivity();

        } catch (error) {
            console.error('Error cargando dashboard:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar el dashboard');
        }
    }

    getDashboardHTML(stats, citas) {
        // Obtener próximas citas (las 3 más próximas)
        const ahora = new Date();
        const citasFuturas = citas
            .filter(cita => new Date(cita.fecha_hora) > ahora && cita.estado !== 'Completada')
            .slice(0, 3);

        const proximasCitasHTML = citasFuturas.map(cita => `
            <div class="appointment-item">
                <div class="appointment-time">
                    <strong>${new Date(cita.fecha_hora).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}</strong>
                </div>
                <div class="appointment-details">
                    <strong>${cita.paciente_nombre}</strong>
                    <small>DNI: ${cita.paciente_dni}</small>
                </div>
                <div class="appointment-actions">
                    <button class="btn-icon" onclick="doctorDashboard.atenderPaciente('${cita.id_cita}')" title="Atender">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
        `).join('') || `
            <div class="no-data">
                <p>No hay citas programadas para hoy</p>
            </div>
        `;

        return `
            <div class="dashboard">
                <div class="dashboard-header">
                    <h2>Resumen Médico</h2>
                    <p>Panel de control para gestión médica</p>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-calendar-day"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.citasHoy}</h3>
                            <p>Citas Hoy</p>
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
                            <i class="fas fa-user-injured"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.pacientesAtendidos}</h3>
                            <p>Pacientes Hoy</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-prescription"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.recetasHoy}</h3>
                            <p>Recetas Hoy</p>
                        </div>
                    </div>
                </div>
                
                <div class="dashboard-sections">
                    <div class="section-card">
                        <h3><i class="fas fa-calendar-check"></i> Próximas Citas</h3>
                        <div id="nextAppointments">
                            ${proximasCitasHTML}
                        </div>
                    </div>
                    
                    <div class="section-card">
                        <h3><i class="fas fa-bolt"></i> Acciones Rápidas</h3>
                        <div class="quick-actions">
                            <button class="btn btn-primary" onclick="doctorDashboard.loadSection('agenda')">
                                <i class="fas fa-calendar-alt"></i> Ver Agenda
                            </button>
                            <button class="btn btn-secondary" onclick="doctorDashboard.loadSection('atender')">
                                <i class="fas fa-stethoscope"></i> Atender Paciente
                            </button>
                            <button class="btn btn-outline" onclick="doctorDashboard.loadSection('recetar')">
                                <i class="fas fa-prescription-bottle-alt"></i> Crear Receta
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="section-card full-width">
                    <h3><i class="fas fa-chart-line"></i> Actividad Reciente</h3>
                    <div id="recentActivity" class="loading-item">
                        <i class="fas fa-spinner fa-spin"></i> Cargando actividad...
                    </div>
                </div>
            </div>
        `;
    }

    async loadRecentActivity() {
        const activityContainer = document.getElementById('recentActivity');
        if (!activityContainer) return;

        // En una implementación real, esto vendría de la API
        setTimeout(() => {
            activityContainer.innerHTML = `
                <div class="activity-list">
                    <div class="activity-item">
                        <i class="fas fa-stethoscope"></i>
                        <div>
                            <p><strong>Consulta general</strong> realizada a Juan Pérez</p>
                            <small>Hace 2 horas</small>
                        </div>
                    </div>
                    <div class="activity-item">
                        <i class="fas fa-prescription-bottle-alt"></i>
                        <div>
                            <p>Receta generada para María López</p>
                            <small>Hace 4 horas</small>
                        </div>
                    </div>
                </div>
            `;
        }, 1000);
    }

    async loadPerfilSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getPerfilPaciente();
            
            if (result.success && result.perfil.detalles) {
                const detalles = result.perfil.detalles;
                contentArea.innerHTML = this.getPerfilHTML(detalles);
            } else {
                contentArea.innerHTML = this.getErrorHTML('Error al cargar el perfil');
            }
        } catch (error) {
            console.error('Error cargando perfil:', error);
            contentArea.innerHTML = this.getErrorHTML('Error de conexión');
        }
    }

    getPerfilHTML(detalles) {
        return `
            <div class="profile-section">
                <div class="profile-header">
                    <div class="profile-avatar">
                        <i class="fas fa-user-md"></i>
                    </div>
                    <div class="profile-info">
                        <h2>Dr. ${detalles.nombres || ''} ${detalles.apellidos || ''}</h2>
                        <p><i class="fas fa-user-tag"></i> ${detalles.especialidad || 'Médico'}</p>
                        <p><i class="fas fa-envelope"></i> ${this.user.email}</p>
                    </div>
                </div>
                
                <div class="profile-details">
                    <div class="detail-card">
                        <h3><i class="fas fa-id-card"></i> Información Profesional</h3>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>DNI:</label>
                                <span>${detalles.dni || 'No registrado'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Especialidad:</label>
                                <span>${detalles.especialidad || 'No registrada'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-card">
                        <h3><i class="fas fa-chart-bar"></i> Estadísticas</h3>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>Citas Hoy:</label>
                                <span>${detalles.citas_hoy || 0}</span>
                            </div>
                            <div class="detail-item">
                                <label>Citas Pendientes:</label>
                                <span>${detalles.citas_pendientes || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="profile-actions">
                    <button class="btn btn-outline" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                        <i class="fas fa-edit"></i> Editar Perfil
                    </button>
                    <button class="btn btn-outline" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                        <i class="fas fa-clock"></i> Ver Horario
                    </button>
                </div>
            </div>
        `;
    }

    async loadAgendaSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getCitasHoy();
            
            if (result.success && result.citas && result.citas.length > 0) {
                contentArea.innerHTML = this.getAgendaHTML(result.citas);
            } else {
                contentArea.innerHTML = this.getEmptyStateHTML(
                    'No hay citas programadas para hoy',
                    'Tu agenda está libre para el día de hoy',
                    'Volver al Dashboard',
                    () => this.loadSection('dashboard')
                );
            }
        } catch (error) {
            console.error('Error cargando agenda:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar la agenda');
        }
    }

    getAgendaHTML(citas) {
        // Ordenar citas por hora
        const citasOrdenadas = citas.sort((a, b) => 
            new Date(a.fecha_hora) - new Date(b.fecha_hora)
        );

        const citasCount = {
            total: citasOrdenadas.length,
            pendientes: citasOrdenadas.filter(c => c.estado === 'Pendiente').length,
            atendidas: citasOrdenadas.filter(c => c.estado === 'Completada').length
        };

        const agendaHTML = citasOrdenadas.map(cita => `
            <div class="agenda-item ${cita.estado.toLowerCase()}">
                <div class="agenda-time">
                    <strong>${new Date(cita.fecha_hora).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}</strong>
                </div>
                <div class="agenda-content">
                    <div class="agenda-header">
                        <h3>${cita.paciente_nombre}</h3>
                        <span class="agenda-status ${cita.estado.toLowerCase()}">
                            ${cita.estado}
                        </span>
                    </div>
                    <div class="agenda-details">
                        <p><i class="fas fa-id-card"></i> DNI: ${cita.paciente_dni}</p>
                        <p><i class="fas fa-hospital"></i> ${cita.hospital_nombre || 'Sin hospital asignado'}</p>
                    </div>
                    <div class="agenda-actions">
                        ${cita.estado === 'Pendiente' ? `
                            <button class="btn btn-primary btn-small" onclick="doctorDashboard.atenderPaciente('${cita.id_cita}')">
                                <i class="fas fa-play"></i> Atender
                            </button>
                        ` : ''}
                        <button class="btn btn-outline btn-small" onclick="doctorDashboard.verHistorialPaciente('${cita.id_paciente}')">
                            <i class="fas fa-history"></i> Historial
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        return `
            <div class="agenda-section">
                <div class="section-header">
                    <h2>Mi Agenda Médica</h2>
                    <div class="agenda-stats">
                        <span class="stat-badge">
                            <i class="fas fa-calendar-check"></i>
                            Total: ${citasCount.total}
                        </span>
                        <span class="stat-badge">
                            <i class="fas fa-clock"></i>
                            Pendientes: ${citasCount.pendientes}
                        </span>
                        <span class="stat-badge">
                            <i class="fas fa-check-circle"></i>
                            Atendidas: ${citasCount.atendidas}
                        </span>
                    </div>
                </div>
                
                <div class="agenda-timeline">
                    ${agendaHTML}
                </div>
            </div>
        `;
    }

    async atenderPaciente(citaId) {
        try {
            // Obtener información de la cita
            const result = await this.api.getCitaDetalles(citaId);
            
            if (result.success) {
                this.openAttendModal(citaId, result.cita);
            } else {
                showNotification('Error al obtener información de la cita', 'error');
            }
        } catch (error) {
            console.error('Error preparando atención:', error);
            showNotification('Error al preparar la atención', 'error');
        }
    }

    openAttendModal(citaId, citaInfo) {
        const modal = document.getElementById('attendPatientModal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        
        // Configurar ID de la cita
        document.getElementById('attendCitaId').value = citaId;
        
        // Mostrar información del paciente
        const patientDetails = document.getElementById('patientDetails');
        patientDetails.innerHTML = `
            <div class="patient-detail-item">
                <label>Paciente:</label>
                <span>${citaInfo.paciente_nombre}</span>
            </div>
            <div class="patient-detail-item">
                <label>DNI:</label>
                <span>${citaInfo.paciente_dni}</span>
            </div>
            <div class="patient-detail-item">
                <label>Hora de cita:</label>
                <span>${new Date(citaInfo.fecha_hora).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        `;
    }

    closeAttendModal() {
        const modal = document.getElementById('attendPatientModal');
        if (modal) {
            modal.style.display = 'none';
            const form = document.getElementById('attendPatientForm');
            if (form) form.reset();
        }
    }

    async handleAtencionPaciente(e) {
        e.preventDefault();
        
        const citaId = document.getElementById('attendCitaId').value;
        const tipoAtencion = document.getElementById('attendType').value;
        const diagnostico = document.getElementById('diagnostico').value;
        const observaciones = document.getElementById('observaciones').value;
        
        if (!tipoAtencion || !diagnostico) {
            showNotification('Por favor complete todos los campos requeridos', 'error');
            return;
        }
        
        try {
            const result = await this.api.crearAtencion({
                id_cita: citaId,
                tipo_atencion: tipoAtencion,
                diagnostico: diagnostico,
                observaciones: observaciones
            });
            
            if (result.success) {
                showNotification('¡Atención registrada exitosamente!', 'success');
                this.closeAttendModal();
                
                // Preguntar si desea crear receta
                if (confirm('¿Desea crear una receta para este paciente?')) {
                    this.openPrescriptionModal(result.id_atencion);
                }
                
                // Recargar secciones
                this.loadAgendaSection();
                this.loadDashboard();
                
            } else {
                showNotification(result.message || 'Error al registrar la atención', 'error');
            }
        } catch (error) {
            console.error('Error registrando atención:', error);
            showNotification('Error de conexión al registrar la atención', 'error');
        }
    }

    async loadAtenderSection() {
        const contentArea = document.getElementById('contentArea');
        
        contentArea.innerHTML = this.getAtenderHTML();
        
        // Cargar citas pendientes
        await this.loadCitasPendientes();
    }

    getAtenderHTML() {
        return `
            <div class="atender-section">
                <div class="section-header">
                    <h2>Atender Paciente</h2>
                    <p>Selecciona una cita para comenzar la atención</p>
                </div>
                
                <div class="atender-instructions">
                    <div class="instruction-card">
                        <i class="fas fa-1"></i>
                        <h4>Selecciona una cita pendiente</h4>
                        <p>Elige un paciente de tu lista de citas del día</p>
                    </div>
                    <div class="instruction-card">
                        <i class="fas fa-2"></i>
                        <h4>Registra el diagnóstico</h4>
                        <p>Ingresa los detalles de la consulta y diagnóstico</p>
                    </div>
                    <div class="instruction-card">
                        <i class="fas fa-3"></i>
                        <h4>Genera receta si es necesario</h4>
                        <p>Crea recetas médicas digitales para el paciente</p>
                    </div>
                </div>
                
                <div class="citas-pendientes-section">
                    <h3><i class="fas fa-clock"></i> Citas Pendientes de Hoy</h3>
                    <div id="pendingAppointments" class="loading-item">
                        <i class="fas fa-spinner fa-spin"></i> Cargando citas pendientes...
                    </div>
                </div>
            </div>
        `;
    }

    async loadCitasPendientes() {
        const pendingContainer = document.getElementById('pendingAppointments');
        if (!pendingContainer) return;
        
        try {
            const result = await this.api.getCitasHoy();
            
            if (result.success && result.citas) {
                const citasPendientes = result.citas.filter(cita => cita.estado === 'Pendiente');
                
                if (citasPendientes.length > 0) {
                    pendingContainer.innerHTML = `
                        <div class="citas-grid">
                            ${citasPendientes.map(cita => `
                                <div class="cita-card">
                                    <div class="cita-header">
                                        <h4>${cita.paciente_nombre}</h4>
                                        <span class="cita-time">
                                            ${new Date(cita.fecha_hora).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                    </div>
                                    <div class="cita-details">
                                        <p><i class="fas fa-id-card"></i> ${cita.paciente_dni}</p>
                                        <p><i class="fas fa-hospital"></i> ${cita.hospital_nombre || 'No especificado'}</p>
                                    </div>
                                    <div class="cita-actions">
                                        <button class="btn btn-primary" onclick="doctorDashboard.atenderPaciente('${cita.id_cita}')">
                                            <i class="fas fa-play"></i> Comenzar Atención
                                        </button>
                                        <button class="btn btn-outline" onclick="doctorDashboard.verHistorialPaciente('${cita.id_paciente}')">
                                            <i class="fas fa-history"></i> Historial
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                } else {
                    pendingContainer.innerHTML = `
                        <div class="empty-state-small">
                            <i class="fas fa-calendar-check"></i>
                            <p>No hay citas pendientes para hoy</p>
                            <small>Todas las citas han sido atendidas</small>
                        </div>
                    `;
                }
            } else {
                pendingContainer.innerHTML = `
                    <div class="empty-state-small">
                        <i class="fas fa-calendar-times"></i>
                        <p>No hay citas programadas para hoy</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error cargando citas pendientes:', error);
            pendingContainer.innerHTML = `
                <div class="error-state-small">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar las citas</p>
                </div>
            `;
        }
    }

    verHistorialPaciente(pacienteId) {
        showNotification('Funcionalidad de historial en desarrollo', 'info');
    }

    async loadRecetarSection() {
        const contentArea = document.getElementById('contentArea');
        contentArea.innerHTML = this.getRecetarHTML();
    }

    getRecetarHTML() {
        return `
            <div class="recetar-section">
                <div class="section-header">
                    <h2>Gestión de Recetas</h2>
                    <p>Crea y gestiona recetas médicas para tus pacientes</p>
                </div>
                
                <div class="recetar-actions">
                    <div class="action-card" onclick="doctorDashboard.crearRecetaNueva()">
                        <div class="action-icon">
                            <i class="fas fa-file-prescription"></i>
                        </div>
                        <h3>Crear Nueva Receta</h3>
                        <p>Genera una receta médica desde cero</p>
                    </div>
                    
                    <div class="action-card" onclick="doctorDashboard.verRecetasRecientes()">
                        <div class="action-icon">
                            <i class="fas fa-history"></i>
                        </div>
                        <h3>Ver Historial</h3>
                        <p>Consulta recetas creadas anteriormente</p>
                    </div>
                    
                    <div class="action-card" onclick="doctorDashboard.cargarPlantillas()">
                        <div class="action-icon">
                            <i class="fas fa-copy"></i>
                        </div>
                        <h3>Plantillas</h3>
                        <p>Usa plantillas predefinidas</p>
                    </div>
                </div>
                
                <div class="recetar-guia">
                    <h3><i class="fas fa-info-circle"></i> ¿Cómo crear una receta?</h3>
                    <ol>
                        <li>Completa una atención médica para un paciente</li>
                        <li>Selecciona los medicamentos necesarios</li>
                        <li>Especifica las dosis e indicaciones</li>
                        <li>Genera la receta digital</li>
                        <li>El paciente podrá acceder a su receta desde su perfil</li>
                    </ol>
                </div>
            </div>
        `;
    }

    crearRecetaNueva() {
        this.openPrescriptionModal();
    }

    verRecetasRecientes() {
        showNotification('Funcionalidad de historial de recetas en desarrollo', 'info');
    }

    cargarPlantillas() {
        showNotification('Funcionalidad de plantillas en desarrollo', 'info');
    }

    async openPrescriptionModal(atencionId = null) {
        const modal = document.getElementById('prescriptionModal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        
        if (atencionId) {
            document.getElementById('prescriptionAtencionId').value = atencionId;
        }
        
        // Cargar medicamentos
        try {
            const result = await this.api.getMedicamentos();
            const select = document.getElementById('selectMedicamento');
            
            if (result.success && result.medicamentos) {
                select.innerHTML = '<option value="">Seleccionar medicamento...</option>';
                result.medicamentos.forEach(med => {
                    const option = document.createElement('option');
                    option.value = med.id_medicamento;
                    option.textContent = `${med.nombre} - ${med.presentacion}`;
                    option.dataset.nombre = med.nombre;
                    option.dataset.presentacion = med.presentacion;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error cargando medicamentos:', error);
        }
    }

    closePrescriptionModal() {
        const modal = document.getElementById('prescriptionModal');
        if (modal) {
            modal.style.display = 'none';
            const form = document.getElementById('prescriptionForm');
            if (form) form.reset();
            document.getElementById('medicamentosList').innerHTML = `
                <div class="empty-state-small">
                    <i class="fas fa-prescription-bottle-alt"></i>
                    <p>No hay medicamentos añadidos</p>
                </div>
            `;
        }
    }

    addMedicamentoToList() {
        const select = document.getElementById('selectMedicamento');
        const selectedOption = select.options[select.selectedIndex];
        
        if (!selectedOption.value) return;
        
        const medicamentosList = document.getElementById('medicamentosList');
        
        // Remover mensaje de vacío si existe
        if (medicamentosList.querySelector('.empty-state-small')) {
            medicamentosList.innerHTML = '';
        }
        
        // Crear elemento del medicamento
        const medicamentoDiv = document.createElement('div');
        medicamentoDiv.className = 'medicamento-item';
        medicamentoDiv.innerHTML = `
            <div class="medicamento-info">
                <h4>${selectedOption.dataset.nombre}</h4>
                <small>${selectedOption.dataset.presentacion}</small>
            </div>
            <div class="medicamento-form">
                <input type="text" class="indicaciones-input" placeholder="Indicaciones (ej: 1 tableta cada 8 horas)">
                <button type="button" class="btn-icon" onclick="doctorDashboard.removeMedicamento(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        medicamentosList.appendChild(medicamentoDiv);
        
        // Limpiar selección
        select.selectedIndex = 0;
    }

    removeMedicamento(button) {
        const medicamentoItem = button.closest('.medicamento-item');
        medicamentoItem.remove();
        
        // Mostrar mensaje de vacío si no hay medicamentos
        const medicamentosList = document.getElementById('medicamentosList');
        if (medicamentosList.children.length === 0) {
            medicamentosList.innerHTML = `
                <div class="empty-state-small">
                    <i class="fas fa-prescription-bottle-alt"></i>
                    <p>No hay medicamentos añadidos</p>
                </div>
            `;
        }
    }

    async handleCrearReceta(e) {
        e.preventDefault();
        
        const atencionId = document.getElementById('prescriptionAtencionId').value;
        const medicamentosItems = document.querySelectorAll('.medicamento-item');
        
        if (medicamentosItems.length === 0) {
            showNotification('Debe agregar al menos un medicamento', 'error');
            return;
        }
        
        const medicamentos = [];
        medicamentosItems.forEach(item => {
            const nombre = item.querySelector('h4').textContent;
            const indicaciones = item.querySelector('.indicaciones-input').value;
            
            if (indicaciones) {
                medicamentos.push({
                    nombre: nombre,
                    indicaciones: indicaciones
                });
            }
        });
        
        try {
            const result = await this.api.crearReceta({
                id_atencion: atencionId || 'demo', // En producción, usar el ID real
                medicamentos: medicamentos
            });
            
            if (result.success) {
                showNotification('Receta creada exitosamente', 'success');
                this.closePrescriptionModal();
            } else {
                showNotification(result.message || 'Error al crear la receta', 'error');
            }
        } catch (error) {
            console.error('Error creando receta:', error);
            showNotification('Error al crear la receta', 'error');
        }
    }

    async loadExamenesSection() {
        const contentArea = document.getElementById('contentArea');
        contentArea.innerHTML = this.getExamenesHTML();
        
        // Cargar datos de exámenes
        await this.loadExamenesData();
    }

    getExamenesHTML() {
        return `
            <div class="examenes-section">
                <div class="section-header">
                    <h2>Órdenes de Exámenes</h2>
                    <button class="btn btn-primary" onclick="doctorDashboard.crearNuevoExamen()">
                        <i class="fas fa-plus"></i> Nueva Orden
                    </button>
                </div>
                
                <div class="examenes-stats">
                    <div class="stat-card-small">
                        <i class="fas fa-clock"></i>
                        <div>
                            <h3 id="examenesPendientes">0</h3>
                            <p>Pendientes</p>
                        </div>
                    </div>
                    <div class="stat-card-small">
                        <i class="fas fa-check-circle"></i>
                        <div>
                            <h3 id="examenesCompletados">0</h3>
                            <p>Completados</p>
                        </div>
                    </div>
                    <div class="stat-card-small">
                        <i class="fas fa-vial"></i>
                        <div>
                            <h3 id="examenesTotal">0</h3>
                            <p>Total</p>
                        </div>
                    </div>
                </div>
                
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Paciente</th>
                                <th>Tipo de Examen</th>
                                <th>Fecha</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="examenesTable">
                            <tr>
                                <td colspan="5" class="text-center">
                                    <i class="fas fa-spinner fa-spin"></i> Cargando exámenes...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    async loadExamenesData() {
        try {
            // Simular datos por ahora
            setTimeout(() => {
                document.getElementById('examenesTable').innerHTML = `
                    <tr>
                        <td>Juan Pérez</td>
                        <td>Hemograma completo</td>
                        <td>${new Date().toLocaleDateString('es-ES')}</td>
                        <td><span class="status pendiente">Pendiente</span></td>
                        <td>
                            <button class="btn-icon" title="Ver detalles" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon" title="Editar" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                                <i class="fas fa-edit"></i>
                            </button>
                        </td>
                    </tr>
                    <tr>
                        <td>María López</td>
                        <td>Rayos X de tórax</td>
                        <td>${new Date().toLocaleDateString('es-ES')}</td>
                        <td><span class="status completada">Completada</span></td>
                        <td>
                            <button class="btn-icon" title="Ver resultados" onclick="this.disabled=true; showNotification('Funcionalidad en desarrollo', 'info'); this.disabled=false">
                                <i class="fas fa-file-medical-alt"></i>
                            </button>
                        </td>
                    </tr>
                `;
                
                // Actualizar estadísticas
                document.getElementById('examenesPendientes').textContent = '1';
                document.getElementById('examenesCompletados').textContent = '1';
                document.getElementById('examenesTotal').textContent = '2';
                
            }, 1000);
        } catch (error) {
            console.error('Error cargando exámenes:', error);
            document.getElementById('examenesTable').innerHTML = `
                <tr>
                    <td colspan="5" class="text-center error">
                        Error al cargar los exámenes
                    </td>
                </tr>
            `;
        }
    }

    crearNuevoExamen() {
        const modal = document.getElementById('examModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    closeExamModal() {
        const modal = document.getElementById('examModal');
        if (modal) {
            modal.style.display = 'none';
            const form = document.getElementById('examForm');
            if (form) form.reset();
        }
    }

    async handleCrearExamen(e) {
        e.preventDefault();
        
        const tipoExamen = document.getElementById('examType').value;
        const observaciones = document.getElementById('examObservations').value;
        
        if (!tipoExamen) {
            showNotification('Debe especificar el tipo de examen', 'error');
            return;
        }
        
        try {
            const result = await this.api.crearExamen({
                id_paciente: 'aaaa1111-aaaa-1111-aaaa-111111111111', // ID de ejemplo
                tipo_examen: tipoExamen,
                observaciones: observaciones
            });
            
            if (result.success) {
                showNotification('Orden de examen creada exitosamente', 'success');
                this.closeExamModal();
                this.loadExamenesData(); // Recargar lista
            } else {
                showNotification(result.message || 'Error al crear la orden', 'error');
            }
        } catch (error) {
            console.error('Error creando examen:', error);
            showNotification('Error al crear la orden de examen', 'error');
        }
    }

    getEmptyStateHTML(title, description, buttonText, buttonClick) {
        const buttonHTML = buttonText ? `
            <button class="btn btn-primary" onclick="${buttonClick}">
                ${buttonText}
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
                <button class="btn btn-primary" onclick="doctorDashboard.loadSection('dashboard')">
                    <i class="fas fa-home"></i> Volver al Inicio
                </button>
            </div>
        `;
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

// Instancia global del dashboard de doctor
let doctorDashboard;

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.pathname.includes('doctor.html')) {
            doctorDashboard = new DoctorDashboard();
            doctorDashboard.loadSection('dashboard');
        }
    });
} else {
    if (window.location.pathname.includes('doctor.html')) {
        doctorDashboard = new DoctorDashboard();
        doctorDashboard.loadSection('dashboard');
    }
}