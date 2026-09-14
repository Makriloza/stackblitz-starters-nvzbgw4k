// Metres, Y up. The supplied street points along local -Z; turn it east.
export const AVENUE={x:222,z:-108,length:120,width:9.4,rotation:-Math.PI/2,entry:{x:202,z:-110}};
export function avenueLocal(x,z){return {x:z-AVENUE.z,z:AVENUE.x-x};}
export function onAvenue(x,z){return x>=219&&x<=345&&Math.abs(z-AVENUE.z)<=20;}
export function avenueSurface(x,z,ground){
 const p=avenueLocal(x,z);
 if(x>=202&&x<219&&Math.abs(z-AVENUE.z)<=4.7)return ground;
 if(x>=219&&x<=345&&((p.z>=0&&p.z<=3)||(p.z<=-120&&p.z>=-123))&&Math.abs(p.x)<=13.5)return ground;
 if(p.z>0||p.z< -120)return x>=220&&x<=344&&Math.abs(p.x)<=20?ground-.075:null;
 if(Math.abs(p.x)<=4.7)return ground;
 if(Math.abs(p.x)>=4.7&&Math.abs(p.x)<=7.7)return ground+.16;
 if(p.x<=-8&&p.x>=-19)return ground+.02;
 return Math.abs(p.x)<=20?ground-.075:null;
}
export function signalPhase(t){const s=((t%32)+32)%32;return s<18?'green':s<21?'amber':'red';}
