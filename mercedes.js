import { createCar } from './vehicles.js';

export function assembleMercedes(scene) {
  scene.name = 'Hoonicorn Ken Block';
  return scene;
}

export async function loadMercedes() {
  try {
    const { loadHoonicorn } = await import('./hoonicorn.js?v=2');
    const car = await loadHoonicorn();
    car.name = 'Hoonicorn Ken Block';
    return car;
  } catch (error) {
    console.error('Hoonicorn failed to load:', error);
    const fallback = createCar('sport', '#202020');
    fallback.name = 'Hoonicorn fallback';
    return fallback;
  }
}
