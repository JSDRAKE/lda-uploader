import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;

function createWindow() {
  const isDev = process.argv.includes('--dev');
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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
      spellcheck: false
    },
  });
  
  // Configurar CSP más estricto
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
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
