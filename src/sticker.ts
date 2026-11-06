import * as THREE from 'three';
import { loadImage } from './util';
import { params } from './params';
import { CurlProfile } from './profile';
import { type Mask, imageToMask, sampleAlpha, traceOutline } from './contour';
import { makeStickerMaterial, makeShadowMaterial, makeBlurredAlpha, makeHeightMaterial } from './shaders';
import { EFFECTS, KINDS, MASK_MODES } from './effects';
import { SURFACE, surfaceSDF } from './laptop';
import * as audio from './audio';

export interface StickerDef {
  id: string;
  name?: string;
  src: string;
  x: number; // centre, world units, y up
  y: number;
  w: number;
  h: number;
  rotation: number; // deg, CCW
}

export type State = 'stuck' | 'peeling' | 'unpeeling' | 'carried' | 'sticking';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const tmpN = { x: 0, y: 0 };
const prof = new Float32Array(3);

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function easeIn(t: number) {
  return t * t;
}
function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t);
}
// polynomial smooth-min; also returns the blend weight in out[1]
function smin(a: number, b: number, k: number, out: number[]) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  out[0] = b + (a - b) * h - k * h * (1 - h);
  out[1] = h;
}
const sminOut = [0, 0];

export class Sticker {
  def: StickerDef;
  group = new THREE.Group();
  mesh!: THREE.Mesh;
  shadow!: THREE.Mesh;
  heightMesh!: THREE.Mesh; // flat footprint, drawn into the stack height map
  geo!: THREE.PlaneGeometry;
  basePos!: Float32Array;
  wrapAttr!: THREE.BufferAttribute;
  mask!: Mask;
  outline: [number, number][] = [];
  material!: THREE.ShaderMaterial;
  shadowMat!: THREE.ShaderMaterial;

  state: State = 'stuck';
  layer = 0;
  angle: number; // rad
  anchor = new THREE.Vector2();
  dirty = true;

  // interaction
  grab = new THREE.Vector2(); // local flat coords of the held point
  peelDir = new THREE.Vector2(0, -1);
  peelDirLocked = false;
  p = 0;
  pPrev = 0;
  holdTime = 0;
  dragDist = 0;
  downWorld = new THREE.Vector2();
  pointer = new THREE.Vector2();
  target = new THREE.Vector2();
  vel = new THREE.Vector2();
  angVel = 0;
  angle0 = 0;
  bend = new THREE.Vector2();
  carriedBlend = 0;
  hoverTarget = 0;
  hoverH = 0;
  sMax = 1;
  sMin = -1;
  rMax = 1;
  stickT = 0;
  stickR = 0;
  landed = false;
  squashAmt = 0;
  profile = new CurlProfile();

  constructor(def: StickerDef) {
    this.def = def;
    this.angle = def.rotation * DEG;
    this.anchor.set(def.x, def.y);
  }

  async load() {
    const img = new Image();
    img.src = this.def.src;
    await loadImage(img);
    this.mask = imageToMask(img, 256);
    this.outline = traceOutline(this.mask);

    // rasterise at a fixed resolution so SVGs and PNGs both come out crisp
    const texScale = Math.min(4, 1024 / Math.max(this.def.w, this.def.h));
    const c = document.createElement('canvas');
    c.width = Math.round(this.def.w * texScale);
    c.height = Math.round(this.def.h * texScale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    const blurred = makeBlurredAlpha(img);

    this.buildGeometry();
    this.material = makeStickerMaterial(tex, new THREE.Vector2(this.def.w, this.def.h));
    const fx = EFFECTS[this.def.id];
    if (fx) {
      const u = this.material.uniforms;
      u.uHoloKind.value = KINDS[fx.kind];
      u.uMaskMode.value = MASK_MODES[fx.mask];
      u.uHoloStrength.value = fx.strength;
      u.uPatchy.value = fx.patchy ?? 0.5;
      u.uFlake.value = fx.flake ?? 2.5;
      u.uDensity.value = fx.density ?? 0.5;
    }
    this.shadowMat = makeShadowMaterial(tex, blurred);
    this.shadowMat.uniforms.uSize.value.set(this.def.w, this.def.h);
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.shadow = new THREE.Mesh(this.geo, this.shadowMat);
    this.shadow.frustumCulled = false;
    this.mesh.frustumCulled = false;
    this.group.add(this.shadow, this.mesh);
    this.heightMesh = new THREE.Mesh(new THREE.PlaneGeometry(this.def.w, this.def.h), makeHeightMaterial(tex));
    this.heightMesh.frustumCulled = false;
    this.syncTransform();
  }

  buildGeometry() {
    const { w, h } = this.def;
    const seg = Math.max(4, params.mesh.segments | 0);
    const sx = w >= h ? seg : Math.max(4, Math.round((seg * w) / h));
    const sy = h > w ? seg : Math.max(4, Math.round((seg * h) / w));
    const old = this.geo;
    this.geo = new THREE.PlaneGeometry(w, h, sx, sy);
    this.basePos = new Float32Array(this.geo.attributes.position.array as Float32Array);
    this.wrapAttr = new THREE.BufferAttribute(new Float32Array(this.geo.attributes.position.count), 1);
    this.geo.setAttribute('aWrap', this.wrapAttr);
    if (this.mesh) {
      this.mesh.geometry = this.geo;
      this.shadow.geometry = this.geo;
      old?.dispose();
    }
    this.dirty = true;
  }

  setLayer(i: number) {
    this.layer = i;
    this.mesh.renderOrder = 10 + i;
    this.shadow.renderOrder = 5;
    this.syncTransform();
  }

  get active() {
    return this.state !== 'stuck';
  }

  syncTransform() {
    // an active sticker sits well above every stuck one (and their hover lift)
    // layers are spaced wider than the hover lift so hovering never reorders them
    const baseZ = (this.state === 'stuck' ? 0.5 : 400) + this.layer * 5;
    this.group.position.set(this.anchor.x, this.anchor.y, baseZ);
    this.group.rotation.z = this.angle;
    if (this.shadowMat) this.shadowMat.uniforms.uBaseZ.value = baseZ;
    const stuck = this.state === 'stuck';
    if (this.heightMesh) {
      // only stuck stickers count as "underneath"
      this.heightMesh.position.set(this.anchor.x, this.anchor.y, 0);
      this.heightMesh.rotation.z = this.angle;
      this.heightMesh.visible = stuck;
    }
    if (this.material) {
      const u = this.material.uniforms;
      u.uSelfInMap.value = stuck ? 1 : 0;
      u.uCS.value.set(Math.cos(this.angle), Math.sin(this.angle));
    }
  }

  // ---- coordinate helpers -------------------------------------------------

  worldToLocal(wx: number, wy: number, out: THREE.Vector2) {
    const dx = wx - this.anchor.x,
      dy = wy - this.anchor.y;
    const c = Math.cos(-this.angle),
      s = Math.sin(-this.angle);
    return out.set(dx * c - dy * s, dx * s + dy * c);
  }

  localToWorld(lx: number, ly: number, out: THREE.Vector2) {
    const c = Math.cos(this.angle),
      s = Math.sin(this.angle);
    return out.set(this.anchor.x + lx * c - ly * s, this.anchor.y + lx * s + ly * c);
  }

  alphaAtLocal(lx: number, ly: number) {
    return sampleAlpha(this.mask, lx / this.def.w + 0.5, 0.5 - ly / this.def.h);
  }

  hitTest(wx: number, wy: number) {
    if (this.state !== 'stuck') return false;
    const l = this.worldToLocal(wx, wy, new THREE.Vector2());
    return this.alphaAtLocal(l.x, l.y) > 0.5;
  }

  // ---- interaction --------------------------------------------------------

  beginPeel(wx: number, wy: number) {
    this.worldToLocal(wx, wy, this.grab);
    const g = this.grab;
    const small = g.length() < Math.min(this.def.w, this.def.h) * 0.12;
    if (small) {
      this.peelDir.set(0, -1);
      this.peelDirLocked = false;
    } else {
      this.peelDir.copy(g).multiplyScalar(-1).normalize();
      this.peelDirLocked = true;
    }
    this.computeExtents();
    this.state = 'peeling';
    this.p = this.pPrev = 0;
    this.holdTime = 0;
    this.dragDist = 0;
    this.downWorld.set(wx, wy);
    this.pointer.set(wx, wy);
    this.vel.set(0, 0);
    this.angVel = 0;
    this.angle0 = this.angle;
    this.bend.set(0, 0);
    this.carriedBlend = 0;
    this.hoverTarget = 0;
    this.syncTransform();
    this.mesh.renderOrder = 200;
    this.shadow.renderOrder = 150;
  }

  computeExtents() {
    const { w, h } = this.def;
    const g = this.grab,
      d = this.peelDir;
    let sMax = -Infinity,
      sMin = Infinity,
      rMax = 0;
    for (const [cx, cy] of [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ]) {
      const s = (cx - g.x) * d.x + (cy - g.y) * d.y;
      sMax = Math.max(sMax, s);
      sMin = Math.min(sMin, s);
      rMax = Math.max(rMax, Math.hypot(cx - g.x, cy - g.y));
    }
    this.sMax = Math.max(1, sMax);
    this.sMin = Math.min(-1, sMin);
    this.rMax = Math.max(1, rMax);
  }

  drag(wx: number, wy: number) {
    this.pointer.set(wx, wy);
    const dx = wx - this.downWorld.x,
      dy = wy - this.downWorld.y;
    this.dragDist = Math.hypot(dx, dy);
    if (!this.peelDirLocked && this.state === 'peeling' && this.dragDist > 6) {
      // grabbed near the middle: the trailing side peels last
      const l = new THREE.Vector2(-dx, -dy);
      const c = Math.cos(-this.angle),
        s = Math.sin(-this.angle);
      this.peelDir.set(l.x * c - l.y * s, l.x * s + l.y * c).normalize();
      this.peelDirLocked = true;
      this.computeExtents();
    }
  }

  release(wx: number, wy: number) {
    this.pointer.set(wx, wy);
    if (this.state === 'peeling') {
      this.state = 'unpeeling';
      return;
    }
    if (this.state !== 'carried') return;
    this.state = 'sticking';
    this.stickT = 0;
    this.stickR = 0;
    this.landed = false;
    this.squashAmt = 0;
    this.angle0 = this.angle;
    this.target.copy(this.clampedTarget());
  }

  /** where the anchor should go so the held point lands inside the lid */
  clampedTarget() {
    const g = new THREE.Vector2(this.grab.x, this.grab.y).rotateAround(new THREE.Vector2(), this.angle);
    const want = new THREE.Vector2(this.pointer.x - g.x, this.pointer.y - g.y);
    // keep the grab point on the flat face with a margin
    const margin = params.wrap.edgeRadius + 14;
    const gp = new THREE.Vector2(this.pointer.x, this.pointer.y);
    for (let i = 0; i < 4; i++) {
      const d = surfaceSDF(gp.x, gp.y, SURFACE, tmpN) + margin;
      if (d <= 0) break;
      gp.x -= tmpN.x * d;
      gp.y -= tmpN.y * d;
    }
    want.add(gp).sub(this.pointer);
    return want;
  }

  // ---- per-frame ----------------------------------------------------------

  update(dt: number) {
    dt = Math.min(dt, 1 / 30);
    const P = params;
    this.hoverH += (this.hoverTarget * P.drag.hoverLift - this.hoverH) * (1 - Math.exp(-dt * 22));

    switch (this.state) {
      case 'stuck':
        if (this.hoverH > 0.01 || this.dirty) this.updateGeometry();
        return;

      case 'peeling': {
        this.holdTime += dt;
        const raw = Math.min(1, Math.max(this.holdTime / P.peel.holdDuration, this.dragDist / P.peel.dragDistance));
        const eased = raw * raw * (3 - 2 * raw);
        this.pPrev = this.p;
        this.p = raw + (eased - raw) * P.peel.easing;
        this.carriedBlend = smoothstep(0.6, 1, this.p);
        const adv = (this.p - this.pPrev) * this.sMax;
        audio.peelTick(adv, adv / dt);
        if (this.p >= 1) {
          this.state = 'carried';
          audio.popFree();
          // the spring starts from wherever the sheet actually is
          this.vel.set(0, 0);
        }
        break;
      }

      case 'unpeeling': {
        this.pPrev = this.p;
        this.p = Math.max(0, this.p - dt / P.stick.spreadDuration);
        this.carriedBlend = smoothstep(0.6, 1, this.p);
        audio.stickTick((this.pPrev - this.p) * this.sMax * 0.6);
        if (this.p <= 0) this.finishStick(false);
        break;
      }

      case 'carried': {
        this.carriedBlend = Math.min(1, this.carriedBlend + dt / 0.16);
        this.target.copy(this.clampedTarget());
        this.springStep(dt);
        this.swingStep(dt, true);
        break;
      }

      case 'sticking': {
        this.stickT += dt;
        const t = this.stickT;
        this.springStep(dt);
        this.swingStep(dt, false);
        const dropT = Math.min(1, t / P.stick.dropDuration);
        if (!this.landed && dropT >= 1) {
          this.landed = true;
          audio.land(Math.min(1, 0.5 + this.vel.length() / 1500));
          this.angVel += (Math.random() < 0.5 ? -1 : 1) * P.stick.settleWobble * DEG * 9;
        }
        const sp = Math.max(0, Math.min(1, (t - P.stick.dropDuration * 0.75) / P.stick.spreadDuration));
        const rPrev = this.stickR;
        this.stickR = easeOut(sp) * this.rMax;
        audio.stickTick(this.stickR - rPrev);
        const sq = Math.max(0, Math.min(1, (t - P.stick.dropDuration) / P.stick.squashDuration));
        this.squashAmt = Math.sin(sq * Math.PI) * P.stick.squash;
        if (t > P.stick.dropDuration + P.stick.spreadDuration + 0.08) this.finishStick(true);
        break;
      }
    }
    this.updateGeometry();
  }

  finishStick(playSeal: boolean) {
    this.state = 'stuck';
    this.p = 0;
    this.squashAmt = 0;
    this.bend.set(0, 0);
    this.angVel = 0;
    if (this.landed) this.anchor.copy(this.target);
    this.landed = false;
    this.mesh.renderOrder = 10 + this.layer;
    this.shadow.renderOrder = 5;
    this.syncTransform();
    this.dirty = true;
    if (playSeal) audio.seal();
  }

  springStep(dt: number) {
    const k = params.drag.followStiffness,
      c = params.drag.followDamping;
    const ax = (this.target.x - this.anchor.x) * k - this.vel.x * c;
    const ay = (this.target.y - this.anchor.y) * k - this.vel.y * c;
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.anchor.x += this.vel.x * dt;
    this.anchor.y += this.vel.y * dt;
    // air-drag bend, expressed in local coords
    const c0 = Math.cos(-this.angle),
      s0 = Math.sin(-this.angle);
    let bx = (this.vel.x * c0 - this.vel.y * s0) * params.drag.velocityBend;
    let by = (this.vel.x * s0 + this.vel.y * c0) * params.drag.velocityBend;
    const mag = Math.hypot(bx, by);
    const maxTilt = Math.max(0, params.drag.carryHeight - 2) / this.rMax;
    if (mag > maxTilt) {
      bx *= maxTilt / mag;
      by *= maxTilt / mag;
    }
    const f = 1 - Math.exp(-dt * params.drag.bendSmoothing);
    this.bend.x += (bx - this.bend.x) * f;
    this.bend.y += (by - this.bend.y) * f;
    this.syncTransform();
  }

  swingStep(dt: number, withTorque: boolean) {
    const D = params.drag;
    if (withTorque) {
      // lever from grab point to the sheet's centre (world), drag force opposes velocity
      const c = Math.cos(this.angle),
        s = Math.sin(this.angle);
      const lx = -(this.grab.x * c - this.grab.y * s);
      const ly = -(this.grab.x * s + this.grab.y * c);
      const tq = (lx * -this.vel.y - ly * -this.vel.x) * D.swingTorque;
      this.angVel += tq * dt;
    }
    this.angVel -= (this.angle - this.angle0) * D.swingReturn * dt;
    this.angVel *= Math.exp(-dt * D.swingDamping);
    this.angle += this.angVel * dt;
    const lim = D.maxSwing * DEG;
    if (this.angle - this.angle0 > lim) {
      this.angle = this.angle0 + lim;
      this.angVel = Math.min(0, this.angVel);
    } else if (this.angle - this.angle0 < -lim) {
      this.angle = this.angle0 - lim;
      this.angVel = Math.max(0, this.angVel);
    }
    this.syncTransform();
  }

  // ---- geometry -----------------------------------------------------------

  updateGeometry() {
    const P = params;
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const base = this.basePos;
    const wrap = this.wrapAttr.array as Float32Array;
    const n = pos.count;
    const { w, h } = this.def;
    const g = this.grab,
      d = this.peelDir;
    const st = this.state;

    const peelW = st === 'peeling' || st === 'unpeeling' ? 1 - this.carriedBlend : st === 'carried' ? 1 - this.carriedBlend : 0;
    const carryW = st === 'peeling' || st === 'unpeeling' || st === 'carried' ? this.carriedBlend : 0;
    const stickW = st === 'sticking' ? 1 : 0;

    // peel profile for this frame
    const F = this.p * this.sMax;
    if (peelW > 0) {
      this.profile.build(
        F - this.sMin + 2,
        P.peel.curlRadius,
        P.peel.liftAngle * DEG,
        F,
        P.peel.tailAngle * DEG,
        P.peel.tailRelax,
        P.peel.frontSoftness,
      );
    }
    // lay-down profile
    let hDrop = 0,
      hTop = 0,
      fadeCarry = 0;
    if (stickW > 0) {
      const dropT = Math.min(1, this.stickT / P.stick.dropDuration);
      hDrop = P.drag.carryHeight * (1 - easeIn(dropT));
      const sp = this.stickR / this.rMax;
      hTop = P.drag.carryHeight * (1 - sp) + 1.5 * (1 - sp);
      fadeCarry = 1 - dropT;
      this.profile.build(this.rMax + 2, P.peel.curlRadius, P.stick.landAngle * DEG, 1e9, 0, 1, P.peel.frontSoftness * 0.6);
    }
    const maxLift = P.drag.carryHeight * 2.2;
    const carryH = P.drag.carryHeight;
    const curl = P.drag.residualCurl;
    const bx = this.bend.x,
      by = this.bend.y;
    const squash = 1 - this.squashAmt;
    const edgeR = Math.max(0.5, P.wrap.edgeRadius);
    const fadeH = Math.max(0.01, P.wrap.fadeHeight);
    const cA = Math.cos(this.angle),
      sA = Math.sin(this.angle);
    const ax = this.anchor.x,
      ay = this.anchor.y;
    const hover = this.hoverH;

    for (let i = 0; i < n; i++) {
      const bxi = base[i * 3],
        byi = base[i * 3 + 1];
      let x = bxi,
        y = byi,
        z = 0;

      if (st === 'stuck') {
        if (hover > 0) {
          const e = Math.max(Math.abs(bxi) / (w / 2), Math.abs(byi) / (h / 2));
          z = hover * (0.7 + 0.6 * e * e);
        }
      } else {
        let px = 0,
          py = 0,
          pz = 0;
        const rx = bxi - g.x,
          ry = byi - g.y;

        if (peelW > 0) {
          const s = rx * d.x + ry * d.y;
          const u = F - s;
          if (u <= 0) {
            px = bxi;
            py = byi;
            pz = 0;
          } else {
            this.profile.sample(u, prof);
            const shift = u - prof[0];
            smin(prof[1], maxLift, 24, sminOut);
            const zz = sminOut[0];
            const sh = shift * (0.35 + 0.65 * sminOut[1]);
            px = bxi + d.x * sh;
            py = byi + d.y * sh;
            pz = zz;
          }
        }

        let cx = 0,
          cy = 0,
          cz = 0;
        if (carryW > 0 || fadeCarry > 0) {
          const s = rx * d.x + ry * d.y;
          const far = Math.max(0, s / this.sMax);
          cz = carryH + curl * far * far - (bx * rx + by * ry);
          cx = bxi;
          cy = byi;
        }

        if (stickW > 0) {
          const rho = Math.hypot(rx, ry);
          const u = rho - this.stickR;
          let sx = bxi,
            sy = byi,
            sz = 0;
          if (u > 0) {
            this.profile.sample(u, prof);
            const zRaw = hDrop + prof[1];
            smin(zRaw, hTop + hDrop, 20, sminOut);
            sz = Math.max(0, sminOut[0]);
            const shift = (u - prof[0]) * (0.3 + 0.7 * sminOut[1]);
            const inv = rho > 1e-6 ? 1 / rho : 0;
            sx = bxi - rx * inv * shift;
            sy = byi - ry * inv * shift;
          }
          // residual carry shape fades out during the drop
          const extra = (cz - carryH) * fadeCarry;
          x = sx * squash;
          y = sy * squash;
          z = sz + Math.max(-sz, extra);
        } else {
          x = px * peelW + cx * carryW;
          y = py * peelW + cy * carryW;
          z = pz * peelW + cz * carryW;
        }
      }

      // ---- wrap around the lid edge (world space) ----
      let wx = ax + x * cA - y * sA;
      let wy = ay + x * sA + y * cA;
      let wrapV = 0;
      const dist = surfaceSDF(wx, wy, SURFACE, tmpN) + edgeR;
      if (dist > 0) {
        const a = 1 - smoothstep(0, fadeH, z);
        if (a > 0) {
          const phi = Math.min(dist / edgeR, Math.PI / 2);
          const inPlane = edgeR * Math.sin(phi);
          const drop = edgeR * (1 - Math.cos(phi)) + Math.max(0, dist - (edgeR * Math.PI) / 2);
          wx -= tmpN.x * (dist - inPlane) * a;
          wy -= tmpN.y * (dist - inPlane) * a;
          z -= drop * a;
          wrapV = a * Math.min(1, phi / (Math.PI / 2));
          // back to local
          const dx = wx - ax,
            dy = wy - ay;
          x = dx * cA + dy * sA;
          y = -dx * sA + dy * cA;
        }
      }
      wrap[i] = wrapV;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
    this.wrapAttr.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.dirty = false;
  }

  applyLook() {
    const L = params.look;
    const az = L.lightAzimuth * DEG,
      el = L.lightElevation * DEG;
    const lx = Math.cos(el) * Math.cos(az),
      ly = Math.cos(el) * Math.sin(az),
      lz = Math.sin(el);
    const u = this.material.uniforms;
    u.uLightDir.value.set(lx, ly, lz);
    u.uGloss.value = L.gloss;
    u.uGlossSharp.value = L.glossSharpness;
    u.uBacking.value.set(L.backingTint);
    u.uBackingSheen.value = L.backingSheen;
    u.uWrapShade.value = params.wrap.shade;
    u.uIndentDepth.value = L.indentDepth;
    u.uIndentWidth.value = L.indentWidth;
    u.uIndentCrease.value = L.indentCrease;
    const Hh = params.holo;
    const fx = EFFECTS[this.def.id];
    u.uHoloStrength.value = fx && Hh.enabled ? fx.strength * Hh.strength : 0;
    u.uBandScale.value = Hh.bandScale;
    u.uPointerInfl.value = Hh.pointerInfluence;
    u.uTiltInfl.value = Hh.tiltInfluence;
    u.uMoveInfl.value = Hh.moveInfluence;
    u.uShimmer.value = Hh.shimmerSpeed;
    u.uHoloSat.value = Hh.saturation;
    u.uTwinkle.value = Hh.glitterTwinkle;
    u.uGlitterSharp.value = Hh.glitterSharpness;
    u.uGlitterBase.value = Hh.glitterBase;
    const s = this.shadowMat.uniforms;
    s.uLightSlope.value.set(lx / Math.max(0.05, lz), ly / Math.max(0.05, lz));
    s.uContact.value = L.contactShadow;
    s.uLifted.value = L.liftedShadow;
    s.uBlurHeight.value = L.shadowBlurHeight;
    s.uScatter.value = L.shadowScatter;
    s.uShadowZ.value = 300; // above every stuck sticker, below the carried one
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
    this.shadowMat.dispose();
    this.heightMesh.geometry.dispose();
    (this.heightMesh.material as THREE.Material).dispose();
  }
}

export { TAU };
