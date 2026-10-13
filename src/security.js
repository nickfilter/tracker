// 安全工具：PBKDF2 密码哈希、SHA-256、HMAC 会话签名、PII 哈希（Node crypto）
const crypto = require('crypto');

function makeSalt(len = 16) { return crypto.randomBytes(len).toString('hex'); }

function hashPassword(pw, salt) {
  return crypto.pbkdf2Sync(String(pw), salt, 10000, 64, 'sha512').toString('hex');
}
function verifyPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  try { return hashPassword(pw, salt) === hash; } catch (e) { return false; }
}

function sha256hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function sha256b64(s) { return crypto.createHash('sha256').update(String(s)).digest('base64'); }
function hmacSign(msg, secret) { return crypto.createHmac('sha256', secret).update(String(msg)).digest('hex'); }

// session token = base64url(payload) + "." + hmac(payload)
function b64url(s) {
  return Buffer.from(String(s), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}
function signSession(username, secret, ttlSec = 60 * 60 * 24 * 7) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = b64url(JSON.stringify({ u: username, exp }));
  return payload + '.' + hmacSign(payload, secret);
}
function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (hmacSign(payload, secret) !== sig) return null;
  try {
    const obj = JSON.parse(unb64url(payload));
    if (!obj.exp || obj.exp < Math.floor(Date.now() / 1000)) return null;
    return obj.u;
  } catch (e) { return null; }
}

// ---------------- PII 哈希 ----------------
function normEmail(e) { return (e || '').trim().toLowerCase(); }
function normPhone(p) { return (p || '').replace(/[^\d]/g, ''); }
// FB：小写十六进制 SHA-256
function hashEmail(e) { const x = normEmail(e); return x ? sha256hex(x) : null; }
function hashPhone(p) { const x = normPhone(p); return x ? sha256hex(x) : null; }
// Google 增强转化：base64 编码
function hashEmailB64(e) { const x = normEmail(e); return x ? sha256b64(x) : null; }
function hashPhoneB64(p) { const x = normPhone(p); return x ? sha256b64(x) : null; }

function randomClickId(len = 16) { return crypto.randomBytes(len).toString('hex').slice(0, len); }

module.exports = {
  makeSalt, hashPassword, verifyPassword, sha256hex, sha256b64, hmacSign,
  signSession, verifySession, normEmail, normPhone,
  hashEmail, hashPhone, hashEmailB64, hashPhoneB64, randomClickId,
};
