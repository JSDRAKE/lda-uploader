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
      'file:upload',
      'log:debug',
      'log:error',
      'log:info',
      'window:minimize',
      'window:maximize',
      'window:close'
    ],
    // Canales de recepción (main -> renderer)
    RECEIVE: [
      'config:loaded',
      'file:upload:progress',
      'file:upload:complete',
      'file:upload:error'
    ]
  };

  // Validar canales IPC
  function isValidChannel(type, channel) {
    return ALLOWED_IPC_CHANNELS[type] && ALLOWED_IPC_CHANNELS[type].includes(channel);
  }

  // Exponer API segura al renderer
  try {
    contextBridge.exposeInMainWorld('electron', {
      // Enviar mensajes al proceso principal
      send: (channel, data) => {
        if (isValidChannel('SEND', channel)) {
          ipcRenderer.send(channel, data);
        } else {
          console.warn(`[SECURITY] Intento de acceso a canal no permitido: ${channel}`);
        }
      },
      
      // Recibir mensajes del proceso principal
      on: (channel, listener) => {
        if (isValidChannel('RECEIVE', channel)) {
          const subscription = (event, ...args) => listener(...args);
          ipcRenderer.on(channel, subscription);
          
          // Devolver función de limpieza
          return () => {
            ipcRenderer.removeListener(channel, subscription);
          };
        } else {
          console.warn(`[SECURITY] Intento de escuchar canal no permitido: ${channel}`);
          return () => {};
        }
      },
      
      // Información del sistema
      platform: process.platform,
      isDev: process.env.NODE_ENV === 'development',
      appVersion: process.env.npm_package_version || '1.0.0'
    });
    
    console.log('[Preload] API de Electron expuesta correctamente');
  } catch (error) {
    console.error('[Preload] Error al exponer la API de Electron:', error);
  }
}
