export function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s+/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(cleaned);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = cleaned.replace(/=+$/, '');
  const output = [] as number[];
  let bc = 0;
  let bs = 0;
  let buffer: number;
  let idx = 0;

  while ((buffer = str.charCodeAt(idx++))) {
    const value = chars.indexOf(String.fromCharCode(buffer));
    if (value === -1) continue;
    bs = (bs << 6) | value;
    bc += 6;
    if (bc >= 8) {
      bc -= 8;
      output.push((bs >> bc) & 0xff);
    }
  }
  return Uint8Array.from(output);
}
