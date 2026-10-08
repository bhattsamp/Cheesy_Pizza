// Reset the database to the starting data.
//   npm run seed              menu, outlets, offers, staff + demo orders
//   npm run seed -- --empty   same, but no demo orders (for a real shop)
const { openStore } = require('./server');
const { seedData } = require('./seed-data');

(async () => {
  const store = await openStore();
  await store.seed(seedData(), { demoOrders: !process.argv.includes('--empty') });
  console.log('Database reset:', store.uri);
  await store.close();
})().catch(e => { console.error(e.message); process.exit(1); });
