document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. OBTENER USUARIO LOGUEADO
    const usuarioStr = localStorage.getItem('usuarioActivo');
    if (!usuarioStr) {
        window.location.href = 'login.html';
        return;
    }
    const usuario = JSON.parse(usuarioStr);
    
    // Actualizar Header
    const headerName = document.getElementById('header-username');
    if (headerName) {
        const nombreMostrar = usuario.NombreDocente || usuario.DirectorNombre || usuario.NombreTitular || 'Usuario';
        headerName.textContent = `¡Hola, ${nombreMostrar}!`;
    }

    // 2. DETECTAR PÁGINA
    const path = window.location.pathname;

    if (path.includes('inicio.html')) {
        await cargarMisDocumentos(usuario.DocenteID, 'Pendiente', 'solicitudes-content');
        await cargarMisDocumentos(usuario.DocenteID, 'Firmado', 'completados-content');
    }
    
    if (path.includes('documentos.html')) {
        await cargarCatalogo(usuario.DocenteID);
    }

    // 3. LOGICA DE MIS DOCUMENTOS (Página de Inicio)
    async function cargarMisDocumentos(idUsuario, status, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            // 1. Obtener documentos (El Backend YA incluye los exámenes si status es 'Firmado')
            const response = await fetch(`http://localhost:3000/api/mis-documentos?id=${idUsuario}&status=${status}&rol=${usuario.Rol || 'Docente'}`);
            let documentos = await response.json();

            // --- ELIMINADO EL BLOQUE DE INYECCIÓN MANUAL PARA EVITAR DUPLICADOS --- 
            // El servidor ya nos manda la lista completa.

            if (documentos.length === 0) {
                container.innerHTML = `<p style="color: white; text-align:center; margin-top: 20px;">No tienes documentos ${status.toLowerCase()}s.</p>`;
                return;
            }

            let html = '';
            documentos.forEach(doc => {
                const fecha = new Date(doc.FechaDoc).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
                const icono = status === 'Pendiente' ? 'Recursos-img/image 20.png' : 'Recursos-img/image 21.png'; 

                if (doc.EsExamen) {
                    // CASO A: ES UN EXAMEN
                    html += `
                    <div class="clickable-document" onclick="verExamenPDF(${doc.DocumentoID})" style="cursor: pointer;">
                        <div class="document-row">
                            <div class="document-details">
                                <span class="documento-text">${doc.TipoDoc}</span>
                                <span class="document-date">Clic para visualizar Constancia (PDF)</span>
                            </div>
                            <img class="time-icon" src="${icono}" alt="Listo" />
                        </div>
                    </div>`;
                } else {
                    // CASO B: DOCUMENTO NORMAL
                    const onclickStr = `irAVistaPrevia('${doc.TipoDoc}', '', ${doc.DocumentoID})`;
                    html += `
                    <div class="clickable-document" onclick="${onclickStr}" style="cursor: pointer;">
                        <div class="document-row">
                            <div class="document-details">
                                <span class="documento-text">${doc.TipoDoc}</span>
                                <span class="document-date">${fecha}</span>
                            </div>
                            <img class="time-icon" src="${icono}" alt="Estado" />
                        </div>
                    </div>`;
                }
            });
            container.innerHTML = html;

        } catch (error) {
            console.error("Error cargando documentos:", error);
            container.innerHTML = '<p style="color: white;">Error de conexión.</p>';
        }
    }

    // 4. LOGICA DEL CATÁLOGO
    async function cargarCatalogo(idUsuario) {
        const container = document.querySelector('.catalog-container');
        if (!container) return;

        try {
            const response = await fetch(`http://localhost:3000/api/catalogo-inteligente?id=${idUsuario}`);
            const catalogoRaw = await response.json();
            // Filtro para no mostrar exámenes en el catálogo de solicitudes
            const catalogo = catalogoRaw.filter(item => item.tipo !== 'descarga_directa');

            if (catalogo.length === 0) {
                container.innerHTML = '<p style="text-align:center; color: white;">No hay documentos disponibles.</p>';
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
                </div>`;
            });
            container.innerHTML = html;

        } catch (error) {
            console.error("Error:", error);
            container.innerHTML = '<p style="color: white;">Error cargando catálogo.</p>';
        }
    }

    // 5. FUNCIONES GLOBALES
    window.verExamenPDF = (idExamen) => {
        window.open(`http://localhost:3000/api/descargar/exencion/${idExamen}`, '_blank');
    };

    window.irAVistaPrevia = (nombre, ruta, idDoc) => {
        let urlBackend = '';
        
        if (nombre.includes('Horarios de labores')) {
            urlBackend = `http://localhost:3000/api/descargar/horarios/${usuario.DocenteID}`;
        }
        else if (nombre.includes('Constancia de Créditos')) {
            urlBackend = `http://localhost:3000/api/descargar/creditos/${usuario.DocenteID}`;
        }
        else if (nombre.includes('Constancia de Exención')) {
            urlBackend = `http://localhost:3000/api/descargar/exencion/${idDoc}`;
        }
        else if (nombre.includes('Convocatoria') || nombre.includes('Acreditación')) {
             urlBackend = `Recursos-img/${ruta}`;
             window.open(urlBackend, '_blank');
             return; 
        }
        else {
            urlBackend = `http://localhost:3000/api/generar-constancia?tipo=${encodeURIComponent(nombre)}&idUsuario=${usuario.DocenteID}`;
        }

        window.location.href = `vista-previa-solicitud.html?name=${encodeURIComponent(nombre)}&path=${encodeURIComponent(urlBackend)}`;
    };

    // --- UI ---
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
        nav.addEventListener('click', (e) => {
            const href = nav.getAttribute('data-href');
            if(href && !window.location.href.includes(href)) window.location.href = href;
        });
    });

    const tabs = document.querySelectorAll('.solicitudes-tab, .completados-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active-tab'));
            tab.classList.add('active-tab');
            const targetId = tab.getAttribute('data-target');
            document.getElementById('solicitudes-content').classList.add('hidden');
            document.getElementById('completados-content').classList.add('hidden');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

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
    
    function injectUserData() {
        if (!usuario) return; 
        const nombrePila = usuario.NombreDocente || usuario.DirectorNombre || "Usuario";
        const apellidoP = usuario.DocenteApePat || usuario.DirectorApePat || "";
        const nombreCompleto = `${nombrePila} ${apellidoP}`.trim();
        const cardNameFull = document.getElementById('card-name-full');
        const cardNameShort = document.getElementById('card-name-short');
        const cardEmail = document.getElementById('card-email');
        const cardDepto = document.getElementById('card-depto');

        if (cardNameFull) {
            cardNameFull.textContent = nombreCompleto.toUpperCase();
            if (cardNameShort) cardNameShort.textContent = nombrePila.toUpperCase();
            if (cardEmail) cardEmail.textContent = usuario.DocenteCorreo || "director@delta.edu";
            if (cardDepto) cardDepto.textContent = (usuario.NombreDepartamento || "DIRECCIÓN GENERAL").toUpperCase();
        }
    }
    injectUserData();
});