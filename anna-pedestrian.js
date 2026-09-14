import * as T from './three.module.js';
import {GLTFLoader} from 'https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js?bundle';
import {clone as cloneSkeleton} from 'https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js?bundle';

const MODEL_BASE = './assets/anna-ipati/model';
const PART_COUNT = 11;
let sourcePromise;

function decodeBase64(text) {
  const clean = text.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function loadSource() {
  if (sourcePromise) return sourcePromise;
  sourcePromise = (async () => {
    const parts = await Promise.all(Array.from({length: PART_COUNT}, async (_, i) => {
      const name = `part${String(i).padStart(2, '0')}.b64`;
      const res = await fetch(`${MODEL_BASE}/${name}`, {cache: 'force-cache'});
      if (!res.ok) throw new Error(`Anna model chunk ${name} failed: ${res.status}`);
      return res.text();
    }));

    const buffer = decodeBase64(parts.join(''));
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(buffer, '', resolve, reject);
    });
    const model = gltf.scene;

    model.rotation.x = -Math.PI / 2;
    model.rotation.y = Math.PI;
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const materials = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of materials) {
        if (m.map) m.map.colorSpace = T.SRGBColorSpace;
        m.needsUpdate = true;
      }
    });

    model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model);
    const size = new T.Vector3();
    box.getSize(size);
    if (size.y > 0) model.scale.multiplyScalar(1.72 / size.y);
    model.updateMatrixWorld(true);
    const fitted = new T.Box3().setFromObject(model);
    model.position.y -= fitted.min.y;
    return model;
  })();
  return sourcePromise;
}

function cacheBaseRotations(model) {
  const names = ['ArmL', 'ArmR', 'LegL', 'LegR', 'Ponytail'];
  const base = {};
  for (const name of names) {
    const node = model.getObjectByName(name);
    if (node) base[name] = {node, x: node.rotation.x, y: node.rotation.y, z: node.rotation.z};
  }
  return base;
}

export function createAnnaPedestrian(index = 0) {
  const root = new T.Group();
  root.name = 'AnnaPedestrian';
  root.userData.ready = false;
  root.userData.pose = () => {};

  const placeholder = new T.Mesh(
    new T.CircleGeometry(0.18, 16),
    new T.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false})
  );
  placeholder.rotation.x = -Math.PI / 2;
  placeholder.position.y = 0.012;
  root.add(placeholder);

  loadSource().then(source => {
    const model = cloneSkeleton(source);
    while (root.children.length) root.remove(root.children[0]);
    root.add(model);

    const base = cacheBaseRotations(model);
    const phase = index * 0.73;
    root.userData.pose = (time, walk = 0) => {
      const amount = Math.max(0, Math.min(1, walk));
      const swing = Math.sin(time * 7 + phase) * 0.55 * amount;
      if (base.LegL) base.LegL.node.rotation.x = base.LegL.x + swing;
      if (base.LegR) base.LegR.node.rotation.x = base.LegR.x - swing;
      if (base.ArmL) base.ArmL.node.rotation.x = base.ArmL.x - swing * 0.72;
      if (base.ArmR) base.ArmR.node.rotation.x = base.ArmR.x + swing * 0.72;
      if (base.Ponytail) base.Ponytail.node.rotation.x = base.Ponytail.x + Math.sin(time * 5 + phase) * 0.08 * amount;
      model.position.y = Math.abs(Math.sin(time * 7 + phase)) * 0.018 * amount;
    };
    root.userData.ready = true;
  }).catch(err => {
    console.error('Anna pedestrian model could not load.', err);
  });

  return root;
}
