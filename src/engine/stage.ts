// toybox.js createStage() on WebGPURenderer (react-native-webgpu -> Dawn -> Metal).
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, vec3, vec4, mix, uniform } from 'three/tsl';
import { ao as gtao } from 'three/addons/tsl/display/GTAONode.js';
import type { RNCanvasContext } from 'react-native-webgpu';
import { loadSky } from './assets';

export const PALETTE = {
  sky: 0xbfe7ff, skyLow: 0xfdf1dc, grass: 0x9bd46a, grassDark: 0x8cc75d, grassEdge: 0x7fb452,
  road: 0x5a6070, roadLine: 0xf6f1e3, water: 0x5cc8e8, sand: 0xf1dca5, ink: 0x2b2d42,
};

export type Quality = 'high' | 'low';
export const QUALITY = {
  high: { ao: true, shadow: 2048, pixelRatio: 2, rain: 900 },
  low: { ao: false, shadow: 1024, pixelRatio: 1.5, rain: 450 },
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

// Same device three.js would request, except Dawn's metal_disable_sampler_compare toggle is forced off:
// Dawn turns it on for the iOS Simulator (it only reports GPUFamily2), which makes every shadow-map
// comparison sampler invalid and drops the whole frame. The simulator's host GPU supports compare
// samplers and real devices never enable the toggle, so this is a no-op on iPhones.
async function requestDevice(): Promise<GPUDevice> {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' } as GPURequestAdapterOptions);
  if (!adapter) throw new Error('Unable to create WebGPU adapter');
  return adapter.requestDevice({
    requiredFeatures: [...adapter.features] as GPUFeatureName[],
    dawnToggles: { disabledToggles: ['metal_disable_sampler_compare'] },
  } as GPUDeviceDescriptor);
}

export async function createStage(context: RNCanvasContext, {
  width, height, pixelRatio, quality = 'high' as Quality,
  fov = 32, background = PALETTE.sky, fog = [28, 60] as [number, number], envIntensity = 0.55,
}: { width: number; height: number; pixelRatio: number; quality?: Quality; fov?: number; background?: number; fog?: [number, number]; envIntensity?: number }): Promise<Stage> {
  const renderer = new THREE.WebGPURenderer({
    device: await requestDevice(),
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
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  // the shadow pass redraws every caster, so it is refreshed every other frame (see render())
  sun.shadow.autoUpdate = false;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const sunOffset = sun.position.clone();

  // image-based light from a CC0 Poly Haven sky; the node system pre-filters it (PMREM) itself
  try {
    scene.environment = await loadSky();
    scene.environmentIntensity = envIntensity;
  } catch (e) { console.warn('sky', e); }

  // post: GTAO (replaces N8AO), tinted like the web version, then tone-mapped output
  let pipeline: THREE.RenderPipeline | null = null;
  const aoColor = uniform(new THREE.Color(0x2a3350));
  function buildPipeline() {
    // GTAO can't read a multisampled depth texture, so this pass renders without MSAA
    const scenePass = pass(scene, camera, { samples: 0 });
    // GTAO samples the normal texture itself, so store raw view-space normals (half float keeps the sign)
    scenePass.setMRT(mrt({ output, normal: normalView }));
    scenePass.getTexture('normal').type = THREE.HalfFloatType;
    const color = scenePass.getTextureNode('output');
    const normal = scenePass.getTextureNode('normal');
    const depth = scenePass.getTextureNode('depth');
    const aoPass = gtao(depth, normal, camera);
    aoPass.resolutionScale = 0.5;
    aoPass.radius.value = 1.2;
    aoPass.distanceFallOff.value = 1.0;
    aoPass.scale.value = 1.6;
    const k = aoPass.getTextureNode().r;
    const p = new THREE.RenderPipeline(renderer);
    p.outputNode = vec4(color.rgb.mul(mix(aoColor as unknown as ReturnType<typeof vec3>, vec3(1), k)), color.a);
    return p;
  }

  let q: Quality = quality, frame = 0;
  const stage: Stage = {
    renderer, scene, camera, sun, hemi,
    setExposure(v) { renderer.toneMappingExposure = v; },
    resize(w, h) {
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
      if (frame++ % 2 === 0) sun.shadow.needsUpdate = true;
      if (pipeline) pipeline.render(); else renderer.render(scene, camera);
      context.present();
    },
    setQuality(next) {
      q = next;
      const cfg = QUALITY[q];
      if (sun.shadow.mapSize.x !== cfg.shadow) {
        sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
        sun.shadow.map?.dispose(); sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
      }
      if (cfg.ao && !pipeline) {
        try { pipeline = buildPipeline(); } catch (e) { console.warn('AO disabled', e); pipeline = null; }
      } else if (!cfg.ao && pipeline) { pipeline.dispose(); pipeline = null; }
    },
    dispose() {
      renderer.setAnimationLoop(null);
      pipeline?.dispose();
      renderer.dispose();
    },
  };
  stage.setQuality(q);
  stage.resize(width, height);
  return stage;
}
