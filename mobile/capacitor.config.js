// Without a server address the app runs offline: www/ (built by `npm run build`)
// holds the whole site and keeps its data on the phone only.
// With an address, the app opens that Cheesy Pizza server full screen instead, so
// the phone shares the same live menu, orders and POS as every other device:
//   CHEESY_SERVER_URL=https://your-server.example.com npm run sync
const serverUrl = (process.env.CHEESY_SERVER_URL || '').trim().replace(/\/+$/, '');

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.cheesypizza.app',
  appName: 'Cheesy Pizza',
  webDir: 'www',
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
