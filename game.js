import {createMobileControls} from './mobile-controls.js';
import*as T from './three.module.js';
import {createCameraOrbit} from './camera-orbit.js';
import {createCar, animateCar} from './vehicles.js';
import {loadMercedes} from './mercedes.js';
import {createPerson, createBag} from './people.js';
import {VEHICLES, SHOPS, HOMES, START, DISTRICT, SEGMENTS, nearestStreet, route, routeLength, canInteract, blocked, formatDistance} from './logic.js';
import {onAvenue} from './moskovis-layout.js';
import {loadDistrict} from './imported-district.js';
import {createPedestrianSystem} from './street-life.js';
import {RealMap} from './real-map.js';
import {stepDriving, cameraHeight} from './driving.js';
import {createCockpit} from './cockpit.js';
import {loadCareer, saveCareer, orderChallenge, completeChallenge} from './career.js';
import {GameSound} from './sound.js';
import {lanePosition} from './traffic-system.js';
import {createRenderBudget} from './render-budget.js';
const $ = id => document.getElementById(id)
  , canvas = $('world');
let renderer;
try {
    renderer = new T.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
    })
} catch (e) {
    $('load').innerHTML = '3D გრაფიკა ვერ ჩაირთო.<br>გახსენი თამაში WebGL-ის მხარდაჭერის მქონე ბრაუზერში.';
    throw e
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = T.SRGBColorSpace;
const scene = new T.Scene();
scene.background = new T.Color('#b9d5d8');
scene.fog = new T.FogExp2('#b9d5d8',.00125);
const camera = new T.PerspectiveCamera(57,innerWidth / innerHeight,.1,1800);
scene.add(camera);
const cockpit = createCockpit(camera)
  , sound = new GameSound();
addEventListener('pointerdown', () => sound.start());
addEventListener('keydown', () => sound.start());
const hemi = new T.HemisphereLight('#d9f0ff','#998c67',1.7);
scene.add(hemi);
const sun = new T.DirectionalLight('#ffe4b3',3.2);
sun.position.set(-110, 160, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
    left: -75,
    right: 75,
    top: 75,
    bottom: -75,
    near: 1,
    far: 600
});
sun.shadow.bias = -.00035;
sun.shadow.normalBias = .04;
scene.add(sun, sun.target);
const clock = new T.Clock()
  , colliders = []
  , batches = new Map()
  , materials = new Map()
  , dummy = new T.Object3D();
const geo = {
    box: new T.BoxGeometry(1,1,1),
    cyl: new T.CylinderGeometry(1,1,1,10),
    cone: new T.ConeGeometry(1,1,12),
    sphere: new T.SphereGeometry(1,12,8)
};
function material(color) {
    if (!materials.has(color))
        materials.set(color, new T.MeshStandardMaterial({
            color,
            roughness: .85,
            metalness: color === '#293e43' ? .35 : 0
        }));
    return materials.get(color)
}
function inst(type, x, y, z, sx, sy, sz, color, ry=0, rz=0) {
    let key = type + '|' + color;
    if (!batches.has(key))
        batches.set(key, []);
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    batches.get(key).push(dummy.matrix.clone())
}
const box = (w, h, d, x, y, z, c, ry=0) => inst('box', x, y, z, w, h, d, c, ry);
const cyl = (r, h, x, y, z, c) => inst('cyl', x, y, z, r, h, r, c);
const ball = (r, x, y, z, c, s=1) => inst('sphere', x, y, z, r, r * s, r, c);
function flush() {
    for (const [key,mats] of batches) {
        const [type,color] = key.split('|');
        let mesh = new T.InstancedMesh(geo[type],material(color),mats.length);
        mats.forEach( (mat, i) => mesh.setMatrixAt(i, mat));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        scene.add(mesh)
    }
    batches.clear()
}
let seed = 217;
function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296
}
function textTexture(text, bg='#1e594f', color='#f9ecce', w=1024, h=160) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = color;
    ctx.font = 'bold 66px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2, w - 65);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex
}
function sign(text, x, y, z, w=8, angle=0, bg) {
    const p = new T.Mesh(new T.PlaneGeometry(w,w * .15625),new T.MeshStandardMaterial({
        map: textTexture(text, bg),
        roughness: .65,
        emissive: '#ffffff',
        emissiveIntensity: .12
    }));
    p.position.set(x, y, z);
    p.rotation.y = angle;
    scene.add(p);
    return p
}
const surfaces = null;
let importedDistrict;
$('load').textContent = 'ახალი უბანი იტვირთება…';
try {
    importedDistrict = await loadDistrict(scene, surfaces, (loaded, total) => {
        $('load').textContent = 'ახალი უბანი იტვირთება… ' + loaded + ' / ' + total;
    }
    );
} catch (error) {
    $('load').textContent = 'უბანი ვერ ჩაიტვირთა. შეამოწმე ინტერნეტი და სცადე ხელახლა.';
    const retry = document.createElement('button');
    retry.textContent = 'ხელახლა ცდა';
    retry.onclick = () => location.reload();
    $('load').append(retry);
    throw error;
}
for (const stop of [...SHOPS, ...HOMES]) {
    const dx = stop.curb.x - stop.x
      , dz = stop.curb.z - stop.z;
    for (const side of [1, -1]) {
        const x = stop.x + dx * side
          , z = stop.z + dz * side;
        if (importedDistrict.heightAt(x, z) !== null && !importedDistrict.blocked(x, z, .4)) {
            stop.curb = {
                x,
                z
            };
            break;
        }
    }
}
const renderBudget = createRenderBudget(renderer, scene, sun);
// Detailed vehicle assemblies; front points towards negative Z.
function part(parent, shape, size, pos, color, rotation=[0, 0, 0]) {
    const m = new T.Mesh(shape === 'wheel' ? new T.CylinderGeometry(1,1,1,20) : shape === 'ball' ? new T.SphereGeometry(1,16,12) : shape === 'tube' ? new T.CylinderGeometry(1,1,1,12) : geo.box,material(color));
    m.scale.set(...size);
    m.position.set(...pos);
    m.rotation.set(...rotation);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m
}
function link(parent, a, b, r, color) {
    const aa = new T.Vector3(...a)
      , bb = new T.Vector3(...b)
      , mid = aa.clone().add(bb).multiplyScalar(.5);
    const m = part(parent, 'tube', [r, aa.distanceTo(bb), r], mid.toArray(), color);
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0), bb.sub(aa).normalize());
    return m
}
// Merge rigid assemblies by material to reduce draw calls on phones.
function mergeRigid(root) {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert()
      , groups = new Map()
      , old = [];
    root.traverse(o => {
        if (!o.isMesh)
            return;
        let geom = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        geom.applyMatrix4(inv.clone().multiply(o.matrixWorld));
        const key = o.material.uuid;
        if (!groups.has(key))
            groups.set(key, {
                mat: o.material,
                geoms: []
            });
        groups.get(key).geoms.push(geom);
        old.push(o)
    }
    );
    for (const mesh of old) {
        mesh.removeFromParent();
        if (mesh.geometry !== geo.box)
            mesh.geometry.dispose()
    }
    for (const {mat, geoms} of groups.values()) {
        const merged = new T.BufferGeometry();
        for (const attr of ['position', 'normal', 'uv']) {
            if (!geoms.every(g => g.getAttribute(attr)))
                continue;
            const len = geoms.reduce( (n, g) => n + g.getAttribute(attr).array.length, 0)
              , arr = new Float32Array(len);
            let offset = 0;
            for (const g of geoms) {
                arr.set(g.getAttribute(attr).array, offset);
                offset += g.getAttribute(attr).array.length
            }
            merged.setAttribute(attr, new T.BufferAttribute(arr,attr === 'uv' ? 2 : 3))
        }
        merged.computeBoundingSphere();
        const mesh = new T.Mesh(merged,mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        geoms.forEach(g => g.dispose())
    }
    root.userData.wheels = [];
    return root
}
function human(parent, y=0, courier=true) {
    const g = new T.Group();
    g.position.y = y;
    parent.add(g);
    part(g, 'ball', [.23, .27, .22], [0, 1.47, 0], '#c59572');
    part(g, 'ball', [.25, .17, .25], [0, 1.65, .01], courier ? '#e7c345' : '#554c3f');
    part(g, 'box', [.28, .06, .18], [0, 1.59, -.19], '#33454a');
    part(g, 'ball', [.32, .44, .22], [0, 1.01, .03], courier ? '#35685e' : '#526982');
    link(g, [-.25, 1.23, 0], [-.4, .92, -.32], .085, '#35685e');
    link(g, [.25, 1.23, 0], [.4, .92, -.32], .085, '#35685e');
    link(g, [-.4, .92, -.32], [-.35, .85, -.62], .065, '#c59572');
    link(g, [.4, .92, -.32], [.35, .85, -.62], .065, '#c59572');
    link(g, [-.15, .7, .06], [-.24, .36, -.32], .115, '#33454c');
    link(g, [.15, .7, .06], [.24, .36, -.32], .115, '#33454c');
    link(g, [-.24, .36, -.32], [-.24, .05, .05], .085, '#33454c');
    link(g, [.24, .36, -.32], [.24, .05, .05], .085, '#33454c');
    part(g, 'box', [.19, .13, .35], [-.24, .03, -.06], '#273639');
    part(g, 'box', [.19, .13, .35], [.24, .03, -.06], '#273639');
    if (courier) {
        part(g, 'box', [.66, .72, .42], [0, 1.09, .39], '#efc737');
        part(g, 'box', [.7, .07, .45], [0, 1.47, .39], '#f9da5b');
        part(g, 'box', [.45, .14, .02], [0, 1.15, .61], '#fff0ad');
        part(g, 'box', [.05, .63, .02], [-.22, 1.08, .62], '#b49738');
        part(g, 'box', [.05, .63, .02], [.22, 1.08, .62], '#b49738')
    }
    return g
}
function vehicle(type, color='#bdc5bc', npc=false) {
    if (!['bike', 'moped'].includes(type))
        return createCar(type, color);
    let g = new T.Group()
      , wheels = [];
    if (type === 'bike' || type === 'moped') {
        const bike = type === 'bike'
          , r = bike ? .37 : .28;
        for (const z of [-.78, .75]) {
            let w = part(g, 'wheel', [r, .13, r], [0, r, z], '#263338', [0, 0, Math.PI / 2]);
            wheels.push(w);
            part(g, 'wheel', [r * .76, .14, r * .76], [0, r, z], bike ? '#98a8a2' : '#52666b', [0, 0, Math.PI / 2]);
            part(g, 'wheel', [r * .67, .15, r * .67], [0, r, z], '#35484a', [0, 0, Math.PI / 2]);
            if (bike)
                for (let a = 0; a < Math.PI; a += Math.PI / 5) {
                    let sy = Math.sin(a) * r * .74
                      , sz = Math.cos(a) * r * .74;
                    link(g, [.085, r - sy, z - sz], [.085, r + sy, z + sz], .009, '#b2bcb4')
                }
        }
        if (bike) {
            for (const [a,b] of [[[0, .36, .75], [0, .72, .17]], [[0, .72, .17], [0, .38, 0]], [[0, .38, 0], [0, .36, .75]], [[0, .72, .17], [0, .95, -.52]], [[0, .95, -.52], [0, .38, 0]], [[0, .95, -.52], [0, .37, -.78]]])
                link(g, a, b, .035, '#dfb832');
            part(g, 'box', [.23, .08, .32], [0, .85, .15], '#283939')
        } else {
            part(g, 'ball', [.29, .28, .55], [0, .52, .13], '#e6e8d9');
            part(g, 'box', [.36, .15, .73], [0, .78, .27], '#354346');
            part(g, 'box', [.42, .63, .2], [0, .64, -.5], '#ccd5c7');
            part(g, 'ball', [.2, .16, .13], [0, 1.07, -.62], '#e8dfb8');
            link(g, [0, .3, -.78], [0, 1.13, -.59], .045, '#5c6b67');
            part(g, 'box', [.34, .1, .03], [0, .57, .7], '#c66149')
        }
        link(g, [-.4, 1.12, -.58], [.4, 1.12, -.58], .035, '#273c3d');
        const rider = createPerson(0, true);
        rider.position.set(0, -.07, .18);
        for (const l of Object.values(rider.userData.limbs)) {
            l.leg.rotation.x = 1.25;
            l.knee.rotation.x = -1.55;
            l.arm.rotation.x = 1.18;
            l.forearm.rotation.x = .13;
        }
        g.add(rider);
        g.userData.rider = rider;
        for (const side of [-1, 1]) {
            link(g, [side * .3, 1.12, -.58], [side * .45, 1.41, -.53], .015, '#4d6460');
            part(g, 'ball', [.1, .06, .04], [side * .45, 1.41, -.53], '#a5bcc1')
        }
    }
    g.userData.wheels = wheels;
    if (g.userData.rider) {
        const rider = g.userData.rider;
        rider.removeFromParent();
        mergeRigid(g);
        g.add(rider);
        return g
    }
    return mergeRigid(g)
}
const player = new T.Group();
scene.add(player);
player.position.set(START.x, importedDistrict.heightAt(START.x, START.z) ?? 0, START.z);
let currentVehicle = 'sedan'
  , model = vehicle(currentVehicle);
player.add(model);
let directionLock = 0;
let steering = 0;
let speed = 0
  , heading = DISTRICT.heading
  , paused = false
  , cameraMode = 'chase'
  , runningTime = 0
  , total = 0
  , delivered = 0
  , stage = 'idle'
  , order = null
  , orderIndex = 0
  , toastTimer = 0
  , lastSafe = {
    x: START.x,
    z: START.z
};
let touchControls;
const orbit = createCameraOrbit(canvas, () => !paused && stage !== 'handoff' && !$('settings').open);
let storage;
try {
    storage = localStorage;
} catch {
    storage = {
        getItem: () => null,
        setItem: () => {}
    };
}
const career = loadCareer(storage);
total = career.total;
delivered = career.delivered;
orderIndex = delivered;
function save() {
    career.total = total;
    career.delivered = delivered;
    saveCareer(storage, career);
}
function renderGarage() {
    document.querySelectorAll('[data-vehicle]').forEach(button => {
        const type = button.dataset.vehicle;
        button.classList.remove('locked');
        button.querySelector('small').textContent = VEHICLES[type].name;
        button.setAttribute('aria-label', VEHICLES[type].name);
    }
    );
}
renderGarage();
save();
function toast(s) {
    $('toast').textContent = s;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout( () => $('toast').classList.remove('show'), 3400)
}
let vehicleRequest = 0;
async function changeVehicle(type) {
    const request = ++vehicleRequest;
    if (stage === 'handoff') {
        toast('დაელოდე შეკვეთის გადაცემას.');
        return
    }
    if (Math.abs(speed) > .5) {
        toast('ტრანსპორტის შესაცვლელად ჯერ გაჩერდი.');
        return
    }
    let importedModel;
    if (type === 'gls') {
        toast('Mercedes GLS 580 იტვირთება…');
        try {
            importedModel = await loadMercedes();
        } catch {
            toast('Mercedes ვერ ჩაიტვირთა. ხელახლა სცადე.');
            return;
        }
        if (request !== vehicleRequest)
            return;
        if (Math.abs(speed) > .5 || stage === 'handoff') {
            toast('Mercedes მზადაა — გასაჩერებლად დაამუხრუჭე და ხელახლა აირჩიე.');
            return;
        }
    }
    player.remove(model);
    model.traverse(o => {
        if (o.isMesh && o.geometry !== geo.box && !o.geometry.userData.shared)
            o.geometry.dispose()
    }
    );
    currentVehicle = type;
    model = importedModel || vehicle(type, type === 'suv' ? '#355458' : type === 'van' ? '#dedbcc' : type === 'sport' ? '#e84435' : type === 'gt' ? '#428cd6' : '#bbc5bd');
    player.add(model);
    $('vehicleName').textContent = VEHICLES[type].name;
    document.querySelectorAll('[data-vehicle]').forEach(b => {
        b.classList.toggle('selected', b.dataset.vehicle === type);
        b.setAttribute('aria-pressed', b.dataset.vehicle === type)
    }
    );
    document.dispatchEvent(new Event('vehicle-selected'));
    toast(VEHICLES[type].name + ' არჩეულია')
}
document.querySelectorAll('[data-vehicle]').forEach(b => b.onclick = () => changeVehicle(b.dataset.vehicle));
const traffic = [];
for (let i = 0; i < 10; i++) {
    const g = vehicle(i % 5 === 0 ? 'van' : 'sedan', ['#c6c4b6', '#7b9896', '#b37455', '#586779', '#e5ddd0'][i % 5], true);
    scene.add(g);
    const path = route(SHOPS[i % 8], HOMES[(i + 2) % 8]);
    const startIndex = i < 8 ? 0 : Math.min(25, path.length - 2)
      , spawn = lanePosition(path[startIndex], path[startIndex + 1]);
    g.position.set(spawn.x, importedDistrict.heightAt(spawn.x, spawn.z) ?? 0, spawn.z);
    g.rotation.y = Math.atan2(path[startIndex].x - path[startIndex + 1].x, path[startIndex].z - path[startIndex + 1].z);
    traffic.push({
        g,
        path,
        step: startIndex + 1,
        speed: 5 + i % 4,
        currentSpeed: 0
    })
}
const pedestrians = createPedestrianSystem(scene, importedDistrict);
const signals = {
    update() {},
    stopDistance() {
        return Infinity;
    }
};
const headlights = [];
for (const side of [-1, 1]) {
    const light = new T.SpotLight(0xffedca,0,70,.42,.65,1.3);
    light.position.set(side * .65, .85, -2.1);
    light.target.position.set(side * .65, .15, -32);
    player.add(light, light.target);
    headlights.push(light);
}
// Destination halo and floating parcel marker.
const marker = new T.Group();
scene.add(marker);
const ring = new T.Mesh(new T.RingGeometry(3.5,4.1,64),new T.MeshBasicMaterial({
    color: '#ffdc4a',
    side: T.DoubleSide,
    transparent: true,
    opacity: .85
}));
ring.rotation.x = -Math.PI / 2;
ring.position.y = .047;
marker.add(ring);
const parcel = part(marker, 'box', [.9, .9, .9], [0, 4.6, 0], '#ffd13c');
part(marker, 'box', [.18, .94, .92], [0, 4.6, 0], '#fff1b7');
const pole = new T.Mesh(new T.CylinderGeometry(.08,.08,4,8),new T.MeshBasicMaterial({
    color: '#ffe680',
    transparent: true,
    opacity: .45
}));
pole.position.y = 2;
marker.add(pole);
marker.visible = false;
// Articulated recipients wait on the pavement and physically receive the parcel.
const customers = HOMES.map( (home, i) => {
    const actor = createPerson(i);
    actor.position.set(home.curb.x, (importedDistrict.heightAt(home.curb.x, home.curb.z) ?? 0) + .04, home.curb.z);
    actor.rotation.y = Math.PI / 2;
    actor.visible = false;
    scene.add(actor);
    return {
        actor,
        home,
        curb: actor.position.clone()
    }
}
);
const deliveryCourier = createPerson(0, true);
deliveryCourier.visible = false;
scene.add(deliveryCourier);
const deliveryBag = createBag();
const extraBag = createBag();
extraBag.position.x = .27;
extraBag.scale.setScalar(.85);
extraBag.visible = false;
deliveryBag.add(extraBag);
deliveryBag.visible = false;
scene.add(deliveryBag);
let recipient = null
  , handoff = null;
function showCustomer() {
    extraBag.visible = order.challenge.kind === 'large';
    customers.forEach(c => c.actor.visible = false);
    recipient = customers.find(c => c.home === order.home);
    recipient.actor.position.copy(recipient.curb);
    recipient.actor.visible = true;
    recipient.actor.userData.pose(0);
    deliveryBag.visible = false;
    scene.attach(deliveryBag)
}
function face(actor, p) {
    const dx = p.x - actor.position.x
      , dz = p.z - actor.position.z;
    actor.rotation.y = Math.atan2(-dx, -dz)
}
function handPosition(actor) {
    actor.updateMatrixWorld(true);
    return actor.userData.rightHand.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,-.17,0))
}
function beginHandoff() {
    speed = 0;
    clearKeys();
    stage = 'handoff';
    $('orders').classList.remove('expanded');
    $('orderDetails').setAttribute('aria-expanded', 'false');
    const toward = recipient.curb.clone().sub(player.position).setY(0).normalize();
    const hw = model.userData.halfWidth || .42
      , hl = model.userData.halfLength || .9;
    const side = new T.Vector3(Math.cos(heading),0,-Math.sin(heading))
      , front = new T.Vector3(-Math.sin(heading),0,-Math.cos(heading));
    const candidates = [toward, side.clone().multiplyScalar(Math.sign(side.dot(toward)) || 1), front, front.clone().negate()];
    let courierSpot = null
      , dir = toward;
    for (const d of candidates) {
        const clearance = Math.abs(d.dot(side)) * hw + Math.abs(d.dot(front)) * hl + .65;
        const p = player.position.clone().addScaledVector(d, clearance);
        courierSpot = p;
        dir = d;
        break;
    }
    if (!courierSpot) {
        stage = 'drop';
        toast('ოდნავ წინ გაჩერდი, რომ გადაცემისთვის ადგილი იყოს.');
        renderOrder();
        return
    }
    deliveryCourier.position.copy(courierSpot);
    deliveryCourier.visible = true;
    const meet = courierSpot.clone().addScaledVector(dir, .9);
    face(deliveryCourier, recipient.curb);
    face(recipient.actor, courierSpot);
    scene.attach(deliveryBag);
    deliveryBag.visible = true;
    deliveryCourier.userData.pose(0, 0, 0);
    deliveryBag.position.copy(handPosition(deliveryCourier));
    const look = courierSpot.clone().addScaledVector(dir, .4);
    look.y = 1.12;
    handoff = {
        phase: 'approach',
        time: 0,
        meet,
        look,
        camera: courierSpot.clone().add(new T.Vector3(-dir.z * 4,3.3,dir.x * 4)).addScaledVector(dir, -3),
        received: false
    };
    renderOrder();
    updateRoute();
}
function moveActor(actor, to, dt) {
    const delta = to.clone().sub(actor.position);
    delta.y = 0;
    const dist = delta.length();
    if (dist < .055) {
        actor.position.x = to.x;
        actor.position.z = to.z;
        actor.userData.pose(runningTime, 0, 0);
        return true
    }
    face(actor, to);
    actor.position.addScaledVector(delta.normalize(), Math.min(dist, dt * 1.25));
    actor.userData.pose(runningTime, 1, 0);
    actor.position.y = (importedDistrict.heightAt(actor.position.x, actor.position.z) ?? actor.position.y) + .04;
    return false
}
function updateHandoff(dt) {
    if (!handoff || stage !== 'handoff') {
        if (recipient && stage === 'drop')
            face(recipient.actor, player.position);
        return
    }
    const h = handoff;
    h.time += dt;
    if (h.phase === 'approach') {
        deliveryCourier.userData.pose(runningTime, 0, 0);
        deliveryBag.position.copy(handPosition(deliveryCourier));
        if (moveActor(recipient.actor, h.meet, dt)) {
            face(recipient.actor, deliveryCourier.position);
            face(deliveryCourier, recipient.actor.position);
            h.phase = 'exchange';
            h.time = 0
        }
    } else if (h.phase === 'exchange') {
        const reach = Math.min(h.time / .75, 1);
        deliveryCourier.userData.pose(runningTime, 0, reach);
        recipient.actor.userData.pose(runningTime, 0, reach);
        const a = handPosition(deliveryCourier)
          , b = handPosition(recipient.actor)
          , u = T.MathUtils.smoothstep(h.time, .85, 1.85);
        deliveryBag.position.copy(a).lerp(b, u);
        deliveryBag.rotation.y = heading;
        if (h.time >= 2.15) {
            recipient.actor.userData.rightHand.attach(deliveryBag);
            h.received = true;
            h.phase = 'return';
            h.time = 0;
            toast(order.home.person + ': „მადლობა!“')
        }
    } else if (h.phase === 'return') {
        deliveryCourier.userData.pose(runningTime, 0, Math.max(0, 1 - h.time));
        const arrived = moveActor(recipient.actor, recipient.curb, dt);
        if (arrived) {
            const reward = completeChallenge(order.challenge, order.shop.pay);
            if (!reward)
                return;
            order.reward = reward;
            stage = 'complete';
            total = Math.round((total + reward.pay) * 100) / 100;
            delivered++;
            orderIndex++;
            save();
            deliveryCourier.visible = false;
            handoff = null;
            clearKeys();
            renderOrder();
            updateRoute();
            sound.cue('complete');
            toast('შეკვეთა ჩაბარებულია! + ₾ ' + order.reward.pay.toFixed(2) + (order.reward.bonus ? ' · ბონუსი ₾ ' + order.reward.bonus : ''))
        }
    }
}
let routeLine = null
  , lastRoute = 0
  , activeRoute = [];
function target() {
    return stage === 'pickup' ? order.shop : ['drop', 'handoff'].includes(stage) ? order.home : null
}
function updateRoute() {
    const t = target();
    if (routeLine) {
        scene.remove(routeLine);
        routeLine.geometry.dispose();
        routeLine.material.dispose();
        routeLine = null
    }
    if (!t) {
        activeRoute = [];
        return
    }
    const points = route(player.position, t);
    activeRoute = points;
    routeLine = new T.Line(new T.BufferGeometry().setFromPoints(points.map(p => new T.Vector3(p.x,(importedDistrict.heightAt(p.x, p.z) ?? 0) + .07,p.z))),new T.LineDashedMaterial({
        color: '#ffda50',
        dashSize: 3,
        gapSize: 1.5,
        transparent: true,
        opacity: .85
    }));
    routeLine.computeLineDistances();
    scene.add(routeLine)
}
function makeOrder() {
    order = {
        shop: SHOPS[orderIndex % SHOPS.length],
        home: HOMES[orderIndex % HOMES.length]
    };
    order.challenge = orderChallenge(orderIndex, routeLength(route(order.shop, order.home)));
    stage = 'offer';
    sound.cue('offer');
    renderOrder()
}
function action() {
    if (paused || stage === 'handoff')
        return;
    if (stage === 'idle' || stage === 'complete') {
        makeOrder();
        return
    }
    if (stage === 'offer') {
        stage = 'pickup';
        toast('შეკვეთა მიღებულია. მიჰყევი ყვითელ მარშრუტს.')
    } else {
        if (!canInteract(player.position, target(), speed)) {
            toast('მიუახლოვდი ყვითელ ნიშნულს და გაჩერდი.');
            return
        }
        if (stage === 'pickup') {
            stage = 'drop';
            order.challenge.elapsed = 0;
            sound.cue('pickup');
            showCustomer();
            toast('შეკვეთა აიღე! ' + order.home.person + ' გელოდება.')
        } else if (stage === 'drop') {
            beginHandoff();
            return
        }
    }
    renderOrder();
    updateRoute();
}
$('action').onclick = action;
$('shortDelivery').onclick = () => {
    if (paused || !['idle', 'complete'].includes(stage))
        return;
    if (Math.abs(speed) > .5) {
        toast('მოკლე მიტანის დასაწყებად ჯერ გაჩერდი.');
        return;
    }
    order = {
        shop: SHOPS[6],
        home: HOMES[7]
    };
    order.challenge = orderChallenge(0, routeLength(route(order.shop, order.home)));
    player.position.set(order.shop.x, 0, order.shop.z);
    lastSafe = {
        x: order.shop.x,
        z: order.shop.z
    };
    const path = route(order.shop, order.home);
    if (path.length > 1)
        heading = Math.atan2(path[0].x - path[1].x, path[0].z - path[1].z);
    steering = 0;
    clearKeys();
    stage = 'offer';
    sound.cue('offer');
    renderOrder();
    updateRoute();
    toast('მოკლე მიტანა მზადაა — მიიღე შეკვეთა და აიღე ამანათი.');
}
;
function renderOrder() {
    const active = ['offer', 'pickup', 'drop', 'handoff'].includes(stage);
    $('orderInfo').hidden = !active;
    $('shortDelivery').hidden = active;
    $('orders').dataset.stage = stage;
    $('money').textContent = '₾ ' + total.toFixed(2);
    $('delivered').textContent = delivered;
    const titles = {
        idle: 'ქალაქი გელოდება.',
        offer: 'ახალი შეკვეთა',
        pickup: order?.shop.name,
        drop: order?.home.name,
        handoff: 'შეკვეთის გადაცემა',
        complete: 'შეკვეთა მიტანილია!'
    };
    $('status').textContent = {
        idle: 'თავისუფალი',
        offer: 'ახალი',
        pickup: 'აღება',
        drop: 'მიტანა',
        handoff: 'გადაცემა',
        complete: 'შესრულებულია'
    }[stage];
    $('orderTitle').textContent = titles[stage];
    $('orderCopy').textContent = {
        idle: 'აირჩიე ტრანსპორტი და მიიღე შეკვეთა.',
        offer: 'მარშრუტი: ობიექტიდან მომხმარებლამდე',
        pickup: 'მიჰყევი რუკას და ობიექტთან გაჩერდი.',
        drop: order?.home.person + ' მისამართთან გელოდება.',
        handoff: 'მომხმარებელი შეკვეთას იღებს.',
        complete: order?.reward?.bonus ? 'მიღებულია ბონუსიც · ₾ ' + order.reward.bonus : 'შემოსავალი შენახულია.'
    }[stage];
    $('action').textContent = {
        idle: 'პირველი შეკვეთა →',
        offer: 'მიღება →',
        pickup: 'შეკვეთის აღება · E',
        drop: 'გადაცემა · E',
        handoff: 'გადაცემა მიმდინარეობს…',
        complete: 'შემდეგი შეკვეთა →'
    }[stage];
    $('action').disabled = stage === 'handoff';
    if (order) {
        $('pickupName').textContent = order.shop.name;
        $('dropName').textContent = order.home.name + ' · ' + order.home.person;
        $('food').textContent = order.shop.food + ' · ' + order.challenge.label;
        $('pay').textContent = '₾ ' + order.shop.pay.toFixed(2) + ' + ბონუსი ' + order.challenge.bonus;
        $('tripLength').textContent = formatDistance(routeLength(route(order.shop, order.home)))
    }
    marker.visible = !!target() && stage !== 'handoff';
    if (target())
        marker.position.set(target().x, (importedDistrict.heightAt(target().x, target().z) ?? 0) + .04, target().z);
    $('actionHint').textContent = active ? 'ობიექტთან გაჩერების შემდეგ დააჭირე ღილაკს.' : 'შემოსავალი ინახება ამ ბრაუზერში.';
}
$('orderDetails').onclick = () => {
    const expanded = $('orders').classList.toggle('expanded');
    $('orderDetails').setAttribute('aria-expanded', String(expanded));
}
;

renderOrder();
$('vehicleName').textContent = VEHICLES[currentVehicle].name;
document.querySelectorAll('[data-vehicle]').forEach(b => {
    b.classList.toggle('selected', b.dataset.vehicle === currentVehicle);
    b.setAttribute('aria-pressed', String(b.dataset.vehicle === currentVehicle))
}
);
const keys = {};
addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !$('settings').open)
        e.preventDefault();
    if (e.repeat)
        return;
    if ($('settings').open)
        return;
    keys[e.code] = true;
    if (e.code === 'KeyE')
        action();
    if (e.code === 'KeyC')
        cycleCamera();
    if (e.code === 'KeyR')
        orbit.reset();
    if (e.code === 'KeyH') {
        $('headlights').checked = !$('headlights').checked;
    }
    if (e.code === 'Escape')
        togglePause()
}
);
addEventListener('keyup', e => keys[e.code] = false);
function clearKeys() {
    Object.keys(keys).forEach(k => keys[k] = false);
    touchControls?.reset()
}
addEventListener('blur', () => {
    clearKeys();
    if (!paused)
        togglePause(true)
}
);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearKeys();
        togglePause(true)
    }
}
);
touchControls = createMobileControls({
    enabled: () => !paused && stage !== 'handoff' && !$('settings').open,
    getSpeed: () => speed,
    onGearChange: () => {
        directionLock = 0;
        clearKeys()
    }
    ,
    notify: toast
});
function togglePause(value) {
    paused = typeof value === 'boolean' ? value : !paused;
    $('pauseOverlay').hidden = !paused;
    $('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';
    clearKeys()
}
$('pauseBtn').onclick = () => togglePause();
$('resume').onclick = () => togglePause(false);
let settingsWasPaused = false;
$('settingsBtn').onclick = () => {
    settingsWasPaused = paused;
    paused = true;
    clearKeys();
    $('settings').showModal()
}
;
$('closeSettings').onclick = () => $('settings').close();
$('settings').addEventListener('close', () => {
    paused = settingsWasPaused
}
);
function cycleCamera() {
    orbit.reset();
    cameraMode = ['chase', 'wide', 'first'][(['chase', 'wide', 'first'].indexOf(cameraMode) + 1) % 3];
    $('cameraMode').value = cameraMode;
    toast({
        chase: 'კამერა — უკნიდან',
        wide: 'კამერა — ფართო ხედი',
        first: 'კამერა — მძღოლის ხედი'
    }[cameraMode])
}
$('cameraMode').onchange = e => {
    cameraMode = e.target.value;
    orbit.reset();
}
;
$('quality').onchange = e => {
    const q = e.target.value
      , p = {
        low: 1,
        medium: 1.35,
        high: 1.8,
        ultra: 2.5
    }[q];
    renderBudget.setQuality(q);
    renderer.shadowMap.enabled = q !== 'low';
    pedestrians.setQuality(q);
    scene.traverse(o => {
        if (o.material)
            o.material.needsUpdate = true
    }
    );
    sun.shadow.mapSize.setScalar(q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024);
    if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null
    }
    sun.shadow.needsUpdate = true;
    toast('გრაფიკის ხარისხი შეიცვალა')
}
;
$('soundEnabled').onchange = e => {
    sound.enabled = e.target.checked;
    if (sound.enabled)
        sound.start();
}
;
$('soundVolume').oninput = e => {
    sound.volume = Number(e.target.value) / 100;
}
;
$('adaptiveQuality').onchange = e => renderBudget.setAdaptive(e.target.checked);
$('lighting').onchange = e => {
    const q = e.target.value
      , isNight = q === 'night'
      , day = q === 'day';
    $('headlights').checked = isNight;
    scene.background.set(isNight ? '#34475e' : day ? '#b9d7e8' : '#b9d5d8');
    scene.fog.color.copy(scene.background);
    hemi.intensity = isNight ? 1.05 : 2.25;
    sun.intensity = isNight ? .65 : day ? 3 : 3.2;
    sun.color.set(isNight ? '#95b6f1' : day ? '#fff6df' : '#ffe4b3');
    renderer.toneMappingExposure = isNight ? .9 : 1.1;
    $('district').textContent = isNight ? 'საღამო თბილისში' : day ? 'დღე თბილისში' : 'Modern City Block';
    document.querySelector('.day').textContent = 'თბილისი / ' + (isNight ? '20:30' : day ? '13:00' : '17:40')
}
;
$('recover').onclick = () => {
    if (stage === 'handoff') {
        toast('დაელოდე შეკვეთის გადაცემას.');
        return
    }
    player.position.set(lastSafe.x, importedDistrict.heightAt(lastSafe.x, lastSafe.z) ?? player.position.y, lastSafe.z);
    speed = 0;
    steering = 0;
    directionLock = 0;
    clearKeys();
    orbit.reset();
    const edge = nearestStreet(lastSafe).edge;
    heading = Math.atan2(edge.p.x - edge.q.x, edge.p.z - edge.q.z);
    $('settings').close();
    toast('ტრანსპორტი გზაზე დაბრუნდა.')
}
;
const realMap = new RealMap($('map'));
function drawMap() {
    realMap.draw(player.position, heading, activeRoute, target());
    $('distance').textContent = target() ? formatDistance(routeLength(activeRoute)) : 'თავისუფალი სვლა'
}
let uiTime = 0
  , collisionCooldown = 0;
const cameraDesired = new T.Vector3()
  , lookDesired = new T.Vector3();
camera.position.set(START.x - 10, 5, START.z);
let lookPoint = new T.Vector3(START.x,1.4,START.z);
function animate() {
    requestAnimationFrame(animate);
    const frameDt = clock.getDelta();
    let dt = Math.min(frameDt, .045);
    if (!paused) {
        runningTime += dt;
        const v = VEHICLES[currentVehicle]
          , forward = stage !== 'handoff' && (keys.KeyW || keys.ArrowUp || touchControls.state.throttle)
          , back = stage !== 'handoff' && (keys.KeyS || keys.ArrowDown || touchControls.state.brake)
          , left = stage !== 'handoff' && (keys.KeyA || keys.ArrowLeft)
          , right = stage !== 'handoff' && (keys.KeyD || keys.ArrowRight);
        touchControls.update();
        const drive = stepDriving({
            speed,
            heading,
            steering,
            directionLock
        }, {
            forward,
            back,
            left,
            right,
            steer: stage === 'handoff' ? 0 : touchControls.state.steer,
            brake: keys.Space
        }, v, dt);
        speed = drive.speed;
        directionLock = drive.directionLock;
        heading = drive.heading;
        steering = drive.steering;
        const steer = steering;
        signals.update(runningTime, player.position);
        if (stage === 'drop') {
            order.challenge.elapsed += dt;
            // Rough driving affects the fragile bonus without blocking free driving.
            if (order.challenge.kind === 'fragile' && Math.abs(speed) > 8 && (Math.abs(drive.acceleration) > 10 || Math.abs(speed * speed * Math.tan(drive.wheelAngle) / (v.wheelbase || 2.8)) > 8)) {
                order.challenge.roughTime = (order.challenge.roughTime || 0) + dt;
                if (order.challenge.roughTime > .65 && !order.challenge.collisions) {
                    order.challenge.collisions = 1;
                    toast('მყიფე შეკვეთა შეირყა — ფრთხილი მიტანის ბონუსი დაკარგულია.');
                }
            }
        }
        const nx = player.position.x - Math.sin(heading) * speed * dt
          , nz = player.position.z - Math.cos(heading) * speed * dt;
        // Free driving: visual obstacles, traffic and map bounds never stop the player.
        player.position.x = nx;
        player.position.z = nz;
        const ground = importedDistrict.heightAt(nx, nz) ?? importedDistrict.groundHeight;
        // Limit vertical change so small gaps or roof samples cannot throw the car upward.
        const climb = Math.max(.06, Math.abs(speed) * dt * .35);
        player.position.y += T.MathUtils.clamp(ground - player.position.y, -climb, climb);
        player.rotation.y = heading;
        if (currentVehicle === 'bike' || currentVehicle === 'moped')
            model.rotation.z = steer * Math.min(Math.abs(speed) * .018, .13);
        if (['bike', 'moped'].includes(currentVehicle))
            model.userData.wheels.forEach(w => w.rotation.x += speed * dt * 2);
        else {
            animateCar(model, speed, steer, dt, drive.wheelAngle);
            model.rotation.z = T.MathUtils.damp(model.rotation.z, -steer * Math.min(Math.abs(speed) * .0015, .035), 6, dt);
            model.rotation.x = T.MathUtils.damp(model.rotation.x, (back || touchControls.state.brake || keys.Space) && speed > 1 ? .018 : forward ? -.012 : 0, 5, dt);
            if (model.userData.brakeMaterial)
                model.userData.brakeMaterial.emissiveIntensity = back || keys.Space || touchControls.state.brake ? 2.5 : .35;
        }
        updateHandoff(dt);
        for (const actor of [deliveryCourier, ...customers.map(c => c.actor)])
            if (actor.visible)
                actor.position.y = (importedDistrict.heightAt(actor.position.x, actor.position.z) ?? player.position.y) + .04;
        if (nearestStreet(player.position).dist < 2 && Math.abs(speed) > 1 && runningTime % 2 < .06)
            lastSafe = {
                x: player.position.x,
                z: player.position.z
            };
        for (const c of traffic) {
            const original = c.path[c.step]
              , previous = c.path[c.step - 1]
              , direction = {
                x: original.x + (original.x - previous.x),
                z: original.z + (original.z - previous.z)
            };
            let p = lanePosition(original, direction);
            if (importedDistrict.blocked(p.x, p.z, 1.35))
                p = original;
            let dx = p.x - c.g.position.x
              , dz = p.z - c.g.position.z
              , d = Math.hypot(dx, dz);
            if (d > .01 && blocked(c.g.position.x + dx / d * Math.min(d, c.speed * dt), c.g.position.z + dz / d * Math.min(d, c.speed * dt), 1.3)) {
                p = original;
                dx = p.x - c.g.position.x;
                dz = p.z - c.g.position.z;
                d = Math.hypot(dx, dz);
            }
            const fx = dx / (d || 1)
              , fz = dz / (d || 1)
              , obstacles = [player, ...traffic.filter(other => other !== c).map(other => other.g)];
            const wait = obstacles.some(g => {
                const ox = g.position.x - c.g.position.x
                  , oz = g.position.z - c.g.position.z;
                return ox * fx + oz * fz > 0 && ox * fx + oz * fz < 7 && Math.abs(ox * fz - oz * fx) < 1.8;
            }
            );
            const carHeading = Math.atan2(-dx, -dz)
              , stop = signals.stopDistance(c.g.position, carHeading)
              , wanted = wait ? 0 : Math.min(c.speed, Math.sqrt(stop * 6));
            c.currentSpeed = T.MathUtils.damp(c.currentSpeed, wanted, wanted < c.currentSpeed ? 7 : 2, dt);
            const step = Math.min(d, c.currentSpeed * dt);
            if (d > .01) {
                c.g.position.x += dx / d * step;
                c.g.position.z += dz / d * step;
                const turn = Math.atan2(Math.sin(carHeading - c.g.rotation.y), Math.cos(carHeading - c.g.rotation.y));
                c.g.rotation.y += turn * (1 - Math.exp(-dt * 8));
            }
            c.g.position.y = importedDistrict.heightAt(c.g.position.x, c.g.position.z) ?? c.g.position.y;
            animateCar(c.g, c.currentSpeed, 0, dt);
            c.g.visible = c.g.position.distanceTo(player.position) < 450;
            if (c.g.userData.brakeMaterial)
                c.g.userData.brakeMaterial.emissiveIntensity = wanted < c.speed ? 2 : .35;
            if (d < .2) {
                c.step++;
                if (c.step >= c.path.length) {
                    c.path.reverse();
                    c.step = 1;
                }
            }
        }
        pedestrians.update(player.position, runningTime, dt);
        parcel.rotation.y = runningTime * .65;
        marker.children[1].position.y = marker.children[2].position.y = 4.6 + Math.sin(runningTime * 2) * .2;
        ring.scale.setScalar(1 + Math.sin(runningTime * 2) * .055);
    }
    // Smooth chase camera stays behind the courier, with a compact driver mode.
    const viewHeading = heading + orbit.state.yaw
      , sx = Math.sin(viewHeading)
      , cz = Math.cos(viewHeading)
      , first = cameraMode === 'first' && stage !== 'handoff';
    model.visible = !first;
    if (model.userData.rider)
        model.userData.rider.visible = stage !== 'handoff';
    if (stage === 'handoff' && handoff) {
        cameraDesired.copy(handoff.camera);
        lookDesired.copy(handoff.look);
    } else if (first) {
        const eye = player.position.y + cameraHeight(currentVehicle);
        cameraDesired.set(player.position.x, eye, player.position.z);
        lookDesired.set(player.position.x - sx * 25, eye - Math.sin(orbit.state.pitch) * 25, player.position.z - cz * 25)
    } else {
        const wide = cameraMode === 'wide'
          , d = wide ? 23 : 8.8 + Math.min(Math.abs(speed) * .075, 4)
          , elevation = (wide ? .58 : .32) + orbit.state.pitch
          , horizontal = d * Math.cos(elevation);
        cameraDesired.set(player.position.x + sx * horizontal, player.position.y + 1.15 + d * Math.sin(elevation), player.position.z + cz * horizontal);
        lookDesired.set(player.position.x, player.position.y + 1.15, player.position.z);
    }
    const desiredFov = (camera.aspect < 1 ? 68 : 57) + Math.min(Math.abs(speed) * .22, 12);
    camera.fov = T.MathUtils.damp(camera.fov, desiredFov, 3, dt);
    camera.updateProjectionMatrix();
    camera.position.lerp(cameraDesired, 1 - Math.exp(-dt * 7));
    lookPoint.lerp(lookDesired, 1 - Math.exp(-dt * 9));
    camera.lookAt(lookPoint);
    const shadowStep = 150 / sun.shadow.mapSize.x
      , shadowX = Math.round(player.position.x / shadowStep) * shadowStep
      , shadowZ = Math.round(player.position.z / shadowStep) * shadowStep;
    sun.position.set(shadowX - 100, 160, shadowZ + 70);
    sun.target.position.set(shadowX, 0, shadowZ);

    uiTime += dt;
    if (uiTime > .14) {
        uiTime = 0;
        $('speed').textContent = Math.round(Math.abs(speed) * 3.6);
        $('speedBar').style.width = Math.min(Math.abs(speed) / VEHICLES[currentVehicle].max * 100, 100) + '%';
        $('gear').textContent = speed > .1 ? 'D' : speed < -.1 ? 'R' : 'N';
        const challenge = order?.challenge;
        const remain = challenge ? Math.max(0, Math.ceil(challenge.limit - challenge.elapsed)) : 0;
        $('challengeStatus').hidden = stage !== 'drop';
        $('challengeStatus').textContent = stage === 'drop' ? challenge.label + ' · ' + (remain ? Math.floor(remain / 60) + ':' + String(remain % 60).padStart(2, '0') + (challenge.kind === 'fragile' && challenge.collisions ? ' · ბონუსი დაკარგულია' : ' · ბონუსი ₾ ' + challenge.bonus) : 'ბონუსის დრო ამოიწურა') : '';
        $('street').textContent = nearestStreet(player.position).edge.name;
        $('district').textContent = onAvenue(player.position.x, player.position.z) ? 'მოსკოვის გამზირი' : 'Modern City Block';
        if (stage === 'handoff') {
            $('action').disabled = true;
            $('actionHint').textContent = 'დაელოდე — გადაცემა ავტომატურად დასრულდება.';
        } else if (target()) {
            $('action').disabled = !canInteract(player.position, target(), speed);
            $('actionHint').textContent = canInteract(player.position, target(), speed) ? 'მზადაა — დააჭირე ღილაკს ან E-ს.' : Math.hypot(player.position.x - target().x, player.position.z - target().z) < 10 ? 'შეკვეთისთვის გააჩერე ტრანსპორტი.' : 'მიჰყევი ყვითელ მარშრუტს რუკაზე.'
        } else
            $('action').disabled = false;
        drawMap()
    }
    if (runningTime - lastRoute > 1.5) {
        lastRoute = runningTime;
        updateRoute()
    }
    cockpit.update(speed, steering, currentVehicle, first);
    const lightsOn = $('headlights').checked;
    if (model.userData.headlampMaterial)
        model.userData.headlampMaterial.emissiveIntensity = lightsOn ? 4 : 0;
    for (const light of headlights) {
        light.intensity = lightsOn ? 1800 : 0;
        light.decay = 2;
        light.distance = 85;
        light.angle = .38;
        light.penumbra = .55;
        light.position.y = currentVehicle === 'gls' ? .99 : ['bike', 'moped'].includes(currentVehicle) ? 1 : .85;
        light.position.z = -(model.userData.halfLength || .8) - .06;
        light.target.position.y = .08;
        light.target.position.z = -28;
    }
    importedDistrict.update?.(runningTime);
    sound.update(speed, currentVehicle, keys.KeyW || keys.ArrowUp || touchControls.state.throttle, paused);
    renderBudget.update(player.position, frameDt, runningTime);
    renderer.render(scene, camera);
}
function resizeGame() {
    const w = document.documentElement.clientWidth || innerWidth
      , h = globalThis.visualViewport?.height || innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
addEventListener('resize', resizeGame);
globalThis.visualViewport?.addEventListener('resize', resizeGame);
resizeGame();
$('load').remove();
animate();
changeVehicle('gls');
