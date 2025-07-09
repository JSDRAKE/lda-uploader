export class ConfigManager {
    constructor() {
        this.form = document.getElementById('settingsForm') || document.createElement('form');
        // Campos del formulario que se envían al guardar
        this.fields = ['username', 'password', 'callsign'];
        // Campos de configuración adicionales (checkboxes)
        this.configFields = ['startMinimized', 'startInTray', 'sidebarCollapsed'];
        this.isSaving = false;
        this.saveDebounceTimeout = null;
        this.lastSavedConfig = null;
        this.initialLoadComplete = false;
        this.initialize();
    }

    async initialize() {
        this.bindEvents();
        await this.loadConfig();
    }

    bindEvents() {
        // Usar { once: true } para evitar múltiples manejadores
        this.form.removeEventListener('submit', this.handleFormSubmit);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.form.addEventListener('submit', this.handleFormSubmit);
    }
    
    async handleFormSubmit(e) {
        e.preventDefault();
        
        // Recolectar los datos del formulario
        const formData = {};
        
        // Obtener valores de los campos de texto
        this.fields.forEach(field => {
            const input = document.getElementById(field);
            if (input) {
                // No actualizar la contraseña si es un marcador de posición
                if (field === 'password' && input.value === '********') {
                    return;
                }
                formData[field] = field === 'callsign' 
                    ? input.value.trim().toUpperCase() 
                    : input.value.trim();
            }
        });
        
        // Obtener valores de los checkboxes
        this.configFields.forEach(field => {
            const input = document.getElementById(field);
            if (input) {
                formData[field] = input.checked;
            }
        });
        
        console.log('Guardando configuración del formulario:', formData);
        
        // Usar requestAnimationFrame para evitar bloqueos de la interfaz
        requestAnimationFrame(async () => {
            const success = await this.saveConfig(formData);
            if (success) {
                this.showTemporaryMessage('Configuración guardada correctamente', 'success');
            }
        });
    }

    // Obtener la configuración actual
    async getConfig() {
        try {
            return await window.electron.loadConfig() || {};
        } catch (error) {
            console.error('Error al cargar la configuración:', error);
            return {};
        }
    }

    async loadConfig() {
        try {
            const config = await window.electron.loadConfig();
            if (config) {
                console.log('Loading config:', JSON.stringify(config, null, 2));
                
                // Cargar campos del formulario
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

                // Cargar configuración de checkboxes
                this.configFields.forEach(field => {
                    const input = document.getElementById(field);
                    if (input) {
                        input.checked = !!config[field];
                        console.log(`Setting ${field} to ${input.checked}`);
                    }
                });

                // Guardar el estado inicial
                if (!this.initialLoadComplete) {
                    this.lastSavedConfig = { ...config };
                    this.initialLoadComplete = true;
                    console.log('Initial config loaded and saved');
                }

                return config;
            }
        } catch (error) {
            console.error('Error loading config:', error);
            throw error;
        }
    }

    async saveConfig(partialConfig = null) {
        // Si no hay configuración parcial, no hacer nada
        if (!partialConfig || typeof partialConfig !== 'object' || Object.keys(partialConfig).length === 0) {
            console.log('No se proporcionó configuración para guardar');
            return false;
        }

        // Si ya se está guardando, rechazar la operación actual
        if (this.isSaving) {
            console.log('Ya hay un guardado en proceso, ignorando...');
            return false;
        }

        this.isSaving = true;
        console.log('=== INICIO save-config ===');
        console.log('Nueva configuración recibida:', { 
            ...partialConfig, 
            password: partialConfig.password ? '***' : 'empty' 
        });
        
        // Deshabilitar el botón de guardado y mostrar indicador de carga
        const saveButton = document.getElementById('saveSettings');
        const buttonText = saveButton?.querySelector('.btn-text');
        const buttonLoading = saveButton?.querySelector('.btn-loading');
        const originalText = buttonText?.textContent || 'Guardar';
        
        if (saveButton) {
            saveButton.disabled = true;
            if (buttonText) buttonText.textContent = 'Guardando...';
            if (buttonLoading) buttonLoading.style.display = 'inline-block';
        }

        try {
            // Cargar la configuración actual
            const currentConfig = await this.getConfig();
            const configToSave = { ...currentConfig };
            let hasChanges = false;
            
            // Aplicar los cambios de la configuración parcial
            Object.entries(partialConfig).forEach(([key, value]) => {
                // Si es la contraseña y es el marcador de posición, mantener la contraseña actual
                if (key === 'password' && value === '********') {
                    console.log('Manteniendo contraseña actual (se recibió marcador de posición)');
                    return;
                }
                
                // Verificar si el valor ha cambiado
                if (JSON.stringify(configToSave[key]) !== JSON.stringify(value)) {
                    console.log(`Actualizando ${key}:`, key === 'password' ? '***' : value);
                    configToSave[key] = value;
                    hasChanges = true;
                }
            });
            
            if (!hasChanges) {
                console.log('No hay cambios para guardar');
                this.showTemporaryMessage('No hay cambios para guardar', 'info');
                return true;
            }
            
            console.log('Guardando configuración en disco...');
            
            // Guardar la configuración actualizada
            const success = await window.electron.saveConfig(configToSave);
            
            if (success) {
                console.log('Configuración guardada exitosamente');
                // Actualizar la configuración en memoria
                this.lastSavedConfig = { ...configToSave };
                // Mostrar notificación de éxito
                this.showTemporaryMessage('Configuración guardada correctamente', 'success');
            } else {
                console.error('Error al guardar la configuración');
                this.showTemporaryMessage('Error al guardar la configuración', 'error');
            }
            
            console.log('=== FIN save-config ===');
            return success;
        } catch (error) {
            console.error('Error en saveConfig:', error);
            this.showTemporaryMessage('Error al guardar la configuración: ' + error.message, 'error');
            return false;
        } finally {
            this.isSaving = false;
            
            // Restaurar el botón de guardado
            const saveButton = document.getElementById('saveSettings');
            const buttonText = saveButton?.querySelector('.btn-text');
            const buttonLoading = saveButton?.querySelector('.btn-loading');
            const originalText = buttonText?.textContent || 'Guardar';
            
            if (saveButton) {
                saveButton.disabled = false;
                if (buttonText) buttonText.textContent = originalText;
                if (buttonLoading) buttonLoading.style.display = 'none';
            }
        }
    }

    showTemporaryMessage(message, type = 'info') {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status ${type}`;
            
            // Ocultar el mensaje después de 5 segundos
            if (type !== 'error') {
                clearTimeout(this.statusTimeout);
                this.statusTimeout = setTimeout(() => {
                    statusElement.textContent = '';
                    statusElement.className = 'status';
                }, 5000);
            }
        }
    }

    showStatus(message, type = 'info') {
        this.showTemporaryMessage(message, type);
    }
}


