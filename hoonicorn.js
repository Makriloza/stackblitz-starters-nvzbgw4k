import * as T from './three.module.js';

const PARTS = [
  './assets/vehicles/hoonicorn/gz00.b64?v=1',
  './assets/vehicles/hoonicorn/gz01.b64?v=1',
  './assets/vehicles/hoonicorn/gz02.b64?v=1',
  './assets/vehicles/hoonicorn/gz03.b64?v=1'
];

function decodeBase64(text) {
  const clean = text.replace(/\s+/g, '');
  const raw = atob(clean);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support DecompressionStream');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

function componentInfo(type) {
  switch (type) {
    case 5120: return { ArrayType: Int8Array, bytes: 1, getter: 'getInt8' };
    case 5121: return { ArrayType: Uint8Array, bytes: 1, getter: 'getUint8' };
    case 5122: return { ArrayType: Int16Array, bytes: 2, getter: 'getInt16' };
    case 5123: return { ArrayType: Uint16Array, bytes: 2, getter: 'getUint16' };
    case 5125: return { ArrayType: Uint32Array, bytes: 4, getter: 'getUint32' };
    case 5126: return { ArrayType: Float32Array, bytes: 4, getter: 'getFloat32' };
    default: throw new Error('Unsupported glTF component type ' + type);
  }
}

function itemSize(type) {
  return ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 })[type] || 1;
}

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const info = componentInfo(accessor.componentType);
  const size = itemSize(accessor.type);
  const count = accessor.count;
  const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || size * info.bytes;

  if (stride === size * info.bytes && (bin.byteOffset + offset) % info.bytes === 0) {
    return {
      array: new info.ArrayType(bin.buffer, bin.byteOffset + offset, count * size),
      itemSize: size,
      normalized: !!accessor.normalized
    };
  }

  const array = new info.ArrayType(count * size);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < size; c++) {
      array[i * size + c] = dv[info.getter](offset + i * stride + c * info.bytes, true);
    }
  }
  return { array, itemSize: size, normalized: !!accessor.normalized };
}

function materialFor(gltf, index, vertexColors) {
  const src = gltf.materials?.[index] || {};
  const pbr = src.pbrMetallicRoughness || {};
  const color = pbr.baseColorFactor || [0.7, 0.7, 0.7, 1];
  const mat = new T.MeshStandardMaterial({
    color: new T.Color(color[0], color[1], color[2]),
    opacity: color[3] ?? 1,
    transparent: (color[3] ?? 1) < 0.999 || src.alphaMode === 'BLEND',
    alphaTest: src.alphaMode === 'MASK' ? (src.alphaCutoff ?? 0.5) : 0,
    metalness: pbr.metallicFactor ?? 0.25,
    roughness: pbr.roughnessFactor ?? 0.55,
    side: src.doubleSided ? T.DoubleSide : T.FrontSide,
    vertexColors
  });
  mat.name = src.name || 'HoonicornMaterial';
  return mat;
}

function buildPrimitive(gltf, bin, primitive) {
  const geometry = new T.BufferGeometry();
  const attrs = primitive.attributes || {};
  const map = { POSITION: 'position', NORMAL: 'normal', COLOR_0: 'color', TEXCOORD_0: 'uv' };

  for (const [semantic, name] of Object.entries(map)) {
    if (attrs[semantic] == null) continue;
    const a = readAccessor(gltf, bin, attrs[semantic]);
    geometry.setAttribute(name, new T.BufferAttribute(a.array, a.itemSize, a.normalized));
  }

  if (primitive.indices != null) {
    const idx = readAccessor(gltf, bin, primitive.indices);
    geometry.setIndex(new T.BufferAttribute(idx.array, 1));
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new T.Mesh(geometry, materialFor(gltf, primitive.material, attrs.COLOR_0 != null));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function parseGlb(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) {
    throw new Error('Invalid Hoonicorn GLB');
  }

  let offset = 12;
  let gltf;
  let bin;
  const decoder = new TextDecoder();
  while (offset + 8 <= buffer.byteLength) {
    const length = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      gltf = JSON.parse(decoder.decode(new Uint8Array(buffer, start, length)).replace(/\u0000+$/g, '').trim());
    } else if (type === 0x004e4942) {
      bin = new Uint8Array(buffer, start, length);
    }
    offset = start + length;
  }
  if (!gltf || !bin) throw new Error('Hoonicorn GLB is incomplete');

  const nodes = (gltf.nodes || []).map((def, i) => {
    const obj = new T.Group();
    obj.name = def.name || `HoonicornNode${i}`;
    if (def.mesh != null) {
      const meshDef = gltf.meshes[def.mesh];
      for (const primitive of meshDef?.primitives || []) obj.add(buildPrimitive(gltf, bin, primitive));
    }
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

  const sceneDef = gltf.scenes?.[gltf.scene || 0] || { nodes: nodes.map((_, i) => i) };
  const root = new T.Group();
  for (const i of sceneDef.nodes || []) root.add(nodes[i]);
  return root;
}

function fitToGame(root) {
  root.updateMatrixWorld(true);
  let box = new T.Box3().setFromObject(root);
  const size = new T.Vector3();
  box.getSize(size);

  // Hoonicorn target length is roughly 4.7 m in the game world.
  const scale = size.z > 0 ? 4.7 / size.z : 1;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  box = new T.Box3().setFromObject(root);
  const center = new T.Vector3();
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;

  // Game vehicles point toward negative Z.
  root.rotation.y = Math.PI;
  root.updateMatrixWorld(true);
  root.userData.wheels = [];
  root.userData.sharedAsset = true;
  root.name = 'Hoonicorn Ken Block';
  return root;
}

let sourcePromise;
async function loadSource() {
  if (!sourcePromise) {
    sourcePromise = (async () => {
      const responses = await Promise.all(PARTS.map(url => fetch(url, { cache: 'no-store' })));
      for (const response of responses) {
        if (!response.ok) throw new Error('Hoonicorn asset HTTP ' + response.status);
      }
      const text = (await Promise.all(responses.map(r => r.text()))).join('');
      const compressed = decodeBase64(text);
      const glb = await gunzip(compressed);
      return fitToGame(parseGlb(glb));
    })();
  }
  return sourcePromise;
}

export async function loadHoonicorn() {
  const source = await loadSource();
  const car = source.clone(true);
  car.name = 'Hoonicorn Ken Block';
  car.userData.wheels = [];
  car.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return car;
}
