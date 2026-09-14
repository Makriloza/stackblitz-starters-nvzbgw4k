import {createAnnaPedestrian} from './anna-pedestrian.js';
import SIDEWALKS from './modern-walks.js';

export function createPedestrianSystem(scene, district) {
  const avenueLanes = [];
  for (const z of [-114.15, -101.85]) {
    for (let x = 227; x < 332; x += 26) {
      const end = Math.min(x + 22, 337);
      avenueLanes.push({ a: {x, z}, b: {x: end, z}, dx: 1, dz: 0, length: end - x, avenue: true });
    }
  }

  const lanes = [...avenueLanes, ...SIDEWALKS].filter(l => {
    let last;
    const steps = Math.ceil(l.length / 0.5);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = l.a.x + (l.b.x - l.a.x) * u;
      const z = l.a.z + (l.b.z - l.a.z) * u;
      const y = district.heightAt(x, z);
      if (y === null || !Number.isFinite(y) || (last !== undefined && Math.abs(y - last) > 0.22) || (!l.avenue && district.blocked(x, z, 0.38))) return false;
      last = y;
    }
    return true;
  });

  const pool = [];
  let limit = 2;
  let lastRefresh = -Infinity;

  function make() {
    const g = createAnnaPedestrian(pool.length);
    g.visible = false;
    scene.add(g);
    const i = pool.length;
    const p = {g, lane: null, travel: 0, direction: i % 2 ? 1 : -1, speed: 0.85 + (i % 5) * 0.12, phase: i * 0.7, pause: 0, walk: 0};
    pool.push(p);
    return p;
  }

  function place(p) {
    const l = p.lane;
    const u = p.travel / l.length;
    const x = l.a.x + (l.b.x - l.a.x) * u;
    const z = l.a.z + (l.b.z - l.a.z) * u;
    p.g.position.set(x, (district.heightAt(x, z) ?? 0) + 0.04, z);
  }

  function refresh(position) {
    const nearby = lanes
      .map(lane => ({lane, d: Math.hypot((lane.a.x + lane.b.x) / 2 - position.x, (lane.a.z + lane.b.z) / 2 - position.z)}))
      .filter(p => p.d < 90)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map(p => p.lane);

    const wanted = new Set(nearby);
    for (const p of pool) {
      if (!wanted.has(p.lane)) {
        p.lane = null;
        p.g.visible = false;
      }
    }
    for (const lane of nearby) {
      if (pool.some(p => p.lane === lane)) continue;
      const p = pool.find(p => !p.lane) || make();
      p.lane = lane;
      p.travel = lane.length * (0.2 + (p.phase % 1) * 0.6);
      p.pause = 0;
      p.g.visible = true;
      place(p);
      p.g.rotation.y = Math.atan2(-lane.dx * p.direction, -lane.dz * p.direction);
    }
  }

  return {
    setQuality(q) {
      limit = ({low: 1, medium: 2, high: 3, ultra: 4}[q] || 2);
      lastRefresh = -Infinity;
    },
    update(position, time, dt) {
      dt = Math.max(0, Math.min(dt, 0.1));
      if (time - lastRefresh > 1.2) {
        refresh(position);
        lastRefresh = time;
      }
      for (const p of pool) {
        if (!p.lane) continue;
        const l = p.lane;
        const distance = p.g.position.distanceTo(position);
        const yieldToCar = distance < 3.2;
        p.pause = Math.max(0, p.pause - dt);
        const moving = !yieldToCar && p.pause === 0;
        if (moving) {
          p.travel += dt * p.speed * p.direction;
          if (p.travel >= l.length || p.travel <= 0) {
            p.travel = Math.max(0, Math.min(l.length, p.travel));
            p.direction *= -1;
            p.pause = 1.1 + (p.phase % 1) * 1.6;
          }
        }
        const wanted = Math.atan2(-l.dx * p.direction, -l.dz * p.direction);
        const delta = Math.atan2(Math.sin(wanted - p.g.rotation.y), Math.cos(wanted - p.g.rotation.y));
        p.g.rotation.y += delta * (1 - Math.exp(-dt * 4));
        p.walk += (Number(moving && p.pause === 0) * 0.7 - p.walk) * (1 - Math.exp(-dt * 7));
        if (distance < 45 || Math.floor(time * 10) !== p.lastPose) {
          p.g.userData.pose?.(time * p.speed + p.phase, p.walk, 0);
          p.lastPose = Math.floor(time * 10);
        }
        place(p);
      }
    },
    get activeCount() {
      return pool.filter(p => p.g.visible).length;
    }
  };
}
