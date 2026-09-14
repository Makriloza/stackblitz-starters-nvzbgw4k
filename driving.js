const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
export function steeringAngle(speed,vehicle){
 const wheelbase=vehicle.wheelbase|| (vehicle.radius<.8?1.25:2.8);
 return Math.min(.78*vehicle.turn,Math.atan(11*wheelbase/(speed*speed+5)));
}
export function stepDriving(state,input,vehicle,dt){
  dt=Math.max(0,Math.min(dt,.05));
  const targetSteer=Number.isFinite(input.steer)?Math.max(-1,Math.min(1,input.steer)):(input.left?1:0)-(input.right?1:0);
  const previous=state.steering||0;
  const response=targetSteer===0?7:previous*targetSteer<0?8:5.5;
  const steering=damp(previous,targetSteer,response,dt);
  let speed=state.speed,directionLock=state.directionLock||0;
  const forward=!!input.forward,back=!!input.back;
  if((directionLock===-1&&!back)||(directionLock===1&&!forward))directionLock=0;
  const stop=rate=>{speed=Math.sign(speed)*Math.max(0,Math.abs(speed)-rate*dt)||0;};
  // The same brake/reverse pedal stops first, then reverses while held.
  directionLock=0;
  if(input.brake||(forward&&back))stop(16);
  else if(back){
    if(speed>0)stop(14);
    else speed-=3.4*dt;
  }else if(forward){
    if(speed<0)stop(14);
    else speed+=vehicle.accel*(1-.35*speed/vehicle.max)*dt;
  }else stop(.45+.0018*speed*speed);
  speed=Math.max(-3.3,Math.min(vehicle.max,speed));
  const acceleration=dt>0?(speed-state.speed)/dt:0;
  const wheelAngle=steering*steeringAngle(speed,vehicle);
  const yaw=speed*Math.tan(wheelAngle)/(vehicle.wheelbase||(vehicle.radius<.8?1.25:2.8));
  return {speed,directionLock,steering,heading:state.heading+yaw*dt,acceleration,wheelAngle};
}

export function cameraHeight(type){return {gls:1.55,bike:1.7,moped:1.65,sedan:1.22,suv:1.49,van:1.9,sport:1.02,gt:1.02}[type]||1.22;}
