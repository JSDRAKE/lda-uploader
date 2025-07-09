class Logger {
    constructor(elementId = 'log') {
        this.logElement = document.getElementById(elementId);
        if (!this.logElement) {
            console.warn(`Element with ID '${elementId}' not found`);
            this.logElement = document.createElement('div');
            this.logElement.className = 'log';
            this.logElement.id = 'log';
            document.body.appendChild(this.logElement);
        }
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.logElement.prepend(logEntry);
        
        // Mantener solo los últimos 100 mensajes para rendimiento
        const entries = this.logElement.querySelectorAll('.log-entry');
        if (entries.length > 100) {
            this.logElement.removeChild(entries[entries.length - 1]);
        }
        
        console[type === 'error' ? 'error' : 'log'](`[${type.toUpperCase()}] ${message}`);
    }

    error(message) {
        this.log(message, 'error');
    }

    success(message) {
        this.log(message, 'success');
    }

    clear() {
        this.logElement.innerHTML = '';
    }
}

module.exports = Logger;
