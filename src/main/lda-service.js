import axios from 'axios';

export default class LdaService {
  constructor(config) {
    this.config = config;
    this.baseUrl = 'https://www.lda.ar/php';
  }

  // Mapeo de bandas a formato LdA
  bandMap = {
    '160m': '160m',
    '80m': '80m',
    '40m': '40m',
    '30m': '30m',
    '20m': '20m',
    '17m': '17m',
    '15m': '15m',
    '12m': '12m',
    '10m': '10m',
    '6m': '6m',
    '2m': '2m',
    '70cm': '70cm',
    '23cm': '23cm',
    '13cm': '13cm',
    '9cm': '9cm',
    '6cm': '6cm',
    '3cm': '3cm',
    '1.25cm': '1.25cm',
  };

  // Mapeo de modos a formato LdA
  modeMap = {
    CW: 'CW',
    SSB: 'SSB',
    USB: 'SSB',
    LSB: 'SSB',
    FM: 'FM',
    AM: 'AM',
    RTTY: 'RTTY',
    FT8: 'FT8',
    FT4: 'FT4',
    PSK: 'PSK',
    PSK31: 'PSK',
    PSK63: 'PSK',
    JT65: 'JT65',
    JT9: 'JT9',
    SSTV: 'SSTV',
    ATV: 'ATV',
    // Mapeo para modos digitales más comunes
    DIGITALVOICE: 'DV',
    DIGI: 'DIG',
    DIG: 'DIG',
    MFSK: 'MFSK',
    OLIVIA: 'OLIVIA',
    JT4: 'JT4',
    JT6M: 'JT6M',
    JT44: 'JT44',
    QRA64: 'QRA64',
    T10: 'T10',
    WSPR: 'WSPR',
    MSK144: 'MSK144',
    FT8: 'FT8',
    FT4: 'FT4',
  };

  // Convertir fecha de ADIF a formato LdA
  formatDate(adifDate) {
    // Formato: YYYYMMDD -> DD/MM/YYYY
    const year = adifDate.substring(0, 4);
    const month = adifDate.substring(4, 6);
    const day = adifDate.substring(6, 8);
    return `${day}/${month}/${year}`;
  }

  // Validar banda
  isValidBand(band) {
    return this.bandMap[band.toLowerCase()] !== undefined;
  }

  // Validar modo
  isValidMode(mode) {
    return this.modeMap[mode.toUpperCase()] !== undefined;
  }

  // Enviar QSO a LdA
  async sendQso(qsoData) {
    try {
      console.log('Datos QSO recibidos:', JSON.stringify(qsoData, null, 2));
      const { call, band, mode, date, time, rst, message = '', stationCallsign } = qsoData;
      const { user, password, myCall } = this.config;
      
      // Usar el stationCallsign del mensaje si está disponible, de lo contrario usar el de la configuración
      const txCall = stationCallsign || myCall;
      
      if (!txCall) {
        throw new Error('No se pudo determinar el indicativo de la estación (stationCallsign o myCall)');
      }

      // Validar datos requeridos
      if (!user || !password || !myCall) {
        const errorMsg = 'Falta configuración de usuario, contraseña o indicativo';
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      if (!call) throw new Error('Falta call del corresponsal');
      if (!band) throw new Error('Falta banda');
      if (!mode) throw new Error('Falta modo');
      if (!date) throw new Error('Falta fecha');
      if (!time) throw new Error('Falta hora');
      if (!rst) throw new Error('Falta RST');

      // Validar formato de banda y modo
      if (!this.isValidBand(band)) {
        const errorMsg = `Banda no admitida en LdA: ${band}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      if (!this.isValidMode(mode)) {
        const errorMsg = `Modo no admitido en LdA: ${mode}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Preparar parámetros
      const params = new URLSearchParams();
      params.append('user', user);
      params.append('pass', password);
      params.append('micall', txCall); // Usar el indicativo de la estación del mensaje
      params.append('sucall', call);

      const bandValue = this.bandMap[band.toLowerCase()];
      const modeValue = this.modeMap[mode.toUpperCase()];

      console.log(`Enviando QSO a LdA: ${txCall} -> ${call} en ${bandValue} ${modeValue}`);

      params.append('banda', bandValue);
      params.append('modo', modeValue);

      // Usar formato de fecha ADIF (subeqso2.php)
      // Asegurarse de que la fecha esté en formato YYYYMMDD
      const formattedDate = date.includes('-') ? date.replace(/-/g, '') : date;
      params.append('fecha', formattedDate);

      // Formatear hora (asumimos formato HHMMSS o HHMM)
      const formattedTime = time.length === 6 ? time.substring(0, 4) : time;
      params.append('hora', formattedTime);

      params.append('rst', rst);

      // Asegurarse de que el mensaje no sea undefined
      const cleanMessage = message ? message.substring(0, 100) : '';
      params.append('x_qslMSG', cleanMessage);

      console.log('Parámetros de la petición:', params.toString());

      // Hacer la petición
      const url = `${this.baseUrl}/subeqso2.php?${params.toString()}`;
      console.log('URL de la petición:', url);

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'LDA-Uploader/1.0',
          Accept: 'text/plain',
          'Cache-Control': 'no-cache',
        },
      });

      // Verificar respuesta
      const result = response.data ? response.data.trim() : 'Sin respuesta del servidor';
      console.log('Respuesta de LdA:', result);

      if (result.includes('Error') || result.includes('Falta') || result.includes('no existe')) {
        const errorMsg = `Error en LdA: ${result}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      console.log('QSO enviado correctamente a LdA');
      return {
        success: true,
        message: result,
        data: qsoData,
      };
    } catch (error) {
      const errorDetails = {
        message: error.message,
        response: error.response
          ? {
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data,
            }
          : 'No response',
        config: error.config
          ? {
              url: error.config.url,
              method: error.config.method,
              params: error.config.params,
            }
          : 'No config',
      };

      console.error('Error detallado al enviar QSO a LdA:', JSON.stringify(errorDetails, null, 2));

      return {
        success: false,
        message: error.response?.data || error.message,
        error: errorDetails,
      };
    }
  }
}
