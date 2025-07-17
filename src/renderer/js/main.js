document.addEventListener('DOMContentLoaded', async () => {
  // Elementos del DOM
  const toggleBtn = document.getElementById('toggleSidebar');
  const sidebar = document.querySelector('.sidebar');
  const appContainer = document.querySelector('.app-container');
  const menuItems = document.querySelectorAll('.menu-item a');
  const sections = document.querySelectorAll('.section');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const fileInfo = document.getElementById('fileInfo');
  const configForm = document.getElementById('configForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const mainCallSignInput = document.getElementById('mainCallSign');
  const togglePasswordBtn = document.querySelector('.toggle-password');
  const aliasInput = document.getElementById('aliasInput');
  const addAliasBtn = document.getElementById('addAliasBtn');
  const aliasList = document.getElementById('aliasList');
  const softwareSelect = document.getElementById('software');
  
  // Mostrar mensaje de bienvenida
  addInfoEntry('LdA Uploader iniciado', 'info');
  addInfoEntry('Versión: 1.0.0', 'info');
  addInfoEntry('Estado: Listo para operar', 'success');
  
  // Mostrar información inicial del software y puerto
  const initialSoftware = softwareSelect.value;
  const initialPort = {
    'log4om': 2233,
    'wsjtx': 2333,
    'n1mm': 12060
  }[initialSoftware];
  
  addInfoEntry(`[${initialSoftware.toUpperCase()}] Escuchando en puerto ${initialPort}`, 'info');

  // Mapa de puertos por software
  const SOFTWARE_PORTS = {
    'log4om': 2233,
    'wsjtx': 2333,
    'n1mm': 12060
  };

  // Bandera para controlar la carga inicial
  let initialLoad = true;

  // Actualizar información del software y puerto
  function updateSoftwareInfo(software, isInitialLoad = false) {
    const port = SOFTWARE_PORTS[software] || 'No configurado';
    const infoText = `[${software.toUpperCase()}] Escuchando en puerto ${port}`;
    
    // Solo agregar el mensaje si no es la carga inicial o si es un cambio de software
    if (!isInitialLoad) {
      addInfoEntry(infoText, 'info');
    }
    
    // Aquí podrías enviar el cambio de software al proceso principal
    // cuando implementes el servidor UDP
    // ipcRenderer.send('change-software', software);
  }

  // Manejar cambio de software
  softwareSelect.addEventListener('change', (e) => {
    const software = e.target.value;
    updateSoftwareInfo(software, false);
    
    // Enviar el cambio de software al proceso principal
    if (window.electron && window.electron.changeSoftware) {
      window.electron.changeSoftware(software);
    }
  });
  
  // Configurar manejadores de eventos UDP y LdA
  if (window.electron) {
    // Manejar mensajes UDP recibidos
    window.electron.onUdpMessage((data) => {
      try {
        // Asegurarse de que data sea un objeto con el formato correcto
        let messageData = {};
        
        if (typeof data === 'string') {
          // Si el mensaje es una cadena, crear un objeto con el formato esperado
          messageData = { 
            message: data, 
            processed: false,
            address: 'unknown',
            port: 0,
            timestamp: new Date().toISOString()
          };
        } else if (data && typeof data === 'object') {
          // Si es un objeto, asegurarse de que tenga los campos requeridos
          messageData = {
            message: data.message || '',
            processed: !!data.processed,
            address: data.address || 'unknown',
            port: data.port || 0,
            timestamp: data.timestamp || new Date().toISOString(),
            ...data // Mantener cualquier otro campo
          };
        } else {
          console.error('Formato de mensaje UDP no válido:', data);
          return;
        }
        
        const messageStr = String(messageData.message || '');
        
        // Extraer solo los campos requeridos del mensaje
        const callMatch = messageStr.match(/<CALL:(\d+)>([^<]+)/i);
        const bandMatch = messageStr.match(/<BAND:(\d+)>([^<]+)/i);
        const modeMatch = messageStr.match(/<MODE:(\d+)>([^<]+)/i);
        
        // Si no encontramos los campos en el formato estándar, intentar con el formato de WSJT-X
        if (!callMatch || !bandMatch || !modeMatch) {
          const wsjtxCallMatch = messageStr.match(/<call:(\d+)>([^<]+)/i);
          const wsjtxBandMatch = messageStr.match(/<band:(\d+)>([^<]+)/i);
          const wsjtxModeMatch = messageStr.match(/<mode:(\d+)>([^<]+)/i);
          
          if (wsjtxCallMatch && wsjtxModeMatch) {
            const call = wsjtxCallMatch[2].trim();
            const mode = wsjtxModeMatch[2].trim();
            const band = wsjtxBandMatch ? wsjtxBandMatch[2].trim() : 'desconocida';
            
            if (messageData.processed) {
              addInfoEntry(`✓ Contacto procesado: ${call} en ${band} ${mode}`, 'success');
            } else {
              addInfoEntry(`Nuevo contacto: ${call} en ${band} ${mode}`, 'info');
            }
            return;
          }
        }
        
        // Si encontramos los campos en el formato estándar
        if (callMatch && bandMatch && modeMatch) {
          const call = callMatch[2].trim();
          const band = bandMatch[2].trim();
          const mode = modeMatch[2].trim();
          
          if (messageData.processed) {
            addInfoEntry(`✓ Contacto procesado: ${call} en ${band} ${mode}`, 'success');
          } else {
            addInfoEntry(`Nuevo contacto: ${call} en ${band} ${mode}`, 'info');
          }
        } else if (!messageData.processed) {
          console.log('Mensaje UDP recibido (formato no esperado):', messageStr);
          addInfoEntry('Mensaje recibido con formato no esperado', 'warning');
        }
      } catch (error) {
        console.error('Error al procesar mensaje UDP:', error);
        addInfoEntry(`Error: ${error.message}`, 'error');
      }
    });
    
    // Manejar errores del servidor UDP
    window.electron.onUdpError((error) => {
      addInfoEntry(`Error en servidor UDP: ${error}`, 'error');
    });
    
    // Manejar inicio del servidor UDP
    window.electron.onUdpStarted((data) => {
      addInfoEntry(`Servidor UDP iniciado en puerto ${data.port}`, 'success');
    });
    
    // Manejar estado de envío a LdA
    window.electron.onLdaStatus((data) => {
      if (data.success) {
        const call = data.data?.call || 'Contacto';
        const message = data.message || 'QSO enviado correctamente a LdA';
        addInfoEntry(`✓ ${message}: ${call}`, 'success');
        showNotification(message, 'success');
      } else {
        const errorMsg = data.message || 'Error desconocido';
        addInfoEntry(`✗ Error: ${errorMsg}`, 'error');
        showNotification(`Error al enviar QSO: ${errorMsg}`, 'error');
      }
    });
    
    // Manejar errores de LdA
    window.electron.onLdaError((error) => {
      const errorMsg = error.message || 'Error desconocido';
      addInfoEntry(`✗ Error de LdA: ${errorMsg}`, 'error');
      showNotification(`Error de LdA: ${errorMsg}`, 'error');
    });
    
    // Cargar configuración de LdA al iniciar
    async function loadLdaConfig() {
      try {
        const config = await window.electron.getLdaConfig();
        if (config) {
          usernameInput.value = config.username || '';
          passwordInput.value = config.password || '';
          mainCallSignInput.value = config.mainCallSign || '';
          
          // Cargar alias si existen
          if (config.aliases && Array.isArray(config.aliases)) {
            aliases = config.aliases;
            renderAliases();
          }
          
          addInfoEntry('Configuración cargada correctamente', 'success');
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error al cargar la configuración de LdA:', error);
        addInfoEntry(`Error al cargar configuración: ${error.message}`, 'error');
        return false;
      }
    }
    
    // Cargar la configuración al iniciar
    loadLdaConfig();
  }
  
  // Mostrar información inicial del software (solo una vez)
  updateSoftwareInfo(softwareSelect.value, true);

  // Cargar estado inicial del sidebar
  const loadSidebarState = () => {
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
      sidebar.classList.add('collapsed');
      appContainer.classList.add('sidebar-collapsed');
    } else {
      sidebar.classList.remove('collapsed');
      appContainer.classList.remove('sidebar-collapsed');
    }
    return isCollapsed;
  };

  // Estado de la aplicación
  let isSidebarCollapsed = loadSidebarState();

  // Toggle del sidebar
  const toggleSidebar = () => {
    const appContainer = document.querySelector('.app-container');
    const isCollapsed = sidebar.classList.toggle('collapsed');
    
    // Guardar el estado en localStorage
    localStorage.setItem('sidebarCollapsed', isCollapsed);
    
    // Alternar la clase en el contenedor principal
    appContainer.classList.toggle('sidebar-collapsed', isCollapsed);
    
    // Forzar repintado para asegurar que las transiciones funcionen
    document.body.offsetHeight;
  };

  // Cambiar sección activa
  function setActiveSection(sectionId) {
    // Remover clase active de todos los items del menú y secciones
    menuItems.forEach(item => item.parentElement.classList.remove('active'));
    sections.forEach(section => section.classList.remove('active'));
    
    // Agregar clase active al item del menú y sección correspondiente
    const activeMenuItem = document.querySelector(`.menu-item a[data-section="${sectionId}"]`);
    const activeSection = document.getElementById(sectionId);
    
    if (activeMenuItem && activeSection) {
      activeMenuItem.parentElement.classList.add('active');
      activeSection.classList.add('active');
    }
    
    // Cerrar el menú en móviles
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('show');
    }
  }

  // Manejar la carga de archivos
  function handleFileSelect(file) {
    if (file) {
      const fileName = file.name;
      const fileSize = (file.size / 1024).toFixed(2); // Tamaño en KB
      
      fileInfo.innerHTML = `
        <p><strong>Archivo seleccionado:</strong> ${fileName}</p>
        <p><strong>Tamaño:</strong> ${fileSize} KB</p>
        <button class="btn-upload">Subir archivo</button>
      `;
      
      fileInfo.style.display = 'block';
      
      // Agregar evento al botón de subir
      const uploadBtn = fileInfo.querySelector('.btn-upload');
      uploadBtn.addEventListener('click', () => uploadFile(file));
    }
  }

  // Función para subir el archivo (simulada)
  function uploadFile(file) {
    // Aquí iría la lógica para subir el archivo
    console.log('Subiendo archivo:', file.name);
    
    // Simular carga
    const progress = document.createElement('div');
    progress.className = 'upload-progress';
    progress.innerHTML = '<p>Subiendo archivo... <span class="progress-bar"></span></p>';
    fileInfo.appendChild(progress);
    
    // Simular progreso
    let width = 0;
    const interval = setInterval(() => {
      if (width >= 100) {
        clearInterval(interval);
        progress.innerHTML = '<p class="success">¡Archivo subido exitosamente!</p>';
      } else {
        width++;
        const progressBar = progress.querySelector('.progress-bar');
        if (progressBar) {
          progressBar.style.width = `${width}%`;
        }
      }
    }, 30);
  }

  // Mostrar/ocultar contraseña
  function setupPasswordToggle() {
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      const icon = togglePasswordBtn.querySelector('i');
      icon.classList.toggle('fa-eye');
      icon.classList.toggle('fa-eye-slash');
    });
  }

  // Validar formato de correo electrónico
  function isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(String(email).toLowerCase());
  }

  // Validar contraseña
  function isValidPassword(password) {
    return password.length >= 8;
  }
  
  // Validar Señal Distintiva Principal
  function isValidCallSign(callSign) {
    const callSignRegex = /^[A-Z0-9/]+$/;
    return callSignRegex.test(callSign);
  }

  // Validar formato de señal distintiva y alias (solo letras, números y /)
  function isValidCallSign(callSign) {
    return /^[A-Z0-9/]+$/.test(callSign);
  }

  // Validar formulario completo
  function validateForm() {
    let isValid = true;
    
    // Validar correo electrónico
    if (!isValidEmail(usernameInput.value)) {
      showNotification('Por favor ingresa un correo electrónico válido', 'error');
      usernameInput.focus();
      isValid = false;
    }
    // Validar contraseña
    else if (!isValidPassword(passwordInput.value)) {
      showNotification('La contraseña debe tener al menos 8 caracteres', 'error');
      passwordInput.focus();
      isValid = false;
    }
    // Validar señal distintiva
    else if (!isValidCallSign(mainCallSignInput.value)) {
      showNotification('La Señal Distintiva solo puede contener letras mayúsculas, números y /', 'error');
      mainCallSignInput.focus();
      isValid = false;
    }
    
    return isValid;
  }

  // Obtener la ruta del archivo de configuración
  const configPath = window.electron.getConfigPath();
  
  // Guardar configuración
  async function saveSettings(event) {
    event.preventDefault();
    
    // Validar el formulario
    if (!validateForm()) {
      return;
    }
    
    if (!configForm.checkValidity()) {
      // Mostrar mensajes de validación si el formulario no es válido
      event.stopPropagation();
      configForm.classList.add('was-validated');
      return;
    }
    
    const settings = {
      username: usernameInput.value,
      // En una aplicación real, la contraseña debería ser hasheada antes de guardarse
      password: passwordInput.value,
      mainCallSign: mainCallSignInput.value.toUpperCase(),
      aliases: [...aliases], // Guardar la lista de alias
      lastUpdated: new Date().toISOString()
    };
    
    try {
      // Guardar en archivo
      await window.electron.saveConfig(settings);
      
      // Mostrar notificación de éxito
      showNotification('Configuración guardada correctamente', 'success');
      
      // Resetear el estado de validación
      configForm.classList.remove('was-validated');
      
    } catch (error) {
      console.error('Error al guardar la configuración:', error);
      showNotification('Error al guardar la configuración: ' + error.message, 'error');
    }
  }
  
  // Cargar configuración guardada
  async function loadSettings() {
    try {
      const settings = await window.electron.loadConfig();
      
      if (settings) {
        usernameInput.value = settings.username || '';
        passwordInput.value = settings.password || '';
        mainCallSignInput.value = settings.mainCallSign || '';
        
        // Cargar alias si existen
        if (settings.aliases && Array.isArray(settings.aliases)) {
          aliases = [...settings.aliases];
          renderAliases();
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') { // Ignorar si el archivo no existe
        console.error('Error al cargar la configuración:', error);
        showNotification('Error al cargar la configuración: ' + error.message, 'error');
      }
    }
  }
  
  // Función para cargar la configuración
  async function loadConfig() {
    try {
      const settings = await window.electron.loadConfig();
      if (settings) {
        // Configuración cargada correctamente
        return settings;
      }
    } catch (error) {
      console.error('Error al cargar la configuración:', error);
      showNotification('Error al cargar la configuración', 'error');
    }
    return null;
  }

  // Funciones para mostrar información en el área de información
function addInfoEntry(message, type = 'info') {
  const infoContent = document.getElementById('infoContent');
  const entry = document.createElement('div');
  entry.className = `info-entry ${type}`;
  
  // Formatear la entrada en una sola línea
  entry.innerHTML = `
    <span class="timestamp">[${new Date().toLocaleTimeString()}]</span>
    <span>${message}</span>
  `;
  
  infoContent.appendChild(entry);
  
  // Desplazar automáticamente al final
  infoContent.scrollTop = infoContent.scrollHeight;
}

function clearInfo() {
  const infoContent = document.getElementById('infoContent');
  infoContent.innerHTML = '';
}

  // Event listeners para los botones
  const updateBtn = document.getElementById('updateBtn');
  const clearInfoBtn = document.getElementById('clearInfo');

  // Limpiar información cuando cambie de sección
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      if (!item.closest('.section').classList.contains('active')) {
        clearInfo();
      }
    });
  });

  // Actualizar configuración
  updateBtn.addEventListener('click', async () => {
    try {
      await loadConfig();
      addInfoEntry('Configuración actualizada correctamente', 'success');
      showNotification('Configuración actualizada correctamente', 'success');
    } catch (error) {
      console.error('Error al actualizar la configuración:', error);
      addInfoEntry('Error al actualizar la configuración', 'error');
      showNotification('Error al actualizar la configuración', 'error');
    }
  });

  // Cambio automático de software
  softwareSelect.addEventListener('change', async (event) => {
    try {
      const software = event.target.value;
      // Notificar al proceso principal sobre el cambio de software
      if (window.electron && window.electron.changeSoftware) {
        await window.electron.changeSoftware(software);
        
        // Actualizar el puerto según el software seleccionado
        const portMap = {
          'log4om': 2233,
          'wsjtx': 2333,
          'n1mm': 12060
        };
        const port = portMap[software] || 'desconocido';
        
        addInfoEntry(`Software cambiado a: ${software.toUpperCase()} (puerto ${port})`, 'success');
        showNotification(`Software cambiado a: ${software.toUpperCase()}`, 'success');
      }
    } catch (error) {
      console.error('Error al cambiar de software:', error);
      addInfoEntry('Error al cambiar de software', 'error');
      showNotification('Error al cambiar de software', 'error');
    }
  });

  // Event listener para el botón de limpiar información
clearInfoBtn.addEventListener('click', () => {
  clearInfo();
  showNotification('Información limpiada', 'info');
});

  // Mostrar notificación mejorada
  function showNotification(message, type = 'info') {
    // Crear contenedor de notificaciones si no existe
    let container = document.querySelector('.notification-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'notification-container';
      document.body.appendChild(container);
    }

    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Ícono según el tipo de notificación
    let icon = '';
    switch(type) {
      case 'success':
        icon = '✓';
        break;
      case 'error':
        icon = '✕';
        break;
      case 'warning':
        icon = '⚠';
        break;
      default:
        icon = 'ℹ';
    }
    
    // Estructura de la notificación
    notification.innerHTML = `
      <span class="notification-icon">${icon}</span>
      <span class="notification-message">${message}</span>
      <button class="notification-close" aria-label="Cerrar notificación">×</button>
    `;
    
    // Agregar al contenedor
    container.appendChild(notification);
    
    // Forzar reflow para la animación
    void notification.offsetWidth;
    
    // Mostrar notificación con animación
    notification.classList.add('show');
    
    // Configurar cierre al hacer clic en el botón
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      closeNotification(notification);
    });
    
    // Cerrar automáticamente después de 5 segundos
    const autoClose = setTimeout(() => {
      closeNotification(notification);
    }, 5000);
    
    // Pausar el cierre automático al hacer hover
    notification.addEventListener('mouseenter', () => {
      clearTimeout(autoClose);
    });
    
    // Reanudar el cierre automático al salir del hover
    notification.addEventListener('mouseleave', () => {
      setTimeout(() => closeNotification(notification), 1000);
    });
    
    // Función para cerrar la notificación con animación
    function closeNotification(element) {
      if (!element) return;
      element.classList.remove('show');
      setTimeout(() => {
        if (element && element.parentNode) {
          element.remove();
          // Eliminar el contenedor si no hay más notificaciones
          if (container && container.children.length === 0) {
            container.remove();
          }
        }
      }, 300);
    }
  }
  
  // Inicializar el toggle de la contraseña
  setupPasswordToggle();
  
  // Configurar conversión a mayúsculas en tiempo real
  function setupUppercaseInputs() {
    const uppercaseInputs = document.querySelectorAll('.uppercase-input');
    
    uppercaseInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.toUpperCase();
        input.setSelectionRange(start, end);
      });
    });
  }
  
  // Inicializar la gestión de alias
  let aliases = [];
  
  // Cargar alias guardados
  async function loadAliases() {
    try {
      const settings = await window.electron.loadConfig();
      if (settings && settings.aliases && Array.isArray(settings.aliases)) {
        aliases = [...settings.aliases];
        renderAliases();
      }
    } catch (error) {
      console.error('Error al cargar los alias:', error);
    }
  }
  
  // Guardar alias
  async function saveAliases() {
    try {
      const settings = await window.electron.loadConfig();
      settings.aliases = [...aliases];
      await window.electron.saveConfig(settings);
    } catch (error) {
      console.error('Error al guardar los alias:', error);
    }
  }
  

  
  // Renderizar la lista de alias
  function renderAliases() {
    aliasList.innerHTML = '';
    aliases.forEach((alias, index) => {
      const aliasElement = document.createElement('div');
      aliasElement.className = 'alias-tag';
      aliasElement.innerHTML = `
        <span>${alias}</span>
        <button type="button" class="remove-alias" data-index="${index}" aria-label="Eliminar alias">
          <i class="fas fa-times"></i>
        </button>
      `;
      aliasList.appendChild(aliasElement);
    });
    
    // Agregar event listeners a los botones de eliminar
    document.querySelectorAll('.remove-alias').forEach(button => {
      button.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-index'));
        aliases.splice(index, 1);
        saveAliases();
        renderAliases();
        showNotification('Alias eliminado correctamente', 'success');
      });
    });
  }
  
  // Agregar un nuevo alias
  function addAlias() {
    const alias = aliasInput.value.trim().toUpperCase();
    
    if (!alias) {
      showNotification('Por favor ingresa un alias', 'error');
      return;
    }
    
    if (aliases.includes(alias)) {
      showNotification('Este alias ya existe', 'warning');
      return;
    }
    
    // Validar formato del alias (solo letras, números y /)
    if (!isValidCallSign(alias)) {
      showNotification('Solo se permiten letras, números y /', 'error');
      return;
    }
    
    aliases.push(alias);
    saveAliases();
    renderAliases();
    aliasInput.value = '';
    showNotification('Alias agregado correctamente', 'success');
  }
  
  // Event listeners para agregar alias
  addAliasBtn.addEventListener('click', addAlias);
  aliasInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAlias();
    }
  });
  
  // Cargar alias al iniciar
  loadAliases();
  
  // Configurar validación en tiempo real para los campos
  function setupInputValidation() {
    // Manejador para prevenir caracteres no permitidos
    const preventInvalidChars = (e) => {
      // Permitir teclas de control (borrar, tab, etc.)
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      
      // Obtener el carácter presionado
      const char = String.fromCharCode(e.which || e.keyCode);
      
      // Expresión regular para validar caracteres permitidos
      const allowedChars = /^[A-Za-z0-9/]$/;
      
      // Si el carácter no está permitido, prevenir la acción por defecto
      if (!allowedChars.test(char)) {
        e.preventDefault();
        showNotification('Solo se permiten letras, números y /', 'error');
      }
    };

    // Aplicar a los campos correspondientes
    const restrictedInputs = [mainCallSignInput, aliasInput];
    restrictedInputs.forEach(input => {
      if (input) {
        input.addEventListener('keypress', preventInvalidChars);
      }
    });
  }

  // Configurar inputs de mayúsculas y validación
  setupUppercaseInputs();
  setupInputValidation();
  
  // Manejar el evento reset del formulario para limpiar los alias
  configForm.addEventListener('reset', (e) => {
    // Limpiar la lista de alias en el almacenamiento local
    localStorage.removeItem('aliases');
    // Limpiar la lista de alias en la interfaz de usuario
    aliasList.innerHTML = '';
    // Limpiar el array de alias
    aliases = [];
    // Mostrar notificación
    showNotification('Configuración restablecida', 'info');
  });

  // Event Listeners
  toggleBtn.addEventListener('click', toggleSidebar);
  
  // Manejar envío del formulario
  if (configForm) {
    configForm.addEventListener('submit', saveSettings);
  }
  
  // Navegación del menú
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = item.getAttribute('data-section');
      setActiveSection(sectionId);
    });
  });
  
  // Drag & Drop para subir archivos
  if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
      dropZone.classList.add('highlight');
    }
    
    function unhighlight() {
      dropZone.classList.remove('highlight');
    }
    
    dropZone.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
      const dt = e.dataTransfer;
      const file = dt.files[0];
      
      if (file && (file.name.endsWith('.adi') || file.name.endsWith('.adif'))) {
        handleFileSelect(file);
      } else {
        alert('Por favor, selecciona un archivo ADIF válido (.adi o .adif)');
      }
    }
    
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleFileSelect(file);
      }
    });
  }
  
  // Cargar configuración al iniciar
  loadSettings();
  
  // Establecer la sección activa por defecto
  setActiveSection('inicio');
  
  // Manejar el redimensionamiento de la ventana
  function handleResize() {
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('show');
    } else {
      sidebar.classList.remove('show');
    }
  }
  
  window.addEventListener('resize', handleResize);
  handleResize(); // Llamar una vez al cargar
});
