// Original Web Audio synthesis: no samples, music downloads or autoplay.
export class GameSound{
  constructor(){this.enabled=true;this.volume=.35;this.context=null;this.failed=false;}
  async start(){
    if(this.failed||!this.enabled)return;
    try{
      if(!this.context){
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)return;
        const c=this.context=new Context(),master=this.master=c.createGain();master.gain.value=0;master.connect(c.destination);
        this.engine=c.createOscillator();this.engine.type='triangle';this.engineGain=c.createGain();this.engineGain.gain.value=0;this.engine.connect(this.engineGain).connect(master);this.engine.start();
        const noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate),channel=noise.getChannelData(0);let value=0;
        for(let i=0;i<channel.length;i++){value=.98*value+.02*(Math.random()*2-1);channel[i]=value*3;}
        const source=c.createBufferSource();source.buffer=noise;source.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;
        this.roadGain=c.createGain();this.roadGain.gain.value=0;source.connect(filter).connect(this.roadGain).connect(master);source.start();
      }
      await this.context.resume();
    }catch{this.failed=true;}
  }
  update(speed,type,accelerating,paused){
    if(!this.context||this.failed)return;const t=this.context.currentTime;
    this.master.gain.setTargetAtTime(this.enabled&&!paused?this.volume:0,t,.12);
    const bicycle=type==='bike',s=Math.abs(speed);
    this.engine.frequency.setTargetAtTime(38+s*3.5+(accelerating?12:0),t,.12);
    this.engineGain.gain.setTargetAtTime(bicycle?0:.06+(accelerating?.035:0),t,.12);
    this.roadGain.gain.setTargetAtTime(.015+Math.min(s/50,.7),t,.2);
  }
  cue(kind){
    if(!this.context||!this.enabled||this.failed)return;
    const notes={offer:[660,880],pickup:[520,660],complete:[523,659,784],unlock:[440,554,659,880]}[kind]||[440];
    const c=this.context;
    notes.forEach((frequency,i)=>{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+i*.11;o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.13,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+.22);o.connect(g).connect(this.master);o.start(t);o.stop(t+.23);o.onended=()=>{o.disconnect();g.disconnect();};});
  }
}
