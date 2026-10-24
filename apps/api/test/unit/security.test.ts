import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../../src/common/csv.js';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hotp,
  issueCsrfToken,
  recoveryCodes,
  signAttachmentLink,
  totp,
  verifyAttachmentLink,
  verifyCsrfToken,
  verifyTotp,
} from '../../src/common/crypto.js';

const RFC_KEY = Buffer.from('12345678901234567890');

describe('one-time passwords', () => {
  it('matches the RFC 4226 HOTP test vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => expect(hotp(RFC_KEY, BigInt(counter))).toBe(code));
  });

  it('matches the RFC 6238 TOTP test vectors (SHA-1, 8 digits)', () => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [t, code] of vectors) expect(totp(RFC_KEY, t * 1000, 30, 8)).toBe(code);
  });

  it('accepts one step of clock drift and rejects older codes', () => {
    const secret = base32Encode(RFC_KEY);
    expect(base32Decode(secret).equals(RFC_KEY)).toBe(true);
    const now = 1_800_000_000_000;
    const current = totp(RFC_KEY, now);
    expect(verifyTotp(secret, current, now)).toBe(true);
    expect(verifyTotp(secret, totp(RFC_KEY, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(RFC_KEY, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false);
  });

  it('recovery codes have the format the sign-in form accepts', () => {
    for (const c of recoveryCodes(8)) expect(c).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
  });
});

describe('CSRF tokens are bound to the session', () => {
  it('verifies only for the session and secret that issued it', () => {
    const token = issueCsrfToken('secret-a', 'session-1');
    expect(verifyCsrfToken('secret-a', 'session-1', token)).toBe(true);
    expect(verifyCsrfToken('secret-a', 'session-2', token)).toBe(false);
    expect(verifyCsrfToken('secret-b', 'session-1', token)).toBe(false);
    expect(verifyCsrfToken('secret-a', 'session-1', `${token.split('.')[0]}.deadbeef`)).toBe(false);
    expect(verifyCsrfToken('secret-a', 'session-1', undefined)).toBe(false);
  });
});

describe('private attachment links', () => {
  it('expire and cannot be reused by another user', () => {
    const now = 1_800_000_000_000;
    const sig = signAttachmentLink('k', 'att-1', 'user-1', now + 60_000);
    expect(verifyAttachmentLink('k', 'att-1', 'user-1', now + 60_000, sig, now)).toBe(true);
    expect(verifyAttachmentLink('k', 'att-1', 'user-2', now + 60_000, sig, now)).toBe(false);
    expect(verifyAttachmentLink('k', 'att-2', 'user-1', now + 60_000, sig, now)).toBe(false);
    expect(verifyAttachmentLink('k', 'att-1', 'user-1', now + 60_000, sig, now + 61_000)).toBe(false);
  });
});

describe('secrets at rest', () => {
  it('round-trips with AES-256-GCM and detects tampering', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const enc = encryptSecret(key, 'JBSWY3DPEHPK3PXP');
    expect(enc).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(key, enc)).toBe('JBSWY3DPEHPK3PXP');
    const parts = enc.split('.');
    const flipped = Buffer.from(parts[3]!, 'base64url');
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret(key, [parts[0], parts[1], parts[2], flipped.toString('base64url')].join('.'))).toThrow();
  });
});

describe('CSV exports cannot carry formulas', () => {
  it('neutralises formula prefixes and quotes separators', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+2348012345678')).toBe("'+2348012345678");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('Ibadan, Oyo')).toBe('"Ibadan, Oyo"');
    expect(csvCell(12345n)).toBe('12345');
    expect(csvCell(null)).toBe('');
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\r\n1,x');
  });
});
