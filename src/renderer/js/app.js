import { Logger } from './logger.js';
import { ConfigManager } from './configManager.js';

class App {
    constructor() {
        this.logger = new Logger('log');
        this.configManager = new ConfigManager();
        this.sidebarCollapsed = false;
        this.initialize();
    }

    async initialize() {
        this.logger.success('Aplicación iniciada correctamente');
        
        // Obtener la configuración para mostrar el software y puerto correctos
        try {
            const config = await this.configManager.getConfig();
            const software = config.software || 'log4om';
            const port = this.getPortForSoftware(software);
            this.logger.log(`Esperando datos de ${software.toUpperCase()} en el puerto ${port}...`);
        } catch (error) {
            console.error('Error al cargar la configuración:', error);
            this.logger.log('Esperando datos en el puerto 2233 (Log4OM)...');
        }
        
        // Configurar manejadores de eventos globales
        this.setupErrorHandling();
        
        // Verificar que la API de electron esté disponible
        if (!window.electron) {
            this.logger.error('Error: La API de Electron no está disponible');
            return;
        }
        
        // Configurar manejador de logs si está disponible
        if (typeof window.electron?.onLog === 'function') {
            // No necesitamos validar el mensaje aquí ya que ahora se hace en preload.js
            window.electron.onLog((message) => {
                // Solo registrar mensajes no vacíos
                if (message) {
                    this.logger.log(message);
                }
            });
        } else {
            console.warn('window.electron.onLog no está disponible');
        }
    }
    
    // Obtener el puerto según el software seleccionado
    getPortForSoftware(software) {
        const ports = {
            'log4om': 2233,
            'wsjtx': 2333,
            'jtdx': 2333,
            'n1mm': 12060
        };
        return ports[software] || 2233;
    }
    
    setupErrorHandling() {
        // Manejar errores no capturados
        window.onerror = (message, source, lineno, colno, error) => {
            // Ignorar errores vacíos o de recursos bloqueados
            if (!message || message === 'Script error.' || message === 'ResizeObserver loop limit exceeded') {
                return true;
            }
            
            const errorMsg = `Error: ${message} en ${source}:${lineno}:${colno}`;
            console.error(errorMsg); // Siempre registrar en consola
            this.logger.error(errorMsg);
            
            if (error && error.stack) {
                console.error(error.stack);
                this.logger.error(error.stack);
            }
            return true;
        };
        
        // Manejar promesas no capturadas
        window.addEventListener('unhandledrejection', (event) => {
            // Ignorar errores vacíos
            if (!event || !event.reason) return;
            
            const error = event.reason.message || String(event.reason) || 'Error desconocido en promesa';
            console.error('Error no manejado en promesa:', error);
            this.logger.error(`Error no manejado: ${error}`);
        });
    }

    // Inicializar el menú lateral
    initializeSidebar() {
        console.log('Initializing sidebar...');
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('toggleSidebar');
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const menuItems = document.querySelectorAll('.menu-item');
        
        // Solo mantener el estado local, sin guardar automáticamente
        this.sidebarCollapsed = false;

        // Función para actualizar el estado del sidebar (sin guardar)
        const updateSidebarState = (state) => {
            this.sidebarCollapsed = state;
            sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
        };

        // Alternar menú lateral (solo actualiza la UI, no guarda)
        const toggleSidebar = () => {
            this.sidebarCollapsed = !this.sidebarCollapsed;
            console.log(`Toggling sidebar to ${this.sidebarCollapsed ? 'collapsed' : 'expanded'}`);
            sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
        };

        // Manejar clic en botón de alternar
        if (toggleBtn) {
            let isProcessing = false;
            const handleToggleClick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                if (isProcessing) return;
                isProcessing = true;
                
                try {
                    toggleSidebar();
                } finally {
                    // Reset after a short delay to prevent double-clicks
                    setTimeout(() => {
                        isProcessing = false;
                    }, 300);
                }
            };
            
            // Remove all existing click listeners to prevent duplicates
            const newToggleBtn = toggleBtn.cloneNode(true);
            toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
            
            // Add new listener
            newToggleBtn.addEventListener('click', handleToggleClick);
            console.log('Toggle button event listener attached');
        }

        // Manejar clic en ítems del menú
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                // Remover clase active de todos los ítems
                menuItems.forEach(i => i.classList.remove('active'));
                // Agregar clase active al ítem clickeado
                item.classList.add('active');
                
                // Ocultar menú en móviles después de seleccionar un ítem
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('show');
                }
                
                // Cargar la sección correspondiente
                const section = item.getAttribute('data-section');
                this.loadSection(section);
            });
        });
        
        // Exponer método para guardar el estado actual
        this.saveSidebarState = async () => {
            if (this.configManager) {
                try {
                    await this.configManager.saveConfig({
                        sidebarCollapsed: this.sidebarCollapsed
                    });
                    console.log('Sidebar state saved:', this.sidebarCollapsed);
                    return true;
                } catch (error) {
                    console.error('Error saving sidebar state:', error);
                    return false;
                }
            }
            return false;
        };

        // Manejar menú en móviles
        if (mobileMenuToggle) {
            let isProcessing = false;
            const handleMobileMenuClick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                if (isProcessing) return;
                isProcessing = true;
                
                try {
                    sidebar.classList.toggle('show');
                } finally {
                    // Reset after a short delay to prevent double-clicks
                    setTimeout(() => {
                        isProcessing = false;
                    }, 300);
                }
            };
            
            mobileMenuToggle.removeEventListener('click', handleMobileMenuClick); // Remove existing if any
            mobileMenuToggle.addEventListener('click', handleMobileMenuClick);
        }

        // Cerrar menú al hacer clic fuera de él en móviles
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && !sidebar.contains(e.target) && 
                !mobileMenuToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        });

        // Cargar estado guardado del menú
        this.loadSidebarState();
    }

    // Cargar el estado guardado del menú lateral
    async loadSidebarState() {
        try {
            console.log('Loading sidebar state...');
            const config = await this.configManager.getConfig();
            console.log('Current config:', JSON.stringify(config, null, 2));
            
            if (config.sidebarCollapsed !== undefined) {
                console.log(`Current sidebar state: ${this.sidebarCollapsed}, Saved state: ${config.sidebarCollapsed}`);
                
                // Solo actualizar si el estado es diferente
                if (this.sidebarCollapsed !== config.sidebarCollapsed) {
                    console.log(`Updating sidebar state to: ${config.sidebarCollapsed}`);
                    this.sidebarCollapsed = config.sidebarCollapsed;
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) {
                        // No disparar eventos al cargar el estado inicial
                        const event = new Event('sidebar-state-loading');
                        document.dispatchEvent(event);
                        
                        sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
                        console.log(`UI updated to: ${this.sidebarCollapsed ? 'collapsed' : 'expanded'}`);
                    }
                } else {
                    console.log('No sidebar state change needed');
                }
            }
        } catch (error) {
            console.error('Error al cargar el estado del menú:', error);
        }
    }

    // Cargar la sección seleccionada
    loadSection(section) {
        console.log(`Cargando sección: ${section}`);
        // Aquí puedes implementar la lógica para cargar el contenido de cada sección
        // Por ejemplo, mostrar/ocultar elementos según la sección
        const sections = ['dashboard', 'settings', 'logs', 'about'];
        sections.forEach(sec => {
            const element = document.getElementById(`${sec}-section`);
            if (element) {
                if (sec === section) {
                    element.style.display = 'block';
                } else {
                    element.style.display = 'none';
                }
            }
        });
        return true;
    }
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.initializeSidebar();
});
