// All tweakable knobs for the sticker feel. Edited live via lil-gui.
// "Copy settings" in the GUI puts this object (as JSON) on the clipboard.

export const DEFAULTS = {
  peel: {
    holdDuration: 0.32, // s to fully peel when just holding still
    dragDistance: 90, // px of drag that also completes the peel
    curlRadius: 58, // px — bend radius at the peel front; bigger = stiffer sheet
    liftAngle: 42, // deg — angle the lifted flap reaches at the grab point
    tailAngle: 30, // deg — the free tail behind the grab point levels off to this
    tailRelax: 220, // px over which the tail levels off (large = stays straight)
    frontSoftness: 18, // px — how gradually the front rises off the surface
    easing: 0.55, // 0 = linear peel, 1 = strong ease-out
  },
  drag: {
    followStiffness: 420, // spring that pulls the sticker to the pointer
    followDamping: 28,
    hoverLift: 3, // px lift on hover
    carryHeight: 34, // px the sticker floats while carried
    velocityBend: 0.00025, // rigid tilt into motion (air drag feel)
    bendSmoothing: 8, // how fast the tilt reacts (lower = heavier)
    residualCurl: 1.5, // px — vinyl keeps a faint curl when free
    swingTorque: 0.0015, // pendulum rotation from the grab point
    swingDamping: 6.5,
    swingReturn: 9, // weak spring back to the pickup angle
    maxSwing: 22, // deg
  },
  stick: {
    dropDuration: 0.13, // s for the grab point to touch down
    spreadDuration: 0.22, // s for the stuck region to spread outward
    landAngle: 22, // deg — how steeply the unstuck sheet hangs above the front
    squash: 0.006, // in-plane scale pulse on contact
    squashDuration: 0.2,
    settleWobble: 0.6, // deg of rotational settle on landing
  },
  look: {
    gloss: 0.55, // vinyl specular
    glossSharpness: 42,
    lightAzimuth: 125, // deg
    lightElevation: 52, // deg
    backingTint: '#eeeae2', // adhesive side colour
    backingSheen: 0.3,
    contactShadow: 0.5,
    liftedShadow: 0.32,
    shadowBlurHeight: 26, // px height over which the shadow softens
    shadowScatter: 1, // how far the soft shadow spreads
  },
  wrap: {
    edgeRadius: 12, // px — bevel radius the sticker rolls over
    fadeHeight: 12, // px — wrapping only kicks in near the surface
    shade: 0.6, // extra darkening on the rolled-over part
  },
  outline: {
    color: '#0d99ff',
    width: 1.5,
    dash: 6,
    gap: 5,
    speed: 18, // px/s
    inset: -5, // px, negative = outside the sticker edge
  },
  sound: {
    enabled: true,
    volume: 0.7,
    peelCrackle: 1.0,
    peelPitch: 1.0,
    stickThump: 1.0,
    stickSnap: 0.8,
  },
  mesh: {
    segments: 28, // mesh resolution along the longer side
  },
};

export type Params = typeof DEFAULTS;

const STORAGE_KEY = 'laptop-sticker-params-v2';

function deepMerge<T>(base: T, patch: any): T {
  if (typeof base !== 'object' || base === null) return patch ?? base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(base as any)) {
    if (patch && k in patch) out[k] = deepMerge((base as any)[k], patch[k]);
  }
  return out;
}

export function loadParams(): Params {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return deepMerge(structuredClone(DEFAULTS), JSON.parse(raw));
  } catch {}
  return structuredClone(DEFAULTS);
}

export function saveParams(p: Params) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {}
}

export function resetParams(p: Params) {
  const d = structuredClone(DEFAULTS) as any;
  for (const k of Object.keys(d)) Object.assign((p as any)[k], d[k]);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export const params: Params = loadParams();
