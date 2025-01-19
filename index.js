var dgram = require('dgram');
var crc32 = require('buffer-crc32');

function BattleEyeClientReforger (ip, port, password) {
  this.socket = dgram.createSocket("udp4");
  this.ip = ip;
  this.port = port;
  this.password = password;
  this.messageHandler = undefined;
  this.timeoutHandler = undefined;
  this.sequenceNumber = 0;
  this.loggedIn = false;
  this.lastResponse = 0;
  this.lastCommand = 0;
  this.error = false;
  this.interval = undefined;
  this.multipacket = undefined;
}

BattleEyeClientReforger.prototype = {
  constructor: BattleEyeClientReforger,

  connect: function () {
    this.socket.parent = this;
    this.socket.bind();

    this.socket.on("error", function (err) {
      console.log("Socket error: " + err);
    });

    this.socket.on("message", function(message /*, requestInfo*/) {
      this.parent.lastResponse = new Date().getTime();
      var buffer = new Buffer(message);

      // Deal with login response
      if (buffer[7] === 0x00) {
        if (buffer[8] === 0x01) {
          this.parent.loggedIn = true;
        } else if (buffer[8] === 0x00) {
          console.log("Login failed");
          this.parent.close();
          this.parent.loggedIn = false;
          this.parent.error = true;
        } else {
          console.log("Unknown error");
          this.parent.error = true;
        }
        return;
      }

      // Deal with server message (type 0x02)
      if (buffer[7] === 0x02) {
        // The server echoes our sequence number in buffer[8], so we ACK that
        this.parent.acknowledge(buffer[8]);

        // Removed the line that overwrote this.parent.sequenceNumber = buffer[8];

        // Call user's handler
        if (this.parent.messageHandler) {
          const msg = this.parent.stripHeaderServerMessage(buffer).toString();
          this.parent.messageHandler(msg);
        }
        return;
      }

      // Deal with multi-packet (type 0x01 with buffer[8] == 0 and buffer[9] == 0)
      if (buffer[7] === 0x01 && buffer[8] === 0 && buffer[9] === 0) {
        if (buffer[11] === 0) {
          this.parent.multipacket = new Array(buffer[10]);
        }
        if (this.parent.multipacket && this.parent.multipacket.length === buffer[10]) {
          this.parent.multipacket[buffer[11]] = this.parent.stripHeaderMultipacket(buffer);
        }
        if ((buffer[11] + 1) === buffer[10]) {
          var total = "";
          for (var i = 0; i < this.parent.multipacket.length; i++) {
            total += this.parent.multipacket[i].toString();
          }
          if (this.parent.messageHandler) {
            this.parent.messageHandler(total);
          }
          this.parent.multipacket = undefined;
        }
        return;
      }

      // Deal with single command responses (type 0x01)
      if (buffer[7] === 0x01) {
        if (this.parent.messageHandler) {
          const msg = this.parent.stripHeaderServerMessage(buffer).toString();
          this.parent.messageHandler(msg);
        }
      }
    });

    // Send login
    this.login();

    // Keep-alive ping every 25 seconds
    this.interval = setInterval(function(client) {
      client.keepAlive();
    }, 25000, this);
  },

  sendCommand: function(command) {
    // Use and then increment our stored sequenceNumber
    var seq = this.sequenceNumber & 0xff;
    this.sequenceNumber++;

    var buffer = new Buffer(command.length + 2);
    buffer[0] = 0x01;       // "command" type
    buffer[1] = seq;        // sequence number
    for (var i = 0; i < command.length; i++) {
      buffer[2 + i] = command.charCodeAt(i);
    }

    var packet = this.buildPacket(buffer);
    setTimeout(this.timeout, 3000, this);
    this.send(packet);
  },

  send: function (data) {
    if (this.error) return;
    this.lastCommand = new Date().getTime();
    this.socket.send(data, 0, data.length, this.port, this.ip);
  },

  acknowledge: function(sequenceNumber) {
    var buffer = new Buffer(2);
    buffer[0] = 0x02;           // "ack" type
    buffer[1] = sequenceNumber; // the seq number we are acking
    var packet = this.buildPacket(buffer);
    this.send(packet);
  },

  keepAlive: function () {
    if (!this.loggedIn) return;
    var buffer = new Buffer(3);
    buffer[0] = 0x01;
    buffer[1] = 0;
    buffer[2] = 0;
    this.send(this.buildPacket(buffer));
  },

  buildPacket: function (command) {
    // Create a buffer [7 bytes of header + command length]
    var buffer = new Buffer(7 + command.length);

    // Header "BE"  
    buffer[0] = 0x42; // 'B'
    buffer[1] = 0x45; // 'E'

    // Build an nbuffer of [0xFF + command data], for CRC
    var nbuffer = new Buffer(1 + command.length);
    nbuffer[0] = 0xFF;
    for (var i = 0; i < command.length; i++) {
      nbuffer[1 + i] = command[i];
    }

    // Compute CRC
    var crc = crc32(nbuffer);
    // Copy CRC into our main buffer (4 bytes, reversed order)
    for (var i = 0; i < 4; i++) {
      buffer[5 - i] = crc[i];
    }

    // Copy the nbuffer (0xFF + command) into buffer at index 6
    for (var j = 0; j < nbuffer.length; j++) {
      buffer[6 + j] = nbuffer[j];
    }

    return buffer;
  },

  buildLoginPacket: function() {
    var buffer = new Buffer(this.password.length + 1);
    buffer[0] = 0x00; // "login" type
    for (var i = 0; i < this.password.length; i++) {
      buffer[1 + i] = this.password.charCodeAt(i);
    }
    return this.buildPacket(buffer);
  },

  login: function () {
    var packet = this.buildLoginPacket();
    setTimeout(this.timeout, 3000, this);
    this.send(packet);
  },

  timeout: function(client) {
    // If >3s since last response, assume connection failed
    if ((new Date().getTime() - client.lastResponse) >= 3000) {
      client.close();
    }
  },

  // Utility to strip headers for messages
  stripHeader: function(message) {
    var buffer = new Buffer(message.length - 7);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = message[i + 7];
    }
    return buffer;
  },

  stripHeaderServerMessage: function(message) {
    var buffer = new Buffer(message.length - 9);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = message[i + 9];
    }
    return buffer;
  },

  stripHeaderMultipacket: function(message) {
    var buffer = new Buffer(message.length - 12);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = message[i + 12];
    }
    return buffer;
  },

  close: function() {
    clearInterval(this.interval);
    this.socket.unref();
    this.socket.close();
    if (this.timeoutHandler) {
      this.timeoutHandler();
    }
  }
};

module.exports = BattleEyeClientReforger
