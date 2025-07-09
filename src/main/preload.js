const { contextBridge, ipcRenderer } = require('electron');

// Exponer métodos seguros al renderer
contextBridge.exposeInMainWorld('electron', {
    // Para recibir logs del proceso principal
    onLog: (callback) => {
        // Verificar que el callback sea una función
        if (typeof callback !== 'function') {
            console.warn('Se intentó registrar un manejador de log que no es una función');
            return () => {};
        }

        // Usar una función envolvente para asegurar que el contexto sea correcto
        const wrappedCallback = (event, message) => {
            try {
                // Validar que el mensaje no sea vacío, null o undefined
                if (message === undefined || message === null || message === '') {
                    console.log('Mensaje de log vacío recibido en preload, ignorando...');
                    return;
                }
                callback(message);
            } catch (error) {
                console.error('Error en el callback de onLog:', error);
            }
        };
        
        // Registrar el manejador de eventos
        ipcRenderer.on('log', wrappedCallback);
        
        // Devolver una función para eliminar el listener cuando sea necesario
        return () => {
            ipcRenderer.removeListener('log', wrappedCallback);
        };
    },
    
    // Para guardar configuración
    saveConfig: async (config) => {
        try {
            console.log('Iniciando guardado de configuración...');
            
            // Validar que los campos requeridos estén presentes
            if (!config || typeof config !== 'object') {
                throw new Error('La configuración proporcionada no es válida');
            }
            
            const { username, password, callsign } = config;
            
            if (!username || !callsign) {
                throw new Error('Usuario e indicativo son obligatorios');
            }
            
            // Si la contraseña es el placeholder, no la enviamos
            if (password === '********' || password === '••••••••' || password === '') {
                console.log('Contraseña no modificada, manteniendo la existente');
                delete config.password;
            }
            
            console.log('Enviando configuración al proceso principal...');
            
            // Enviar la configuración al proceso principal para guardar
            console.log('Enviando configuración al proceso principal...');
            const response = await ipcRenderer.invoke('save-config', config);
            
            console.log('Respuesta del proceso principal en preload:', JSON.stringify(response, null, 2));
            
            if (!response) {
                throw new Error('No se recibió respuesta del proceso principal');
            }
            
            if (response.success) {
                console.log('Configuración guardada correctamente');
                // Devolver la respuesta completa, no solo config
                return response;
            } else {
                const errorMsg = response.error || 'Error desconocido al guardar la configuración';
                console.error('Error al guardar configuración:', errorMsg);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Error en saveConfig:', error);
            throw error;
        }
    },
    
    // Para cargar configuración
    loadConfig: async () => {
        try {
            console.log('Solicitando configuración...');
            const config = await ipcRenderer.invoke('load-config');
            console.log('Configuración cargada:', config);
            return config;
        } catch (error) {
            console.error('Error al cargar configuración:', error);
            throw error;
        }
    },
    
    // Para actualizar la configuración en el proceso principal
    updateConfig: (config) => {
        ipcRenderer.send('update-config', config);
    }
});
