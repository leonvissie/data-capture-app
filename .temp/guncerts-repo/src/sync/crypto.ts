import CryptoJS from 'crypto-js';

export type SyncEnvelope = {
  v: 1;
  alg: 'aes-256-cbc';
  iv: string;
  ct: string;
  fmt: 'b64';
  mime?: string;
  name?: string;
};

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  return bytes;
}

function bytesToHex(u8: Uint8Array) {
  return Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToWordArray(hex: string) {
  return CryptoJS.enc.Hex.parse(hex);
}

export function encryptBase64WithDek(
  base64: string,
  dekHex: string,
  meta?: { mime?: string; name?: string }
): SyncEnvelope {
  const iv = randomBytes(16);
  const ivHex = bytesToHex(iv);
  const key = hexToWordArray(dekHex);
  const data = CryptoJS.enc.Base64.parse(base64);
  const enc = CryptoJS.AES.encrypt(data, key, { iv: hexToWordArray(ivHex) });
  return {
    v: 1,
    alg: 'aes-256-cbc',
    iv: ivHex,
    ct: CryptoJS.enc.Base64.stringify(enc.ciphertext),
    fmt: 'b64',
    mime: meta?.mime,
    name: meta?.name,
  };
}

export function encryptTextWithDek(
  text: string,
  dekHex: string,
  meta?: { mime?: string; name?: string }
): SyncEnvelope {
  const base64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text));
  return encryptBase64WithDek(base64, dekHex, meta);
}

export function sha256Base64(base64: string): string {
  const wa = CryptoJS.enc.Base64.parse(base64);
  return CryptoJS.SHA256(wa).toString(CryptoJS.enc.Hex);
}
