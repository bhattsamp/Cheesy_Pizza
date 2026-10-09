// Without a server address the app runs offline: www/ (built by `npm run build`)
// holds the whole site and keeps its data on the phone only.
// With an address, the app opens that Cheesy Pizza server full screen instead, so
// the phone shares the same live menu, orders and POS as every other device:
//   CHEESY_SERVER_URL=https://your-server.example.com npm run sync
const fs = require('fs');
const path = require('path');

const serverUrl = (process.env.CHEESY_SERVER_URL || '').trim().replace(/\/+$/, '');

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.cheesypizza.app',
  appName: 'Cheesy Pizza',
  webDir: 'www',
  // Tells the page this is the customer app; scripts/admin-config.js sets CheesyApp/admin for the Admin app
  // CheesyPush marks builds with Firebase set up (android/app/google-services.json), so the
  // Admin app can sign up for new-order alerts that ring while it is closed.
  appendUserAgent: 'CheesyApp/customer' + (fs.existsSync(path.join(__dirname, 'android', 'app', 'google-services.json')) ? ' CheesyPush' : ''),
  android: { allowMixedContent: serverUrl.startsWith('http:') },
};

if (serverUrl) {
  config.server = {
    url: serverUrl,
    // Plain http is only allowed when the address itself is http (a shop LAN IP).
    cleartext: serverUrl.startsWith('http:'),
  };
}

module.exports = config;
