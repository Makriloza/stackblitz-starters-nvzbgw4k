import {
  Group,
  Mesh,
  PlaneGeometry,
  BoxGeometry,
  MeshStandardMaterial,
  InstancedMesh,
  Object3D,
  Color
} from './three.module.js';
import layout from './modern-layout.js';

function makeRoadList() {
  const roads = layout.roads.map(([a, b, width, name, id]) => ({
    a: layout.nodes[a],
    b: layout.nodes[b],
    width,
    name,
    id
  }));
  const avenue = [
    [[202, -110], [202, -108]],
    [[202, -108], [219, -108]],
    [[219, -108], [222, -108]],
    [[222, -108], [282, -108]],
    [[282, -108], [342, -108]]
  ];
  avenue.forEach((p, i) => roads.push({ a: p[0], b: p[1], width: 9.4, name: 'მოსკოვის გამზირი', id: 2000 + i }));
  return roads;
}

function pointSegmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const d2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / d2));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

export async function loadDistrict(scene, _surfaces, onProgress = () => {}) {
  onProgress(1, 3);
  const root = new Group();
  root.name = 'Procedural Tbilisi District';

  const ground = new Mesh(
    new PlaneGeometry(1200, 1200),
    new MeshStandardMaterial({ color: '#6f7868', roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  root.add(ground);

  const roads = makeRoadList();
  const dummy = new Object3D();
  const roadGeo = new BoxGeometry(1, 1, 1);
  const roadMat = new MeshStandardMaterial({ color: '#4d5355', roughness: 0.96 });
  const sidewalkMat = new MeshStandardMaterial({ color: '#a6aaa3', roughness: 1 });
  const sidewalks = new InstancedMesh(roadGeo, sidewalkMat, roads.length);
  const asphalt = new InstancedMesh(roadGeo, roadMat, roads.length);

  roads.forEach((r, i) => {
    const [ax, az] = r.a, [bx, bz] = r.b;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const angle = -Math.atan2(dz, dx);
    dummy.position.set((ax + bx) / 2, -0.015, (az + bz) / 2);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(len, 0.05, r.width + 2.8);
    dummy.updateMatrix();
    sidewalks.setMatrixAt(i, dummy.matrix);

    dummy.position.y = 0.025;
    dummy.scale.set(len, 0.06, r.width);
    dummy.updateMatrix();
    asphalt.setMatrixAt(i, dummy.matrix);
  });
  sidewalks.receiveShadow = true;
  asphalt.receiveShadow = true;
  root.add(sidewalks, asphalt);
  onProgress(2, 3);

  const buildingGeo = new BoxGeometry(1, 1, 1);
  const buildingMat = new MeshStandardMaterial({ color: '#c9c3b7', roughness: 0.88 });
  const candidates = [];
  for (let x = -185; x <= 330; x += 24) {
    for (let z = -185; z <= 185; z += 24) {
      let nearest = Infinity;
      for (const r of roads) {
        nearest = Math.min(nearest, pointSegmentDistance(x, z, r.a, r.b) - r.width / 2);
        if (nearest < 8) break;
      }
      if (nearest < 8) continue;
      const h = 8 + (Math.abs((x * 17 + z * 31) % 23));
      const w = 10 + (Math.abs((x + z) % 7));
      const d = 10 + (Math.abs((x - z) % 7));
      candidates.push({ x, z, h, w, d });
    }
  }
  const buildings = new InstancedMesh(buildingGeo, buildingMat, candidates.length);
  const palette = ['#c9c3b7', '#b8b0a3', '#d6d0c5', '#aeb7ba', '#c2b6aa'];
  candidates.forEach((b, i) => {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.rotation.set(0, ((b.x + b.z) % 5) * 0.08, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    buildings.setColorAt(i, new Color(palette[Math.abs((b.x + b.z) | 0) % palette.length]));
  });
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  root.add(buildings);

  scene.add(root);
  onProgress(3, 3);

  return {
    root,
    heightAt: () => 0,
    blocked: () => false,
    groundHeight: 0,
    avenue: root,
    update: () => {}
  };
}
