// Archivo: backend/db.js
const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false, // false para servidores locales
        trustServerCertificate: true // Importante para desarrollo local
    }
};

// Crear una sola conexión global
const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log(`✅ Conectado exitosamente a la Base de Datos: ${config.database}`);
        return pool;
    })
    .catch(err => {
        console.error('❌ Error conectando a la Base de Datos:', err);
        // Si falla la conexión, mostramos el error pero no matamos el proceso inmediatamente para que puedas leerlo
    });

module.exports = {
    sql,
    poolPromise
};