/* 関門汽船 運転シミュレーター — 自然：流氷、クジラ、ヒグマ、ジャングルの動物と遺跡（観察ポイントに置く。ないステージでは何もしない） */
'use strict';
const NATURE = { floes:[], ice:null, actors:[], cool:0 };
const _nm=new THREE.Matrix4(), _nq=new THREE.Quaternion(), _ne=new THREE.Euler(), _np=new THREE.Vector3(), _ns=new THREE.Vector3();
const nMat = (hex,rough,extra) => new THREE.MeshStandardMaterial(Object.assign({color:lc(hex),roughness:rough===undefined?0.8:rough},extra));
function nPart(geo,mat,x,y,z,parent,sx,sy,sz){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); if(sx) m.scale.set(sx,sy,sz); parent.add(m); return m; }
const SPH=new THREE.SphereGeometry(1,14,10), BOX=new THREE.BoxGeometry(1,1,1), CYL=new THREE.CylinderGeometry(1,1,1,10);
/* the point on the bank nearest a sight that sits `off` metres out from the north or south shore */
const bankOf = s => ({ x:s.x, z:s.side==='n'?northZ(s.x):southZ(s.x), out:s.side==='n'?1:-1 });   // out: +z or -z points to open water

/* ============================================================
   Drift ice: floes fill the sea, leaving a lead along the course. They ride the swell and stop a careless ship.
   ============================================================ */
(function buildIce(){
  const I=STAGE.ice; if(!I) return;
  const A=PIERS[STAGE.piers[0].key], B=PIERS[STAGE.piers[1].key], path=[[A.bx,A.bz],...STAGE.gates,[B.bx,B.bz]];
  const toPath=(x,z)=>{ let best=1e9; for(let i=0;i<path.length-1;i++){ const [ax,az]=path[i],[bx,bz]=path[i+1], dx=bx-ax, dz=bz-az, t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1); best=Math.min(best,Math.hypot(x-ax-dx*t,z-az-dz*t)); } return best; };
  for(let tries=0;tries<I.n*12 && NATURE.floes.length<I.n;tries++){
    const x=I.x[0]+rnd()*(I.x[1]-I.x[0]), z=lerp(northZ(x)+I.shore,southZ(x)-I.shore,rnd()), r=4+Math.pow(rnd(),1.7)*13;
    if(toPath(x,z)<I.lane+r || NATURE.floes.some(f=>Math.hypot(f.x-x,f.z-z)<f.r+r+3)) continue;
    NATURE.floes.push({x,z,r,h:0.9+rnd()*1.1,rot:rnd()*6.28,ph:rnd()*6}); }
  NATURE.ice=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,0.86,1,7),nMat('#f3f8fb',0.75,{flatShading:true}),NATURE.floes.length);
  NATURE.ice.frustumCulled=false; NATURE.ice.castShadow=NATURE.ice.receiveShadow=true; scene.add(NATURE.ice);
})();
function iceBump(dt){
  if(!NATURE.floes.length) return; NATURE.cool-=dt; let hit=false;
  for(const f of NATURE.floes){ if(Math.abs(f.x-S.x)>f.r+14 || Math.abs(f.z-S.z)>f.r+14) continue;
    for(const [lx,lz] of HULL_PTS){ const [wx,wz]=shipPoint(lx,lz), dx=wx-f.x, dz=wz-f.z, d=Math.hypot(dx,dz)||1e-3; if(d>=f.r) continue;
      const push=(f.r-d)*0.5; S.x+=dx/d*push; S.z+=dz/d*push; hit=true; } }
  if(!hit) return;
  const sp=Math.hypot(S.u,S.v);
  if(sp>2.2 && NATURE.cool<=0 && game.state==='sailing'){ NATURE.cool=1.5; game.hits++; game.shake=0.5; sfx.thud(sp); toast('流氷に強く当たりました。氷の近くではゆっくり進んでください','warn'); }
  const k=Math.exp(-dt*1.8); S.u*=k; S.v*=k;   // ice drags on the hull
}

/* ============================================================
   Animals. Each builder returns an update(t,dt) that animates what it placed.
   ============================================================ */
const ACTORS = {
  /* humpback: surfaces, blows, arches and dives with a tail slap, over and over around the sight */
  whale(s){
    const mat=nMat('#2d3338',0.45,{side:THREE.DoubleSide}), parts=[ellipsoid(12,1.5,mat,0)]; parts[0].scale.y=1.3;
    parts.push(finTri([-2.2,1.6,0],[-3.4,1.5,0],[-3.3,2.3,0],mat));
    parts.push(finTri([-5.4,0,0],[-6.9,0.05,2.0],[-6.2,0,0],mat), finTri([-5.4,0,0],[-6.9,0.05,-2.0],[-6.2,0,0],mat));
    parts.push(finTri([-6.2,0,0],[-6.9,0.05,2.0],[-7.1,0,0.3],mat), finTri([-6.2,0,0],[-6.9,0.05,-2.0],[-7.1,0,-0.3],mat));
    parts.push(finTri([2,-0.8,1.1],[0.4,-1.1,2.6],[0.9,-0.9,1.0],mat), finTri([2,-0.8,-1.1],[0.4,-1.1,-2.6],[0.9,-0.9,-1.0],mat));
    const m=mkMesh(parts); m.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
    const e={t0:-99,dur:17,x:0,z:0,yaw:0,blown:false,s1:false,s2:false}, gap=4+rnd()*6;
    return (t)=>{ let u=(t-e.t0)/e.dur;
      if(u>1+gap/e.dur || u<0){ const a=rnd()*6.283, d=rnd()*30; Object.assign(e,{t0:t,x:s.x+Math.cos(a)*d,z:s.z+Math.sin(a)*d,yaw:rnd()*6.283,blown:false,s1:false,s2:false}); u=0; }
      if(u>1){ m.visible=false; return; }
      const f=[Math.cos(e.yaw),-Math.sin(e.yaw)], x=e.x+f[0]*38*(u-0.5), z=e.z+f[1]*38*(u-0.5), surf=waveH(x,z,t,6);
      let y=surf-2.3+2.4*Math.sin(Math.PI*Math.min(1,u/0.72)*0.5+Math.PI*0.25), pitch=0.05*Math.cos(Math.PI*u*2);
      if(u<0.2) y=surf-3.5+(u/0.2)*(3.5-2.3+2.4*Math.sin(Math.PI*0.25));
      if(u>0.66){ const k=(u-0.66)/0.34; pitch=-0.75*Math.min(1,k*1.6); y=surf+0.2-3.2*k*k-1.0*k; }
      m.visible=true; m.position.set(x,y,z); m.rotation.set(0,e.yaw,pitch);
      if(!e.s1 && u>0.18){ e.s1=true; splash(x+f[0]*4,z+f[1]*4,t,30,true); }
      if(!e.blown && u>0.3){ e.blown=true; const hx=x+f[0]*4.5, hz=z+f[1]*4.5; for(let k=0;k<220;k++) emit(hx+(rnd()-.5)*0.6,surf+0.8,hz+(rnd()-.5)*0.6,(rnd()-.5)*1.6,6+rnd()*6,(rnd()-.5)*1.6,1.4+rnd()*1.2,0.08+rnd()*0.35); sfx.splash(0.2,700,1.4,0.5); }
      if(!e.s2 && u>0.9){ e.s2=true; splash(x-f[0]*6,z-f[1]*6,t,60,true); } };
  },
  /* brown bears pacing the shoreline: a big one and a cub */
  bear(s){
    const b=bankOf(s), fur=nMat('#5a3d28',0.95), dark=nMat('#2a1c13',0.9), list=[];
    for(const [sc,dx,ph] of [[1,0,0],[0.55,5,1.7]]){ const g=new THREE.Group();
      nPart(SPH,fur,0,1.0,0,g,1.15,0.72,0.62); nPart(SPH,fur,0.75,1.35,0,g,0.5,0.45,0.42); nPart(SPH,fur,1.35,1.3,0,g,0.42,0.38,0.36);   // body, shoulder hump, head
      nPart(SPH,dark,1.72,1.22,0,g,0.2,0.16,0.17); for(const z of [-0.26,0.26]) nPart(SPH,fur,1.28,1.64,z,g,0.12,0.12,0.1);              // muzzle, ears
      const legs=[]; for(const [x,z] of [[0.7,-0.32],[0.7,0.32],[-0.7,-0.32],[-0.7,0.32]]){ const p=new THREE.Group(); p.position.set(x,0.85,z); nPart(CYL,fur,0,-0.42,0,p,0.2,0.85,0.2); g.add(p); legs.push(p); }
      g.scale.setScalar(sc*1.5); g.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); scene.add(g); list.push({g,legs,dx,ph}); }
    return (t)=>{ for(const a of list){ const w=t*0.16+a.ph, x=b.x+a.dx+Math.sin(w)*14, z=(s.side==='n'?northZ(x):southZ(x))-b.out*11, dir=Math.cos(w)>=0?1:-1;
        a.g.position.set(x,terrainH(x,z),z); a.g.rotation.y=dir>0?0:Math.PI;
        a.legs.forEach((p,i)=>p.rotation.z=Math.sin(t*3.2+a.ph+(i%3?Math.PI:0))*0.45*Math.abs(Math.cos(w))); } };
  },
  /* elephants standing in the shallows, one hosing itself with its trunk */
  elephant(s){
    const b=bankOf(s), skin=nMat('#7d7a78',0.95), tusk=nMat('#efe9d8',0.5), list=[];
    for(const [sc,dx,dz,ry] of [[1,0,9,0.4],[0.8,9,5,2.4],[0.5,4,3,1.2]]){ const g=new THREE.Group();
      nPart(SPH,skin,0,2.3,0,g,1.9,1.35,1.25); nPart(SPH,skin,1.9,2.9,0,g,0.95,1.0,0.9);                                             // body, head
      for(const z of [-1,1]){ nPart(SPH,skin,1.6,3.0,z*0.95,g,0.12,0.85,0.7); nPart(CYL,tusk,2.5,2.35,z*0.38,g,0.07,0.9,0.07).rotation.z=1.1; }  // ears, tusks
      for(const [x,z] of [[1.1,-0.7],[1.1,0.7],[-1.1,-0.7],[-1.1,0.7]]) nPart(CYL,skin,x,0.75,z,g,0.38,1.6,0.38);
      const trunk=new THREE.Group(); trunk.position.set(2.65,2.9,0); nPart(CYL,skin,0,-0.75,0,trunk,0.24,1.6,0.24); g.add(trunk);
      const x=b.x+dx, z=b.z+b.out*dz; g.position.set(x,Math.max(terrainH(x,z),-0.9),z); g.rotation.y=ry; g.scale.setScalar(sc*1.25);
      g.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); scene.add(g); list.push({g,trunk,sc,ph:rnd()*6}); }
    return (t)=>{ for(const a of list){ const c=(t*0.22+a.ph)%1, up=c>0.55 ? Math.sin((c-0.55)/0.45*Math.PI) : 0;   // now and then the trunk swings up and sprays
        a.trunk.rotation.z=0.25+up*2.3;
        if(up>0.85 && rnd()<0.6){ _np.set(0,-1.5,0).applyMatrix4(a.trunk.matrixWorld); for(let k=0;k<3;k++) emit(_np.x,_np.y,_np.z,(rnd()-.5)*2.5,3+rnd()*2.5,(rnd()-.5)*2.5,0.8+rnd()*0.5,dropSize(0.6)); } } };
  },
  /* hippos wallowing: backs and heads rise out of the water and sink again */
  hippo(s){
    const skin=nMat('#6b5a5c',0.6), list=[];
    for(let i=0;i<5;i++){ const g=new THREE.Group(); nPart(SPH,skin,0,0,0,g,1.9,0.95,1.05); nPart(SPH,skin,1.9,0.25,0,g,0.8,0.6,0.7); nPart(SPH,skin,2.5,0.1,0,g,0.55,0.42,0.6);
      for(const z of [-0.4,0.4]){ nPart(SPH,skin,1.75,0.82,z,g,0.13,0.16,0.1); nPart(SPH,nMat('#1a1414',0.3),2.15,0.72,z*0.9,g,0.08,0.08,0.08); }
      const a=rnd()*6.283, d=4+rnd()*16; g.rotation.y=rnd()*6.283; scene.add(g); list.push({g,x:s.x+Math.cos(a)*d,z:s.z+Math.sin(a)*d,ph:rnd()*6,sp:0.25+rnd()*0.2}); }
    return (t)=>{ for(const a of list){ const up=Math.sin(t*a.sp+a.ph); a.g.position.set(a.x,waveH(a.x,a.z,t,4)-0.75+up*0.45,a.z);
        if(up>0.97 && rnd()<0.08) addRipple(a.x,a.z,0.5,t); } };
  },
  /* crocodiles: some basking on the bank, one cruising with only its back showing */
  croc(s){
    const b=bankOf(s), hide=nMat('#3f5a2a',0.9), build=()=>{ const g=new THREE.Group(); nPart(SPH,hide,0,0.28,0,g,1.9,0.3,0.5); nPart(SPH,hide,2.2,0.24,0,g,0.95,0.2,0.3); nPart(SPH,hide,-2.6,0.2,0,g,1.5,0.14,0.18);
      for(const [x,z] of [[0.9,-0.6],[0.9,0.6],[-0.9,-0.6],[-0.9,0.6]]) nPart(BOX,hide,x,0.12,z,g,0.5,0.14,0.3); for(const z of [-0.2,0.2]) nPart(SPH,hide,1.75,0.46,z,g,0.11,0.1,0.11); scene.add(g); return g; };
    for(const [dx,ry] of [[-7,0.5],[2,1.2],[10,-0.4]]){ const g=build(), x=b.x+dx, z=(s.side==='n'?northZ(x):southZ(x))-b.out*3.5; g.position.set(x,terrainH(x,z)+0.05,z); g.rotation.y=ry+(b.out>0?-1.57:1.57); g.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); }
    const sw=build();
    return (t)=>{ const w=t*0.07, x=s.x+Math.cos(w)*16, z=s.z-b.out*8+Math.sin(w)*7; sw.position.set(x,waveH(x,z,t,4)-0.2,z); sw.rotation.y=-w-Math.PI/2+Math.sin(t*1.6)*0.12; };
  },
  /* an overgrown stone temple on the bank */
  temple(s){
    const b=bankOf(s), stone=nMat('#8a8674',0.95), moss=nMat('#5d7a44',0.95), g=new THREE.Group();
    for(let i=0;i<4;i++) nPart(BOX,i%2?moss:stone,0,1.2+i*2.3,0,g,22-i*4.6,2.4,18-i*3.8);
    nPart(BOX,stone,0,10.9,0,g,4.5,3,4.5); nPart(BOX,nMat('#1c1a16',1),0,2.4,9.1,g,3,4.2,0.4);
    for(const x of [-13,13]) for(const z of [9,14]){ nPart(CYL,stone,x*0.55,2.6,z,g,0.8,5.2,0.8); nPart(BOX,moss,x*0.55,5.4,z,g,2.2,0.5,2.2); }
    for(let i=0;i<5;i++) nPart(BOX,stone,0,0.25+i*0.25,10.5+i*0.9,g,5,0.3,1);
    const x=b.x, z=b.z-b.out*24; g.position.set(x,terrainH(x,z),z); g.rotation.y=b.out>0?0:Math.PI; scene.add(g); mergeGroup(g); g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    return null;
  },
};
ROUTE.sights.forEach(s=>{ const up=ACTORS[s.kind] && ACTORS[s.kind](s); if(up) NATURE.actors.push(up); });
function updateNature(dt,t){
  if(NATURE.ice) { NATURE.floes.forEach((f,i)=>{ _ne.set(Math.sin(t*0.7+f.ph)*0.03,f.rot,Math.sin(t*0.9+f.ph*1.3)*0.03); _nq.setFromEuler(_ne);
      _nm.compose(_np.set(f.x,waveH(f.x,f.z,t,4)+f.h*0.12,f.z),_nq,_ns.set(f.r,f.h,f.r)); NATURE.ice.setMatrixAt(i,_nm); }); NATURE.ice.instanceMatrix.needsUpdate=true; }
  for(const up of NATURE.actors) up(t,dt);
}
