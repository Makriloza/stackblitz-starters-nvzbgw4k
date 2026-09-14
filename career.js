export const VEHICLE_PRICES={gls:0,bike:0,moped:0,sedan:0,suv:0,van:0,sport:0,gt:0};
const base=Object.keys(VEHICLE_PRICES);
export function loadCareer(storage){
  try{
    const saved=JSON.parse(storage.getItem('tbilisi-courier-v2')||storage.getItem('tbilisi-courier-v1')||'null');
    if(saved&&Number.isFinite(saved.total)&&Number.isInteger(saved.delivered))return {
      total:Math.max(0,saved.total),delivered:Math.max(0,saved.delivered),
      unlocked:[...new Set([...base,...(Array.isArray(saved.unlocked)?saved.unlocked.filter(k=>k in VEHICLE_PRICES):[])])]
    };
  }catch{}
  return {total:0,delivered:0,unlocked:[...base]};
}
export function saveCareer(storage,state){try{storage.setItem('tbilisi-courier-v2',JSON.stringify(state));return true;}catch{return false;}}
export function unlockVehicle(state,type){
  if(!(type in VEHICLE_PRICES))return false;
  if(state.unlocked.includes(type))return true;
  state.unlocked.push(type);return true;
}
export function orderChallenge(index,metres){
  const kind=['standard','fragile','large'][index%3];
  return {kind,label:{standard:'ჩვეულებრივი მიტანა',fragile:'ფრთხილი მიტანა',large:'დიდი შეკვეთა'}[kind],
    limit:Math.ceil(Math.max(180,metres/6+90)),elapsed:0,collisions:0,bonus:kind==='large'?3:2,paid:false};
}
export function completeChallenge(challenge,basePay){
  if(challenge.paid)return null;
  challenge.paid=true;
  const eligible=challenge.elapsed<=challenge.limit&&(challenge.kind!=='fragile'||challenge.collisions===0);
  const bonus=eligible?challenge.bonus:0;
  return {pay:Math.round((basePay+bonus)*100)/100,bonus};
}
