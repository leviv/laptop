// The drop zone under the laptop and the showcase it opens: the lid blurs and
// darkens, the dropped sticker floats large in the middle with its description
// underneath, and a click anywhere sends it back where it came from.
import type { StickerDef } from './sticker';
import { describe } from './descriptions';

export interface ShowcaseHooks {
  /** the viewer was dismissed (click or Escape) */
  onClose: () => void;
}

export function buildShowcase(hooks: ShowcaseHooks) {
  // ---- drop zone ----
  const zone = document.createElement('div');
  zone.className = 'dropzone';
  zone.setAttribute('aria-hidden', 'true');
  zone.innerHTML = `<span class="dropzone-label">drop a sticker here to read about it</span>`;
  document.body.appendChild(zone);

  // ---- overlay ----
  const overlay = document.createElement('div');
  overlay.className = 'showcase';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="showcase-stage">
      <div class="showcase-float">
        <div class="showcase-tilt">
          <img class="showcase-img" alt="" draggable="false" />
        </div>
      </div>
      <p class="showcase-desc"></p>
      <p class="showcase-hint">click anywhere to put it back</p>
    </div>`;
  document.body.appendChild(overlay);
  const img = overlay.querySelector<HTMLImageElement>('.showcase-img')!;
  const desc = overlay.querySelector<HTMLParagraphElement>('.showcase-desc')!;

  let openId: string | null = null;
  let closing = false;

  function layout(lidBottom: number, width: number, height: number) {
    // the zone fills the strip between the lid and the bottom edge, with a little air
    const top = lidBottom + 18;
    const bottom = height - 18;
    const h = Math.max(48, bottom - top);
    const w = Math.min(460, width - 48);
    zone.style.top = `${top}px`;
    zone.style.height = `${h}px`;
    zone.style.width = `${w}px`;
    zone.style.left = `${(width - w) / 2}px`;
  }

  function contains(sx: number, sy: number) {
    const r = zone.getBoundingClientRect();
    return sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom;
  }

  /** world-space position of the zone's centre in screen px */
  function centre() {
    const r = zone.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function setOver(on: boolean) {
    zone.classList.toggle('over', on);
  }
  function setArmed(on: boolean) {
    zone.classList.toggle('armed', on);
  }

  function open(def: StickerDef) {
    openId = def.id;
    closing = false;
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
    setOver(false);
    setArmed(false);
  }

  function close() {
    if (openId === null || closing) return;
    closing = true;
    overlay.classList.remove('on');
    openId = null;
    const done = () => {
      overlay.hidden = true;
      overlay.removeEventListener('transitionend', done);
    };
    overlay.addEventListener('transitionend', done);
    window.setTimeout(done, 400); // in case transitionend never fires
    hooks.onClose();
  }

  overlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    close();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openId !== null) close();
  });

  return {
    zone,
    overlay,
    layout,
    contains,
    centre,
    setOver,
    setArmed,
    open,
    close,
    get isOpen() {
      return openId !== null;
    },
    get openId() {
      return openId;
    },
  };
}
