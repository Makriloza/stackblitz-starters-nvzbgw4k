import {createSteeringModes} from './steering-modes.js';
export const clampSteer = value => Math.max(-1, Math.min(1, value));
export function angleDelta(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
export function createMobileControls({enabled, getSpeed, onGearChange, notify}) {
    const state = {
        throttle: false,
        brake: false,
        steer: null,
        mode: 'wheel'
    };
    let modes;
    const wheel = document.getElementById('steeringWheel')
      , graphic = document.getElementById('wheelGraphic');
    const pedals = [['gasPedal', 'throttle'], ['brakePedal', 'brake']];
    const held = new Map();
    let wheelPointer = null
      , angle = 0
      , lastAngle = 0;
    const paint = () => {
        graphic.style.transform = `rotate(${angle}deg)`;
        wheel.setAttribute('aria-valuenow', String(Math.round(-angle / 120 * 100)));
    }
    ;
    function resetWheel() {
        wheelPointer = null;
        angle = 0;
        state.steer = null;
        wheel.classList.remove('held');
        paint();
    }
    function reset() {
        modes?.reset();
        held.clear();
        state.throttle = false;
        state.brake = false;
        resetWheel();
        for (const [id] of pedals) {
            const el = document.getElementById(id);
            el.classList.remove('held');
            el.setAttribute('aria-pressed', 'false');
        }
    }
    for (const [id,key] of pedals) {
        const el = document.getElementById(id);
        el.addEventListener('pointerdown', e => {
            if (!enabled() || e.button > 0 || held.has(id))
                return;
            e.preventDefault();
            held.set(id, e.pointerId);
            el.setPointerCapture(e.pointerId);
            state[key] = true;
            el.classList.add('held');
            el.setAttribute('aria-pressed', 'true');
        }
        );
        const end = e => {
            if (held.get(id) !== e.pointerId)
                return;
            held.delete(id);
            state[key] = false;
            el.classList.remove('held');
            el.setAttribute('aria-pressed', 'false');
        }
        ;
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
            el.addEventListener(type, end);
        el.addEventListener('contextmenu', e => e.preventDefault());
    }
    function pointerAngle(e) {
        const b = wheel.getBoundingClientRect()
          , x = e.clientX - b.left - b.width / 2
          , y = e.clientY - b.top - b.height / 2;
        return Math.hypot(x, y) < 18 ? null : Math.atan2(y, x);
    }
    wheel.addEventListener('pointerdown', e => {
        if (state.mode !== 'wheel' || !enabled() || e.button > 0 || wheelPointer !== null)
            return;
        e.preventDefault();
        wheelPointer = e.pointerId;
        lastAngle = pointerAngle(e);
        state.steer = 0;
        wheel.setPointerCapture(e.pointerId);
        wheel.classList.add('held');
    }
    );
    wheel.addEventListener('pointermove', e => {
        if (e.pointerId !== wheelPointer)
            return;
        if (!enabled()) {
            reset();
            return;
        }
        e.preventDefault();
        const next = pointerAngle(e);
        if (next !== null && lastAngle !== null) {
            angle = Math.max(-120, Math.min(120, angle + angleDelta(lastAngle, next) * 180 / Math.PI));
            state.steer = clampSteer(-angle / 120);
            paint();
        }
        lastAngle = next;
    }
    );
    const endWheel = e => {
        if (e.pointerId === wheelPointer)
            resetWheel();
    }
    ;
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        wheel.addEventListener(type, endWheel);
    wheel.addEventListener('keydown', e => {
        if (state.mode !== 'wheel' || !enabled() || !['ArrowLeft', 'ArrowRight', 'Home'].includes(e.code))
            return;
        e.preventDefault();
        e.stopPropagation();
        angle = e.code === 'Home' ? 0 : Math.max(-120, Math.min(120, angle + (e.code === 'ArrowLeft' ? -12 : 12)));
        state.steer = -angle / 120;
        paint();
    }
    );
    wheel.addEventListener('keyup', e => {
        if (['ArrowLeft', 'ArrowRight', 'Home'].includes(e.code)) {
            e.stopPropagation();
            resetWheel();
        }
    }
    );
    wheel.addEventListener('blur', resetWheel);
    wheel.addEventListener('contextmenu', e => e.preventDefault());
    globalThis.addEventListener('blur', reset);
    globalThis.addEventListener('resize', reset);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden)
            reset();
    }
    );
    const fullscreen = document.getElementById('fullscreenBtn');
    const active = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    function syncFullscreen() {
        const full = active();
        fullscreen.setAttribute('aria-pressed', String(full));
        fullscreen.setAttribute('aria-label', full ? 'სრული ეკრანიდან გამოსვლა' : 'სრულ ეკრანზე თამაში');
        fullscreen.querySelector('span').textContent = full ? 'გამოსვლა' : 'ეკრანი';
        reset();
        globalThis.dispatchEvent(new Event('resize'));
    }
    fullscreen.addEventListener('click', async () => {
        reset();
        try {
            if (active()) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                await exit.call(document);
            } else {
                const root = document.documentElement
                  , request = root.requestFullscreen || root.webkitRequestFullscreen;
                if (!request)
                    throw Error('Unavailable');
                await request.call(root);
            }
        } catch {
            notify('სრული ეკრანი ვერ ჩაირთო. გახსენი თამაშის ბმული პირდაპირ ტელეფონის ბრაუზერში; iPhone-ზე სცადე „მთავარ ეკრანზე დამატება“.');
        }
    }
    );
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    modes = createSteeringModes({
        state,
        reset,
        enabled,
        notify
    });
    return {
        state,
        reset,
        update: () => modes.update()
    };
}
