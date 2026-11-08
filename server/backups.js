// Daily backups: once a day the server saves the whole shop's data (gzipped) in the backups
// collection and keeps the last 30 days, so a wrong delete can be undone. The owner lists and
// downloads them from Reports › Backup & export with their PIN.
const zlib = require('zlib');

const KEEP_DAYS = 30;
const istDate = (t = Date.now()) => new Date(t + 330 * 60000).toISOString().slice(0, 10); // the shop's day (India)

async function backupNow(store, M) {
  const date = istDate();
  if (await M.Backup.exists({ _id: date })) return null;
  const { state, version } = await store.readState();
  const data = zlib.gzipSync(JSON.stringify({ exportedAt: new Date().toISOString(), version, ...state }));
  if (data.length > 15 * 1024 * 1024) { console.warn('Daily backup too big to keep in the database:', data.length); return null; }
  await M.Backup.create({ _id: date, data, size: data.length, ts: Date.now() });
  await M.Backup.deleteMany({ _id: { $lt: istDate(Date.now() - KEEP_DAYS * 86400e3) } });
  console.log('Daily backup saved for', date, Math.round(data.length / 1024), 'KB');
  return date;
}

function schedule(store, M) {
  const run = () => backupNow(store, M).catch(e => console.warn('Daily backup failed:', e.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 3 * 3600 * 1000).unref();
}

function routes(app, store, M) {
  const owner = async (req, res) => {
    const { staffId, pin } = req.body || {};
    const s = staffId && await M.Staff.findById(String(staffId)).lean();
    if (!s || s.role !== 'owner' || !(await store.checkStaffPin(staffId, pin))) { res.status(403).json({ error: 'Wrong owner PIN' }); return false; }
    return true;
  };
  app.post('/api/backups', async (req, res) => {
    if (!(await owner(req, res))) return;
    const days = (await M.Backup.find({}, { size: 1, ts: 1 }).sort({ _id: -1 }).lean()).map(b => ({ date: b._id, size: b.size, ts: b.ts }));
    res.json({ days });
  });
  app.post('/api/backups/get', async (req, res) => {
    if (!(await owner(req, res))) return;
    const b = await M.Backup.findById(String((req.body || {}).date || '')).lean();
    if (!b) return res.status(404).json({ error: 'No backup for that day' });
    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', `attachment; filename="cheesy-pizza-backup-${b._id}.json"`);
    res.send(zlib.gunzipSync(b.data.buffer ? Buffer.from(b.data.buffer) : b.data));
  });
}

module.exports = { routes, schedule, backupNow, istDate };
