export function createRenderBudget(renderer,scene,sun){
  let quality='medium',adaptive=true,elapsed=0,frames=0,last=-Infinity,ratio=Math.min(globalThis.devicePixelRatio||1,1.35);
  const caps={low:1,medium:1.35,high:1.8,ultra:2.5},distances={low:110,medium:190,high:270,ultra:380};
  const chunks=[];scene.traverse(o=>{if(o.userData.cityChunk)chunks.push(o);});
  return {
    setQuality(q){quality=q;ratio=Math.min(globalThis.devicePixelRatio||1,caps[q]);renderer.setPixelRatio(ratio);},
    setAdaptive(value){adaptive=value;},
    update(player,dt,time){
      elapsed+=dt;frames++;
      if(elapsed>3){const fps=frames/elapsed;if(adaptive){const next=fps<27?Math.max(.75,ratio-.1):fps>48?Math.min(globalThis.devicePixelRatio||1,caps[quality],ratio+.05):ratio;if(Math.abs(next-ratio)>.02){ratio=next;renderer.setPixelRatio(ratio);}}elapsed=0;frames=0;}
      if(time-last<.25)return;last=time;
      for(const mesh of chunks){const c=mesh.userData.cityChunk;const d=Math.hypot(c.x-player.x,c.z-player.z);mesh.visible=d<(c.detail?distances[quality]:quality==='low'?600:950);mesh.castShadow=c.shadow&&d<(quality==='low'?0:160);}
    }
  };
}
