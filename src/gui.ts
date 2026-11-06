import GUI from 'lil-gui';
import { params, saveParams, resetParams, DEFAULTS } from './params';

export interface GuiHooks {
  onChange: () => void; // any param changed
  onMeshChange: () => void; // mesh resolution changed (rebuild)
  onWrapChange: () => void; // edge radius changed (redraw lid)
  onResetLayout: () => void;
}

export function buildGui(hooks: GuiHooks) {
  const gui = new GUI({ title: 'Sticker feel', width: 300 });
  gui.domElement.classList.add('sticker-gui');

  const add = (folder: GUI, obj: any, key: string, min?: number, max?: number, step?: number) => {
    const c = folder.add(obj, key, min, max, step);
    c.onChange(() => {
      saveParams(params);
      hooks.onChange();
    });
    return c;
  };

  const peel = gui.addFolder('Peel');
  add(peel, params.peel, 'holdDuration', 0.05, 1.5, 0.01);
  add(peel, params.peel, 'dragDistance', 10, 400, 1);
  add(peel, params.peel, 'curlRadius', 2, 120, 1);
  add(peel, params.peel, 'liftAngle', 10, 170, 1);
  add(peel, params.peel, 'tailAngle', -30, 90, 1);
  add(peel, params.peel, 'tailRelax', 1, 300, 1);
  add(peel, params.peel, 'frontSoftness', 0.5, 60, 0.5);
  add(peel, params.peel, 'easing', 0, 1, 0.01);

  const drag = gui.addFolder('Drag');
  add(drag, params.drag, 'followStiffness', 20, 1500, 1);
  add(drag, params.drag, 'followDamping', 1, 80, 0.5);
  add(drag, params.drag, 'hoverLift', 0, 12, 0.5);
  add(drag, params.drag, 'carryHeight', 2, 120, 1);
  add(drag, params.drag, 'velocityBend', 0, 0.01, 0.0001);
  add(drag, params.drag, 'bendSmoothing', 1, 60, 0.5);
  add(drag, params.drag, 'residualCurl', 0, 40, 0.5);
  add(drag, params.drag, 'swingTorque', 0, 0.03, 0.0005);
  add(drag, params.drag, 'swingDamping', 0, 30, 0.1);
  add(drag, params.drag, 'swingReturn', 0, 60, 0.5);
  add(drag, params.drag, 'maxSwing', 0, 90, 1);

  const stick = gui.addFolder('Stick');
  add(stick, params.stick, 'dropDuration', 0.02, 0.6, 0.01);
  add(stick, params.stick, 'spreadDuration', 0.05, 1.2, 0.01);
  add(stick, params.stick, 'landAngle', 5, 90, 1);
  add(stick, params.stick, 'squash', 0, 0.08, 0.001);
  add(stick, params.stick, 'squashDuration', 0.05, 0.6, 0.01);
  add(stick, params.stick, 'settleWobble', 0, 8, 0.1);

  const look = gui.addFolder('Look');
  add(look, params.look, 'gloss', 0, 2, 0.01);
  add(look, params.look, 'glossSharpness', 2, 200, 1);
  add(look, params.look, 'lightAzimuth', -180, 180, 1);
  add(look, params.look, 'lightElevation', 5, 89, 1);
  look.addColor(params.look, 'backingTint').onChange(() => {
    saveParams(params);
    hooks.onChange();
  });
  add(look, params.look, 'backingSheen', 0, 1.5, 0.01);
  add(look, params.look, 'contactShadow', 0, 1, 0.01);
  add(look, params.look, 'liftedShadow', 0, 1, 0.01);
  add(look, params.look, 'shadowBlurHeight', 1, 100, 1);
  add(look, params.look, 'shadowScatter', 0, 4, 0.05);
  add(look, params.look, 'indentDepth', 0, 5, 0.05);
  add(look, params.look, 'indentWidth', 0.5, 12, 0.5);
  add(look, params.look, 'indentCrease', 0, 1, 0.01);

  const holo = gui.addFolder('Holo & glitter');
  add(holo, params.holo, 'enabled');
  add(holo, params.holo, 'strength', 0, 2, 0.01);
  add(holo, params.holo, 'bandScale', 0.1, 6, 0.05);
  add(holo, params.holo, 'pointerInfluence', 0, 4, 0.05);
  add(holo, params.holo, 'tiltInfluence', 0, 8, 0.05);
  add(holo, params.holo, 'moveInfluence', 0, 3, 0.05);
  add(holo, params.holo, 'shimmerSpeed', 0, 0.5, 0.005);
  add(holo, params.holo, 'saturation', 0, 1, 0.01);
  add(holo, params.holo, 'glitterTwinkle', 0, 5, 0.05);
  add(holo, params.holo, 'glitterSharpness', 1, 30, 0.5);
  add(holo, params.holo, 'glitterBase', 0, 0.6, 0.01);

  const wrap = gui.addFolder('Edge wrap');
  add(wrap, params.wrap, 'edgeRadius', 1, 40, 0.5).onFinishChange(hooks.onWrapChange);
  add(wrap, params.wrap, 'fadeHeight', 0.5, 60, 0.5);
  add(wrap, params.wrap, 'shade', 0, 1, 0.01);

  const outline = gui.addFolder('Outline');
  outline.addColor(params.outline, 'color').onChange(() => saveParams(params));
  add(outline, params.outline, 'width', 0.5, 6, 0.25);
  add(outline, params.outline, 'dash', 1, 30, 0.5);
  add(outline, params.outline, 'gap', 1, 30, 0.5);
  add(outline, params.outline, 'speed', -120, 120, 1);
  add(outline, params.outline, 'inset', -30, 30, 0.5);

  const sound = gui.addFolder('Sound');
  add(sound, params.sound, 'enabled');
  add(sound, params.sound, 'volume', 0, 1, 0.01);
  add(sound, params.sound, 'peelCrackle', 0, 3, 0.05);
  add(sound, params.sound, 'peelPitch', 0.4, 2.5, 0.05);
  add(sound, params.sound, 'stickThump', 0, 3, 0.05);
  add(sound, params.sound, 'stickSnap', 0, 3, 0.05);

  const mesh = gui.addFolder('Mesh');
  add(mesh, params.mesh, 'segments', 6, 80, 1).onFinishChange(hooks.onMeshChange);
  mesh.close();

  for (const f of [drag, stick, look, holo, wrap, outline, sound]) f.close();

  const actions = {
    copy: async () => {
      const json = JSON.stringify(params, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        flash(gui, 'Copied ✓');
      } catch {
        prompt('Copy settings JSON:', json);
      }
    },
    reset: () => {
      resetParams(params);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      hooks.onChange();
      hooks.onMeshChange();
      hooks.onWrapChange();
      flash(gui, 'Reset to defaults');
    },
    resetLayout: () => hooks.onResetLayout(),
  };
  gui.add(actions, 'copy').name('📋 Copy settings to clipboard');
  gui.add(actions, 'reset').name('Reset to defaults');
  gui.add(actions, 'resetLayout').name('Put stickers back');

  if (window.innerWidth < 760) gui.close();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' && !(e.target instanceof HTMLInputElement)) gui.show(gui._hidden);
  });
  return gui;
}

function flash(gui: GUI, msg: string) {
  const el = gui.domElement.querySelector('.title') as HTMLElement;
  const old = el.textContent;
  el.textContent = msg;
  setTimeout(() => (el.textContent = old), 1200);
}

export { DEFAULTS };
