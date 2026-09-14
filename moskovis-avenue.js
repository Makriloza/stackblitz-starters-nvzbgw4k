import {Group, Mesh, PlaneGeometry, MeshStandardMaterial} from './three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {AVENUE, avenueSurface, signalPhase} from './moskovis-layout.js';
export async function addMoskovisAvenue(scene, manager, terrainHeight, fallbackHeight=-6) {
    const groundHeight = terrainHeight(202, -108) ?? -1.03;
    const gltf = await new GLTFLoader(manager).loadAsync(new URL('./assets/moskovis-avenue.glb',import.meta.url).href);
    const avenue = new Group();
    avenue.name = 'მოსკოვის გამზირი';
    avenue.position.set(AVENUE.x, groundHeight, AVENUE.z);
    avenue.rotation.y = AVENUE.rotation;
    avenue.add(gltf.scene);
    const signals = {};
    avenue.traverse(o => {
        if (!o.isMesh)
            return;
        o.castShadow = !['Road', 'RoadPaint', 'Ground', 'Sidewalks', 'ParkGround', 'EndpointRoadConnections'].includes(o.name);
        o.receiveShadow = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m.map)
                m.map.anisotropy = 4;
        }
        const color = {
            Signal_Red: 'red',
            Signal_Amber: 'amber',
            Signal_Green: 'green'
        }[o.name];
        if (color)
            signals[color] = o.material;
    }
    );
    scene.add(avenue);
    function surface(name, w, d, x, z, y, color) {
        const mesh = new Mesh(new PlaneGeometry(w,d),new MeshStandardMaterial({
            color,
            roughness: 1
        }));
        mesh.name = name;
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        scene.add(mesh);
        return mesh;
    }
    const floor = surface('Continuous ground', 20000, 20000, 0, 0, fallbackHeight, '#777d70');
    // End at x=219, exactly where the model's entry apron starts; no coplanar overlap.
    surface('Avenue connection', 17, 9.4, 210.5, AVENUE.z, groundHeight, '#565a59');
    let lastPhase;
    const colors = {
        red: 0xff2010,
        amber: 0xffb400,
        green: 0x08ff67
    };
    function update(time) {
        const phase = signalPhase(time);
        if (phase === lastPhase)
            return;
        lastPhase = phase;
        for (const [color,m] of Object.entries(signals)) {
            m.vertexColors = false;
            m.color.setHex(color === phase ? colors[color] : 0x161c18);
            m.emissive.setHex(colors[color]);
            m.emissiveIntensity = color === phase ? 1.6 : 0;
            m.needsUpdate = true;
        }
    }
    update(0);
    return {
        avenue,
        floor,
        groundHeight: fallbackHeight,
        heightAt: (x, z) => avenueSurface(x, z, groundHeight),
        update
    };
}
