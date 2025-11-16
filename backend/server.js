// 1. Importar los paquetes
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

// ¡IMPORTANTE! Esto carga las variables del archivo .env
require('dotenv').config();

// 2. Crear la aplicación del servidor
const app = express();
app.use(cors());
app.use(express.json());

// 3. Configurar la conexión a la Base de Datos
// El código lee las variables desde 'process.env' (que fue llenado por dotenv)
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false, // Poner en true si usas Azure
    trustServerCertificate: true // Poner en true para conexiones locales
  }
};

// 4. Función de prueba para verificar la conexión
// (Esta función es solo para probar que todo funciona)
async function testConnection() {
  try {
    // Intenta conectar
    let pool = await sql.connect(dbConfig);
    console.log("✅ ¡Conexión a SQL Server exitosa!");

    // Opcional: Haz una consulta simple
    const result = await pool.request().query('SELECT 1 AS test');
    console.log('Resultado de la consulta de prueba:', result.recordset);

  } catch (err) {
    console.error("❌ ERROR al conectar a la base de datos: ", err);
  }
}

// 5. Iniciar el servidor
const port = 3000;
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
  
  // Ejecuta la prueba de conexión cuando el servidor inicia
  testConnection();
});