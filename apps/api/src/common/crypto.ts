import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacHex(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Numeric one-time code (OTP / handover / claim) from a CSPRNG. */
export function numericCode(digits = 6): string {
  return randomInt(0, 10 ** digits).toString().padStart(digits, '0');
}

/** Human-typable claim code: 10 chars from an unambiguous alphabet. */
export function claimCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
}

// ───────────── CSRF (signed double-submit bound to the session) ─────────────

export function issueCsrfToken(secret: string, sessionKey: string): string {
  const nonce = randomToken(16);
  return `${nonce}.${hmacHex(secret, `csrf:${sessionKey}:${nonce}`)}`;
}

export function verifyCsrfToken(secret: string, sessionKey: string, token: string | undefined): boolean {
  if (!token) return false;
  const [nonce, mac] = token.split('.');
  if (!nonce || !mac) return false;
  return safeEqual(mac, hmacHex(secret, `csrf:${sessionKey}:${nonce}`));
}

// ───────────── Symmetric encryption for secrets at rest (MFA seeds) ─────────────

export function encryptSecret(keyB64: string, plaintext: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(keyB64: string, payload: string): string {
  const [v, iv, tag, data] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyB64, 'base64'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

// ───────────── TOTP (RFC 6238, HMAC-SHA1, 30 s, 6 digits) ─────────────

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(key: Buffer, counter: bigint, digits = 6, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const mac = createHmac(algorithm, key).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}

export function totp(key: Buffer, atMs: number, stepSec = 30, digits = 6, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  return hotp(key, BigInt(Math.floor(atMs / 1000 / stepSec)), digits, algorithm);
}

/** Accepts the current step ± `window` steps to tolerate clock drift. */
export function verifyTotp(secretB32: string, code: string, atMs = Date.now(), window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secretB32);
  for (let w = -window; w <= window; w++) {
    if (safeEqual(totp(key, atMs + w * 30_000), code)) return true;
  }
  return false;
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function recoveryCodes(n = 8): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () =>
    Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => alphabet[randomInt(0, alphabet.length)]).join('')).join('-'),
  );
}

// ───────────── Signed, expiring attachment links ─────────────

export function signAttachmentLink(secret: string, attachmentId: string, userId: string, expiresAtMs: number): string {
  return hmacHex(secret, `att:${attachmentId}:${userId}:${expiresAtMs}`);
}

export function verifyAttachmentLink(secret: string, attachmentId: string, userId: string, expiresAtMs: number, sig: string, now = Date.now()): boolean {
  return expiresAtMs > now && safeEqual(signAttachmentLink(secret, attachmentId, userId, expiresAtMs), sig);
}
