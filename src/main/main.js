const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const dgram = require('dgram');
const https = require('https');
const fs = require('fs');
const config = require('./config');

// Obtener la ruta del archivo de configuración
const { CONFIG_FILE } = config;

// Mostrar información de depuración
console.log('Ruta de configuración:', path.join(app.getPath('userData'), 'config.json'));

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

// Función para enviar logs al renderer
function sendLog(message) {
    if (!message) return;  // No enviar mensajes vacíos o undefined
    
    // Asegurarse de que el mensaje sea una cadena
    const logMessage = typeof message === 'string' ? message : JSON.stringify(message);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log', logMessage);
    } else {
        console.log('No se pudo enviar el log - ventana no disponible:', logMessage);
    }
}

// Crear ventana principal
function createWindow() {
    // Obtener las dimensiones de la pantalla primaria
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    // Configurar opciones de la ventana
    const windowOptions = {
        width: 800,
        height: 600,
        x: Math.max(0, Math.floor((width - 800) / 2)),
        y: Math.max(0, Math.floor((height - 600) / 2)),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
            allowRunningInsecureContent: false
        },
        show: true,
        title: 'LdA Uploader',
        icon: path.join(__dirname, '..', 'assets', 'icon.png'),
        frame: true,
        autoHideMenuBar: false
    };
    
    // No mostrar las opciones de la ventana a menos que sea necesario para depuración
    mainWindow = new BrowserWindow(windowOptions);

    // Cargar el archivo HTML
    const indexPath = path.join(__dirname, '..', '..', 'index.html');
    
    mainWindow.loadFile(indexPath).catch(err => {
        console.error('Error al cargar el archivo HTML:', err);
    });
    
    // Forzar la visibilidad de la ventana
    mainWindow.on('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
        
        // Forzar visibilidad máxima
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.center();
        mainWindow.setVisibleOnAllWorkspaces(true);
        mainWindow.moveTop();
        
        // No mostrar información redundante de la ventana
            
            if (!mainWindow.isVisible()) {
                console.log('La ventana sigue sin ser visible, intentando abrir las herramientas de desarrollo...');
                mainWindow.webContents.openDevTools();
            }
    });

    // Configurar el ícono de la bandeja en segundo plano
    setupTrayIcon();
}

// Configurar el ícono de la bandeja
function setupTrayIcon() {
    try {
        const { nativeImage, Tray, Menu } = require('electron');
        let trayIcon = null;
        
        // Intentar cargar el ícono del directorio de assets
        try {
            const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
            if (fs.existsSync(iconPath)) {
                trayIcon = nativeImage.createFromPath(iconPath);
            } else {
                console.log(`No se encontró el archivo de ícono en: ${iconPath}`);
                // Usar un ícono por defecto de Electron
                trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'node_modules', 'electron', 'default_app', 'icon.png'));
                if (trayIcon.isEmpty()) {
                    console.log('Usando ícono por defecto de Electron');
                }
            }
        } catch (error) {
            console.error('Error al cargar el ícono:', error);
            // Usar un ícono por defecto de Electron
            trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'node_modules', 'electron', 'default_app', 'icon.png'));
            if (trayIcon.isEmpty()) {
                console.log('No se pudo cargar ningún ícono, continuando sin ícono de bandeja');
                return;
            }
        }
        
        // Crear el ícono de la bandeja
        try {
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
            
            console.log('Ícono de la bandeja configurado correctamente');
        } catch (error) {
            console.error('Error al crear el ícono de la bandeja:', error);
            // Continuar sin ícono de bandeja
            tray = null;
        }
    } catch (error) {
        console.error('Error inesperado al configurar la bandeja del sistema:', error);
        // Continuar sin ícono de bandeja
        tray = null;
    }
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
                const rawData = msg.toString().trim();
                
                // Ignorar mensajes vacíos
                if (!rawData) {
                    console.log('[UDP] Mensaje vacío recibido, ignorando...');
                    return;
                }
                
                console.log('[UDP] Datos recibidos de', rinfo.address, ':', rawData.substring(0, 200) + (rawData.length > 200 ? '...' : ''));
                
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

// Inicializar configuración
function initializeConfig() {
    let appConfig = config.getAll();
    
    // Si no hay configuración, crear valores por defecto
    if (!config.has('username') || !config.has('callsign')) {
        config.set('username', '');
        config.set('password', '');
        config.set('callsign', '');
        config.set('windowBounds', { width: 800, height: 600 });
        config.set('lastState', {});
        config.save();
    }
    
    return appConfig;
}

// Manejadores de eventos para la configuración
ipcMain.handle('load-config', async () => {
    console.log('Solicitada carga de configuración');
    return config.getSafeConfig();
});

ipcMain.handle('save-config', async (event, newConfig) => {
    console.log('=== INICIO save-config ===');
    console.log('Nueva configuración recibida:', newConfig);
    
    try {
        // Validar configuración
        console.log('Validando configuración...');
        if (!newConfig.username) {
            throw new Error('El nombre de usuario es obligatorio');
        }
        if (!newConfig.callsign) {
            throw new Error('El indicativo es obligatorio');
        }

        // Obtener configuración actual
        const currentConfig = config.getAll();

        // Actualizar cada valor individualmente
        console.log('Iniciando LdA Uploader...');
        const updatedFields = [];
        for (const [key, value] of Object.entries(newConfig)) {
            if (value !== undefined) {
                console.log(`Actualizando ${key}:`, value);
                config.set(key, value);
                updatedFields.push(key);
            }
        }
        
        // Obtener configuración actualizada
        const updatedConfig = config.getAll();
        
        // Guardar la configuración en disco
        console.log('Guardando configuración en disco...');
        const saved = config.saveConfig(updatedConfig);
        
        if (!saved) {
            throw new Error('No se pudo guardar la configuración en disco');
        }
        
        // Actualizar la referencia en memoria
        appConfig = config.getAll();
        
        console.log('Configuración guardada exitosamente');
        
        // Devolver una respuesta consistente
        const safeConfig = config.getSafeConfig();
        const response = { 
            success: true, 
            config: safeConfig,
            message: 'Configuración guardada correctamente',
            updatedFields: updatedFields
        };
        
        console.log('Enviando respuesta al renderer:', JSON.stringify(response, null, 2));
        return response;
        
    } catch (error) {
        console.error('ERROR en save-config:', error);
        console.error('Stack:', error.stack);
        return { 
            success: false, 
            error: error.message 
        };
    } finally {
        console.log('=== FIN save-config ===\n');
    }
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
            x_qslMSG: comment || '73 & DX'
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