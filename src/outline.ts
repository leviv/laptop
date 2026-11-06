// Animated dashed selection ring, drawn as an SVG path over the canvas so
// the dashes stay crisp and the marching animation is a cheap CSS keyframe.
import { params } from './params';
import { offsetPolygon } from './contour';
import type { Sticker } from './sticker';
import type { View } from './view';

export class Outline {
  svg: SVGSVGElement;
  path: SVGPathElement;
  private offset = 0;
  private visible = false;

  constructor(parent: HTMLElement) {
    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.setAttribute('class', 'outline');
    this.path = document.createElementNS(ns, 'path');
    this.path.setAttribute('fill', 'none');
    this.path.setAttribute('stroke-linejoin', 'round');
    this.path.setAttribute('stroke-linecap', 'round');
    this.svg.appendChild(this.path);
    parent.appendChild(this.svg);
  }

  update(sticker: Sticker | null, view: View, dt: number) {
    const show = !!sticker && sticker.state === 'stuck';
    if (show !== this.visible) {
      this.visible = show;
      this.svg.style.opacity = show ? '1' : '0';
    }
    if (!show || !sticker) return;
    const O = params.outline;
    this.offset = (this.offset - O.speed * dt) % (O.dash + O.gap);
    const pts = offsetPolygon(sticker.outline, O.inset, sticker.def.w, sticker.def.h);
    const { w, h } = sticker.def;
    let d = '';
    const tmp = { x: 0, y: 0 };
    for (let i = 0; i < pts.length; i++) {
      const [u, v] = pts[i];
      const lx = (u - 0.5) * w,
        ly = (0.5 - v) * h;
      const c = Math.cos(sticker.angle),
        s = Math.sin(sticker.angle);
      const wx = sticker.anchor.x + lx * c - ly * s;
      const wy = sticker.anchor.y + lx * s + ly * c;
      view.worldToScreen(wx, wy, tmp);
      d += (i === 0 ? 'M' : 'L') + tmp.x.toFixed(1) + ' ' + tmp.y.toFixed(1);
    }
    d += 'Z';
    this.path.setAttribute('d', d);
    this.path.setAttribute('stroke', O.color);
    this.path.setAttribute('stroke-width', String(O.width));
    this.path.setAttribute('stroke-dasharray', `${O.dash} ${O.gap}`);
    this.path.setAttribute('stroke-dashoffset', this.offset.toFixed(2));
  }
}
