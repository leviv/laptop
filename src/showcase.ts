// The details overlay: hold a carried sticker still and the lid blurs and
// darkens behind a large, slowly drifting copy of the sticker with its
// description underneath. Moving the sticker (or letting go) dismisses it.
// A double tap on a sticker opens the same overlay until the next click.
import type { StickerDef } from './sticker';
import { describe } from './descriptions';

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
          <img class="showcase-img" alt="" draggable="false" />
        </div>
      </div>
      <p class="showcase-desc"></p>
      <p class="showcase-hint"></p>
    </div>`;
  document.body.appendChild(overlay);
  const img = overlay.querySelector<HTMLImageElement>('.showcase-img')!;
  const desc = overlay.querySelector<HTMLParagraphElement>('.showcase-desc')!;
  const hint = overlay.querySelector<HTMLParagraphElement>('.showcase-hint')!;

  let openId: string | null = null;
  let hideTimer = 0;

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
  }

  function close() {
    if (openId === null) return;
    openId = null;
    overlay.classList.remove('on');
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
  };
}
