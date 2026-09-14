export function createCameraOrbit(canvas, enabled) {
  const state = {
    yaw: 0,
    pitch: 0,
  };
  let pointer = null,
    lastX = 0,
    lastY = 0;
  const reset = () => {
    state.yaw = 0;
    state.pitch = 0;
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (!enabled() || pointer !== null || e.button > 0) return;
    pointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(pointer);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer || !enabled()) return;
    state.yaw -= (e.clientX - lastX) * 0.006;
    state.pitch = Math.max(
      -0.28,
      Math.min(0.9, state.pitch + (e.clientY - lastY) * 0.004)
    );
    lastX = e.clientX;
    lastY = e.clientY;
    e.preventDefault();
  });
  const end = (e) => {
    if (e.pointerId === pointer) pointer = null;
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    canvas.addEventListener(event, end);
  canvas.addEventListener('dblclick', reset);
  globalThis.addEventListener('blur', () => (pointer = null));
  return {
    state,
    reset,
  };
}
