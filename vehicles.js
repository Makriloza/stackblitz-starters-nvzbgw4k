import*as T from './three.module.js';

const unitBox = new T.BoxGeometry(1,1,1)
  , sphere = new T.SphereGeometry(1,20,14);
unitBox.userData.shared = true;
sphere.userData.shared = true;
const metal = new T.MeshStandardMaterial({
    color: '#a8b7bd',
    metalness: .85,
    roughness: .24
});
const dark = new T.MeshStandardMaterial({
    color: '#152328',
    roughness: .72
});
const rubber = new T.MeshStandardMaterial({
    color: '#172023',
    roughness: .95
});
const glass = new T.MeshPhysicalMaterial({
    color: '#718d98',
    metalness: .32,
    roughness: .12,
    clearcoat: 1,
    transparent: true,
    opacity: .62,
    depthWrite: false,
    side: T.DoubleSide
});
const lamp = new T.MeshStandardMaterial({
    color: '#fff4d3',
    emissive: '#fff4d3',
    emissiveIntensity: .65,
    roughness: .2
});
const red = new T.MeshStandardMaterial({
    color: '#be302c',
    emissive: '#b3261f',
    emissiveIntensity: .3,
    roughness: .25
});
function mesh(root, geo, mat, x=0, y=0, z=0) {
    const m = new T.Mesh(geo,mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m
}
function block(root, mat, size, pos) {
    const m = mesh(root, unitBox, mat, ...pos);
    m.scale.set(...size);
    return m
}
function tube(root, a, b, r, mat) {
    const p = new T.Vector3(...a)
      , q = new T.Vector3(...b)
      , m = mesh(root, new T.CylinderGeometry(r,r,p.distanceTo(q),12), mat);
    m.position.copy(p).add(q).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0), q.sub(p).normalize());
    return m
}
function surface(root, points, mat) {
    const geo = new T.BufferGeometry()
      , positions = [];
    for (let i = 1; i < points.length - 1; i++)
        positions.push(...points[0], ...points[i], ...points[i + 1]);
    geo.setAttribute('position', new T.Float32BufferAttribute(positions,3));
    geo.computeVertexNormals();
    return mesh(root, geo, mat)
}
// Cross sections define the shoulders, beltline and narrowing nose of the body.
function bodyLoft(root, sections, mat) {
    const points = []
      , indices = []
      , count = 12;
    for (const [z,w,bottom,top] of sections) {
        const ring = [[0, top + .025], [w * .78, top], [w * .98, top - .1], [w, top - .23], [w * .95, bottom + .08], [w * .7, bottom], [-w * .7, bottom], [-w * .95, bottom + .08], [-w, top - .23], [-w * .98, top - .1], [-w * .78, top], [-w * .38, top + .02]];
        for (const [x,y] of ring)
            points.push(x, y, z)
    }
    for (let j = 0; j < sections.length - 1; j++)
        for (let i = 0; i < count; i++) {
            let a = j * count + i
              , b = j * count + (i + 1) % count
              , c = (j + 1) * count + i
              , d = (j + 1) * count + (i + 1) % count;
            indices.push(a, c, b, b, c, d)
        }
    for (const j of [0, sections.length - 1])
        for (let i = 1; i < count - 1; i++)
            indices.push(j * count, j * count + i, j * count + i + 1);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(points,3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const m = mesh(root, g, mat);
    m.material.side = T.DoubleSide;
    return m;
}
function wheel(root, x, z, r, front) {
    const steer = new T.Group();
    steer.position.set(x, r + .03, z);
    root.add(steer);
    const spin = new T.Group();
    steer.add(spin);
    const tire = mesh(spin, new T.TorusGeometry(r * .79,r * .21,12,36), rubber);
    tire.rotation.y = Math.PI / 2;
    const side = Math.sign(x)
      , rim = mesh(spin, new T.CylinderGeometry(r * .67,r * .67,.18,32), metal, side * .03, 0, 0);
    rim.rotation.z = Math.PI / 2;
    const inset = mesh(spin, new T.CylinderGeometry(r * .55,r * .55,.19,28), dark, side * .04, 0, 0);
    inset.rotation.z = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        const spoke = block(spin, metal, [.045, .065, r * .98], [side * .145, Math.sin(a) * r * .2, Math.cos(a) * r * .2]);
        spoke.rotation.x = -a;
    }
    const hub = mesh(spin, new T.CylinderGeometry(r * .16,r * .16,.27,20), metal);
    hub.rotation.z = Math.PI / 2;
    for (let i = 0; i < 24; i++) {
        const a = i * Math.PI * 2 / 24;
        const tread = block(spin, dark, [.15, .012, .05], [0, Math.cos(a) * r * .995, Math.sin(a) * r * .995]);
        tread.rotation.x = a;
    }
    root.userData.wheels.push({
        spin,
        steer,
        front,
        r
    });
}
function mergeMeshes(root) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert()
      , groups = new Map();
    for (const o of [...root.children]) {
        if (!o.isMesh)
            continue;
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
        if (!groups.has(o.material))
            groups.set(o.material, []);
        groups.get(o.material).push(g);
        o.removeFromParent();
        if (o.geometry !== unitBox && o.geometry !== sphere)
            o.geometry.dispose()
    }
    for (const [mat,parts] of groups) {
        const merged = new T.BufferGeometry();
        for (const name of ['position', 'normal']) {
            const n = parts.reduce( (sum, g) => sum + g.attributes[name].array.length, 0)
              , arr = new Float32Array(n);
            let offset = 0;
            for (const g of parts) {
                arr.set(g.attributes[name].array, offset);
                offset += g.attributes[name].array.length
            }
            merged.setAttribute(name, new T.BufferAttribute(arr,3))
        }
        merged.computeBoundingSphere();
        mesh(root, merged, mat);
        parts.forEach(g => g.dispose())
    }
}
export function createCar(type='sedan', color='#b6c2bd') {
    const root = new T.Group();
    root.userData.wheels = [];
    const sport = type === 'sport' || type === 'gt'
      , gt = type === 'gt'
      , suv = type === 'suv'
      , van = type === 'van'
      , w = sport ? 1.0 : van ? 1.03 : suv ? 1.02 : .93
      , L = sport ? 2.26 : van ? 2.52 : suv ? 2.3 : 2.25
      , h = sport ? 1.24 : van ? 2.27 : suv ? 1.79 : 1.48
      , r = sport ? .35 : suv ? .39 : van ? .37 : .34;
    const brake = red.clone();
    root.userData.brakeMaterial = brake;
    const paint = new T.MeshPhysicalMaterial({
        color,
        metalness: .45,
        roughness: .29,
        clearcoat: 1,
        clearcoatRoughness: .15,
        side: T.DoubleSide
    });
    bodyLoft(root, sport ? [[-L, w * .67, .24, .5], [-L + .14, w * .9, .25, .65], [-L + .5, w * .97, .26, .83], [-L + .95, w, .28, .87], [-.65, w * .93, .28, .83], [.5, w * .96, .28, .88], [1.18, w * 1.03, .27, .91], [L - .2, w * .98, .27, .77], [L, w * .86, .3, .66]] : [[-L, w * .78, .36, .72], [-L + .18, w * .95, .36, .91], [-L + .8, w, .37, .99], [L - .65, w, .38, 1.03], [L - .15, w * .97, .38, .91], [L, w * .83, .4, .78]], paint);
    block(root, dark, [w * 1.6, .12, L * 1.87], [0, .35, 0]);
    const baseF = van ? -1.42 : -1.05
      , roofF = van ? -1.2 : sport ? -.32 : -.45
      , roofB = van ? 1.97 : sport ? .61 : suv ? 1.15 : .85
      , baseB = van ? 2.09 : sport ? 1.68 : suv ? 1.66 : 1.54
      , roofW = w * (van ? .91 : sport ? .71 : .79);
    // Four sloped windows and pillars form a recognisable cabin rather than a box.
    surface(root, [[-w * .9, 1, baseF], [w * .9, 1, baseF], [roofW, h, roofF], [-roofW, h, roofF]], glass);
    surface(root, [[-roofW, h, roofB], [roofW, h, roofB], [w * .89, 1.02, baseB], [-w * .89, 1.02, baseB]], van ? paint : glass);
    surface(root, [[-roofW, h, roofF], [roofW, h, roofF], [roofW, h, roofB], [-roofW, h, roofB]], paint);
    for (const s of [-1, 1]) {
        surface(root, [[s * w * .93, 1.01, baseF + .1], [s * roofW, h - .055, roofF + .09], [s * roofW, h - .055, roofB - .1], [s * w * .93, 1.02, baseB - .12]], van ? paint : glass);
        tube(root, [s * w * .92, 1, baseF], [s * roofW, h, roofF], .045, paint);
        tube(root, [s * roofW, h, roofF], [s * roofW, h, roofB], .04, paint);
        tube(root, [s * roofW, h, roofB], [s * w * .91, 1.01, baseB], .055, paint);
        const pillarZ = van ? -.32 : .36;
        tube(root, [s * w * .94, 1.0, pillarZ], [s * roofW, h - .02, pillarZ], .048, dark);
        if (van)
            surface(root, [[s * w * .948, 1.07, baseF + .08], [s * roofW * 1.01, h - .11, roofF + .09], [s * roofW * 1.01, h - .11, -.43], [s * w * .948, 1.07, -.43]], glass);
        // Door gaps, handles, mirrors and rocker panel.
        for (const z of [baseF + .22, pillarZ, baseB - .13])
            tube(root, [s * w * .987, .47, z], [s * w * .99, 1, z], .009, dark);
        tube(root, [s * w * .99, .48, baseF + .22], [s * w * .99, .48, baseB - .13], .009, dark);
        block(root, metal, [.035, .045, .19], [s * w * 1.01, .93, pillarZ - .22]);
        if (!van && !sport)
            block(root, metal, [.035, .045, .18], [s * w * 1.01, .94, baseB - .32]);
        const mirror = mesh(root, sphere, paint, s * (w + .13), 1.08, baseF + .17);
        mirror.scale.set(.16, .085, .17);
        block(root, glass, [.015, .12, .19], [s * (w + .24), 1.08, baseF + .2]);
        for (const z of [-L * .61, L * .6]) {
            wheel(root, s * w * .97, z, r, z < 0);
            const arch = mesh(root, new T.TorusGeometry(r + .06,.045,8,24,Math.PI), suv ? dark : paint, s * w * 1.01, r + .03, z);
            arch.rotation.set(0, Math.PI / 2, 0);
        }
        block(root, lamp, [.5, .09, .065], [s * w * .63, .82, -L + .08]);
        block(root, lamp, [.42, .035, .075], [s * w * .62, .72, -L + .055]);
        block(root, brake, [.45, .12, .075], [s * w * .61, .86, L - .01]);
        if (suv)
            tube(root, [s * .67, h + .065, -.15], [s * .67, h + .065, 1.03], .028, metal);
    }
    block(root, dark, [w * .97, .18, .06], [0, .58, -L - .015]);
    for (let i = 0; i < 4; i++)
        block(root, metal, [w * .89, .016, .025], [0, .52 + i * .042, -L - .05]);
    const plate = new T.MeshStandardMaterial({
        color: '#ebece5',
        roughness: .35
    });
    block(root, plate, [.46, .105, .025], [0, .54, L + .02]);
    block(root, plate, [.46, .105, .025], [0, .58, -L - .061]);
    block(root, new T.MeshStandardMaterial({
        color: '#37608f'
    }), [.045, .095, .027], [-.19, .58, -L - .067]);
    // Hood seam, windscreen wipers and rear exhaust.
    for (const s of [-1, 1])
        tube(root, [s * w * .72, .946, -L + .45], [s * w * .82, 1.008, baseF], .006, dark);
    tube(root, [-.58, 1.055, baseF - .012], [-.05, 1.06, baseF - .018], .012, dark);
    tube(root, [.04, 1.058, baseF - .012], [.57, 1.063, baseF - .018], .012, dark);
    const exhaust = mesh(root, new T.CylinderGeometry(.055,.055,.2,16), metal, -.57, .37, L - .03);
    exhaust.rotation.x = Math.PI / 2;
    if (van) {
        tube(root, [0, 1.06, L - .13], [0, h - .07, L - .13], .012, dark);
        block(root, dark, [.15, .06, .035], [.18, 1.28, L - .11])
    }
    if (sport) {
        // Low front splitter, sculpted wheel shoulders, side intakes, LED signatures and diffuser.
        block(root, dark, [w * 1.9, .055, .38], [0, .24, -L + .07]);
        block(root, dark, [w * 1.7, .16, .2], [0, .33, L - .02]);
        for (const side of [-1, 1]) {
            block(root, dark, [.52, .2, .07], [side * .6, .47, -L + .015]);
            const pod = mesh(root, sphere, paint, side * .76, .72, -1.45);
            pod.scale.set(.25, .16, .5);
            const head = mesh(root, sphere, lamp, side * .73, .78, -1.86);
            head.scale.set(.18, .035, .25);
            head.rotation.x = .26;
            block(root, dark, [.06, .22, .52], [side * .985, .58, .55]);
            block(root, dark, [.08, .1, 2.8], [side * .97, .3, 0]);
            const pipe = mesh(root, new T.CylinderGeometry(.075,.075,.22,18), metal, side * .61, .34, L + .02);
            pipe.rotation.x = Math.PI / 2;
            for (const z of [-L * .61, L * .6]) {
                const caliper = block(root, new T.MeshStandardMaterial({
                    color: '#d6372a',
                    metalness: .3,
                    roughness: .35
                }), [.08, .18, .09], [side * w * .99, r + .04, z + .15]);
            }
        }
        block(root, brake, [1.62, .045, .035], [0, .8, L - .07]);
        for (let i = -2; i <= 2; i++)
            block(root, dark, [.045, .14, .3], [i * .22, .3, L - .03]);
        if (gt) {
            for (const side of [-1, 1])
                block(root, dark, [.055, .3, .08], [side * .62, 1.05, 1.77]);
            block(root, dark, [2.0, .065, .38], [0, 1.2, 1.8]);
            for (const side of [-1, 1])
                block(root, dark, [.04, .16, .42], [side * .99, 1.22, 1.8]);
        } else
            block(root, paint, [1.7, .055, .19], [0, .91, 1.9]);
    }

    // Seats, headrests, dashboard and an articulated steering wheel remain visible through glazing.
    const upholstery = new T.MeshStandardMaterial({
        color: sport ? '#382b2c' : '#29383e',
        roughness: .95
    });
    for (const side of [-1, 1]) {
        block(root, upholstery, [.55, .16, .52], [side * .43, .66, .25]);
        const back = block(root, upholstery, [.55, .49, .14], [side * .43, .95, .48]);
        back.rotation.x = -.13;
        block(root, upholstery, [.24, .2, .12], [side * .43, Math.min(h - .12, 1.24), .52]);
    }
    block(root, dark, [w * 1.62, .14, .31], [0, Math.min(h - .22, 1.16), baseF + .38]);
    const steering = new T.Group();
    steering.position.set(-.42, Math.min(h - .2, 1.17), baseF + .69);
    root.add(steering);
    const steeringRim = mesh(steering, new T.TorusGeometry(.155,.021,8,24), dark);
    block(steering, metal, [.27, .03, .03], [0, 0, 0]);
    root.userData.steeringWheel = steering;
    for (const wheel of root.userData.wheels)
        mergeMeshes(wheel.spin);
    mergeMeshes(root);
    root.userData.height = h;
    root.userData.halfWidth = w;
    root.userData.halfLength = L;
    return root;
}
export function animateCar(root, speed, steering, dt, wheelAngle=steering * .32) {
    if (root.userData.steeringWheel)
        root.userData.steeringWheel.rotation.z = steering * .8;
    for (const w of root.userData.wheels || []) {
        w.spin.rotation.x -= speed * dt / w.r;
        w.steer.rotation.y = w.front ? wheelAngle : 0
    }
}
