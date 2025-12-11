const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// ==================== CONFIGURACIÓN ====================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:4000', 'http://localhost:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// ==================== CONEXIÓN POSTGRESQL ====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(client => {
        console.log('✅ PostgreSQL conectado a Railway');
        client.release();
    })
    .catch(err => {
        console.error('❌ Error conectando a PostgreSQL:', err.message);
    });

// ==================== MIDDLEWARE ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token requerido' 
        });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'sisge_salud_secret_key_2024', (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                message: 'Token inválido o expirado' 
            });
        }
        req.user = user;
        next();
    });
}

// ==================== RUTAS DE AUTENTICACIÓN ====================

// 1. LOGIN
// 1. LOGIN - CORREGIDO
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email y contraseña requeridos' 
            });
        }
        
        const userQuery = await pool.query(
            `SELECT u.*, r.nombre as rol 
             FROM usuarios u 
             JOIN roles r ON u.id_rol = r.id_rol 
             WHERE u.email = $1`,
            [email.toLowerCase()]
        );
        
        if (userQuery.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        const user = userQuery.rows[0];
        
        // Comparar contraseña
        if (password !== user.password) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña incorrecta' 
            });
        }
        
        // Obtener datos según rol
        let userData = { 
            id: user.id_usuario, 
            email: user.email, 
            rol: user.rol,
            id_rol: user.id_rol
        };
        
        if (user.id_rol === 1) { // Paciente
            const pacienteQuery = await pool.query(
                `SELECT p.* 
                 FROM pacientes p 
                 WHERE p.id_usuario = $1`,
                [user.id_usuario]
            );
            
            if (pacienteQuery.rows.length > 0) {
                userData.paciente = pacienteQuery.rows[0];
                userData.nombre = `${pacienteQuery.rows[0].nombres} ${pacienteQuery.rows[0].apellidos}`;
            }
        } 
        else if (user.id_rol === 2) { // Doctor
            const doctorQuery = await pool.query(
                `SELECT d.*, e.nombre as especialidad 
                 FROM doctores d 
                 LEFT JOIN especialidades e ON d.id_especialidad = e.id_especialidad 
                 WHERE d.id_usuario = $1`,
                [user.id_usuario]
            );
            
            if (doctorQuery.rows.length > 0) {
                userData.doctor = doctorQuery.rows[0];
                userData.nombre = `${doctorQuery.rows[0].nombres} ${doctorQuery.rows[0].apellidos}`;
            }
        } 
        else if (user.id_rol === 3) { // Admin
            userData.nombre = 'Administrador';
        }
        
        // Generar token JWT
        const token = jwt.sign(
            userData,
            process.env.JWT_SECRET || 'sisge_salud_secret_key_2024',
            { expiresIn: '8h' }
        );
        
        res.json({
            success: true,
            token,
            user: userData
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor' 
        });
    }
});

// 2. REGISTRO DE PACIENTE
// 2. REGISTRO DE PACIENTE - CORREGIDO
app.post('/api/registro', async (req, res) => {
    try {
        const { dni, nombres, apellidos, fecha_nacimiento, sexo, email, password } = req.body;

        console.log('📝 Registro de paciente:', { dni, email });

        // Validaciones básicas
        if (!dni || !nombres || !apellidos || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos los campos obligatorios son requeridos' 
            });
        }

        if (dni.length !== 8 || !/^\d+$/.test(dni)) {
            return res.status(400).json({ 
                success: false, 
                message: 'El DNI debe tener 8 dígitos numéricos' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Verificar si el email ya existe
            const emailExistente = await client.query(
                'SELECT id_usuario FROM usuarios WHERE email = $1',
                [email]
            );

            if (emailExistente.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: 'El email ya está registrado' 
                });
            }

            // 2. Verificar si el DNI ya existe
            const dniExistente = await client.query(
                'SELECT id_paciente FROM pacientes WHERE dni = $1',
                [dni]
            );

            if (dniExistente.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: 'El DNI ya está registrado' 
                });
            }

            // 3. Crear usuario (rol 1 = Paciente) - SIN nombre
            const usuarioResult = await client.query(
                `INSERT INTO usuarios (id_rol, email, password) 
                 VALUES (1, $1, $2) 
                 RETURNING id_usuario, email`,
                [email, password]
            );

            const usuario = usuarioResult.rows[0];
            console.log('✅ Usuario creado:', usuario.id_usuario);

            // 4. Crear paciente
            const pacienteResult = await client.query(
                `INSERT INTO pacientes (
                    id_usuario, 
                    dni,
                    nombres,
                    apellidos,
                    fecha_nacimiento, 
                    sexo
                ) VALUES ($1, $2, $3, $4, $5, $6) 
                 RETURNING id_paciente, nombres, apellidos`,
                [
                    usuario.id_usuario, 
                    dni,
                    nombres,
                    apellidos,
                    fecha_nacimiento || null,
                    sexo || null
                ]
            );

            const paciente = pacienteResult.rows[0];
            console.log('✅ Paciente creado:', paciente.id_paciente);

            // 5. Generar token JWT
            const userData = {
                id: usuario.id_usuario,
                email: usuario.email,
                rol: 'Paciente',
                id_rol: 1,
                nombre: `${paciente.nombres} ${paciente.apellidos}`,
                paciente: {
                    id_paciente: paciente.id_paciente,
                    dni,
                    nombres,
                    apellidos
                }
            };

            const token = jwt.sign(
                userData,
                process.env.JWT_SECRET || 'sisge_salud_secret_key_2024',
                { expiresIn: '24h' }
            );

            await client.query('COMMIT');

            res.status(201).json({ 
                success: true, 
                message: '¡Registro exitoso!',
                user: userData,
                token: token
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error en transacción:', error);
            
            if (error.code === '23505') { // Error de duplicado único
                return res.status(400).json({ 
                    success: false, 
                    message: 'El email o DNI ya están registrados' 
                });
            }
            
            res.status(500).json({ 
                success: false, 
                message: 'Error en la base de datos: ' + error.message
            });
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ Error registrando paciente:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 3. VERIFICAR TOKEN
app.get('/api/verify-token', authenticateToken, (req, res) => {
    res.json({ 
        success: true, 
        user: req.user,
        message: 'Token válido' 
    });
});

// ==================== RUTAS DE PERFIL ====================

// 4. OBTENER PERFIL
app.get('/api/perfil', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const rol = req.user.rol;
        
        let perfilData = { ...req.user };
        
        if (rol === 'Paciente') {
            const pacienteQuery = await pool.query(
                `SELECT p.* 
                 FROM pacientes p 
                 WHERE p.id_usuario = $1`,
                [userId]
            );
            
            if (pacienteQuery.rows.length > 0) {
                perfilData.detalles = pacienteQuery.rows[0];
            }
        } 
        else if (rol === 'Doctor') {
            const doctorQuery = await pool.query(
                `SELECT d.*, e.nombre as especialidad
                 FROM doctores d 
                 LEFT JOIN especialidades e ON d.id_especialidad = e.id_especialidad 
                 WHERE d.id_usuario = $1`,
                [userId]
            );
            
            if (doctorQuery.rows.length > 0) {
                perfilData.detalles = doctorQuery.rows[0];
            }
        }
        
        res.json({ success: true, perfil: perfilData });
        
    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 5. ACTUALIZAR PERFIL
app.put('/api/perfil', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { nombres, apellidos, fecha_nacimiento, sexo, telefono } = req.body;
        
        if (!nombres || !apellidos) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nombre y apellido son requeridos' 
            });
        }
        
        let query;
        let params;
        
        if (req.user.rol === 'Paciente') {
            query = `
                UPDATE pacientes 
                SET nombres = $1, apellidos = $2, 
                    fecha_nacimiento = $3, sexo = $4, telefono = $5
                WHERE id_usuario = $6
                RETURNING *`;
            params = [nombres, apellidos, fecha_nacimiento, sexo, telefono, userId];
        } 
        else if (req.user.rol === 'Doctor') {
            query = `
                UPDATE doctores 
                SET nombres = $1, apellidos = $2, telefono = $3
                WHERE id_usuario = $4
                RETURNING *`;
            params = [nombres, apellidos, telefono, userId];
        }
        else {
            return res.status(403).json({ 
                success: false, 
                message: 'No se puede actualizar perfil de administrador' 
            });
        }
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Perfil actualizado exitosamente',
            perfil: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        res.status(500).json({ success: false, message: 'Error actualizando perfil' });
    }
});

// ==================== RUTAS DE CITAS ====================

// 6. PACIENTE - MIS CITAS
app.get('/api/citas/paciente', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const pacienteQuery = await pool.query(
            'SELECT id_paciente FROM pacientes WHERE id_usuario = $1',
            [userId]
        );
        
        if (pacienteQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Paciente no encontrado' });
        }
        
        const pacienteId = pacienteQuery.rows[0].id_paciente;
        
        const citasQuery = await pool.query(
            `SELECT c.*, 
                    d.nombres || ' ' || d.apellidos as doctor_nombre,
                    e.nombre as especialidad,
                    h.nombre as hospital_nombre
             FROM citas c
             LEFT JOIN doctores d ON c.id_doctor = d.id_doctor
             LEFT JOIN especialidades e ON d.id_especialidad = e.id_especialidad
             LEFT JOIN hospitales h ON c.id_hospital = h.id_hospital
             WHERE c.id_paciente = $1
             ORDER BY c.fecha_hora DESC
             LIMIT 20`,
            [pacienteId]
        );
        
        res.json({ success: true, citas: citasQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo citas:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 7. PACIENTE - AGENDAR CITA
app.post('/api/citas', authenticateToken, async (req, res) => {
    try {
        const { id_doctor, id_hospital, fecha_hora, motivo } = req.body;
        const userId = req.user.id;
        
        if (!id_doctor || !fecha_hora) {
            return res.status(400).json({ 
                success: false, 
                message: 'Doctor y fecha/hora requeridos' 
            });
        }
        
        const pacienteQuery = await pool.query(
            'SELECT id_paciente FROM pacientes WHERE id_usuario = $1',
            [userId]
        );
        
        if (pacienteQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Paciente no encontrado' });
        }
        
        const pacienteId = pacienteQuery.rows[0].id_paciente;
        
        // Verificar disponibilidad
        const disponibilidadQuery = await pool.query(
            `SELECT id_cita FROM citas 
             WHERE id_doctor = $1 
             AND fecha_hora = $2 
             AND estado NOT IN ('Cancelada', 'Completada')`,
            [id_doctor, fecha_hora]
        );
        
        if (disponibilidadQuery.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'El doctor no está disponible en ese horario' 
            });
        }
        
        // Crear cita
        const nuevaCita = await pool.query(
            `INSERT INTO citas (id_paciente, id_doctor, id_hospital, fecha_hora, estado) 
             VALUES ($1, $2, $3, $4, 'Pendiente') 
             RETURNING *`,
            [pacienteId, id_doctor, id_hospital || null, fecha_hora]
        );
        
        res.status(201).json({ 
            success: true, 
            message: 'Cita agendada exitosamente',
            cita: nuevaCita.rows[0]
        });
        
    } catch (error) {
        console.error('Error agendando cita:', error);
        res.status(500).json({ success: false, message: 'Error agendando cita' });
    }
});

// 8. PACIENTE - CANCELAR CITA
app.put('/api/citas/:id/cancelar', authenticateToken, async (req, res) => {
    try {
        const citaId = req.params.id;
        const userId = req.user.id;
        
        // Verificar que la cita pertenece al paciente
        const verificarQuery = await pool.query(
            `SELECT c.* FROM citas c
             JOIN pacientes p ON c.id_paciente = p.id_paciente
             WHERE c.id_cita = $1 AND p.id_usuario = $2`,
            [citaId, userId]
        );
        
        if (verificarQuery.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cita no encontrada o no autorizado' 
            });
        }
        
        // Actualizar estado
        await pool.query(
            `UPDATE citas SET estado = 'Cancelada' WHERE id_cita = $1`,
            [citaId]
        );
        
        res.json({ 
            success: true, 
            message: 'Cita cancelada exitosamente' 
        });
        
    } catch (error) {
        console.error('Error cancelando cita:', error);
        res.status(500).json({ success: false, message: 'Error cancelando cita' });
    }
});

// 9. DOCTOR - CITAS DEL DÍA
app.get('/api/doctor/citas/hoy', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Obtener ID del doctor
        const doctorQuery = await pool.query(
            'SELECT id_doctor FROM doctores WHERE id_usuario = $1',
            [userId]
        );
        
        if (doctorQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor no encontrado' });
        }
        
        const doctorId = doctorQuery.rows[0].id_doctor;
        
        const citasQuery = await pool.query(
            `SELECT c.*, 
                    p.nombres || ' ' || p.apellidos as paciente_nombre,
                    p.dni as paciente_dni,
                    h.nombre as hospital_nombre
             FROM citas c
             JOIN pacientes p ON c.id_paciente = p.id_paciente
             LEFT JOIN hospitales h ON c.id_hospital = h.id_hospital
             WHERE c.id_doctor = $1 
             AND DATE(c.fecha_hora) = CURRENT_DATE
             AND c.estado NOT IN ('Cancelada', 'Completada')
             ORDER BY c.fecha_hora ASC`,
            [doctorId]
        );
        
        res.json({ success: true, citas: citasQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo citas del día:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 10. OBTENER CITA ESPECÍFICA
app.get('/api/citas/:id', authenticateToken, async (req, res) => {
    try {
        const citaId = req.params.id;
        
        const result = await pool.query(
            `SELECT c.*, 
                    p.nombres || ' ' || p.apellidos as paciente_nombre,
                    d.nombres || ' ' || d.apellidos as doctor_nombre,
                    h.nombre as hospital_nombre
             FROM citas c
             JOIN pacientes p ON c.id_paciente = p.id_paciente
             JOIN doctores d ON c.id_doctor = d.id_doctor
             LEFT JOIN hospitales h ON c.id_hospital = h.id_hospital
             WHERE c.id_cita = $1`,
            [citaId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cita no encontrada' 
            });
        }
        
        res.json({ success: true, cita: result.rows[0] });
        
    } catch (error) {
        console.error('Error obteniendo cita:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ==================== RUTAS DOCTOR ====================

// 11. DOCTOR - AGENDA COMPLETA
app.get('/api/doctor/agenda', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Obtener ID del doctor
        const doctorQuery = await pool.query(
            'SELECT id_doctor FROM doctores WHERE id_usuario = $1',
            [userId]
        );
        
        if (doctorQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor no encontrado' });
        }
        
        const doctorId = doctorQuery.rows[0].id_doctor;
        
        const agendaQuery = await pool.query(
            `SELECT c.*, 
                    p.nombres || ' ' || p.apellidos as paciente_nombre,
                    p.dni as paciente_dni,
                    h.nombre as hospital_nombre,
                    e.nombre as especialidad
             FROM citas c
             JOIN pacientes p ON c.id_paciente = p.id_paciente
             JOIN doctores d ON c.id_doctor = d.id_doctor
             LEFT JOIN especialidades e ON d.id_especialidad = e.id_especialidad
             LEFT JOIN hospitales h ON c.id_hospital = h.id_hospital
             WHERE c.id_doctor = $1 
             AND DATE(c.fecha_hora) = CURRENT_DATE
             ORDER BY c.fecha_hora ASC`,
            [doctorId]
        );
        
        res.json({ 
            success: true, 
            agenda: agendaQuery.rows,
            total: agendaQuery.rows.length,
            pendientes: agendaQuery.rows.filter(c => c.estado === 'Pendiente').length
        });
        
    } catch (error) {
        console.error('Error obteniendo agenda:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 12. DOCTOR - ATENDER PACIENTE// ENDPOINT CORREGIDO - SIN OBSERVACIONES
app.post('/api/doctor/atender', authenticateToken, async (req, res) => {
    try {
        const { id_cita, tipo_atencion, diagnostico, observaciones } = req.body;
        const userId = req.user.id;
        
        console.log('📝 Recibiendo atención:', { id_cita, tipo_atencion, userId });
        
        if (!id_cita || !diagnostico) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cita y diagnóstico requeridos' 
            });
        }
        
        // 1. Obtener ID del doctor
        const doctorQuery = await pool.query(
            'SELECT id_doctor FROM doctores WHERE id_usuario = $1',
            [userId]
        );
        
        if (doctorQuery.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Doctor no encontrado' 
            });
        }
        
        const doctorId = doctorQuery.rows[0].id_doctor;
        
        // 2. Verificar que la cita es del doctor
        const citaQuery = await pool.query(
            `SELECT c.*, p.nombres || ' ' || p.apellidos as paciente_nombre, 
                    p.id_paciente
             FROM citas c
             JOIN pacientes p ON c.id_paciente = p.id_paciente
             WHERE c.id_cita = $1 AND c.id_doctor = $2`,
            [id_cita, doctorId]
        );
        
        if (citaQuery.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'No autorizado para atender esta cita' 
            });
        }
        
        const pacienteId = citaQuery.rows[0].id_paciente;
        const pacienteNombre = citaQuery.rows[0].paciente_nombre;
        
        // 3. Iniciar transacción
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 3.1 Actualizar estado de la cita
            await client.query(
                'UPDATE citas SET estado = $1 WHERE id_cita = $2',
                ['Completada', id_cita]
            );
            
            console.log('✅ Cita actualizada a Completada');
            
            // 3.2 Crear atención (SIN OBSERVACIONES)
            const atencionResult = await client.query(
                `INSERT INTO atenciones (id_cita, tipo_atencion) 
                 VALUES ($1, $2) 
                 RETURNING id_atencion`,
                [id_cita, tipo_atencion || 'Consulta General']
            );
            
            const atencionId = atencionResult.rows[0].id_atencion;
            console.log('✅ Atención creada:', atencionId);
            
            // 3.3 Crear diagnóstico
            await client.query(
                `INSERT INTO diagnosticos (id_atencion, descripcion) 
                 VALUES ($1, $2)`,
                [atencionId, diagnostico]
            );
            
            console.log('✅ Diagnóstico creado');
            
            await client.query('COMMIT');
            
            res.status(201).json({ 
                success: true, 
                message: 'Atención registrada exitosamente',
                id_atencion: atencionId,
                paciente_nombre: pacienteNombre
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error en transacción:', error);
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('❌ Error registrando atención:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error registrando atención',
            error: error.message 
        });
    }
});
// ==================== RUTAS DE RECETAS ====================

// 13. RECETAS DEL PACIENTE
app.get('/api/recetas/paciente', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Obtener ID del paciente
        const pacienteQuery = await pool.query(
            'SELECT id_paciente FROM pacientes WHERE id_usuario = $1',
            [userId]
        );
        
        if (pacienteQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Paciente no encontrado' });
        }
        
        const pacienteId = pacienteQuery.rows[0].id_paciente;
        
        const recetasQuery = await pool.query(
            `SELECT r.*, 
                    a.tipo_atencion,
                    c.fecha_hora,
                    d.nombres || ' ' || d.apellidos as doctor_nombre,
                    e.nombre as especialidad
             FROM recetas r
             JOIN atenciones a ON r.id_atencion = a.id_atencion
             JOIN citas c ON a.id_cita = c.id_cita
             JOIN doctores d ON c.id_doctor = d.id_doctor
             LEFT JOIN especialidades e ON d.id_especialidad = e.id_especialidad
             WHERE c.id_paciente = $1
             ORDER BY r.fecha DESC
             LIMIT 20`,
            [pacienteId]
        );
        
        res.json({ success: true, recetas: recetasQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo recetas:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 14. DOCTOR - CREAR RECETA
app.post('/api/doctor/recetas', authenticateToken, async (req, res) => {
    try {
        const { id_atencion, medicamentos } = req.body;
        const userId = req.user.id;
        
        if (!id_atencion || !medicamentos || !Array.isArray(medicamentos)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Atención y medicamentos requeridos' 
            });
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 1. Crear receta
            const recetaResult = await client.query(
                `INSERT INTO recetas (id_atencion) 
                 VALUES ($1) 
                 RETURNING id_receta`,
                [id_atencion]
            );
            
            const recetaId = recetaResult.rows[0].id_receta;
            
            // 2. Agregar detalles de medicamentos
            for (const medicamento of medicamentos) {
                if (medicamento.id_medicamento && medicamento.indicaciones) {
                    await client.query(
                        `INSERT INTO receta_detalles (id_receta, id_medicamento, indicaciones) 
                         VALUES ($1, $2, $3)`,
                        [recetaId, medicamento.id_medicamento, medicamento.indicaciones]
                    );
                }
            }
            
            await client.query('COMMIT');
            
            res.status(201).json({ 
                success: true, 
                message: 'Receta creada exitosamente',
                id_receta: recetaId
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Error creando receta:', error);
        res.status(500).json({ success: false, message: 'Error creando receta' });
    }
});

// ==================== RUTAS DE CATÁLOGOS ====================

// 15. OBTENER DOCTORES (para selectores)
app.get('/api/doctores', async (req, res) => {
    try {
        const doctoresQuery = await pool.query(
            `SELECT d.*, e.nombre as especialidad 
             FROM doctores d
             LEFT JOIN especialidades e ON d.id_especialidad = e.id_especialidad
             ORDER BY d.nombres, d.apellidos`
        );
        
        res.json({ success: true, doctores: doctoresQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo doctores:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 16. OBTENER HOSPITALES
app.get('/api/hospitales', async (req, res) => {
    try {
        const hospitalesQuery = await pool.query(
            `SELECT h.*, 
                    (SELECT COUNT(*) FROM areas a WHERE a.id_hospital = h.id_hospital) as total_areas
             FROM hospitales h
             ORDER BY h.nombre`
        );
        
        res.json({ success: true, hospitales: hospitalesQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo hospitales:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 17. OBTENER MEDICAMENTOS
app.get('/api/medicamentos', async (req, res) => {
    try {
        const medicamentosQuery = await pool.query(
            'SELECT * FROM medicamentos ORDER BY nombre'
        );
        
        res.json({ success: true, medicamentos: medicamentosQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo medicamentos:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 18. OBTENER ESPECIALIDADES
app.get('/api/especialidades', async (req, res) => {
    try {
        const especialidadesQuery = await pool.query(
            'SELECT * FROM especialidades ORDER BY nombre'
        );
        
        res.json({ success: true, especialidades: especialidadesQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo especialidades:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ==================== RUTAS ADMIN ====================

// 19. ADMIN - LISTAR USUARIOS
app.get('/api/admin/usuarios', authenticateToken, async (req, res) => {
    try {
        // Verificar que es admin
        if (req.user.rol !== 'Administrador') {
            return res.status(403).json({ 
                success: false, 
                message: 'Acceso no autorizado' 
            });
        }
        
        const usuariosQuery = await pool.query(
            `SELECT u.*, r.nombre as rol_nombre,
                    CASE 
                        WHEN r.nombre = 'Paciente' THEN (
                            SELECT p.nombres || ' ' || p.apellidos 
                            FROM pacientes p 
                            WHERE p.id_usuario = u.id_usuario
                        )
                        WHEN r.nombre = 'Doctor' THEN (
                            SELECT d.nombres || ' ' || d.apellidos 
                            FROM doctores d 
                            WHERE d.id_usuario = u.id_usuario
                        )
                        ELSE 'Administrador'
                    END as nombre_completo
             FROM usuarios u
             JOIN roles r ON u.id_rol = r.id_rol
             ORDER BY u.creado_en DESC
             LIMIT 50`
        );
        
        res.json({ success: true, usuarios: usuariosQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 20. ADMIN - CREAR DOCTOR
// 20. ADMIN - CREAR DOCTOR - CORREGIDO
app.post('/api/admin/doctores', authenticateToken, async (req, res) => {
    try {
        // Verificar que es admin
        if (req.user.rol !== 'Administrador') {
            return res.status(403).json({ 
                success: false, 
                message: 'Acceso no autorizado' 
            });
        }
        
        const { dni, nombres, apellidos, id_especialidad, email, password } = req.body;
        
        if (!dni || !nombres || !apellidos || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos los campos son requeridos' 
            });
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 1. Verificar si email ya existe
            const emailCheck = await client.query(
                'SELECT id_usuario FROM usuarios WHERE email = $1',
                [email.toLowerCase()]
            );
            
            if (emailCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: 'El email ya está registrado' 
                });
            }
            
            // 2. Verificar si DNI ya existe en doctores
            const dniCheck = await client.query(
                'SELECT id_doctor FROM doctores WHERE dni = $1',
                [dni]
            );
            
            if (dniCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: 'El DNI ya está registrado' 
                });
            }
            
            // 3. Crear usuario (rol 2 = Doctor) - SIN nombre
            const userResult = await client.query(
                `INSERT INTO usuarios (id_rol, email, password) 
                 VALUES (2, $1, $2) 
                 RETURNING id_usuario`,
                [email.toLowerCase(), password]
            );
            
            const userId = userResult.rows[0].id_usuario;
            
            // 4. Crear doctor
            await client.query(
                `INSERT INTO doctores (id_usuario, dni, nombres, apellidos, id_especialidad) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, dni, nombres, apellidos, id_especialidad || null]
            );
            
            await client.query('COMMIT');
            
            res.status(201).json({ 
                success: true, 
                message: 'Doctor creado exitosamente'
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Error creando doctor:', error);
        res.status(500).json({ success: false, message: 'Error creando doctor' });
    }
});

// 21. ADMIN - ESTADÍSTICAS
app.get('/api/admin/estadisticas', authenticateToken, async (req, res) => {
    try {
        // Verificar que es admin
        if (req.user.rol !== 'Administrador') {
            return res.status(403).json({ 
                success: false, 
                message: 'Acceso no autorizado' 
            });
        }
        
        // Obtener estadísticas
        const estadisticas = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios) as total_usuarios,
                (SELECT COUNT(*) FROM pacientes) as total_pacientes,
                (SELECT COUNT(*) FROM doctores) as total_doctores,
                (SELECT COUNT(*) FROM citas WHERE estado = 'Pendiente') as citas_pendientes,
                (SELECT COUNT(*) FROM citas WHERE estado = 'Completada' AND DATE(fecha_hora) = CURRENT_DATE) as citas_hoy,
                (SELECT COUNT(*) FROM hospitales) as total_hospitales,
                (SELECT COUNT(*) FROM recetas WHERE DATE(fecha) = CURRENT_DATE) as recetas_hoy
        `);
        
        // Obtener últimos usuarios registrados
        const ultimosUsuarios = await pool.query(`
            SELECT u.*, r.nombre as rol 
            FROM usuarios u
            JOIN roles r ON u.id_rol = r.id_rol
            ORDER BY u.creado_en DESC
            LIMIT 5
        `);
        
        // Obtener citas recientes
        const citasRecientes = await pool.query(`
            SELECT c.*, 
                   p.nombres || ' ' || p.apellidos as paciente_nombre,
                   d.nombres || ' ' || d.apellidos as doctor_nombre
            FROM citas c
            JOIN pacientes p ON c.id_paciente = p.id_paciente
            JOIN doctores d ON c.id_doctor = d.id_doctor
            ORDER BY c.fecha_hora DESC
            LIMIT 10
        `);
        
        res.json({ 
            success: true, 
            estadisticas: estadisticas.rows[0],
            ultimosUsuarios: ultimosUsuarios.rows,
            citasRecientes: citasRecientes.rows
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 22. ADMIN - BUSCAR PACIENTES
app.get('/api/doctor/pacientes', authenticateToken, async (req, res) => {
    try {
        // Verificar que es doctor
        if (req.user.rol !== 'Doctor') {
            return res.status(403).json({ 
                success: false, 
                message: 'Acceso no autorizado' 
            });
        }
        
        const { search } = req.query;
        let query;
        let params;
        
        if (search) {
            query = `
                SELECT p.*, 
                       u.email,
                       (SELECT COUNT(*) FROM citas c WHERE c.id_paciente = p.id_paciente) as total_citas
                FROM pacientes p
                JOIN usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.dni ILIKE $1 OR p.nombres ILIKE $1 OR p.apellidos ILIKE $1
                ORDER BY p.nombres, p.apellidos
                LIMIT 20`;
            params = [`%${search}%`];
        } else {
            query = `
                SELECT p.*, 
                       u.email,
                       (SELECT COUNT(*) FROM citas c WHERE c.id_paciente = p.id_paciente) as total_citas
                FROM pacientes p
                JOIN usuarios u ON p.id_usuario = u.id_usuario
                ORDER BY p.nombres, p.apellidos
                LIMIT 20`;
            params = [];
        }
        
        const result = await pool.query(query, params);
        
        res.json({ success: true, pacientes: result.rows });
        
    } catch (error) {
        console.error('Error buscando pacientes:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ==================== RUTAS ADICIONALES ====================

// 23. EXAMENES DEL PACIENTE
app.get('/api/examenes/paciente', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Obtener ID del paciente
        const pacienteQuery = await pool.query(
            'SELECT id_paciente FROM pacientes WHERE id_usuario = $1',
            [userId]
        );
        
        if (pacienteQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Paciente no encontrado' });
        }
        
        const pacienteId = pacienteQuery.rows[0].id_paciente;
        
        const examenesQuery = await pool.query(
            `SELECT e.*, 
                    (SELECT resultado FROM examenes_resultados er 
                     WHERE er.id_examen = e.id_examen 
                     ORDER BY er.fecha DESC LIMIT 1) as ultimo_resultado
             FROM examenes e
             WHERE e.id_paciente = $1
             ORDER BY CASE 
               WHEN e.estado = 'Pendiente' THEN 1
               WHEN e.estado = 'En Proceso' THEN 2
               ELSE 3
             END, e.id_examen DESC
             LIMIT 20`,
            [pacienteId]
        );
        
        res.json({ success: true, examenes: examenesQuery.rows });
        
    } catch (error) {
        console.error('Error obteniendo exámenes:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// 24. DOCTOR - CREAR ORDEN DE EXAMEN
app.post('/api/doctor/examenes', authenticateToken, async (req, res) => {
    try {
        const { id_paciente, tipo_examen, observaciones } = req.body;
        const userId = req.user.id;
        
        if (!id_paciente || !tipo_examen) {
            return res.status(400).json({ 
                success: false, 
                message: 'Paciente y tipo de examen requeridos' 
            });
        }
        
        // Verificar que el doctor puede crear exámenes
        const doctorQuery = await pool.query(
            'SELECT id_doctor FROM doctores WHERE id_usuario = $1',
            [userId]
        );
        
        if (doctorQuery.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'Doctor no encontrado' 
            });
        }
        
        // Crear examen
        const examenResult = await pool.query(
            `INSERT INTO examenes (id_paciente, tipo_examen, estado) 
             VALUES ($1, $2, 'Pendiente') 
             RETURNING *`,
            [id_paciente, tipo_examen]
        );
        
        // Si hay observaciones, crear primer resultado
        if (observaciones) {
            await pool.query(
                `INSERT INTO examenes_resultados (id_examen, resultado) 
                 VALUES ($1, $2)`,
                [examenResult.rows[0].id_examen, `Orden creada por doctor: ${observaciones}`]
            );
        }
        
        res.status(201).json({ 
            success: true, 
            message: 'Orden de examen creada',
            examen: examenResult.rows[0]
        });
        
    } catch (error) {
        console.error('Error creando examen:', error);
        res.status(500).json({ success: false, message: 'Error creando examen' });
    }
});

// 25. CAMBIAR CONTRASEÑA
app.put('/api/cambiar-password', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Contraseña actual y nueva contraseña requeridas' 
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La nueva contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        // Verificar contraseña actual
        const userQuery = await pool.query(
            'SELECT password FROM usuarios WHERE id_usuario = $1',
            [userId]
        );
        
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        const user = userQuery.rows[0];
        
        if (currentPassword !== user.password) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña actual incorrecta' 
            });
        }
        
        // Actualizar contraseña
        await pool.query(
            'UPDATE usuarios SET password = $1 WHERE id_usuario = $2',
            [newPassword, userId]
        );
        
        res.json({ 
            success: true, 
            message: 'Contraseña cambiada exitosamente' 
        });
        
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({ success: false, message: 'Error cambiando contraseña' });
    }
});

// ==================== RUTA DE PRUEBA ====================
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        message: 'API funcionando correctamente',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ==================== MANEJO DE ERRORES ====================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Ruta no encontrada'
    });
});

app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
});