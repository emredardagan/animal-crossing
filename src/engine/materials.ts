// The web version's ShaderMaterials and canvas textures, rebuilt for WebGPU:
// TSL node materials (fog and tone mapping come for free) and JS-generated textures.
import * as THREE from 'three/webgpu';
import { Fn, uniform, vec2, vec3, float, positionWorld, normalView, positionViewDirection, sin, dot, fract, floor, mix, smoothstep, abs, pow } from 'three/tsl';

export const uTime = uniform(0);

// stylised water: toon ripples + drifting foam
// TSL's typings are stricter than its runtime; the helpers take any vec2 node
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const hash = (p: N) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
const noise = (p: N) => {
  const i: N = floor(p), f0: N = fract(p);
  const f: N = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(
    mix(hash(i), hash(i.add(vec2(1, 0))), f.x),
    mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), f.x),
    f.y,
  );
};

export function makeWaterMaterial() {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = Fn(() => {
    const w = positionWorld.xz;
    const p = w.mul(vec2(0.9, 1.6));
    const r = noise(p.mul(1.3).add(vec2(uTime.mul(0.35), 0))).mul(0.6)
      .add(noise(p.mul(2.7).sub(vec2(uTime.mul(0.2), uTime.mul(0.1)))).mul(0.4));
    const deep = vec3(0.2, 0.62, 0.86), shallow = vec3(0.45, 0.84, 0.95);
    const col = mix(deep, shallow, smoothstep(0.35, 0.75, r));
    const edge = abs(fract(w.y.add(0.5)).sub(0.5));
    const foam = smoothstep(0.72, 0.78, r).mul(0.55)
      .add(smoothstep(0.4, 0.5, edge).mul(sin(w.x.mul(3).add(uTime.mul(2))).mul(0.5).add(0.5)).mul(0.5));
    return mix(col, vec3(1), foam);
  })();
  return m;
}

// soft soap-bubble shield (fresnel rim)
export function makeBubbleMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.toneMapped = false;
  m.fog = false;
  const f = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.2);
  m.colorNode = mix(vec3(0.6, 0.9, 1), vec3(1, 0.7, 0.95), sin(uTime.mul(2).add(normalView.y.mul(4))).mul(0.5).add(0.5));
  m.opacityNode = f.mul(0.7).add(0.08);
  return m;
}

// soft glows for night: car beams, lamp pools, neon (white RGB, alpha carries the shape)
export function glowTexture(kind: 'beam' | 'dot') {
  const S = 64, data = new Uint8Array(S * S * 4);
  // piecewise-linear gradient like the canvas color stops
  const ramp = (t: number, mid: number) => t <= 0 ? 1 : t >= 1 ? 0 : t < mid ? 1 - 0.45 * (t / mid) : 0.55 * (1 - (t - mid) / (1 - mid));
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    let a: number;
    if (kind === 'beam') {
      a = ramp((r + 0.5) / S, 0.25); // bright at v = 0 (the car end), fading away
      const x = (c + 0.5) / S, side = x < 0.3 ? 1 - x / 0.3 : x > 0.7 ? (x - 0.7) / 0.3 : 0;
      a *= 1 - side;
    } else {
      a = ramp(Math.hypot(c + 0.5 - S / 2, r + 0.5 - S / 2) / (S / 2), 0.35);
    }
    const o = (r * S + c) * 4;
    data[o] = data[o + 1] = data[o + 2] = 255; data[o + 3] = Math.round(a * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
