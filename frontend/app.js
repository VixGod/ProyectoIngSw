document.addEventListener('DOMContentLoaded', async () => {
    
    // =========================================================
    // 1. VERIFICAR SESIÓN Y MOSTRAR NOMBRE
    // =========================================================
    const usuarioStr = localStorage.getItem('usuarioActivo');
    
    // Si no hay usuario guardado, mandar al login
    if (!usuarioStr) {
        window.location.href = 'login.html';
        return;
    }

    const usuario = JSON.parse(usuarioStr);
    
    // Actualizar el nombre en el Header (usamos el ID header-username)
    const headerName = document.getElementById('header-username');
    if (headerName) {
        // Ajustamos según si es Docente o Administrativo (Director, RH, etc.)
        const nombreMostrar = usuario.NombreDocente || usuario.DirectorNombre || usuario.NombreTitular || 'Usuario';
        headerName.textContent = `¡Hola, ${nombreMostrar}!`;
    }

    // =========================================================
    // 2. DETECTAR PÁGINA Y CARGAR DATOS
    // =========================================================
    const path = window.location.pathname;

    // Si estamos en INICIO (Mis Documentos)
    if (path.includes('inicio.html')) {
        await cargarMisDocumentos(usuario.DocenteID, 'Pendiente', 'solicitudes-content');
        await cargarMisDocumentos(usuario.DocenteID, 'Firmado', 'completados-content');
    }
    
    // Si estamos en DOCUMENTOS (Catálogo)
    if (path.includes('documentos.html')) {
        await cargarCatalogo(usuario.DocenteID);
    }

    // =========================================================
    // 3. FUNCIONES DE LÓGICA (CONEXIÓN AL BACKEND)
    // =========================================================

    async function cargarMisDocumentos(idUsuario, status, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            // Petición al Backend Real
            const response = await fetch(`http://localhost:3000/api/mis-documentos?id=${idUsuario}&status=${status}&rol=${usuario.Rol || 'Docente'}`);
            const documentos = await response.json();

            if (documentos.length === 0) {
                container.innerHTML = `<p style="color: white; text-align:center; margin-top: 20px;">No tienes documentos ${status.toLowerCase()}s.</p>`;
                return;
            }

            let html = '';
            documentos.forEach(doc => {
                // Formateamos la fecha para que se vea bonita
                const fecha = new Date(doc.FechaDoc).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
                
                // Icono: Reloj si es pendiente, Check si está firmado
                const icono = status === 'Pendiente' 
                    ? 'Recursos-img/image 20.png'  
                    : 'Recursos-img/image 21.png'; 

                // Enlace para ver el documento. Nota: La ruta 'path' apunta al endpoint que genera el PDF
                const rutaBackend = `http://localhost:3000/api/generar-constancia?idDoc=${doc.DocumentoID}&tipo=${encodeURIComponent(doc.TipoDoc)}`;
                const params = `id=${doc.DocumentoID}&name=${encodeURIComponent(doc.TipoDoc)}&path=${encodeURIComponent(rutaBackend)}&status=${doc.StatusDoc}`;
                
                html += `
                <a href="visualizar-documento.html?${params}" class="clickable-document">
                    <div class="document-row">
                        <div class="document-details">
                            <span class="documento-text">${doc.TipoDoc}</span>
                            <span class="document-date">${fecha}</span>
                        </div>
                        <img class="time-icon" src="${icono}" alt="Estado" />
                    </div>
                </a>
                `;
            });
            container.innerHTML = html;

        } catch (error) {
            console.error("Error cargando documentos:", error);
            container.innerHTML = '<p style="color: white;">Error de conexión con el servidor.</p>';
        }
    }

    async function cargarCatalogo(idUsuario) {
        const container = document.querySelector('.catalog-container');
        if (!container) return;

        try {
            // Petición al endpoint del catálogo inteligente
            const response = await fetch(`http://localhost:3000/api/catalogo-inteligente?id=${idUsuario}`);
            const catalogo = await response.json();

            let html = '';
            catalogo.forEach(item => {
                // Si está bloqueado, deshabilitamos el botón
                const bloqueado = item.bloqueadoPorPerfil ? true : false;
                const opacidad = bloqueado ? '0.5' : '1';
                const cursor = bloqueado ? 'not-allowed' : 'pointer';
                
                // Acción al hacer click
                const clickAction = bloqueado 
                    ? `alert('Bloqueado: ${item.bloqueadoPorPerfil}')` 
                    : `irAVistaPrevia('${item.nombre}', '${item.ruta}')`;
                
                const textoBoton = bloqueado ? 'Bloqueado' : 'Obtener';

                html += `
                <div class="catalog-row" style="opacity: ${opacidad};">
                    <span class="documento-text" style="font-size: 24px;">${item.nombre}</span>
                    <div class="action-buttons" onclick="${clickAction}" style="cursor: ${cursor};">
                        <span class="obtain-text">${textoBoton}</span>
                        <img class="action-icon" src="Recursos-img/image 36.png" alt="Solicitar" />
                    </div>
                </div>
                `;
            });
            container.innerHTML = html;

        } catch (error) {
            console.error("Error cargando catálogo:", error);
            container.innerHTML = '<p style="color: white;">Error cargando el catálogo.</p>';
        }
    }

    // =========================================================
    // 4. FUNCIONALIDAD UI (Tabs, Menús, Navegación)
    // =========================================================
    
    // Función global para redireccionar desde el catálogo a la vista previa
    window.irAVistaPrevia = (nombre, ruta) => {
        // 'ruta' es el nombre del archivo físico (ej: constancia_laboral.pdf)
        // Lo pasamos a la vista previa para que ella decida si pedirlo al backend o mostrar imagen
        window.location.href = `vista-previa-solicitud.html?name=${encodeURIComponent(nombre)}&path=Recursos-img/${ruta}`;
    };

    // Tabs de Solicitudes / Completados (Interactividad visual)
    const tabs = document.querySelectorAll('.solicitudes-tab, .completados-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Visual (Subrayado)
            tabs.forEach(t => t.classList.remove('active-tab'));
            tab.classList.add('active-tab');
            
            // Mostrar/Ocultar Contenedores
            const targetId = tab.getAttribute('data-target');
            const solContent = document.getElementById('solicitudes-content');
            const compContent = document.getElementById('completados-content');
            
            if(solContent) solContent.classList.add('hidden');
            if(compContent) compContent.classList.add('hidden');
            
            const target = document.getElementById(targetId);
            if(target) target.classList.remove('hidden');
        });
    });

    // Menú de Perfil (Desplegable)
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu');
    const closeMenu = document.getElementById('close-menu-btn');
    
    if(profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            profileMenu.classList.toggle('hidden'); 
        });
        
        if(closeMenu) {
            closeMenu.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                profileMenu.classList.add('hidden'); 
            });
        }
        
        // Cerrar al hacer clic fuera
        document.addEventListener('click', () => profileMenu.classList.add('hidden'));
    }

    // Navegación Sidebar (Menú lateral)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
        nav.addEventListener('click', (e) => {
            const href = nav.getAttribute('data-href');
            if(href && !window.location.href.includes(href)) {
                window.location.href = href;
            }
        });
    });
    
    // Logout (Cerrar Sesión)
    const logoutBtn = document.querySelector('.logout');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('usuarioActivo');
            localStorage.removeItem('adminSignatureImage'); // Limpiar firma si existe
            window.location.href = 'login.html';
        });
    }
});