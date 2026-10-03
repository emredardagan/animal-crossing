// toybox.js createStage() on WebGPURenderer (react-native-webgpu -> Dawn -> Metal).
import * as THREE from 'three/webgpu';
import type { RNCanvasContext } from 'react-native-webgpu';
import { loadSky } from './assets';

export const PALETTE = {
  sky: 0xbfe7ff, skyLow: 0xfdf1dc, grass: 0x9bd46a, grassDark: 0x8cc75d, grassEdge: 0x7fb452,
  road: 0x5a6070, roadLine: 0xf6f1e3, water: 0x5cc8e8, sand: 0xf1dca5, ink: 0x2b2d42,
};

export type Quality = 'high' | 'low';
// The web version's GTAO pass is gone: on a phone it cost more than the whole scene
// (an extra normal target, a half-res AO pass and a full-screen composite every frame).
// shadow: map size, 0 = no shadows
export const QUALITY = {
  high: { shadow: 1024, pixelRatio: 2, rain: 600 },
  low: { shadow: 0, pixelRatio: 1.25, rain: 300 },
} as const;

export interface Stage {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene & { fog: THREE.Fog; background: THREE.Color };
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  setExposure(v: number): void;
  resize(w: number, h: number): void;
  followShadow(target: THREE.Vector3): void;
  render(): void;
  setQuality(q: Quality): void;
  dispose(): void;
}

export async function createStage(context: RNCanvasContext, {
  width, height, pixelRatio, quality = 'high' as Quality,
  fov = 32, background = PALETTE.sky, fog = [28, 60] as [number, number], envIntensity = 0.55,
}: { width: number; height: number; pixelRatio: number; quality?: Quality; fov?: number; background?: number; fog?: [number, number]; envIntensity?: number }): Promise<Stage> {
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    canvas: context.canvas as unknown as HTMLCanvasElement,
    context: context as unknown as GPUCanvasContext,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();

  const scene = new THREE.Scene() as Stage['scene'];
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(background, fog[0], fog[1]);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);

  // soft sky fill + warm sun
  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x8a9a5b, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const sunOffset = sun.position.clone();

  // image-based light from a CC0 Poly Haven sky; the node system pre-filters it (PMREM) itself
  try {
    scene.environment = await loadSky();
    scene.environmentIntensity = envIntensity;
  } catch (e) { console.warn('sky', e); }

  let q: Quality = quality;
  const size = { w: width, h: height };
  const stage: Stage = {
    renderer, scene, camera, sun, hemi,
    setExposure(v) { renderer.toneMappingExposure = v; },
    resize(w, h) {
      size.w = w; size.h = h;
      renderer.setPixelRatio(Math.min(pixelRatio, QUALITY[q].pixelRatio));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    followShadow(target) {
      sun.target.position.copy(target);
      sun.position.copy(target).add(sunOffset);
    },
    render() {
      renderer.render(scene, camera);
      context.present();
    },
    setQuality(next) {
      q = next;
      const cfg = QUALITY[q];
      sun.castShadow = cfg.shadow > 0;
      if (cfg.shadow && sun.shadow.mapSize.x !== cfg.shadow) {
        sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
        sun.shadow.map?.dispose(); sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
      }
      stage.resize(size.w, size.h);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
  };
  stage.setQuality(q);
  return stage;
}
