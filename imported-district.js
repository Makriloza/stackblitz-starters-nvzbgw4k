import {Group, LoadingManager, Raycaster, Vector3, Box3} from './three.module.js';
import {addMoskovisAvenue} from './moskovis-avenue.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
export async function loadDistrict(scene, _surfaces, onProgress= () => {}
) {
    const manager = new LoadingManager();
    manager.onProgress = (_url, n, total) => onProgress(n, total);
    let failed = false;
    manager.onError = () => {
        failed = true;
    }
    ;
    const base = new URL('./assets/modern/',import.meta.url);
    async function get(name) {
        const r = await fetch(new URL(name,base));
        if (!r.ok)
            throw Error('District asset unavailable');
        return r;
    }
    const [gltf,h] = await Promise.all([new GLTFLoader(manager).loadAsync(new URL('city.glb',base).href), get('height.bin').then(r => r.arrayBuffer())]);
    if (failed)
        throw Error('District textures failed');
    const root = new Group();
    root.name = 'Modern City Block';
    root.scale.setScalar(.01);
    root.position.set(100, 0, -160);
    root.add(gltf.scene);
    const remove = [];
    root.traverse(o => {
        if (!o.isMesh)
            return;
        if (o.name.startsWith('Plane061') || /^fences/i.test(o.name)) {
            remove.push(o);
            return;
        }
        o.castShadow = true;
        o.receiveShadow = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
            for (const v of Object.values(m))
                if (v?.isTexture)
                    v.anisotropy = 8;
    }
    );
    remove.forEach(o => o.removeFromParent());
    scene.add(root);
    const heights = new Float32Array(h)
      , N = 861
      , origin = -215
      , step = .5;
    const sample = (field, x, z) => {
        const u = (x - origin) / step
          , v = (z - origin) / step
          , a = Math.floor(u)
          , b = Math.floor(v);
        if (a < 0 || b < 0 || a >= N - 1 || b >= N - 1)
            return -999;
        const dx = u - a
          , dz = v - b
          , i = b * N + a
          , vs = [field[i], field[i + 1], field[i + N], field[i + N + 1]];
        if (vs.some(v => v < -900))
            return -999;
        return vs[0] * (1 - dx) * (1 - dz) + vs[1] * dx * (1 - dz) + vs[2] * (1 - dx) * dz + vs[3] * dx * dz;
    }
    ;
    const originalHeightAt = (x, z) => {
        const y = sample(heights, x, z);
        return y < -900 ? null : y;
    }
    ;
    const lowestTerrain = heights.reduce( (min, y) => Number.isFinite(y) && y > -900 ? Math.min(min, y) : min, 0);
    const addition = await addMoskovisAvenue(scene, manager, originalHeightAt, lowestTerrain - .5);
    const heightAt = (x, z) => addition.heightAt(x, z) ?? originalHeightAt(x, z);
    // Broad projected footprints included roofs and upper-floor overhangs. Test the
    // visible wall triangles at vehicle-body height instead of treating their shadows as walls.
    root.updateMatrixWorld(true);
    const walls = [];
    root.traverse(o => {
        if (o.isMesh && /^(Plane|Cube|fences|pillars)/.test(o.name) && !o.name.startsWith('Plane061'))
            walls.push({
                mesh: o,
                box: new Box3().setFromObject(o)
            });
    }
    );
    const ray = new Raycaster()
      , origin3 = new Vector3()
      , direction = new Vector3();
    function blocked(x, z, r=.3) {
        const ground = heightAt(x, z);
        if (ground === null)
            return false;
        const nearby = walls.filter( ({box: b}) => x + r >= b.min.x && x - r <= b.max.x && z + r >= b.min.z && z - r <= b.max.z && b.min.y < ground + 1.45 && b.max.y > ground + .45);
        if (!nearby.length)
            return false;
        ray.near = 0;
        ray.far = r + .04;
        for (const y of [.55, 1.25])
            for (let i = 0; i < 12; i++) {
                const angle = i * Math.PI / 6;
                origin3.set(x, ground + y, z);
                direction.set(Math.sin(angle), 0, Math.cos(angle));
                ray.set(origin3, direction);
                for (const {mesh} of nearby)
                    if (ray.intersectObject(mesh, false).length)
                        return true;
            }
        return false;
    }
    return {
        root,
        heightAt,
        blocked,
        groundHeight: addition.groundHeight,
        avenue: addition.avenue,
        update: addition.update
    };
}
