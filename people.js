import*as T from './three.module.js';
const mats = new Map();
function mat(c) {
    if (!mats.has(c))
        mats.set(c, new T.MeshStandardMaterial({
            color: c,
            roughness: .85
        }));
    return mats.get(c)
}
function ellipsoid(g, x, y, z, sx, sy, sz, c) {
    const m = new T.Mesh(new T.SphereGeometry(1,16,12),mat(c));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
    return m
}
function segment(g, x, y, z, r1, r2, length, c) {
    const m = new T.Mesh(new T.CylinderGeometry(r1,r2,length,12),mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m
}
function block(g, pos, size, c) {
    const m = new T.Mesh(new T.BoxGeometry(...size),mat(c));
    m.position.set(...pos);
    m.castShadow = true;
    g.add(m);
    return m
}
export function createBag() {
    const g = new T.Group();
    block(g, [0, 0, 0], [.31, .37, .2], '#b18b50');
    block(g, [0, .18, 0], [.32, .035, .21], '#c6a56c');
    block(g, [0, 0, -.106], [.14, .12, .008], '#f8d446');
    for (const x of [-.08, .08]) {
        const h = new T.Mesh(new T.TorusGeometry(.055,.007,6,12,Math.PI),mat('#5c503c'));
        h.position.set(x, .2, 0);
        g.add(h)
    }
    return g
}
// Merge only rigid meshes attached to each joint; articulated groups remain intact.
function mergeJointMeshes(group) {
    for (const child of [...group.children])
        if (child.isGroup)
            mergeJointMeshes(child);
    const buckets = new Map();
    for (const child of [...group.children])
        if (child.isMesh) {
            child.updateMatrix();
            const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
            geometry.applyMatrix4(child.matrix);
            if (!buckets.has(child.material))
                buckets.set(child.material, []);
            buckets.get(child.material).push(geometry);
            child.removeFromParent();
            child.geometry.dispose();
        }
    for (const [material,parts] of buckets) {
        const geometry = new T.BufferGeometry();
        for (const attribute of ['position', 'normal', 'uv']) {
            const size = attribute === 'uv' ? 2 : 3
              , values = new Float32Array(parts.reduce( (n, g) => n + g.attributes[attribute].array.length, 0));
            let offset = 0;
            for (const g of parts) {
                values.set(g.attributes[attribute].array, offset);
                offset += g.attributes[attribute].array.length
            }
            geometry.setAttribute(attribute, new T.BufferAttribute(values,size));
        }
        geometry.computeBoundingSphere();
        const mesh = new T.Mesh(geometry,material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        parts.forEach(g => g.dispose());
    }
}
export function createPerson(index=0, courier=false) {
    const root = new T.Group()
      , skin = ['#bc8e70', '#d3a182', '#a77557'][index % 3]
      , shirt = courier ? '#39715c' : ['#496e84', '#aa7360', '#788363', '#c0b498'][index % 4]
      , pants = ['#334451', '#514e47', '#3f5061'][index % 3];
    ellipsoid(root, 0, 1.21, 0, .205, .285, .13, shirt);
    ellipsoid(root, 0, 1.405, 0, .235, .085, .13, shirt);
    ellipsoid(root, 0, .97, 0, .19, .12, .13, pants);
    segment(root, 0, 1.5, 0, .066, .073, .13, skin);
    ellipsoid(root, 0, 1.67, -.018, .11, .145, .108, skin);
    ellipsoid(root, 0, 1.77, .008, .114, .064, .101, '#3d3531');
    for (const s of [-1, 1]) {
        ellipsoid(root, s * .109, 1.666, 0, .021, .039, .022, skin);
        ellipsoid(root, s * .041, 1.69, -.113, .023, .012, .006, '#f0e7dc');
        ellipsoid(root, s * .041, 1.69, -.119, .009, .01, .004, '#34332e');
        block(root, [s * .04, 1.713, -.115], [.047, .009, .009], '#554337')
    }
    ellipsoid(root, 0, 1.652, -.123, .017, .028, .019, skin);
    block(root, [0, 1.614, -.115], [.045, .006, .005], '#86564a');
    const limbs = {};
    for (const [label,s] of [['left', -1], ['right', 1]]) {
        const arm = new T.Group();
        arm.position.set(s * .235, 1.415, 0);
        root.add(arm);
        ellipsoid(arm, 0, -.025, 0, .071, .085, .072, shirt);
        segment(arm, 0, -.145, 0, .067, .054, .29, shirt);
        ellipsoid(arm, 0, -.29, 0, .054, .055, .054, skin);
        const forearm = new T.Group();
        forearm.position.y = -.29;
        arm.add(forearm);
        segment(forearm, 0, -.123, 0, .048, .032, .246, skin);
        const hand = new T.Group();
        hand.position.y = -.28;
        forearm.add(hand);
        ellipsoid(hand, 0, 0, 0, .038, .065, .025, skin);
        ellipsoid(hand, s * .032, .007, -.012, .014, .032, .017, skin);
        const leg = new T.Group();
        leg.position.set(s * .102, .92, 0);
        root.add(leg);
        segment(leg, 0, -.205, 0, .092, .065, .41, pants);
        const knee = new T.Group();
        knee.position.y = -.41;
        leg.add(knee);
        segment(knee, 0, -.195, 0, .063, .042, .39, pants);
        ellipsoid(knee, 0, -.397, -.065, .07, .061, .125, '#293334');
        limbs[label] = {
            arm,
            forearm,
            hand,
            leg,
            knee
        };
    }
    if (courier) {
        block(root, [0, 1.2, .24], [.44, .48, .24], '#ebc93b');
        block(root, [0, 1.46, .24], [.45, .035, .25], '#ffe06a');
        for (const s of [-1, 1])
            block(root, [s * .145, 1.23, -.15], [.035, .41, .024], '#d3b32f')
    }
    root.name = 'Pedestrian';
    root.scale.setScalar(.94 + (index % 5) * .025);
    root.userData.limbs = limbs;
    root.userData.rightHand = limbs.right.hand;
    root.userData.pose = (time, walk=0, reach=0) => {
        for (const [name,s] of [['left', -1], ['right', 1]]) {
            const l = limbs[name]
              , swing = Math.sin(time * 7) * s * walk;
            l.leg.rotation.x = swing * .55;
            l.knee.rotation.x = -Math.max(0, -swing) * .75;
            l.arm.rotation.x = -swing * .42 + reach * 1.12;
            l.forearm.rotation.x = .08 + reach * .32;
        }
        root.position.y = walk * Math.abs(Math.sin(time * 7)) * .018
    }
    ;
    root.userData.pose(0);
    mergeJointMeshes(root);
    return root;
}
