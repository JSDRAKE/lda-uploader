document.addEventListener('DOMContentLoaded', () => {
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
  
  // Elementos del formulario de configuración
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const mainCallSignInput = document.getElementById('mainCallSign');
  const togglePasswordBtn = document.querySelector('.toggle-password');

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

  // Guardar configuración
  function saveSettings(event) {
    event.preventDefault();
    
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
      lastUpdated: new Date().toISOString()
    };
    
    try {
      // Guardar en localStorage (en una aplicación real, esto se enviaría a un servidor seguro)
      localStorage.setItem('appSettings', JSON.stringify(settings));
      
      // Mostrar notificación de éxito
      showNotification('Configuración guardada correctamente', 'success');
      
      // Resetear el estado de validación
      configForm.classList.remove('was-validated');
      
    } catch (error) {
      console.error('Error al guardar la configuración:', error);
      showNotification('Error al guardar la configuración', 'error');
    }
  }
  
  // Cargar configuración guardada
  function loadSettings() {
    try {
      const savedSettings = localStorage.getItem('appSettings');
      
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        usernameInput.value = settings.username || '';
        passwordInput.value = settings.password || '';
        mainCallSignInput.value = settings.mainCallSign || '';
      }
    } catch (error) {
      console.error('Error al cargar la configuración:', error);
    }
  }
  
  // Mostrar notificación
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Mostrar notificación
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Ocultar y eliminar después de 5 segundos
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }
  
  // Inicializar el toggle de la contraseña
  setupPasswordToggle();

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
