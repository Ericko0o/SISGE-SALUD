const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const router = express.Router();

// Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token requerido' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-123', (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Token inválido' });
    req.user = user;
    next();
  });
};

// ==================== RUTAS DE AUTENTICACIÓN ====================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    // Buscar usuario
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
    
    // Obtener datos específicos según rol
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
      process.env.JWT_SECRET || 'fallback-secret-123',
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

router.post('/registro', async (req, res) => {
  try {
    const { dni, nombres, apellidos, fecha_nacimiento, sexo, email, password } = req.body;
    
    // Validar datos requeridos
    if (!dni || !nombres || !apellidos || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos son requeridos' 
      });
    }
    
    // Verificar si email ya existe
    const emailCheck = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El email ya está registrado' 
      });
    }
    
    // Verificar si DNI ya existe en pacientes
    const dniCheck = await pool.query(
      'SELECT id_paciente FROM pacientes WHERE dni = $1',
      [dni]
    );
    
    if (dniCheck.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El DNI ya está registrado' 
      });
    }
    
    // Iniciar transacción
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Crear usuario (rol 1 = Paciente)
      const userResult = await client.query(
        `INSERT INTO usuarios (email, password, id_rol) 
         VALUES ($1, $2, 1) 
         RETURNING id_usuario`,
        [email.toLowerCase(), password]
      );
      
      const userId = userResult.rows[0].id_usuario;
      
      // 2. Crear paciente
      await client.query(
        `INSERT INTO pacientes (id_usuario, dni, nombres, apellidos, fecha_nacimiento, sexo) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, dni, nombres, apellidos, fecha_nacimiento || null, sexo || null]
      );
      
      await client.query('COMMIT');
      
      // Generar token automático
      const userData = {
        id: userId,
        email: email,
        rol: 'Paciente',
        id_rol: 1,
        nombre: `${nombres} ${apellidos}`
      };
      
      const token = jwt.sign(
        userData,
        process.env.JWT_SECRET || 'fallback-secret-123',
        { expiresIn: '8h' }
      );
      
      res.status(201).json({
        success: true,
        message: 'Registro exitoso',
        token,
        user: userData
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el registro' 
    });
  }
});

router.get('/verify-token', authenticateToken, (req, res) => {
  res.json({ 
    success: true, 
    user: req.user,
    message: 'Token válido' 
  });
});

// ==================== RUTAS DE PACIENTE ====================
router.get('/perfil', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const rol = req.user.rol;
    
    let perfilData = { ...req.user };
    
    if (rol === 'Paciente') {
      const pacienteQuery = await pool.query(
        `SELECT p.*, 
                (SELECT COUNT(*) FROM citas c WHERE c.id_paciente = p.id_paciente) as total_citas,
                (SELECT COUNT(*) FROM citas c WHERE c.id_paciente = p.id_paciente AND c.estado = 'Pendiente') as citas_pendientes
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
        `SELECT d.*, e.nombre as especialidad,
                (SELECT COUNT(*) FROM citas c WHERE c.id_doctor = d.id_doctor AND c.fecha_hora::date = CURRENT_DATE) as citas_hoy,
                (SELECT COUNT(*) FROM citas c WHERE c.id_doctor = d.id_doctor AND c.estado = 'Pendiente') as citas_pendientes
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

router.get('/citas/paciente', authenticateToken, async (req, res) => {
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
       LIMIT 50`,
      [pacienteId]
    );
    
    res.json({ success: true, citas: citasQuery.rows });
    
  } catch (error) {
    console.error('Error obteniendo citas:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

router.post('/citas', authenticateToken, async (req, res) => {
  try {
    const { id_doctor, id_hospital, fecha_hora, motivo } = req.body;
    const userId = req.user.id;
    
    if (!id_doctor || !fecha_hora) {
      return res.status(400).json({ 
        success: false, 
        message: 'Doctor y fecha/hora requeridos' 
      });
    }
    
    // Obtener ID del paciente
    const pacienteQuery = await pool.query(
      'SELECT id_paciente FROM pacientes WHERE id_usuario = $1',
      [userId]
    );
    
    if (pacienteQuery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Paciente no encontrado' });
    }
    
    const pacienteId = pacienteQuery.rows[0].id_paciente;
    
    // Verificar disponibilidad del doctor en esa fecha
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

router.put('/citas/:id/cancelar', authenticateToken, async (req, res) => {
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

router.get('/recetas/paciente', authenticateToken, async (req, res) => {
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
    
    // Obtener detalles de cada receta
    const recetasConDetalles = [];
    
    for (const receta of recetasQuery.rows) {
      const detallesQuery = await pool.query(
        `SELECT rd.*, m.nombre, m.presentacion 
         FROM receta_detalles rd
         JOIN medicamentos m ON rd.id_medicamento = m.id_medicamento
         WHERE rd.id_receta = $1`,
        [receta.id_receta]
      );
      
      recetasConDetalles.push({
        ...receta,
        medicamentos: detallesQuery.rows
      });
    }
    
    res.json({ success: true, recetas: recetasConDetalles });
    
  } catch (error) {
    console.error('Error obteniendo recetas:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

router.get('/examenes/paciente', authenticateToken, async (req, res) => {
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

// ==================== RUTAS DE DOCTOR ====================
router.get('/doctor/citas/hoy', authenticateToken, async (req, res) => {
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

router.post('/atenciones', authenticateToken, async (req, res) => {
  try {
    const { id_cita, tipo_atencion, diagnostico } = req.body;
    const userId = req.user.id;
    
    if (!id_cita || !diagnostico) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cita y diagnóstico requeridos' 
      });
    }
    
    // Verificar que el doctor atienda esa cita
    const citaQuery = await pool.query(
      `SELECT c.* FROM citas c
       JOIN doctores d ON c.id_doctor = d.id_doctor
       WHERE c.id_cita = $1 AND d.id_usuario = $2`,
      [id_cita, userId]
    );
    
    if (citaQuery.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'No autorizado para atender esta cita' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Actualizar estado de la cita
      await client.query(
        `UPDATE citas SET estado = 'Completada' WHERE id_cita = $1`,
        [id_cita]
      );
      
      // 2. Crear atención
      const atencionResult = await client.query(
        `INSERT INTO atenciones (id_cita, tipo_atencion) 
         VALUES ($1, $2) 
         RETURNING id_atencion`,
        [id_cita, tipo_atencion || 'Consulta General']
      );
      
      const atencionId = atencionResult.rows[0].id_atencion;
      
      // 3. Crear diagnóstico
      await client.query(
        `INSERT INTO diagnosticos (id_atencion, descripcion) 
         VALUES ($1, $2)`,
        [atencionId, diagnostico]
      );
      
      await client.query('COMMIT');
      
      res.status(201).json({ 
        success: true, 
        message: 'Atención registrada exitosamente',
        id_atencion: atencionId
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error creando atención:', error);
    res.status(500).json({ success: false, message: 'Error creando atención' });
  }
});

router.post('/recetas', authenticateToken, async (req, res) => {
  try {
    const { id_atencion, medicamentos } = req.body;
    const userId = req.user.id;
    
    if (!id_atencion || !medicamentos || !Array.isArray(medicamentos)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Atención y medicamentos requeridos' 
      });
    }
    
    // Verificar que el doctor creó esta atención
    const atencionQuery = await pool.query(
      `SELECT a.* FROM atenciones a
       JOIN citas c ON a.id_cita = c.id_cita
       JOIN doctores d ON c.id_doctor = d.id_doctor
       WHERE a.id_atencion = $1 AND d.id_usuario = $2`,
      [id_atencion, userId]
    );
    
    if (atencionQuery.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'No autorizado para crear receta en esta atención' 
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

router.post('/examenes', authenticateToken, async (req, res) => {
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
        message: 'No autorizado' 
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
        [examenResult.rows[0].id_examen, `Orden creada: ${observaciones}`]
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

router.get('/citas/:id', authenticateToken, async (req, res) => {
  try {
    const citaId = req.params.id;
    const userId = req.user.id;
    
    let query;
    let params;
    
    if (req.user.rol === 'Doctor') {
      query = `
        SELECT c.*, 
               p.nombres || ' ' || p.apellidos as paciente_nombre,
               p.dni as paciente_dni,
               p.fecha_nacimiento,
               p.sexo,
               h.nombre as hospital_nombre
        FROM citas c
        JOIN pacientes p ON c.id_paciente = p.id_paciente
        JOIN doctores d ON c.id_doctor = d.id_doctor
        LEFT JOIN hospitales h ON c.id_hospital = h.id_hospital
        WHERE c.id_cita = $1 AND d.id_usuario = $2
      `;
      params = [citaId, userId];
    } else if (req.user.rol === 'Paciente') {
      query = `
        SELECT c.*, 
               d.nombres || ' ' || d.apellidos as doctor_nombre,
               e.nombre as especialidad,
               h.nombre as hospital_nombre
        FROM citas c
        JOIN doctores d ON c.id_doctor = d.id_doctor
        LEFT JOIN especialidades e ON d.id_especialidad = e.id_especialidad
        LEFT JOIN hospitales h ON c.id_hospital = h.id_hospital
        JOIN pacientes p ON c.id_paciente = p.id_paciente
        WHERE c.id_cita = $1 AND p.id_usuario = $2
      `;
      params = [citaId, userId];
    } else {
      return res.status(403).json({ 
        success: false, 
        message: 'Acceso no autorizado' 
      });
    }
    
    const citaQuery = await pool.query(query, params);
    
    if (citaQuery.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cita no encontrada o no autorizado' 
      });
    }
    
    res.json({ success: true, cita: citaQuery.rows[0] });
    
  } catch (error) {
    console.error('Error obteniendo cita:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// ==================== RUTAS DE ADMIN ====================
router.get('/admin/usuarios', authenticateToken, async (req, res) => {
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

router.post('/admin/doctores', authenticateToken, async (req, res) => {
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
      
      // 3. Crear usuario (rol 2 = Doctor)
      const userResult = await client.query(
        `INSERT INTO usuarios (email, password, id_rol) 
         VALUES ($1, $2, 2) 
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

// ==================== RUTAS PÚBLICAS (CATÁLOGOS) ====================
router.get('/doctores', async (req, res) => {
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

router.get('/hospitales', async (req, res) => {
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

router.get('/medicamentos', async (req, res) => {
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

router.get('/especialidades', async (req, res) => {
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

// Ruta 404 para API
router.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Ruta API no encontrada' });
});

module.exports = router;