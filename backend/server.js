const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// Prueba de conexión node server.js
async function testConnection() {
    try {
        await sql.connect(dbConfig);
        console.log("✅ ¡Conexión a SQL Server exitosa!");
    } catch (err) {
        console.error("❌ ERROR de conexión:", err);
    }
}

// ==========================================
//               RUTA DE LOGIN
// ==========================================
app.post('/login', async (req, res) => {
    const { rfc, password } = req.body;

    if (!rfc || !password) {
        return res.status(400).json({ success: false, message: 'Faltan datos.' });
    }

    try {
        let pool = await sql.connect(dbConfig);

        // Consulta SQL exacta para buscar coincidencias de RFC (el usuario) y Password
        const result = await pool.request()
            .input('rfc', sql.NVarChar, rfc)
            .input('pass', sql.NVarChar, password)
            .query('SELECT * FROM Docente WHERE RFCDocente = @rfc AND DocentePassword = @pass');

        if (result.recordset.length > 0) {
            // ¡Usuario encontrado!
            const docente = result.recordset[0];
            
            // Quitamos la contraseña antes de enviarla al frontend por seguridad
            delete docente.DocentePassword; 

            res.json({
                success: true,
                message: 'Login exitoso',
                docente: docente
            });
        } else {
            // No se encontró coincidencia
            res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
    testConnection();
});