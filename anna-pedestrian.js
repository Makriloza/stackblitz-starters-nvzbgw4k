import * as T from './three.module.js';

function mesh(geometry, material, name) {
  const m = new T.Mesh(geometry, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function createAnnaPedestrian(index = 0) {
  const root = new T.Group();
  root.name = 'AnnaPedestrian';

  const skin = new T.MeshStandardMaterial({color: 0xd9a17d, roughness: 0.72});
  const jacket = new T.MeshStandardMaterial({color: 0x243447, roughness: 0.78});
  const shirt = new T.MeshStandardMaterial({color: 0xc69678, roughness: 0.8});
  const pants = new T.MeshStandardMaterial({color: 0x303845, roughness: 0.82});
  const shoes = new T.MeshStandardMaterial({color: 0x1d1d20, roughness: 0.88});
  const hair = new T.MeshStandardMaterial({color: 0x322018, roughness: 0.9});

  const hips = mesh(new T.BoxGeometry(0.34, 0.2, 0.22), pants, 'Hips');
  hips.position.y = 0.78;
  root.add(hips);

  const torso = mesh(new T.CapsuleGeometry(0.20, 0.38, 5, 10), jacket, 'Torso');
  torso.position.y = 1.18;
  root.add(torso);

  const neck = mesh(new T.CylinderGeometry(0.065, 0.072, 0.10, 10), skin, 'Neck');
  neck.position.y = 1.47;
  root.add(neck);

  const head = mesh(new T.SphereGeometry(0.16, 16, 12), skin, 'Head');
  head.scale.set(0.92, 1.08, 0.92);
  head.position.y = 1.64;
  root.add(head);

  const hairCap = mesh(new T.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, 'Hair');
  hairCap.position.set(0, 1.70, 0.005);
  root.add(hairCap);

  const pony = mesh(new T.CapsuleGeometry(0.045, 0.20, 4, 8), hair, 'Ponytail');
  pony.position.set(0, 1.53, 0.13);
  pony.rotation.x = 0.35;
  root.add(pony);

  const eyeMat = new T.MeshBasicMaterial({color: 0x202020});
  for (const x of [-0.055, 0.055]) {
    const eye = mesh(new T.SphereGeometry(0.012, 8, 6), eyeMat, `Eye${x < 0 ? 'L' : 'R'}`);
    eye.position.set(x, 1.67, -0.145);
    root.add(eye);
  }

  const makeLeg = (side, x) => {
    const pivot = new T.Group();
    pivot.name = `Leg${side}`;
    pivot.position.set(x, 0.72, 0);
    const leg = mesh(new T.CapsuleGeometry(0.065, 0.48, 4, 8), pants, `LegMesh${side}`);
    leg.position.y = -0.28;
    pivot.add(leg);
    const shoe = mesh(new T.BoxGeometry(0.14, 0.10, 0.25), shoes, `Shoe${side}`);
    shoe.position.set(0, -0.60, -0.045);
    pivot.add(shoe);
    root.add(pivot);
    return pivot;
  };

  const legL = makeLeg('L', -0.105);
  const legR = makeLeg('R', 0.105);

  const makeArm = (side, x) => {
    const pivot = new T.Group();
    pivot.name = `Arm${side}`;
    pivot.position.set(x, 1.34, 0);
    const arm = mesh(new T.CapsuleGeometry(0.052, 0.37, 4, 8), shirt, `ArmMesh${side}`);
    arm.position.y = -0.22;
    pivot.add(arm);
    const hand = mesh(new T.SphereGeometry(0.058, 10, 8), skin, `Hand${side}`);
    hand.position.y = -0.48;
    pivot.add(hand);
    root.add(pivot);
    return pivot;
  };

  const armL = makeArm('L', -0.255);
  const armR = makeArm('R', 0.255);

  root.scale.setScalar(1.0);
  root.userData.ready = true;
  root.userData.pose = (time, walk = 0) => {
    const amount = Math.max(0, Math.min(1, walk));
    const phase = index * 0.71;
    const swing = Math.sin(time * 7 + phase) * 0.58 * amount;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.72;
    armR.rotation.x = swing * 0.72;
    pony.rotation.x = 0.35 + Math.sin(time * 5 + phase) * 0.08 * amount;
    root.position.y = Math.abs(Math.sin(time * 7 + phase)) * 0.014 * amount;
  };

  return root;
}
