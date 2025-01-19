# Description
A BattleEye Client for node.js. Used for Arma Reforger.

# Installation
```
npm install battle-eye-client
replace index.js with this forked version
```
# Example Usage
```js
const BattleEyeClientReforger = require('battle-eye-client-reforger');

const config = {
  server: {
    host: "127.0.0.1",
    rconPort: 2302,
    rconPassword: "mySecretPassword"
  }
};

const { host, rconPort, rconPassword } = config.server;
const battleEyeClient = new BattleEyeClientReforger(host, rconPort, rconPassword);

// Handle incoming server messages
battleEyeClient.messageHandler = function (message) {
  console.log("Server Response:", message);
};

// Handle timeouts
battleEyeClient.timeoutHandler = function () {
  console.error("Connection timed out.");
  battleEyeClient.disconnect();
  process.exit(1);
};

// Connect to the RCON server
battleEyeClient.connect();

// After successful login, send commands, e.g.:
battleEyeClient.sendCommand("players");
```

# Dependencies
buffer-crc32

# License
MIT
