// Five sample famous visitors (made-up people, drawn portraits, food photos and short clips from img/) so the
// famous visitors slider has something to show. Added once, on the first start after this ships, to every
// outlet that has no visitors yet; the owner edits or deletes them in Admin → Famous visitors and they never come back.
const SAMPLE_VIPS = [
  { id: 'vs1', name: 'Aarav Mehta', role: 'Film actor', note: 'Loved our 5 Cheese pizza!', photo: 'img/vip-demo/guest-1.jpg',
    media: [['img/fivecheese.jpg'], ['img/vip-demo/clip-1.mp4', 'video'], ['img/garlicbread.jpg']] },
  { id: 'vs2', name: 'Diya Sharma', role: 'Playback singer', note: 'Sang for our team after dinner', photo: 'img/vip-demo/guest-2.jpg', look: 'night',
    media: [['img/vip-demo/clip-2.mp4', 'video'], ['img/margherita.jpg'], ['img/doublecheese.jpg'], ['img/fries.jpg']] },
  { id: 'vs3', name: 'Kabir Joshi', role: 'Cricketer', note: 'Two pizzas after the match!', photo: 'img/vip-demo/guest-3.jpg', look: 'teal',
    media: [['img/vip-demo/clip-3.mp4', 'video'], ['img/garlicpockets.jpg']] },
  { id: 'vs4', name: 'Meera Desai', role: 'TV anchor', note: 'Our garlic bread is her favourite', photo: 'img/vip-demo/guest-4.jpg',
    media: [['img/vip-demo/clip-4.mp4', 'video']] },
  { id: 'vs5', name: 'Rohan Patel', role: 'Food blogger', note: 'Rated us 5 stars', photo: 'img/vip-demo/guest-5.jpg', look: 'night',
    media: [['img/masalabread.jpg'], ['img/vip-demo/clip-5.mp4', 'video'], ['img/paneerpockets.jpg'], ['img/fivecheese.jpg'], ['img/mexican.jpg']] },
].map(v => ({ ...v, media: v.media.map(([url, type]) => ({ url, type: type || 'image' })) }));

async function addSampleVisitors(store) {
  if (await store.getSetting('sampleVips', false)) return 0;
  const outlets = await store.readCollection('outlets');
  const changed = outlets.filter(o => !((o.display || {}).vips || []).length)
    .map(o => ({ ...o, display: { ...(o.display || {}), vips: SAMPLE_VIPS.map(v => ({ ...v, media: v.media.map(m => ({ ...m })) })) } }));
  if (changed.length) await store.applyChanges({ upsert: { outlets: changed } });
  await store.setSetting('sampleVips', true);
  return changed.length;
}

module.exports = { addSampleVisitors, SAMPLE_VIPS };
