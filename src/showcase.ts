// The details overlay: hold a carried sticker still and the lid blurs and
// darkens behind a large, slowly drifting copy of the sticker with its
// description underneath. Moving the sticker (or letting go) dismisses it.
// A double tap on a sticker opens the same overlay until the next click, and
// while it is up the sticker leans with the pointer, as if pressed by it.
import type { StickerDef } from './sticker';
import { describe } from './descriptions';

const AIM_MAX = 16; // degrees of lean when the pointer reaches the edge of the window
const AIM_RATE = 9; // 1/s: how quickly the lean follows the pointer

export function buildShowcase() {
  const overlay = document.createElement('div');
  overlay.className = 'showcase';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-live', 'polite');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="showcase-stage">
      <div class="showcase-float">
        <div class="showcase-aim">
          <div class="showcase-tilt">
            <img class="showcase-img" alt="" draggable="false" />
          </div>
        </div>
      </div>
      <p class="showcase-desc"></p>
      <p class="showcase-hint"></p>
    </div>`;
  document.body.appendChild(overlay);
  const aim = overlay.querySelector<HTMLDivElement>('.showcase-aim')!;
  const img = overlay.querySelector<HTMLImageElement>('.showcase-img')!;
  const desc = overlay.querySelector<HTMLParagraphElement>('.showcase-desc')!;
  const hint = overlay.querySelector<HTMLParagraphElement>('.showcase-hint')!;

  let openId: string | null = null;
  let hideTimer = 0;

  // ---- pointer-driven lean ----
  // Target lean is set from the pointer's offset from the sticker's centre, in
  // units of half the window, so the full lean comes at the window's edge. The
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
    const r = aim.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    target.x = clamp((pointer.x - cx) / (window.innerWidth / 2), -1, 1);
    target.y = clamp((pointer.y - cy) / (window.innerHeight / 2), -1, 1);
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const k = 1 - Math.exp(-dt * AIM_RATE);
    lean.x += (target.x - lean.x) * k;
    lean.y += (target.y - lean.y) * k;
    // the side under the pointer goes away from the viewer, as if pressed
    aim.style.transform = `rotateX(${(-lean.y * AIM_MAX).toFixed(2)}deg) rotateY(${(lean.x * AIM_MAX).toFixed(2)}deg)`;
    if (openId !== null || Math.abs(lean.x) + Math.abs(lean.y) > 0.002) {
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

  function open(def: StickerDef, how: string) {
    hint.textContent = how;
    if (openId === def.id) return;
    openId = def.id;
    window.clearTimeout(hideTimer);
    img.src = def.src;
    img.alt = def.name ?? '';
    // scale the artwork so a wide sticker and a tall one feel the same size
    const aspect = def.w / def.h;
    img.style.width = aspect >= 1 ? 'min(62vmin, 560px)' : `min(${(62 * aspect).toFixed(1)}vmin, ${Math.round(560 * aspect)}px)`;
    desc.textContent = describe(def.id, def.name ?? '');
    overlay.hidden = false;
    // force a style flush so the transition runs
    void overlay.offsetWidth;
    overlay.classList.add('on');
    retarget();
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
    }, 340);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return {
    overlay,
    open,
    close,
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
