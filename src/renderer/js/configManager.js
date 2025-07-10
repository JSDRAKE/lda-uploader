export class ConfigManager {
    constructor() {
        this.form = document.getElementById('settingsForm') || document.createElement('form');
        // Campos del formulario que se envían al guardar
        this.fields = ['username', 'password', 'callsign', 'software'];
        // Campos de configuración adicionales (checkboxes)
        this.configFields = ['startMinimized', 'startInTray', 'sidebarCollapsed'];
        this.isSaving = false;
        this.saveDebounceTimeout = null;
        this.lastSavedConfig = null;
        this.initialLoadComplete = false;
        this.configChangeListeners = [];
        this.initialize();
    }
    
    // Método para registrar listeners de cambios en la configuración
    onConfigChange(callback) {
        if (typeof callback === 'function') {
            this.configChangeListeners.push(callback);
        }
        return this;
    }
    
    // Método para notificar a los listeners sobre cambios en la configuración
    notifyConfigChange(config) {
        this.configChangeListeners.forEach(callback => {
            try {
                callback(config);
            } catch (error) {
                console.error('Error en el listener de cambio de configuración:', error);
            }
        });
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

    // Cache para la configuración
    _configCache = null;
    _configLoadPromise = null;

    // Cargar configuración desde el main process
    async _loadConfigInternal() {
        if (this._configLoadPromise) {
            return this._configLoadPromise;
        }

        this._configLoadPromise = (async () => {
            try {
                const config = await window.electron.loadConfig();
                if (config) {
                    this._configCache = { ...config };
                    console.log('Configuración cargada en el renderer');
                }
                return this._configCache || {};
            } catch (error) {
                console.error('Error al cargar la configuración:', error);
                return {};
            } finally {
                this._configLoadPromise = null;
            }
        })();

        return this._configLoadPromise;
    }

    // Invalidar caché de configuración
    invalidateConfigCache() {
        this._configCache = null;
    }

    async loadConfig() {
        try {
            // Usar caché si está disponible
            if (this._configCache) {
                return this._configCache;
            }

            const config = await this._loadConfigInternal();
            
            // Actualizar la UI solo si estamos en el contexto del navegador
            if (typeof document !== 'undefined') {
                // Cargar campos del formulario
                this.fields.forEach(field => {
                    const input = document.getElementById(field);
                    if (input) {
                        if (field === 'password' && config[field]) {
                            // Ocultar contraseñas reales
                            input.value = '********';
                        } else if (field === 'software') {
                            // Establecer el valor seleccionado en el dropdown
                            input.value = config[field] || 'log4om';
                        } else {
                            input.value = config[field] || '';
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
            const message = 'No se proporcionó configuración para guardar';
            console.log(message);
            this.showNotification(message, 'warning');
            return false;
        }

        // Si ya se está guardando, rechazar la operación actual
        if (this.isSaving) {
            const message = 'Ya hay un guardado en proceso, por favor espere...';
            console.log(message);
            this.showNotification(message, 'info');
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
                const message = 'No se detectaron cambios para guardar';
                console.log(message);
                this.showNotification(message, 'info');
                return true;
            }
            
            console.log('Guardando configuración en disco...');
            this.showNotification('Guardando configuración...', 'info', 2000);
            
            try {
                // Notificar al proceso principal que guarde la configuración
                const success = await window.electron.saveConfig(configToSave);
                
                if (success) {
                    const message = 'Configuración guardada correctamente';
                    console.log(message);
                    this.showNotification(message, 'success');
                    this.lastSavedConfig = { ...configToSave };
                    // Notificar a los listeners sobre el cambio de configuración
                    this.notifyConfigChange(configToSave);
                    return true;
                } else {
                    throw new Error('No se pudo guardar la configuración');
                }
            } catch (error) {
                const errorMessage = `Error al guardar: ${error.message || 'Error desconocido'}`;
                console.error(errorMessage, error);
                this.showNotification(errorMessage, 'error', 10000);
                throw error;
            }
        } catch (error) {
            console.error('Error en saveConfig:', error);
            this.showTemporaryMessage('Error al guardar la configuración: ' + error.message, 'error');
            return false;
        } finally {
            this.isSaving = false;
            
            // Restaurar el botón de guardado
            const saveButton = document.getElementById('saveSettings');
            if (saveButton) {
                saveButton.disabled = false;
                const buttonText = saveButton.querySelector('.btn-text');
                const buttonLoading = saveButton.querySelector('.btn-loading');
                
                if (buttonText) buttonText.textContent = 'Guardar';
                if (buttonLoading) buttonLoading.style.display = 'none';
            }
            
            if (saveButton) {
                saveButton.disabled = false;
                if (buttonText) buttonText.textContent = originalText;
                if (buttonLoading) buttonLoading.style.display = 'none';
            }
        }
    }

    // Mostrar notificación al usuario
    showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notification-container');
        if (!container) return;
        
        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Agregar la notificación al contenedor
        container.appendChild(notification);
        
        // Forzar reflow para activar la animación
        void notification.offsetWidth;
        
        // Mostrar la notificación
        notification.classList.add('show');
        
        // Configurar tiempo de duración
        setTimeout(() => {
            notification.classList.remove('show');
            
            // Eliminar la notificación después de la animación
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }
    
    // Mostrar mensaje temporal (compatibilidad hacia atrás)
    showTemporaryMessage(message, type = 'info') {
        this.showNotification(message, type, 5000);
    }

    showStatus(message, type = 'info') {
        this.showTemporaryMessage(message, type);
    }
}


