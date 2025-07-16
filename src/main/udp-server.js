const dgram = require('dgram');
const EventEmitter = require('events');

class UDPServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.port = null;
  }

  start(port) {
    // If already running on the same port, do nothing
    if (this.server && this.port === port) return;

    // If running on a different port, close existing server
    if (this.server) {
      this.stop();
    }

    this.port = port;
    this.server = dgram.createSocket('udp4');

    this.server.on('error', (err) => {
      console.error(`UDP Server error:\n${err.stack}`);
      this.server.close();
      this.emit('error', err);
    });

    this.server.on('message', (msg, rinfo) => {
      try {
        const message = msg.toString();
        console.log(`UDP message from ${rinfo.address}:${rinfo.port}: ${message}`);
        this.emit('message', {
          software: this.getSoftwareByPort(this.port),
          message: message,
          remote: rinfo,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Error processing UDP message:', error);
      }
    });

    this.server.on('listening', () => {
      const address = this.server.address();
      console.log(`UDP Server listening on ${address.address}:${address.port}`);
      this.emit('listening', { port: address.port });
    });

    this.server.bind(port);
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = null;
      this.emit('stopped');
    }
  }

  getSoftwareByPort(port) {
    const portMap = {
      2233: 'log4om',
      2333: 'wsjtx',
      12060: 'n1mm'
    };
    return portMap[port] || 'unknown';
  }
}

module.exports = new UDPServer();
