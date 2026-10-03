// toybox.js preload/load/loaded/cloneLoaded, reading bundled files instead of URLs.
import * as THREE from 'three/webgpu';
import { Image } from 'react-native';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { COLORMAPS, MODELS, PARTICLE_TEXTURES, SKY_HDR } from '../assets/manifest';

export type { GLTF };

/** Read a bundled asset (Metro `require` id) as an ArrayBuffer. Works for the dev server and release bundles. */
export function readAsset(id: number): Promise<ArrayBuffer> {
  const uri = Image.resolveAssetSource(id)!.uri;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', uri);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => (xhr.status === 200 || xhr.status === 0) && xhr.response
      ? resolve(xhr.response as ArrayBuffer)
      : reject(new Error(`Asset ${uri}: HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error(`Asset ${uri}: network error`));
    xhr.send();
  });
}

/** Raw RGBA file from scripts/build-assets.mjs -> DataTexture. */
export async function loadRawTexture(id: number, srgb = true): Promise<THREE.DataTexture> {
  const buf = await readAsset(id);
  const head = new DataView(buf, 0, 8);
  const w = head.getUint32(0, true), h = head.getUint32(4, true);
  const tex = new THREE.DataTexture(new Uint8Array(buf, 8, w * h * 4), w, h, THREE.RGBAFormat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Every Kenney kit shares one Textures/colormap.png. The GLBs keep that external
// reference; this handler hands GLTFLoader one shared texture per kit (one GPU upload).
const colormaps = new Map<string, THREE.DataTexture>();
class ColormapLoader extends THREE.Loader<THREE.Texture> {
  load(url: string, onLoad: (t: THREE.Texture) => void, _p?: unknown, onError?: (e: unknown) => void) {
    const kit = url.split('/Textures/')[0].split('/').pop()!;
    const tex = colormaps.get(kit);
    if (tex) onLoad(tex); else onError?.(new Error(`No colormap for ${url}`));
    return tex as unknown as THREE.Texture;
  }
}
const manager = new THREE.LoadingManager();
manager.addHandler(/colormap\.png$/, new ColormapLoader(manager));
const loader = new GLTFLoader(manager);

// Every GLB brings its own copy of its kit's few materials (151 files, 25 distinct looks).
// One instance per look means fewer GPU bind groups and lets static batching merge across models.
const materials = new Map<string, THREE.Material>();
function shared(mat: THREE.MeshStandardMaterial): THREE.Material {
  if (!mat) return mat;
  const t = mat.map;
  if (t) t.anisotropy = 4;
  const key = [
    mat.type, mat.color?.getHex(), mat.roughness, mat.metalness, mat.emissive?.getHex(), mat.transparent, mat.opacity, mat.side, mat.alphaTest, mat.vertexColors,
    t ? [t.source.uuid, t.offset.x, t.offset.y, t.repeat.x, t.repeat.y, t.rotation, t.channel].join(',') : '-',
  ].join('|');
  const hit = materials.get(key);
  if (hit) { if (hit !== mat) mat.dispose(); return hit; }
  materials.set(key, mat);
  return mat;
}

const cache = new Map<string, Promise<GLTF>>();
const ready = new Map<string, GLTF>();

async function loadColormaps() {
  await Promise.all(Object.entries(COLORMAPS).map(async ([kit, id]) => {
    if (colormaps.has(kit)) return;
    const t = await loadRawTexture(id);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    colormaps.set(kit, t);
  }));
}

export function load(key: string): Promise<GLTF> {
  if (!cache.has(key)) {
    const id = MODELS[key];
    if (id == null) return Promise.reject(new Error(`Unknown model ${key}`));
    cache.set(key, readAsset(id).then(buf => loader.parseAsync(buf, `${key.split('/')[0]}/`)).then(gltf => {
      gltf.scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true; m.receiveShadow = true;
          // no normal maps anywhere: tangents only make the vertex layouts differ
          m.geometry.deleteAttribute('tangent');
          m.material = shared(m.material as THREE.MeshStandardMaterial);
        }
      });
      ready.set(key, gltf);
      return gltf;
    }));
  }
  return cache.get(key)!;
}

export async function preload(keys: string[], onProgress?: (k: number) => void) {
  await loadColormaps();
  let done = 0;
  // a few at a time keeps the JS thread responsive while parsing
  const queue = [...keys];
  const worker = async () => {
    while (queue.length) { await load(queue.shift()!); onProgress?.(++done / keys.length); }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

export interface Clone { object: THREE.Object3D; mixer: THREE.AnimationMixer | null; actions: Record<string, THREE.AnimationAction> }

export function cloneLoaded(gltf: GLTF, { scale = 1, shadows = true } = {}): Clone {
  const animated = gltf.animations.length > 0;
  const object = animated ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
  object.scale.setScalar(scale);
  if (!shadows) object.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
  let mixer: THREE.AnimationMixer | null = null;
  const actions: Record<string, THREE.AnimationAction> = {};
  if (animated) {
    mixer = new THREE.AnimationMixer(object);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  }
  return { object, mixer, actions };
}

/** The loaded glTF for a key (after preload), for synchronous cloning in game loops. */
export const loaded = (key: string) => ready.get(key)!;

export async function loadParticleTextures() {
  const out: Record<string, THREE.DataTexture> = {};
  await Promise.all(Object.entries(PARTICLE_TEXTURES).map(async ([name, id]) => {
    const t = await loadRawTexture(id);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    out[name] = t;
  }));
  return out;
}

export async function loadSky(): Promise<THREE.DataTexture> {
  const tex = new HDRLoader().parse(await readAsset(SKY_HDR));
  const t = new THREE.DataTexture(tex.data as unknown as Uint16Array, tex.width, tex.height, THREE.RGBAFormat, tex.type);
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.flipY = true;
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.needsUpdate = true;
  return t;
}
