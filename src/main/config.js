const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Configuración por defecto
const defaultConfig = {
  username: '',
  password: '',
  callsign: '',
  windowBounds: { width: 800, height: 600 },
  lastState: {}
};

const OLD_CONFIG_FILE = path.join(app.getPath('userData'), 'lda-uploader-config.json');
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

// Verificar y migrar archivo de configuración antiguo si existe
if (fs.existsSync(OLD_CONFIG_FILE) && !fs.existsSync(CONFIG_FILE)) {
    try {
        fs.renameSync(OLD_CONFIG_FILE, CONFIG_FILE);
        console.log(`Archivo de configuración migrado de ${OLD_CONFIG_FILE} a ${CONFIG_FILE}`);
    } catch (error) {
        console.error('Error al migrar archivo de configuración:', error);
    }
}

// Cargar configuración desde archivo
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error al cargar configuración:', error);
  }
  return { ...defaultConfig };
}

// Guardar configuración en archivo
function saveConfig(config) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error al guardar configuración:', error);
    return false;
  }
}

// Obtener configuración segura (sin contraseña)
function getSafeConfig() {
  const config = loadConfig();
  return {
    ...config,
    password: config.password ? '********' : ''
  };
}

// Obtener todos los valores
function getAll() {
  return loadConfig();
}

// Obtener un valor específico
function get(key) {
  const config = loadConfig();
  return key in config ? config[key] : defaultConfig[key];
}

// Establecer un valor
function set(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
  return value;
}

// Verificar si existe una clave
function has(key) {
  const config = loadConfig();
  return key in config;
}

// Eliminar una clave
function deleteKey(key) {
  const config = loadConfig();
  if (key in config) {
    delete config[key];
    saveConfig(config);
    return true;
  }
  return false;
}

// Limpiar toda la configuración
function clear() {
  saveConfig({ ...defaultConfig });
  return true;
}

module.exports = {
  CONFIG_FILE,
  getSafeConfig,
  get,
  set,
  has,
  delete: deleteKey,
  clear,
  getAll,
  saveConfig  // Añadir saveConfig a las exportaciones
};
