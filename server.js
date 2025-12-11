require('dotenv').config();

// ---------------------- DEPENDENCIAS ---------------------- //
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const { Pool } = require('pg');
const NodeCache = require('node-cache');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const port = process.env.PORT || 4000;

// ---------------------- CORS ---------------------- //
app.use(cors({
  origin: "*",
  methods: "GET,POST,PUT,DELETE"
}));

// ---------------------- BASE DE DATOS ---------------------- //
console.log("Intentando conectar a PostgreSQL...");
console.table({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD ? "********" : "undefined",
  database: process.env.PGDATABASE
});

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

// Verificar conexión
pool.connect((err, client, done) => {
  if (err) {
    console.error("❌ Error al conectar:", err);
    throw err;
  }
  console.log("✅ Conexión exitosa a PostgreSQL");
  done();
});

const cache = new NodeCache({ stdTTL: 60 });

// ---------------------- CONFIGURACIÓN GENERAL ---------------------- //
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------- ARCHIVOS ESTÁTICOS ---------------------- //
app.use('/HTML', express.static(path.join(__dirname, 'HTML')));
app.use('/CSS', express.static(path.join(__dirname, 'CSS')));
app.use('/JS', express.static(path.join(__dirname, 'JS')));
app.use('/img', express.static(path.join(__dirname, 'img')));

// ---------------------- SESIÓN ---------------------- //
app.use(session({
  secret: 'sisge_salud_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

// ---------------------- RUTA PRINCIPAL ---------------------- //
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'HTML', 'index.html');
  if (!fs.existsSync(filePath)) {
    return res.send(`
      <h2 style="font-family: sans-serif; color: red;">❌ No se encontró /HTML/index.html</h2>
      <p>Revisa la ruta o el nombre del archivo.</p>
    `);
  }
  res.sendFile(filePath);
});


// Sesión temporal (aún sin login real)
app.get('/api/session', (req, res) => {
  res.json({
    rol: null,
    usuario: null
  });
});

// Logout básico
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});


// ---------------------- INICIAR SERVIDOR ---------------------- //
app.listen(port, () => {
  console.log(`🚀 Servidor SISGE-SALUD corriendo en http://localhost:${port}`);
  console.log(`👉 Pagina principal: http://localhost:${port}/`);
  console.log(`👉 Carpeta HTML: http://localhost:${port}/HTML/`);
});

process.on('uncaughtException', err => console.error(err));
process.on('unhandledRejection', err => console.error(err));
