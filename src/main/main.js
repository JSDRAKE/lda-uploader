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
let appConfig = {}; // Add module-level appConfig

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
    // Cargar configuración
    const config = require('./config').getAll();
    
    // Crear la ventana del navegador
    mainWindow = new BrowserWindow({
        width: config.windowBounds?.width || 800,
        height: config.windowBounds?.height || 600,
        x: config.windowBounds?.x,
        y: config.windowBounds?.y,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: !config.startInTray, // No mostrar la ventana si debe iniciar en la bandeja
        icon: path.join(__dirname, '../assets/icons/icon.png')
    });
    
    // Cargar el archivo index.html de la aplicación
    mainWindow.loadFile(path.join(__dirname, '../../index.html'));
    
    // Configurar el estado inicial de la ventana
    if (config.startInTray) {
        console.log('La ventana está configurada para iniciar en la bandeja');
        mainWindow.hide();
    } else if (config.startMinimized) {
        console.log('La ventana está configurada para iniciar minimizada');
        mainWindow.minimize();
        mainWindow.show(); // Mostrar antes de minimizar para asegurar la visibilidad
    } else {
        console.log('Mostrando ventana principal');
        mainWindow.show();
    }
    
    // Solo abrir herramientas de desarrollo si estamos en desarrollo y la ventana no está minimizada
    if (process.env.NODE_ENV === 'development' && !config.startInTray) {
        console.log('Modo desarrollo: abriendo herramientas de desarrollo...');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
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
                            
                            // Traer la ventana al frente si está minimizada
                            if (mainWindow.isMinimized()) {
                                mainWindow.restore();
                            }
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
            
            // Mostrar/ocultar la ventana al hacer doble clic en el ícono
            tray.on('double-click', () => {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                    mainWindow.focus();
                    
                    // Traer la ventana al frente si está minimizada
                    if (mainWindow.isMinimized()) {
                        mainWindow.restore();
                    }
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
    // Update the module-level appConfig
    appConfig = config.getAll();
    
    // Si no hay configuración, crear valores por defecto
    if (!config.has('username') || !config.has('callsign')) {
        const defaultConfig = {
            username: '',
            password: '',
            callsign: '',
            windowBounds: { width: 800, height: 600 },
            lastState: {}
        };
        
        // Set default values
        Object.entries(defaultConfig).forEach(([key, value]) => {
            config.set(key, value);
            appConfig[key] = value;
        });
        
        config.save();
    }
    
    return appConfig;
}

// Manejadores de eventos para la configuración
ipcMain.handle('load-config', async () => {
    console.log('Solicitada carga de configuración');
    const loadedConfig = config.getSafeConfig();
    // Update module-level appConfig when config is loaded
    appConfig = { ...appConfig, ...loadedConfig };
    return loadedConfig;
});

// Variable para controlar si ya hay un guardado en proceso
let isSavingConfig = false;

ipcMain.handle('save-config', async (event, newConfig) => {
    console.log('=== INICIO save-config ===');
    
    // Si ya hay un guardado en proceso, lo ignoramos
    if (isSavingConfig) {
        console.log('Ya hay un guardado en proceso, ignorando...');
        return { success: false, error: 'Ya hay un guardado en proceso' };
    }
    
    // Update module-level appConfig when config is saved
    appConfig = { ...appConfig, ...newConfig };
    
    // Marcar que hay un guardado en proceso
    isSavingConfig = true;
    
    try {
        console.log('Nueva configuración recibida:', 
            JSON.stringify({
                ...newConfig,
                password: newConfig.password ? '********' : undefined
            }, null, 2));
            
        // Validar configuración
        if (!newConfig.username) {
            throw new Error('El nombre de usuario es obligatorio');
        }
        if (!newConfig.callsign) {
            throw new Error('El indicativo es obligatorio');
        }

        // Obtener configuración actual
        const currentConfig = config.getAll();
        
        // Verificar si hay cambios reales
        const hasChanges = Object.keys(newConfig).some(key => {
            return JSON.stringify(currentConfig[key]) !== JSON.stringify(newConfig[key]);
        });
        
        if (!hasChanges) {
            console.log('No hay cambios en la configuración, ignorando...');
            return { 
                success: true, 
                config: config.getSafeConfig(),
                message: 'No se detectaron cambios en la configuración',
                updatedFields: []
            };
        }

        // Actualizar cada valor individualmente
        const updatedFields = [];
        for (const [key, value] of Object.entries(newConfig)) {
            if (value !== undefined) {
                console.log(`Actualizando ${key}:`, key === 'password' ? '********' : value);
                config.set(key, value);
                updatedFields.push(key);
            }
        }
        
        // Guardar la configuración en disco
        console.log('Guardando configuración en disco...');
        
        // Obtener la configuración actualizada (usando un nombre diferente para evitar duplicados)
        const latestConfig = config.getAll();
        const updatedConfig = { ...latestConfig, ...newConfig };
        
        // Guardar la configuración completa
        const saved = config.saveConfig(updatedConfig);
        
        if (!saved) {
            throw new Error('No se pudo guardar la configuración en disco');
        }
        
        console.log('Configuración guardada exitosamente');
        
        // Devolver una respuesta consistente
        const safeConfig = config.getSafeConfig();
        const response = { 
            success: true, 
            config: safeConfig,
            message: 'Configuración guardada correctamente',
            updatedFields: updatedFields
        };
        
        console.log('Enviando respuesta al renderer');
        return response;
        
    } catch (error) {
        console.error('ERROR en save-config:', error);
        console.error('Stack:', error.stack);
        return { 
            success: false, 
            error: error.message 
        };
    } finally {
        // Restablecer el estado de guardado
        isSavingConfig = false;
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
        
        // Crear objeto de parámetros con codificación segura
        const params = new URLSearchParams();
        
        // Función para limpiar valores
        const cleanValue = (value) => {
            if (value === null || value === undefined) return '';
            return value.toString().trim();
        };
        
        // Verificar que la contraseña no sea el marcador de posición
        const actualPassword = appConfig.password === '********' ? 
            config.get('password') : // Obtener la contraseña real del almacenamiento
            appConfig.password;
            
        if (!actualPassword) {
            throw new Error('No se pudo obtener la contraseña de la configuración');
        }

        console.log('Credenciales para la petición:', {
            username: appConfig.username,
            callsign: appConfig.callsign,
            passwordLength: actualPassword.length,
            usingPlaceholder: appConfig.password === '********'
        });

        // Agregar parámetros con codificación adecuada
        // Nota: URLSearchParams maneja la codificación automáticamente
        params.append('user', cleanValue(appConfig.username));
        params.append('pass', cleanValue(actualPassword));
        params.append('micall', cleanValue(appConfig.callsign));
        params.append('sucall', cleanValue(call) || 'NOCALL');
        params.append('banda', cleanValue(band) || '?');
        params.append('modo', cleanValue(mode) || '?');
        params.append('fecha', cleanValue(formattedDate));
        params.append('hora', cleanValue(timeStr));
        params.append('rst', cleanValue(rstSent));
        params.append('x_qslMSG', cleanValue(comment || '73 & DX'));
        
        // Solo agregar prop_mode si tiene un valor y no es 'N/A'
        if (propMode && propMode !== 'N/A') {
            params.append('prop', safeEncode(propMode));
        }

        const path = `/php/subeqso.php?${params.toString()}`;
        const options = {
            hostname: 'www.lda.ar',
            path: path,
            method: 'GET',
            headers: {
                'User-Agent': 'LdA-Uploader/1.0',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            }
        };
        
        // Log de depuración (sin mostrar la contraseña)
        const debugParams = new URLSearchParams(params);
        if (debugParams.has('pass')) {
            debugParams.set('pass', '********');
        }
        console.log('Enviando a LdA:', `https://${options.hostname}${path.replace(params.get('pass'), '********')}`);
        console.log('Detalles de la petición:', {
            username: appConfig.username,
            callsign: appConfig.callsign,
            passwordLength: appConfig.password ? appConfig.password.length : 0,
            hasPassword: !!appConfig.password
        });
        
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
    // Inicializar la ventana principal
    createWindow();
    
    // Inicializar el ícono de la bandeja (solo una vez)
    setupTrayIcon();
    
    // Iniciar el servidor UDP
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