const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const dgram = require('dgram');
const https = require('https');
const config = require('./config');

// Mostrar información de depuración
console.log('Ruta de configuración:', path.join(app.getPath('userData'), 'lda-uploader-config.json'));

// Parser ADIF simple
function parseADIF(adifString) {
    const result = {};
    let remaining = adifString;
    const tagPattern = /<([^>:]+)[^>]*>[\s]*([^<]*)/g;
    let match;

    while ((match = tagPattern.exec(adifString)) !== null) {
        const tagName = match[1].toUpperCase();
        const tagValue = match[2].trim();
        if (tagName === 'EOR' || tagName === 'EOH') {
            break;
        }
        // Extraer el tamaño si está presente (ej: <CALL:6>LU5WSO)
        const sizeMatch = tagName.match(/^([^:]+):(\d+)$/);
        if (sizeMatch) {
            const [, name, size] = sizeMatch;
            result[name] = tagValue.substring(0, parseInt(size, 10));
        } else {
            result[tagName] = tagValue;
        }
    }

    return result;
}

let mainWindow;
let tray = null;
let udpServer = null;

// Variable para controlar el cierre de la aplicación
app.isQuitting = false;

// Configurar el evento before-quit
app.on('before-quit', () => {
    app.isQuitting = true;
    
    // Limpiar el ícono de la bandeja al salir
    if (tray) {
        tray.destroy();
    }
    
    // Cerrar todas las ventanas
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
        window.removeAllListeners('close');
        window.close();
    });
});

// Crear ventana principal
function createWindow() {
    // Crear la ventana del navegador
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false // No mostrar la ventana inmediatamente
    });

    // Cargar el archivo HTML
    mainWindow.loadFile('index.html');

    try {
        let trayIcon = null;
        const { nativeImage } = require('electron');
        
        // Primero intentar cargar el ícono del directorio de assets
        try {
            const iconPath = path.join(__dirname, 'assets', 'icon.png');
            if (require('fs').existsSync(iconPath)) {
                trayIcon = nativeImage.createFromPath(iconPath);
                console.log('Ícono cargado desde:', iconPath);
            } else {
                console.warn('No se encontró el archivo de ícono en:', iconPath);
            }
        } catch (iconError) {
            console.warn('Error al cargar el ícono personalizado:', iconError.message);
        }
        
        // Si no se pudo cargar el ícono, crear uno simple programáticamente
        if (!trayIcon || trayIcon.isEmpty()) {
            console.log('Creando ícono simple programáticamente');
            trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVFiF7Zc/aBxVGMZ/33szu7PZbDa7m2w2m2x2s9lsNv9qNtlsNpvd7GY3u9lsNpvd7GY3u9nNbnaTzWaz2Ww2m81ms9lsNpvNZrPZbDabzWaz2Ww2m81ms9lsNpvNZrPZbDabzWaz2Ww2m81ms9lsNpvNZrPZbDabzWaz2Wz/B1JKJYQ4D1wCzgJngA6gA1gFloGfgO+llIeN5jZqQEqpgLvAHSHEOeA7YF5K+W2jBf4NQogO4CbwFfA1cFMI8U2j+Ro2IKW8CHwBfCqlfFdK+QnwKfC5lPJio7kbMSCEeA/4GHgvpXzr5PpN4CPgIyHE+43kb8TA+8BHUspP6i9KKT8GPgQ+aCD3fw4hxHngnJTyq2PufwmcFUKcayR/vXgXePqU+08BTzSSvF4Dl4DvT7n/PfB0vcnrNXAG2D7l/hbQWW/yeg3sA72n3O8B9upNXq+BH4FXT7n/KvBDvcnrNfA58K4Q4o36i0KIN4B3gM/rTf6fIaXsAL4E3gI+EEJcB14H3pJS3j3p2X8MKeU+8ALwDvA28PxpxdcaqHcQKqV8GXgJeE5K+XWt8aoGpJQvAh8Cz0spv6n1+VoMvA18JqX8ttbCToIQ4gLwBfCclPJ+rc9XNSCEeBZ4R0r5fK0F1oIQ4h7wjpTyu1qfrdmAlPJ+PQXWwzH5a4p6Z4Jt4Gydz9bLWeCwngfrMfA98FwdzzXCDWBBCNFZ64P1GHgIvCGEeKqOZ2tCCPEE8CbwZ63P1mzg5KvzJvCJEOJqPc/WwEfA+1LKvVofrHcQfgLcB24JIR4IIW4JIR4IIW4JIR7U8zJCCPEK8CzwXj3P1z0TSCmvAdeAq8A14BpwVUp5rZ7cQoiXgA+Ba1LK7Xpy1BxSyvtCiHvAZeAe8EBK+UM9uYUQTwJ3gGtSyh/rydFQSCk7gYvAJeAicB7oBrqALWAF+AX4WUq5VpPJ/wA5D1cKxqo1bAAAAABJRU5ErkJggg==');
        }
        
        // Crear el ícono de la bandeja
        tray = new Tray(trayIcon);
        
        const contextMenu = Menu.buildFromTemplate([
            { 
                label: 'Mostrar/Ocultar', 
                click: () => {
                    if (mainWindow.isVisible()) {
                        mainWindow.hide();
                    } else {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                } 
            },
            { 
                label: 'Salir', 
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                } 
            }
        ]);
        
        tray.setToolTip('LdA Uploader');
        tray.setContextMenu(contextMenu);
        
        // Mostrar/ocultar la ventana al hacer clic en el ícono
        tray.on('click', () => {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        });
        
    } catch (error) {
        console.error('Error al configurar el ícono de la bandeja:', error);
        // Si hay un error, continuar sin el ícono de la bandeja
        tray = null;
    }
    
    // Mostrar la ventana principal al inicio
    mainWindow.show();
    
    // Ocultar la ventana en lugar de cerrarla
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
        return true;
    });
}

// Iniciar el servidor UDP
function startUDPServer() {
    try {
        // Cerrar el servidor anterior si existe
        if (udpServer) {
            try {
                udpServer.close();
            } catch (e) {
                console.error('Error al cerrar el servidor anterior:', e);
            }
            udpServer = null;
        }

        // Crear un nuevo servidor UDP
        udpServer = dgram.createSocket('udp4');
        const PORT = 2233;
        
        udpServer.on('error', (err) => {
            const errorMsg = `Error del servidor UDP (${PORT}): ${err.message}`;
            console.error(errorMsg);
            if (mainWindow) {
                mainWindow.webContents.send('log', errorMsg);
            }
            
            // Reintentar después de 5 segundos
            setTimeout(startUDPServer, 5000);
        });

        udpServer.on('message', (msg, rinfo) => {
            try {
                const rawData = msg.toString();
                console.log('[UDP] Datos recibidos de', rinfo.address, ':', rawData.substring(0, 200) + (rawData.length > 200 ? '...' : ''));
                
                if (mainWindow) {
                    mainWindow.webContents.send('log', `[${new Date().toLocaleTimeString()}] Datos recibidos de ${rinfo.address}`);
                }
                
                let qso;
                
                // Intentar parsear como JSON primero
                try {
                    qso = JSON.parse(rawData);
                    console.log('[UDP] QSO parseado como JSON:', JSON.stringify(qso, null, 2));
                } catch (jsonError) {
                    // Si falla, intentar parsear como ADIF
                    try {
                        qso = parseADIF(rawData);
                        console.log('[UDP] QSO parseado como ADIF:', JSON.stringify(qso, null, 2));
                    } catch (adifError) {
                        throw new Error(`No se pudo parsear ni como JSON ni como ADIF: ${adifError.message}`);
                    }
                }
                
                if (mainWindow) {
                    mainWindow.webContents.send('log', `QSO recibido: ${qso.CALL || qso.call || 'SIN_INDICATIVO'} en ${qso.BAND || qso.band || '?'}m ${qso.MODE || qso.mode || '?'}`);
                }
                
                sendToLdA(qso);
            } catch (error) {
                const errorMsg = `Error al procesar mensaje: ${error.message}\n${msg.toString().substring(0, 200)}`;
                console.error(errorMsg);
                if (mainWindow) {
                    mainWindow.webContents.send('log', errorMsg);
                }
            }
        });

        udpServer.on('listening', () => {
            const address = udpServer.address();
            const statusMsg = `[UDP] Servidor escuchando en ${address.address}:${address.port}`;
            console.log(statusMsg);
            if (mainWindow) {
                mainWindow.webContents.send('log', statusMsg);
            }
        });

        // Iniciar el servidor
        console.log(`[UDP] Iniciando servidor en el puerto ${PORT}...`);
        udpServer.bind(PORT, '0.0.0.0'); // Escuchar en todas las interfaces
        
        return true;
    } catch (error) {
        const errorMsg = `Error al iniciar el servidor UDP: ${error.message}`;
        console.error(errorMsg);
        if (mainWindow) {
            mainWindow.webContents.send('log', errorMsg);
        }
        
        // Reintentar después de 5 segundos
        setTimeout(startUDPServer, 5000);
        return false;
    }
}

// Cargar configuración inicial
let appConfig = config.getAll();

// Mostrar configuración cargada
console.log('Configuración cargada:', JSON.stringify(appConfig, null, 2));

// Verificar si la configuración existe, si no, crear una por defecto
if (!config.has('callsign') || !config.get('callsign')) {
  console.log('Configuración no encontrada, creando valores por defecto...');
  config.set('username', '');
  config.set('password', '');
  config.set('callsign', '');
  config.set('windowBounds', { width: 800, height: 600 });
  config.set('lastState', {});
  appConfig = config.getAll();
}

// Manejadores de eventos para la configuración
ipcMain.on('save-config', (event, newConfig) => {
    try {
        console.log('Guardando configuración:', newConfig);
        
        // Validar configuración
        if (!newConfig.username || !newConfig.callsign) {
            throw new Error('Usuario e indicativo son obligatorios');
        }
        
        // Guardar la configuración
        Object.entries(newConfig).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                config.set(key, value);
            }
        });
        
        // Actualizar la configuración en memoria
        appConfig = config.getAll();
        
        // Notificar al renderer que la configuración se guardó
        event.sender.send('config-saved', { 
            success: true,
            config: config.getSafeConfig()
        });
        
        console.log('Configuración guardada correctamente');
    } catch (error) {
        console.error('Error al guardar configuración:', error);
        event.sender.send('config-saved', { 
            success: false,
            error: error.message 
        });
    }
});

// Cargar configuración
ipcMain.handle('load-config', async () => {
    try {
        const currentConfig = config.getSafeConfig();
        console.log('Configuración cargada para el renderer:', currentConfig);
        return { success: true, config: currentConfig };
    } catch (error) {
        console.error('Error al cargar configuración:', error);
        return { 
            success: false, 
            error: error.message,
            config: config.getSafeConfig() // Devolver configuración por defecto
        };
    }
});

// Actualizar configuración en tiempo real
ipcMain.on('update-config', (event, newConfig) => {
    Object.entries(newConfig).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            appConfig[key] = value;
            config.set(key, value);
        }
    });
});

// Función para enviar datos a LdA
function sendToLdA(qso) {
    // Verificar que tenemos la configuración necesaria
    if (!appConfig.username || !appConfig.password || !appConfig.callsign) {
        const errorMsg = 'Error: Faltan credenciales de LdA. Por favor configura la aplicación primero.';
        console.error(errorMsg);
        if (mainWindow) {
            mainWindow.webContents.send('log', errorMsg);
            mainWindow.show();
        }
        return;
    }

    try {
        // Obtener valores del QSO (soportando tanto mayúsculas como minúsculas)
        const call = qso.CALL || qso.call || '';
        const band = qso.BAND || qso.band || '';
        const mode = qso.MODE || qso.mode || '';
        const qsoDate = qso.QSO_DATE || qso.qso_date || '';
        const timeOn = qso.TIME_ON || qso.time_on || '';
        const rstSent = qso.RST_SENT || qso.rst_sent || '59';
        const comment = qso.COMMENT || qso.comment || qso.NOTES || qso.notes || '';
        const propMode = qso.PROP_MODE || qso.prop_mode || '';
        
        // Formatear fecha
        let formattedDate;
        if (qsoDate) {
            // Formato ADIF (YYYYMMDD)
            if (/^\d{8}$/.test(qsoDate)) {
                formattedDate = `${qsoDate.substring(6, 8)}/${qsoDate.substring(4, 6)}/${qsoDate.substring(0, 4)}`;
            } else {
                // Otros formatos
                const date = new Date(qsoDate);
                if (!isNaN(date.getTime())) {
                    formattedDate = date.toLocaleDateString('es-AR');
                } else {
                    formattedDate = new Date().toLocaleDateString('es-AR');
                }
            }
        } else {
            formattedDate = new Date().toLocaleDateString('es-AR');
        }
        
        // Formatear hora
        let timeStr = '';
        if (timeOn) {
            // Formato ADIF (HHMM o HHMMSS)
            timeStr = timeOn.replace(/[^0-9]/g, '');
            if (timeStr.length >= 4) {
                timeStr = timeStr.substring(0, 4); // Tomar solo HHMM
            }
        }
        
        // Si no hay hora, usar la actual
        if (!timeStr) {
            const now = new Date();
            timeStr = now.getHours().toString().padStart(2, '0') + 
                     now.getMinutes().toString().padStart(2, '0');
        }
        
        // Asegurar formato HHMM
        timeStr = timeStr.padStart(4, '0').substring(0, 4);
        
        // Crear objeto de parámetros
        const params = {
            user: appConfig.username,
            pass: appConfig.password,
            micall: appConfig.callsign,
            sucall: call || 'NOCALL',
            banda: band || '?',
            modo: mode || '?',
            fecha: formattedDate,
            hora: timeStr,
            rst: rstSent,
            x_qslMSG: comment || '73 via LdA-Uploader'
        };
        
        // Solo agregar prop_mode si tiene un valor y no es 'N/A'
        if (propMode && propMode !== 'N/A') {
            params.prop = propMode;
        }
        
        // Convertir a URLSearchParams
        const searchParams = new URLSearchParams(params);

        const options = {
            hostname: 'www.lda.ar',
            path: `/php/subeqso.php?${searchParams.toString()}`,
            method: 'GET',
            headers: {
                'User-Agent': 'LdA-Uploader/1.0',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            }
        };
        
        console.log('Enviando a LdA:', `https://${options.hostname}${options.path}`);
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const logMsg = `QSO con ${call || 'desconocido'} enviado a LdA: ${data}`;
                console.log(logMsg);
                if (mainWindow) {
                    mainWindow.webContents.send('log', logMsg);
                }
            });
        });
        
        req.on('error', (err) => {
            const errorMsg = `Error al enviar a LdA: ${err.message}`;
            console.error(errorMsg);
            if (mainWindow) {
                mainWindow.webContents.send('log', errorMsg);
            }
        });
        
        req.end();
    } catch (error) {
        const errorMsg = `Error en sendToLdA: ${error.message}`;
        console.error(errorMsg);
        if (mainWindow) {
            mainWindow.webContents.send('log', errorMsg);
        }
    }
}

// Configuración de la aplicación
app.whenReady().then(() => {
    createWindow();
    startUDPServer();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Manejar la salida de la aplicación
process.on('SIGINT', () => {
    if (udpServer) {
        udpServer.close();
    }
    process.exit(0);
});