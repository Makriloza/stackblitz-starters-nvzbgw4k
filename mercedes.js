import { createCar } from './vehicles.js';

export function assembleMercedes(scene) {
  scene.name = 'Mercedes-Benz GLS 580';
  return scene;
}

export async function loadMercedes() {
  const car = createCar('suv', '#26343b');
  car.name = 'Mercedes-Benz GLS 580';
  car.scale.setScalar(1.05);
  return car;
}
