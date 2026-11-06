import * as THREE from 'three';
import './style.css';
import { params } from './params';
import { SURFACE, loadLaptopTexture } from './laptop';
import { Sticker } from './sticker';
import { LAYOUT } from './layout';
import { View } from './view';
import { Outline } from './outline';
import { buildGui } from './gui';
import { unlockAudio, setDuck } from './audio';
import { shared } from './shaders';
import { InkLayer, MARKER_WIDTH, ERASER_WIDTH, type Tool } from './ink';
import { buildToolbar, markerCursor } from './toolbar';

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

// ---- marker ink on the lid (under the stickers) ----
const INK_SCALE = 1.5;
const lidInk = new InkLayer(Math.round(SURFACE.w * INK_SCALE), Math.round(SURFACE.h * INK_SCALE), (ctx) => {
  const r = SURFACE.cornerRadius * INK_SCALE;
  ctx.beginPath();
  ctx.roundRect(0, 0, SURFACE.w * INK_SCALE, SURFACE.h * INK_SCALE, r);
});
const lidInkMesh = new THREE.Mesh(lidGeo, new THREE.MeshBasicMaterial({ map: lidInk.texture, transparent: true, depthWrite: false }));
lidInkMesh.renderOrder = 1;
scene.add(lidInkMesh);

function redrawLid() {
  lid.position.z = -(params.wrap.edgeRadius + 40);
  lidInkMesh.position.z = lid.position.z + 0.5;
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

// ---- reset: every sticker peels itself up and flies home, bottom layer first ----
let resetQueue: Sticker[] = [];
let resetClock = 0;
let ducked = false;

function startReset() {
  selected = null;
  order = [...stickers];
  relayer();
  resetQueue = stickers.filter((s) => s !== held && s.state === 'stuck');
  resetClock = 0;
  setDuck(0.3);
  ducked = true;
}

function stepReset(dt: number) {
  if (resetQueue.length) {
    resetClock += dt;
    while (resetQueue.length && resetClock >= 0) {
      resetQueue.shift()!.beginAutoReturn();
      resetClock -= 0.035;
    }
  } else if (ducked && !stickers.some((s) => s.auto)) {
    setDuck(1);
    ducked = false;
  }
}

// ---- pointer ----
const canvas = renderer.domElement;
const tmpW = new THREE.Vector2();

// drawing
let tool: Tool = 'move';
let inkColor = '#f24e1e';
let stroking = false;
let strokePointerId = -1;
const strokeLast = new THREE.Vector2();
let strokeTarget: Sticker | null = null; // sticker under the pen, or null for the lid

function updateCursor() {
  if (tool === 'move') canvas.style.cursor = held ? 'grabbing' : hovered ? 'grab' : 'default';
  else canvas.style.cursor = markerCursor(inkColor, tool === 'eraser');
}

/** which surface the pen is touching: the topmost stuck sticker, else the lid */
function inkTargetAt(wx: number, wy: number): Sticker | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const s = order[i];
    if (s.state !== 'stuck') continue;
    const l = s.worldToLocal(wx, wy, tmpW);
    if (s.alphaAtLocal(l.x, l.y) > 0.5) return s;
  }
  return null;
}

const inkPt = [0, 0];
function layerOf(t: Sticker | null) {
  return t ? t.ensureInk() : lidInk;
}
function inkPoint(t: Sticker | null, wx: number, wy: number) {
  if (t) return t.inkPoint(wx, wy, inkPt);
  inkPt[0] = (wx + SURFACE.w / 2) * INK_SCALE;
  inkPt[1] = (SURFACE.h / 2 - wy) * INK_SCALE;
  return inkPt;
}
function beginOn(t: Sticker | null, wx: number, wy: number) {
  const erase = tool === 'eraser';
  const width = (erase ? ERASER_WIDTH : MARKER_WIDTH) * (t ? t.inkScale : INK_SCALE);
  const L = layerOf(t);
  L.begin(inkColor, width, erase);
  const p = inkPoint(t, wx, wy);
  L.add(p[0], p[1]);
}

function beginStroke(e: PointerEvent) {
  view.screenToWorld(e.clientX, e.clientY, tmpW);
  stroking = true;
  strokePointerId = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  strokeLast.copy(tmpW);
  strokeTarget = inkTargetAt(tmpW.x, tmpW.y);
  beginOn(strokeTarget, tmpW.x, tmpW.y);
  layerOf(strokeTarget).redraw();
}

function moveStroke(e: PointerEvent) {
  const pts: { x: number; y: number }[] = (e as any).getCoalescedEvents?.() ?? [];
  if (!pts.length) pts.push({ x: e.clientX, y: e.clientY });
  const touched = new Set<InkLayer>();
  for (const p of pts) {
    const wx = (p.x - view.width / 2) / view.zoom,
      wy = (view.height / 2 - p.y) / view.zoom;
    const t = inkTargetAt(wx, wy);
    if (t !== strokeTarget) {
      // crossed an edge: run the old surface's stroke up to here and commit it,
      // then start a fresh one on the new surface from the same point
      const old = layerOf(strokeTarget);
      const q = inkPoint(strokeTarget, wx, wy);
      old.add(q[0], q[1]);
      old.end();
      touched.add(old);
      strokeTarget = t;
      beginOn(t, strokeLast.x, strokeLast.y);
    }
    const L = layerOf(t);
    const q = inkPoint(t, wx, wy);
    L.add(q[0], q[1]);
    touched.add(L);
    strokeLast.set(wx, wy);
  }
  for (const L of touched) L.redraw();
}

function endStroke() {
  layerOf(strokeTarget).end();
  stroking = false;
  strokePointerId = -1;
  strokeTarget = null;
}

function clearAllInk() {
  lidInk.clear();
  for (const s of stickers) s.clearInk();
}

function pick(sx: number, sy: number): Sticker | null {
  view.screenToWorld(sx, sy, tmpW);
  for (let i = order.length - 1; i >= 0; i--) {
    if (order[i].hitTest(tmpW.x, tmpW.y)) return order[i];
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (tool !== 'move') {
    if (!stroking) beginStroke(e);
    return;
  }
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
  if (stroking && e.pointerId === strokePointerId) {
    moveStroke(e);
    return;
  }
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
  if (stroking && e.pointerId === strokePointerId) {
    endStroke();
    return;
  }
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
  if (tool !== 'move') s = null;
  if (s === hovered) return;
  if (hovered) hovered.hoverTarget = 0;
  hovered = s;
  if (hovered && hovered.state === 'stuck') hovered.hoverTarget = 1;
  updateCursor();
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

const toolbar = buildToolbar({
  onTool: (t) => {
    tool = t;
    if (t !== 'move') {
      setHover(null);
      selected = null;
    }
    updateCursor();
  },
  onColor: (hex) => {
    inkColor = hex;
    updateCursor();
  },
  onClear: clearAllInk,
});

Promise.all([loadLid(), loadStickers()])
  .then(() => requestAnimationFrame(frame))
  .catch((e) => console.error('sticker load failed', e));
(window as any).__lap = { stickers, scene, view, renderer, step, startReset, toolbar, lidInk, clearAllInk, get order() { return order; }, get selected() { return selected; } };
