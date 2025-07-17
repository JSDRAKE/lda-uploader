import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import dgram from 'dgram';
import LdaService from './lda-service.js';

// Función para leer el package.json
function getPackageInfoSync() {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageData = readFileSync(packagePath, 'utf8');
    return JSON.parse(packageData);
  } catch (error) {
    console.error('Error al leer el package.json:', error);
    return {
      name: 'LdA Uploader',
      version: '1.0.0',
      description: 'Aplicación para subir automáticamente QSO a LdA',
      author: 'JSDRAKE - LU9WT',
      homepage: 'https://lu9wt.jsdrake.com.ar',
      email: 'lu9wt@jsdrake.com.ar',
      license: 'MIT'
    };
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let udpServer = null;
let currentPort = null;

// Configuración de LdA
let ldaConfig = {
  user: '',
  password: '',
  myCall: ''
};

// Configuración de perfiles por software
const SOFTWARE_PROFILES = {
  log4om: {
    port: 2233,
    name: 'Log4OM',
    parser: 'adif',
    // Configuración específica para Log4OM
    config: {
      // Puedes agregar configuraciones específicas aquí
    }
  },
  wsjtx: {
    port: 2333,
    name: 'WSJT-X/JTDX',
    parser: 'wsjtx',
    // Configuración específica para WSJT-X/JTDX
    config: {
      defaultMode: 'FT8',  // Modo por defecto si no se especifica
      defaultRST: '+00',  // RST por defecto para modos digitales
      requireGrid: true   // Requiere cuadrícula para WSJT-X
    }
  },
  n1mm: {
    port: 12060,
    name: 'N1MM+',
    parser: 'adif',
    config: {}
  }
};

// Mapa de puertos por software (para compatibilidad)
const SOFTWARE_PORTS = {};
Object.entries(SOFTWARE_PROFILES).forEach(([key, value]) => {
  SOFTWARE_PORTS[key] = value.port;
});

// Inicializar servicio LdA
let ldaService = new LdaService(ldaConfig);

// Función para iniciar el servidor UDP
function startUdpServer(port) {
  // Cerrar el servidor anterior si existe
  if (udpServer) {
    udpServer.close();
  }

  // Crear nuevo servidor UDP
  udpServer = dgram.createSocket('udp4');
  
  udpServer.on('error', (err) => {
    console.error(`Error en servidor UDP: ${err.stack}`);
    if (mainWindow) {
      mainWindow.webContents.send('udp-error', err.message);
    }
  });

  udpServer.on('message', async (message, rinfo) => {
    // Asegurarse de que el mensaje sea una cadena
    const msgString = Buffer.isBuffer(message) ? message.toString() : String(message);
    
    if (typeof msgString !== 'string') {
      console.error('Error: El mensaje recibido no es un string válido:', message);
      return;
    }
    
    console.log(`Mensaje UDP recibido de ${rinfo.address}:${rinfo.port}:`, msgString);
    
    // Determinar el tipo de software basado en el puerto
    let softwareType = 'log4om'; // Por defecto
    for (const [type, profile] of Object.entries(SOFTWARE_PROFILES)) {
      if (profile.port === rinfo.port) {
        softwareType = type;
        break;
      }
    }
    
    console.log(`Procesando mensaje como ${SOFTWARE_PROFILES[softwareType].name}`);
    
    // Enviar mensaje al renderer
    if (mainWindow) {
      mainWindow.webContents.send('udp-message', { 
        message: msgString,
        address: rinfo.address,
        port: rinfo.port,
        processed: false,
        software: SOFTWARE_PROFILES[softwareType].name
      });
    }
    
    try {
      // Cargar configuración actual
      let config;
      try {
        const configData = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(configData);
      } catch (error) {
        console.error('Error al cargar configuración:', error);
        throw new Error('No se pudo cargar la configuración del usuario');
      }
      
      // Actualizar configuración de LdA
      ldaConfig = {
        user: config.username || '',
        password: config.password || '',
        myCall: config.mainCallSign || ''
      };
      
      // Verificar que tengamos los datos necesarios
      if (!ldaConfig.user || !ldaConfig.password || !ldaConfig.myCall) {
        throw new Error('Falta configuración de usuario, contraseña o indicativo principal');
      }
      
      // Actualizar servicio LdA con la nueva configuración
      ldaService = new LdaService(ldaConfig);
      
      // Parsear mensaje según el tipo de software
      const adifData = parseMessage(msgString, softwareType);
      
      if (!adifData) {
        console.warn('No se pudo procesar el mensaje');
        return;
      }
      
      // Enviar a LdA
      const result = await ldaService.sendQso(adifData);
      
      // Notificar al renderer
      if (mainWindow) {
        if (result.success) {
          mainWindow.webContents.send('udp-message', {
            message,
            address: rinfo.address,
            port: rinfo.port,
            processed: true,
            timestamp: new Date().toISOString(),
            status: 'success',
            details: result.message
          });
          
          mainWindow.webContents.send('lda-status', {
            success: true,
            message: 'QSO enviado a LdA correctamente',
            data: result
          });
        } else {
          console.error('Error al enviar QSO a LdA:', result.error || result.message);
          
          mainWindow.webContents.send('udp-message', {
            message,
            address: rinfo.address,
            port: rinfo.port,
            processed: false,
            timestamp: new Date().toISOString(),
            status: 'error',
            error: result.message || 'Error desconocido al enviar a LdA',
            details: result.error ? JSON.stringify(result.error, null, 2) : ''
          });
          
          mainWindow.webContents.send('lda-error', {
            success: false,
            message: result.message || 'Error al enviar QSO a LdA',
            error: result.error,
            data: adifData
          });
        }
      }
    } catch (error) {
      console.error('Error al procesar mensaje UDP:', error);
      if (mainWindow) {
        mainWindow.webContents.send('lda-error', {
          success: false,
          message: error.message,
          error: error.toString()
        });
      }
    }
  });
  
  // Función para parsear mensaje según el formato del software
  function parseMessage(message, softwareType = 'log4om') {
    try {
      const profile = SOFTWARE_PROFILES[softwareType] || SOFTWARE_PROFILES.log4om;
      
      if (profile.parser === 'wsjtx') {
        // Parser para WSJT-X/JTDX
        const result = {};
        
        // Extraer campos en formato <field:length>value
        const fields = {};
        const regex = /<([^:>]+):(\d+)>([^<]*)/g;
        let match;
        
        while ((match = regex.exec(message)) !== null) {
          const field = match[1].toLowerCase();
          const value = match[3];
          fields[field] = value;
        }
        
        // Mapear campos al formato estándar
        if (!fields.call) {
          console.warn('Mensaje sin indicativo de llamada');
          return null;
        }
        
        // Obtener modo o usar el predeterminado
        let mode = fields.mode || profile.config.defaultMode || 'FT8';
        
        // Si el modo está en minúsculas, convertirlo a mayúsculas
        if (mode && mode === mode.toLowerCase()) {
          mode = mode.toUpperCase();
        }
        
        result.call = fields.call.trim();
        result.band = fields.band || '';
        result.mode = mode;
        result.date = fields.qso_date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
        result.time = fields.time_on || '';
        result.rst = fields.rst_sent || fields.rst_rcvd || profile.config.defaultRST || '599';
        result.message = fields.comment || '';
        
        return result;
      } else {
        // Función para parsear mensaje ADIF
        function parseAdifMessage(message) {
          const result = {};
          
          // Extraer CALL
          const callMatch = message.match(/<CALL:(\d+)>([^<]+)/i);
          if (callMatch) {
            result.call = callMatch[2].trim();
          }
          
          // Extraer STATION_CALLSIGN (Log4OM) o station_callsign (WSJT-X/JTDX)
          const stationCallMatch = message.match(/<(STATION_CALLSIGN|station_callsign):(\d+)>([^<]+)/i);
          if (stationCallMatch) {
            result.stationCallsign = stationCallMatch[3].trim();
          }
          
          // Extraer BAND
          const bandMatch = message.match(/<BAND:(\d+)>([^<]+)/i);
          if (bandMatch) {
            result.band = bandMatch[2].trim();
          }
          
          // Extraer MODE
          const modeMatch = message.match(/<MODE:(\d+)>([^<]+)/i);
          if (modeMatch) {
            result.mode = modeMatch[2].trim();
          }
          
          // Extraer QSO_DATE
          const dateMatch = message.match(/<QSO_DATE:(\d+)>([^<]+)/i) || 
                           message.match(/<QSO_DATE_OFF:(\d+)>([^<]+)/i);
          if (dateMatch) {
            result.date = dateMatch[2].trim();
          }
          
          // Extraer TIME_ON
          const timeMatch = message.match(/<TIME_ON:(\d+)>([^<]+)/i) || 
                           message.match(/<TIME_OFF:(\d+)>([^<]+)/i);
          if (timeMatch) {
            result.time = timeMatch[2].trim();
          }
          
          // Extraer RST_SENT o RST_RCVD
          const rstMatch = message.match(/<RST_SENT:(\d+)>([^<]+)/i) || 
                          message.match(/<RST_RCVD:(\d+)>([^<]+)/i);
          if (rstMatch) {
            result.rst = rstMatch[2].trim();
          }
          
          // Extraer COMMENT si existe
          const commentMatch = message.match(/<COMMENT:(\d+)>([^<]*)/i);
          if (commentMatch) {
            result.message = commentMatch[2].trim();
          }
          
          // Verificar que tengamos los campos requeridos
          if (!result.call || !result.band || !result.mode || !result.date || !result.time) {
            console.warn('Mensaje ADIF incompleto, faltan campos requeridos');
            return null;
          }
          
          return result;
        }
        
        const qsoData = parseAdifMessage(message);
        if (qsoData) {
          return qsoData;
        }
      }
    } catch (error) {
      console.error('Error al parsear mensaje:', error);
      return null;
    }
  }

  udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`Servidor UDP escuchando en ${address.address}:${address.port}`);
    currentPort = address.port;
    
    if (mainWindow) {
      mainWindow.webContents.send('udp-started', { port: address.port });
    }
  });

  udpServer.bind(port);
  return udpServer;
}

// Iniciar con el puerto por defecto (Log4OM)
startUdpServer(SOFTWARE_PORTS.log4om);

async function createWindow() {
  const isDev = process.argv.includes('--dev');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // No mostrar la ventana hasta que esté lista
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, '../preload/preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      webgl: false,
      webviewTag: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      enableRemoteModule: false,
      spellcheck: false,
      nativeWindowOpen: true,
      // Configuración adicional de seguridad
      safeDialogs: true,
      disableBlinkFeatures: 'Auxclick',
      enableWebSQL: false,
      autoplayPolicy: 'document-user-activation',
      disableHtmlFullscreenWindowResize: true
    },
  });
  
  // Cuando la aplicación esté lista
  await app.whenReady();

  // Exponer información de la aplicación al proceso de renderizado
  ipcMain.handle('get-app-info', () => {
    return getPackageInfoSync();
  });

  // Mostrar la ventana cuando esté lista
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  // Configurar CSP para permitir recursos necesarios
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com`,
    "img-src 'self' data: https://cdnjs.cloudflare.com",
    "font-src 'self' https://cdnjs.cloudflare.com",
    "connect-src 'self'"
  ].join('; ');

  // Aplicar CSP a todas las respuestas
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = {
      ...details.responseHeaders,
      'Content-Security-Policy': [csp]
    };
    
    // Asegurarse de que el encabezado de CSP se establezca correctamente
    if (details.url.startsWith('file://')) {
      callback({
        responseHeaders: responseHeaders
      });
    } else {
      callback({ responseHeaders });
    }
  });

  // Configurar cabeceras de seguridad adicionales
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['X-Content-Type-Options'] = 'nosniff';
    details.requestHeaders['X-Frame-Options'] = 'SAMEORIGIN';
    details.requestHeaders['X-XSS-Protection'] = '1; mode=block';
    details.requestHeaders['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    callback({ requestHeaders: details.requestHeaders });
  });

  // Cargar el archivo HTML principal
  mainWindow.loadFile('src/renderer/index.html');

  // Abrir las herramientas de desarrollo en modo desarrollo
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Configuración de rutas
const userDataPath = app.getPath('userData');
const configDir = path.join(userDataPath, 'config');
const configPath = path.join(configDir, 'config.json');

// Cargar configuración desde archivo
async function loadConfig() {
  try {
    if (existsSync(configPath)) {
      const data = await fs.readFile(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error al cargar la configuración:', error);
  }
  return null;
}

// Guardar configuración en archivo
async function saveConfig(config) {
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error al guardar la configuración:', error);
    return false;
  }
}

// Manejador para abrir enlaces externos
ipcMain.handle('open-external', async (event, url) => {
  try {
    const { shell } = await import('electron');
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error al abrir enlace externo:', error);
    return { success: false, error: error.message };
  }
});

// Manejadores IPC para LdA
ipcMain.handle('get-lda-config', async () => {
  try {
    const config = await loadConfig();
    if (config) {
      // Actualizar la configuración en memoria
      ldaConfig = {
        user: config.username || '',
        password: config.password || '',
        myCall: config.mainCallSign || ''
      };
      ldaService = new LdaService(ldaConfig);
      return config;
    }
    return null;
  } catch (error) {
    console.error('Error al obtener configuración LdA:', error);
    throw error;
  }
});

ipcMain.handle('update-lda-config', async (event, newConfig) => {
  try {
    const saved = await saveConfig(newConfig);
    if (saved) {
      // Actualizar la configuración en memoria
      ldaConfig = {
        user: newConfig.username || '',
        password: newConfig.password || '',
        myCall: newConfig.mainCallSign || ''
      };
      ldaService = new LdaService(ldaConfig);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error al actualizar configuración LdA:', error);
    throw error;
  }
});

// Asegurarse de que el directorio de configuración exista
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

// Manejadores de IPC para la configuración
ipcMain.handle('config:save', async (event, config) => {
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    console.error('Error al guardar la configuración:', error);
    throw error;
  }
});

ipcMain.handle('config:load', async () => {
  try {
    if (!existsSync(configPath)) {
      return null;
    }
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error al cargar la configuración:', error);
    throw error;
  }
});

ipcMain.on('config:getPath', (event) => {
  event.returnValue = configPath;
});

// Manejador para cambiar el puerto según el software seleccionado
ipcMain.on('change-software', (event, software) => {
  const port = SOFTWARE_PORTS[software];
  if (port && port !== currentPort) {
    console.log(`Cambiando a puerto ${port} para ${software}`);
    startUdpServer(port);
  }
});

// Manejador para obtener la configuración actual de LdA
// (Manejador ya definido anteriormente)

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
