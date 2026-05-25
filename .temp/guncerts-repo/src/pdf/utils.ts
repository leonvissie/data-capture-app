import { Asset } from 'expo-asset';
import { File as FSFile } from 'expo-file-system/next';

// ---- Base64 helpers that do not rely on atob/btoa (RN/Hermes-safe) ----
export function base64ToUint8(b64: string): Uint8Array {
  const binary = globalThis.Buffer
    ? Buffer.from(b64, 'base64').toString('binary')
    : atobPoly(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
  return bytes;
}

export function uint8ToBase64(u8: Uint8Array): string {
  if (globalThis.Buffer) return Buffer.from(u8).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.prototype.slice.call(u8, i, i + chunk)
    );
  }
  return btoaPoly(binary);
}

function atobPoly(b64: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = b64.replace(/=+$/, '');
  let output = '';
  if (str.length % 4 === 1) throw new Error('Invalid base64');
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    const idx = chars.indexOf(buffer);
    if (idx === -1) continue;
    bs = bc % 4 ? bs * 64 + idx : idx;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }
  return output;
}
function btoaPoly(bin: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let i = 0; i < bin.length; i += 3) {
    const a = bin.charCodeAt(i);
    const b = bin.charCodeAt(i + 1);
    const c = bin.charCodeAt(i + 2);
    const triple = (a << 16) | ((b || 0) << 8) | (c || 0);
    output +=
      chars[(triple >> 18) & 63] +
      chars[(triple >> 12) & 63] +
      (isNaN(b) ? '=' : chars[(triple >> 6) & 63]) +
      (isNaN(c) ? '=' : chars[triple & 63]);
  }
  return output;
}

// ---- Loaders for bundled assets ----
export async function loadAssetBytes(modRef: number): Promise<Uint8Array> {
  const asset = Asset.fromModule(modRef);
  await asset.downloadAsync();
  const file = new FSFile(asset.localUri!);
  return await file.bytes();
}

export async function loadJson<T>(modRef: number): Promise<T> {
  const asset = Asset.fromModule(modRef);
  await asset.downloadAsync();
  const text = await new FSFile(asset.localUri!).text();
  return JSON.parse(text) as T;
}

// Deep get for fieldmap value resolution (e.g., 'profile.givenNames')
export function deepGet(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
