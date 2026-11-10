import * as THREE from 'three';

// Front: printed vinyl with a glossy specular. Back (gl_FrontFacing false):
// the pale adhesive side. aWrap darkens the part rolled over the laptop edge.

// Uniforms shared by every sticker material (updated once per frame).
export const shared = {
  uTime: { value: 0 },
  // top-down map of how many stuck stickers cover each point of the lid
  uHeight: { value: null as THREE.Texture | null },
  uSurface: { value: new THREE.Vector2(1, 1) },
};

export function makeStickerMaterial(map: THREE.Texture, size: THREE.Vector2) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uSize: { value: size },
      uLightDir: { value: new THREE.Vector3(0.5, 0.6, 0.7).normalize() },
      uGloss: { value: 0.5 },
      uGlossSharp: { value: 83 },
      uBacking: { value: new THREE.Color('#eeeae2') },
      uBackingSheen: { value: 0.3 },
      uWrapShade: { value: 0.5 },
      // holo / glitter
      uTime: shared.uTime,
      uPointer: { value: new THREE.Vector2(0, 0) }, // per sticker: only moves while held
      uHoloKind: { value: 0 },
      uMaskMode: { value: 0 },
      uHoloStrength: { value: 0 },
      uPatchy: { value: 0.5 },
      uFlake: { value: 2.5 },
      uDensity: { value: 0.5 },
      uBandScale: { value: 1.6 },
      uPointerInfl: { value: 1 },
      uTiltInfl: { value: 2 },
      uMoveInfl: { value: 0.6 },
      uShimmer: { value: 0.05 },
      uHoloSat: { value: 0.85 },
      uTwinkle: { value: 1.4 },
      uGlitterSharp: { value: 7 },
      uGlitterBase: { value: 0.18 },
      uFlatColor: { value: new THREE.Color('#ffffff') },
      uFlatten: { value: 0 },
      uFlatLum: { value: 0.5 }, // the photo's typical foil brightness
      uFlatDetail: { value: 0.5 }, // how much of the photo's creases/grain survive flattening
      uTint: { value: new THREE.Color('#ffffff') },
      uTintMix: { value: 0 },
      uBandMul: { value: 1 },
      uSheen: { value: 0 },
      // indent over stickers underneath
      uHeight: shared.uHeight,
      uSurface: shared.uSurface,
      uSelfInMap: { value: 0 },
      uCS: { value: new THREE.Vector2(1, 0) },
      uIndentDepth: { value: 1.1 },
      uIndentWidth: { value: 0.5 },
      uIndentCrease: { value: 0.23 },
    },
    vertexShader: /* glsl */ `
      attribute float aWrap;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vWrap;
      varying float vLift;
      void main() {
        vUv = uv;
        vWrap = aWrap;
        vLift = position.z;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec2 uSize;
      uniform vec3 uLightDir;
      uniform float uGloss;
      uniform float uGlossSharp;
      uniform vec3 uBacking;
      uniform float uBackingSheen;
      uniform float uWrapShade;
      uniform float uTime;
      uniform vec2 uPointer;
      uniform int uHoloKind;
      uniform int uMaskMode;
      uniform float uHoloStrength;
      uniform float uPatchy;
      uniform float uFlake;
      uniform float uDensity;
      uniform float uBandScale;
      uniform float uPointerInfl;
      uniform float uTiltInfl;
      uniform float uMoveInfl;
      uniform float uShimmer;
      uniform float uHoloSat;
      uniform float uTwinkle;
      uniform float uGlitterSharp;
      uniform float uGlitterBase;
      uniform vec3 uFlatColor;
      uniform float uFlatten;
      uniform float uFlatLum;
      uniform float uFlatDetail;
      uniform vec3 uTint;
      uniform float uTintMix;
      uniform float uBandMul;
      uniform float uSheen;
      uniform sampler2D uHeight;
      uniform vec2 uSurface;
      uniform float uSelfInMap;
      uniform vec2 uCS;
      uniform float uIndentDepth;
      uniform float uIndentWidth;
      uniform float uIndentCrease;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vWrap;
      varying float vLift;

      float selfAlpha(vec2 uv) {
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
        return texture2D(map, uv).a;
      }
      // stack height of whatever is stuck under this sheet at a world offset,
      // in sticker thicknesses (this sheet's own footprint removed)
      float under(vec2 off) {
        float n = texture2D(uHeight, (vWorld.xy + off) / uSurface + 0.5).r;
        vec2 loc = vec2(uCS.x * off.x + uCS.y * off.y, -uCS.y * off.x + uCS.x * off.y);
        return n - uSelfInMap * selfAlpha(vUv + loc / uSize);
      }

      vec3 hsv2rgb(vec3 c) {
        vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
        return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
      }
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      // which part of the print carries the finish
      float finishMask(vec3 rgb) {
        float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
        float mx = max(rgb.r, max(rgb.g, rgb.b));
        float mn = min(rgb.r, min(rgb.g, rgb.b));
        float sat = (mx - mn) / max(mx, 1e-3);
        if (uMaskMode == 1) return smoothstep(0.35, 0.8, lum);
        if (uMaskMode == 2) return 1.0 - smoothstep(0.2, 0.6, lum);
        if (uMaskMode == 3) return smoothstep(0.16, 0.45, sat) * smoothstep(0.12, 0.4, lum);
        if (uMaskMode == 4) return (1.0 - smoothstep(0.15, 0.45, sat)) * smoothstep(0.4, 0.75, lum);
        return 1.0;
      }

      void main() {
        vec4 tex = texture2D(map, vUv);
        if (tex.a < 0.02) discard;
        // some foils photograph blotchy: swap the print colour for the foil's own, keeping dark ink
        if (uFlatten > 0.0) {
          float plum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
          float chroma = max(tex.r, max(tex.g, tex.b)) - min(tex.r, min(tex.g, tex.b));
          // ink is dark *and* neutral; dark creases and coloured glints in the foil are not
          float inked = (1.0 - smoothstep(0.1, 0.3, plum)) * (1.0 - smoothstep(0.1, 0.25, chroma));
          // keep the photo's creases and grain as brightness, just evened out
          float rel = mix(1.0, plum / max(uFlatLum, 0.05), uFlatDetail);
          tex.rgb = mix(tex.rgb, uFlatColor * rel, uFlatten * (1.0 - inked));
        }
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;

        // the sheet climbs over the edges of stickers underneath: tilt the
        // normal by the slope of the stack height, and shade the foot of the step
        float crease = 0.0;
        float contact = 1.0 - smoothstep(2.0, 8.0, vLift);
        if (gl_FrontFacing && uIndentDepth > 0.0 && contact > 0.0) {
          float dw = uIndentWidth;
          float hc = under(vec2(0.0));
          float hx1 = under(vec2(dw, 0.0)), hx0 = under(vec2(-dw, 0.0));
          float hy1 = under(vec2(0.0, dw)), hy0 = under(vec2(0.0, -dw));
          vec2 slope = vec2(hx1 - hx0, hy1 - hy0) * (uIndentDepth * contact / (2.0 * dw));
          n = normalize(vec3(n.xy - slope, n.z));
          float foot = max(0.0, (hx1 + hx0 + hy1 + hy0) * 0.25 - hc);
          crease = clamp(foot * uIndentCrease * contact, 0.0, 0.6);
        }

        vec3 L = normalize(uLightDir);
        vec3 V = vec3(0.0, 0.0, 1.0);
        vec3 H = normalize(L + V);
        float ndl = dot(n, L);
        float diff = 0.62 + 0.38 * clamp(ndl, -1.0, 1.0);
        float spec = pow(max(dot(n, H), 0.0), uGlossSharp);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col;
        if (gl_FrontFacing) {
          col = tex.rgb * diff + vec3(spec * uGloss) + rim * 0.08;
          col *= 1.0 - crease;

          if (uHoloKind != 0 && uHoloStrength > 0.0) {
            float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
            float m = finishMask(tex.rgb) * uHoloStrength;
            // viewing-angle proxy: pointer as a moving light, sheet tilt, lid position
            vec2 toP = (uPointer - vWorld.xy) / 500.0;
            float view = (toP.x * 0.8 + toP.y * 0.6) * uPointerInfl
                       + (n.x * 1.2 + n.y * 0.9) * uTiltInfl
                       + (vWorld.x * 0.5 + vWorld.y * 0.35) * 0.004 * uMoveInfl
                       + uTime * uShimmer;
            vec2 px = vUv * uSize;

            if (uHoloKind == 1) {
              // foil: diffraction bands + blotchy crinkle
              float bands = (px.x * 0.7 + px.y * 0.4) * uBandScale * uBandMul * 0.01;
              float crinkle = vnoise(px * 0.025) * 1.6 + vnoise(px * 0.09) * 0.5;
              float hue = fract(bands + view + crinkle * uPatchy);
              // coloured foil: the rainbow is pulled toward the foil's own tint
              vec3 rainbow = mix(hsv2rgb(vec3(hue, uHoloSat, 1.0)), uTint, uTintMix);
              float shine = 0.6 + 0.4 * sin((bands + view) * 6.2831 + crinkle * 3.0 * uPatchy);
              vec3 holo = rainbow * shine;
              vec3 foiled = col * 0.55 + holo * (0.15 + 0.85 * lum);
              // broad metallic glint over the whole sheet; it rolls as the sheet bends
              foiled += uTint * pow(max(dot(n, H), 0.0), 10.0) * uSheen;
              // opaque dark ink hides the foil underneath
              col = mix(col, foiled, clamp(m * smoothstep(0.06, 0.32, lum), 0.0, 1.0));
            } else {
              // glitter: a grid of tiny flakes, each with its own hue and phase
              vec2 g = px / max(uFlake, 0.5);
              vec2 id = floor(g);
              vec2 f = fract(g) - 0.5;
              float h = hash21(id);
              float present = step(1.0 - uDensity, hash21(id + 3.1));
              float disc = smoothstep(0.5, 0.22, length(f + (vec2(hash21(id + 9.7), hash21(id + 5.3)) - 0.5) * 0.4));
              float ph = h * 6.2831 + view * uTwinkle * 6.2831;
              float spark = pow(max(0.0, cos(ph)), uGlitterSharp);
              vec3 fc = hsv2rgb(vec3(hash21(id + 7.3), 0.7, 1.0));
              float amt = present * disc * m;
              col += fc * amt * (uGlitterBase + spark * 1.3) * (0.55 + 0.45 * lum);
            }
          }
        } else {
          col = uBacking * (0.6 + 0.4 * clamp(ndl, 0.0, 1.0)) + vec3(spec * uBackingSheen) + rim * 0.05;
        }
        col *= 1.0 - uWrapShade * vWrap;
        gl_FragColor = vec4(col, tex.a);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: true,
    alphaToCoverage: true,
  });
}

// Height pass: each stuck sticker adds its alpha into a top-down map of the lid,
// so a point covered by two stickers reads 2.0. Additive blend, no depth.
export function makeHeightMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(texture2D(map, vUv).a);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
}

// Planar shadow: the deformed sheet projected along the light onto the lid.
// Sharp mask near contact, blurred & spread mask when lifted.

export function makeShadowMaterial(mask: THREE.Texture, blurred: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: mask },
      uBlur: { value: blurred },
      uLightSlope: { value: new THREE.Vector2(0.4, 0.4) },
      uShadowZ: { value: 0.5 },
      uContact: { value: 0.4 },
      uLifted: { value: 0.2 },
      uBlurHeight: { value: 26 },
      uScatter: { value: 1 },
      uSize: { value: new THREE.Vector2(100, 100) },
      uFade: { value: 1 },
      uInset: { value: 0.72 },
      uBaseZ: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform vec2 uLightSlope;
      uniform float uShadowZ;
      uniform float uBaseZ;
      uniform float uScatter;
      uniform vec2 uSize;
      varying vec2 vUv;
      varying float vH;
      varying vec2 vGrow;
      void main() {
        vUv = uv;
        float h = max((modelMatrix * vec4(position, 1.0)).z - uBaseZ, 0.0);
        vH = h;
        // the higher the sheet, the wider its shadow spreads: grow the quad itself
        // (sampling a smaller patch of the blur instead would run into the quad's edge)
        vGrow = 1.0 + (uScatter * h * 0.6) / uSize;
        vec3 p = position;
        p.xy *= vGrow;
        vec4 w = modelMatrix * vec4(p, 1.0);
        w.xy -= uLightSlope * h;
        w.z = uShadowZ;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMask;
      uniform sampler2D uBlur;
      uniform float uContact;
      uniform float uLifted;
      uniform float uBlurHeight;
      uniform float uScatter;
      uniform vec2 uSize;
      uniform float uFade;
      uniform float uInset;
      varying vec2 vUv;
      varying float vH;
      varying vec2 vGrow;
      void main() {
        float k = smoothstep(0.0, uBlurHeight, vH);
        // this quad is 1/uInset larger than the sticker (and grows with height): the
        // sharp mask sits in its centre, the blurred mask (drawn at uInset) fills it
        vec2 uvS = (vUv - 0.5) * vGrow / uInset + 0.5;
        float inS = step(0.0, uvS.x) * step(uvS.x, 1.0) * step(0.0, uvS.y) * step(uvS.y, 1.0);
        float sharp = texture2D(uMask, uvS).a * inS;
        float soft = texture2D(uBlur, vUv).a;
        // contact shadow fades in with the first few px of lift
        float contact = sharp * uContact * smoothstep(0.0, 2.5, vH) * (1.0 - k);
        float lifted = soft * uLifted * k;
        float a = (contact + lifted) * uFade;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}

export const INSET = 0.72;

/** blurred copy of the alpha channel for the soft shadow; softness is a fraction of the sticker size */
export function makeBlurredAlpha(img: HTMLImageElement, softness = 0.07): THREE.CanvasTexture {
  const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(4, Math.round(img.naturalWidth * scale)),
    h = Math.max(4, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  // draw at ~70% so the blur has room to spread inside the (enlarged) shadow quad
  const s = INSET;
  ctx.filter = `blur(${(softness * Math.max(w, h) * s).toFixed(2)}px)`;
  ctx.drawImage(img, w * (1 - s) * 0.5, h * (1 - s) * 0.5, w * s, h * s);
  ctx.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
