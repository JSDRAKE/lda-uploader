class ConfigManager {
    constructor() {
        this.form = document.getElementById('settingsForm') || document.createElement('form');
        this.fields = ['username', 'password', 'callsign'];
        this.isSaving = false;
        this.initialize();
    }

    async initialize() {
        this.bindEvents();
        await this.loadConfig();
    }

    bindEvents() {
        this.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveConfig();
        });
    }

    async loadConfig() {
        try {
            const config = await window.electron.loadConfig();
            if (config) {
                this.fields.forEach(field => {
                    const input = document.getElementById(field);
                    if (input) {
                        input.value = config[field] || '';
                        // Ocultar contraseñas reales
                        if (field === 'password' && config[field]) {
                            input.value = '********';
                        }
                    }
                });
                return config;
            }
        } catch (error) {
            console.error('Error loading config:', error);
            throw error;
        }
    }

    async saveConfig() {
        if (this.isSaving) return;
        
        this.isSaving = true;
        const saveButton = document.getElementById('saveSettings');
        const originalText = saveButton.textContent;
        
        try {
            saveButton.disabled = true;
            saveButton.innerHTML = 'Guardando... <span class="loading"></span>';
            
            const config = {};
            this.fields.forEach(field => {
                const input = document.getElementById(field);
                if (input) {
                    // No actualizar la contraseña si es un marcador de posición
                    if (field === 'password' && input.value === '********') {
                        return;
                    }
                    config[field] = field === 'callsign' 
                        ? input.value.trim().toUpperCase() 
                        : input.value.trim();
                }
            });

            await window.electron.saveConfig(config);
            
            // Actualizar el marcador de posición de la contraseña
            if (config.password) {
                document.getElementById('password').value = '********';
            }
            
            this.showStatus('Configuración guardada correctamente', 'success');
        } catch (error) {
            console.error('Error saving config:', error);
            this.showStatus(`Error al guardar: ${error.message}`, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = originalText;
            this.isSaving = false;
        }
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status ${type}`;
        }
    }
}

module.exports = ConfigManager;
