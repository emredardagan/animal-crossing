// Static batching: everything in a row that never moves is baked into one mesh per material.
// A row holds dozens of separate meshes (ground slabs, lane lines, trees, flowers, buildings);
// each one is a draw call (two with shadows), and on react-native-webgpu every GPU command
// crosses JSI, so draw calls are what the frame time is made of.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Plain Float32 copy of the attributes a merged mesh needs, transformed into the row's space. */
function bake(mesh: THREE.Mesh, toRow: THREE.Matrix4) {
  const src = mesh.geometry;
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    let out: Float32Array;
    if (a instanceof THREE.BufferAttribute && a.array instanceof Float32Array && !a.normalized) out = a.array.slice(0, a.count * a.itemSize);
    else { // interleaved or quantized: read through the accessor
      out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  const idx = src.getIndex();
  g.setIndex(idx ? Array.from(idx.array as ArrayLike<number>) : [...Array(src.getAttribute('position').count).keys()]);
  g.applyMatrix4(mesh.matrixWorld.clone().premultiply(toRow));
  return g;
}

/**
 * Merges the static meshes under `group` (anything not inside one of `dynamic`) into one mesh per
 * material + shadow setup. Returns the merged meshes so the caller can dispose their geometry.
 */
export function mergeStatic(group: THREE.Group, dynamic: Set<THREE.Object3D>): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  const toRow = group.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; order: number; meshes: THREE.Mesh[] }>();
  const visit = (o: THREE.Object3D) => {
    if (dynamic.has(o) || !o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh
      && !Array.isArray(m.material) && !Object.keys(m.geometry.morphAttributes).length && m.geometry.getAttribute('position')) {
      const g = m.geometry;
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}|${g.getAttribute('normal') ? 'n' : ''}${g.getAttribute('uv') ? 'u' : ''}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, order: m.renderOrder, meshes: [] });
      b.meshes.push(m);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of group.children) visit(c);

  const merged: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue; // nothing to gain
    const geo = mergeGeometries(b.meshes.map(m => bake(m, toRow)));
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.order;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    merged.push(mesh);
    for (const m of b.meshes) m.removeFromParent();
  }
  // drop the empty shells (glTF scene roots and nodes) the merged meshes leave behind
  const prune = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      if (dynamic.has(c)) continue;
      prune(c);
      if (!c.children.length && !(c as THREE.Mesh).isMesh && !(c as THREE.Light).isLight) c.removeFromParent();
    }
  };
  prune(group);
  return merged;
}
