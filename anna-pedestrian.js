import * as T from './three.module.js';
import {createPerson} from './people.js';
import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/FBXLoader.js';
import {clone as cloneSkeleton} from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/utils/SkeletonUtils.js';

const MODEL_URL='./assets/anna-ipati/Anna Ipati.fbx';
let sourcePromise;

function loadSource(){
  if(sourcePromise)return sourcePromise;
  sourcePromise=new Promise((resolve,reject)=>{
    const loader=new FBXLoader();
    loader.setResourcePath('./assets/anna-ipati/textures/');
    loader.load(MODEL_URL,fbx=>{
      fbx.traverse(o=>{
        if(o.isMesh){
          o.castShadow=true;
          o.receiveShadow=true;
          if(o.material){
            const materials=Array.isArray(o.material)?o.material:[o.material];
            for(const m of materials){
              if(m.map)m.map.colorSpace=T.SRGBColorSpace;
              m.needsUpdate=true;
            }
          }
        }
      });
      const box=new T.Box3().setFromObject(fbx),size=new T.Vector3();
      box.getSize(size);
      const scale=size.y>0?1.72/size.y:1;
      fbx.scale.setScalar(scale);
      const fitted=new T.Box3().setFromObject(fbx);
      fbx.position.y-=fitted.min.y;
      resolve(fbx);
    },undefined,reject);
  });
  return sourcePromise;
}

export function createAnnaPedestrian(index=0){
  const root=new T.Group();
  root.name='AnnaPedestrian';
  const fallback=createPerson(index);
  root.add(fallback);
  root.userData.pose=(time,walk=0,reach=0)=>fallback.userData.pose?.(time,walk,reach);
  root.userData.ready=false;

  loadSource().then(source=>{
    const model=cloneSkeleton(source);
    model.rotation.y=Math.PI;
    while(root.children.length)root.remove(root.children[0]);
    root.add(model);
    const animations=source.animations||[];
    let mixer=null;
    if(animations.length){
      mixer=new T.AnimationMixer(model);
      const walkClip=animations.find(c=>/walk|walking/i.test(c.name))||animations[0];
      mixer.clipAction(walkClip).play();
    }
    let lastTime=null;
    root.userData.pose=(time,walk=0)=>{
      if(!mixer)return;
      const dt=lastTime===null?0:Math.max(0,Math.min(.1,time-lastTime));
      lastTime=time;
      mixer.timeScale=Math.max(.05,walk*1.5);
      mixer.update(dt);
    };
    root.userData.ready=true;
  }).catch(err=>{
    console.warn('Anna pedestrian model could not load; using fallback pedestrian.',err);
  });
  return root;
}
