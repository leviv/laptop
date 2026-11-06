// Alpha mask → outline polygon (for the dashed selection ring and hit tests).

export interface Mask {
  w: number;
  h: number;
  data: Uint8ClampedArray; // RGBA
}

export function imageToMask(img: HTMLImageElement, maxSize = 256): Mask {
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

/** alpha (0..1) at normalised uv, u right, v down */
export function sampleAlpha(m: Mask, u: number, v: number): number {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  const x = Math.min(m.w - 1, (u * m.w) | 0);
  const y = Math.min(m.h - 1, (v * m.h) | 0);
  return m.data[(y * m.w + x) * 4 + 3] / 255;
}

/**
 * Trace the outer boundary of the largest opaque blob with marching squares,
 * then simplify + smooth. Returns points in normalised uv (0..1).
 */
export function traceOutline(m: Mask, threshold = 0.5): [number, number][] {
  const W = m.w + 2,
    H = m.h + 2;
  const bin = new Uint8Array(W * H);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      bin[(y + 1) * W + (x + 1)] = m.data[(y * m.w + x) * 4 + 3] / 255 >= threshold ? 1 : 0;

  // marching squares: each cell (x,y) between corners (x,y),(x+1,y),(x,y+1),(x+1,y+1)
  // collect directed edges (from -> to) keyed by start point, then chain them
  const segs = new Map<number, number[]>(); // key(start) -> [endKey,...]
  const key = (x: number, y: number) => y * (W * 2) + x; // points on half-grid: coords doubled
  const addSeg = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const arr = segs.get(k);
    if (arr) arr.push(key(bx, by));
    else segs.set(k, [key(bx, by)]);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = bin[y * W + x],
        tr = bin[y * W + x + 1],
        bl = bin[(y + 1) * W + x],
        br = bin[(y + 1) * W + x + 1];
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      // edge midpoints on doubled grid
      const T = [2 * x + 1, 2 * y],
        Rr = [2 * x + 2, 2 * y + 1],
        B = [2 * x + 1, 2 * y + 2],
        L = [2 * x, 2 * y + 1];
      const e = (a: number[], b: number[]) => addSeg(a[0], a[1], b[0], b[1]);
      // orientation: inside on the left when walking -> consistent CCW (in y-down coords, clockwise visually)
      switch (c) {
        case 1: e(L, B); break;
        case 2: e(B, Rr); break;
        case 3: e(L, Rr); break;
        case 4: e(Rr, T); break;
        case 5: e(L, T); e(Rr, B); break;
        case 6: e(B, T); break;
        case 7: e(L, T); break;
        case 8: e(T, L); break;
        case 9: e(T, B); break;
        case 10: e(T, Rr); e(B, L); break;
        case 11: e(T, Rr); break;
        case 12: e(Rr, L); break;
        case 13: e(Rr, B); break;
        case 14: e(B, L); break;
      }
    }
  }

  // chain into loops, keep the longest
  const visited = new Set<number>();
  let best: number[] = [];
  for (const start of segs.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let cur = start;
    while (cur !== undefined && !visited.has(cur)) {
      visited.add(cur);
      loop.push(cur);
      const nx = segs.get(cur);
      if (!nx || nx.length === 0) break;
      cur = nx.length === 1 ? nx[0] : nx.find((k) => !visited.has(k)) ?? nx[0];
    }
    if (loop.length > best.length) best = loop;
  }

  let pts: [number, number][] = best.map((k) => {
    const x = k % (W * 2),
      y = Math.floor(k / (W * 2));
    // undo doubled grid + 1px padding, to pixel coords, then normalise
    return [(x / 2 - 1) / m.w, (y / 2 - 1) / m.h];
  });

  pts = simplify(pts, 0.6 / Math.max(m.w, m.h));
  pts = chaikin(pts, 2);
  return pts;
}

function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0,
      idx = -1;
    const [ax, ay] = pts[a],
      [bx, by] = pts[b];
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const ex = ax + t * dx - px,
        ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && Math.sqrt(maxD) > eps) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function chaikin(pts: [number, number][], iters: number): [number, number][] {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const out: [number, number][] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p;
}

/** offset a closed polygon by d (positive = inward, in uv units scaled by w/h) */
export function offsetPolygon(
  pts: [number, number][],
  d: number,
  w: number,
  h: number,
): [number, number][] {
  const n = pts.length;
  const out: [number, number][] = [];
  // compute signed area to know winding
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i],
      b = pts[(i + 1) % n];
    area += a[0] * w * (b[1] * h) - b[0] * w * (a[1] * h);
  }
  const sign = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n],
      c = pts[i],
      q = pts[(i + 1) % n];
    const ex = (q[0] - p[0]) * w,
      ey = (q[1] - p[1]) * h;
    const l = Math.hypot(ex, ey) || 1;
    // inward normal
    const nx = (-ey / l) * sign,
      ny = (ex / l) * sign;
    out.push([c[0] + (nx * d) / w, c[1] + (ny * d) / h]);
  }
  return out;
}
