import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;

function createWindow() {
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

app.whenReady().then(createWindow);

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
