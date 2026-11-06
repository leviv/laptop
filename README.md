# laptop

A microsite of the stickers on my work laptop from five years at Figma. Peel any
sticker off, carry it around, and stick it back anywhere on the lid.

## Run

```bash
npm install
npm run dev
```

Press **G** to toggle the tuning panel. **Copy settings to clipboard** puts the
current parameter set on the clipboard as JSON; paste it over `DEFAULTS` in
`src/params.ts` once a feel is dialled in. Tweaks are also persisted to
`localStorage`, so reloads keep them until you hit **Reset to defaults**.

## How it works

- `src/sticker.ts` — the sticker state machine (`stuck → peeling → carried → sticking`)
  and the per-frame mesh deformation. Each sticker is a subdivided plane whose
  vertices are moved on the CPU every frame.
- `src/profile.ts` — the 1-D bending profile of a stiff sheet leaving a surface:
  a circular arc of the curl radius, a straight run up to the grab point, and a
  relaxing tail. Peeling sweeps a straight front away from the grab point;
  re-sticking spreads a circular front outward from the touch point.
- `src/shaders.ts` — vinyl front / adhesive back material with a glossy specular,
  plus a planar shadow that projects the deformed sheet along the light: sharp
  near contact, blurred and spread when lifted.
- `src/laptop.ts` — the lid as a rounded-rect signed distance field. Any part of
  a sticker past the flat face rolls over the bevel and down the side.
- `src/contour.ts` — alpha mask → outline polygon (marching squares) for the
  dashed selection ring and hit testing.
- `src/audio.ts` — procedural Web Audio sounds: adhesive crackle while peeling,
  a pop when it lets go, a thump + spreading crackle + snap on re-stick.
- `src/layout.ts` — starting positions, generated from the Figma frame.

Assets come from the Figma file (node `60:3`): `public/laptop.png` is the lid
render, `public/stickers/*.png` are each sticker node rendered in isolation,
named by node id.
