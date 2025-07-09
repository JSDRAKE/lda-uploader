export class ConfigManager {
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
        console.log('Iniciando guardado de configuración...');
        if (this.isSaving) {
            console.log('Ya hay un guardado en proceso, ignorando...');
            return;
        }
        
        this.isSaving = true;
        const saveButton = document.getElementById('saveSettings');
        const originalText = saveButton.textContent;
        
        try {
            console.log('Deshabilitando botón de guardado...');
            saveButton.disabled = true;
            saveButton.innerHTML = 'Guardando... <span class="loading"></span>';
            
            const config = {};
            console.log('Recopilando datos del formulario...');
            this.fields.forEach(field => {
                const input = document.getElementById(field);
                if (input) {
                    console.log(`Campo ${field}:`, input.value);
                    // No actualizar la contraseña si es un marcador de posición
                    if (field === 'password' && input.value === '********') {
                        console.log('Ignorando contraseña sin cambios...');
                        return;
                    }
                    config[field] = field === 'callsign' 
                        ? input.value.trim().toUpperCase() 
                        : input.value.trim();
                }
            });

            console.log('Enviando configuración al proceso principal:', config);
            try {
                console.log('Enviando configuración al proceso principal...');
                const result = await window.electron.saveConfig(config);
                console.log('Respuesta del proceso principal recibida:', JSON.stringify(result, null, 2));
                
                // Verificar si la respuesta es un string (lo cual no debería pasar)
                if (typeof result === 'string') {
                    console.error('La respuesta del proceso principal es un string en lugar de un objeto');
                    this.showStatus('Error: Respuesta del servidor en formato incorrecto', 'error');
                    return false;
                }

                // Verificar si result es un objeto y tiene la propiedad success
                if (result && typeof result === 'object' && result.success === true) {
                    console.log('Configuración guardada exitosamente');
                    // Actualizar el marcador de posición de la contraseña
                    if (config.password) {
                        document.getElementById('password').value = '********';
                    }
                    // Usar el mensaje de la respuesta o uno por defecto
                    const successMessage = result.message || 'Configuración guardada correctamente';
                    this.showStatus(successMessage, 'success');
                    return true;
                } else {
                    // Si result es undefined, null, no tiene success, o success es false
                    const errorMsg = (result && result.error) || 'Error desconocido al guardar la configuración';
                    console.error('Error al guardar configuración:', errorMsg);
                    this.showStatus(`Error: ${errorMsg}`, 'error');
                    return false;
                }
            } catch (error) {
                console.error('Error en la comunicación con el proceso principal:', error);
                const errorMessage = error.message || 'Error al comunicarse con el proceso principal';
                this.showStatus(`Error: ${errorMessage}`, 'error');
                return false;
            }
        } catch (error) {
            console.error('Error en saveConfig:', error);
            this.showStatus(`Error al guardar: ${error.message}`, 'error');
        } finally {
            console.log('Restaurando estado del botón de guardado');
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


