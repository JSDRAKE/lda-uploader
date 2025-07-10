# LdA Uploader

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Aplicación de escritorio multiplataforma para subir automáticamente QSOs a LdA (Log del Argentina) desde diferentes logs y softwares de radioaficionados.

## Características Principales

- 📡 Soporte para múltiples softwares de registro (Log4OM, WSJT-X, etc.)
- 🔄 Sincronización automática de QSOs mediante UDP
- 🔒 Almacenamiento seguro de credenciales
- 🖥️ Interfaz intuitiva y fácil de usar
- 📊 Visualización del estado de conexión y envío
- ⚡ Notificaciones del sistema

## Requisitos del Sistema

- Windows, macOS o Linux
- Node.js 14+
- npm 6+
- Conexión a Internet

## Instalación

### Para Usuarios Final

1. Descarga la última versión desde [Releases](https://github.com/jsdrake/lda-uploader/releases)
2. Ejecuta el instalador correspondiente a tu sistema operativo
3. Sigue las instrucciones en pantalla

### Para Desarrolladores

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tuusuario/lda-uploader.git
   cd lda-uploader
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Inicia la aplicación en modo desarrollo:
   ```bash
   npm start
   ```

## Configuración

### Configuración Inicial

1. Abre la aplicación
2. Navega a la sección de Configuración
3. Ingresa tus credenciales de LdA
4. Selecciona tu software de registro preferido
5. Guarda la configuración

### Capturas de Pantalla

*(Espacio reservado para capturas de pantalla de la configuración)*

## Uso

1. Asegúrate de que tu software de registro esté configurado para exportar QSOs vía UDP
2. Inicia LdA Uploader
3. La aplicación detectará automáticamente los QSOs nuevos
4. Los QSOs se subirán automáticamente a LdA

## Desarrollo

### Estructura del Proyecto

```
lda-uploader/
├── src/
│   ├── main/           # Código del proceso principal de Electron
│   ├── renderer/       # Código del renderer (interfaz de usuario)
│   └── assets/         # Recursos estáticos (imágenes, fuentes, etc.)
├── .gitignore
├── package.json
└── README.md
```

### Scripts Disponibles

- `npm start` - Inicia la aplicación en modo desarrollo
- `npm run build` - Construye la aplicación para producción
- `npm run pack` - Empaqueta la aplicación sin crear instalador
- `npm run dist` - Crea el instalador de la aplicación

### Dependencias Principales

- Electron - Framework para aplicaciones de escritorio
- electron-builder - Para empaquetar la aplicación
- electron-store - Para almacenamiento local de configuración

## Contribución

Las contribuciones son bienvenidas. Por favor, lee nuestra [guía de contribución](CONTRIBUTING.md) para más detalles.

## Licencia

Este proyecto está licenciado bajo la licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## Soporte

Para reportar problemas o solicitar características, por favor abre un [issue](https://github.com/jsdrake/lda-uploader/issues).

---

Desarrollado con ❤️ por [JSDRAKE - LU9WT](https://www.jsdrake.com.ar)