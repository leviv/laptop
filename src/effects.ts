// Per-sticker surface finishes. The mask is derived from the photo's own
// colours in the shader (see MASK_MODES), so no extra textures are needed.

export type HoloKind = 'none' | 'foil' | 'glitter';
export type MaskMode = 'all' | 'bright' | 'dark' | 'sat' | 'silver';

export interface HoloConfig {
  kind: HoloKind;
  mask: MaskMode;
  strength: number; // per-sticker multiplier on the global strength
  patchy?: number; // foil: how blotchy the rainbow is (0 = clean bands)
  flake?: number; // glitter: flake size in sticker px
  density?: number; // glitter: fraction of cells that hold a flake
}

export const MASK_MODES: Record<MaskMode, number> = { all: 0, bright: 1, dark: 2, sat: 3, silver: 4 };
export const KINDS: Record<HoloKind, number> = { none: 0, foil: 1, glitter: 2 };

export const EFFECTS: Record<string, HoloConfig> = {
  // Umbreon: confetti-flake holo over the whole sticker
  '31-154': { kind: 'glitter', mask: 'all', strength: 1, flake: 2.6, density: 0.55 },
  // hedgehog + fox: fine glitter in the dark fur
  '29-148': { kind: 'glitter', mask: 'dark', strength: 0.9, flake: 2.1, density: 0.4 },
  '29-149': { kind: 'glitter', mask: 'dark', strength: 0.7, flake: 2.1, density: 0.35 },
  // BUZZ graffiti: holo foil across the whole print (the black outlines stay matte)
  '41-79': { kind: 'foil', mask: 'all', strength: 0.75, patchy: 0.5 },
  // buzz: pink holo foil, blotchy
  '41-78': { kind: 'foil', mask: 'all', strength: 0.5, patchy: 0.55 },
  // Data & Design: the icosahedron lines are foil
  '34-9': { kind: 'foil', mask: 'sat', strength: 1.15, patchy: 0.3 },
};
