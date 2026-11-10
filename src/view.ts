import * as THREE from 'three';
import { SURFACE } from './laptop';

/**
 * Orthographic top-down view that keeps the lid fitted and centred in the
 * space above a strip reserved along the bottom (for the drop zone).
 */
export class View {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  zoom = 1;
  width = 1;
  height = 1;
  /** screen px kept free below the lid */
  reserveBottom = 0;
  /** world y at the screen centre (the camera is shifted so the lid sits higher) */
  centreY = 0;

  constructor() {
    this.camera.position.set(0, 0, 2000);
    this.camera.lookAt(0, 0, 0);
  }

  resize(width: number, height: number, reserveBottom = 0) {
    this.width = width;
    this.height = height;
    this.reserveBottom = reserveBottom;
    const margin = Math.min(width, height) < 700 ? 24 : 80;
    const avail = height - reserveBottom;
    this.zoom = Math.min((width - margin * 2) / SURFACE.w, (avail - margin * 2) / SURFACE.h);
    // the lid centre should land at the middle of the free area, above the strip
    this.centreY = (reserveBottom / 2) / this.zoom;
    this.camera.position.y = this.centreY;
    const hw = width / 2 / this.zoom,
      hh = height / 2 / this.zoom;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(sx: number, sy: number, out: THREE.Vector2) {
    return out.set((sx - this.width / 2) / this.zoom, (this.height / 2 - sy) / this.zoom + this.centreY);
  }

  worldToScreen(wx: number, wy: number, out: { x: number; y: number }) {
    out.x = wx * this.zoom + this.width / 2;
    out.y = this.height / 2 - (wy - this.centreY) * this.zoom;
    return out;
  }
}
