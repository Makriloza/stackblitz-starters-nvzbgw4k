import * as T from './three.module.js';

const MANIFEST_URL = './assets/anna-ipati/manifest.json';
const MODEL_BASE_URL = './assets/anna-ipati/model/';
const liveRoots = new Set();
let sourcePromise = null;

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
    const mesh = new T.Mesh(new T.CapsuleGeometry(arm ? .045 : .06, arm ? .34 : .48, 3, 7), mat);
    mesh.position.y = arm ? -.2 : -.28;
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  };

  const legL = limb(-.1, .76, pants), legR = limb(.1, .76, pants);
  const armL = limb(-.25, 1.35, cloth, true), armR = limb(.25, 1.35, cloth, true);
  root.userData.pose = (time, walk = 0) => {
    const amount = Math.max(0, Math.min(1, walk));
    const swing = Math.sin(time * 7 + index * .71) * .55 * amount;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * .7;
    armR.rotation.x = swing * .7;
  };
  return root;
}

function decodeBase64(base64) {
  const clean = base64.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function componentInfo(componentType) {
  switch (componentType) {
    case 5120: return {ArrayType: Int8Array, bytes: 1};
    case 5121: return {ArrayType: Uint8Array, bytes: 1};
    case 5122: return {ArrayType: Int16Array, bytes: 2};
    case 5123: return {ArrayType: Uint16Array, bytes: 2};
    case 5125: return {ArrayType: Uint32Array, bytes: 4};
    case 5126: return {ArrayType: Float32Array, bytes: 4};
    default: throw new Error('Unsupported glTF component type: ' + componentType);
  }
}

function itemSize(type) {
  return ({SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16})[type] || 1;
}

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  if (!accessor || accessor.bufferView == null) throw new Error('Unsupported sparse/empty accessor');
  const view = gltf.bufferViews[accessor.bufferView];
  const {ArrayType, bytes} = componentInfo(accessor.componentType);
  const size = itemSize(accessor.type);
  const count = accessor.count;
  const baseOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || size * bytes;

  let array;
  if (stride === size * bytes && baseOffset % bytes === 0) {
    array = new ArrayType(bin.buffer, bin.byteOffset + baseOffset, count * size);
  } else {
    array = new ArrayType(count * size);
    const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const little = true;
    const getter = ({
      5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16',
      5125: 'getUint32', 5126: 'getFloat32'
    })[accessor.componentType];
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < size; c++) {
        array[i * size + c] = data[getter](baseOffset + i * stride + c * bytes, little);
      }
    }
  }

  return {array, itemSize: size, normalized: !!accessor.normalized, componentType: accessor.componentType};
}

function makeMaterial(gltf, materialIndex, hasVertexColor) {
  const src = gltf.materials?.[materialIndex] || {};
  const pbr = src.pbrMetallicRoughness || {};
  const factor = pbr.baseColorFactor || [1, 1, 1, 1];
  const material = new T.MeshStandardMaterial({
    color: new T.Color(factor[0], factor[1], factor[2]),
    opacity: factor[3] ?? 1,
    transparent: (factor[3] ?? 1) < .999 || src.alphaMode === 'BLEND',
    alphaTest: src.alphaMode === 'MASK' ? (src.alphaCutoff ?? .5) : 0,
    metalness: pbr.metallicFactor ?? 0,
    roughness: pbr.roughnessFactor ?? .8,
    side: src.doubleSided ? T.DoubleSide : T.FrontSide,
    vertexColors: !!hasVertexColor
  });
  material.name = src.name || 'AnnaMaterial';
  return material;
}

function primitiveToMesh(gltf, bin, primitive) {
  const geometry = new T.BufferGeometry();
  const attrs = primitive.attributes || {};
  const semanticMap = {POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color'};

  for (const [semantic, target] of Object.entries(semanticMap)) {
    if (attrs[semantic] == null) continue;
    const data = readAccessor(gltf, bin, attrs[semantic]);
    geometry.setAttribute(target, new T.BufferAttribute(data.array, data.itemSize, data.normalized));
  }

  if (primitive.indices != null) {
    const data = readAccessor(gltf, bin, primitive.indices);
    geometry.setIndex(new T.BufferAttribute(data.array, 1, false));
  }
  if (!geometry.getAttribute('normal') && geometry.getAttribute('position')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = makeMaterial(gltf, primitive.material, attrs.COLOR_0 != null);
  const mesh = new T.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function parseGlb(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Anna GLB has invalid header');
  if (dv.getUint32(4, true) !== 2) throw new Error('Anna GLB must be glTF 2.0');

  let offset = 12;
  let gltf = null;
  let bin = null;
  const decoder = new TextDecoder();
  while (offset + 8 <= arrayBuffer.byteLength) {
    const length = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (type === 0x4e4f534a) {
      gltf = JSON.parse(decoder.decode(new Uint8Array(arrayBuffer, start, length)).replace(/\u0000+$/g, '').trim());
    } else if (type === 0x004e4942) {
      bin = new Uint8Array(arrayBuffer, start, length);
    }
    offset = end;
  }
  if (!gltf || !bin) throw new Error('Anna GLB is missing JSON or BIN data');

  const meshCache = new Map();
  const makeMeshGroup = meshIndex => {
    if (meshCache.has(meshIndex)) return meshCache.get(meshIndex).clone(true);
    const def = gltf.meshes[meshIndex];
    const group = new T.Group();
    group.name = def?.name || `AnnaMesh${meshIndex}`;
    for (const primitive of def?.primitives || []) group.add(primitiveToMesh(gltf, bin, primitive));
    meshCache.set(meshIndex, group);
    return group.clone(true);
  };

  const nodes = (gltf.nodes || []).map((def, i) => {
    const obj = def.mesh != null ? makeMeshGroup(def.mesh) : new T.Group();
    obj.name = def.name || obj.name || `AnnaNode${i}`;
    if (def.matrix) obj.matrix.fromArray(def.matrix).decompose(obj.position, obj.quaternion, obj.scale);
    else {
      if (def.translation) obj.position.fromArray(def.translation);
      if (def.rotation) obj.quaternion.fromArray(def.rotation);
      if (def.scale) obj.scale.fromArray(def.scale);
    }
    return obj;
  });

  (gltf.nodes || []).forEach((def, i) => {
    for (const child of def.children || []) nodes[i].add(nodes[child]);
  });

  const sceneDef = gltf.scenes?.[gltf.scene || 0] || {nodes: nodes.map((_, i) => i)};
  const root = new T.Group();
  root.name = 'Anna Ipati bundled pedestrian';
  for (const nodeIndex of sceneDef.nodes || []) root.add(nodes[nodeIndex]);
  return root;
}

async function loadBundledSource() {
  const manifestResponse = await fetch(MANIFEST_URL, {cache: 'force-cache'});
  if (!manifestResponse.ok) throw new Error(`Anna manifest HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (manifest.format !== 'glb-base64-chunks' || !Array.isArray(manifest.parts)) {
    throw new Error('Anna manifest format is not supported');
  }

  const parts = await Promise.all(manifest.parts.map(async name => {
    const response = await fetch(MODEL_BASE_URL + name, {cache: 'force-cache'});
    if (!response.ok) throw new Error(`Anna model chunk ${name} HTTP ${response.status}`);
    return response.text();
  }));

  const source = parseGlb(decodeBase64(parts.join('')));
  source.traverse(obj => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });

  source.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(source);
  const size = new T.Vector3();
  box.getSize(size);
  const scale = size.y > 0 ? 1.72 / size.y : 1;
  source.scale.setScalar(scale);
  source.updateMatrixWorld(true);
  const fitted = new T.Box3().setFromObject(source);
  source.position.y -= fitted.min.y;
  source.userData.asset = 'anna-ipati-bundled';
  return source;
}

function loadSource() {
  if (!sourcePromise) sourcePromise = loadBundledSource();
  return sourcePromise;
}

function installSourceInto(root, source, index = 0) {
  for (const child of [...root.children]) root.remove(child);
  const model = source.clone(true);
  model.rotation.y = Math.PI;
  root.add(model);
  root.userData.model = model;
  root.userData.ready = true;
  root.userData.isOriginalAnna = true;

  const baseY = model.position.y;
  root.userData.pose = (time, walk = 0) => {
    const amount = Math.max(0, Math.min(1, walk));
    const step = Math.sin(time * 6.4 + index * .9);
    model.position.y = baseY + Math.abs(step) * .018 * amount;
    model.rotation.z = step * .012 * amount;
  };
}

export function createAnnaPedestrian(index = 0) {
  const root = new T.Group();
  root.name = 'AnnaPedestrian';
  root.userData.ready = false;
  root.userData.isOriginalAnna = false;

  const fallback = makePlaceholder(index);
  root.add(fallback);
  root.userData.pose = (...args) => fallback.userData.pose?.(...args);
  liveRoots.add(root);

  loadSource()
    .then(source => installSourceInto(root, source, index))
    .catch(error => console.warn('Anna pedestrian asset failed to load; using fallback.', error));

  return root;
}

// Warm the small bundled model early so the first visible pedestrian swaps in immediately.
if (typeof window !== 'undefined') loadSource().catch(() => {});
