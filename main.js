const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const dgram = require('dgram');
const https = require('https');

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

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Cargar el archivo HTML
    mainWindow.loadFile('index.html');

    // Crear un ícono temporal en memoria
    const { nativeImage } = require('electron');
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Abrir', 
            click: () => mainWindow.show() 
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
    
    // Mostrar la ventana cuando se hace clic en el ícono de la bandeja
    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
    
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

// Variable global para almacenar la configuración
let appConfig = {};

// Función para actualizar la configuración desde el renderer
ipcMain.on('update-config', (event, config) => {
    appConfig = config;
    console.log('Configuración actualizada:', JSON.stringify(config, null, 2));
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