// Paw Crossing game logic: a one-to-one port of paw-crossing.html onto three/webgpu.
// Numbers (speeds, odds, timings) are unchanged. DOM writes go through ./ui, storage through platform/save.
import * as THREE from 'three/webgpu';
import { AccessibilityInfo } from 'react-native';
import { type Stage, PALETTE, QUALITY, type Quality } from '../engine/stage';
import { preload, loaded, cloneLoaded, loadParticleTextures } from '../engine/assets';
import { Bursts } from '../engine/bursts';
import { Sfx } from '../engine/sfx';
import { damp, rand, pick } from '../engine/math';
import { uTime, makeWaterMaterial, makeBubbleMaterial, glowTexture } from '../engine/materials';
import {
  PETS, STARTERS, RARE, LEGEND, GOLDEN, SAFARI_PACK, LEGEND_PACK, price, CARS, TREES, LOCOS, WAGONS, P, BOATS,
  ZONE_LEN, CITY_CARS, ZONES, NIGHT_SKY, STORM_SKY, zoneOf, phaseOf, ALL_MODELS, MISSIONS, DEATHS, type DeathKind, type Weather,
} from './config';
import { ui, toast, banner, usePops, popFrames, POP_SLOTS, type MissionView } from './ui';
import * as store from '../platform/save';
import { haptics } from '../platform/haptics';
import type { Mission } from '../platform/saveModel';

type Obj = THREE.Object3D;
interface Mover {
  obj: Obj; len: number; kind: string; name?: string; attach?: { obj: Obj; dx: number }[];
  base?: number; top?: number; spin?: Obj; hop?: number; vx?: number; turn?: number; x?: number; sink?: number; down?: boolean; close?: boolean;
}
interface Train { obj: THREE.Group; len: number; dir: number; state: 'wait' | 'run'; timer: number; lamps: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[]; bell: number; x?: number }
interface Row {
  i: number; type: string; group: THREE.Group; blocked: Set<number>; movers: Mover[]; mixers: THREE.AnimationMixer[];
  coin: Obj | null; power: { obj: Obj; model: Obj; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; kind: 'heart' | 'magnet' | 'gem' } | null;
  zone: number; farm?: boolean; dir: number; speed: number; span: number; boss?: boolean; announced?: boolean; lily?: boolean; train?: Train;
}

export interface Entitlements { club: boolean; safari: boolean; legendary: boolean }

const HALF = 4;           // playable columns: -4..4
const WORLD = 13;         // visual half-width
const AHEAD = 26, BEHIND = 9;

export class Game {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  bursts!: Bursts;
  sfx = new Sfx();
  reduced = false;
  ent: Entitlements = { club: false, safari: false, legendary: false };
  quality: Quality;

  // ---------- state ----------
  rows = new Map<number, Row>();
  maxRowBuilt = -1;
  lastType = 'grass'; streak = 0; waterKind = 'logs';
  petIndex: number;
  state: 'loading' | 'title' | 'play' | 'dead' = 'loading';
  score = 0; coins = 0; best = 0;
  camZ = 0; camX = 0; lastForward = 0; speedy = 0;
  magnetT = 0; invuln = 0; lastZone = 0; idleT = 0;
  nightF = 0; rainF = 0; snowF = 0; flash = 0; lightningT = 4; weatherPlan: Weather[] = []; weatherSaid: Weather = 'clear';
  shake = 0; sinking = 0; ambientT = 0; elapsed = 0; paused = false;
  deathKind: DeathKind | null = null; continued = false;
  missions: Mission[] = []; mLevel = 0;
  fitSize = new Map<string, number>();
  world = new THREE.Group();
  pops: { pos: THREE.Vector3; t0: number; slot: number }[] = [];

  // materials & meshes shared by all rows
  mats!: Record<string, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>;
  zoneMats: THREE.MeshStandardMaterial[][] = [];
  nightMats!: Record<'beam' | 'pool' | 'bulb' | 'tail', THREE.MeshBasicMaterial>;
  neonMats!: THREE.MeshBasicMaterial[];
  planeGeo = new THREE.PlaneGeometry(1, 1);
  ringGeo = new THREE.RingGeometry(0.28, 0.42, 32);
  lampGeo = new THREE.SphereGeometry(0.09, 16, 12);
  box = new THREE.BoxGeometry(1, 1, 1);
  padGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.08, 24, 1, false, 0.35, Math.PI * 2 - 0.7);
  padMat = new THREE.MeshStandardMaterial({ color: 0x5fbf5a, roughness: .8 });
  padMatDark = new THREE.MeshStandardMaterial({ color: 0x4fa86a, roughness: .8 });
  waterMat = makeWaterMaterial();
  bubble = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 20), makeBubbleMaterial());
  silhouette = new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 1 });
  gold = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 0.75, roughness: 0.3 });
  shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));

  pl = {
    root: new THREE.Group(), body: null as Obj | null, mixer: null as THREE.AnimationMixer | null, actions: null as Record<string, THREE.AnimationAction> | null,
    x: 0, row: 0, fromX: 0, fromZ: 0, toX: 0, toRow: 0, t: 1, hopDur: 0.14,
    facing: Math.PI, queue: null as [number, number] | null, dead: false, riding: null as Mover | null, squash: 0,
    dur: 0.14, arc: 0.45, shield: false, safe: { x: 0, row: 0 }, lastD: null as [number, number] | null, nudge: 0,
  };

  // weather
  base!: { hemi: number; hemiCol: THREE.Color; sun: number; sunCol: THREE.Color };
  moonHemi = new THREE.Color(0x6f86d8); moonSun = new THREE.Color(0xa8bcff); stormCol = new THREE.Color(STORM_SKY); nightCol = new THREE.Color(NIGHT_SKY); blizzCol = new THREE.Color(0xd2dbe6);
  flashCol = new THREE.Color(0xe8eeff);
  rainCount: number = QUALITY.high.rain;
  rainGeo = new THREE.BufferGeometry();
  rain!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  lantern = new THREE.PointLight(0xffd9a0, 0, 5, 1.4);

  eagle = { obj: null as THREE.Group | null, mixer: null as THREE.AnimationMixer | null, active: false, t: 0, from: new THREE.Vector3(), warned: false };
  eagleShadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));

  skyCol = new THREE.Color();
  tmp = new THREE.Vector3();

  constructor(public stage: Stage, quality: Quality) {
    this.scene = stage.scene; this.camera = stage.camera;
    this.quality = quality;
    this.rainCount = this.rainDraw = QUALITY[quality].rain;
    this.petIndex = store.prefs.get('pet', 0);
    this.sfx.muted = store.prefs.get('muted', false);
    ui.set({ muted: this.sfx.muted });
    AccessibilityInfo.isReduceMotionEnabled().then(r => { this.reduced = r; }).catch(() => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', r => { this.reduced = r; });
    const s = store.getSave();
    this.best = s.best; this.mLevel = s.mlevel; this.missions = s.missions ?? [];
    store.onSaveChanged(sv => {
      // another device synced in: pick up the merged values
      this.best = Math.max(this.best, sv.best); this.mLevel = Math.max(this.mLevel, sv.mlevel);
      if (this.state !== 'play') this.refreshTitle();
      ui.set({ bank: store.coins(), best: this.best });
    });
    this.buildShared();
  }

  // ---------- helpers ----------
  get bank() { return store.coins(); }
  get petList(): string[] { return this.ent.club || this.ent.legendary ? [...PETS, GOLDEN] : PETS; }
  ownedSet(): Set<string> {
    const o = new Set(store.getSave().owned);
    if (this.ent.safari) SAFARI_PACK.forEach(n => o.add(n));
    if (this.ent.legendary) LEGEND_PACK.forEach(n => o.add(n));
    if (this.ent.club || this.ent.legendary) o.add(GOLDEN);
    return o;
  }
  mult() { return this.ent.club ? 2 : 1; }

  fitted(path: string, size: number) {
    const o = cloneLoaded(loaded(path)).object;
    if (!this.fitSize.has(path)) { const v = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); this.fitSize.set(path, Math.max(v.x, v.y, v.z)); }
    o.scale.setScalar(size / this.fitSize.get(path)!);
    return o;
  }
  // lift a model so it rests on y = 0
  ground(o: Obj) { o.updateMatrixWorld(true); o.position.y -= new THREE.Box3().setFromObject(o).min.y; return o; }

  buildShared() {
    const M = (color: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    this.mats = {
      road: M(PALETTE.road, .9), curb: M(0xc9ccd6, .8), line: M(PALETTE.roadLine, .7), bank: M(PALETTE.sand, 1),
      gravel: M(0x9c9183, 1), pole: M(0x3a3d4f, .6), dirt: M(0x7c5a43, 1), rut: M(0x664834, 1), windLane: M(0xcf8c55, 1),
      dust: M(0xc9a77a, 1), ice: M(0x8fd3f2, .08, { metalness: .1 }), iceCrack: M(0xffffff, .3, { transparent: true, opacity: .7 }),
      snowBank: M(0xf4f8fc, .9), window: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    };
    this.zoneMats = ZONES.map(z => z.grass.map(c => M(c, .95)));
    const glowMat = (tex: THREE.Texture, color: number) => new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const beamTex = glowTexture('beam'), dotTex = glowTexture('dot');
    this.nightMats = { beam: glowMat(beamTex, 0xffd98a), pool: glowMat(dotTex, 0xffd98a), bulb: glowMat(dotTex, 0xfff4d0), tail: glowMat(dotTex, 0xff3b3b) };
    this.neonMats = [0xff3df2, 0x3df2ff, 0xffd23d, 0x7cff6b, 0xff6b3d].map(c => { const m = new THREE.MeshBasicMaterial({ color: c }); m.toneMapped = false; return m; });

    this.scene.add(this.world);
    this.scene.add(this.pl.root);
    this.bubble.position.y = 0.42; this.bubble.visible = false; this.pl.root.add(this.bubble);
    this.shadowBlob.rotation.x = -Math.PI / 2; this.shadowBlob.position.y = 0.01; this.scene.add(this.shadowBlob);
    this.lantern.position.y = 1.3; this.pl.root.add(this.lantern);
    this.eagleShadow.rotation.x = -Math.PI / 2; this.eagleShadow.visible = false; this.scene.add(this.eagleShadow);

    // rain: streaks in a box that follows the camera
    const RAIN = this.rainCount;
    const rainPos = new Float32Array(RAIN * 6);
    for (let k = 0; k < RAIN; k++) { const x = rand(-12, 12), y = rand(0, 10), z = rand(-14, 8); rainPos.set([x, y, z, x + 0.08, y + 0.7, z], k * 6); }
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0xf0f6ff, transparent: true, opacity: 0, fog: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.scene.add(this.rain);

    const st = this.stage;
    this.base = { hemi: st.hemi.intensity, hemiCol: st.hemi.color.clone(), sun: st.sun.intensity, sunCol: st.sun.color.clone() };
  }

  async boot(onProgress: (k: number) => void) {
    const tex = await loadParticleTextures();
    this.bursts = new Bursts(this.scene, tex);
    this.bursts.scale = this.quality === 'low' ? 0.6 : 1;
    await preload(ALL_MODELS, onProgress);
    this.buildEagle();
    this.reset();
    this.state = 'title';
    this.setPet(this.petIndex);
    this.play('dance');
    ui.set({ phase: 'title', bank: this.bank, best: this.best });
  }

  setEntitlements(e: Entitlements) {
    const before = this.ent;
    this.ent = e;
    ui.set({ club: e.club });
    if (this.state === 'title' && (before.club !== e.club || before.legendary !== e.legendary || before.safari !== e.safari)) this.setPet(this.petIndex);
  }

  setQuality(q: Quality) {
    this.quality = q;
    if (this.bursts) this.bursts.scale = q === 'low' ? 0.6 : 1;
    this.rainDraw = Math.min(QUALITY[q].rain, this.rainCount);
    this.rainGeo.setDrawRange(0, this.rainDraw * 2);
    this.stage.setQuality(q);
  }
  rainDraw: number = QUALITY.high.rain;

  // ---------- row construction ----------
  pickType(i: number): string {
    const ph = phaseOf(i), zone = ZONES[zoneOf(i)];
    if (i < 4 || ph === 0) { this.lastType = 'grass'; return 'grass'; }
    // the mid-season set piece: a safe row, two (three in the city) wild rows, a safe row
    const bossLen = zone.city ? 3 : 2;
    if (i > 10 && (ph === 21 || ph === 22 + bossLen)) { this.lastType = 'grass'; this.streak = 1; return 'grass'; }
    if (i > 10 && ph >= 22 && ph < 22 + bossLen) { this.lastType = 'road'; return zone.city ? 'rush' : 'herd'; }
    let type: string;
    const lastType = this.lastType;
    if (lastType === 'rail') type = Math.random() < 0.6 ? 'grass' : 'road';
    else {
      const difficulty = Math.min(1, i / 120);
      const r = Math.random();
      if (lastType === 'grass') type = r < 0.55 + difficulty * .1 ? 'road' : 'river';
      else if (this.streak >= (lastType === 'road' ? 2 + Math.round(difficulty * 3) : 1 + Math.round(difficulty * 2))) type = 'grass';
      else type = r < 0.6 ? lastType : 'grass';
      // railways appear once you're warmed up
      if (i > 14 && type === 'road' && lastType !== 'road' && Math.random() < 0.3) type = 'rail';
    }
    if (type === lastType) this.streak++; else this.streak = 1;
    // each stretch of water picks one flavour for the whole stretch
    if (type === 'river' && lastType !== 'river') {
      this.waterKind = zone.water === 'ice' ? (Math.random() < 0.65 ? 'ice' : 'logs') : zone.water;
    }
    this.lastType = type;
    if (type === 'river') return this.waterKind === 'ice' ? 'ice' : this.waterKind === 'weeds' ? 'weeds' : 'river';
    if (type === 'road' && zone.hazard === 'crabs' && Math.random() < 0.45) return 'crabs';
    return type;
  }

  slab(g: THREE.Group, mat: THREE.Material, y = -0.3, h = 0.6, w = WORLD * 2) {
    const m = new THREE.Mesh(this.box, mat); m.scale.set(w, h, 1); m.position.y = y; m.receiveShadow = true; g.add(m); return m;
  }
  // ground tiles for a walkable row: lighter inside the playfield, darker beyond it
  groundRow(g: THREE.Group, zi: number, alt: boolean) {
    const zm = this.zoneMats[zi];
    const top = new THREE.Mesh(this.box, zm[alt ? 0 : 1]);
    top.scale.set(HALF * 2 + 1, 0.6, 1); top.position.y = -0.3; top.receiveShadow = true; g.add(top);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(this.box, zm[alt ? 2 : 3]);
      side.scale.set(WORLD - HALF, 0.6, 1); side.position.set(s * (HALF + 0.5 + (WORLD - HALF) / 2), -0.28, 0); side.receiveShadow = true; g.add(side);
    }
  }
  // night-light helpers: a glow quad that only shows after dark
  glowQuad(g: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, flat = true) {
    const q = new THREE.Mesh(this.planeGeo, mat); q.scale.set(w, h, 1); q.position.set(x, y, z);
    if (flat) q.rotation.x = -Math.PI / 2; else ((g.userData.bb ||= []) as Obj[]).push(q);
    q.renderOrder = 2; g.add(q); return q;
  }
  streetLamp(g: THREE.Group, x: number) {
    const lamp = cloneLoaded(loaded(P.lamp)).object; lamp.scale.setScalar(2.2); lamp.position.set(x, 0, 0.42); lamp.rotation.y = x > 0 ? Math.PI : 0; g.add(lamp);
    lamp.updateMatrixWorld(true);
    const top = new THREE.Box3().setFromObject(lamp).max.y - g.position.y;
    this.glowQuad(g, this.nightMats.bulb, x - Math.sign(x) * 0.35, top - 0.1, 0.42, 0.9, 0.9, false);
    this.glowQuad(g, this.nightMats.pool, x - Math.sign(x) * 0.6, 0.02, 0.3, 2.6, 2.6);
  }
  // cars carry headlight beams and tail lights that follow them
  addCarLights(row: Row, m: Mover, dir: number) {
    const g = row.group, L = m.len;
    m.attach = [];
    const beam = this.glowQuad(g, this.nightMats.beam, 0, 0.03, 0, 0.7, 2.2);
    beam.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    m.attach.push({ obj: beam, dx: dir * (L / 2 + 1.1) });
    const tail = this.glowQuad(g, this.nightMats.tail, 0, 0.35, 0, 0.45, 0.45, false);
    m.attach.push({ obj: tail, dx: -dir * (L / 2) });
  }
  // a cube-pet that runs on its own (stampedes, crabs)
  critter(row: Row, name: string, anim: string, scale = 0.55) {
    const { object, mixer, actions } = cloneLoaded(loaded(P.pet(name)));
    object.scale.setScalar(scale);
    const a = actions[anim] || actions.idle;
    a.play(); a.time = Math.random() * a.getClip().duration; a.timeScale = rand(1, 1.25);
    row.mixers.push(mixer!);
    return object;
  }

  makeRow(i: number): Row {
    const type = this.pickType(i);
    const g = new THREE.Group();
    g.position.z = -i;
    this.world.add(g);
    const row: Row = { i, type, group: g, blocked: new Set(), movers: [], mixers: [], coin: null, power: null, zone: zoneOf(i), dir: 0, speed: 0, span: 0 };
    const alt = i % 2 === 0;
    const zone = ZONES[zoneOf(i)];
    const gate = i > 0 && i % ZONE_LEN === 0;
    const { mats, rows } = this;

    if (type === 'grass') {
      this.groundRow(g, row.zone, alt);
      // a pair of flags marks the start of every new season
      if (gate) for (const s of [-1, 1]) {
        const f = this.ground(this.fitted(P.plat('flag'), 1.7)); f.position.x = s * (HALF + 1); f.rotation.y = s > 0 ? Math.PI : 0; g.add(f);
      }
      if (zone.city) this.cityBlock(g, gate);
      else {
        // outer forest: always trees beyond the playable edge
        for (let x = HALF + 1; x <= WORLD - 1; x++) for (const s of [-1, 1]) {
          if (gate && x === HALF + 1) continue;
          if (Math.random() < 0.55) this.addProp(g, pick(zone.trees), s * x, rand(.9, 1.4));
          else if (Math.random() < 0.3) this.addProp(g, pick(zone.flowers), s * x + rand(-.3, .3), rand(1.4, 2));
        }
      }
      if (i > 2) {
        const n = Math.random() < 0.3 ? 0 : 1 + ((Math.random() * (1 + Math.min(3, i / 25))) | 0);
        for (let k = 0; k < n; k++) {
          const x = Math.round(rand(-HALF, HALF));
          if (row.blocked.has(x)) continue;
          row.blocked.add(x);
          const tree = Math.random() < 0.65;
          const list = zone.city ? zone.rocks : tree ? zone.trees : zone.rocks;
          this.addProp(g, pick(list), x, tree ? rand(1, 1.3) : rand(1.2, 1.6));
        }
      } else if (i === 0) {
        for (const x of [-3, 3]) { row.blocked.add(x); this.addProp(g, pick(TREES.map(P.nat)), x, 1.2); }
      }
      for (let k = 0; k < 3; k++) { const x = rand(-HALF, HALF); if (!row.blocked.has(Math.round(x))) this.addProp(g, pick(zone.flowers), x, rand(1.2, 1.8)); }
      const free = [...Array(HALF * 2 + 1)].map((_, k) => k - HALF).filter(x => !row.blocked.has(x));
      if (i > 4 && Math.random() < 0.22 && free.length) {
        const c = cloneLoaded(loaded(P.coin)).object;
        c.scale.setScalar(1.3); c.position.set(pick(free), 0.35, 0);
        g.add(c); row.coin = c;
      }
      // power-ups: extra life, coin magnet, or a gem worth three coins
      const spots = free.filter(x => x !== row.coin?.position.x);
      if (i > 8 && Math.random() < 0.1 && spots.length) {
        const r = Math.random(), kind = r < 0.45 ? 'heart' : r < 0.85 ? 'magnet' : 'gem';
        const look = ({ heart: ['heart', 0xff5d8a], magnet: ['star', 0x8a5cff], gem: ['jewel', 0x3cd6c8] } as const)[kind];
        const o = new THREE.Group();
        const model = this.fitted(P.plat(look[0]), 0.6); model.position.y = 0.45; o.add(model);
        const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: look[1], transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; o.add(ring);
        o.position.x = pick(spots); g.add(o);
        row.power = { obj: o, model, ring, kind };
      }
    }

    if (type === 'road' || type === 'rush') {
      // dirt tracks in the canyon and on autumn farms, with tractors instead of city cars
      const farm = !!(zone.dirt || (zone.farm && Math.random() < 0.4));
      row.farm = farm;
      this.slab(g, farm ? mats.dirt : mats.road, -0.32);
      if (farm) for (const z of [-0.22, 0.22]) { const r = new THREE.Mesh(this.box, mats.rut); r.scale.set(WORLD * 2, 0.02, 0.12); r.position.set(0, -0.015, z); r.receiveShadow = true; g.add(r); }
      const prev = rows.get(i - 1);
      if (!farm && (prev?.type === 'road' || prev?.type === 'rush') && !prev.farm) {
        for (let x = -WORLD; x < WORLD; x += 1.2) {
          const d = new THREE.Mesh(this.box, mats.line); d.scale.set(0.55, 0.02, 0.06); d.position.set(x, -0.01, 0.5); d.receiveShadow = true; g.add(d);
        }
      } else if (!farm) {
        const curb = new THREE.Mesh(this.box, mats.curb); curb.scale.set(WORLD * 2, 0.08, 0.1); curb.position.set(0, -0.02, 0.47); g.add(curb);
      }
      if (!farm && (Math.random() < 0.5 || zone.city)) this.streetLamp(g, (Math.random() < 0.5 ? -1 : 1) * (HALF + 1.6));
      const dir = Math.random() < 0.5 ? -1 : 1;
      const difficulty = Math.min(1, i / 150);
      const rush = type === 'rush';
      let speed = rand(1.6, 2.8) + difficulty * 3;
      let count = 1 + ((Math.random() * (2 + difficulty * 2)) | 0);
      if (farm) { speed = rand(1.1, 2) + difficulty * 1.5; count = 1 + ((Math.random() * 2) | 0); }
      if (zone.city) count++;
      if (rush) { speed = rand(3.6, 4.6) + difficulty * 2; count = 4 + ((Math.random() * 2) | 0); row.boss = true; }
      const gap = (WORLD * 2 + 6) / count;
      const offset = rand(0, gap);
      for (let k = 0; k < count; k++) {
        const name = farm ? pick(zone.dirt ? ['tractor', 'truck-flat', 'delivery-flat', 'suv'] : ['tractor', 'tractor', 'tractor-shovel'])
          : zone.city ? pick(CITY_CARS)
          : Math.random() < 0.15 ? pick(['truck', 'delivery', 'garbage-truck', 'firetruck']) : pick(CARS.slice(0, 9));
        const car = cloneLoaded(loaded(P.car(name))).object;
        car.scale.setScalar(0.62);
        car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const len = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3()).x;
        car.position.set(-WORLD - 3 + offset + k * gap, 0, 0);
        g.add(car);
        const m: Mover = { obj: car, len, kind: 'car', name };
        this.addCarLights(row, m, dir);
        row.movers.push(m);
      }
      row.dir = dir; row.speed = speed; row.span = WORLD * 2 + 6;
      row.type = 'road';
    }

    if (type === 'herd') {
      // a dusty corral lane with a whole herd charging through
      this.slab(g, mats.dust, -0.32);
      for (const s of [-1, 1]) for (let x = HALF + 1; x <= HALF + 4; x += 1) { const f = this.addProp(g, P.nat('fence_simple'), s * x, 1.1); if (f) f.rotation.y = 0; }
      const prev = rows.get(i - 1);
      const dir = prev?.type === 'herd' ? -prev.dir : (Math.random() < 0.5 ? -1 : 1);
      const speed = rand(4.2, 5.4) + Math.min(1.5, i / 150);
      const span = WORLD * 2 + 6;
      let x = -span / 2;
      while (x < span / 2 - 1) {
        const pack = 2 + ((Math.random() * 3) | 0);
        for (let k = 0; k < pack && x < span / 2 - 1; k++) {
          const o = this.critter(row, pick(zone.herd!), 'run', 0.55);
          o.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          o.position.set(x, 0, rand(-0.08, 0.08)); g.add(o);
          row.movers.push({ obj: o, len: 0.95, kind: 'herd' });
          x += rand(1.05, 1.3);
        }
        x += rand(2.6, 3.6); // a gap you can slip through
      }
      row.dir = dir; row.speed = speed; row.span = span; row.boss = true;
    }

    if (type === 'weeds') {
      // canyon sand with tumbleweeds bouncing across at speed: a windswept lane
      this.slab(g, mats.windLane, -0.31);
      for (let x = HALF + 1; x <= WORLD - 1; x++) for (const s of [-1, 1]) if (Math.random() < 0.35) this.addProp(g, pick(zone.flowers), s * x + rand(-.3, .3), rand(1.2, 1.8));
      const dir = Math.random() < 0.5 ? -1 : 1;
      const count = 2 + ((Math.random() * (2 + Math.min(1.5, i / 100))) | 0);
      const span = WORLD * 2 + 6, gap = span / count, offset = rand(0, gap);
      for (let k = 0; k < count; k++) {
        const o = new THREE.Group();
        const bush = this.fitted(P.nat(pick(['plant_bush', 'plant_bushDetailed'])), 0.75);
        bush.traverse(c => {
          const mesh = c as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
          if (mesh.isMesh) { mesh.material = mesh.material.clone(); mesh.material.color.multiplyScalar(0.75).lerp(new THREE.Color(0xc9a15a), 0.55); }
        });
        this.ground(bush); bush.position.y -= 0.35; const spin = new THREE.Group(); spin.position.y = 0.38; spin.add(bush); o.add(spin);
        o.position.set(-WORLD - 3 + offset + k * gap, 0, 0); g.add(o);
        row.movers.push({ obj: o, len: 0.7, kind: 'weed', spin, hop: rand(0, 6) });
      }
      row.dir = dir; row.speed = rand(3.4, 4.6) + Math.min(2, i / 80); row.span = span;
    }

    if (type === 'crabs') {
      // beach sand where crabs scuttle sideways and change their minds
      this.groundRow(g, row.zone, alt);
      for (let x = HALF + 1; x <= WORLD - 1; x++) for (const s of [-1, 1]) if (Math.random() < 0.4) this.addProp(g, pick(zone.trees.concat(zone.rocks)), s * x, rand(.9, 1.3));
      const n = 2 + ((Math.random() * (1 + Math.min(2, i / 120))) | 0);
      for (let k = 0; k < n; k++) {
        const o = this.critter(row, 'crab', 'walk', 0.42);
        o.position.set(rand(-HALF - 2, HALF + 2), 0, 0); g.add(o);
        row.movers.push({ obj: o, len: 0.8, kind: 'crab', vx: (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 2.4), turn: rand(1, 3) });
      }
    }

    if (type === 'ice') {
      // a frozen lake: safe to stand on, but you slide until something stops you
      this.slab(g, mats.bank, -0.5, 0.4);
      this.slab(g, mats.ice, -0.17, 0.3);
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(this.box, mats.iceCrack); c.scale.set(rand(0.6, 1.6), 0.01, 0.03); c.position.set(rand(-WORLD, WORLD), -0.015, rand(-0.35, 0.35)); c.rotation.y = rand(-0.6, 0.6); g.add(c);
      }
      for (const s of [-1, 1]) { const b = new THREE.Mesh(this.box, mats.snowBank); b.scale.set(WORLD - HALF - 0.5, 0.25, 0.9); b.position.set(s * (HALF + 0.75 + (WORLD - HALF - 0.5) / 2), -0.06, 0); b.receiveShadow = b.castShadow = true; g.add(b); }
      if (Math.random() < 0.6) {
        const x = Math.round(rand(-HALF + 1, HALF - 1));
        row.blocked.add(x);
        this.addProp(g, pick(['rock-a', 'rock-b'].map(P.surv)), x, rand(0.8, 1));
      }
    }

    if (type === 'rail') {
      const bed = new THREE.Mesh(this.box, mats.gravel);
      bed.scale.set(WORLD * 2, 0.6, 1); bed.position.y = -0.36; bed.receiveShadow = true; g.add(bed);
      for (let x = -WORLD; x <= WORLD; x++) {
        const t = cloneLoaded(loaded(P.track)).object; t.rotation.y = Math.PI / 2; t.position.set(x, -0.06, 0); g.add(t);
      }
      // crossing signal with two blinking lamps
      const sx = (Math.random() < 0.5 ? -1 : 1) * (HALF + 1.2);
      const pole = new THREE.Mesh(this.box, mats.pole); pole.scale.set(0.1, 1.5, 0.1); pole.position.set(sx, 0.75, 0.4); pole.castShadow = true; g.add(pole);
      const bar = new THREE.Mesh(this.box, mats.pole); bar.scale.set(0.6, 0.12, 0.08); bar.position.set(sx, 1.35, 0.42); g.add(bar);
      const lamps = [-1, 1].map(s => {
        const l = new THREE.Mesh(this.lampGeo, new THREE.MeshStandardMaterial({ color: 0x5a1d24, emissive: 0xff3b3b, emissiveIntensity: 0 }));
        l.position.set(sx + s * 0.22, 1.35, 0.5); g.add(l); return l;
      });
      // the train: a locomotive and a few wagons (a metro in the city), lined up behind it
      const dir = Math.random() < 0.5 ? -1 : 1;
      const train = new THREE.Group();
      let cursor = 0;
      const metro = zone.city && pick(['city', 'subway']);
      const parts = metro
        ? [`train-electric-${metro}-a`, ...Array(2 + ((Math.random() * 2) | 0)).fill(`train-electric-${metro}-b`), `train-electric-${metro}-c`]
        : [pick(LOCOS), ...Array.from({ length: 3 + ((Math.random() * 3) | 0) }, () => pick(WAGONS))];
      for (const name of parts) {
        const c = this.fitted(P.train(name), 1.8);
        c.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.ground(c);
        const len = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3()).x;
        c.position.x = -dir * (cursor + len / 2);
        cursor += len + 0.06;
        train.add(c);
      }
      // centre the group on its own length
      for (const c of train.children) c.position.x += dir * cursor / 2;
      train.visible = false; g.add(train);
      row.train = { obj: train, len: cursor, dir, state: 'wait', timer: rand(1, 4), lamps, bell: 0 };
    }

    if (type === 'river') {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2, 1), this.waterMat);
      water.rotation.x = -Math.PI / 2; water.position.y = -0.18; g.add(water);
      const bed = new THREE.Mesh(this.box, mats.bank); bed.scale.set(WORLD * 2, 0.4, 1); bed.position.y = -0.55; g.add(bed);
      const boats = this.waterKind === 'boats';
      const lilyRow = !boats && Math.random() < 0.3 && rows.get(i - 1)?.type !== 'river';
      if (lilyRow) {
        row.lily = true;
        const xs = new Set<number>();
        const n = 3 + ((Math.random() * 3) | 0);
        while (xs.size < n) xs.add(Math.round(rand(-HALF, HALF)));
        let sinkers = i > 20 ? 1 + ((Math.random() * 2) | 0) : 0;
        for (const x of xs) {
          const p = new THREE.Group();
          const pad = new THREE.Mesh(this.padGeo, this.padMat); pad.castShadow = pad.receiveShadow = true; p.add(pad);
          const flower = cloneLoaded(loaded(P.lily)).object; flower.scale.setScalar(1.6); flower.position.set(0.14, 0.02, -0.1); p.add(flower);
          p.position.set(x, -0.12, 0); p.rotation.y = rand(0, 6); g.add(p);
          const m: Mover = { obj: p, len: 0.9, kind: 'lily', x };
          // some pads dive under for a moment: watch for the bubbles
          if (sinkers > 0 && Math.random() < 0.6) { sinkers--; m.sink = rand(0, 4.5); pad.material = this.padMatDark; }
          row.movers.push(m);
        }
        row.dir = 0; row.speed = 0;
      } else {
        const prev = rows.get(i - 1);
        const dir = prev?.type === 'river' && prev.dir ? -prev.dir : (Math.random() < 0.5 ? -1 : 1);
        const speed = rand(1.1, 2.0) + Math.min(1.2, i / 120);
        const count = 3 + ((Math.random() * 2) | 0);
        const span = WORLD * 2 + 6, gap = span / count, offset = rand(0, gap);
        for (let k = 0; k < count; k++) {
          if (boats) {
            const b = this.fitted(P.boat(pick(BOATS)), pick([2.2, 2.6, 3]));
            b.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            // keep the boat inside its own lane
            let size = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
            if (size.z > 0.9) { b.scale.multiplyScalar(0.9 / size.z); size = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()); }
            b.position.y = 0; this.ground(b);
            b.position.set(-WORLD - 3 + offset + k * gap, -0.3, 0);
            g.add(b);
            row.movers.push({ obj: b, len: size.x, kind: 'boat', base: -0.3, top: Math.min(0.62, size.y * 0.42) });
          } else {
            const len = pick([2, 3, 3, 4]);
            const log = cloneLoaded(loaded(P.log)).object;
            log.scale.set(len, 1.5, 1.5);
            log.position.set(-WORLD - 3 + offset + k * gap, -0.25, 0);
            g.add(log);
            row.movers.push({ obj: log, len, kind: 'log', base: -0.25, top: 0.3 });
          }
        }
        row.dir = dir; row.speed = speed; row.span = span;
      }
    }

    rows.set(i, row);
    this.maxRowBuilt = Math.max(this.maxRowBuilt, i);
    return row;
  }

  // Neon City sidewalks: shopfronts with glowing signs and lit windows beyond the playfield
  cityBlock(g: THREE.Group, gate: boolean) {
    for (const s of [-1, 1]) {
      if (!gate && Math.random() < 0.3) this.streetLamp(g, s * (HALF + 1.2));
      let x = HALF + 2.2;
      while (x < WORLD) {
        const path = pick(ZONES[5].trees);
        const b = this.fitted(path, rand(2.2, 3.4));
        b.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        let w = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
        if (w.z > 0.98) { b.scale.multiplyScalar(0.98 / w.z); w = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()); }
        this.ground(b);
        b.position.set(s * (x + w.x / 2), b.position.y, 0);
        g.add(b);
        if (x < HALF + 3) {
          // a neon sign on the side facing the street
          const sign = new THREE.Mesh(this.box, pick(this.neonMats));
          sign.scale.set(0.06, 0.16, w.z * 0.7); sign.position.set(s * (x - 0.04), rand(0.9, Math.max(1, w.y - 0.4)), 0);
          g.add(sign);
        }
        for (let k = 0; k < 2; k++) this.glowQuad(g, this.nightMats.pool, s * (x - 0.05), rand(0.5, w.y - 0.2), rand(-0.3, 0.3), 0.6, 0.6, false);
        x += w.x + rand(0.05, 0.3);
      }
    }
  }

  addProp(g: THREE.Group, path: string, x: number, scale: number) {
    const gl = loaded(path);
    if (!gl) return null;
    const nature = path.startsWith('nature-kit');
    const small = path.startsWith('city-kit') || path.startsWith('survival-kit');
    const o = nature ? cloneLoaded(gl).object : this.fitted(path, small ? scale * 0.62 : scale);
    if (nature) o.scale.setScalar(scale);
    o.position.set(x, 0, rand(-0.12, 0.12));
    o.rotation.y = rand(0, Math.PI * 2);
    if (!nature) this.ground(o);
    g.add(o);
    return o;
  }

  ensureRows(front: number) {
    while (this.maxRowBuilt < front + AHEAD) this.makeRow(this.maxRowBuilt + 1);
    for (const [i, row] of this.rows) if (i < front - BEHIND) { this.disposeRow(row); this.rows.delete(i); }
  }
  disposeRow(row: Row) {
    this.world.remove(row.group);
    for (const mx of row.mixers) mx.stopAllAction();
  }

  // ---------- player ----------
  setPet(idx: number) {
    const list = this.petList;
    this.petIndex = (idx + list.length) % list.length;
    store.prefs.set('pet', this.petIndex);
    const name = list[this.petIndex];
    const pl = this.pl;
    if (pl.body) pl.root.remove(pl.body);
    const { object, mixer, actions } = cloneLoaded(loaded(P.pet(name === GOLDEN ? 'dog' : name)));
    object.scale.setScalar(0.5);
    pl.body = object; pl.mixer = mixer; pl.actions = actions;
    // pets you don't own yet show as a mystery silhouette
    const owned = this.ownedSet().has(name);
    if (!owned) object.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.silhouette; });
    else if (name === GOLDEN) object.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.gold; });
    pl.root.add(object);
    this.play(this.state === 'title' ? 'dance' : 'idle');
    this.refreshTitle();
  }
  petName(name: string) { return name === GOLDEN ? 'Golden Dog' : name[0].toUpperCase() + name.slice(1); }

  // ---------- collection ----------
  refreshTitle() {
    const name = this.petList[this.petIndex] ?? PETS[0];
    const owned = this.ownedSet(), have = owned.has(name), cost = price(name);
    ui.set({
      bank: this.bank,
      petName: have ? this.petName(name) : '???',
      petOwned: have, petPrice: cost,
      petTier: name === GOLDEN ? 'Paw Club' : LEGEND.includes(name) ? 'Legendary' : RARE.includes(name) ? 'Rare' : 'Common',
      petLocked: have ? null : name === GOLDEN ? 'iap' : 'coins',
      ownedCount: PETS.filter(n => owned.has(n)).length + (owned.has(GOLDEN) ? 1 : 0),
      totalPets: this.petList.length,
      missions: this.missionView(),
      best: this.best,
    });
  }
  unlockPet() {
    const name = this.petList[this.petIndex];
    if (name === GOLDEN) return;
    const cost = price(name);
    if (!store.spend(cost)) {
      ui.set({ nope: ui.get().nope + 1 });
      this.sfx.tone(160, 0.15, { type: 'square', vol: 0.08 });
      haptics.nope();
      toast('lock', `${cost - this.bank} more coins to go`);
      return;
    }
    store.save(s => ({ owned: [...new Set([...s.owned, name])] }), { syncNow: true });
    ui.set({ bank: this.bank });
    this.setPet(this.petIndex);
    this.pl.squash = 1;
    const p = new THREE.Vector3(0, 0.8, 0);
    this.bursts.emit(p, { tex: 'star_06', count: 26, colors: [0xffd23d, 0xff8a3d, 0x7cf0a8, 0xffffff, 0x8a5cff], speed: [2, 4.5], up: [3, 6], size: [0.25, 0.5], life: [0.7, 1.1] });
    this.bursts.emit(p, { tex: 'light_01', count: 1, color: 0xfff2b0, speed: 0, up: 0, size: 2.5, life: 0.6, gravity: 0, grow: 1.6, additive: true });
    this.popText(new THREE.Vector3(0, 1.8, 0), 'New pet!', 'gold big');
    haptics.success();
    [523, 659, 784, 1046].forEach((f, k) => this.sfx.tone(f, 0.16, { type: 'triangle', vol: 0.14, delay: k * 0.08 }));
  }
  /** Called after a pack purchase so the new pets celebrate. */
  celebrate() {
    this.setPet(this.petIndex);
    this.bursts?.emit(new THREE.Vector3(0, 0.8, 0), { tex: 'star_06', count: 26, colors: [0xffd23d, 0xff8a3d, 0x7cf0a8, 0xffffff, 0x8a5cff], speed: [2, 4.5], up: [3, 6], size: [0.25, 0.5], life: [0.7, 1.1] });
    [523, 659, 784, 1046].forEach((f, k) => this.sfx.tone(f, 0.16, { type: 'triangle', vol: 0.14, delay: k * 0.08 }));
  }

  // ---------- missions ----------
  newMission(taken: string[]): Mission {
    // only offer goals the player has seen: ice needs Snowy Pass, the dark and stampedes need a few rows
    const seen: Record<string, boolean> = { slides: this.best >= ZONE_LEN * 2, night: this.best >= 30, boss: this.best >= 15 };
    const types = Object.keys(MISSIONS).filter(t => !taken.includes(t) && seen[t] !== false);
    const type = pick(types), m = MISSIONS[type];
    const tier = Math.min(m.steps.length - 1, Math.floor(this.mLevel / 3) + ((Math.random() * 2) | 0));
    return { type, n: m.steps[tier], p: 0, reward: 10 + tier * 6, done: false };
  }
  refreshMissions() {
    let missions = this.missions;
    if (!Array.isArray(missions) || missions.length !== 3 || missions.some(m => !MISSIONS[m?.type])) missions = [];
    missions = missions.filter(m => !m.done);
    for (const m of missions) if (MISSIONS[m.type].run) m.p = 0;
    while (missions.length < 3) missions.push(this.newMission(missions.map(m => m.type)));
    this.missions = missions;
    store.save({ missions });
  }
  // count progress; run missions take the best value this run, the rest add up across runs
  track(type: string, value = 1) {
    let changed = false;
    for (const m of this.missions) {
      if (m.type !== type || m.done) continue;
      changed = true;
      m.p = MISSIONS[type].run ? Math.max(m.p, value) : m.p + value;
      if (m.p >= m.n) {
        m.p = m.n; m.done = true; this.mLevel++;
        const reward = m.reward * this.mult();
        store.earn(reward); store.save({ mlevel: this.mLevel });
        ui.set({ bank: this.bank });
        toast('check', MISSIONS[type].text(m.n), `+${reward}`);
        haptics.success();
        [784, 988, 1318].forEach((f, k) => this.sfx.tone(f, 0.14, { type: 'square', vol: 0.08, delay: k * 0.09 }));
      }
    }
    if (changed) store.save({ missions: this.missions });
  }
  missionView(): MissionView[] { return this.missions.map(m => ({ ...m, text: MISSIONS[m.type]?.text(m.n) ?? '' })); }
  play(name: string, once = false) {
    const pl = this.pl;
    if (!pl.actions) return;
    const a = pl.actions[name] || pl.actions.idle;
    for (const k in pl.actions) if (pl.actions[k] !== a) pl.actions[k].fadeOut(0.12);
    a.reset().fadeIn(0.12).setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity).play();
    a.clampWhenFinished = once;
  }

  hop(dx: number, dz: number) {
    const pl = this.pl;
    if (this.state !== 'play' || pl.dead || this.paused) return;
    if (pl.t < 1) { pl.queue = [dx, dz]; return; }
    const baseX = Math.round(pl.x);
    const tx = baseX + dx, tr = pl.row + dz;
    pl.facing = dz > 0 ? Math.PI : dz < 0 ? 0 : dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    const target = this.rows.get(tr);
    if (Math.abs(tx) > HALF || tr < Math.max(0, this.score - 12) || !target || target.blocked.has(tx)) {
      // bump: a little wobble, no move
      pl.squash = 0.6; this.sfx.tone(180, 0.08, { type: 'square', vol: 0.08 });
      return;
    }
    pl.fromX = pl.x; pl.fromZ = pl.row; pl.toX = tx; pl.toRow = tr; pl.t = 0;
    pl.dur = pl.hopDur; pl.arc = 0.45; pl.lastD = [dx, dz];
    pl.riding = null; pl.nudge = 0;
    this.sfx.tone(520 + Math.random() * 60, 0.09, { type: 'triangle', vol: 0.18, slide: 380 });
    haptics.hop();
    this.bursts.emit(new THREE.Vector3(pl.x, 0.05, -pl.row), { tex: 'smoke_04', count: 4, color: 0xffffff, speed: [0.3, 0.8], up: [0.3, 0.8], life: [0.3, 0.5], size: [0.25, 0.4], gravity: -1, grow: 1.8 });
    if (dz > 0) {
      const now = performance.now();
      this.speedy = now - this.lastForward < 360 ? this.speedy + 1 : 0;
      this.lastForward = now;
      if (this.speedy === 4 || this.speedy === 8 || this.speedy === 12) { this.popText(new THREE.Vector3(tx, 1.4, -tr), `Speedy ×${this.speedy}`, 'good'); this.track('speedy', this.speedy); }
    }
  }

  landed() {
    const pl = this.pl, rows = this.rows;
    pl.x = pl.toX; pl.row = pl.toRow; pl.squash = 1;
    const row = rows.get(pl.row);
    if (pl.row > this.score) {
      const score = this.score = pl.row; ui.set({ score });
      this.ensureRows(score);
      this.idleT = 0; this.eagle.warned = false; this.eagleShadow.visible = false;
      this.track('score', score);
      if (row?.type === 'road') this.track('roads');
      if (row?.type === 'rail') this.track('rails');
      if (rows.get(score - 1)?.boss && !row?.boss) this.track('boss');
      if (this.nightF > 0.6) this.track('night');
      // warn about a set piece a few rows before it
      for (let k = 1; k <= 3; k++) {
        const ahead = rows.get(score + k);
        if (ahead?.boss && !ahead.announced) {
          for (let j = score + k; rows.get(j)?.boss; j++) rows.get(j)!.announced = true;
          const z = ZONES[ahead.zone];
          banner(z.herdName, z.herdSub);
          this.sfx.noise(1.2, { vol: 0.3, freq: 140, type: 'lowpass' }); this.sfx.tone(110, 0.5, { type: 'sawtooth', vol: 0.06, slide: -40 });
          if (!this.reduced) this.shake = 0.25;
          break;
        }
      }
      // new season: banner, bonus coins
      const z = Math.floor(score / ZONE_LEN);
      if (z > this.lastZone) {
        this.lastZone = z;
        const zone = ZONES[z % ZONES.length];
        const bonus = 5 * this.mult();
        banner(zone.name, `Season bonus +${bonus}`);
        this.addCoins(bonus, new THREE.Vector3(pl.x, 1, -pl.row));
        this.track('zone', z);
        [523, 659, 784, 1046, 1318].forEach((f, k) => this.sfx.tone(f, 0.2, { type: 'triangle', vol: 0.12, delay: k * 0.07 }));
      }
    }
    if (row?.type !== 'river') pl.safe = { x: pl.x, row: pl.row };
    // frozen lake: keep sliding the way you hopped until a rock, the edge or solid ground stops you
    if (row?.type === 'ice' && pl.lastD) {
      const [dx, dz] = pl.lastD, tx = Math.round(pl.x) + dx, tr = pl.row + dz, next = rows.get(tr);
      pl.queue = null;
      if (Math.abs(tx) <= HALF && next && !next.blocked.has(tx) && tr >= Math.max(0, this.score - 12)) {
        pl.fromX = pl.x; pl.fromZ = pl.row; pl.toX = tx; pl.toRow = tr; pl.t = 0; pl.dur = 0.13; pl.arc = 0.02;
        if (Math.random() < 0.5) this.sfx.noise(0.14, { vol: 0.08, freq: 5000, q: 0.4 });
        this.bursts.emit(new THREE.Vector3(pl.x, 0.05, -pl.row), { tex: 'circle_05', count: 2, color: 0xffffff, speed: [0.2, 0.5], up: [0.2, 0.6], size: [0.08, 0.14], life: [0.3, 0.5] });
        this.track('slides');
        return;
      }
      pl.squash = 0.5; this.sfx.tone(240, 0.06, { type: 'triangle', vol: 0.06 });
    }
    if (row?.coin && Math.round(pl.x) === Math.round(row.coin.position.x)) this.collectCoin(row);
    if (row?.power && Math.round(pl.x) === row.power.obj.position.x) this.collectPower(row);
    if (row?.type === 'river') {
      const m = this.supportAt(row, pl.x);
      if (!m) return this.die('water');
      pl.riding = m;
      // a paw on the very tip still counts: pull the pet back onto the log
      if (m.kind !== 'lily') {
        const mx = m.obj.position.x, inner = Math.max(0, m.len / 2 - 0.35);
        pl.nudge = Math.min(mx + inner, Math.max(mx - inner, pl.x)) - pl.x;
      }
      m.obj.userData.bob = 1;
      if (m.kind !== 'lily') this.track('logs');
      this.bursts.emit(new THREE.Vector3(pl.x, 0, -pl.row), { tex: 'circle_05', count: 6, color: 0xe8fbff, speed: [0.5, 1.2], up: [0.8, 1.5], size: [0.12, 0.22], life: [0.3, 0.5] });
    }
    if (pl.queue) { const q = pl.queue; pl.queue = null; this.hop(q[0], q[1]); }
  }

  addCoins(n: number, p: THREE.Vector3) {
    this.coins += n; store.earn(n); ui.set({ bank: this.bank });
    this.popText(p, `+${n}`, 'gold');
    this.track('coins', this.coins);
  }
  collectCoin(row: Row) {
    const c = row.coin!, p = new THREE.Vector3(c.position.x, 0.6, -row.i + c.position.z);
    row.group.remove(c); row.coin = null;
    this.bursts.emit(p, { tex: 'star_06', count: 10, colors: [0xffd23d, 0xffffff, 0xffa53d], speed: [1.5, 3], up: [2, 4], size: [0.25, 0.45], life: [0.5, 0.8], additive: false });
    this.addCoins(1 * this.mult(), p);
    haptics.coin();
    this.sfx.tone(988, 0.08, { type: 'square', vol: 0.1 }); this.sfx.tone(1318, 0.18, { type: 'square', vol: 0.1, delay: 0.07 });
  }
  collectPower(row: Row) {
    const { obj, kind } = row.power!, p = new THREE.Vector3(obj.position.x, 0.7, -row.i);
    row.group.remove(obj); row.power = null;
    const col = ({ heart: [0xff5d8a, 0xffc2d6], magnet: [0x8a5cff, 0xd6c2ff], gem: [0x3cd6c8, 0xc2fff6] })[kind];
    this.bursts.emit(p, { tex: 'magic_03', count: 14, colors: [...col, 0xffffff], speed: [1.5, 3.5], up: [2, 4], size: [0.3, 0.55], life: [0.5, 0.9], additive: true });
    if (kind === 'heart') { this.pl.shield = true; this.bubble.visible = true; this.bubble.scale.setScalar(0.01); this.popText(p, 'Extra life!', 'good'); }
    if (kind === 'magnet') { this.magnetT = 7; this.popText(p, 'Coin magnet!', 'good'); }
    if (kind === 'gem') { this.addCoins(3 * this.mult(), p); }
    this.track('powers');
    haptics.success();
    [660, 880, 1320].forEach((f, k) => this.sfx.tone(f, 0.12, { type: 'sine', vol: 0.16, delay: k * 0.06 }));
  }
  // the extra life pops instead of you
  rescue(kind: DeathKind) {
    const pl = this.pl;
    pl.shield = false; this.invuln = 1.6;
    const p = pl.root.position.clone().setY(0.6);
    this.bursts.emit(p, { tex: 'circle_05', count: 18, colors: [0xbdf2ff, 0xffd6ec, 0xffffff], speed: [2, 4], up: [1, 3], size: [0.12, 0.3], life: [0.4, 0.7] });
    this.popText(p.clone().setY(1.5), 'Saved!', 'good big');
    this.sfx.tone(880, 0.08, { type: 'sine', vol: 0.2 }); this.sfx.noise(0.12, { vol: 0.25, freq: 3000 });
    if (kind === 'water' || kind === 'drift') {
      // float back to the last dry tile
      pl.riding = null; pl.nudge = 0; pl.queue = null;
      pl.fromX = pl.x; pl.fromZ = pl.row; pl.toX = pl.safe.x; pl.toRow = pl.safe.row; pl.t = 0;
      pl.dur = 0.5; pl.arc = 1.6; pl.lastD = null;
      pl.facing = pl.safe.row < pl.row ? 0 : Math.PI;
    } else if (!this.reduced) this.shake = 0.15;
  }

  supportAt(row: Row, x: number) {
    for (const m of row.movers) {
      if (m.down) continue; // a pad that's under water holds nobody
      const mx = m.obj.position.x;
      if (Math.abs(x - mx) <= m.len / 2 + (m.kind === 'lily' ? 0.05 : 0.35)) return m;
    }
    return null;
  }

  die(kind: DeathKind) {
    const pl = this.pl;
    if (pl.dead) return;
    if (pl.shield && kind !== 'slow' && kind !== 'eagle') return this.rescue(kind);
    pl.dead = true; this.state = 'dead'; this.deathKind = kind;
    const pos = pl.root.position.clone();
    this.bubble.visible = false; this.magnetT = 0; ui.set({ banner: null });
    haptics.hit();
    if (kind === 'eagle') {
      this.sfx.tone(1400, 0.4, { type: 'sawtooth', vol: 0.08, slide: -600 });
    } else if (kind !== 'water' && kind !== 'drift' && kind !== 'slow') {
      pl.body!.scale.set(0.62, 0.12, 0.62);
      this.bursts.emit(pos.clone().setY(0.6), { tex: 'star_06', count: 14, colors: [0xffffff, 0xffe066], speed: [2, 4], up: [2, 4], size: [0.2, 0.4], life: [0.5, 0.9] });
      this.bursts.emit(pos.clone().setY(0.2), { tex: 'smoke_04', count: 8, color: 0xffffff, speed: [1, 2], up: [0.5, 1.5], size: [0.4, 0.7], life: [0.5, 0.8], gravity: 0, grow: 2 });
      this.sfx.noise(0.25, { vol: 0.4, freq: 400, type: 'lowpass' }); this.sfx.tone(220, 0.35, { type: 'sawtooth', vol: 0.12, slide: -150 });
      if (!this.reduced) this.shake = 0.35;
    } else {
      this.bursts.emit(pos.clone().setY(0), { tex: 'circle_05', count: 22, colors: [0xffffff, 0xbdf2ff], speed: [1, 3], up: [2.5, 4.5], size: [0.15, 0.35], life: [0.6, 1] });
      this.sfx.noise(0.5, { vol: 0.35, freq: 900, q: 0.5 });
      this.sinking = 1;
    }
    const [title, lines] = DEATHS[kind];
    const isBest = this.score > this.best;
    if (isBest) { this.best = this.score; store.save({ best: this.best }, { syncNow: true }); }
    store.save(s => ({ stats: { ...s.stats, runs: (s.stats.runs ?? 0) + 1 } }), { syncNow: true });
    const owned = this.ownedSet();
    const canBuy = PETS.some(n => !owned.has(n) && price(n) <= this.bank);
    const over = {
      title, why: pick(lines), score: this.score, coins: this.coins, isBest: isBest && this.score > 0, canBuy,
      // Continue: once per run, a real run, not for falling behind or the eagle (the pet is gone)
      canContinue: !this.continued && this.score >= 10 && kind !== 'slow' && kind !== 'eagle',
      canDouble: this.coins > 0, doubled: false,
    };
    ui.set({ best: this.best, missions: this.missionView() });
    setTimeout(() => { if (this.state === 'dead') ui.set({ phase: 'dead', over }); }, 900);
  }

  /** Rewarded ad: revive at the last safe tile inside a 2 s shield. */
  revive() {
    if (this.state !== 'dead' || this.continued) return;
    const pl = this.pl;
    this.continued = true;
    let { x, row } = pl.safe;
    if (!this.rows.get(row)) { x = 0; row = pl.row; }
    Object.assign(pl, { x, row, toX: x, toRow: row, fromX: x, fromZ: row, t: 1, dead: false, riding: null, queue: null, nudge: 0, lastD: null, squash: 1 });
    pl.root.position.set(x, 0, -row);
    pl.body!.scale.setScalar(0.5); pl.body!.visible = true;
    this.sinking = 0; this.invuln = 2;
    this.bubble.visible = true; this.bubble.scale.setScalar(0.01);
    this.eagle.active = false; this.eagle.warned = false; this.eagle.obj!.visible = false; this.eagleShadow.visible = false; this.idleT = 0;
    this.camZ = Math.min(this.camZ, row - 1);
    this.state = 'play';
    this.play('idle');
    ui.set({ phase: 'play', over: null });
    this.popText(new THREE.Vector3(x, 1.5, -row), 'Back in!', 'good big');
    [660, 880, 1320].forEach((f, k) => this.sfx.tone(f, 0.12, { type: 'sine', vol: 0.16, delay: k * 0.06 }));
  }

  /** Rewarded ad: the coins from this run again. */
  doubleCoins() {
    const o = ui.get().over;
    if (!o || o.doubled || this.coins <= 0) return;
    store.earn(this.coins);
    ui.set({ over: { ...o, coins: this.coins * 2, doubled: true, canDouble: false }, bank: this.bank });
    haptics.success();
    [523, 659, 784, 1046].forEach((f, k) => this.sfx.tone(f, 0.16, { type: 'triangle', vol: 0.14, delay: k * 0.08 }));
  }

  // ---------- game flow ----------
  reset() {
    for (const [, row] of this.rows) this.disposeRow(row);
    this.rows.clear(); this.maxRowBuilt = -1; this.lastType = 'grass'; this.streak = 0;
    this.weatherPlan = []; this.weatherSaid = 'clear'; this.waterKind = 'logs';
    for (let i = -BEHIND; i < AHEAD; i++) this.makeRow(i);
    Object.assign(this.pl, { x: 0, row: 0, toX: 0, toRow: 0, t: 1, dead: false, riding: null, queue: null, facing: Math.PI, squash: 0, shield: false, safe: { x: 0, row: 0 }, nudge: 0 });
    this.bubble.visible = false; this.magnetT = 0; this.invuln = 0; this.lastZone = 0; this.idleT = 0;
    const e = this.eagle;
    e.active = false; e.warned = false; if (e.obj) e.obj.visible = false; this.eagleShadow.visible = false;
    this.refreshMissions();
    if (this.pl.body) { this.pl.body.scale.setScalar(0.5); this.pl.body.visible = true; }
    this.pl.root.position.set(0, 0, 0);
    this.score = 0; this.coins = 0; this.sinking = 0; this.speedy = 0; this.continued = false; this.deathKind = null;
    this.camZ = 0; this.camX = 0;
    ui.set({ score: 0, best: this.best, bank: this.bank, shield: false, magnetT: 0, missions: this.missionView() });
  }
  start() {
    this.sfx.unlock();
    if (!this.ownedSet().has(this.petList[this.petIndex])) return;
    if (this.state !== 'title') this.reset();
    this.state = 'play';
    ui.set({ phase: 'play', over: null, screen: null });
    this.play('idle');
    this.sfx.tone(660, 0.1, { type: 'triangle', vol: 0.15 }); this.sfx.tone(990, 0.15, { type: 'triangle', vol: 0.15, delay: 0.08 });
  }
  tapPlay() { this.sfx.unlock(); if (this.ownedSet().has(this.petList[this.petIndex])) this.start(); else this.unlockPet(); }
  toPets() {
    ui.set({ over: null });
    this.reset(); this.state = 'title'; ui.set({ phase: 'title' });
    this.setPet(this.petIndex);
    this.play('dance');
  }
  prevPet() { this.setPet(this.petIndex - 1); this.sfx.unlock(); this.sfx.tone(440, 0.06, { type: 'triangle', vol: 0.12 }); }
  nextPet() { this.setPet(this.petIndex + 1); this.sfx.unlock(); this.sfx.tone(560, 0.06, { type: 'triangle', vol: 0.12 }); }
  toggleMute() { this.sfx.muted = !this.sfx.muted; store.prefs.set('muted', this.sfx.muted); ui.set({ muted: this.sfx.muted }); }
  /** swipe to steer, tap to hop forward (same 24 pt threshold as the web version) */
  swipe(dx: number, dy: number) {
    if (this.state !== 'play') return;
    if (Math.hypot(dx, dy) < 24) return this.hop(0, 1);
    if (Math.abs(dx) > Math.abs(dy)) this.hop(dx > 0 ? 1 : -1, 0); else this.hop(0, dy < 0 ? 1 : -1);
  }
  pause() { this.paused = true; this.sfx.suspend(); }
  resume() { this.paused = false; this.sfx.resume(); }

  // ---------- pop-up text ----------
  popText(pos: THREE.Vector3, text: string, cls = '') {
    const used = new Set(this.pops.map(p => p.slot));
    let slot = -1;
    for (let k = 0; k < POP_SLOTS; k++) if (!used.has(k)) { slot = k; break; }
    if (slot < 0) { slot = this.pops.shift()!.slot; }
    this.pops.push({ pos: pos.clone(), t0: performance.now(), slot });
    usePops.setState(s => { const slots = s.slots.slice(); slots[slot] = { id: Math.random(), text, cls }; return { slots }; });
  }
  updatePops(w: number, h: number) {
    if (!this.pops.length) return;
    const now = performance.now(), frame = popFrames.value.slice();
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i], k = (now - p.t0) / 900;
      const o = p.slot * 4;
      if (k >= 1) {
        frame[o + 3] = 0; this.pops.splice(i, 1);
        usePops.setState(s => { const slots = s.slots.slice(); slots[p.slot] = null; return { slots }; });
        continue;
      }
      const v = this.tmp.copy(p.pos).setY(p.pos.y + k * 0.8).project(this.camera);
      frame[o] = (v.x * 0.5 + 0.5) * w; frame[o + 1] = (-v.y * 0.5 + 0.5) * h;
      frame[o + 2] = k < 0.15 ? 0.6 + k * 2.7 : 1; frame[o + 3] = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
    popFrames.value = frame;
  }

  // ---------- weather: night, storms and blizzards ----------
  // the run is split into 20-row stretches; each gets its own weather (always night in the city)
  weatherAt(row: number): Weather {
    if (row < 30) return 'clear';
    const seg = Math.floor(row / 20), zone = ZONES[zoneOf(seg * 20)];
    if (zone.night) return 'night';
    if (this.weatherPlan[seg] == null) this.weatherPlan[seg] = Math.random() < 0.45 ? 'clear' : pick(zone.weather);
    return this.weatherPlan[seg];
  }

  updateWeather(dt: number) {
    const { stage, scene, camX, camZ } = this;
    const camRow = this.state === 'title' ? 0 : Math.round(camZ + 3);
    const zi = zoneOf(camRow), zone = ZONES[zi];
    const w = this.state === 'title' ? 'clear' : this.weatherAt(camRow);
    const k = 1 - Math.exp(-1.2 * dt);
    this.nightF += ((w === 'night' ? 1 : 0) - this.nightF) * k;
    this.rainF += ((w === 'storm' ? 1 : 0) - this.rainF) * k;
    this.snowF += ((w === 'blizzard' ? 1 : 0) - this.snowF) * k;
    const { nightF, rainF, snowF } = this;
    if (this.state === 'play' && w !== this.weatherSaid) {
      if (w === 'night' && !zone.night) toast('moon', 'Night falls. Watch for headlights');
      if (w === 'storm') toast('storm', 'A storm rolls in');
      if (w === 'blizzard') toast('snow', 'Blizzard! Hard to see');
      this.weatherSaid = w;
    }
    // light: dim and cool at night, grey in a storm, flash with lightning
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    const b = this.base;
    stage.hemi.intensity = b.hemi * (1 - 0.72 * nightF - 0.5 * rainF) + this.flash * 2.5;
    stage.hemi.color.copy(b.hemiCol).lerp(this.moonHemi, nightF);
    stage.sun.intensity = b.sun * (1 - 0.88 * nightF) * (1 - 0.82 * rainF) * (1 - 0.35 * snowF);
    stage.setExposure(1.05 * (1 - 0.3 * nightF - 0.25 * rainF));
    stage.sun.color.copy(b.sunCol).lerp(this.moonSun, nightF);
    scene.environmentIntensity = 0.55 * (1 - 0.8 * nightF - 0.3 * rainF);
    this.lantern.intensity = 6 * nightF;
    const n2 = nightF * nightF, nm = this.nightMats;
    nm.beam.opacity = 0.3 * n2; nm.pool.opacity = 0.36 * n2;
    nm.bulb.opacity = 0.9 * nightF; nm.tail.opacity = 0.8 * nightF;
    // sky colour: season, then darkened by the weather
    const bg = scene.background as THREE.Color, fog = scene.fog as THREE.Fog;
    this.skyCol.setHex(zone.sky).lerp(this.nightCol, nightF * 0.85).lerp(this.stormCol, rainF * 0.7).lerp(this.blizzCol, snowF * 0.6);
    bg.lerp(this.skyCol, 1 - Math.exp(-1.5 * dt)); fog.color.copy(bg);
    if (this.flash > 0) bg.lerp(this.flashCol, this.flash * 0.5);
    // rain streaks + lightning
    const rain = this.rain;
    rain.visible = rainF > 0.02;
    if (rain.visible) {
      rain.material.opacity = 0.7 * rainF;
      rain.position.set(camX, 0, -camZ - 2);
      const attr = this.rainGeo.attributes.position as THREE.BufferAttribute;
      const a = attr.array as Float32Array, fall = (this.reduced ? 9 : 20) * dt;
      for (let i = 0; i < this.rainDraw; i++) {
        const o = i * 6;
        a[o + 1] -= fall; a[o + 4] -= fall; a[o] -= fall * 0.12; a[o + 3] -= fall * 0.12;
        if (a[o + 1] < 0) { const x = rand(-12, 12), y = 10 + rand(0, 1), z = rand(-14, 8); a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x + 0.08; a[o + 4] = y + 0.7; a[o + 5] = z; }
      }
      attr.needsUpdate = true;
      if (Math.random() < dt * 30 * rainF) this.bursts.emit(new THREE.Vector3(camX + rand(-7, 7), 0.02, -camZ + rand(-9, 3)), { tex: 'circle_05', count: 1, color: 0xdfeaff, speed: [0, 0.05], up: 0, size: [0.15, 0.25], life: [0.25, 0.35], gravity: 0, grow: 2.2 });
      if (rainF > 0.7 && this.state === 'play') {
        this.lightningT -= dt;
        if (this.lightningT <= 0) {
          this.lightningT = rand(4, 9);
          if (!this.reduced) { this.flash = 1; ui.set({ flash: ui.get().flash + 1 }); }
          this.sfx.noise(1.8, { vol: 0.45, freq: 110, type: 'lowpass', delay: rand(0.2, 0.7) });
        }
      }
    }
    // falling leaves, snow (heavier in a blizzard) and fireflies at night
    if (!this.reduced && this.state !== 'title') {
      this.ambientT -= dt;
      if (this.ambientT <= 0) {
        const snowy = zi === 2, autumn = zi === 1, flies = nightF > 0.5 && !snowy && !zone.city;
        this.ambientT = snowy ? (snowF > 0.5 ? 0.012 : 0.05) : flies ? 0.12 : 0.1;
        if (this.quality === 'low') this.ambientT *= 1.6;
        const p = new THREE.Vector3(camX + rand(-7, 7), rand(5, 7), -camZ + rand(-9, 3));
        if (snowy) this.bursts.emit(p, { tex: 'circle_05', count: 1, color: 0xffffff, speed: [0.1, snowF > 0.5 ? 1.6 : 0.4], up: [-1.6, -0.6], size: [0.06, 0.13], life: [3, 4], gravity: 0, drag: 1, grow: 1 });
        else if (flies) this.bursts.emit(p.setY(rand(0.4, 1.6)), { tex: 'light_01', count: 1, colors: [0xd9ff7a, 0xfff07a], speed: [0.1, 0.3], up: [-0.1, 0.2], size: [0.12, 0.2], life: [2, 3], gravity: 0, drag: 1, grow: 1, additive: true });
        else if (autumn) this.bursts.emit(p, { tex: 'dirt_02', count: 1, colors: [0xe8742c, 0xf2a93b, 0xc8462c], speed: [0.4, 1], up: [-1, -0.5], size: [0.14, 0.22], life: [3.5, 4.5], gravity: 0, drag: 1, grow: 1 });
        else this.ambientT = 0.3;
      }
    }
    return 1 - 0.3 * rainF - 0.45 * snowF; // how far you can see
  }

  // ---------- the eagle: dawdle too long and it swoops ----------
  buildEagle() {
    const { object, mixer, actions } = cloneLoaded(loaded(P.pet('parrot')));
    object.scale.setScalar(1.25);
    (actions.run || actions.idle).play();
    const g = new THREE.Group(); g.add(object); g.visible = false; this.scene.add(g);
    this.eagle.obj = g; this.eagle.mixer = mixer;
  }
  updateEagle(dt: number) {
    const eagle = this.eagle, pl = this.pl, shadow = this.eagleShadow;
    if (!eagle.obj) return;
    eagle.mixer!.update(dt * 2);
    if (this.state === 'play' && !pl.dead && !eagle.active) {
      this.idleT += dt;
      const idleT = this.idleT;
      if (idleT > 5 && !eagle.warned) {
        eagle.warned = true;
        this.popText(pl.root.position.clone().setY(1.6), 'Keep moving!', 'big');
        this.sfx.tone(1800, 0.35, { type: 'sawtooth', vol: 0.05, slide: -900 });
      }
      shadow.visible = idleT > 5;
      if (shadow.visible) {
        const k = Math.min(1, (idleT - 5) / 2.5);
        shadow.position.set(pl.root.position.x + (1 - k) * 2, 0.03, pl.root.position.z - (1 - k) * 3);
        shadow.scale.setScalar(0.4 + k);
        shadow.material.opacity = 0.1 + k * 0.2;
      }
      if (idleT > 7.5) {
        eagle.active = true; eagle.t = 0; eagle.obj.visible = true;
        eagle.from.set(pl.root.position.x + 5, 9, pl.root.position.z - 9);
        eagle.obj.position.copy(eagle.from);
        this.sfx.tone(1500, 0.5, { type: 'sawtooth', vol: 0.07, slide: -700 });
      }
    }
    if (!eagle.active) { if (this.state !== 'play') shadow.visible = false; return; }
    eagle.t += dt;
    const grab = 0.55;
    if (eagle.t < grab) {
      const k = eagle.t / grab, e = k * k;
      const to = pl.root.position.clone().setY(0.9);
      eagle.obj.position.lerpVectors(eagle.from, to, e);
      eagle.obj.lookAt(to.x, eagle.obj.position.y, to.z);
      shadow.position.set(eagle.obj.position.x, 0.03, eagle.obj.position.z);
    } else {
      if (!pl.dead) this.die('eagle');
      shadow.visible = false;
      const k = eagle.t - grab;
      eagle.obj.position.x -= dt * 4; eagle.obj.position.y += dt * (3 + k * 4); eagle.obj.position.z += dt * 2;
      eagle.obj.rotation.y = -Math.PI / 2;
      pl.root.position.copy(eagle.obj.position).y -= 0.75;
      if (k > 2.5) eagle.obj.visible = false;
    }
  }

  // ---------- main loop ----------
  hudShield = false; hudMagnet = 0;
  tick(rawDt: number, viewW: number, viewH: number) {
    if (this.paused) return;
    const dt = Math.min(0.05, rawDt);
    this.elapsed += dt;
    const t = this.elapsed;
    uTime.value = t;
    const { rows, pl, camera, state } = this;

    // traffic, logs, boats, herds and tumbleweeds
    const viewRow = state === 'title' ? 0 : Math.round(this.camZ + 3);
    for (const [, row] of rows) {
      const inView = Math.abs(row.i - viewRow) < 16;
      if (inView) for (const mx of row.mixers) mx.update(dt);
      if (row.type === 'crabs') {
        // crabs scuttle sideways and change their minds
        for (const m of row.movers) {
          m.turn! -= dt;
          if (m.turn! <= 0 || Math.abs(m.obj.position.x) > HALF + 2.5) { m.vx = -Math.sign(m.obj.position.x || m.vx!) * rand(1.2, 2.4) * (Math.abs(m.obj.position.x) > HALF + 2.5 ? 1 : (Math.random() < 0.5 ? 1 : -1)); m.turn = rand(1, 3); }
          m.obj.position.x += m.vx! * dt;
        }
        continue;
      }
      if (row.lily) {
        // diving lily pads: bubbles, a wobble, then under for a moment
        for (const m of row.movers) {
          if (m.sink == null) continue;
          const ph = (t + m.sink) % 4.5;
          const warn = ph > 2.6 && ph < 3.3, under = ph >= 3.3 && ph < 4.3;
          const target = under ? -0.55 : -0.12;
          m.obj.position.y = damp(m.obj.position.y, target, under ? 10 : 6, dt) + (warn ? Math.sin(t * 40) * 0.006 : 0);
          m.down = m.obj.position.y < -0.3;
          if (warn && inView && Math.random() < dt * 14) this.bursts.emit(new THREE.Vector3(m.x! + rand(-.3, .3), -0.1, -row.i + rand(-.3, .3)), { tex: 'circle_05', count: 1, color: 0xe8fbff, speed: [0, 0.1], up: [0.6, 1], size: [0.06, 0.12], life: [0.3, 0.5], gravity: 0 });
          if (m.down && pl.riding === m && !pl.dead) { pl.riding = null; this.die('water'); }
        }
        continue;
      }
      if (!row.speed) continue;
      for (const m of row.movers) {
        m.obj.position.x += row.dir * row.speed * dt;
        const edge = row.span / 2;
        if (row.dir > 0 && m.obj.position.x > edge) m.obj.position.x -= row.span;
        if (row.dir < 0 && m.obj.position.x < -edge) m.obj.position.x += row.span;
        if (m.kind === 'log' || m.kind === 'boat') {
          m.obj.userData.bob = Math.max(0, (m.obj.userData.bob || 0) - dt * 3);
          m.obj.position.y = m.base! + Math.sin(t * 2 + m.obj.id) * (m.kind === 'boat' ? 0.035 : 0.02) - m.obj.userData.bob * 0.06;
          if (m.kind === 'boat') m.obj.rotation.z = Math.sin(t * 1.6 + m.obj.id) * 0.03;
        }
        if (m.kind === 'car') m.obj.position.y = Math.abs(Math.sin(t * 18 + m.obj.id)) * 0.012;
        if (m.kind === 'herd') {
          m.obj.position.y = Math.abs(Math.sin(t * 9 + m.obj.id)) * 0.08;
          if (inView && Math.random() < dt * 3) this.bursts.emit(new THREE.Vector3(m.obj.position.x - row.dir * 0.4, 0.1, -row.i), { tex: 'smoke_04', count: 1, color: 0xe8d2b0, speed: [0.2, 0.5], up: [0.2, 0.6], size: [0.3, 0.5], life: [0.5, 0.8], gravity: 0, grow: 2 });
        }
        if (m.kind === 'weed') {
          m.hop! += dt * row.speed * 1.3;
          m.obj.position.y = Math.abs(Math.sin(m.hop!)) * 0.45;
          m.spin!.rotation.z -= row.dir * row.speed * dt / 0.38;
        }
        if (m.attach) for (const a of m.attach) a.obj.position.x = m.obj.position.x + a.dx;
      }
    }
    // trains: wait, ring the bell, then thunder across
    for (const [, row] of rows) {
      const tr = row.train;
      if (!tr) continue;
      const near = Math.abs(row.i - pl.row) < 9 && state === 'play';
      if (tr.state === 'wait') {
        tr.timer -= dt;
        if (tr.timer < 1.4) {
          const on = Math.floor(t * 6) % 2;
          tr.lamps[0].material.emissiveIntensity = on ? 3 : 0; tr.lamps[1].material.emissiveIntensity = on ? 0 : 3;
          tr.bell -= dt;
          if (near && tr.bell <= 0) { tr.bell = 0.33; this.sfx.tone(1568, 0.25, { type: 'triangle', vol: 0.07 }); this.sfx.tone(2093, 0.2, { type: 'sine', vol: 0.04 }); }
        }
        if (tr.timer <= 0) {
          tr.state = 'run'; tr.obj.visible = true;
          tr.x = -tr.dir * (WORLD + tr.len / 2 + 2);
          if (near) this.sfx.noise(0.9, { vol: 0.22, freq: 180, type: 'lowpass' });
        }
      } else {
        tr.x! += tr.dir * 26 * dt;
        tr.obj.position.x = tr.x!;
        tr.obj.position.y = 0.08 + Math.abs(Math.sin(t * 30)) * 0.01;
        if (Math.abs(tr.x!) > WORLD + tr.len / 2 + 2.5) {
          tr.state = 'wait'; tr.obj.visible = false; tr.timer = rand(2.5, 6);
          tr.lamps[0].material.emissiveIntensity = tr.lamps[1].material.emissiveIntensity = 0;
        }
      }
    }
    // coins spin; the magnet pulls nearby ones in
    if (this.magnetT > 0 && state === 'play') this.magnetT = Math.max(0, this.magnetT - dt);
    for (const [, row] of rows) {
      if (row.coin) {
        const c = row.coin;
        c.rotation.y += dt * (this.magnetT > 0 ? 9 : 3); c.position.y = 0.35 + Math.sin(t * 3 + row.i) * 0.06;
        if (this.magnetT > 0 && !pl.dead) {
          const dx = pl.root.position.x - c.position.x, dz = pl.root.position.z - (-row.i + c.position.z), d = Math.hypot(dx, dz);
          if (d < 0.45) this.collectCoin(row);
          else if (d < 3.2) { const k = Math.min(1, dt * 9 / d); c.position.x += dx * k; c.position.z += dz * k; }
        }
      }
      if (row.power) {
        const { model, ring } = row.power;
        model.rotation.y += dt * 2; model.position.y = 0.45 + Math.sin(t * 3 + row.i) * 0.08;
        ring.scale.setScalar(1 + Math.sin(t * 4) * 0.12); ring.material.opacity = 0.4 + Math.sin(t * 4) * 0.15;
      }
    }

    // player hop
    if (state === 'play' || state === 'dead') {
      if (pl.t < 1 && !pl.dead) {
        pl.t = Math.min(1, pl.t + dt / pl.dur);
        const k = pl.t;
        pl.x = pl.fromX + (pl.toX - pl.fromX) * k;
        const z = pl.fromZ + (pl.toRow - pl.fromZ) * k;
        pl.root.position.set(pl.x, Math.sin(k * Math.PI) * pl.arc, -z);
        if (pl.t >= 1) this.landed();
      } else if (!pl.dead) {
        if (pl.riding && rows.get(pl.row)) {
          const row = rows.get(pl.row)!;
          pl.x += row.dir * row.speed * dt;
          if (pl.nudge) { const n = pl.nudge * Math.min(1, dt * 14); pl.x += n; pl.nudge -= n; }
          if (Math.abs(pl.x) > HALF + 0.6) this.die('drift');
        }
        pl.root.position.set(pl.x, pl.riding ? pl.riding.obj.position.y + (pl.riding.top ?? 0.3) : 0, -pl.row);
      }
      // squash & stretch
      pl.squash = Math.max(0, pl.squash - dt * 6);
      if (pl.body && !pl.dead) {
        const s = 0.5, q = Math.sin(pl.squash * Math.PI) * 0.18;
        const air = pl.t < 1 ? Math.sin(pl.t * Math.PI) * 0.12 : 0;
        pl.body.scale.set(s * (1 + q - air * .5), s * (1 - q + air), s * (1 + q - air * .5));
      }
      pl.root.rotation.y = damp(pl.root.rotation.y, pl.facing, 25, dt);
      if (this.sinking) { this.sinking = Math.max(0, this.sinking - dt); pl.root.position.y = -0.9 * (1 - this.sinking); }

      // extra-life bubble (and the Continue shield), blink while invulnerable, power-up HUD
      if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
      if (pl.body && !pl.dead) pl.body.visible = this.invuln === 0 || Math.floor(t * 14) % 2 === 0;
      const bubble = this.bubble;
      const keep = pl.shield || (this.continued && this.invuln > 0);
      if (bubble.visible) bubble.scale.setScalar(damp(bubble.scale.x, keep ? 1 + Math.sin(t * 5) * 0.03 : 0.01, 10, dt));
      if (!keep && bubble.scale.x < 0.05) bubble.visible = false;
      const shieldHud = pl.shield && this.state === 'play', magnetHud = Math.ceil(this.magnetT);
      if (shieldHud !== this.hudShield || magnetHud !== this.hudMagnet) { this.hudShield = shieldHud; this.hudMagnet = magnetHud; ui.set({ shield: shieldHud, magnetT: magnetHud }); }

      // collisions with cars (checked every frame, including mid-hop)
      if (!pl.dead && this.invuln === 0) {
        const r = Math.round(-pl.root.position.z);
        const row = rows.get(r);
        const tr = row?.train;
        if (tr?.state === 'run' && Math.abs(tr.x! - pl.root.position.x) < tr.len / 2 + 0.3) this.die('train');
        const hit = ({ road: 'car', herd: 'herd', weeds: 'weed', crabs: 'crab' } as Record<string, DeathKind>)[row?.type ?? ''];
        if (hit && row && !pl.dead) {
          for (const m of row.movers) {
            const d = Math.abs(m.obj.position.x - pl.root.position.x);
            if (d < m.len / 2 + 0.28) { this.die(hit); break; }
            if (row.dir && !m.close && d < m.len / 2 + 0.75 && Math.sign(pl.root.position.x - m.obj.position.x) === row.dir) {
              m.close = true;
              this.track('close');
              if (Math.random() < 0.5) this.popText(new THREE.Vector3(pl.root.position.x, 1.5, -r), pick(['Close call!', 'Phew!', 'Whoosh!']), 'good');
              if (Math.random() < 0.4) this.sfx.tone(392, 0.18, { type: 'square', vol: 0.05 });
            }
          }
        }
      }

      // camera creeps forward once you start, so you can't dawdle forever
      if (this.state === 'play' && this.score > 0) this.camZ += dt * Math.min(1.1, 0.35 + this.score / 120);
      this.camZ = Math.max(this.camZ, damp(this.camZ, pl.row - 1, 3, dt));
    } else if (state === 'title') {
      pl.root.rotation.y = damp(pl.root.rotation.y, 0.35 + Math.sin(t * 0.8) * 0.35, 4, dt);
    }

    const visibility = this.updateWeather(dt);
    this.updateEagle(dt);

    this.camX = damp(this.camX, camera.aspect < 1 ? Math.max(-1, Math.min(1, pl.x * 0.3)) : Math.max(-2, Math.min(2, pl.x * 0.5)), 3, dt);
    const camX = this.camX;
    const cz = this.state === 'title' ? 0 : -this.camZ;
    const sh = this.shake > 0 ? (this.shake -= dt, (Math.random() - 0.5) * this.shake * 0.6) : 0;
    const titleOff = this.state === 'title' ? 1 : 0;
    // pull back on tall, narrow screens so the whole 9-column playfield stays in view
    const zoom = Math.min(2.4, Math.max(1, 1.25 / camera.aspect));
    const fog = this.scene.fog as THREE.Fog;
    fog.near = 28 * zoom * visibility; fog.far = 60 * zoom * (0.4 + 0.6 * visibility);
    camera.position.set(camX + (3.2 + sh - titleOff * 0.6) * zoom, (10.5 - titleOff * 2) * zoom, cz + (7.2 - titleOff * 0.6) * zoom);
    camera.lookAt(camX + sh * 0.5, titleOff * 0.3, cz - 2.2 + titleOff * 1.6);
    for (const [, row] of rows) if (row.group.userData.bb) for (const q of row.group.userData.bb as Obj[]) q.quaternion.copy(camera.quaternion);
    // left behind: once the top of the pet slips off the bottom of the screen, the run is over
    if (this.state === 'play' && !pl.dead) {
      camera.updateMatrixWorld();
      if (this.tmp.copy(pl.root.position).setY(pl.root.position.y + 0.8).project(camera).y < -1) this.die('slow');
    }
    this.stage.followShadow(this.tmp.set(camX, 0, cz - 3));

    const blob = this.shadowBlob;
    blob.position.set(pl.root.position.x, 0.02, pl.root.position.z);
    blob.visible = !this.sinking && rows.get(Math.round(-pl.root.position.z))?.type !== 'river';
    blob.scale.setScalar(1 - Math.max(0, pl.root.position.y) * 0.8);

    pl.mixer?.update(dt);
    this.bursts.update(dt);
    camera.updateMatrixWorld();
    this.updatePops(viewW, viewH);
    this.stage.render();
  }
}

export const STARTER_PETS = STARTERS;
