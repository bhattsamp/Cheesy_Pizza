// Gives each app its own Firebase config: the customer app (com.cheesypizza.app) and the
// Admin app (com.cheesypizza.admin) each get notifications only when the Firebase project
// has that app registered. An app that is missing builds fine, just without notifications.
//   node scripts/firebase-config.js [path/to/google-services.json]
const fs = require('fs');
const path = require('path');

const FLAVORS = { customer: 'com.cheesypizza.app', admin: 'com.cheesypizza.admin' };
const SRC = path.join(__dirname, '..', 'android', 'app', 'src');
const file = process.argv[2] || path.join(__dirname, '..', 'firebase', 'google-services.json');

const config = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const [flavor, pkg] of Object.entries(FLAVORS)) {
  const out = path.join(SRC, flavor, 'google-services.json');
  const client = (config.client || []).filter(c => c.client_info && c.client_info.android_client_info &&
    c.client_info.android_client_info.package_name === pkg);
  if (!client.length) {
    fs.rmSync(out, { force: true });
    console.log(`::warning::${pkg} is not in the Firebase project, so this app is built without notifications. Add it in Firebase > Project settings > Add app > Android.`);
    continue;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...config, client }, null, 2) + '\n');
  console.log(`Firebase set up for ${pkg}: it can get notifications while closed`);
}
