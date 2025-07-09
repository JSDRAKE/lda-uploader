const { contextBridge, ipcRenderer } = require('electron');

// Exponer métodos seguros al renderer
contextBridge.exposeInMainWorld('electron', {
    // Para recibir logs del proceso principal
    onLog: (callback) => ipcRenderer.on('log', callback),
    
    // Para guardar configuración
    saveConfig: (config) => {
        // Validar que los campos requeridos estén presentes
        if (!config.username || !config.password || !config.callsign) {
            throw new Error('Todos los campos son requeridos');
        }
        
        // Guardar en localStorage
        localStorage.setItem('ldaConfig', JSON.stringify(config));
        
        // Enviar la configuración actualizada al proceso principal
        ipcRenderer.send('update-config', config);
        
        return true;
    },
    
    // Para cargar configuración
    loadConfig: () => {
        const config = JSON.parse(localStorage.getItem('ldaConfig') || '{}');
        
        // Si hay configuración guardada, enviarla al proceso principal
        if (config.username && config.password && config.callsign) {
            ipcRenderer.send('update-config', config);
        }
        
        return config;
    },
    
    // Para actualizar la configuración en el proceso principal
    updateConfig: (config) => {
        ipcRenderer.send('update-config', config);
    }
});
