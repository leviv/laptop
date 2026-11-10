// The details overlay: hold a carried sticker still and the lid blurs and
// darkens behind a large, slowly drifting copy of the sticker with its
// description underneath. Moving the sticker (or letting go) dismisses it.
// A double tap on a sticker opens the same overlay until the next click.
//
// The big sticker is drawn with the sticker's own shader in a small WebGL
// canvas, so foil and glitter keep shimmering, and it is turned in 3D there:
// a slow idle wobble plus a lean toward the pointer, as if pressed by it.
// Because the sheet really tilts, the foil bands and the glint roll with it.
import * as THREE from 'three';
import type { Sticker } from './sticker';
import { makeStickerMaterial, shared } from './shaders';
import { describe } from './descriptions';

const AIM_MAX = 16; // degrees of lean when the pointer reaches the edge of the window
const AIM_RATE = 9; // 1/s: how quickly the lean follows the pointer
const MARGIN = 1.35; // canvas is this much wider than the sticker so a tilted sheet isn't clipped
const FOV = 28; // degrees

export function buildShowcase() {
  const overlay = document.createElement('div');
  overlay.className = 'showcase';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-live', 'polite');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="showcase-stage">
      <div class="showcase-float">
        <div class="showcase-tilt">
          <canvas class="showcase-img" role="img"></canvas>
        </div>
      </div>
      <p class="showcase-desc"></p>
      <p class="showcase-hint"></p>
    </div>`;
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector<HTMLCanvasElement>('.showcase-img')!;
  const desc = overlay.querySelector<HTMLParagraphElement>('.showcase-desc')!;
  const hint = overlay.querySelector<HTMLParagraphElement>('.showcase-hint')!;

  // ---- the little scene ----
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 100000);
  camera.lookAt(0, 0, 0);
  // no stack underneath in here: a blank height map keeps the indent code quiet
  const blankHeight = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blankHeight.needsUpdate = true;
  let mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let openId: string | null = null;
  let hideTimer = 0;
  let shown = false; // overlay not hidden (open, or still fading out)
  let started = 0; // when the current sticker came up

  function mount(s: Sticker) {
    unmount();
    const { w, h } = s.def;
    const geo = new THREE.PlaneGeometry(w, h, 1, 1);
    geo.setAttribute('aWrap', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    // a fresh material with the sticker's exact look, minus anything about the lid
    const src = s.material.uniforms;
    const mat = makeStickerMaterial(src.map.value, (src.uSize.value as THREE.Vector2).clone());
    for (const k of Object.keys(mat.uniforms)) {
      if (k === 'map' || k === 'uSize' || k === 'uTime' || k === 'uHeight' || k === 'uSurface') {
        continue;
      }
      const v = src[k]?.value;
      if (v === undefined) {
        continue;
      }
      mat.uniforms[k].value = typeof v === 'object' && v !== null && 'clone' in v ? (v as any).clone() : v;
    }
    mat.uniforms.uTime = shared.uTime;
    mat.uniforms.uHeight = { value: blankHeight };
    mat.uniforms.uSelfInMap.value = 0;
    mat.uniforms.uIndentDepth.value = 0;
    mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    // the sticker's long side fills 1/MARGIN of the square canvas at rest
    const span = Math.max(w, h) * MARGIN;
    camera.position.set(0, 0, span / (2 * Math.tan((FOV / 2) * (Math.PI / 180))));
    camera.lookAt(0, 0, 0);
    fit();
  }

  function unmount() {
    if (!mesh) {
      return;
    }
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = null;
  }

  /** size the canvas to the window: the sticker's long side is min(62vmin, 560px) */
  function fit() {
    const S = Math.min(0.62 * Math.min(window.innerWidth, window.innerHeight), 560);
    const C = Math.round(S * MARGIN);
    renderer.setSize(C, C, false);
    canvas.style.width = canvas.style.height = `${C}px`;
    // the transparent margin shouldn't push the description away
    canvas.style.margin = `${-Math.round((C - S) / 2)}px`;
  }
  window.addEventListener('resize', () => {
    if (shown) {
      fit();
    }
  });

  // ---- pointer-driven lean ----
  // Target lean is the pointer's offset from the sticker's centre, in units
  // of half the window, so the full lean comes at the window's edge. The
  // overlay itself takes no pointer events, so the window sees every move.
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, known: false };
  const target = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  let raf = 0;
  let lastFrame = 0;

  function retarget() {
    if (!pointer.known) {
      target.x = 0;
      target.y = 0;
      return;
    }
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    target.x = clamp((pointer.x - cx) / (window.innerWidth / 2), -1, 1);
    target.y = clamp((pointer.y - cy) / (window.innerHeight / 2), -1, 1);
  }

  function render() {
    if (!mesh) {
      return;
    }
    const t = (performance.now() - started) / 1000;
    const idle = reducedMotion.matches ? 0 : 1;
    const D = Math.PI / 180;
    // idle wobble, plus the lean: the side under the pointer goes away from the viewer
    mesh.rotation.set(
      (Math.sin(t * 0.45) * 4 * idle + lean.y * AIM_MAX) * D,
      (Math.sin(t * 0.33 + 1) * 6 * idle + lean.x * AIM_MAX) * D,
      Math.sin(t * 0.27 + 2) * 1.2 * idle * D,
    );
    // the foil's "light" sweeps with the pointer too, and drifts on its own
    const p = mesh.material.uniforms.uPointer.value as THREE.Vector2;
    p.set(lean.x * 700 + Math.sin(t * 0.21) * 160 * idle, -lean.y * 700 + Math.cos(t * 0.17) * 120 * idle);
    renderer.render(scene, camera);
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const k = 1 - Math.exp(-dt * AIM_RATE);
    lean.x += (target.x - lean.x) * k;
    lean.y += (target.y - lean.y) * k;
    if (shown) {
      render();
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  }

  function startTicking() {
    if (raf) {
      return;
    }
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  }

  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.known = true;
    if (openId !== null) {
      retarget();
    }
  });

  function open(s: Sticker, how: string) {
    hint.textContent = how;
    if (openId === s.def.id) return;
    openId = s.def.id;
    window.clearTimeout(hideTimer);
    started = performance.now();
    mount(s);
    canvas.setAttribute('aria-label', s.def.name ?? '');
    desc.textContent = describe(s.def.id, s.def.name ?? '');
    overlay.hidden = false;
    shown = true;
    // force a style flush so the transition runs
    void overlay.offsetWidth;
    overlay.classList.add('on');
    retarget();
    render();
    startTicking();
  }

  function close() {
    if (openId === null) return;
    openId = null;
    overlay.classList.remove('on');
    // ease back to flat while it fades
    target.x = 0;
    target.y = 0;
    startTicking();
    hideTimer = window.setTimeout(() => {
      overlay.hidden = true;
      shown = false;
      unmount();
    }, 340);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return {
    overlay,
    canvas,
    open,
    close,
    render,
    get isOpen() {
      return openId !== null;
    },
    /** current lean in [-1, 1] per axis (for tests) */
    get lean() {
      return { ...lean };
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
