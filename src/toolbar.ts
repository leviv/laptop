// FigJam-style floating toolbar: move / marker / eraser, colour swatches, clear.
import { PALETTE, type Tool } from './ink';

export interface ToolbarHooks {
  onTool: (tool: Tool) => void;
  onColor: (hex: string) => void;
  onClear: () => void;
}

const ICONS: Record<string, string> = {
  move: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4.5 2.5l11 8.2-4.8 1 2.9 5.2-2.1 1.1-2.9-5.2-3.5 3.4z" fill="currentColor"/></svg>`,
  marker: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.6 2.9l4.5 4.5-8.3 8.3-5.6 1.1 1.1-5.6z" fill="currentColor"/><path d="M3.6 17.2h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".45"/></svg>`,
  eraser: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M11.2 3.4l5.4 5.4-6.6 6.6H6.4L3.4 12.4z" fill="currentColor"/><path d="M3.6 17.2h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".45"/><path d="M6.9 8.6l4.5 4.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".9"/></svg>`,
  clear: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5.5h10M8 5.5V4h4v1.5M6.3 5.5l.7 10.5h6l.7-10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

export function buildToolbar(hooks: ToolbarHooks) {
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Drawing tools');

  const tools: { key: Tool; label: string; shortcut: string }[] = [
    { key: 'move', label: 'Move stickers', shortcut: 'V' },
    { key: 'marker', label: 'Marker', shortcut: 'M' },
    { key: 'eraser', label: 'Eraser', shortcut: 'E' },
  ];
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  for (const t of tools) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.innerHTML = ICONS[t.key];
    b.title = `${t.label} (${t.shortcut})`;
    b.setAttribute('aria-label', t.label);
    b.addEventListener('click', () => setTool(t.key));
    bar.appendChild(b);
    toolBtns.set(t.key, b);
  }

  const sep = document.createElement('div');
  sep.className = 'sep';
  bar.appendChild(sep);

  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  swatches.setAttribute('role', 'radiogroup');
  swatches.setAttribute('aria-label', 'Marker colour');
  const swatchBtns: HTMLButtonElement[] = [];
  for (const s of PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = s.hex;
    b.title = s.name;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', s.name);
    b.addEventListener('click', () => setColor(s.hex));
    swatches.appendChild(b);
    swatchBtns.push(b);
  }
  bar.appendChild(swatches);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'tool clear';
  clear.innerHTML = ICONS.clear;
  clear.title = 'Wipe all ink';
  clear.setAttribute('aria-label', 'Wipe all ink');
  clear.addEventListener('click', hooks.onClear);
  bar.appendChild(clear);

  let tool: Tool = 'move';
  let color = PALETTE[1].hex;

  function setTool(t: Tool) {
    tool = t;
    for (const [k, b] of toolBtns) {
      b.classList.toggle('on', k === t);
      b.setAttribute('aria-pressed', String(k === t));
    }
    const drawing = t !== 'move';
    sep.hidden = !drawing;
    swatches.hidden = t !== 'marker';
    clear.hidden = !drawing;
    hooks.onTool(t);
  }
  function setColor(hex: string) {
    color = hex;
    swatchBtns.forEach((b, i) => {
      const on = PALETTE[i].hex === hex;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    hooks.onColor(hex);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'v' || k === 'escape') setTool('move');
    else if (k === 'm') setTool('marker');
    else if (k === 'e') setTool('eraser');
  });

  document.body.appendChild(bar);
  setColor(color);
  setTool(tool);
  return { el: bar, setTool, setColor, get tool() { return tool; }, get color() { return color; } };
}

/** a dot cursor in the ink colour, like FigJam's marker */
export function markerCursor(hex: string, erase: boolean) {
  const r = erase ? 9 : 6;
  const fill = erase ? '%23ffffff' : encodeURIComponent(hex);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${r * 2 + 4}' height='${r * 2 + 4}' viewBox='0 0 ${r * 2 + 4} ${r * 2 + 4}'><circle cx='${r + 2}' cy='${r + 2}' r='${r}' fill='${fill}' stroke='%23ffffff' stroke-width='2'/><circle cx='${r + 2}' cy='${r + 2}' r='${r + 1}' fill='none' stroke='rgba(0,0,0,0.35)' stroke-width='1'/></svg>`;
  return `url("data:image/svg+xml,${svg}") ${r + 2} ${r + 2}, crosshair`;
}
