// One line about each sticker, shown under it in the showcase when it is
// dropped into the zone below the laptop. Keyed by the sticker id from
// src/layout.ts (which also carries the image path, public/stickers/<id>.png).
// These are first-draft descriptions written from the pictures alone: edit freely.

export const DESCRIPTIONS: Record<string, string> = {
  '42-94': 'A white cat, eyes closed, holding something aloft. A mic, a matcha, a small trophy. It has never explained itself.',
  '31-154': 'Umbreon, drowned in glitter. The flakes catch the light from any angle, which is the whole point of a glitter sticker.',
  '31-150': 'A carton of strawberry oat milk with a face. Pastel, slightly smug, and the tallest thing on the lid.',
  '29-149': 'A sleeping fox with glitter in its fur. Tilt the laptop and it twinkles.',
  '29-148': 'The fox’s companion: a small glitter hedgehog, all quills and dignity.',
  '29-147': 'A cat wearing an apple like a jacket. Reasonable, if you think about it.',
  '28-123': '“我是女权主义者” — I am a feminist, in Chinese. Worn soft at the edges from years of being carried around.',
  '29-146': 'StyleX, Meta’s styling system, drawn as an orbit. The one sticker on here that compiles.',
  '29-145': 'A bear at a laptop, eyes glowing red, coffee untouched. A self-portrait on a deadline.',
  '34-13': 'A photograph of an orange kitten, standing up for reasons of its own.',
  '27-109': 'A long green worm, hand-drawn, going somewhere slowly.',
  '27-97': 'A grey cat in glasses, an orange coat and yellow boots, backpack on, off to school.',
  '27-91': 'A cat on a surfboard, riding a very blue wave at sunset. Unbothered.',
  '27-85': 'A cat in a kitchen holding a croissant, surrounded by plants and a rainbow. Domestic bliss.',
  '29-135': 'A blurry photo-collage creature with googly eyes. It came out of a sticker machine and nobody asked questions.',
  '6-79': 'IMA Low Res at NYU Tisch: the Interactive Media Arts undergraduate program, with a twin in Shanghai. The pixel type gives it away.',
  '6-66': 'A pink-lined scribble of a cat mid-leap, cut from a sheet of hand-drawn stickers.',
  '6-59': 'Its sibling: a scribble cat in a tiny hat, looking faintly alarmed.',
  '4-4': 'The Wikipedia centipede. Every segment is a letter, and it has read more than you.',
  '6-35': 'A pencil sketch of a face, half-finished on purpose, cut out and stuck down.',
  '6-41': 'K.O. A pixel-art cat boxer in orange shorts, one punch in.',
  '27-103': '“I passed shop safety!” A circular saw blade in flames, awarded for keeping all ten fingers.',
  '27-117': '$FIG with the arrow pointing up. Figma’s ticker, from around the time it listed.',
  '28-129': 'A calico cat hugging a carton of milk with a straw in it. The carton is a little too big.',
  '42-95': 'A pixel-art cat at a counter, bucket in hand, waiting to be served.',
  '29-141': 'A pixel chicken in cream and brown, wearing a very small red comb.',
  '34-7': 'The green worm’s orange cousin: equally long, equally unhurried.',
  '42-98': 'A spotted lanternfly with its wings open. Gorgeous, invasive, and squashed on sight across New York.',
  '41-79': 'BUZZ in graffiti lettering on holographic foil. The outlines stay matte; everything else shifts.',
  '41-78': 'buzz again, lowercase this time, on a square of very shiny pink foil.',
  '42-84': '“I didn’t start a fire at ITP Camp 2024.” A cat, a match, and a summer at NYU’s Interactive Telecommunications Program.',
  '44-119': 'A speech bubble of kaomoji in pink ink, waving hello.',
  '42-108': 'A tiny bug. Possibly a real one. It has been there a while.',
  '42-102': 'A small green caterpillar, the kind that comes free on a sheet.',
  '44-116': 'Another kaomoji bubble, sending a heart sideways.',
  '34-72': 'The third kaomoji bubble, because one is never enough.',
  '34-9': 'Data & Design in holographic script over a wireframe icosahedron. The foil follows the lines.',
};

export function describe(id: string, fallback: string) {
  return DESCRIPTIONS[id] ?? fallback;
}
