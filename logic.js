const DATA = {};
import {attachDistrict} from './district-layout.js';
export const DISTRICT = attachDistrict(DATA);
export {DATA};
export const VEHICLES = {
    gls: {
        wheelbase: 3.16,
        name: "Mercedes GLS 580",
        max: 42,
        accel: 7.8,
        turn: .94,
        radius: 1.35
    },
    bike: {
        name: 'ველოსიპედი',
        max: 9,
        accel: 3.3,
        turn: 1.85,
        radius: .6
    },
    moped: {
        name: 'მოპედი',
        max: 19.4,
        accel: 5.2,
        turn: 1.6,
        radius: .65
    },
    sedan: {
        name: 'სედანი',
        max: 38.9,
        accel: 7.5,
        turn: 1.12,
        radius: 1.18
    },
    suv: {
        name: 'ჯიპი',
        max: 36.1,
        accel: 6.4,
        turn: .96,
        radius: 1.28
    },
    van: {
        name: 'ფურგონი',
        max: 30.6,
        accel: 5.2,
        turn: .85,
        radius: 1.3
    },
    sport: {
        name: 'სპორტული კუპე',
        max: 55.6,
        accel: 11,
        turn: 1.3,
        radius: 1.22
    },
    gt: {
        name: 'GT სპორტი',
        max: 61.1,
        accel: 12.8,
        turn: 1.22,
        radius: 1.25
    }
};
export const NODES = DATA.nodes.map( ([x,z]) => ({
    x,
    z
}));
export const SEGMENTS = DATA.roads.map( ([a,b,width,name,id]) => ({
    a,
    b,
    width,
    name,
    id,
    p: NODES[a],
    q: NODES[b],
    length: Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z)
}));
const cells = new Map()
  , adj = NODES.map( () => []);
SEGMENTS.forEach( (e, index) => {
    adj[e.a].push([e.b, e.length]);
    adj[e.b].push([e.a, e.length]);
    for (let x = Math.floor(Math.min(e.p.x, e.q.x) / 50) - 1; x <= Math.floor(Math.max(e.p.x, e.q.x) / 50) + 1; x++)
        for (let z = Math.floor(Math.min(e.p.z, e.q.z) / 50) - 1; z <= Math.floor(Math.max(e.p.z, e.q.z) / 50) + 1; z++) {
            const key = x + ',' + z;
            if (!cells.has(key))
                cells.set(key, []);
            cells.get(key).push(index)
        }
}
);
export const latLng = p => ({
    lat: DATA.origin[0] - p.z / 111320,
    lng: DATA.origin[1] + p.x / (111320 * Math.cos(DATA.origin[0] * Math.PI / 180))
});
export const fromLatLng = (lat, lng) => ({
    x: (lng - DATA.origin[1]) * 111320 * Math.cos(DATA.origin[0] * Math.PI / 180),
    z: (DATA.origin[0] - lat) * 111320
});
export function nearestStreet(p) {
    let best = null
      , dist = Infinity;
    const candidates = cells.get(Math.floor(p.x / 50) + ',' + Math.floor(p.z / 50));
    for (const i of candidates?.length ? candidates : SEGMENTS.keys()) {
        const e = SEGMENTS[i]
          , dx = e.q.x - e.p.x
          , dz = e.q.z - e.p.z
          , u = Math.max(0, Math.min(1, ((p.x - e.p.x) * dx + (p.z - e.p.z) * dz) / (e.length * e.length || 1)))
          , x = e.p.x + u * dx
          , z = e.p.z + u * dz
          , d = Math.hypot(p.x - x, p.z - z);
        if (d < dist) {
            dist = d;
            best = {
                x,
                z,
                u,
                dist: d,
                edge: e,
                index: i
            }
        }
    }
    return best
}
export const blocked = (x, z, radius) => {
    const n = nearestStreet({
        x,
        z
    });
    return n.dist > n.edge.width / 2 - radius + .35
}
;
export const canInteract = (p, t, s) => !!t && Math.hypot(p.x - t.x, p.z - t.z) < 10 && Math.abs(s) < .8;
export const routeLength = pts => pts.slice(1).reduce( (s, p, i) => s + Math.hypot(p.x - pts[i].x, p.z - pts[i].z), 0);
export const formatDistance = m => m >= 1000 ? (m / 1000).toFixed(1) + ' კმ' : Math.round(m) + ' მ';
class Heap {
    a = [];
    push(v) {
        let i = this.a.length;
        this.a.push(v);
        while (i) {
            let p = (i - 1) >> 1;
            if (this.a[p][0] <= v[0])
                break;
            this.a[i] = this.a[p];
            i = p;
        }
        this.a[i] = v;
    }
    pop() {
        const first = this.a[0]
          , v = this.a.pop();
        if (this.a.length) {
            let i = 0;
            while (i * 2 + 1 < this.a.length) {
                let c = i * 2 + 1;
                if (c + 1 < this.a.length && this.a[c + 1][0] < this.a[c][0])
                    c++;
                if (this.a[c][0] >= v[0])
                    break;
                this.a[i] = this.a[c];
                i = c;
            }
            this.a[i] = v;
        }
        return first;
    }
}
export function route(from, to) {
    const a = nearestStreet(from)
      , b = nearestStreet(to);
    if (a.index === b.index)
        return [from, {
            x: a.x,
            z: a.z
        }, {
            x: b.x,
            z: b.z
        }, to];
    const dist = new Float64Array(NODES.length).fill(Infinity)
      , prev = new Int32Array(NODES.length).fill(-1)
      , heap = new Heap();
    for (const n of [a.edge.a, a.edge.b]) {
        dist[n] = Math.hypot(a.x - NODES[n].x, a.z - NODES[n].z);
        heap.push([dist[n], n])
    }
    let best = Infinity
      , end = -1;
    while (heap.a.length) {
        const [d,n] = heap.pop();
        if (d !== dist[n])
            continue;
        if (d > best)
            break;
        if (n === b.edge.a || n === b.edge.b) {
            const score = d + Math.hypot(b.x - NODES[n].x, b.z - NODES[n].z);
            if (score < best) {
                best = score;
                end = n
            }
        }
        for (const [v,w] of adj[n])
            if (d + w < dist[v]) {
                dist[v] = d + w;
                prev[v] = n;
                heap.push([d + w, v])
            }
    }
    if (end < 0)
        throw Error('Disconnected street network');
    const path = [];
    while (end >= 0) {
        path.push(NODES[end]);
        end = prev[end]
    }
    return [from, {
        x: a.x,
        z: a.z
    }, ...path.reverse(), {
        x: b.x,
        z: b.z
    }, to].filter( (p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > .02)
}
function stop(index, name, person) {
    const p = NODES[index]
      , n = nearestStreet(p)
      , e = n.edge;
    return {
        x: p.x,
        z: p.z,
        name,
        person,
        street: e.name,
        edge: e,
        curb: {
            x: p.x + (e.q.z - e.p.z) / e.length * (e.width / 2 + .7),
            z: p.z - (e.q.x - e.p.x) / e.length * (e.width / 2 + .7)
        }
    }
}
const pickupCoords = [22, 28, 33, 36, 3, 7, 11, 16];
const shopNames = ['პური და ყავა', 'ხინკლის სახლი', 'პიცა თბილისი', 'მწვანე მარკეტი', 'კაფე აივანი', 'ბურგერის კუთხე', 'საკონდიტრო', 'სუპერმარკეტი'];
const foods = ['ყავა და კრუასანი', 'ხინკალი · 2 პაკეტი', 'პიცა · 1 ყუთი', 'პროდუქტები · 1 პაკეტი', 'სადილი · 2 პაკეტი', 'ბურგერი და სასმელი', 'ნამცხვარი · 1 ყუთი', 'პროდუქტები · 2 პაკეტი'];
export const SHOPS = pickupCoords.map( (p, i) => ({
    ...stop(p, shopNames[i]),
    food: foods[i],
    pay: 7 + i * .6
}));
const homeCoords = [7, 11, 16, 22, 28, 33, 36, 3];
export const HOMES = homeCoords.map( (p, i) => {
    const h = stop(p, '', ['ნინო', 'გიორგი', 'მარიამი', 'დათო', 'ანა', 'ლუკა', 'თამარი', 'ირაკლი'][i]);
    h.name = 'კვარტალი · მიტანის ადგილი ' + (i + 1);
    return h
}
);
export const START = nearestStreet(DISTRICT.spawn);
