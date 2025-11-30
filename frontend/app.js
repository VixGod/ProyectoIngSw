document.addEventListener('DOMContentLoaded', async () => {
    
    // =========================================================
    // 1. VERIFICAR SESIÓN
    // =========================================================
    const usuarioStr = localStorage.getItem('usuarioActivo');
    if (!usuarioStr) {
        window.location.href = 'login.html';
        return;
    }
    const usuario = JSON.parse(usuarioStr);
    
    const headerName = document.getElementById('header-username');
    if (headerName) {
        const nombreMostrar = usuario.NombreDocente || usuario.DirectorNombre || usuario.NombreTitular || 'Usuario';
        headerName.textContent = `¡Hola, ${nombreMostrar}!`;
    }

    // =========================================================
    // 2. DETECTAR PÁGINA
    // =========================================================
    const path = window.location.pathname;

    // Lógica para la página de INICIO (Mis Documentos)
    if (path.includes('inicio.html')) {
        await cargarMisDocumentos(usuario.DocenteID, 'Pendiente', 'solicitudes-content');
        await cargarMisDocumentos(usuario.DocenteID, 'Firmado', 'completados-content');
    }
    
    // Lógica para la página de DOCUMENTOS (Catálogo)
    if (path.includes('documentos.html')) {
        await cargarCatalogo(usuario.DocenteID);
    }

    // =========================================================
    // 3. LOGICA DE MIS DOCUMENTOS (INICIO)
    // =========================================================
    async function cargarMisDocumentos(idUsuario, status, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            // 1. Obtener documentos normales de la BD
            const response = await fetch(`http://localhost:3000/api/mis-documentos?id=${idUsuario}&status=${status}&rol=${usuario.Rol || 'Docente'}`);
            let documentos = await response.json();

            // 2. TRUCO: SI ESTAMOS EN "COMPLETADOS", INYECTAMOS LOS EXÁMENES
            if (status === 'Firmado') {
                try {
                    // Pedimos los exámenes al backend
                    const respExamenes = await fetch(`http://localhost:3000/api/catalogo-inteligente?id=${idUsuario}`);
                    const dataExamenes = await respExamenes.json();
                    
                    // Filtramos solo los que son exámenes
                    const soloExamenes = dataExamenes.filter(d => d.tipo === 'descarga_directa');
                    
                    // Los adaptamos para que se vean igual que los documentos firmados
                    const examenesAdaptados = soloExamenes.map(e => ({
                        DocumentoID: e.id,
                        TipoDoc: e.nombre,
                        FechaDoc: new Date().toISOString(), // Usamos fecha actual o simulada
                        StatusDoc: 'Completado', 
                        EsExamen: true 
                    }));
                    
                    // Los unimos a la lista principal
                    documentos = [...documentos, ...examenesAdaptados];

                } catch (e) {
                    console.error("No se pudieron cargar los exámenes en completados", e);
                }
            }

            if (documentos.length === 0) {
                container.innerHTML = `<p style="color: white; text-align:center; margin-top: 20px;">No tienes documentos ${status.toLowerCase()}s.</p>`;
                return;
            }

            let html = '';
            documentos.forEach(doc => {
                const fecha = new Date(doc.FechaDoc).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
                
                // Icono según estado
                const icono = status === 'Pendiente' ? 'Recursos-img/image 20.png' : 'Recursos-img/image 21.png'; 

                if (doc.EsExamen) {
                    // CASO A: ES UN EXAMEN (VISTA PREVIA PDF)
                    // CAMBIO: Texto actualizado y llamada a función de vista previa
                    html += `
                    <div class="clickable-document" onclick="descargarExencion(${doc.DocumentoID})" style="cursor: pointer;">
                        <div class="document-row">
                            <div class="document-details">
                                <span class="documento-text">${doc.TipoDoc}</span>
                                <span class="document-date">Visualizar Constancia (PDF)</span>
                            </div>
                            <img class="time-icon" src="${icono}" alt="Listo" />
                        </div>
                    </div>
                    `;
                } else {
                    // CASO B: DOCUMENTO NORMAL (Vista Previa PDF)
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
                }
            });
            container.innerHTML = html;

        } catch (error) {
            console.error("Error cargando documentos:", error);
            container.innerHTML = '<p style="color: white;">Error de conexión con el servidor.</p>';
        }
    }

    // =========================================================
    // 4. LOGICA DEL CATÁLOGO (SOLICITUDES NUEVAS)
    // =========================================================
    async function cargarCatalogo(idUsuario) {
        const container = document.querySelector('.catalog-container');
        if (!container) return;

        try {
            const response = await fetch(`http://localhost:3000/api/catalogo-inteligente?id=${idUsuario}`);
            const catalogoRaw = await response.json();

            // FILTRO IMPORTANTE: En el catálogo NO mostramos los exámenes
            const catalogo = catalogoRaw.filter(item => item.tipo !== 'descarga_directa');

            if (catalogo.length === 0) {
                container.innerHTML = '<p style="text-align:center; color: white;">No hay documentos disponibles para solicitar.</p>';
                return;
            }

            let html = '';
            catalogo.forEach(item => {
                let clickAction = '';
                let textoBoton = 'Obtener';
                let estiloExtra = ''; 
                
                if (item.bloqueadoPorPerfil) {
                    clickAction = `alert('Bloqueado: ${item.bloqueadoPorPerfil}')`;
                    textoBoton = 'Bloqueado';
                    estiloExtra = 'opacity: 0.5; cursor: not-allowed;';
                } else {
                    clickAction = `irAVistaPrevia('${item.nombre}', '${item.ruta || ''}', ${item.id})`;
                }

                html += `
                <div class="catalog-row" style="${item.bloqueadoPorPerfil ? 'opacity: 0.5;' : ''}">
                    <span class="documento-text" style="font-size: 24px;">${item.nombre}</span>
                    
                    <div class="action-buttons" onclick="${clickAction}" style="cursor: pointer; ${estiloExtra}">
                        <span class="obtain-text">${textoBoton}</span>
                        <img class="action-icon" src="Recursos-img/image 36.png" alt="Ver" />
                    </div>
                </div>
                `;
            });
            container.innerHTML = html;

        } catch (error) {
            console.error("Error:", error);
            container.innerHTML = '<p style="color: white;">Error cargando catálogo.</p>';
        }
    }

    // =========================================================
    // 5. FUNCIONES GLOBALES Y DE INTERFAZ
    // =========================================================
    
    window.irAVistaPrevia = (nombre, ruta, idDoc) => {
        // Redirección estándar para solicitudes nuevas
        const urlBackend = `http://localhost:3000/api/generar-constancia?tipo=${encodeURIComponent(nombre)}&idUsuario=${usuario.DocenteID}`;
        window.location.href = `vista-previa-solicitud.html?name=${encodeURIComponent(nombre)}&path=${encodeURIComponent(urlBackend)}`;
    };

    window.descargarExencion = (idExamen) => {
        // CAMBIO IMPORTANTE: Abrimos en una pestaña nueva (_blank)
        // El navegador mostrará el visor de PDF, desde donde se puede descargar
        window.open(`http://localhost:3000/api/descargar/exencion/${idExamen}`, '_blank');
    };

    // --- LÓGICA DE UI (SIDEBAR, TABS, MENU) ---
    
    // Sidebar Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
        nav.addEventListener('click', (e) => {
            const href = nav.getAttribute('data-href');
            if(href && !window.location.href.includes(href)) {
                window.location.href = href;
            }
        });
    });

    // Tabs de Inicio (Solicitudes / Completados)
    const tabs = document.querySelectorAll('.solicitudes-tab, .completados-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active-tab'));
            tab.classList.add('active-tab');
            
            const targetId = tab.getAttribute('data-target');
            const solContent = document.getElementById('solicitudes-content');
            const compContent = document.getElementById('completados-content');
            
            if(solContent) solContent.classList.add('hidden');
            if(compContent) compContent.classList.add('hidden');
            
            const target = document.getElementById(targetId);
            if(target) target.classList.remove('hidden');
        });
    });

    // Menú de Perfil
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu');
    const closeMenu = document.getElementById('close-menu-btn');
    const logoutBtn = document.querySelector('.logout');

    if(profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('hidden'); });
        if(closeMenu) closeMenu.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.add('hidden'); });
        document.addEventListener('click', () => profileMenu.classList.add('hidden'));
    }

    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('usuarioActivo');
            window.location.href = 'login.html';
        });
    }
});