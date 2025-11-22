document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue

    // Obtenemos los valores de los inputs
    const rfc = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const mensajeError = document.getElementById('error-message');

    try {
        // Enviamos los datos al backend
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                rfc: rfc, 
                password: password 
            })
        });

        const data = await response.json();

        if (data.success) {
            // Login Exitoso
            console.log("Bienvenido:", data.docente.NombreDocente);
            
            // Guardamos los datos del docente en el navegador para usarlos mas adelante con los documentos
            localStorage.setItem('usuarioActivo', JSON.stringify(data.docente));

            // Redirigimos a la siguiente página (catalogo.html)
            window.location.href = 'documentos.html'; 
        } else {
            // Login Fallido (Credenciales incorrectas)
            mensajeError.textContent = data.message;
            mensajeError.style.display = 'block';
        }

    } catch (error) {
        console.error("Error de conexión:", error);
        mensajeError.textContent = "Error al conectar con el servidor.";
        mensajeError.style.display = 'block';
    }
});