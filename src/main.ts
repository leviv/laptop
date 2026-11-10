import * as THREE from 'three';
import './style.css';
import { params } from './params';
import { SURFACE, loadLaptopTexture } from './laptop';
import { Sticker } from './sticker';
import { LAYOUT } from './layout';
import { View } from './view';
import { Outline } from './outline';
import { buildGui } from './gui';
import { unlockAudio, resetFlurry } from './audio';
import { shared } from './shaders';

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const view = new View();

// ---- laptop lid ----
const lidGeo = new THREE.PlaneGeometry(SURFACE.w, SURFACE.h);
const lidMat = new THREE.MeshBasicMaterial({ transparent: true, alphaToCoverage: true });
const lid = new THREE.Mesh(lidGeo, lidMat);
lid.position.z = -(params.wrap.edgeRadius + 40); // far enough below that wrapped parts stay visible
lid.renderOrder = 0;
scene.add(lid);

async function loadLid() {
  lidMat.map = await loadLaptopTexture(SURFACE);
  lidMat.needsUpdate = true;
}

function redrawLid() {
  lid.position.z = -(params.wrap.edgeRadius + 40);
}
redrawLid();

// ---- stack height map ----
// Top-down render of every stuck sticker's footprint, additive, so the sticker
// shader can feel the edges of whatever it lands on.
const HEIGHT_SCALE = 2;
const heightRT = new THREE.WebGLRenderTarget(SURFACE.w * HEIGHT_SCALE, SURFACE.h * HEIGHT_SCALE, {
  type: THREE.HalfFloatType,
  format: THREE.RGBAFormat,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
  stencilBuffer: false,
  generateMipmaps: false,
});
const heightScene = new THREE.Scene();
const heightCam = new THREE.OrthographicCamera(-SURFACE.w / 2, SURFACE.w / 2, SURFACE.h / 2, -SURFACE.h / 2, 1, 3000);
heightCam.position.z = 1000;
shared.uHeight.value = heightRT.texture;
shared.uSurface.value.set(SURFACE.w, SURFACE.h);

// ---- stickers ----
const stickers: Sticker[] = [];
let order: Sticker[] = []; // bottom → top
let held: Sticker | null = null;
let hovered: Sticker | null = null;
let selected: Sticker | null = null;
let heldPointerId = -1;
let downAt = 0;
let downScreen = { x: 0, y: 0 };
let moved = false;
let wasSelected = false;
const lastW = new THREE.Vector2();

const outline = new Outline(app);

async function loadStickers() {
  const list = LAYOUT.map((d) => new Sticker(d));
  await Promise.all(list.map((s) => s.load()));
  for (const s of list) {
    stickers.push(s);
    scene.add(s.group);
    heightScene.add(s.heightMesh);
  }
  order = [...stickers];
  relayer();
  applyLookAll();
}

function relayer() {
  order.forEach((s, i) => s.setLayer(i));
}

function bringToTop(s: Sticker) {
  order = order.filter((o) => o !== s);
  order.push(s);
  relayer();
}

function applyLookAll() {
  for (const s of stickers) {
    s.applyLook();
    s.dirty = true;
  }
}

// ---- reset: every sticker slides quietly back to where it started, bottom layer first ----
let resetQueue: Sticker[] = [];
let resetClock = 0;

function startReset() {
  selected = null;
  order = [...stickers];
  relayer();
  // only the stickers that actually moved take part, so the stagger isn't spent on the rest
  resetQueue = stickers.filter((s) => s !== held && s.state === 'stuck' && s.awayFromHome);
  resetClock = 0;
  if (resetQueue.length) resetFlurry();
  stepReset(0); // the first one leaves on this very frame
}

function stepReset(dt: number) {
  if (!resetQueue.length) return;
  resetClock += dt;
  while (resetQueue.length && resetClock >= 0) {
    resetQueue.shift()!.beginGlideHome();
    resetClock -= 0.018;
  }
}

// ---- pointer ----
const canvas = renderer.domElement;
const tmpW = new THREE.Vector2();

function pick(sx: number, sy: number): Sticker | null {
  view.screenToWorld(sx, sy, tmpW);
  for (let i = order.length - 1; i >= 0; i--) {
    if (order[i].hitTest(tmpW.x, tmpW.y)) return order[i];
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (held) return;
  const s = pick(e.clientX, e.clientY);
  if (!s) {
    selected = null;
    return;
  }
  held = s;
  heldPointerId = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  downAt = performance.now();
  downScreen = { x: e.clientX, y: e.clientY };
  moved = false;
  // the selection ring goes away the moment a drag starts
  wasSelected = selected === s;
  selected = null;
  bringToTop(s);
  view.screenToWorld(e.clientX, e.clientY, tmpW);
  lastW.copy(tmpW);
  s.beginPeel(tmpW.x, tmpW.y);
  setHover(null);
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('pointermove', (e) => {
  if (held && e.pointerId === heldPointerId) {
    if (!moved && Math.hypot(e.clientX - downScreen.x, e.clientY - downScreen.y) > 4) moved = true;
    view.screenToWorld(e.clientX, e.clientY, tmpW);
    // the held sticker's foil "light" rides along with the pointer; nothing else reacts
    const hp = held.material.uniforms.uPointer.value as THREE.Vector2;
    hp.x += tmpW.x - lastW.x;
    hp.y += tmpW.y - lastW.y;
    lastW.copy(tmpW);
    held.drag(tmpW.x, tmpW.y);
    return;
  }
  if (e.pointerType === 'mouse') setHover(pick(e.clientX, e.clientY));
});

function endHold(e: PointerEvent) {
  if (!held || e.pointerId !== heldPointerId) return;
  view.screenToWorld(e.clientX, e.clientY, tmpW);
  const s = held;
  s.release(tmpW.x, tmpW.y);
  const tap = !moved && performance.now() - downAt < 350;
  selected = tap ? (wasSelected ? null : s) : s;
  held = null;
  heldPointerId = -1;
  canvas.style.cursor = 'default';
  if (e.pointerType === 'mouse') setHover(pick(e.clientX, e.clientY));
}
canvas.addEventListener('pointerup', endHold);
canvas.addEventListener('pointercancel', endHold);

function setHover(s: Sticker | null) {
  if (s === hovered) return;
  if (hovered) hovered.hoverTarget = 0;
  hovered = s;
  if (hovered && hovered.state === 'stuck') hovered.hoverTarget = 1;
  canvas.style.cursor = held ? 'grabbing' : hovered ? 'grab' : 'default';
}

// ---- resize / loop ----
function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  renderer.setSize(w, h);
  view.resize(w, h);
  outline.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function step(dt: number) {
  shared.uTime.value += dt;
  stepReset(dt);
  for (const s of stickers) s.update(dt);
  outline.update(selected, view, dt);
  renderer.setRenderTarget(heightRT);
  renderer.render(heightScene, heightCam);
  renderer.setRenderTarget(null);
  renderer.render(scene, view.camera);
}
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!(window as any).__paused) step(dt);
  requestAnimationFrame(frame);
}

buildGui({
  onChange: applyLookAll,
  onMeshChange: () => stickers.forEach((s) => s.buildGeometry()),
  onWrapChange: () => {
    redrawLid();
    applyLookAll();
  },
  onShadowChange: () => stickers.forEach((s) => s.rebakeShadow()),
  onResetLayout: startReset,
});
document.getElementById('reset')!.addEventListener('click', () => {
  unlockAudio();
  startReset();
});

Promise.all([loadLid(), loadStickers()])
  .then(() => requestAnimationFrame(frame))
  .catch((e) => console.error('sticker load failed', e));
(window as any).__lap = { stickers, scene, view, renderer, step, startReset, get order() { return order; }, get selected() { return selected; } };
