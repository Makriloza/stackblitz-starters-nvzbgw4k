import { loadHoonicorn } from './hoonicorn.js';

export function assembleMercedes(scene) {
  scene.name = 'Hoonicorn Ken Block';
  return scene;
}

export async function loadMercedes() {
  const car = await loadHoonicorn();
  car.name = 'Hoonicorn Ken Block';
  return car;
}
