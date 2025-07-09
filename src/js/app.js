const Logger = require('./logger');
const ConfigManager = require('./configManager');

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
        
        // Escuchar mensajes del proceso principal
        if (window.electron) {
            window.electron.onLog((event, message) => {
                this.logger.log(message);
            });
            
            window.electron.onError((event, error) => {
                this.logger.error(error);
            });
        }
    }
    
    setupErrorHandling() {
        // Manejar errores no capturados
        window.onerror = (message, source, lineno, colno, error) => {
            const errorMsg = `Error: ${message} en ${source}:${lineno}:${colno}`;
            this.logger.error(errorMsg);
            if (error && error.stack) {
                this.logger.error(error.stack);
            }
            return true;
        };
        
        // Manejar promesas no capturadas
        window.addEventListener('unhandledrejection', (event) => {
            const error = event.reason || 'Error desconocido en promesa';
            this.logger.error(`Error no manejado: ${error}`);
        });
    }
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
