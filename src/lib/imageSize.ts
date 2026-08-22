// Minimal image dimension sniffing from file headers — no native image deps.
// Returns null dimensions for anything unrecognized (including video).

export interface Dimensions {
  width: number;
  height: number;
}

function u32be(b: Buffer, o: number): number {
  return b.readUInt32BE(o);
}
function u16be(b: Buffer, o: number): number {
  return b.readUInt16BE(o);
}
function u16le(b: Buffer, o: number): number {
  return b.readUInt16LE(o);
}

function png(b: Buffer): Dimensions | null {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpeg(b: Buffer): Dimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) {
      o += 1;
      continue;
    }
    const marker = b[o + 1];
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
    }
    const len = u16be(b, o + 2);
    if (len < 2) return null;
    o += 2 + len;
  }
  return null;
}

function gif(b: Buffer): Dimensions | null {
  if (b.length < 10) return null;
  if (b.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

function webp(b: Buffer): Dimensions | null {
  if (b.length < 30) return null;
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    // Lossy: frame tag at 20; start code 9d 01 2a at 23; dimensions at 26/28.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
    const height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
    return { width, height };
  }
  if (chunk === "VP8X") {
    const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { width, height };
  }
  return null;
}

function svg(b: Buffer): Dimensions | null {
  const head = b.toString("utf8", 0, Math.min(b.length, 2048));
  if (!head.includes("<svg")) return null;
  const w = /\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/i.exec(head);
  const h = /\bheight\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/i.exec(head);
  if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
  const vb = /\bviewBox\s*=\s*["']?[\d.+-]+[\s,]+[\d.+-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(head);
  if (vb) return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
  return null;
}

export function imageSize(buffer: Buffer, mime: string): Dimensions | null {
  try {
    if (mime === "image/png") return png(buffer);
    if (mime === "image/jpeg") return jpeg(buffer);
    if (mime === "image/gif") return gif(buffer);
    if (mime === "image/webp") return webp(buffer);
    if (mime === "image/svg+xml") return svg(buffer);
    return null;
  } catch {
    return null;
  }
}
