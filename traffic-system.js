import * as T from './three.module.js';
import {SEGMENTS,START,nearestStreet,blocked} from './logic.js';
import {clearPavement} from './sidewalks.js';
import {createPerson} from './people.js';

export function lanePosition(point,next){
  const d=Math.hypot(next.x-point.x,next.z-point.z);if(d<.01)return {x:point.x,z:point.z};
  const e=nearestStreet(point).edge,offset=Math.min(1.65,Math.max(0,e.width/2-1.65));
  const p={x:point.x-(next.z-point.z)/d*offset,z:point.z+(next.x-point.x)/d*offset};
  return blocked(p.x,p.z,1.3)?{x:point.x,z:point.z}:p;
}
export const signalPhase=(time,offset=0)=>{const t=((time+offset)%32+32)%32;return {t,state:t<19?'green':t<22?'amber':'red',crossing:t>=23&&t<29};};
export function createSignals(scene){
  const selected=[];
  const candidates=SEGMENTS.filter(e=>e.width>=10&&e.width<=20&&e.length>30).sort((a,b)=>Math.hypot((a.p.x+a.q.x)/2-START.x,(a.p.z+a.q.z)/2-START.z)-Math.hypot((b.p.x+b.q.x)/2-START.x,(b.p.z+b.q.z)/2-START.z));
  const boxGeo=new T.BoxGeometry(1,1,1),poleGeo=new T.CylinderGeometry(.06,.06,3.2,8),dark=new T.MeshStandardMaterial({color:'#23383d'}),white=new T.MeshStandardMaterial({color:'#eee9da',roughness:.9});
  function box(group,mat,x,y,z,w,h,d){const m=new T.Mesh(boxGeo,mat);m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);return m;}
  for(const e of candidates){
    if(selected.length>=12)break;
    const x=(e.p.x+e.q.x)/2,z=(e.p.z+e.q.z)/2,dx=(e.q.x-e.p.x)/e.length,dz=(e.q.z-e.p.z)/e.length;
    if(selected.some(s=>Math.hypot(s.x-x,s.z-z)<155))continue;
    if(![-1,1].every(side=>clearPavement(x+dz*(e.width/2+.8)*side,z-dx*(e.width/2+.8)*side)))continue;
    const g=new T.Group();g.position.set(x,0,z);g.rotation.y=Math.atan2(dx,dz);scene.add(g);
    for(let u=-e.width/2+.4;u<e.width/2-.3;u+=1.05)box(g,white,u,.028,0,.55,.006,3.8);
    const lamps=[];
    for(const side of [-1,1]){
      const stand=new T.Mesh(poleGeo,dark);stand.position.set(side*(e.width/2+.5),1.6,side*4.2);g.add(stand);
      box(g,dark,side*(e.width/2+.5),3.25,side*4.2,.42,1.15,.32);
      for(let i=0;i<3;i++){
        const color=['#ff4a42','#ffbc43','#65e7a0'][i],mat=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.05});
        const lamp=new T.Mesh(new T.SphereGeometry(.12,8,6),mat);lamp.position.set(side*(e.width/2+.5),3.59-i*.34,side*4.39);g.add(lamp);lamps.push({mat,index:i});
      }
      box(g,white,side*e.width/4,.028,side*5.5,e.width/2-.3,.006,.22);
    }
    const actor=createPerson(selected.length+4);scene.add(actor);
    selected.push({g,x,z,dx,dz,width:e.width,lamps,actor,offset:selected.length*2.7,state:'green'});
  }
  return {
    items:selected,
    update(time,player){
      for(const s of selected){
        const phase=signalPhase(time,s.offset);s.state=phase.state;
        s.g.visible=Math.hypot(player.x-s.x,player.z-s.z)<500;
        for(const {mat,index} of s.lamps)mat.emissiveIntensity=index===({red:0,amber:1,green:2}[phase.state])?2:.025;
        s.actor.visible=s.g.visible;
        const u=phase.t<23?0:phase.t<29?(phase.t-23)/6:1;
        const side=(Math.floor((time+s.offset)/32)%2===0?1:-1),offset=(.5-u)*(s.width+1.6)*side;
        s.actor.position.set(s.x+s.dz*offset,.15,s.z-s.dx*offset);s.actor.rotation.y=Math.atan2(s.dz*side,-s.dx*side);s.actor.userData.pose(time,phase.crossing?.8:0,0);s.actor.position.y+=.18;
      }
    },
    stopDistance(position,heading){
      let best=Infinity;const fx=-Math.sin(heading),fz=-Math.cos(heading);
      for(const s of selected){if(s.state==='green')continue;
        if(Math.abs(fx*s.dx+fz*s.dz)<.7)continue;
        const vx=s.x-position.x,vz=s.z-position.z,ahead=vx*fx+vz*fz,lateral=Math.abs(vx*fz-vz*fx);
        if(ahead>2.5&&ahead<35&&lateral<s.width/2+1)best=Math.min(best,Math.max(0,ahead-7));
      }return best;
    }
  };
}
