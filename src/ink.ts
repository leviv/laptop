// Dry-erase marker ink: a layer per surface (the lid, and each sticker that
// has been drawn on). While a stroke is in progress it is re-stroked as one
// smooth path over the committed ink, so translucent marker colour stays
// uniform instead of stacking up at every segment joint.
import * as THREE from 'three';

export interface Swatch {
  name: string;
  hex: string;
}

/** Figma's brand palette, plus ink black */
export const PALETTE: Swatch[] = [
  { name: 'Black', hex: '#1e1e1e' },
  { name: 'Red', hex: '#f24e1e' },
  { name: 'Orange', hex: '#ff7262' },
  { name: 'Yellow', hex: '#ffc700' },
  { name: 'Green', hex: '#0acf83' },
  { name: 'Blue', hex: '#1abcfe' },
  { name: 'Purple', hex: '#a259ff' },
];

export type Tool = 'move' | 'marker' | 'eraser';

export const MARKER_WIDTH = 7; // world px
export const ERASER_WIDTH = 22;

type Clip = (ctx: CanvasRenderingContext2D) => void;

export class InkLayer {
  /** what the texture samples: committed ink plus the live stroke */
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** committed ink only */
  base: HTMLCanvasElement;
  baseCtx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  width: number;
  height: number;
  used = false;
  private path: number[] | null = null;
  private color = '#000';
  private lineWidth = 1;
  private erase = false;

  constructor(width: number, height: number, clip?: Clip) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = width;
    this.base.height = height;
    this.baseCtx = this.base.getContext('2d')!;
    for (const c of [this.ctx, this.baseCtx]) {
      if (clip) {
        clip(c);
        c.clip();
      }
      c.lineCap = 'round';
      c.lineJoin = 'round';
    }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
  }

  /** start a stroke; `width` in canvas px */
  begin(color: string, width: number, erase: boolean) {
    this.path = [];
    this.color = color;
    this.lineWidth = width;
    this.erase = erase;
  }

  /** add a point in canvas px (call `redraw` after a batch) */
  add(x: number, y: number) {
    if (!this.path) return;
    this.path.push(x, y);
  }

  redraw() {
    const p = this.path;
    if (!p || p.length < 2) return;
    const c = this.ctx;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, this.width, this.height);
    c.drawImage(this.base, 0, 0);
    if (this.erase) {
      c.globalCompositeOperation = 'destination-out';
      c.strokeStyle = '#000';
      c.lineWidth = this.lineWidth;
      this.strokePath(c, p);
    } else {
      c.strokeStyle = this.color;
      // wide translucent body plus a denser core: a chisel tip
      c.globalAlpha = 0.74;
      c.lineWidth = this.lineWidth;
      this.strokePath(c, p);
      c.globalAlpha = 0.3;
      c.lineWidth = this.lineWidth * 0.5;
      this.strokePath(c, p);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    this.used = true;
    this.texture.needsUpdate = true;
  }

  /** commit the live stroke */
  end() {
    if (!this.path) return;
    this.redraw();
    this.path = null;
    const b = this.baseCtx;
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, this.width, this.height);
    b.drawImage(this.canvas, 0, 0);
  }

  clear() {
    this.path = null;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.baseCtx.clearRect(0, 0, this.width, this.height);
    this.used = false;
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }

  private strokePath(c: CanvasRenderingContext2D, p: number[]) {
    c.beginPath();
    c.moveTo(p[0], p[1]);
    if (p.length === 2) {
      c.lineTo(p[0] + 0.01, p[1]); // a tap still leaves a dot
    } else if (p.length === 4) {
      c.lineTo(p[2], p[3]);
    } else {
      // quadratic curves through segment midpoints: smooth, and passes near every sample
      for (let i = 2; i < p.length - 2; i += 2) {
        c.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) * 0.5, (p[i + 1] + p[i + 3]) * 0.5);
      }
      c.lineTo(p[p.length - 2], p[p.length - 1]);
    }
    c.stroke();
  }
}

/** a 1x1 transparent texture for stickers that have never been drawn on */
export const EMPTY_INK = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
})();
