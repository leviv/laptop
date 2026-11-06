import * as THREE from 'three';

// Front: printed vinyl with a glossy specular. Back (gl_FrontFacing false):
// the pale adhesive side. aWrap darkens the part rolled over the laptop edge.

export function makeStickerMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uLightDir: { value: new THREE.Vector3(0.5, 0.6, 0.7).normalize() },
      uGloss: { value: 0.5 },
      uGlossSharp: { value: 40 },
      uBacking: { value: new THREE.Color('#eeeae2') },
      uBackingSheen: { value: 0.3 },
      uWrapShade: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      attribute float aWrap;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vWrap;
      void main() {
        vUv = uv;
        vWrap = aWrap;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uLightDir;
      uniform float uGloss;
      uniform float uGlossSharp;
      uniform vec3 uBacking;
      uniform float uBackingSheen;
      uniform float uWrapShade;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vWrap;
      void main() {
        vec4 tex = texture2D(map, vUv);
        if (tex.a < 0.02) discard;
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 L = normalize(uLightDir);
        vec3 V = vec3(0.0, 0.0, 1.0);
        vec3 H = normalize(L + V);
        float ndl = dot(n, L);
        float diff = 0.62 + 0.38 * clamp(ndl, -1.0, 1.0);
        float spec = pow(max(dot(n, H), 0.0), uGlossSharp);
        // a soft fresnel-ish sheen on grazing (curled) parts
        float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col;
        if (gl_FrontFacing) {
          col = tex.rgb * diff + vec3(spec * uGloss) + rim * 0.08;
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
    },
    vertexShader: /* glsl */ `
      uniform vec2 uLightSlope;
      uniform float uShadowZ;
      varying vec2 vUv;
      varying float vH;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        float h = max(w.z, 0.0);
        vH = h;
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
      void main() {
        float k = smoothstep(0.0, uBlurHeight, vH);
        // the blurred mask sits in the central uInset of its texture; map it onto the
        // full quad, then enlarge it with height
        vec2 grow = 1.0 + (uScatter * vH * 0.6) / uSize;
        vec2 uvB = (vUv - 0.5) * uInset / grow + 0.5;
        float sharp = texture2D(uMask, vUv).a;
        float soft = texture2D(uBlur, uvB).a;
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

/** blurred copy of the alpha channel for the soft shadow */
export function makeBlurredAlpha(img: HTMLImageElement, radius = 14): THREE.CanvasTexture {
  const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(4, Math.round(img.naturalWidth * scale)),
    h = Math.max(4, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  // draw at ~70% so the blur has room to spread inside the quad
  const s = INSET;
  ctx.filter = `blur(${radius * scale}px)`;
  ctx.drawImage(img, w * (1 - s) * 0.5, h * (1 - s) * 0.5, w * s, h * s);
  ctx.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
