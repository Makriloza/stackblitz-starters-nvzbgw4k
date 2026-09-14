import {onAvenue} from './moskovis-layout.js';
export class RealMap {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scale = 1.25;
        this.expanded = false;
        this.background = new Image();
        this.background.src = new URL('./assets/modern/map.png',import.meta.url).href;
        document.getElementById('zoomIn').onclick = () => this.scale = Math.min(5, this.scale * 1.3);
        document.getElementById('zoomOut').onclick = () => this.scale = Math.max(.6, this.scale / 1.3);
        document.getElementById('mapExpand').onclick = () => {
            this.expanded = !this.expanded;
            document.querySelector('.bottom-left').classList.toggle('large-map', this.expanded);
            document.getElementById('mapExpand').textContent = this.expanded ? '✕' : '⛶';
            document.getElementById('mapExpand').setAttribute('aria-expanded', String(this.expanded));
        }
        ;
        document.getElementById('mapLayer').hidden = true;
    }
    draw(player, heading, path, target) {
        const {canvas, ctx} = this
          , W = canvas.width
          , H = canvas.height
          , s = this.scale
          , xy = p => [(p.x - player.x) * s + W / 2, (p.z - player.z) * s + H / 2];
        ctx.fillStyle = '#a4ada0';
        ctx.fillRect(0, 0, W, H);
        if (this.background.complete && this.background.naturalWidth)
            ctx.drawImage(this.background, ...xy({
                x: -215,
                z: -215
            }), 430 * s, 430 * s);
        // Draw the connected avenue beyond the original map image.
        ctx.strokeStyle = '#606969';
        ctx.lineWidth = 9.4 * s;
        ctx.beginPath();
        ctx.moveTo(...xy({
            x: 202,
            z: -108
        }));
        ctx.lineTo(...xy({
            x: 345,
            z: -108
        }));
        ctx.stroke();
        ctx.strokeStyle = '#e4dfc5';
        ctx.lineWidth = Math.max(1, .16 * s);
        ctx.setLineDash([3 * s, 4 * s]);
        ctx.beginPath();
        ctx.moveTo(...xy({
            x: 219,
            z: -108
        }));
        ctx.lineTo(...xy({
            x: 342,
            z: -108
        }));
        ctx.stroke();
        ctx.setLineDash([]);
        if (path?.length) {
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            for (const [color,width] of [['#173844', 8], ['#ffd13c', 4]]) {
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.beginPath();
                path.forEach( (p, i) => i ? ctx.lineTo(...xy(p)) : ctx.moveTo(...xy(p)));
                ctx.stroke();
            }
        }
        if (target) {
            ctx.fillStyle = '#ffd13c';
            ctx.beginPath();
            ctx.arc(...xy(target), 7, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-heading);
        ctx.fillStyle = '#1486ed';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(8, 9);
        ctx.lineTo(0, 5);
        ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        document.getElementById('mapState').textContent = onAvenue(player.x, player.z) ? 'მოსკოვის გამზირი' : 'Modern City Block';
    }
}
