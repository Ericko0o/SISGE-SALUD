// Funciones específicas para el dashboard de admin
class AdminDashboard {
    constructor() {
        this.api = apiClient;
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.init();
    }

    init() {
        // Verificar que el usuario es admin
        if (this.user.rol !== 'Administrador') {
            window.location.href = '/login.html';
            return;
        }

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

        // Botón de logout
        const logoutBtn = document.querySelector('.logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }

        // Modal crear doctor
        const createDoctorForm = document.getElementById('createDoctorForm');
        if (createDoctorForm) {
            createDoctorForm.addEventListener('submit', (e) => this.handleCrearDoctor(e));
        }

        // Modal crear hospital
        const createHospitalForm = document.getElementById('createHospitalForm');
        if (createHospitalForm) {
            createHospitalForm.addEventListener('submit', (e) => this.handleCrearHospital(e));
        }

        // Cerrar modales al hacer clic fuera
        window.addEventListener('click', (e) => {
            const modals = ['createDoctorModal', 'createHospitalModal', 'detailsModal'];
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && e.target === modal) {
                    if (modalId === 'createDoctorModal') this.closeCreateDoctorModal();
                    else if (modalId === 'createHospitalModal') this.closeCreateHospitalModal();
                    else if (modalId === 'detailsModal') this.closeDetailsModal();
                }
            });
        });
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
            case 'usuarios':
                await this.loadUsuariosSection();
                break;
            case 'doctores':
                await this.loadDoctoresSection();
                break;
            case 'hospitales':
                await this.loadHospitalesSection();
                break;
            case 'reportes':
                await this.loadReportesSection();
                break;
            case 'configuracion':
                await this.loadConfiguracionSection();
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
            const [usuariosResult, doctoresResult, hospitalesResult] = await Promise.all([
                this.api.getUsuarios(),
                this.api.getDoctores(),
                this.api.getHospitales()
            ]);

            const stats = {
                totalUsuarios: usuariosResult.success ? usuariosResult.usuarios?.length || 0 : 0,
                totalDoctores: doctoresResult.success ? doctoresResult.doctores?.length || 0 : 0,
                totalHospitales: hospitalesResult.success ? hospitalesResult.hospitales?.length || 0 : 0,
                citasHoy: 0 // Esto vendría de un endpoint específico
            };

            contentArea.innerHTML = this.getDashboardHTML(stats);
            
            // Cargar actividad reciente
            await this.loadRecentActivity();

        } catch (error) {
            console.error('Error cargando dashboard:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar el dashboard');
        }
    }

    getDashboardHTML(stats) {
        return `
            <div class="dashboard">
                <div class="dashboard-header">
                    <h2>Resumen del Sistema</h2>
                    <p>Estadísticas generales y estado del sistema</p>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.totalUsuarios}</h3>
                            <p>Usuarios Totales</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-user-md"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.totalDoctores}</h3>
                            <p>Doctores Activos</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-hospital"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.totalHospitales}</h3>
                            <p>Hospitales</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-calendar-check"></i>
                        </div>
                        <div class="stat-info">
                            <h3>${stats.citasHoy}</h3>
                            <p>Citas Hoy</p>
                        </div>
                    </div>
                </div>
                
                <div class="dashboard-sections">
                    <div class="section-card">
                        <h3><i class="fas fa-chart-line"></i> Actividad Reciente</h3>
                        <div id="recentActivity" class="loading-item">
                            <i class="fas fa-spinner fa-spin"></i> Cargando actividad...
                        </div>
                    </div>
                    
                    <div class="section-card">
                        <h3><i class="fas fa-bolt"></i> Acciones Rápidas</h3>
                        <div class="quick-actions">
                            <button class="btn btn-primary" onclick="adminDashboard.loadSection('doctores'); setTimeout(() => adminDashboard.openCreateDoctorModal(), 300)">
                                <i class="fas fa-user-md"></i> Nuevo Doctor
                            </button>
                            <button class="btn btn-secondary" onclick="adminDashboard.loadSection('hospitales'); setTimeout(() => adminDashboard.openCreateHospitalModal(), 300)">
                                <i class="fas fa-hospital"></i> Nuevo Hospital
                            </button>
                            <button class="btn btn-outline" onclick="adminDashboard.loadSection('reportes')">
                                <i class="fas fa-chart-bar"></i> Ver Reportes
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="section-card full-width">
                    <h3><i class="fas fa-tasks"></i> Tareas Pendientes</h3>
                    <div id="pendingTasks">
                        <div class="task-list">
                            <div class="task-item">
                                <i class="fas fa-check-circle"></i>
                                <div>
                                    <p>Sistema operativo al 100%</p>
                                    <small>Todos los servicios funcionando correctamente</small>
                                </div>
                            </div>
                            <div class="task-item">
                                <i class="fas fa-exclamation-circle"></i>
                                <div>
                                    <p>Revisar usuarios inactivos</p>
                                    <small>5 usuarios no han iniciado sesión en más de 30 días</small>
                                </div>
                                <button class="btn btn-outline btn-small" onclick="adminDashboard.loadSection('usuarios')">
                                    Revisar
                                </button>
                            </div>
                            <div class="task-item">
                                <i class="fas fa-clock"></i>
                                <div>
                                    <p>Actualizar especialidades médicas</p>
                                    <small>Agregar nuevas especialidades al catálogo</small>
                                </div>
                                <button class="btn btn-outline btn-small" onclick="adminDashboard.actualizarEspecialidades()">
                                    Actualizar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadRecentActivity() {
        const activityContainer = document.getElementById('recentActivity');
        if (!activityContainer) return;

        // Simular datos
        setTimeout(() => {
            activityContainer.innerHTML = `
                <div class="activity-timeline">
                    <div class="activity-item">
                        <div class="activity-time">Hace 2 horas</div>
                        <div class="activity-content">
                            <i class="fas fa-user-plus"></i>
                            <div>
                                <p>Nuevo doctor registrado: <strong>Dr. Carlos Méndez</strong></p>
                                <small>Especialidad: Cardiología</small>
                            </div>
                        </div>
                    </div>
                    <div class="activity-item">
                        <div class="activity-time">Hace 5 horas</div>
                        <div class="activity-content">
                            <i class="fas fa-hospital"></i>
                            <div>
                                <p>Hospital <strong>Clínica San Pablo</strong> actualizado</p>
                                <small>Nuevas áreas agregadas</small>
                            </div>
                        </div>
                    </div>
                    <div class="activity-item">
                        <div class="activity-time">Ayer</div>
                        <div class="activity-content">
                            <i class="fas fa-user-shield"></i>
                            <div>
                                <p>Usuario <strong>maria.lopez</strong> suspendido temporalmente</p>
                                <small>Por múltiples intentos fallidos de acceso</small>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }, 1000);
    }

    async loadUsuariosSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getUsuarios();
            
            if (result.success && result.usuarios && result.usuarios.length > 0) {
                contentArea.innerHTML = this.getUsuariosHTML(result.usuarios);
            } else {
                contentArea.innerHTML = this.getEmptyStateHTML(
                    'No hay usuarios registrados',
                    'El sistema aún no tiene usuarios registrados',
                    null
                );
            }
        } catch (error) {
            console.error('Error cargando usuarios:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar los usuarios');
        }
    }

    getUsuariosHTML(usuarios) {
        const usuariosHTML = usuarios.map(usuario => `
            <tr>
                <td>
                    <div class="user-avatar-small">
                        <i class="fas fa-${usuario.rol_nombre === 'Doctor' ? 'user-md' : usuario.rol_nombre === 'Paciente' ? 'user-injured' : 'user'}"></i>
                    </div>
                </td>
                <td>
                    <strong>${usuario.nombre_completo || 'Sin nombre'}</strong>
                </td>
                <td>
                    <span class="role-badge ${usuario.rol_nombre.toLowerCase()}">
                        ${usuario.rol_nombre}
                    </span>
                </td>
                <td>${usuario.email}</td>
                <td>
                    ${new Date(usuario.creado_en).toLocaleDateString('es-ES')}
                    <br>
                    <small>${new Date(usuario.creado_en).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}</small>
                </td>
                <td>
                    <span class="status activo">Activo</span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" title="Ver detalles" onclick="adminDashboard.verDetallesUsuario('${usuario.id_usuario}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon" title="Editar" onclick="adminDashboard.editarUsuario('${usuario.id_usuario}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${usuario.rol_nombre !== 'Administrador' ? `
                            <button class="btn-icon" title="Suspender" onclick="adminDashboard.suspenderUsuario('${usuario.id_usuario}')">
                                <i class="fas fa-ban"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        return `
            <div class="usuarios-section">
                <div class="section-header">
                    <h2>Usuarios del Sistema</h2>
                    <div class="section-actions">
                        <button class="btn btn-outline" onclick="adminDashboard.exportUsuarios()">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                        <button class="btn btn-primary" onclick="adminDashboard.filtrarUsuarios()">
                            <i class="fas fa-filter"></i> Filtrar
                        </button>
                    </div>
                </div>
                
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Nombre</th>
                                <th>Rol</th>
                                <th>Email</th>
                                <th>Registro</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usuariosHTML}
                        </tbody>
                    </table>
                </div>
                
                <div class="table-footer">
                    <div class="pagination-info">
                        Mostrando ${usuarios.length} usuarios
                    </div>
                    <div class="pagination">
                        <button class="btn btn-outline btn-small" disabled>
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <span class="current-page">1</span>
                        <button class="btn btn-outline btn-small">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async loadDoctoresSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getDoctores();
            
            if (result.success && result.doctores && result.doctores.length > 0) {
                contentArea.innerHTML = this.getDoctoresHTML(result.doctores);
            } else {
                contentArea.innerHTML = this.getEmptyStateHTML(
                    'No hay doctores registrados',
                    'Comienza registrando el primer doctor en el sistema',
                    'Registrar Primer Doctor',
                    () => this.openCreateDoctorModal()
                );
            }
        } catch (error) {
            console.error('Error cargando doctores:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar los doctores');
        }
    }

    getDoctoresHTML(doctores) {
        const doctoresHTML = doctores.map(doctor => `
            <div class="doctor-card">
                <div class="doctor-header">
                    <div class="doctor-avatar">
                        <i class="fas fa-user-md"></i>
                    </div>
                    <div class="doctor-info">
                        <h3>Dr. ${doctor.nombres} ${doctor.apellidos}</h3>
                        <p>${doctor.especialidad || 'Medicina General'}</p>
                    </div>
                </div>
                
                <div class="doctor-details">
                    <div class="detail-item">
                        <i class="fas fa-id-card"></i>
                        <span>DNI: ${doctor.dni}</span>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-calendar-alt"></i>
                        <span>Citas hoy: ${Math.floor(Math.random() * 10)}</span>
                    </div>
                </div>
                
                <div class="doctor-actions">
                    <button class="btn btn-outline btn-small" onclick="adminDashboard.verDetallesDoctor('${doctor.id_doctor}')">
                        <i class="fas fa-eye"></i> Detalles
                    </button>
                    <button class="btn btn-outline btn-small" onclick="adminDashboard.editarDoctor('${doctor.id_doctor}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-outline btn-small" onclick="adminDashboard.asignarTurno('${doctor.id_doctor}')">
                        <i class="fas fa-clock"></i> Turnos
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="doctores-section">
                <div class="section-header">
                    <h2>Doctores del Sistema</h2>
                    <button class="btn btn-primary" onclick="adminDashboard.openCreateDoctorModal()">
                        <i class="fas fa-user-plus"></i> Nuevo Doctor
                    </button>
                </div>
                
                <div class="doctores-grid">
                    ${doctoresHTML}
                </div>
                
                <div class="doctores-stats">
                    <h3><i class="fas fa-chart-pie"></i> Estadísticas por Especialidad</h3>
                    <div id="especialidadesChart" class="chart-placeholder">
                        <p>Gráfico de especialidades se cargará aquí</p>
                    </div>
                </div>
            </div>
        `;
    }

    async openCreateDoctorModal() {
        const modal = document.getElementById('createDoctorModal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        
        // Cargar especialidades
        try {
            const result = await this.api.getEspecialidades();
            const select = document.getElementById('doctorEspecialidad');
            
            if (result.success && result.especialidades) {
                select.innerHTML = '<option value="">Seleccionar especialidad...</option>';
                result.especialidades.forEach(esp => {
                    const option = document.createElement('option');
                    option.value = esp.id_especialidad;
                    option.textContent = esp.nombre;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error cargando especialidades:', error);
        }
    }

    closeCreateDoctorModal() {
        const modal = document.getElementById('createDoctorModal');
        if (modal) {
            modal.style.display = 'none';
            const form = document.getElementById('createDoctorForm');
            if (form) form.reset();
        }
    }

    async handleCrearDoctor(e) {
        e.preventDefault();
        
        const password = document.getElementById('doctorPassword').value;
        const confirmPassword = document.getElementById('confirmDoctorPassword').value;
        
        if (password !== confirmPassword) {
            showNotification('Las contraseñas no coinciden', 'error');
            return;
        }
        
        const doctorData = {
            dni: document.getElementById('doctorDni').value,
            nombres: document.getElementById('doctorNombres').value,
            apellidos: document.getElementById('doctorApellidos').value,
            id_especialidad: document.getElementById('doctorEspecialidad').value,
            email: document.getElementById('doctorEmail').value,
            password: password
        };
        
        // Validaciones básicas
        if (!doctorData.dni || doctorData.dni.length !== 8) {
            showNotification('El DNI debe tener 8 dígitos', 'error');
            return;
        }
        
        if (!doctorData.nombres || !doctorData.apellidos) {
            showNotification('Nombre y apellidos son requeridos', 'error');
            return;
        }
        
        if (!doctorData.email || !doctorData.email.includes('@')) {
            showNotification('Email inválido', 'error');
            return;
        }
        
        if (!doctorData.password || doctorData.password.length < 6) {
            showNotification('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        
        try {
            const result = await this.api.crearDoctor(doctorData);
            
            if (result.success) {
                showNotification('Doctor creado exitosamente', 'success');
                this.closeCreateDoctorModal();
                this.loadDoctoresSection();
                this.loadDashboard(); // Actualizar estadísticas
            } else {
                showNotification(result.message || 'Error al crear el doctor', 'error');
            }
        } catch (error) {
            console.error('Error creando doctor:', error);
            showNotification('Error al crear el doctor', 'error');
        }
    }

    async loadHospitalesSection() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const result = await this.api.getHospitales();
            
            if (result.success && result.hospitales && result.hospitales.length > 0) {
                contentArea.innerHTML = this.getHospitalesHTML(result.hospitales);
            } else {
                contentArea.innerHTML = this.getEmptyStateHTML(
                    'No hay hospitales registrados',
                    'Comienza registrando el primer hospital en el sistema',
                    'Registrar Primer Hospital',
                    () => this.openCreateHospitalModal()
                );
            }
        } catch (error) {
            console.error('Error cargando hospitales:', error);
            contentArea.innerHTML = this.getErrorHTML('Error al cargar los hospitales');
        }
    }

    getHospitalesHTML(hospitales) {
        const hospitalesHTML = hospitales.map(hospital => `
            <div class="hospital-card">
                <div class="hospital-header">
                    <div class="hospital-icon">
                        <i class="fas fa-hospital"></i>
                    </div>
                    <div class="hospital-info">
                        <h3>${hospital.nombre}</h3>
                        <p><i class="fas fa-map-marker-alt"></i> ${hospital.direccion || 'Sin dirección'}</p>
                    </div>
                </div>
                
                <div class="hospital-details">
                    <div class="detail-item">
                        <span class="label">Tipo:</span>
                        <span class="value ${hospital.tipo?.toLowerCase()}">${hospital.tipo || 'No especificado'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Áreas:</span>
                        <span class="value">${hospital.total_areas || 0}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Doctores:</span>
                        <span class="value">${Math.floor(Math.random() * 20) + 5}</span>
                    </div>
                </div>
                
                <div class="hospital-actions">
                    <button class="btn btn-outline btn-small" onclick="adminDashboard.verDetallesHospital('${hospital.id_hospital}')">
                        <i class="fas fa-eye"></i> Detalles
                    </button>
                    <button class="btn btn-outline btn-small" onclick="adminDashboard.editarHospital('${hospital.id_hospital}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-outline btn-small" onclick="adminDashboard.gestionarAreas('${hospital.id_hospital}')">
                        <i class="fas fa-layer-group"></i> Áreas
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="hospitales-section">
                <div class="section-header">
                    <h2>Hospitales del Sistema</h2>
                    <button class="btn btn-primary" onclick="adminDashboard.openCreateHospitalModal()">
                        <i class="fas fa-plus"></i> Nuevo Hospital
                    </button>
                </div>
                
                <div class="hospitales-grid">
                    ${hospitalesHTML}
                </div>
                
                <div class="mapa-hospitales">
                    <h3><i class="fas fa-map"></i> Distribución de Hospitales</h3>
                    <div class="mapa-placeholder">
                        <i class="fas fa-map-marked-alt"></i>
                        <p>Mapa interactivo de hospitales</p>
                        <small>En una versión completa, aquí se mostraría un mapa con la ubicación de los hospitales</small>
                    </div>
                </div>
            </div>
        `;
    }

    openCreateHospitalModal() {
        const modal = document.getElementById('createHospitalModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    closeCreateHospitalModal() {
        const modal = document.getElementById('createHospitalModal');
        if (modal) {
            modal.style.display = 'none';
            const form = document.getElementById('createHospitalForm');
            if (form) form.reset();
        }
    }

    async handleCrearHospital(e) {
        e.preventDefault();
        
        const hospitalData = {
            nombre: document.getElementById('hospitalNombre').value,
            direccion: document.getElementById('hospitalDireccion').value,
            tipo: document.getElementById('hospitalTipo').value,
            telefono: document.getElementById('hospitalTelefono').value || null,
            descripcion: document.getElementById('hospitalDescripcion').value || null
        };
        
        // Validaciones básicas
        if (!hospitalData.nombre) {
            showNotification('El nombre del hospital es requerido', 'error');
            return;
        }
        
        if (!hospitalData.direccion) {
            showNotification('La dirección es requerida', 'error');
            return;
        }
        
        if (!hospitalData.tipo) {
            showNotification('El tipo de hospital es requerido', 'error');
            return;
        }
        
        // Simular creación de hospital (en producción sería una petición real)
        showNotification('Hospital creado exitosamente', 'success');
        this.closeCreateHospitalModal();
        this.loadHospitalesSection();
    }

    async loadReportesSection() {
        const contentArea = document.getElementById('contentArea');
        contentArea.innerHTML = this.getReportesHTML();
    }

    getReportesHTML() {
        return `
            <div class="reportes-section">
                <div class="section-header">
                    <h2>Reportes y Estadísticas</h2>
                    <div class="report-actions">
                        <button class="btn btn-outline" onclick="adminDashboard.generarReporte('citas')">
                            <i class="fas fa-calendar"></i> Citas
                        </button>
                        <button class="btn btn-outline" onclick="adminDashboard.generarReporte('usuarios')">
                            <i class="fas fa-users"></i> Usuarios
                        </button>
                        <button class="btn btn-outline" onclick="adminDashboard.generarReporte('financiero')">
                            <i class="fas fa-chart-line"></i> Financiero
                        </button>
                        <button class="btn btn-primary" onclick="adminDashboard.exportarTodosReportes()">
                            <i class="fas fa-file-export"></i> Exportar Todo
                        </button>
                    </div>
                </div>
                
                <div class="reportes-grid">
                    <div class="reporte-card">
                        <div class="reporte-header">
                            <i class="fas fa-calendar-check"></i>
                            <h3>Citas Médicas</h3>
                        </div>
                        <div class="reporte-body">
                            <div class="estadistica">
                                <h4>Citas por Mes</h4>
                                <div class="chart-mini">
                                    <!-- Mini gráfico -->
                                    <div class="bar" style="height: 80%;" title="Enero: 120 citas"></div>
                                    <div class="bar" style="height: 60%;" title="Febrero: 90 citas"></div>
                                    <div class="bar" style="height: 95%;" title="Marzo: 142 citas"></div>
                                    <div class="bar" style="height: 70%;" title="Abril: 105 citas"></div>
                                </div>
                            </div>
                            <div class="estadistica">
                                <h4>Estado Actual</h4>
                                <div class="stats-list">
                                    <div class="stat-item">
                                        <span class="stat-label">Pendientes:</span>
                                        <span class="stat-value">45</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Confirmadas:</span>
                                        <span class="stat-value">120</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Canceladas:</span>
                                        <span class="stat-value">15</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="reporte-footer">
                            <button class="btn btn-outline btn-small" onclick="adminDashboard.verReporteDetallado('citas')">
                                Ver Detalles
                            </button>
                        </div>
                    </div>
                    
                    <div class="reporte-card">
                        <div class="reporte-header">
                            <i class="fas fa-user-md"></i>
                            <h3>Doctores</h3>
                        </div>
                        <div class="reporte-body">
                            <div class="estadistica">
                                <h4>Por Especialidad</h4>
                                <div class="pie-chart-mini">
                                    <!-- Mini gráfico circular -->
                                    <div class="slice" style="--percentage: 30%; background: #3498db;" title="Cardiología: 30%"></div>
                                    <div class="slice" style="--percentage: 25%; background: #2ecc71;" title="Pediatría: 25%"></div>
                                    <div class="slice" style="--percentage: 20%; background: #e74c3c;" title="Neurología: 20%"></div>
                                    <div class="slice" style="--percentage: 15%; background: #f39c12;" title="Dermatología: 15%"></div>
                                    <div class="slice" style="--percentage: 10%; background: #9b59b6;" title="Otros: 10%"></div>
                                </div>
                            </div>
                            <div class="estadistica">
                                <h4>Productividad</h4>
                                <div class="stats-list">
                                    <div class="stat-item">
                                        <span class="stat-label">Promedio citas/día:</span>
                                        <span class="stat-value">8.5</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Doctores activos:</span>
                                        <span class="stat-value">24/30</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="reporte-footer">
                            <button class="btn btn-outline btn-small" onclick="adminDashboard.verReporteDetallado('doctores')">
                                Ver Detalles
                            </button>
                        </div>
                    </div>
                    
                    <div class="reporte-card">
                        <div class="reporte-header">
                            <i class="fas fa-hospital"></i>
                            <h3>Hospitales</h3>
                        </div>
                        <div class="reporte-body">
                            <div class="estadistica">
                                <h4>Ocupación</h4>
                                <div class="ocupacion-bars">
                                    <div class="ocupacion-item">
                                        <span>Hospital Nacional</span>
                                        <div class="bar-container">
                                            <div class="bar" style="width: 85%;"></div>
                                        </div>
                                        <span>85%</span>
                                    </div>
                                    <div class="ocupacion-item">
                                        <span>Clínica San Pablo</span>
                                        <div class="bar-container">
                                            <div class="bar" style="width: 60%;"></div>
                                        </div>
                                        <span>60%</span>
                                    </div>
                                    <div class="ocupacion-item">
                                        <span>Hospital Goyeneche</span>
                                        <div class="bar-container">
                                            <div class="bar" style="width: 75%;"></div>
                                        </div>
                                        <span>75%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="reporte-footer">
                            <button class="btn btn-outline btn-small" onclick="adminDashboard.verReporteDetallado('hospitales')">
                                Ver Detalles
                            </button>
                        </div>
                    </div>
                    
                    <div class="reporte-card">
                        <div class="reporte-header">
                            <i class="fas fa-chart-line"></i>
                            <h3>Crecimiento</h3>
                        </div>
                        <div class="reporte-body">
                            <div class="estadistica">
                                <h4>Usuarios Nuevos</h4>
                                <div class="growth-chart">
                                    <div class="growth-item">
                                        <span>Ene</span>
                                        <div class="growth-bar" style="height: 40%;"></div>
                                        <span>40</span>
                                    </div>
                                    <div class="growth-item">
                                        <span>Feb</span>
                                        <div class="growth-bar" style="height: 60%;"></div>
                                        <span>60</span>
                                    </div>
                                    <div class="growth-item">
                                        <span>Mar</span>
                                        <div class="growth-bar" style="height: 85%;"></div>
                                        <span>85</span>
                                    </div>
                                    <div class="growth-item">
                                        <span>Abr</span>
                                        <div class="growth-bar" style="height: 70%;"></div>
                                        <span>70</span>
                                    </div>
                                    <div class="growth-item">
                                        <span>May</span>
                                        <div class="growth-bar" style="height: 95%;"></div>
                                        <span>95</span>
                                    </div>
                                </div>
                            </div>
                            <div class="estadistica">
                                <h4>Tasa de Crecimiento</h4>
                                <div class="tasa-crecimiento">
                                    <span class="tasa-positiva">+25%</span>
                                    <small>vs mes anterior</small>
                                </div>
                            </div>
                        </div>
                        <div class="reporte-footer">
                            <button class="btn btn-outline btn-small" onclick="adminDashboard.verReporteDetallado('crecimiento')">
                                Ver Detalles
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="reportes-avanzados">
                    <h3><i class="fas fa-chart-bar"></i> Reportes Avanzados</h3>
                    <div class="avanzados-grid">
                        <button class="avanzado-item" onclick="adminDashboard.generarReporteAvanzado('auditoria')">
                            <i class="fas fa-shield-alt"></i>
                            <span>Auditoría del Sistema</span>
                        </button>
                        <button class="avanzado-item" onclick="adminDashboard.generarReporteAvanzado('rendimiento')">
                            <i class="fas fa-tachometer-alt"></i>
                            <span>Rendimiento</span>
                        </button>
                        <button class="avanzado-item" onclick="adminDashboard.generarReporteAvanzado('satisfaccion')">
                            <i class="fas fa-smile"></i>
                            <span>Satisfacción</span>
                        </button>
                        <button class="avanzado-item" onclick="adminDashboard.generarReporteAvanzado('financiero')">
                            <i class="fas fa-money-bill-wave"></i>
                            <span>Financiero</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async loadConfiguracionSection() {
        const contentArea = document.getElementById('contentArea');
        contentArea.innerHTML = this.getConfiguracionHTML();
    }

    getConfiguracionHTML() {
        return `
            <div class="configuracion-section">
                <div class="configuracion-header">
                    <h2>Configuración del Sistema</h2>
                    <p>Ajusta los parámetros del sistema según tus necesidades</p>
                </div>
                
                <div class="configuracion-grid">
                    <div class="config-card">
                        <div class="config-icon">
                            <i class="fas fa-cogs"></i>
                        </div>
                        <h3>General</h3>
                        <p>Ajustes básicos del sistema</p>
                        <button class="btn btn-outline" onclick="adminDashboard.abrirConfigGeneral()">
                            Configurar
                        </button>
                    </div>
                    
                    <div class="config-card">
                        <div class="config-icon">
                            <i class="fas fa-shield-alt"></i>
                        </div>
                        <h3>Seguridad</h3>
                        <p>Configuración de seguridad y permisos</p>
                        <button class="btn btn-outline" onclick="adminDashboard.abrirConfigSeguridad()">
                            Configurar
                        </button>
                    </div>
                    
                    <div class="config-card">
                        <div class="config-icon">
                            <i class="fas fa-bell"></i>
                        </div>
                        <h3>Notificaciones</h3>
                        <p>Configuración de alertas y notificaciones</p>
                        <button class="btn btn-outline" onclick="adminDashboard.abrirConfigNotificaciones()">
                            Configurar
                        </button>
                    </div>
                    
                    <div class="config-card">
                        <div class="config-icon">
                            <i class="fas fa-database"></i>
                        </div>
                        <h3>Base de Datos</h3>
                        <p>Gestión y respaldo de datos</p>
                        <button class="btn btn-outline" onclick="adminDashboard.abrirConfigBaseDatos()">
                            Configurar
                        </button>
                    </div>
                    
                    <div class="config-card">
                        <div class="config-icon">
                            <i class="fas fa-envelope"></i>
                        </div>
                        <h3>Email</h3>
                        <p>Configuración del servidor de correo</p>
                        <button class="btn btn-outline" onclick="adminDashboard.abrirConfigEmail()">
                            Configurar
                        </button>
                    </div>
                    
                    <div class="config-card">
                        <div class="config-icon">
                            <i class="fas fa-file-export"></i>
                        </div>
                        <h3>Exportaciones</h3>
                        <p>Formatos y configuraciones de exportación</p>
                        <button class="btn btn-outline" onclick="adminDashboard.abrirConfigExportaciones()">
                            Configurar
                        </button>
                    </div>
                </div>
                
                <div class="configuracion-avanzada">
                    <h3><i class="fas fa-sliders-h"></i> Configuración Avanzada</h3>
                    <div class="avanzada-content">
                        <div class="config-item">
                            <div class="config-info">
                                <h4>Modo Mantenimiento</h4>
                                <p>Activa el modo mantenimiento para realizar actualizaciones</p>
                            </div>
                            <div class="config-action">
                                <label class="switch">
                                    <input type="checkbox" id="maintenanceMode">
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="config-item">
                            <div class="config-info">
                                <h4>Registro de Actividad</h4>
                                <p>Activa el registro detallado de actividad del sistema</p>
                            </div>
                            <div class="config-action">
                                <label class="switch">
                                    <input type="checkbox" id="activityLog" checked>
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="config-item">
                            <div class="config-info">
                                <h4>Backup Automático</h4>
                                <p>Configura backup automático de la base de datos</p>
                            </div>
                            <div class="config-action">
                                <select id="backupFrequency">
                                    <option value="daily">Diario</option>
                                    <option value="weekly" selected>Semanal</option>
                                    <option value="monthly">Mensual</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="config-item">
                            <div class="config-info">
                                <h4>Tiempo de Sesión</h4>
                                <p>Configura el tiempo máximo de inactividad antes de cerrar sesión</p>
                            </div>
                            <div class="config-action">
                                <select id="sessionTimeout">
                                    <option value="30">30 minutos</option>
                                    <option value="60" selected>1 hora</option>
                                    <option value="120">2 horas</option>
                                    <option value="240">4 horas</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="config-actions">
                        <button class="btn btn-primary" onclick="adminDashboard.guardarConfiguracion()">
                            <i class="fas fa-save"></i> Guardar Cambios
                        </button>
                        <button class="btn btn-outline" onclick="adminDashboard.restaurarConfiguracion()">
                            <i class="fas fa-undo"></i> Restaurar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Funciones de acción
    verDetallesUsuario(usuarioId) {
        showNotification(`Ver detalles usuario: ${usuarioId}`, 'info');
    }

    editarUsuario(usuarioId) {
        showNotification(`Editando usuario: ${usuarioId}`, 'info');
    }

    suspenderUsuario(usuarioId) {
        if (confirm('¿Está seguro de suspender este usuario?')) {
            showNotification('Usuario suspendido temporalmente', 'success');
        }
    }

    verDetallesDoctor(doctorId) {
        showNotification(`Ver detalles doctor: ${doctorId}`, 'info');
    }

    editarDoctor(doctorId) {
        showNotification(`Editando doctor: ${doctorId}`, 'info');
    }

    asignarTurno(doctorId) {
        showNotification(`Asignando turno a doctor: ${doctorId}`, 'info');
    }

    verDetallesHospital(hospitalId) {
        showNotification(`Ver detalles hospital: ${hospitalId}`, 'info');
    }

    editarHospital(hospitalId) {
        showNotification(`Editando hospital: ${hospitalId}`, 'info');
    }

    gestionarAreas(hospitalId) {
        showNotification(`Gestionando áreas del hospital: ${hospitalId}`, 'info');
    }

    exportUsuarios() {
        showNotification('Exportando lista de usuarios...', 'info');
    }

    filtrarUsuarios() {
        showNotification('Mostrando filtros de usuarios', 'info');
    }

    actualizarEspecialidades() {
        showNotification('Actualizando catálogo de especialidades', 'info');
    }

    generarReporte(tipo) {
        showNotification(`Generando reporte de ${tipo}...`, 'info');
    }

    verReporteDetallado(tipo) {
        showNotification(`Mostrando reporte detallado de ${tipo}`, 'info');
    }

    exportarTodosReportes() {
        showNotification('Exportando todos los reportes...', 'info');
    }

    generarReporteAvanzado(tipo) {
        showNotification(`Generando reporte avanzado: ${tipo}`, 'info');
    }

    abrirConfigGeneral() {
        showNotification('Abriendo configuración general', 'info');
    }

    abrirConfigSeguridad() {
        showNotification('Abriendo configuración de seguridad', 'info');
    }

    abrirConfigNotificaciones() {
        showNotification('Abriendo configuración de notificaciones', 'info');
    }

    abrirConfigBaseDatos() {
        showNotification('Abriendo configuración de base de datos', 'info');
    }

    abrirConfigEmail() {
        showNotification('Abriendo configuración de email', 'info');
    }

    abrirConfigExportaciones() {
        showNotification('Abriendo configuración de exportaciones', 'info');
    }

    guardarConfiguracion() {
        showNotification('Configuración guardada exitosamente', 'success');
    }

    restaurarConfiguracion() {
        if (confirm('¿Restaurar configuración por defecto?')) {
            showNotification('Configuración restaurada', 'success');
        }
    }

    openDetailsModal(title, content) {
        const modal = document.getElementById('detailsModal');
        if (modal) {
            document.getElementById('detailsModalTitle').textContent = title;
            document.getElementById('detailsContent').innerHTML = content;
            modal.style.display = 'flex';
        }
    }

    closeDetailsModal() {
        const modal = document.getElementById('detailsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    getEmptyStateHTML(title, description, buttonText, buttonClick) {
        const buttonHTML = buttonText ? `
            <button class="btn btn-primary" onclick="${buttonClick}">
                <i class="fas fa-user-plus"></i> ${buttonText}
            </button>
        ` : '';
        
        return `
            <div class="empty-state">
                <i class="fas fa-users"></i>
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
                <button class="btn btn-primary" onclick="adminDashboard.loadSection('dashboard')">
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

// Instancia global del dashboard de admin
let adminDashboard;

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.pathname.includes('admin.html')) {
            adminDashboard = new AdminDashboard();
            adminDashboard.loadSection('dashboard');
        }
    });
} else {
    if (window.location.pathname.includes('admin.html')) {
        adminDashboard = new AdminDashboard();
        adminDashboard.loadSection('dashboard');
    }
}