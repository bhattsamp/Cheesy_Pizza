// After `cap sync`, gives the Admin app its own copy of the Capacitor config that tells the
// page it is the Admin app (POS only). The customer app keeps the copy in src/main.
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'android', 'app', 'src');
const config = JSON.parse(fs.readFileSync(path.join(APP, 'main', 'assets', 'capacitor.config.json'), 'utf8'));
config.appId = 'com.cheesypizza.admin';
config.appName = 'Cheesy Pizza Admin';
config.appendUserAgent = String(config.appendUserAgent || '').replace('CheesyApp/customer', 'CheesyApp/admin') || 'CheesyApp/admin';
fs.mkdirSync(path.join(APP, 'admin', 'assets'), { recursive: true });
fs.writeFileSync(path.join(APP, 'admin', 'assets', 'capacitor.config.json'), JSON.stringify(config, null, '\t') + '\n');
console.log('Wrote the Admin app config');
