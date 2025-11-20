document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================================
    // === 1. DATOS SIMULADOS (Con soporte para PDF e Imágenes) ===
    // =========================================================
    const completedDocumentsData = [
        { 
            id: 1, 
            name: "Constancia Laboral", 
            date: "09-06-2025", 
            path: "/aaa/Recursos-img/01 editado.pdf"
        },
        { 
            id: 2, 
            name: "Documento 2", 
            date: "05-10-2025", 
            path: "/aaa/Recursos-img/documento-ejemplo-2.png" 
        },
        { 
            id: 3, 
            name: "Documento 3", 
            date: "06-10-2025", 
            path: "/aaa/Recursos-img/documento-ejemplo-3.png" 
        },
        { 
            id: 4, 
            name: "Documento 4", 
            date: "09-10-2025", 
            path: "/aaa/Recursos-img/documento-ejemplo-4.png" 
        },
        { 
            id: 5, 
            name: "Reporte Final", 
            date: "18-11-2025", 
            path: "/aaa/Recursos-img/documento-ejemplo-5.png" 
        },
    ];

    // Función para generar la lista HTML
    function generateCompletedDocuments() {
        const container = document.getElementById('completados-content');
        if (!container) return; // Salir si no estamos en la página de inicio.html

        let htmlContent = '';

        completedDocumentsData.forEach(doc => {
            // Codificamos los parámetros para que viajen bien en la URL
            const encodedName = encodeURIComponent(doc.name);
            const encodedPath = encodeURIComponent(doc.path);
            
            // Creamos el enlace que dirige a visualizar-documento.html
            const linkHref = `visualizar-documento.html?id=${doc.id}&name=${encodedName}&path=${encodedPath}`;

            htmlContent += `
                <a href="${linkHref}" class="document-row clickable-document" style="text-decoration: none; color: inherit; display: flex; width: 100%; align-items: center;">
                    <div class="document-details">
                        <span class="documento-text">${doc.name}</span>
                        <span class="document-date">${doc.date}</span>
                    </div>
                    <img class="complete-icon" src="/aaa/Recursos-img/image 21.png" alt="Icono Completado" />
                </a>
            `;
        });

        container.innerHTML = htmlContent;
    }

    // Ejecutar la generación de la lista
    generateCompletedDocuments();


    // =========================================================
    // === 2. GESTIÓN DEL MENÚ LATERAL (Navegación) ===
    // =========================================================
    const navItems = document.querySelectorAll('.sidebar .nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault(); 
            const targetPage = item.getAttribute('data-href');
            
            if (targetPage) {
                // Verifica si ya estamos en la página para no recargar innecesariamente
                if (window.location.pathname.indexOf(targetPage) === -1) {
                    window.location.href = targetPage;
                } else {
                    navItems.forEach(t => t.classList.remove('active'));
                    item.classList.add('active');
                }
            }
        });
    });


    // =========================================================
    // === 3. GESTIÓN DEL MENÚ DE PERFIL (Header) ===
    // =========================================================
    const profileBtn = document.getElementById('profile-btn'); 
    const profileMenu = document.getElementById('profile-menu'); 
    const closeMenuBtn = document.getElementById('close-menu-btn'); 
    const menuItems = document.querySelectorAll('#profile-menu .menu-item');

    function toggleProfileMenu() {
        if (profileMenu) {
            profileMenu.classList.toggle('hidden');
        }
    }

    if (profileBtn) {
        profileBtn.addEventListener('click', (event) => {
            event.stopPropagation(); 
            toggleProfileMenu();
        });
    }

    if (closeMenuBtn) {
        closeMenuBtn.addEventListener('click', (event) => {
            event.stopPropagation(); 
            if (profileMenu) {
                profileMenu.classList.add('hidden');
            }
        });
    }

    // Redirección de los ítems del menú
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetHref = item.getAttribute('data-href');
            if (targetHref) {
                window.location.href = targetHref;
            }
        });
    });

    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', (event) => {
        if (profileMenu && profileBtn) {
            if (!profileBtn.contains(event.target) && !profileMenu.contains(event.target)) {
                profileMenu.classList.add('hidden');
            }
        }
    });


    // ==========================================================
    // === 4. GESTIÓN DE PESTAÑAS (Solicitudes/Completados) ===
    // ==========================================================
    const tabs = document.querySelectorAll('.solicitudes-tab, .completados-tab');
    
    if (tabs.length > 0) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.getAttribute('data-target');
                const targetContent = document.getElementById(targetId);

                // Gestión Visual (Barra azul)
                tabs.forEach(t => t.classList.remove('active-tab'));
                tab.classList.add('active-tab');

                // Gestión de Contenido (Ocultar/Mostrar)
                const contentWrapper = document.querySelector('.tab-content-wrapper');
                
                if (contentWrapper) {
                    const allContent = contentWrapper.querySelectorAll('.document-list-container');
                    
                    allContent.forEach(content => content.classList.add('hidden'));

                    if (targetContent) {
                        targetContent.classList.remove('hidden');
                    }
                }
            });
        });
        
        // Inicialización al cargar: asegurar que lo visible coincida con la pestaña activa
        const activeTab = document.querySelector('.sub-nav .active-tab');
        if (activeTab) {
            const initialTargetId = activeTab.getAttribute('data-target');
            const initialContent = document.getElementById(initialTargetId);
            
            const allContent = document.querySelectorAll('.document-list-container');
            allContent.forEach(content => content.classList.add('hidden'));
            
            if (initialContent) {
                initialContent.classList.remove('hidden');
            }
        }
    }
});