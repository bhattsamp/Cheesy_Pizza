// The app is a thin shell around the Cheesy Pizza server: it opens the server's
// address full screen, so the phone uses the same live menu, orders and POS as
// every other device. Set the address when building:
//   CHEESY_SERVER_URL=https://your-server.example.com npx cap sync
// Without it, the app shows the page in www/ explaining what to set.
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
