const { contextBridge, ipcRenderer } = require('electron');

/**
 * Canales IPC permitidos para la comunicación segura entre procesos.
 * @type {Object}
 * @property {string[]} SEND - Canales permitidos para enviar mensajes al proceso principal.
 * @property {string[]} RECEIVE - Canales permitidos para recibir mensajes del proceso principal.
 */
const ALLOWED_IPC_CHANNELS = {
  SEND: ['toMain'],
  RECEIVE: ['fromMain']
};

/**
 * Verifica si un canal está en la lista de canales permitidos.
 * @param {string} channel - Nombre del canal a verificar.
 * @param {string} type - Tipo de operación ('SEND' o 'RECEIVE').
 * @returns {boolean} True si el canal está permitido, false en caso contrario.
 */
function isAllowedChannel(channel, type) {
  if (!ALLOWED_IPC_CHANNELS[type]) {
    console.error(`Tipo de canal no válido: ${type}`);
    return false;
  }
  const allowed = ALLOWED_IPC_CHANNELS[type].includes(channel);
  if (!allowed) {
    console.warn(`Intento de acceso a canal no permitido: ${channel} (${type})`);
  }
  return allowed;
}

// Expone de forma segura las APIs al proceso de renderizado
contextBridge.exposeInMainWorld('electron', {
  /**
   * Envía un mensaje de forma segura al proceso principal.
   * @param {string} channel - Canal por el que se envía el mensaje.
   * @param {any} data - Datos a enviar.
   * @throws {Error} Si el canal no está permitido.
   */
  send: (channel, data) => {
    if (isAllowedChannel(channel, 'SEND')) {
      ipcRenderer.send(channel, data);
    } else {
      throw new Error(`Canal no permitido: ${channel}`);
    }
  },

  /**
   * Recibe mensajes del proceso principal de forma segura.
   * @param {string} channel - Canal por el que se recibe el mensaje.
   * @param {Function} callback - Función a ejecutar cuando se reciba un mensaje.
   * @returns {Function} Función para eliminar el listener.
   * @throws {Error} Si el canal no está permitido.
   */
  receive: (channel, callback) => {
    if (isAllowedChannel(channel, 'RECEIVE')) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      // Devuelve una función para eliminar el listener
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
    throw new Error(`Canal no permitido: ${channel}`);
  },

  /**
   * Invoca un método en el proceso principal y devuelve una promesa con la respuesta.
   * Útil para operaciones asíncronas.
   * @param {string} channel - Canal por el que se envía la petición.
   * @param {any} data - Datos a enviar.
   * @returns {Promise<any>} Promesa que se resuelve con la respuesta.
   */
  invoke: async (channel, data) => {
    if (isAllowedChannel(channel, 'SEND')) {
      try {
        return await ipcRenderer.invoke(channel, data);
      } catch (error) {
        console.error(`Error en la invocación IPC (${channel}):`, error);
        throw error;
      }
    }
    throw new Error(`Canal no permitido: ${channel}`);
  }
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Error no capturado en preload:', error);
});