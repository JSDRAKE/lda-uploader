document.addEventListener('DOMContentLoaded', async () => {
  // Añadir información inicial al cargar la página
  addInfoEntry('LdA Uploader iniciado', 'info');
  addInfoEntry('Versión: 1.0.0', 'info');
  addInfoEntry('Estado: Listo para operar', 'success');

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
  const indicativoSelect = document.getElementById('indicativo');
  const softwareSelect = document.getElementById('software');

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
  
  // Cargar configuración al inicio
  async function loadIndicativos() {
    try {
      const settings = await window.electron.loadConfig();
      if (settings) {
        // Limpiar el selector
        indicativoSelect.innerHTML = '';
        
        // Agregar la señal principal
        if (settings.mainCallSign) {
          const option = document.createElement('option');
          option.value = settings.mainCallSign;
          option.textContent = settings.mainCallSign;
          indicativoSelect.appendChild(option);
        }
        
        // Agregar los alias
        if (settings.aliases && settings.aliases.length > 0) {
          settings.aliases.forEach(alias => {
            const option = document.createElement('option');
            option.value = alias;
            option.textContent = alias;
            indicativoSelect.appendChild(option);
          });
        }
        
        // Seleccionar el primer indicativo por defecto
        if (indicativoSelect.options.length > 0) {
          indicativoSelect.selectedIndex = 0;
        }
      }
    } catch (error) {
      console.error('Error al cargar los indicativos:', error);
      showNotification('Error al cargar los indicativos', 'error');
    }
  }
  
  // Cargar los indicativos al inicio
  loadIndicativos();

  // Funciones para mostrar información en el área de información
function addInfoEntry(message, type = 'info') {
  const infoContent = document.getElementById('infoContent');
  const entry = document.createElement('div');
  entry.className = `info-entry ${type}`;
  entry.setAttribute('data-type', type.toUpperCase());
  entry.textContent = message;
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
  const applyBtn = document.getElementById('applyBtn');
  const clearInfoBtn = document.getElementById('clearInfo');

  updateBtn.addEventListener('click', async () => {
  try {
    await loadIndicativos();
    addInfoEntry('Indicativos actualizados correctamente', 'success');
    showNotification('Indicativos actualizados correctamente', 'success');
  } catch (error) {
    console.error('Error al actualizar los indicativos:', error);
    addInfoEntry('Error al actualizar los indicativos', 'error');
    showNotification('Error al actualizar los indicativos', 'error');
  }
});

  applyBtn.addEventListener('click', async () => {
    try {
      const indicativo = indicativoSelect.value;
      const software = softwareSelect.value;
      
      // Aquí iría la lógica para aplicar los cambios
      // Por ejemplo, podríamos guardar estos valores en el estado de la aplicación
      // o realizar alguna acción con ellos
      
      addInfoEntry('Configuración aplicada correctamente', 'success');
      showNotification('Configuración aplicada correctamente', 'success');
    } catch (error) {
      console.error('Error al aplicar la configuración:', error);
      addInfoEntry('Error al aplicar la configuración', 'error');
      showNotification('Error al aplicar la configuración', 'error');
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
