import * as T from './three.module.js';
import {createPerson} from './people.js';
import {FBXLoader} from 'https://esm.sh/three@0.180.0/examples/jsm/loaders/FBXLoader.js?bundle';
import {clone as cloneSkeleton} from 'https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js?bundle';

const ASSET_BASE = './assets/anna-ipati';
const TEXTURE_PATH = `${ASSET_BASE}/textures/`;
const MANIFEST_URL = `${ASSET_BASE}/manifest.json`;
let sourcePromise;

async function fetchArrayBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.arrayBuffer();
}

async function fetchChunkedGzip(manifestUrl) {
  const manifest = await fetch(manifestUrl).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch manifest: ${r.status}`);
    return r.json();
  });
  const partBuffers = [];
  let total = 0;
  for (const part of manifest.parts) {
    const url = `${ASSET_BASE}/chunks/${part.name}`;
    const buf = await fetchArrayBuffer(url);
    partBuffers.push(new Uint8Array(buf));
    total += buf.byteLength;
  }
  const gz = new Uint8Array(total);
  let offset = 0;
  for (const part of partBuffers) {
    gz.set(part, offset);
    offset += part.byteLength;
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support DecompressionStream for gzip assets.');
  }
  const stream = new Blob([gz], {type: 'application/gzip'}).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

async function loadSource() {
  if (sourcePromise) return sourcePromise;
  sourcePromise = (async () => {
    const loader = new FBXLoader();
    const buffer = await fetchChunkedGzip(MANIFEST_URL);
    const fbx = loader.parse(buffer, TEXTURE_PATH);
    fbx.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const list = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of list) {
        if (m.map) m.map.colorSpace = T.SRGBColorSpace;
        m.needsUpdate = true;
      }
    });
    const box = new T.Box3().setFromObject(fbx);
    const size = new T.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? 1.72 / size.y : 1;
    fbx.scale.setScalar(scale);
    const fitted = new T.Box3().setFromObject(fbx);
    fbx.position.y -= fitted.min.y;
    return fbx;
  })();
  return sourcePromise;
}

export function createAnnaPedestrian(index = 0) {
  const root = new T.Group();
  root.name = 'AnnaPedestrian';
  const fallback = createPerson(index);
  root.add(fallback);
  root.userData.pose = (time, walk = 0, reach = 0) => fallback.userData.pose?.(time, walk, reach);
  root.userData.ready = false;
  loadSource().then(source => {
    const model = cloneSkeleton(source);
    model.rotation.y = Math.PI;
    while (root.children.length) root.remove(root.children[0]);
    root.add(model);
    const animations = source.animations || [];
    let mixer = null;
    if (animations.length) {
      mixer = new T.AnimationMixer(model);
      const walkClip = animations.find(c => /walk|walking/i.test(c.name)) || animations[0];
      mixer.clipAction(walkClip).play();
    }
    let lastTime = null;
    root.userData.pose = (time, walk = 0) => {
      if (!mixer) return;
      const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.1, time - lastTime));
      lastTime = time;
      mixer.timeScale = Math.max(0.05, walk * 1.4);
      mixer.update(dt);
    };
    root.userData.ready = true;
  }).catch(err => {
    console.warn('Anna pedestrian model could not load; using fallback pedestrian.', err);
  });
  return root;
}
