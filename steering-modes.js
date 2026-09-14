export function screenTilt(beta, gamma, rotation=0) {
  const rad = rotation * Math.PI / 180;
  return gamma * Math.cos(rad) + beta * Math.sin(rad);
}
export function tiltSteer(value, neutral) {
  const delta = Math.atan2(Math.sin((value - neutral) * Math.PI / 180), Math.cos((value - neutral) * Math.PI / 180)) * 180 / Math.PI;
  return -Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - .6) / 13.4) || 0;
}
export function createSteeringModes({state, reset, enabled, notify}) {
  const $ = id => document.getElementById(id)
    , select = $('steeringMode')
    , status = $('tiltStatus');
  let neutral = null
    , sensorActive = false
    , pending = false
    , timeout = null
    , requestId = 0
    , lastSample = 0;
  const arrows = new Map();
  function paintTilt(value=0) {
      $('tiltWheelGraphic').style.transform = `rotate(${-value * 120}deg)`;
      $('tiltIndicator').style.transform = `translateX(${-value * 42}px)`;
  }
  function resetSteering() {
      arrows.clear();
      state.steer = null;
      for (const id of ['steerLeft', 'steerRight'])
          $(id).classList.remove('held');
      paintTilt();
  }
  function modeUI() {
      for (const [mode,id] of [['wheel', 'wheelControls'], ['arrows', 'arrowControls'], ['tilt', 'tiltControls']])
          $(id).hidden = state.mode !== mode;
      $('tiltHelp').hidden = state.mode !== 'tilt';
      select.value = state.mode;
  }
  function choose(mode) {
      if (!['wheel', 'tilt', 'arrows'].includes(mode))
          mode = 'wheel';
      requestId++;
      clearTimeout(timeout);
      pending = false;
      reset();
      resetSteering();
      state.mode = mode;
      neutral = null;
      modeUI();
      try {
          localStorage.setItem('courier-steering-mode', mode);
      } catch {}
      if (mode === 'tilt')
          status.textContent = sensorActive ? 'დაიჭირე პირდაპირ სვლის პოზიციაში' : 'ჩართე გადახრით მართვა';
  }
  select.addEventListener('change', () => choose(select.value));
  for (const [id,value] of [['steerLeft', 1], ['steerRight', -1]]) {
      const el = $(id);
      const update = () => {
          state.steer = arrows.size ? [...arrows.values()].reduce( (a, v) => a + v.value, 0) : null;
      }
      ;
      el.addEventListener('pointerdown', e => {
          if (state.mode !== 'arrows' || !enabled() || e.button > 0 || arrows.has(id))
              return;
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          arrows.set(id, {
              pointer: e.pointerId,
              value
          });
          el.classList.add('held');
          update();
      }
      );
      const end = e => {
          if (arrows.get(id)?.pointer !== e.pointerId)
              return;
          arrows.delete(id);
          el.classList.remove('held');
          update();
      }
      ;
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
          el.addEventListener(event, end);
      el.addEventListener('contextmenu', e => e.preventDefault());
  }
  $('calibrateTilt').addEventListener('click', async () => {
      if (state.mode !== 'tilt' || !enabled() || pending)
          return;
      reset();
      resetSteering();
      const current = ++requestId;
      pending = true;
      status.textContent = 'სენსორის ჩართვა…';
      try {
          const Sensor = globalThis.DeviceOrientationEvent;
          if (!Sensor)
              throw Error('No sensor');
          if (typeof Sensor.requestPermission === 'function' && await Sensor.requestPermission() !== 'granted')
              throw Error('Denied');
          if (current !== requestId || state.mode !== 'tilt')
              return;
          sensorActive = true;
          neutral = null;
          lastSample = 0;
          status.textContent = 'დაიჭირე პირდაპირ სვლის პოზიციაში';
          clearTimeout(timeout);
          timeout = setTimeout( () => {
              if (current === requestId && state.mode === 'tilt' && !lastSample) {
                  state.steer = 0;
                  sensorActive = false;
                  status.textContent = 'სენსორი არ პასუხობს';
                  notify('გადახრის მონაცემები არ მოდის. სცადე პირდაპირ ტელეფონის ბრაუზერში, ან აირჩიე საჭე / ისრები.');
              }
          }
          , 4000);
      } catch {
          if (current === requestId) {
              sensorActive = false;
              state.steer = 0;
              status.textContent = 'გადახრა მიუწვდომელია';
              notify('სენსორი მიუწვდომელია ან წვდომა არ მიეცა. შეგიძლია აირჩიო საჭე ან ისრები.');
          }
      } finally {
          if (current === requestId)
              pending = false;
      }
  }
  );
  globalThis.addEventListener('deviceorientation', e => {
      if (state.mode !== 'tilt' || !sensorActive || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma))
          return;
      lastSample = Date.now();
      clearTimeout(timeout);
      if (!enabled()) {
          state.steer = null;
          paintTilt();
          return;
      }
      const rotation = globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0;
      const value = screenTilt(e.beta, e.gamma, rotation);
      if (neutral === null) {
          neutral = value;
          status.textContent = '';
      }
      state.steer = tiltSteer(value, neutral);
      paintTilt(state.steer);
  }
  );
  const rotated = () => {
      reset();
      resetSteering();
      neutral = null;
      if (state.mode === 'tilt' && sensorActive)
          status.textContent = 'დაიჭირე პირდაპირ სვლის პოზიციაში';
  }
  ;
  globalThis.screen?.orientation?.addEventListener('change', rotated);
  globalThis.addEventListener('orientationchange', rotated);
  let stored = 'wheel';
  try {
      stored = localStorage.getItem('courier-steering-mode') || 'wheel';
  } catch {}
  choose(stored);
  return {
      reset: resetSteering,
      update() {
          if (state.mode === 'tilt' && lastSample && Date.now() - lastSample > 700) {
              state.steer = 0;
              paintTilt();
              status.textContent = 'სენსორის მოლოდინი…';
          }
      }
  };
}
