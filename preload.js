const { contextBridge, ipcRenderer } = require('electron');

// Exponer métodos seguros al renderer
contextBridge.exposeInMainWorld('electron', {
    // Para recibir logs del proceso principal
    onLog: (callback) => ipcRenderer.on('log', callback),
    
    // Para guardar configuración
    saveConfig: async (config) => {
        try {
            console.log('Iniciando guardado de configuración...', config);
            
            // Validar que los campos requeridos estén presentes
            if (!config || typeof config !== 'object') {
                throw new Error('La configuración proporcionada no es válida');
            }
            
            const { username, password, callsign } = config;
            
            if (!username || !callsign) {
                throw new Error('Usuario e indicativo son obligatorios');
            }
            
            // Si la contraseña es el placeholder, no la enviamos
            if (password === '********' || password === '••••••••') {
                delete config.password;
            }
            
            console.log('Enviando configuración al proceso principal...');
            
            // Enviar la configuración al proceso principal para guardar
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Tiempo de espera agotado al guardar la configuración'));
                }, 5000); // 5 segundos de timeout
                
                ipcRenderer.once('config-saved', (event, response) => {
                    clearTimeout(timeout);
                    
                    if (response && response.success) {
                        console.log('Configuración guardada correctamente');
                        resolve(response.config || {});
                    } else {
                        const errorMsg = response?.error || 'Error desconocido al guardar la configuración';
                        console.error('Error al guardar configuración:', errorMsg);
                        reject(new Error(errorMsg));
                    }
                });
                
                ipcRenderer.send('save-config', config);
            });
        } catch (error) {
            console.error('Error en saveConfig:', error);
            throw error;
        }
    },
    
    // Para cargar configuración
    loadConfig: async () => {
        try {
            console.log('Solicitando configuración al proceso principal...');
            const response = await ipcRenderer.invoke('load-config');
            if (response && response.success) {
                console.log('Configuración cargada correctamente');
                return response.config || {};
            } else {
                const errorMsg = response?.error || 'Error desconocido al cargar la configuración';
                console.error('Error al cargar configuración:', errorMsg);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Error en loadConfig:', error);
            throw error; // Propagar el error para manejarlo en el renderer
        }
    },
    
    // Para actualizar la configuración en el proceso principal
    updateConfig: (config) => {
        ipcRenderer.send('update-config', config);
    }
});
