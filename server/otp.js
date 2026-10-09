// Email codes for customer sign-up, sent free through Brevo's email API (300 emails a day
// on the free plan). Needs BREVO_API_KEY and MAIL_FROM (a sender address verified in Brevo);
// without them sign-up works as before, with no code.
const crypto = require('crypto');

const TTL = 10 * 60 * 1000;    // a code works for 10 minutes
const RESEND = 45 * 1000;      // one email per address every 45 seconds
const TRIES = 5;               // wrong guesses before the code stops working
const PER_IP = 10;             // emails per IP address per hour
const codes = new Map();       // email -> { hash, exp, tries, sent }
const ips = new Map();         // ip -> [send times]
let sender = mail => sendBrevo(mail);

const otpEnabled = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
const setSender = fn => { sender = fn; }; // for tests
const cleanEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const hash = (email, code) => crypto.createHash('sha256').update(email + '|' + code).digest('hex');

async function sendBrevo({ to, subject, text, html }) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: process.env.MAIL_FROM, name: 'Cheesy Pizza' }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
  });
  if (!r.ok) throw new Error('Brevo ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

// Returns { ok } or { status, error } for the API to pass on
async function sendCode(rawEmail, ip, now = Date.now()) {
  if (!otpEnabled()) return { status: 503, error: 'Email codes are not set up' };
  const email = cleanEmail(rawEmail);
  if (!validEmail(email)) return { status: 400, error: 'Enter a valid email address.' };
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k);
  const prev = codes.get(email);
  if (prev && now - prev.sent < RESEND) return { status: 429, error: 'A code was just sent. Wait a few seconds and try again.' };
  const recent = (ips.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= PER_IP) return { status: 429, error: 'Too many codes sent. Try again later.' };
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  try {
    await sender({
      to: email,
      subject: `${code} is your Cheesy Pizza code`,
      text: `Your Cheesy Pizza sign-up code is ${code}. It works for 10 minutes. If you did not ask for it, ignore this email.`,
      html: `<p>Your Cheesy Pizza sign-up code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It works for 10 minutes. If you did not ask for it, ignore this email.</p>`,
    });
  } catch (e) {
    console.error('Email code failed:', e.message);
    return { status: 502, error: 'Could not send the email. Try again.' };
  }
  ips.set(ip, [...recent, now]);
  codes.set(email, { hash: hash(email, code), exp: now + TTL, tries: 0, sent: now });
  return { ok: true };
}

// A right code works once
function checkCode(rawEmail, code, now = Date.now()) {
  const email = cleanEmail(rawEmail);
  const c = codes.get(email);
  if (!c || c.exp < now || c.tries >= TRIES) return false;
  if (hash(email, String(code || '').trim()) !== c.hash) { c.tries++; return false; }
  codes.delete(email);
  return true;
}

module.exports = { otpEnabled, setSender, sendCode, checkCode };
