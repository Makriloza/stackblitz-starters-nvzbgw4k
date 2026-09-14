import layout from './modern-layout.js';
export function attachDistrict(data){
 Object.assign(data,{nodes:layout.nodes,roads:layout.roads,buildings:[],water:[],origin:[41.696,44.802]});
 data.nodes=layout.nodes.map(p=>p.slice());data.roads=layout.roads.map(r=>r.slice());
 const entry=data.nodes.findIndex(([x,z])=>x===202&&z===-110);
 if(entry<0)throw Error('Avenue connection road not found');
 let previous=entry;
 for(const [i,x] of [202,219,222,282,342].entries()){
  const next=data.nodes.length;data.nodes.push([x,-108]);
  data.roads.push([previous,next,9.4,'მოსკოვის გამზირი',2000+i]);previous=next;
 }
 return {spawn:{x:234,z:-108},heading:-Math.PI/2,contains:()=>true};
}
