document.addEventListener('DOMContentLoaded', () => {
    
    // 1. OBTENER USUARIO LOGUEADO
    const usuarioGuardado = localStorage.getItem('usuarioActivo');
    let usuario = null;
    if (usuarioGuardado) {
        try { usuario = JSON.parse(usuarioGuardado); } catch (e) { console.error("Error al leer usuario:", e); }
    }

    // 2. CARGAR CATÁLOGO INTELIGENTE (ACTUALIZADO)
    async function cargarCatalogo() {
        const container = document.querySelector('.catalog-container');
        if (!container || !usuario || usuario.Rol === 'Administrativo') return; 

        try {
            const response = await fetch(`http://localhost:3000/api/catalogo-inteligente?id=${usuario.DocenteID}`);
            const documentos = await response.json();

            let html = '';
            documentos.forEach(doc => {
                const encodedName = encodeURIComponent(doc.nombre);
                
                // Generación dinámica siempre
                let rutaApi = `http://localhost:3000/api/generar-constancia?nombre=${encodeURIComponent(usuario.NombreDocente)}&tipo=${encodeURIComponent(doc.nombre)}&idDoc=0`;
                
                // Excepción SOLO para Convocatoria (estático)
                if (doc.nombre.includes('Convocatoria')) {
                     rutaApi = `Recursos-img/${doc.ruta}`;
                }
                
                const encodedPath = encodeURIComponent(rutaApi);
                let botonAccion = '';

                // --- CASO 1: BLOQUEADO (PASA EL ERROR) ---
                if (doc.bloqueadoPorPerfil) {
                    const errorMsg = encodeURIComponent(doc.bloqueadoPorPerfil);
                    
                    botonAccion = `
                        <a href="vista-previa-solicitud.html?name=${encodedName}&path=${encodedPath}&error=${errorMsg}" 
                           class="action-buttons warning-btn" 
                           style="text-decoration: none; background-color: #f0ad4e; border: 1px solid #eea236; min-width: 160px; justify-content: center;">
                            <div style="display:flex; flex-direction:column; align-items:center; line-height: 1.2; width:100%;">
                                <span class="obtain-text" style="color: white; font-size: 14px; font-weight: 800; margin:0;">REVISAR</span>
                                <span style="color: #fff; font-size: 10px;">Faltan Datos</span>
                            </div>
                            <span style="font-size: 20px; margin-left: 8px; color: white;">⚠️</span>
                        </a>
                    `;
                } 
                else if (doc.yaSolicitado) {
                    botonAccion = `
                        <div class="action-buttons" style="background-color: #cccccc; border: 1px solid #999; cursor: default;">
                            <span class="obtain-text" style="color: #555; font-weight:bold;">Solicitado</span>
                            <span style="font-size: 20px; margin-left: 10px; filter: grayscale(100%);">✅</span>
                        </div>
                    `;
                } 
                else {
                    botonAccion = `
                        <a href="vista-previa-solicitud.html?name=${encodedName}&path=${encodedPath}" class="action-buttons" style="text-decoration: none; color: inherit;">
                            <span class="obtain-text">Obtener</span>
                            <img class="action-icon" src="Recursos-img/image 36.png" alt="Solicitar" />
                        </a>
                    `;
                }

                html += `
                <div class="catalog-row">
                    <span class="documento-text">${doc.nombre}</span>
                    ${botonAccion}
                </div>`;
            });
            container.innerHTML = html;

        } catch (error) { console.error(error); }
    }

    // 3. CARGAR MIS DOCUMENTOS (Pendientes y Completados)
    async function cargarMisDocumentos() {
        const containerPendientes = document.getElementById('solicitudes-content') || document.getElementById('pendientes-content');
        const containerCompletados = document.getElementById('completados-content') || document.getElementById('completados-admin-content');
        
        if (!usuario) return;

        const esAdmin = (usuario.Rol === 'Administrativo');
        const pageLink = esAdmin ? 'admin-visualizar.html' : 'visualizar-documento.html';

        const renderRows = (docs, icono, linkPage) => {
            if (!docs || docs.length === 0) return '<p style="color:#666; text-align:center; padding:20px;">No hay documentos en esta sección.</p>';
            
            return docs.map(doc => {
                const fecha = new Date(doc.FechaDoc).toLocaleDateString('es-MX');
                const encodedName = encodeURIComponent(doc.TipoDoc);
                
                let nombreDocenteParaPDF = usuario.NombreDocente;
                let tipoDocLimpio = doc.TipoDoc;

                if (doc.TipoDoc.includes(' - ')) {
                    const partes = doc.TipoDoc.split(' - ');
                    tipoDocLimpio = partes[0].trim();
                    nombreDocenteParaPDF = partes[1].trim();
                }

                const path = `http://localhost:3000/api/generar-constancia?nombre=${encodeURIComponent(nombreDocenteParaPDF)}&tipo=${encodeURIComponent(tipoDocLimpio)}&idDoc=${doc.DocumentoID}`; 
                const encodedPath = encodeURIComponent(path);

                return `
                <a href="${linkPage}?id=${doc.DocumentoID}&name=${encodedName}&path=${encodedPath}&status=${doc.StatusDoc}" class="document-row clickable-document searchable-item">
                    <div class="document-details">
                        <span class="documento-text" title="${doc.TipoDoc}">${doc.TipoDoc}</span>
                        <span class="document-date">${fecha}</span>
                    </div>
                    <img class="complete-icon" src="Recursos-img/${icono}" alt="Estado" />
                </a>`;
            }).join('');
        };

        if (containerPendientes) {
            try {
                const res = await fetch(`http://localhost:3000/api/mis-documentos?id=${usuario.DocenteID}&status=Pendiente&rol=${usuario.Rol}&cargo=${usuario.Cargo}`);
                const docs = await res.json();
                containerPendientes.innerHTML = renderRows(docs, 'image 20.png', pageLink); 
            } catch (e) { console.error(e); }
        }

        if (containerCompletados) {
            try {
                const res = await fetch(`http://localhost:3000/api/mis-documentos?id=${usuario.DocenteID}&status=Firmado&rol=${usuario.Rol}&cargo=${usuario.Cargo}`);
                const docs = await res.json();
                const docsFiltrados = docs.filter(d => d.StatusDoc === 'Firmado' || d.StatusDoc === 'Completado');
                containerCompletados.innerHTML = renderRows(docsFiltrados, 'image 21.png', pageLink); 
            } catch (e) { console.error(e); }
        }
    }
    
    cargarCatalogo();
    cargarMisDocumentos();

    // 4. GESTIÓN DE NAVEGACIÓN
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (event) => {
            const targetPage = item.getAttribute('data-href');
            if (targetPage && targetPage !== '#') {
                event.preventDefault();
                if (window.location.pathname.indexOf(targetPage) === -1) window.location.href = targetPage;
            }
        });
    });

    // 5. MENÚ PERFIL
    const profileBtn = document.getElementById('profile-btn'); 
    const profileMenu = document.getElementById('profile-menu'); 
    const closeMenuBtn = document.getElementById('close-menu-btn'); 
    const menuItems = document.querySelectorAll('#profile-menu .menu-item');

    function toggleProfileMenu() { if (profileMenu) profileMenu.classList.toggle('hidden'); }

    if (profileBtn) profileBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleProfileMenu(); });
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); if (profileMenu) profileMenu.classList.add('hidden'); });

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetHref = item.getAttribute('data-href');
            if (targetHref) window.location.href = targetHref;
        });
    });

    document.addEventListener('click', (event) => {
        if (profileMenu && profileBtn) {
            if (!profileBtn.contains(event.target) && !profileMenu.contains(event.target)) profileMenu.classList.add('hidden');
        }
    });

    const btnLogout = document.querySelector('.logout'); 
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('usuarioActivo');
            localStorage.removeItem('adminHasSignature');
            localStorage.removeItem('adminSignatureImage');
            window.location.href = 'login.html'; 
        });
    }

    // 6. PESTAÑAS
    const tabs = document.querySelectorAll('.solicitudes-tab, .completados-tab');
    if (tabs.length > 0) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.getAttribute('data-target');
                const targetContent = document.getElementById(targetId);
                tabs.forEach(t => t.classList.remove('active-tab'));
                tab.classList.add('active-tab');
                const contentWrapper = document.querySelector('.tab-content-wrapper');
                if (contentWrapper) {
                    const allContent = contentWrapper.querySelectorAll('.document-list-container');
                    allContent.forEach(content => content.classList.add('hidden'));
                    if (targetContent) targetContent.classList.remove('hidden');
                }
            });
        });
        const activeTab = document.querySelector('.sub-nav .active-tab');
        if (activeTab) {
            const initialTargetId = activeTab.getAttribute('data-target');
            const initialContent = document.getElementById(initialTargetId);
            const allContent = document.querySelectorAll('.document-list-container');
            allContent.forEach(content => content.classList.add('hidden'));
            if (initialContent) initialContent.classList.remove('hidden');
        }
    }

    // 7. INYECTAR DATOS DE USUARIO
    function injectUserData() {
        if (!usuario) return; 
        const nombrePila = usuario.NombreDocente || usuario.DirectorNombre || "Usuario";
        const apellidoP = usuario.DocenteApePat || usuario.DirectorApePat || "";
        const nombreCompleto = `${nombrePila} ${apellidoP}`.trim();
        const rolDisplay = (usuario.Rol === 'Administrativo' || usuario.DirectorNombre) ? "DIRECTOR" : ""; 

        const headerNombre = document.getElementById('header-username') || document.querySelector('.bienvenida-norma-rebeca');
        if (headerNombre) headerNombre.textContent = `¡Bienvenido(a) ${rolDisplay} ${nombrePila}!`;

        const cardNameShort = document.getElementById('card-name-short');
        const cardNameFull = document.getElementById('card-name-full');
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