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
  /** replace the photo's print colour with this one (keeps dark ink): for foils that photographed blotchy */
  flat?: string;
  flatten?: number; // 0..1, how fully `flat` replaces the photo (default 1 when `flat` is set)
  detail?: number; // 0..1, how much of the photo's creases/grain stay as brightness (default 0.5)
  tint?: string; // foil: pull the rainbow toward this colour (coloured foil instead of silver)
  tintMix?: number; // 0..1
  bands?: number; // foil: multiplier on the diffraction band scale (lower = broader, calmer sheen)
  sheen?: number; // foil: broad metallic highlight that brightens the whole sheet
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
  // buzz: a uniform, very shiny pink foil. The photo caught it blotchy, so its
  // colour is evened out to one pink (creases and grain kept) and the foil is
  // tinted pink rather than rainbow.
  '41-78': { kind: 'foil', mask: 'all', strength: 0.85, patchy: 0.22, flat: '#d2466a', flatten: 0.85, detail: 0.6, tint: '#ff78a8', tintMix: 0.55, bands: 0.5, sheen: 0.45 },
  // Data & Design: the icosahedron lines are foil
  '34-9': { kind: 'foil', mask: 'sat', strength: 1.15, patchy: 0.3 },
};
