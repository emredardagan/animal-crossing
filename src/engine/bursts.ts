// toybox.js Bursts: pooled sprite particles using the Kenney particle sprites.
// Two pools (normal / additive) so a sprite never changes blending (no pipeline rebuilds).
import * as THREE from 'three/webgpu';
import type { ParticleTex } from '../game/config';

type Range = number | [number, number];
export interface EmitOptions {
  tex?: ParticleTex; count?: number; color?: number; colors?: number[] | null; speed?: Range; up?: Range;
  life?: Range; size?: Range; gravity?: number; spread?: number; grow?: number; additive?: boolean; drag?: number;
}
interface Live { s: THREE.Sprite; v: THREE.Vector3; life: number; age: number; size: number; gravity: number; grow: number; drag: number; spin: number; pool: THREE.Sprite[] }

const rnd = (a: Range) => Array.isArray(a) ? a[0] + Math.random() * (a[1] - a[0]) : a;

export class Bursts {
  pools: { normal: THREE.Sprite[]; additive: THREE.Sprite[] } = { normal: [], additive: [] };
  live: Live[] = [];
  scale = 1; // quality: Low emits fewer particles

  constructor(public scene: THREE.Scene, public tex: Record<string, THREE.Texture>, max = 240) {
    const make = (additive: boolean) => {
      const m = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false, map: tex.circle_05, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const s = new THREE.Sprite(m); s.visible = false; scene.add(s); return s;
    };
    for (let i = 0; i < max; i++) this.pools.normal.push(make(false));
    for (let i = 0; i < max / 3; i++) this.pools.additive.push(make(true));
  }

  emit(pos: THREE.Vector3, {
    tex = 'circle_05', count = 12, color = 0xffffff, colors = null, speed = [1.5, 3.5], up = 2.5,
    life = [0.4, 0.8], size = [0.25, 0.5], gravity = -6, spread = 1, grow = 1.2, additive = false, drag = 0.9,
  }: EmitOptions = {}) {
    const pool = additive ? this.pools.additive : this.pools.normal;
    const n = count > 1 ? Math.max(1, Math.round(count * this.scale)) : count;
    for (let i = 0; i < n && pool.length; i++) {
      const s = pool.pop()!;
      const m = s.material;
      m.map = this.tex[tex];
      m.color.set(colors ? colors[(Math.random() * colors.length) | 0] : color);
      m.opacity = 1;
      m.rotation = Math.random() * Math.PI * 2;
      s.position.copy(pos);
      const a = Math.random() * Math.PI * 2, sp = rnd(speed);
      const sz = rnd(size);
      s.scale.setScalar(sz);
      s.visible = true;
      this.live.push({
        s, pool, v: new THREE.Vector3(Math.cos(a) * sp * spread, rnd(up), Math.sin(a) * sp * spread),
        life: rnd(life), age: 0, size: sz, gravity, grow, drag, spin: (Math.random() - 0.5) * 4,
      });
    }
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const u = this.live[i], s = u.s;
      u.age += dt;
      const k = u.age / u.life;
      if (k >= 1) { s.visible = false; this.live.splice(i, 1); u.pool.push(s); continue; }
      u.v.y += u.gravity * dt;
      u.v.multiplyScalar(Math.pow(u.drag, dt * 10));
      s.position.addScaledVector(u.v, dt);
      s.material.opacity = 1 - k * k;
      s.material.rotation += u.spin * dt;
      s.scale.setScalar(u.size * (1 + (u.grow - 1) * k));
    }
  }
}
