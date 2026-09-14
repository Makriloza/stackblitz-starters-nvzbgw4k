import*as T from './three.module.js';
export function createCockpit(camera) {
    const group = new T.Group()
      , trim = new T.MeshStandardMaterial({
        color: '#1a252c',
        roughness: .65
    })
      , metal = new T.MeshStandardMaterial({
        color: '#647882',
        metalness: .6,
        roughness: .3
    });
    camera.add(group);
    const box = (w, h, d, x, y, z, mat=trim) => {
        const m = new T.Mesh(new T.BoxGeometry(w,h,d),mat);
        m.position.set(x, y, z);
        group.add(m);
        return m;
    }
    ;
    box(1.5, .22, .23, 0, -.42, -.65);
    box(1.1, .055, .22, 0, -.28, -.72);
    for (const x of [-.45, .2, .45])
        for (let i = 0; i < 5; i++)
            box(.018, .065, .01, x + i * .026, -.36, -.521, metal);
    const wheel = new T.Group();
    wheel.position.set(-.21, -.29, -.42);
    group.add(wheel);
    const rim = new T.Mesh(new T.TorusGeometry(.145,.016,8,32),trim);
    wheel.add(rim);
    for (let i = 0; i < 3; i++) {
        const spoke = new T.Mesh(new T.BoxGeometry(.018,.135,.02),metal);
        spoke.position.set(Math.sin(i * 2.094) * .06, Math.cos(i * 2.094) * .06, 0);
        spoke.rotation.z = -i * 2.094;
        wheel.add(spoke);
    }
    const center = new T.Mesh(new T.CylinderGeometry(.044,.044,.022,16),trim);
    center.rotation.x = Math.PI / 2;
    wheel.add(center);
    const screen = document.createElement('canvas');
    screen.width = 256;
    screen.height = 128;
    const ctx = screen.getContext('2d')
      , texture = new T.CanvasTexture(screen);
    texture.colorSpace = T.SRGBColorSpace;
    box(.24, .1, .01, -.19, -.27, -.69, new T.MeshBasicMaterial({
        map: texture
    }));
    let lastSpeed = -1
      , lastType = '';
    return {
        group,
        update(speed, steering, type, visible) {
            group.visible = visible && !['bike', 'moped'].includes(type);
            wheel.rotation.z = steering * .8;
            const value = Math.round(Math.abs(speed) * 3.6);
            if (value === lastSpeed && type === lastType)
                return;
            lastSpeed = value;
            lastType = type;
            ctx.fillStyle = '#071822';
            ctx.fillRect(0, 0, 256, 128);
            ctx.fillStyle = '#b8eee6';
            ctx.textAlign = 'center';
            ctx.font = 'bold 68px sans-serif';
            ctx.fillText(String(value), 128, 79);
            ctx.font = '22px sans-serif';
            ctx.fillText('km/h', 128, 113);
            texture.needsUpdate = true;
        }
    };
}
