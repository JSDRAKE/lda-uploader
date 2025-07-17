// Este archivo se ejecuta en un contexto especial de Electron
// Tiene acceso a Node.js y a las APIs de Electron

// Verificar si estamos en el contexto de Node.js
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

if (isNode) {
  // Cargar módulos de Node.js
  const { contextBridge, ipcRenderer } = require('electron');

  // Canales IPC permitidos para la comunicación segura entre procesos
  const ALLOWED_IPC_CHANNELS = {
    // Canales de envío (renderer -> main)
    SEND: [
      'config:save',
      'config:load',
      'file:upload',
      'log:debug',
      'log:error',
      'log:info',
      'window:minimize',
      'window:maximize',
      'window:close',
      'change-software',
      'udp:change-port',
      'update-lda-config',
      'get-lda-config',
      'get-app-info'
    ],
    // Canales de recepción (main -> renderer)
    RECEIVE: [
      'config:loaded',
      'file:upload:progress',
      'file:upload:complete',
      'file:upload:error',
      'udp-message',
      'udp-error',
      'udp-started',
      'lda-status',
      'lda-error'
    ]
  };

  // Validar canales IPC
  function isValidChannel(type, channel) {
    return ALLOWED_IPC_CHANNELS[type] && ALLOWED_IPC_CHANNELS[type].includes(channel);
  }

  // Exponer API segura al renderer
  try {
    const api = {
      // Invocar métodos en el proceso principal
      invoke: (channel, ...args) => {
        if (isValidChannel('SEND', channel)) {
          return ipcRenderer.invoke(channel, ...args);
        }
        console.warn(`[SECURITY] Intento de invocar canal no permitido: ${channel}`);
        return Promise.reject(new Error(`Invalid channel: ${channel}`));
      },
      
      // Escuchar eventos del proceso principal
      on: (channel, callback) => {
        if (isValidChannel('RECEIVE', channel)) {
          const subscription = (event, ...args) => callback(...args);
          ipcRenderer.on(channel, subscription);
          return () => ipcRenderer.removeListener(channel, subscription);
        }
        console.warn(`[SECURITY] Intento de escuchar canal no permitido: ${channel}`);
        return () => {};
      },
      
      // Métodos específicos para la aplicación
      changeSoftware: (software) => {
        if (isValidChannel('SEND', 'change-software')) {
          ipcRenderer.send('change-software', software);
        }
      },
      
      // Métodos para UDP
      onUdpMessage: (callback) => {
        if (isValidChannel('RECEIVE', 'udp-message')) {
          ipcRenderer.on('udp-message', (event, data) => callback(data));
        }
      },
      
      onUdpError: (callback) => {
        if (isValidChannel('RECEIVE', 'udp-error')) {
          ipcRenderer.on('udp-error', (event, error) => callback(error));
        }
      },
      
      onUdpStarted: (callback) => {
        if (isValidChannel('RECEIVE', 'udp-started')) {
          ipcRenderer.on('udp-started', (event, data) => callback(data));
        }
      },
      
      // Operaciones de configuración
      saveConfig: async (config) => {
        return await ipcRenderer.invoke('config:save', config);
      },
      
      loadConfig: async () => {
        return await ipcRenderer.invoke('config:load');
      },
      
      getConfigPath: () => {
        return ipcRenderer.sendSync('config:getPath');
      },
      
      // Información del sistema
      platform: process.platform,
      isDev: process.env.NODE_ENV === 'development',
      appVersion: process.env.npm_package_version || '1.0.0',
      // Abrir enlace externo en el navegador predeterminado
      openExternal: (url) => ipcRenderer.invoke('open-external', url),
      // Obtener información de la aplicación
      getAppInfo: () => ipcRenderer.invoke('get-app-info'),
      
      // Métodos para LdA
      onLdaStatus: (callback) => {
        if (typeof callback === 'function') {
          ipcRenderer.on('lda-status', (event, ...args) => callback(...args));
        }
      },
      onLdaError: (callback) => {
        if (typeof callback === 'function') {
          ipcRenderer.on('lda-error', (event, ...args) => callback(...args));
        }
      },
      getLdaConfig: () => ipcRenderer.invoke('get-lda-config'),
      updateLdaConfig: (config) => ipcRenderer.invoke('update-lda-config', config)
    };
    
    contextBridge.exposeInMainWorld('electron', api);
    console.log('[Preload] API de Electron expuesta correctamente');
  } catch (error) {
    console.error('[Preload] Error al exponer la API de Electron:', error);
  }
}
