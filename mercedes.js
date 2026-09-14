import {Group, Mesh, TorusGeometry, MeshStandardMaterial, MeshPhysicalMaterial, BufferGeometry, Float32BufferAttribute, DoubleSide} from './three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
let asset;
const tyreGeometry = new TorusGeometry(.345,.095,12,40);
tyreGeometry.rotateY(Math.PI / 2);
tyreGeometry.userData.shared = true;
const rubber = new MeshStandardMaterial({
    color: '#15191c',
    roughness: .94
});
export function assembleMercedes(scene) {
    scene.traverse(o => {
        if (o.isMesh)
            o.geometry.userData.shared = true;
    }
    );
    const root = new Group()
      , body = scene.clone(true);
    root.add(body);
    body.position.y = .075;
    // Follow the authored roof aperture, below its raised longitudinal rails.
    const roofGeometry = new BufferGeometry()
      , positions = []
      , indices = [];
    const sections = [[-.43, .595, 1.648], [-.28, .595, 1.679], [0, .589, 1.710], [.3, .582, 1.730], [.6, .576, 1.740], [.9, .570, 1.741], [1.18, .562, 1.737], [1.37, .558, 1.730]];
    for (const [z,w,y] of sections)
        for (let i = 0; i <= 12; i++) {
            const u = i / 6 - 1;
            positions.push(u * w, y + .012 * (1 - u * u), z);
        }
    for (let j = 0; j < sections.length - 1; j++)
        for (let i = 0; i < 12; i++) {
            const a = j * 13 + i;
            indices.push(a, a + 13, a + 1, a + 1, a + 13, a + 14);
        }
    roofGeometry.setAttribute('position', new Float32BufferAttribute(positions,3));
    roofGeometry.setIndex(indices);
    roofGeometry.computeVertexNormals();
    const roof = new Mesh(roofGeometry,new MeshPhysicalMaterial({
        color: '#202d33',
        metalness: .2,
        roughness: .24,
        clearcoat: 1,
        side: DoubleSide
    }));
    roof.name = 'Fitted panoramic roof';
    body.add(roof);
    const headlampMaterial = new MeshStandardMaterial({
        color: '#dce7ef',
        emissive: '#dceeff',
        emissiveIntensity: 0,
        roughness: .24,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });
    const brakeMaterial = new MeshStandardMaterial({
        color: '#941222',
        emissive: '#ff1727',
        emissiveIntensity: .35,
        roughness: .28,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });
    // Curved lens caps sit within the missing lens apertures, not outside the body.
    const outlines = {
        rear: [[.35, 1.145, 2.482], [.53, 1.118, 2.480], [.70, 1.112, 2.434], [.82, 1.151, 2.345], [.86, 1.213, 2.259], [.73, 1.176, 2.411], [.54, 1.182, 2.465], [.35, 1.19, 2.481]],
        front: [[.46, 1.068, -2.405], [.61, 1.033, -2.391], [.79, 1.033, -2.300], [.89, 1.095, -2.178], [.88, 1.176, -2.169], [.70, 1.179, -2.345], [.48, 1.151, -2.399]]
    };
    for (const part of ['front', 'rear'])
        for (const side of [-1, 1]) {
            const points = outlines[part].map( ([x,y,z]) => [side * x, y - (part === 'front' ? .16 : .035), z])
              , center = points.reduce( (a, p) => a.map( (v, i) => v + p[i] / points.length), [0, 0, 0])
              , positions = [];
            for (let i = 0; i < points.length; i++)
                positions.push(...center, ...points[i], ...points[(i + 1) % points.length]);
            const g = new BufferGeometry();
            g.setAttribute('position', new Float32BufferAttribute(positions,3));
            g.computeVertexNormals();
            const material = part === 'front' ? headlampMaterial : brakeMaterial;
            material.side = DoubleSide;
            const lens = new Mesh(g,material);
            lens.name = part + ' fitted lens ' + side;
            body.add(lens);
        }
    root.userData.headlampMaterial = headlampMaterial;
    root.userData.brakeMaterial = brakeMaterial;
    const wheels = [];
    for (const side of [-1, 1])
        for (const z of [-1.67, 1.49]) {
            const steer = new Group()
              , spin = new Group();
            steer.position.set(side * .91, .455, z);
            steer.add(spin);
            root.add(steer);
            const rim = body.children.find(o => o.userData.wheel === `${side}_${z}`);
            if (rim) {
                rim.removeFromParent();
                rim.position.set(-side * .91, -.38, -z);
                spin.add(rim);
            }
            const tyre = new Mesh(tyreGeometry,rubber);
            tyre.castShadow = true;
            tyre.receiveShadow = true;
            spin.add(tyre);
            wheels.push({
                steer,
                spin,
                front: z < 0,
                r: .44
            });
        }
    root.traverse(o => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    }
    );
    Object.assign(root.userData, {
        wheels,
        height: 1.895,
        halfWidth: 1.08,
        halfLength: 2.6
    });
    return root;
}
export async function loadMercedes() {
    if (!asset)
        asset = new GLTFLoader().loadAsync(new URL('./assets/mercedes-gls580.glb',import.meta.url).href).then( ({scene}) => scene).catch(e => {
            asset = null;
            throw e;
        }
        );
    return assembleMercedes(await asset);
}
