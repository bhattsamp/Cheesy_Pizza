const test = require('node:test');
const assert = require('node:assert');
const otp = require('../server/otp');

test('email codes: send, wrong guesses, one use', async () => {
  delete process.env.BREVO_API_KEY;
  assert.equal((await otp.sendCode('a@b.co', 'ip')).status, 503);
  process.env.BREVO_API_KEY = 'k'; process.env.MAIL_FROM = 'shop@example.com';
  const sent = [];
  otp.setSender(m => { sent.push(m); });
  assert.equal((await otp.sendCode('not-an-email', 'ip')).status, 400);
  assert.deepEqual(await otp.sendCode(' Priya@Example.com ', 'ip', 1000), { ok: true });
  const code = /(\d{6})/.exec(sent[0].subject)[1];
  assert.equal(sent[0].to, 'priya@example.com');
  assert.equal((await otp.sendCode('priya@example.com', 'ip', 2000)).status, 429); // too soon
  assert.equal(otp.checkCode('priya@example.com', '000000' === code ? '111111' : '000000', 3000), false);
  assert.equal(otp.checkCode('PRIYA@example.com', code, 3000), true);
  assert.equal(otp.checkCode('priya@example.com', code, 3000), false); // used up
});

test('email codes expire and lock after five wrong guesses', async () => {
  const sent = [];
  otp.setSender(m => { sent.push(m); });
  await otp.sendCode('x@y.in', 'ip2', 0);
  const code = /(\d{6})/.exec(sent[0].subject)[1];
  assert.equal(otp.checkCode('x@y.in', code, 11 * 60 * 1000), false);
  await otp.sendCode('z@y.in', 'ip2', 0);
  const code2 = /(\d{6})/.exec(sent[1].subject)[1];
  const wrong = code2 === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) otp.checkCode('z@y.in', wrong, 1);
  assert.equal(otp.checkCode('z@y.in', code2, 1), false);
});

test('a failed email reports an error and stores no code', async () => {
  otp.setSender(() => { throw new Error('down'); });
  const r = await otp.sendCode('fail@y.in', 'ip3', 0);
  assert.equal(r.status, 502);
  assert.equal(otp.checkCode('fail@y.in', '000000', 1), false);
});
