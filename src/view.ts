import * as THREE from 'three';
import { SURFACE } from './laptop';

/** Orthographic top-down view that keeps the lid centred and fitted. */
export class View {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  zoom = 1;
  width = 1;
  height = 1;

  constructor() {
    this.camera.position.set(0, 0, 2000);
    this.camera.lookAt(0, 0, 0);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const margin = Math.min(width, height) < 700 ? 24 : 80;
    this.zoom = Math.min((width - margin * 2) / SURFACE.w, (height - margin * 2) / SURFACE.h);
    const hw = width / 2 / this.zoom,
      hh = height / 2 / this.zoom;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(sx: number, sy: number, out: THREE.Vector2) {
    return out.set((sx - this.width / 2) / this.zoom, (this.height / 2 - sy) / this.zoom);
  }

  worldToScreen(wx: number, wy: number, out: { x: number; y: number }) {
    out.x = wx * this.zoom + this.width / 2;
    out.y = this.height / 2 - wy * this.zoom;
    return out;
  }
}
