import { Logger } from './logger.js';
import { ConfigManager } from './configManager.js';

class App {
    constructor() {
        this.logger = new Logger('log');
        this.configManager = new ConfigManager();
        this.initialize();
    }

    initialize() {
        this.logger.success('Aplicación iniciada correctamente');
        this.logger.log('Esperando datos de Log4OM en el puerto 2233...');
        
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
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
