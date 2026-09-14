import * as T from './three.module.js';
import {FBXLoader} from 'https://esm.sh/three@0.180.0/examples/jsm/loaders/FBXLoader.js?bundle';
import {clone as cloneSkeleton} from 'https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js?bundle';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const DB_NAME = 'tbilisi-drive-assets';
const STORE_NAME = 'files';
const CACHE_KEY = 'anna-ipati-animated-zip';
const liveRoots = new Set();
let sourcePromise = null;
let pickerReady = false;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheZip(arrayBuffer) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(arrayBuffer, CACHE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readCachedZip() {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(CACHE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

function makePlaceholder(index = 0) {
  const root = new T.Group();
  const skin = new T.MeshStandardMaterial({color: 0xd8a080, roughness: .8});
  const cloth = new T.MeshStandardMaterial({color: 0x28384d, roughness: .85});
  const pants = new T.MeshStandardMaterial({color: 0x313845, roughness: .85});

  const torso = new T.Mesh(new T.CapsuleGeometry(.19, .42, 4, 8), cloth);
  torso.position.y = 1.15;
  const head = new T.Mesh(new T.SphereGeometry(.16, 12, 8), skin);
  head.position.y = 1.62;
  root.add(torso, head);

  const limb = (x, y, mat, arm = false) => {
    const pivot = new T.Group();
    pivot.position.set(x, y, 0);
    const m = new T.Mesh(new T.CapsuleGeometry(arm ? .045 : .06, arm ? .34 : .48, 3, 7), mat);
    m.position.y = arm ? -.2 : -.28;
    pivot.add(m);
    root.add(pivot);
    return pivot;
  };
  const legL = limb(-.1, .76, pants), legR = limb(.1, .76, pants);
  const armL = limb(-.25, 1.35, cloth, true), armR = limb(.25, 1.35, cloth, true);
  root.userData.pose = (time, walk = 0) => {
    const a = Math.max(0, Math.min(1, walk));
    const s = Math.sin(time * 7 + index * .71) * .55 * a;
    legL.rotation.x = s; legR.rotation.x = -s;
    armL.rotation.x = -s * .7; armR.rotation.x = s * .7;
  };
  return root;
}

async function buildSourceFromZip(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entries = Object.values(zip.files);
  const fbxEntry = entries.find(e => !e.dir && /\.fbx$/i.test(e.name));
  if (!fbxEntry) throw new Error('FBX file was not found inside the selected ZIP.');

  const textureEntries = entries.filter(e => !e.dir && /\.(png|jpe?g|webp)$/i.test(e.name));
  const objectUrls = new Map();
  for (const entry of textureEntries) {
    const blob = await entry.async('blob');
    const url = URL.createObjectURL(blob);
    const name = entry.name.split('/').pop().toLowerCase();
    objectUrls.set(name, url);
  }

  const manager = new T.LoadingManager();
  manager.setURLModifier(url => {
    const clean = decodeURIComponent(url.split('?')[0]).replace(/\\/g, '/');
    const name = clean.split('/').pop().toLowerCase();
    return objectUrls.get(name) || url;
  });

  const loader = new FBXLoader(manager);
  const fbxBuffer = await fbxEntry.async('arraybuffer');
  const fbx = loader.parse(fbxBuffer, '');
  fbx.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m.map) m.map.colorSpace = T.SRGBColorSpace;
      m.needsUpdate = true;
    }
  });

  fbx.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(fbx);
  const size = new T.Vector3();
  box.getSize(size);
  const scale = size.y > 0 ? 1.72 / size.y : 1;
  fbx.scale.setScalar(scale);
  fbx.updateMatrixWorld(true);
  const fitted = new T.Box3().setFromObject(fbx);
  fbx.position.y -= fitted.min.y;
  fbx.userData._annaObjectUrls = objectUrls;
  return fbx;
}

async function loadSource() {
  if (!sourcePromise) {
    sourcePromise = (async () => {
      const cached = await readCachedZip();
      if (!cached) throw new Error('Anna ZIP is not cached yet.');
      return await buildSourceFromZip(cached);
    })();
  }
  return sourcePromise;
}

function installSourceInto(root, source) {
  const old = root.userData.model;
  if (old) root.remove(old);
  for (const child of [...root.children]) root.remove(child);

  const model = cloneSkeleton(source);
  model.rotation.y = Math.PI;
  root.add(model);
  root.userData.model = model;
  root.userData.ready = true;
  root.userData.isOriginalAnna = true;

  const animations = source.animations || [];
  if (animations.length) {
    const mixer = new T.AnimationMixer(model);
    const clip = animations.find(c => /walk|walking|locomotion/i.test(c.name)) || animations[0];
    mixer.clipAction(clip).play();
    let lastTime = null;
    root.userData.pose = (time, walk = 0) => {
      const dt = lastTime == null ? 0 : Math.max(0, Math.min(.1, time - lastTime));
      lastTime = time;
      mixer.timeScale = Math.max(.05, walk * 1.5);
      mixer.update(dt);
    };
  } else {
    root.userData.pose = () => {};
  }
}

async function refreshAllRoots() {
  const source = await loadSource();
  for (const root of liveRoots) installSourceInto(root, source);
}

function showStatus(text, ok = false) {
  let el = document.getElementById('anna-asset-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'anna-asset-status';
    Object.assign(el.style, {
      position: 'fixed', left: '50%', top: '18px', transform: 'translateX(-50%)', zIndex: 10020,
      padding: '10px 14px', borderRadius: '10px', font: '600 13px system-ui',
      background: 'rgba(10,14,20,.92)', color: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,.35)'
    });
    document.body.appendChild(el);
  }
  el.textContent = text;
  if (ok) setTimeout(() => el.remove(), 3200);
}

function ensurePicker() {
  if (pickerReady || typeof document === 'undefined') return;
  pickerReady = true;
  const run = async () => {
    const cached = await readCachedZip().catch(() => null);
    if (cached) {
      loadSource().then(refreshAllRoots).catch(console.warn);
      return;
    }

    const wrap = document.createElement('div');
    wrap.id = 'anna-zip-picker';
    Object.assign(wrap.style, {
      position: 'fixed', right: '14px', top: '14px', zIndex: 10010,
      background: 'rgba(12,18,26,.94)', color: '#fff', padding: '10px 12px', borderRadius: '12px',
      font: '600 12px system-ui', boxShadow: '0 8px 28px rgba(0,0,0,.35)'
    });
    const button = document.createElement('button');
    button.textContent = 'Anna 3D მოდელის ჩატვირთვა';
    Object.assign(button.style, {border: 0, borderRadius: '9px', padding: '10px 12px', fontWeight: '700', cursor: 'pointer'});
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.zip,application/zip'; input.style.display = 'none';
    wrap.append(button, input);
    document.body.appendChild(wrap);

    button.onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        button.disabled = true;
        showStatus('Anna იტვირთება… ფაილი დიდია, არ დახურო თამაში.');
        const buf = await file.arrayBuffer();
        await cacheZip(buf);
        sourcePromise = null;
        await refreshAllRoots();
        wrap.remove();
        showStatus('Anna ჩაიტვირთა და დამახსოვრდა ✓', true);
      } catch (err) {
        console.error(err);
        button.disabled = false;
        showStatus('Anna ვერ ჩაიტვირთა: ' + (err?.message || err));
      }
    };
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', run, {once:true}); else run();
}

ensurePicker();

export function createAnnaPedestrian(index = 0) {
  const root = new T.Group();
  root.name = 'AnnaPedestrian';
  root.userData.ready = false;
  root.userData.isOriginalAnna = false;
  const fallback = makePlaceholder(index);
  root.add(fallback);
  root.userData.pose = (...args) => fallback.userData.pose?.(...args);
  liveRoots.add(root);

  loadSource().then(source => installSourceInto(root, source)).catch(() => {});
  return root;
}
