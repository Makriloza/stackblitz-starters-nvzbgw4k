import {DATA,SEGMENTS,nearestStreet} from './logic.js';

// Reject pavement paths through mapped buildings or another road corridor.
const grid=new Map();
for(const b of DATA.buildings){
  const xs=b.p.map(p=>p[0]),zs=b.p.map(p=>p[1]);
  for(let x=Math.floor(Math.min(...xs)/40);x<=Math.floor(Math.max(...xs)/40);x++)
    for(let z=Math.floor(Math.min(...zs)/40);z<=Math.floor(Math.max(...zs)/40);z++){
      const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(b.p);
    }
}
export function insideBuilding(x,z){
  for(const poly of grid.get(Math.floor(x/40)+','+Math.floor(z/40))||[]){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const [ax,az]=poly[i],[bx,bz]=poly[j];
      if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
    }
    if(inside)return true;
  }return false;
}
export function clearPavement(x,z){
  const road=nearestStreet({x,z});
  if(road.dist<road.edge.width/2+.25)return false;
  return ![[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]].some(([dx,dz])=>insideBuilding(x+dx,z+dz));
}
export const SIDEWALKS=[];
SEGMENTS.forEach((e,index)=>{
  if(e.length<16||e.width<6)return;
  const dx=(e.q.x-e.p.x)/e.length,dz=(e.q.z-e.p.z)/e.length;
  for(const side of [-1,1]){
    const offset=side*(e.width/2+.8),at=u=>({x:e.p.x+dx*u+dz*offset,z:e.p.z+dz*u-dx*offset});
    let start=null,best=null;
    for(let u=3;u<=e.length-3;u+=1){
      const p=at(u);
      if(clearPavement(p.x,p.z)){if(start===null)start=u;if(!best||u-start>best[1]-best[0])best=[start,u];}
      else start=null;
    }
    if(best&&best[1]-best[0]>=7){
      const length=Math.min(32,best[1]-best[0]),mid=(best[0]+best[1])/2;
      SIDEWALKS.push({id:index+':'+side,e,side,a:at(mid-length/2),b:at(mid+length/2),length,dx,dz});
    }
  }
});
