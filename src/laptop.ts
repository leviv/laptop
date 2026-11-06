import * as THREE from 'three';
import { loadImage } from './util';

// The lid as a rounded rectangle in world units (1 unit = 1 design px).
// Measured from the Figma render (public/laptop.png is the lid crop).
// The SDF below is what the stickers wrap around.

export interface Surface {
  w: number;
  h: number;
  cornerRadius: number;
}

export const SURFACE: Surface = { w: 1180, h: 822, cornerRadius: 32 };

/** signed distance to the rounded-rect edge, >0 outside. Also writes outward normal. */
export function surfaceSDF(x: number, y: number, s: Surface, n?: { x: number; y: number }) {
  const hx = s.w / 2 - s.cornerRadius,
    hy = s.h / 2 - s.cornerRadius;
  const qx = Math.abs(x) - hx,
    qy = Math.abs(y) - hy;
  const ox = Math.max(qx, 0),
    oy = Math.max(qy, 0);
  const outside = Math.hypot(ox, oy);
  const inside = Math.min(Math.max(qx, qy), 0);
  const d = outside + inside - s.cornerRadius;
  if (n) {
    if (outside > 1e-6) {
      n.x = (ox / outside) * Math.sign(x || 1);
      n.y = (oy / outside) * Math.sign(y || 1);
    } else if (qx > qy) {
      n.x = Math.sign(x || 1);
      n.y = 0;
    } else {
      n.x = 0;
      n.y = Math.sign(y || 1);
    }
  }
  return d;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The Figma lid render, keyed to its rounded-rect silhouette. */
export async function loadLaptopTexture(s: Surface): Promise<THREE.CanvasTexture> {
  const img = new Image();
  img.src = '/laptop.png';
  await loadImage(img);
  const W = img.naturalWidth,
    H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const r = (s.cornerRadius / s.w) * W;
  roundedRectPath(ctx, 0.5, 0.5, W - 1, H - 1, r);
  ctx.clip();
  ctx.drawImage(img, 0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
