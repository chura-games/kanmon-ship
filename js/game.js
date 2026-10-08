/* 関門汽船 運転シミュレーター — ゲーム：時刻・波の設定、操船物理、泡粒、海の生き物、排気、着岸・係留 */
'use strict';

/* ============================================================
   Presets: time of day / sea state
   ============================================================ */
const TOD = {
  day:  {label:'昼', top:'#2f6fc4',hor:'#b8d5ec',fog:'#a9c3d6',sun:[-0.45,0.72,-0.35],sunCol:'#fff2dc',sunI:3.0,amb:'#9dbbd8',ambI:1.0,hemiSky:'#cfe3f5',hemiGround:'#5f6a52',hemiI:0.75,dirI:2.3,night:0,fogD:0.00022,exp:0.9,cloud:'#ffffff',cloudI:1.1},
  dusk: {label:'夕方', top:'#26356a',hor:'#f19a5e',fog:'#b98a7c',sun:[-0.93,0.07,-0.25],sunCol:'#ffa45c',sunI:2.6,amb:'#6b5d78',ambI:0.9,hemiSky:'#f0b08a',hemiGround:'#3b3340',hemiI:0.6,dirI:2.0,night:0.4,fogD:0.00028,exp:1.0,cloud:'#ffb488',cloudI:0.9},
  night:{label:'夜', top:'#02040c',hor:'#0f1a33',fog:'#0b1224',sun:[0.35,0.55,-0.6],sunCol:'#8fa6e0',sunI:0.35,amb:'#1c2848',ambI:0.6,hemiSky:'#2a3a66',hemiGround:'#0a0c12',hemiI:0.35,dirI:0.25,night:1,fogD:0.0003,exp:1.25,cloud:'#1b2340',cloudI:1.0},
};
const TOD_ORDER=['day','dusk','night'];
let todKey='day';
function applyTOD(key){
  todKey=key; const p=TOD[key];
  U.uSkyTop.value.copy(lc(p.top)); U.uSkyHor.value.copy(lc(p.hor)); U.uFogColor.value.copy(lc(p.fog));
  U.uSunDir.value.set(...p.sun).normalize();
  U.uSunColor.value.copy(lc(p.sunCol)).multiplyScalar(p.sunI);
  U.uAmbient.value.copy(lc(p.amb)).multiplyScalar(p.ambI);
  U.uFogDensity.value=p.fogD; U.uNight.value=p.night; U.uCloudCol.value.copy(lc(p.cloud)).multiplyScalar(p.cloudI);
  scene.fog.color.copy(U.uFogColor.value); scene.fog.density=p.fogD;
  hemi.color.copy(lc(p.hemiSky)); hemi.groundColor.copy(lc(p.hemiGround)); hemi.intensity=p.hemiI;
  sun.color.copy(lc(p.sunCol)); sun.intensity=p.dirI;
  renderer.toneMappingExposure=p.exp;
  M.glass.emissiveIntensity=p.night*0.35; IN.night=p.night; setCabinLight();
  for(const k in PIERS) if(PIERS[k].signMat) PIERS[k].signMat.emissiveIntensity=p.night*0.6;
  SIGNS.forEach(m=>m.material.emissiveIntensity=p.night*0.5);
  glowSprites.forEach(s=>{ s.material.opacity = s.userData.always ? 1 : Math.max(0.0, p.night*1.0); s.visible = p.night>0.05 || s.userData.always; });
  if(envRT) envRT.dispose();
  envRT=pmrem.fromScene(envScene,0.02); scene.environment=envRT.texture;
  $('#vTod').textContent=p.label;
}
const SEA=[{label:'穏やか',a:0.35},{label:'普通',a:0.75},{label:'荒れ',a:1.45}];
let seaIdx=1;
function applySea(i){ seaIdx=i; waveAmp=SEA[i].a; U.uAmp.value=waveAmp; $('#vSea').textContent=SEA[i].label; }

/* ============================================================
   Game state & physics
   ============================================================ */
const S = { x:0,z:0,psi:0,u:0,v:0,r:0,throttle:0,rudder:0,thr:0, y:0,vy:0,pitch:0,vp:0,roll:0,vr:0 };
const game = { state:'intro', from:STAGE.piers[0].key, to:STAGE.piers[1].key, t0:0, elapsed:0, hits:0, departed:false, tide:true, simT:0, shake:0, msgT:0, dockInfo:null };
const input = { up:false, down:false, left:false, right:false, q:false, e:false, rudTouch:null, thTouch:0 };
const VMAX=11, ACC=1.6, KD=ACC/(VMAX*VMAX);
function currentAt(x){ if(!game.tide) return 0; return STAGE.tide.amp*Math.sin(game.simT*2*Math.PI/900+0.9)*(1+STAGE.tide.narrows*bumpX(x)); }
function placeAtBerth(key){ const P=PIERS[key]; Object.assign(S,{x:P.bx,z:P.bz,psi:0,u:0,v:0,r:0,throttle:0,rudder:0,thr:0,y:0,vy:0,pitch:0,vp:0,roll:0,vr:0}); }
function shipPoint(lx,lz){ const c=Math.cos(S.psi), s=Math.sin(S.psi); return [S.x+c*lx+s*lz, S.z-s*lx+c*lz]; }
const HULL_PTS=[[SHIP_L*0.49,0],[SHIP_L*0.3,SHIP_B*0.44],[SHIP_L*0.3,-SHIP_B*0.44],[SHIP_L*0.12,SHIP_B*0.52],[SHIP_L*0.12,-SHIP_B*0.52],[-SHIP_L*0.2,SHIP_B*0.52],[-SHIP_L*0.2,-SHIP_B*0.52],[-SHIP_L*0.47,SHIP_B*0.51],[-SHIP_L*0.47,-SHIP_B*0.51],[-SHIP_L*0.5,0]];
function cargoHit(t){
  for(const c of cargos){
    const ang=c.dir>0?0:Math.PI;
    for(const [lx,lz] of HULL_PTS){
      const [wx,wz]=shipPoint(lx,lz);
      const dx=wx-c.x, dz=wz-c.z, ca=Math.cos(ang), sa=Math.sin(ang);
      const lx2=dx*ca-dz*sa, lz2=dx*sa+dz*ca;
      if(Math.abs(lx2)<c.len/2 && Math.abs(lz2)<c.beam/2){
        const push=Math.sign(lz2||1)*(c.beam/2-Math.abs(lz2)+0.5);
        S.x+=sa*push; S.z+=ca*push;
        if(game.state==='sailing'){ game.hits++; game.shake=1.2; toast('大型船と接触しました','warn'); sfx.thud(5); addRipple(wx,wz,2.5,t);
          for(let i=0;i<80;i++) emit(wx,0.5,wz,(rnd()-.5)*6,3+rnd()*6,(rnd()-.5)*6,1.2+rnd(),1+rnd()); }
        S.u*=-0.3; S.v=0; return;
      }
    }
  }
}
let slapCool=0, lastWakeT=0, bobRip=0, churn=0, burstCool=0;
/* waterline stations (13 along the hull, starboard then port): sea level in the hull's frame, how fast it climbs the side, and the lingering impact */
const WL={N:13, y:new Float32Array(26).fill(NaN), rise:new Float32Array(26)};
function wlHalf(lx,side){ const u=clamp(lx/SHIP_L+0.5,0,1)*(WL.N-1), i=Math.min(WL.N-2,Math.floor(u)), o=side>0?0:WL.N; return lerp(U.uWL.value[o+i],U.uWL.value[o+i+1],u-i); }
function stepShip(dt,t){
  // controls
  if(autoTick(dt)){ /* the autopilot has the controls */ }
  else if(game.state==='sailing'){
    const keys=!walking();   // in the cabin and passenger views the keys walk a person instead
    if(keys && input.up) S.throttle=Math.min(1,S.throttle+dt*0.6);
    if(keys && input.down) S.throttle=Math.max(-0.5,S.throttle-dt*0.6);
    let rt = input.rudTouch!==null ? input.rudTouch : keys ? (input.left?-1:0)+(input.right?1:0) : 0;
    if(input.rudTouch===null && rt===0) S.rudder = Math.abs(S.rudder)<dt*0.9?0:S.rudder-Math.sign(S.rudder)*dt*0.9;
    else if(input.rudTouch!==null) S.rudder = rt;
    else S.rudder = clamp(S.rudder+rt*dt*1.4,-1,1);
    S.thr = ((keys&&input.q)||input.thTouch<0?-1:0)+((keys&&input.e)||input.thTouch>0?1:0);
  } else { S.thr=0; }
  // surge
  const accel = S.throttle*ACC*(1-0.35*Math.min(1,ROUTE.flood)) - KD*S.u*Math.abs(S.u) - 0.03*S.u;   // a flooded hull is sluggish
  S.u += accel*dt;
  const low = 1-clamp(Math.abs(S.u)/5,0,1);
  const flow = S.u + 2.6*S.throttle;
  const rT = -S.rudder*0.0125*flow - S.rudder*0.08*low*(0.45+Math.abs(S.throttle));
  S.r += (rT-S.r)*Math.min(1,dt*1.3);
  S.psi += S.r*dt;
  const vT = S.r*S.u*0.22 + S.thr*1.05*low;
  S.v += (vT-S.v)*Math.min(1,dt*1.4);
  const c=Math.cos(S.psi), s=Math.sin(S.psi), cur=currentAt(S.x);
  S.x += (c*S.u + s*S.v + cur)*dt;
  S.z += (-s*S.u + c*S.v)*dt;
  whirlPull(dt); iceBump(dt);
  fenderCool-=dt; collide(t); cargoHit(t);
  if(dock.hold>0) holdAtBerth(dt,dock.hold);
  // buoyancy: the hull settles onto the plane that best fits the sea under its whole footprint (wider sections carry more),
  // so it rides over chop shorter than itself; the same stations give the real waterline and where waves strike the hull
  const spf=clamp(S.u/VMAX,0,1), sinP=Math.sin(S.pitch), sinR=Math.sin(S.roll), wl=U.uWL.value, slapU=U.uSlap.value;
  let sw=0, swx=0, swh=0, swxx=0, swxh=0, swzz=0, swzh=0, bowRise=0, sideRise=0;
  for(let i=0;i<WL.N;i++){ const st=i/(WL.N-1), lx=(st-0.5)*SHIP_L, w=HULLF.deckHalf(st);
    for(const sd of [1,-1]){ const lz=sd*w*0.9, k=sd>0?i:WL.N+i; const [wx,wz]=shipPoint(lx,lz); const h=waveH(wx,wz,t);
      sw+=w; swx+=w*lx; swh+=w*h; swxx+=w*lx*lx; swxh+=w*lx*h; swzz+=w*lz*lz; swzh+=w*lz*h;
      const yl=h-(S.y+lx*sinP-lz*sinR), r=(yl-WL.y[k])/Math.max(dt,1e-3);
      WL.y[k]=yl; WL.rise[k]=r===r?clamp(r,-6,6):0; wl[k]=HULLF.halfAt(st,yl);
      const hit=wl[k]>0.05?Math.max(0,WL.rise[k]-0.25)*(1+1.5*spf*st):0;   // water climbing the side, harder toward the bow at speed
      slapU[k]=Math.max(slapU[k]*Math.exp(-dt*0.55),clamp(hit*0.8,0,1));
      if(st>=0.7) bowRise=Math.max(bowRise,WL.rise[k]); else sideRise=Math.max(sideRise,hit);
      // spray and foam thrown off where the wave lands
      let q=hit*(0.4+hit)*240*dt; q=Math.floor(q)+(rnd()<q%1?1:0);
      for(let j=0;j<q;j++){ const ex=lx+(rnd()-.5)*SHIP_L/(WL.N-1), ez=sd*(wl[k]+0.05); const [px,pz]=shipPoint(ex,ez);
        const out=1.0+rnd()*2.0+hit*1.3, up=1.2+rnd()*1.8+hit*2.2;
        emit(px,h+0.05,pz,c*S.u*0.5+s*sd*out+cur,up,-s*S.u*0.5+c*sd*out,0.5+rnd()*0.8,dropSize(0.5+hit*0.4));
        if(rnd()<0.2) fleck(px+s*sd*rnd()*0.8,pz+c*sd*rnd()*0.8,8+rnd()*8,0.12+rnd()*0.2); } } }
  const mx=swx/sw, slope=(swxh-mx*swh)/(swxx-mx*swx), heel=swzh/swzz;
  const yT=swh/sw-slope*mx + spf*0.25 - ROUTE.flood*1.15;   // she sits lower as she takes on water
  S.vy += ((yT-S.y)*14 - S.vy*4.5)*dt; S.y += S.vy*dt;
  const pT=Math.atan(slope) + spf*0.04 + (accel>0?accel*0.004:0);
  S.vp += ((pT-S.pitch)*10 - S.vp*4)*dt; S.pitch += S.vp*dt;
  const roT=Math.atan(-heel)*0.8 + S.r*S.u*0.035 + Math.max(0,ROUTE.flood-1)*0.45;
  S.vr += ((roT-S.roll)*7 - S.vr*2.4)*dt; S.roll += S.vr*dt;
  ferry.position.set(S.x,S.y,S.z); ferry.rotation.set(S.roll,S.psi,S.pitch);
  // bow spray & slams
  // getting under way: power is on but she is still slow, so the jets thrash the water and foam boils up all round the hull
  churn+=(clamp(Math.abs(S.throttle)*1.5+Math.abs(S.thr)*0.8-Math.abs(S.u)/VMAX*2.2,0,1)-churn)*Math.min(1,dt*2.5); U.uChurn.value=churn;
  if(churn>0.03){ let q=churn*260*dt; q=Math.floor(q)+(rnd()<q%1?1:0);
    for(let i=0;i<q;i++){ const sd=rnd()<.5?1:-1, lx=(rnd()-0.5)*SHIP_L*0.98, lz=sd*(wlHalf(lx,sd)+rnd()*1.8); const [px,pz]=shipPoint(lx,lz);
      fleck(px,pz,7+rnd()*8,0.14+rnd()*0.24);
      if(rnd()<0.6) emit(px,S.y+0.1,pz,s*sd*(0.5+rnd()*1.5)+cur,0.8+rnd()*1.8*churn,c*sd*(0.5+rnd()*1.5),0.4+rnd()*0.5,dropSize(0.7)); } }
  const slam = clamp(bowRise*spf*0.9,0,3);
  // a hard meeting with a sea: sheets of water thrown up and out from both bows, with a thump
  burstCool-=dt;
  if(slam>0.55 && burstCool<=0){ burstCool=0.9+rnd()*0.5; game.shake=Math.max(game.shake,0.1+0.1*slam); sfx.slam(slam);
    const nb=Math.floor(380+slam*600);
    for(let i=0;i<nb;i++){ const sd=i&1?1:-1, lx=SHIP_L*(0.16+rnd()*0.26), lz=sd*(wlHalf(lx,sd)+0.1+rnd()*0.6); const [px,pz]=shipPoint(lx,lz);
      const out=3+rnd()*6+slam*2, up=4+rnd()*6+slam*2.2, fw=S.u*(0.55+rnd()*0.35);
      emit(px,S.y+0.2+rnd()*0.8,pz,c*fw+s*sd*out+cur,up,-s*fw+c*sd*out,1.0+rnd()*1.4,rnd()<0.7?0.03+rnd()*0.09:0.12+rnd()*0.3*(0.6+slam*0.4)); }
    addRipple(...shipPoint(SHIP_L*0.3,0),1.4+slam*0.5,t); }
  slapCool-=dt; if(slapCool<=0){ if(slam>0.3){ sfx.slap(slam*1.5); slapCool=0.28+rnd()*0.2; } else if(sideRise>0.6){ sfx.slap(sideRise*0.6); slapCool=0.45+rnd()*0.35; } }
  const rate = (spf*spf*3200 + spf*400 + slam*3600)*dt;
  let n = Math.floor(rate) + (rnd()<rate%1?1:0);
  for(let i=0;i<n;i++){
    const side = rnd()<.5?1:-1, lx=SHIP_L*(0.05+rnd()*0.3), lz=side*(wlHalf(lx,side)+0.05+rnd()*1.4*spf);
    const [wx,wz]=shipPoint(lx,lz);
    const out=2.5+rnd()*5*spf+slam*3, up=1.5+rnd()*4.5*spf+slam*4;
    const vx=c*S.u*0.55 + s*side*out + cur, vz=-s*S.u*0.55 + c*side*out;
    emit(wx, S.y+0.1+rnd()*0.5*spf, wz, vx*(0.85+rnd()*0.3), up*(0.7+rnd()*0.6), vz*(0.85+rnd()*0.3), 0.7+rnd()*1.2, dropSize(0.6+spf+slam*0.5));
  }
  bowSheet.update(spf,t);
  { let q=(spf*spf*2200)*dt; q=Math.floor(q)+(rnd()<q%1?1:0);
    for(let i=0;i<q;i++){ const side=rnd()<.5?1:-1, u=rnd()*0.7, xh=lerp(8.2,-3.5,u), hw=bowSheet.hwAt(xh), W=(0.9+3.4*u)*(0.5+0.8*spf);
      const lx=xh-0.4*(1.2+2.2*spf), lz=side*(hw+0.06+0.4*W); const [wx,wz]=shipPoint(lx,lz);
      const out=1.5+rnd()*3.5*spf, up=1+rnd()*3.2*spf;
      emit(wx,S.y+0.4+rnd()*0.8*spf,wz,c*S.u*0.7+s*side*out+cur,up,-s*S.u*0.7+c*side*out,0.6+rnd()*0.9,dropSize(0.8)); } }
  // prop wash at the stern
  const pw=(Math.abs(S.throttle)*700 + spf*480)*dt; n=Math.floor(pw)+(rnd()<pw%1?1:0);
  for(let i=0;i<n;i++){ const [wx,wz]=shipPoint(-SHIP_L*0.5-0.5,(rnd()-.5)*3); emit(wx,S.y+0.1,wz,(rnd()-.5)*2-c*S.throttle*3,0.8+rnd()*2.4*(0.4+Math.abs(S.throttle)),(rnd()-.5)*2+s*S.throttle*3,0.5+rnd()*0.6,dropSize(1.6)); }
  // ripples from the hull while slow
  bobRip-=dt; if(bobRip<=0 && Math.abs(S.u)<2.5){ addRipple(S.x+(rnd()-.5)*10,S.z+(rnd()-.5)*4,0.6+waveAmp*0.3,t); bobRip=1.1+rnd()*0.8; }
  // wake emission
  const [tx,tz]=shipPoint(-SHIP_L*0.5,0);
  const speed=Math.hypot(S.u,S.v), str=clamp(Math.max(speed/7,Math.abs(S.throttle)*0.5),0,1);
  const lastP=wakeT.last();
  if(!lastP || Math.hypot(tx-lastP.x,tz-lastP.z)>2.2 || t-lastP.t>1.5){
    if(speed>0.3||Math.abs(S.throttle)>0.1){ wakeT.add(tx,tz,s,c,str,Math.max(speed,1),t); wakeK.add(tx,tz,s,c,clamp((speed-2)/6,0,1),speed,t); }
  }
  const drift=cur*dt;
  wakeT.update(t,{x:tx,z:tz,sx:s,sz:c,str,sp:Math.max(speed,1),t},drift);
  wakeK.update(t,{x:tx,z:tz,sx:s,sz:c,str:clamp((speed-2)/6,0,1),sp:speed,t},drift);
  U.uShip.value.set(S.x,S.z,S.psi,S.u);
  { const w=U.uWake.value; w.x+=(S.u-w.x)*Math.min(1,dt/3.5); w.y=Math.exp(-Math.abs(S.u-w.x)*1.1); }   // see kelvin() in js/core.js
  // flag & radar
  const ud=ferry.userData; ud.radar.rotation.y+=dt*2.6;
  const fp=ud.flagGeo.attributes.position, fb=ud.flagBase; for(let i=0;i<fp.count;i++){ const x=fb[i*3]; fp.array[i*3+2]=(Math.sin(x*5-t*9)*0.12+Math.sin(x*3.1-t*5.3)*0.05)*x*(0.6+spf); }
  fp.needsUpdate=true; ud.flagGeo.computeVertexNormals();
  const ep=ud.ensGeo.attributes.position, eb=ud.ensBase; for(let i=0;i<ep.count;i++){ const x=-eb[i*3]; ep.array[i*3+2]=(Math.sin(x*5-t*8.3+1)*0.11+Math.sin(x*2.7-t*4.9)*0.05)*x*(0.6+spf); } ep.needsUpdate=true; ud.ensGeo.computeVertexNormals();
}
/* tiny floating foam flecks: shed by the wake, by landing spray, by breaking crests and against walls; they drift with the tide */
const FL_N=11000, FL_LONG=4500;   // the first FL_LONG slots are kept for the long-lived flecks of the wake, so the busy short-lived ones cannot overwrite them
const flk={pos:new Float32Array(FL_N*3),life:new Float32Array(FL_N),max:new Float32Array(FL_N),size:new Float32Array(FL_N),aS:new Float32Array(FL_N),aA:new Float32Array(FL_N),ph:new Float32Array(FL_N),sh:new Float32Array(FL_N),cur:FL_LONG,curL:0};
const flGeo=new THREE.BufferGeometry(); flGeo.setAttribute('position',new THREE.BufferAttribute(flk.pos,3)); flGeo.setAttribute('aSize',new THREE.BufferAttribute(flk.aS,1)); flGeo.setAttribute('aAlpha',new THREE.BufferAttribute(flk.aA,1));
const flMat=new THREE.ShaderMaterial({ uniforms:U, transparent:true, depthWrite:false, fog:false,
  vertexShader:`uniform float uScale; attribute float aSize; attribute float aAlpha; varying float vA;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(aSize*uScale/max(-mv.z,0.5),0.0,6.5); vA=aAlpha*smoothstep(0.8,2.2,aSize*uScale/max(-mv.z,0.5)); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: COMMON + `varying float vA;
    void main(){ if(vA<=0.002) discard; float r=length(gl_PointCoord-0.5)*2.0; if(r>1.0) discard;
      float a=smoothstep(1.0,0.35,r)*vA; vec3 col=vec3(0.93,0.97,1.0)*(uAmbient*0.95+uSunColor*max(uSunDir.y,0.0)*0.85);
      gl_FragColor=vec4(col,a*0.7); ${TAIL} }` });
const flPoints=new THREE.Points(flGeo,flMat); flPoints.frustumCulled=false; flPoints.renderOrder=2; scene.add(flPoints);
function fleck(x,z,life,size){ size*=0.45; let i; if(life>=25){ i=flk.curL; flk.curL=(i+1)%FL_LONG; } else { i=flk.cur; flk.cur=i+1<FL_N?i+1:FL_LONG; } flk.pos[i*3]=x; flk.pos[i*3+2]=z; flk.life[i]=life; flk.max[i]=life; flk.size[i]=size; flk.ph[i]=rnd()*6.28; flk.sh[i]=shelter(-landD(x,z)); }   // flecks barely move, so the shelter where they started will do
function updateFlecks(dt,t){
  // shed from the moving ferry: along the hull sides and in the wake
  const sp=Math.hypot(S.u,S.v), c=Math.cos(S.psi), s=Math.sin(S.psi);
  let n=(sp*11+Math.abs(S.throttle)*12)*dt; n=Math.floor(n)+(rnd()<n%1?1:0);
  for(let i=0;i<n;i++){ const lx=-SHIP_L*0.5-rnd()*5, lz=(rnd()-0.5)*(2.6+rnd()*2.2); fleck(S.x+c*lx+s*lz,S.z-s*lx+c*lz,30+rnd()*45,0.12+rnd()*0.24); }
  let m=(sp*22)*dt; m=Math.floor(m)+(rnd()<m%1?1:0);
  for(let i=0;i<m;i++){ const side=rnd()<.5?1:-1, lx=(rnd()-0.3)*SHIP_L*0.8, lz=side*(wlHalf(lx,side)+0.1+rnd()*1.2); fleck(S.x+c*lx+s*lz,S.z-s*lx+c*lz,8+rnd()*8,0.1+rnd()*0.16); }
  cargos.forEach(k=>{ if(Math.abs(k.x-camera.position.x)<500 && rnd()<dt*18){ fleck(k.x-k.dir*(k.len/2+rnd()*15),k.z+(rnd()-.5)*k.beam,8+rnd()*8,0.18+rnd()*0.25); } });
  // breaking crests and wall splash near the camera
  const cx=camera.position.x, cz=camera.position.z, tries=Math.floor(10*waveAmp);
  for(let i=0;i<tries;i++){ const r=8+rnd()*90, a=rnd()*6.283, x=cx+Math.cos(a)*r, z=cz+Math.sin(a)*r; const ld=landD(x,z);
    if(ld>-6 && ld<0){ for(let k=0;k<7;k++) fleck(x+(rnd()-.5)*3,z+(rnd()-.5)*3,4+rnd()*6,0.12+rnd()*0.2); continue; }
    if(ld<0 && waveH(x,z,t,6)>0.62*SUMA*waveAmp*waveEnv(x,z,t)){ for(let k=0;k<9;k++) fleck(x+(rnd()-.5)*3,z+(rnd()-.5)*3,5+rnd()*7,0.12+rnd()*0.22); } }
  const cur=currentAt(cx), half=(flk.tick=(flk.tick|0)+1)&1;   // heights are refreshed for half the flecks each frame, alternately
  for(let i=0;i<FL_N;i++){
    if(flk.life[i]<=0){ flk.aA[i]=0; flk.aS[i]=0; continue; }
    flk.life[i]-=dt; const k=i*3, x=flk.pos[k], z=flk.pos[k+2];
    flk.pos[k]=x+(cur+Math.sin(t*1.3+flk.ph[i])*0.12)*dt; flk.pos[k+2]=z+Math.cos(t*1.1+flk.ph[i])*0.12*dt;
    if((i&1)===half) flk.pos[k+1]=waveH(flk.pos[k],flk.pos[k+2],t,6,flk.sh[i])+0.06;
    const f=flk.life[i]/flk.max[i]; flk.aA[i]=Math.min(1,f*4)*Math.pow(f,0.35); flk.aS[i]=flk.size[i]*(1.25-0.25*f);
  }
  flGeo.attributes.position.needsUpdate=flGeo.attributes.aSize.needsUpdate=flGeo.attributes.aAlpha.needsUpdate=true;
}
/* ============================================================
   Marine life (random): moon jellyfish drifting at the surface,
   leaping mullet-like fish and dolphin pods.
   ============================================================ */
const LIFE={ jelly:[], events:[], tFish:3, tDolph:18+rnd()*20 };
function mkMesh(parts,mat){ const g=new THREE.Group(); parts.forEach(p=>g.add(p)); mergeGroup(g); const inner=new THREE.Group(); inner.add(g); inner.visible=false; inner.rotation.order='YZX'; scene.add(inner); return inner; }
function ellipsoid(len,rad,col,x){ const m=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),col); m.scale.set(len/2,rad,rad); m.position.x=x||0; return m; }
function finTri(a,b,c,mat){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c],3)); g.computeVertexNormals(); return new THREE.Mesh(g,mat); }
const dolphinMat=new THREE.MeshStandardMaterial({color:lc('#6d7d88'),roughness:.35,metalness:.1,side:THREE.DoubleSide});
const bellyMat=new THREE.MeshStandardMaterial({color:lc('#c9d2d6'),roughness:.4});
const fishMat=new THREE.MeshStandardMaterial({color:lc('#b8c4cc'),roughness:.2,metalness:.6,side:THREE.DoubleSide});
function buildDolphin(){ const parts=[ellipsoid(2.3,0.36,dolphinMat,0), ellipsoid(1.7,0.28,bellyMat,0.05)]; parts[1].position.y=-0.1;
  const beak=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.45,10),dolphinMat); beak.rotation.z=-Math.PI/2; beak.position.set(1.28,-0.06,0); parts.push(beak);
  parts.push(finTri([0.15,0.3,0],[-0.35,0.3,0],[-0.4,0.72,0],dolphinMat));
  parts.push(finTri([-1.05,0,0],[-1.45,0.02,0.45],[-1.3,0,0],dolphinMat), finTri([-1.05,0,0],[-1.45,0.02,-0.45],[-1.3,0,0],dolphinMat));
  parts.push(finTri([0.5,-0.2,0.25],[0.2,-0.3,0.55],[0.25,-0.2,0.2],dolphinMat), finTri([0.5,-0.2,-0.25],[0.2,-0.3,-0.55],[0.25,-0.2,-0.2],dolphinMat));
  return mkMesh(parts); }
function buildFish(){ const parts=[ellipsoid(0.5,0.08,fishMat,0)]; parts.push(finTri([-0.22,0,0],[-0.36,0.1,0],[-0.36,-0.1,0],fishMat)); const g=mkMesh(parts); return g; }
const POOL={ dolphin:[...Array(6)].map(buildDolphin), fish:[...Array(10)].map(buildFish) };
POOL.dolphin.concat(POOL.fish).forEach(m=>m.traverse(o=>{ if(o.isMesh) o.castShadow=true; }));
// moon jellyfish
const jellyTex=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='rgba(240,236,255,0.55)'; g.beginPath(); g.arc(64,64,62,0,6.283); g.fill();
  g.strokeStyle='rgba(255,200,230,0.95)'; g.lineWidth=7; for(let i=0;i<4;i++){ const a=i*Math.PI/2+0.78; g.beginPath(); g.arc(64+Math.cos(a)*22,64+Math.sin(a)*22,12,0,6.283); g.stroke(); }
  g.strokeStyle='rgba(255,255,255,0.8)'; g.lineWidth=2; g.beginPath(); g.arc(64,64,60,0,6.283); g.stroke(); },true);
const jellyMat=new THREE.MeshStandardMaterial({map:jellyTex,transparent:true,opacity:0.7,roughness:.15,emissive:lc('#b8a8ff'),emissiveMap:jellyTex,emissiveIntensity:0.15,depthWrite:false,side:THREE.DoubleSide});
for(let i=0;i<16;i++){ const g=new THREE.Group(); const bell=new THREE.Mesh(new THREE.SphereGeometry(0.42,20,10,0,Math.PI*2,0,Math.PI*0.5),jellyMat);
  bell.geometry.attributes.uv.array.forEach((v,k,a)=>{}); // keep default uv
  const bg=bell.geometry, pos=bg.attributes.position, uv=bg.attributes.uv; for(let k=0;k<pos.count;k++){ uv.setXY(k,0.5+pos.getX(k)/0.84,0.5+pos.getZ(k)/0.84); } uv.needsUpdate=true;
  g.add(bell); g.visible=false; g.renderOrder=3; scene.add(g); LIFE.jelly.push({g,bell,x:0,z:0,ph:rnd()*6,vx:0,vz:0,alive:false}); }
function randomWaterSpot(minD,maxD,margin){
  for(let k=0;k<20;k++){ const a=rnd()*6.283, d=minD+rnd()*(maxD-minD), x=camera.position.x+Math.cos(a)*d, z=camera.position.z+Math.sin(a)*d;
    if(landD(x,z)<-margin && Math.hypot(x-S.x,z-S.z)>14) return [x,z]; }
  return null;
}
function splash(x,z,t,n,big){ const y=waveH(x,z,t,6); for(let i=0;i<n;i++) emit(x+(rnd()-.5)*(big?2:0.6),y+0.05,z+(rnd()-.5)*(big?2:0.6),(rnd()-.5)*(big?5:2),1.5+rnd()*(big?5:2.5),(rnd()-.5)*(big?5:2),0.5+rnd()*0.8,dropSize(big?1.2:0.4));
  addRipple(x,z,big?1.4:0.5,t); for(let i=0;i<(big?14:4);i++) fleck(x+(rnd()-.5)*(big?3:1),z+(rnd()-.5)*(big?3:1),6+rnd()*8,0.12+rnd()*0.2);
  if(big) sfx.splash(0.12,500+rnd()*400,0.5,0.8); }
function jumpEvent(mesh,x,z,yaw,len,h,depth,dur,delay,big){ LIFE.events.push({kind:'jump',mesh,x,z,yaw,len,h,depth,dur,t0:game.simT+delay,big,s1:false,s2:false}); }
function spawnFish(){ const p=randomWaterSpot(18,110,6); if(!p) return; const m=POOL.fish.find(f=>!f.visible && !LIFE.events.some(e=>e.mesh===f)); if(!m) return;
  jumpEvent(m,p[0],p[1],rnd()*6.283,1.6+rnd()*1.6,0.5+rnd()*0.7,0.3,0.7+rnd()*0.3,0,false);
  if(rnd()<0.4){ const m2=POOL.fish.find(f=>!f.visible && !LIFE.events.some(e=>e.mesh===f)); if(m2) jumpEvent(m2,p[0]+rnd()*4,p[1]+rnd()*4,rnd()*6.283,1.5+rnd(),0.5+rnd()*0.6,0.3,0.8,0.6+rnd(),false); } }
function spawnDolphins(){ const p=randomWaterSpot(35,160,15); if(!p) return; const yaw=rnd()*6.283, n=3+((rnd()*3)|0), f=[Math.cos(yaw),-Math.sin(yaw)];
  for(let i=0;i<n;i++){ const m=POOL.dolphin[i]; if(LIFE.events.some(e=>e.mesh===m)) continue; const ox=(rnd()-.5)*8, oz=(rnd()-.5)*8;
    for(let j=0;j<3;j++){ const adv=j*9+i*1.5; jumpEvent(m,p[0]+ox+f[0]*adv,p[1]+oz+f[1]*adv,yaw+(rnd()-.5)*0.2,4.2+rnd(),1.1+rnd()*0.9,1.2,1.25+rnd()*0.25,i*0.45+j*2.3+rnd()*0.3,true); } }
  toast('イルカの群れが現れました 🐬','ok'); }
function updateLife(dt,t){
  if(STAGE.life===false) return;   // no dolphins or jellyfish among the ice or up a jungle river
  // spawning timers
  LIFE.tFish-=dt; if(LIFE.tFish<=0){ spawnFish(); LIFE.tFish=2.5+rnd()*6; }
  LIFE.tDolph-=dt; if(LIFE.tDolph<=0){ spawnDolphins(); LIFE.tDolph=35+rnd()*55; }
  // jellyfish drift at the surface and pulse
  const night=U.uNight.value;
  for(const j of LIFE.jelly){
    if(!j.alive || Math.hypot(j.x-camera.position.x,j.z-camera.position.z)>170){ const p=randomWaterSpot(20,150,8); if(p){ j.x=p[0]; j.z=p[1]; j.alive=true; j.vx=(rnd()-.5)*0.15; j.vz=(rnd()-.5)*0.15; j.g.scale.setScalar(0.7+rnd()*0.8); } else { j.g.visible=false; continue; } }
    j.x+=(j.vx+currentAt(j.x)*0.9)*dt; j.z+=j.vz*dt; if(landD(j.x,j.z)>-3) j.alive=false;
    const pulse=Math.sin(t*1.8+j.ph);
    j.g.visible=true; j.g.position.set(j.x,waveH(j.x,j.z,t,6)-0.2+pulse*0.03,j.z); j.bell.scale.set(1+pulse*0.08,0.55-pulse*0.08,1+pulse*0.08);
    if(Math.hypot(j.x-S.x,j.z-S.z)<6) j.alive=false;
  }
  jellyMat.emissiveIntensity=0.15+night*0.6;
  // events
  for(let i=LIFE.events.length-1;i>=0;i--){ const e=LIFE.events[i], m=e.mesh, u=(t-e.t0)/e.dur;
    if(u<0){ continue; }
    if(u>1){ m.visible=false; LIFE.events.splice(i,1); continue; }
    const f=[Math.cos(e.yaw),-Math.sin(e.yaw)];
    {
      const x=e.x+f[0]*e.len*u, z=e.z+f[1]*e.len*u, surf=waveH(x,z,t,6);
      const y=surf-e.depth+(e.h+e.depth)*Math.sin(Math.PI*u), dy=(e.h+e.depth)*Math.PI*Math.cos(Math.PI*u);
      m.visible=true; m.position.set(x,y,z); m.rotation.set(0,e.yaw,Math.atan2(dy,e.len)*0.95);
      if(!e.s1 && y>surf){ e.s1=true; splash(x,z,t,e.big?28:6,e.big); }
      if(!e.s2 && u>0.5 && y<surf){ e.s2=true; splash(x,z,t,e.big?40:8,e.big); }
    }
  }
}
/* ============================================================
   Diesel exhaust: grey haze at steady power, dark puffs when the throttle is opened
   ============================================================ */
const SM_N=700;
const smk={pos:new Float32Array(SM_N*3),vel:new Float32Array(SM_N*3),life:new Float32Array(SM_N),max:new Float32Array(SM_N),size:new Float32Array(SM_N),aS:new Float32Array(SM_N),aA:new Float32Array(SM_N),aD:new Float32Array(SM_N),cur:0};
const smGeo=new THREE.BufferGeometry(); smGeo.setAttribute('position',new THREE.BufferAttribute(smk.pos,3)); smGeo.setAttribute('aSize',new THREE.BufferAttribute(smk.aS,1)); smGeo.setAttribute('aAlpha',new THREE.BufferAttribute(smk.aA,1)); smGeo.setAttribute('aDark',new THREE.BufferAttribute(smk.aD,1));
const smMat=new THREE.ShaderMaterial({ uniforms:U, transparent:true, depthWrite:false, fog:false,
  vertexShader:`uniform float uScale; attribute float aSize; attribute float aAlpha; attribute float aDark; varying float vA; varying float vD; varying vec2 vSeed;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(aSize*uScale/max(-mv.z,0.5),1.0,380.0); vA=aAlpha; vD=aDark; vSeed=position.xz*0.13; gl_Position=projectionMatrix*mv; }`,
  fragmentShader: COMMON + `varying float vA; varying float vD; varying vec2 vSeed;
    void main(){ if(vA<=0.002) discard; vec2 c=gl_PointCoord-0.5; float r=length(c)*2.0; if(r>1.0) discard;
      float n=texture2D(tNoise,gl_PointCoord*0.45+vSeed).r;
      float a=(1.0-smoothstep(0.15,1.0,r))*(0.55+0.7*n)*vA;
      vec3 base=mix(vec3(0.62,0.62,0.6),vec3(0.16,0.16,0.17),vD);
      vec3 col=base*(uAmbient*0.9+uSunColor*max(uSunDir.y,0.0)*0.45);
      gl_FragColor=vec4(col,clamp(a,0.0,1.0)*0.75); ${TAIL} }` });
const smPoints=new THREE.Points(smGeo,smMat); smPoints.frustumCulled=false; smPoints.renderOrder=5; scene.add(smPoints);
// smoke leaves from the exhaust pipes on the aft roof house
const EXH=[new THREE.Vector3(-7.95,4.72+1.25,0.85),new THREE.Vector3(-7.95,4.72+1.25,-0.85)];
let prevThr=0, smokeAcc=0;
function puff(p,v,size,life,dark){ const i=smk.cur; smk.cur=(smk.cur+1)%SM_N; smk.pos.set([p.x,p.y,p.z],i*3); smk.vel.set([v.x,v.y,v.z],i*3); smk.life[i]=life; smk.max[i]=life; smk.size[i]=size; smk.aD[i]=dark; }
const _ep=new THREE.Vector3(), _ev=new THREE.Vector3();
function updateSmoke(dt,t){
  const dThr=Math.max(0,S.throttle-prevThr)/Math.max(dt,1e-3); prevThr=S.throttle;
  const burst=clamp(dThr*1.6,0,3), th=Math.abs(S.throttle);
  const c=Math.cos(S.psi), s=Math.sin(S.psi), vx=c*S.u+s*S.v, vz=-s*S.u+c*S.v;
  smokeAcc+=(1.2+th*12+burst*70)*dt;
  ferry.updateMatrixWorld();
  while(smokeAcc>=1){ smokeAcc-=1; const p=EXH[(rnd()*2)|0];
    _ep.copy(p).applyMatrix4(ferry.matrixWorld); _ev.set(vx*0.9+(rnd()-.5)*0.4,1.6+th*1.5+burst*0.8+rnd()*0.5,vz*0.9+(rnd()-.5)*0.4);
    puff(_ep,_ev,0.6+rnd()*0.4+burst*0.25,4+rnd()*3+burst*1.5,clamp(0.2+burst*0.4+th*0.15,0,1)); }
  const wx=1.2, wz=0.4;
  for(let i=0;i<SM_N;i++){ if(smk.life[i]<=0){ smk.aA[i]=0; continue; } const k=i*3; smk.life[i]-=dt;
    smk.vel[k]+=(wx-smk.vel[k])*dt*0.9; smk.vel[k+2]+=(wz-smk.vel[k+2])*dt*0.9; smk.vel[k+1]+=(0.35-smk.vel[k+1])*dt*0.6;
    smk.pos[k]+=smk.vel[k]*dt; smk.pos[k+1]+=smk.vel[k+1]*dt; smk.pos[k+2]+=smk.vel[k+2]*dt;
    smk.size[i]+=dt*(0.55+smk.size[i]*0.12);
    const f=smk.life[i]/smk.max[i]; smk.aA[i]=Math.min(1,(1-f)*8)*Math.pow(f,1.1)*(0.5+smk.aD[i]*0.6); smk.aS[i]=smk.size[i]; }
  smGeo.attributes.position.needsUpdate=smGeo.attributes.aSize.needsUpdate=smGeo.attributes.aAlpha.needsUpdate=smGeo.attributes.aDark.needsUpdate=true;
}

function stepWorld(dt,t){
  updateFlecks(dt,t); updateLife(dt,t); updateSmoke(dt,t); updateRoute(dt,t); updateNature(dt,t); updateFireworks(dt);
  cargos.forEach(c=>{
    c.x += c.dir*c.spd*dt;
    if(c.x>4200) c.x=-4200; if(c.x<-4200) c.x=4200;
    const h=waveH(c.x,c.z,t);
    c.g.position.set(c.x,h*0.4,c.z); c.g.rotation.set(Math.sin(t*0.5+c.len)*0.01,c.dir>0?0:Math.PI,Math.sin(t*0.37)*0.006);
    const sx=0, sz=1, tx=c.x-c.dir*c.len/2, bxw=c.x+c.dir*c.len/2;
    const lp=c.wake.last();
    if(lp && Math.abs(lp.x-tx)>200){ c.wake.pts.length=0; c.wakeK.pts.length=0; }
    if(!lp || Math.abs(tx-lp.x)>4){ c.wake.add(tx,c.z,sx,sz,0.9,c.spd,t); c.wakeK.add(bxw,c.z,sx,sz,0.8,c.spd,t); }
    c.wake.update(t,{x:tx,z:c.z,sx,sz,str:0.9,sp:c.spd,t},0);
    c.wakeK.update(t,{x:bxw,z:c.z,sx,sz,str:0.8,sp:c.spd,t},0);
    if(rnd()<dt*25){ const side=rnd()<.5?1:-1; emit(bxw-c.dir*rnd()*10,0.3,c.z+side*c.beam*0.5,c.dir*c.spd*0.5,1.5+rnd()*2,side*(1.5+rnd()*2),0.8+rnd()*.6,0.9+rnd()*0.8); }
  });
  for(const k in PIERS) for(const f of PIERS[k].fenders){ f.userData.sq*=Math.exp(-dt*3); f.scale.set(1,1,1-0.4*f.userData.sq); f.position.z=PIERS[k].dir*(4.15-0.12*f.userData.sq); }
  for(const k in PIERS){ const P=PIERS[k]; if(P.gpiv){ const endY=P.pon.position.y+1.35; P.gpiv.rotation.x=P.dir*Math.atan2(3.3-endY,P.glen); } }
  pontoons.forEach(p=>{ const h=waveH(p.x,p.z,t); p.g.position.y=h*0.55+0.2; p.g.rotation.x=Math.sin(t*0.9+p.ph)*0.012*waveAmp; p.g.rotation.z=Math.sin(t*0.7+p.ph)*0.008*waveAmp; });
  moored.forEach(b=>{ b.g.position.y=waveH(b.x,b.z,t,6)*(b.big?0.3:0.8); b.g.rotation.x=Math.sin(t*1.1+b.ph)*0.03*waveAmp; b.g.rotation.z=Math.sin(t*0.8+b.ph)*0.02*waveAmp; });
  updateGulls(t); updateBlueWing(t);
  buoys.forEach(b=>{ b.g.position.y=waveH(b.x,b.z,t); b.g.rotation.x=Math.sin(t*1.3+b.ph)*0.08*waveAmp; b.g.rotation.z=Math.sin(t*1.1+b.ph*2)*0.08*waveAmp; });
  if(rnd()<dt*0.5){ const p=pontoons[(rnd()*2)|0]; addRipple(p.x+(rnd()-.5)*30,p.z+(rnd()<.5?5:-5),0.5,t); }
  for(const k in PIERS){ const P=PIERS[k]; P.marker.visible = (k===game.to && game.state==='sailing'); if(P.marker.visible){ P.marker.position.y=waveH(P.bx,P.bz,t)+0.25; P.marker.children[1].material.opacity=0.25+0.2*Math.sin(t*3); } }
}
let fenderCool=0;
function collide(t){
  let hard=0, px=0, pz=0, soft=null;
  const c=Math.cos(S.psi), s=Math.sin(S.psi), cur=currentAt(S.x);
  const Vx=c*S.u+s*S.v+cur, Vz=-s*S.u+c*S.v;
  for(const [lx,lz] of HULL_PTS){
    const [wx,wz]=shipPoint(lx,lz);
    const n=northZ(wx)+1.5, so=southZ(wx)-1.5;
    if(wz<n){ pz+=n-wz; hard=1; }
    if(wz>so){ pz+=so-wz; hard=1; }
    for(const cl of colliders){
      if(cl.active && !cl.active()) continue;
      const dx=wx-cl.x, dz=wz-cl.z, ca=Math.cos(cl.ang), sa=Math.sin(cl.ang);
      const lx2=dx*ca-dz*sa, lz2=dx*sa+dz*ca;
      if(Math.abs(lx2)<cl.hx && Math.abs(lz2)<cl.hz){
        const ox=cl.hx-Math.abs(lx2), oz=cl.hz-Math.abs(lz2);
        let qx=0,qz=0; if(ox<oz) qx=Math.sign(lx2)*ox; else qz=Math.sign(lz2)*oz;
        const qwx=ca*qx+sa*qz, qwz=-sa*qx+ca*qz;
        if(cl.fender && ox>=oz){
          const rox=wx-S.x, roz=wz-S.z, pvx=Vx+S.r*roz, pvz=Vz-S.r*rox;
          const ql=Math.hypot(qwx,qwz)||1, nx=qwx/ql, nz=qwz/ql, vn=-(pvx*nx+pvz*nz);
          if(!soft||ql>soft.pen) soft={nx,nz,pen:ql,vn,wx,wz,rox,roz,cl};
        } else { px+=qwx; pz+=qwz; hard=1; }
      }
    }
  }
  if(soft){
    // rubber fenders: soft spring contact. Gentle = normal berthing, hard = a hit.
    const fast=soft.vn>0.75;
    S.x+=soft.nx*soft.pen*0.7; S.z+=soft.nz*soft.pen*0.7;
    if(soft.vn>0){
      const imp=soft.vn*(fast?1.35:1.12), dvx=soft.nx*imp, dvz=soft.nz*imp;
      S.u+=dvx*c-dvz*s; S.v+=dvx*s+dvz*c;
      S.r+=0.004*soft.vn*(soft.roz*soft.nx-soft.rox*soft.nz);
    }
    const P=soft.cl.pier;
    if(P && P.fenders){ let best=null,bd=1e9; for(const f of P.fenders){ const d=Math.abs(P.x+f.position.x-soft.wx); if(d<bd){bd=d;best=f;} } if(best) best.userData.sq=Math.max(best.userData.sq||0,clamp(soft.pen*2.5+soft.vn*1.2,0.15,1)); }
    if(soft.vn>0.02 && soft.vn<=0.1 && fenderCool<=0){ fenderCool=0.7; sfx.squeak(0.7); }
    if(soft.vn>0.1 && fenderCool<=0){ sfx.squeak(0.9);
      fenderCool=0.6; sfx.fender(soft.vn); addRipple(soft.wx,soft.wz,0.5+soft.vn,t);
      if(game.state==='sailing' && P===PIERS[game.to] && game.departed) dock.contactKn=Math.max(dock.contactKn,soft.vn*1.944);
    }
    if(fast && game.state==='sailing'){ game.hits++; game.shake=0.45; sfx.thud(soft.vn*3); toast('防舷材に強く当たりました。もっとゆっくり寄せてください','warn'); }
  }
  if(hard){
    S.x+=px*0.6; S.z+=pz*0.6;
    const spd=Math.hypot(S.u,S.v);
    if(spd>0.7 && game.state==='sailing'){ game.hits++; game.shake=Math.min(1.2,spd*0.2); toast('接触しました','warn'); sfx.thud(spd);
      for(let i=0;i<60;i++) emit(S.x+(rnd()-.5)*8,0.5,S.z+(rnd()-.5)*8,(rnd()-.5)*5,2+rnd()*5,(rnd()-.5)*5,1+rnd(),0.8+rnd());
      addRipple(S.x,S.z,2.2,t); }
    S.u*=-0.25; S.v*=0.2; S.r*=0.5;
  }
}

/* ============================================================
   Berthing: mooring lines, gangplank, passengers
   ============================================================ */
const ropeMat=new THREE.MeshStandardMaterial({color:lc('#e6dcc3'),roughness:.9});
function makeRope(){
  const SEG=24,RAD=5, g=new THREE.BufferGeometry();
  const pos=new Float32Array((SEG+1)*RAD*3), nor=new Float32Array((SEG+1)*RAD*3), idx=[];
  for(let i=0;i<SEG;i++) for(let k=0;k<RAD;k++){ const a=i*RAD+k, b=i*RAD+(k+1)%RAD, c=(i+1)*RAD+k, d=(i+1)*RAD+(k+1)%RAD; idx.push(a,c,b,b,c,d); }
  g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); g.setIndex(idx);
  const m=new THREE.Mesh(g,ropeMat); m.frustumCulled=false; m.visible=false; m.castShadow=true; m.userData={SEG,RAD}; scene.add(m); return m;
}
const _t=new THREE.Vector3(), _n1=new THREE.Vector3(), _n2=new THREE.Vector3(), _p=new THREE.Vector3(), _up=new THREE.Vector3(0,1,0);
function setRope(m,A,B,sag){
  const {SEG,RAD}=m.userData, pos=m.geometry.attributes.position.array, nor=m.geometry.attributes.normal.array, r=0.07;
  _t.subVectors(B,A).normalize(); _n1.crossVectors(_t,_up); if(_n1.lengthSq()<1e-4) _n1.set(1,0,0); _n1.normalize(); _n2.crossVectors(_n1,_t).normalize();
  for(let i=0;i<=SEG;i++){ const t=i/SEG; _p.lerpVectors(A,B,t); _p.y-=sag*4*t*(1-t);
    for(let k=0;k<RAD;k++){ const a=k/RAD*6.283, ca=Math.cos(a), sa=Math.sin(a), o=(i*RAD+k)*3;
      const nx=_n1.x*ca+_n2.x*sa, ny=_n1.y*ca+_n2.y*sa, nz=_n1.z*ca+_n2.z*sa;
      pos[o]=_p.x+nx*r; pos[o+1]=_p.y+ny*r; pos[o+2]=_p.z+nz*r; nor[o]=nx; nor[o+1]=ny; nor[o+2]=nz; } }
  m.geometry.attributes.position.needsUpdate=true; m.geometry.attributes.normal.needsUpdate=true; m.visible=true;
}
// gangplank (unit length along +z, scaled)
const plank=new THREE.Group(); plank.visible=false; scene.add(plank); const _zAxis=new THREE.Vector3(0,0,1);
{ const pm=new THREE.MeshStandardMaterial({color:lc('#c9ced2'),roughness:.5,metalness:.5});
  const deckP=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.07,1).translate(0,0,0.5),pm); plank.add(deckP);
  const tread=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.02,1).translate(0,0.045,0.5),new THREE.MeshStandardMaterial({color:lc('#3a4a44'),roughness:.9})); plank.add(tread);
  for(const sd of [-0.5,0.5]){ const r=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,1).translate(sd,0.95,0.5),pm); plank.add(r); const r2=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.9,0.04).translate(sd,0.48,0.02),pm); plank.add(r2); const r3=r2.clone(); r3.geometry=new THREE.BoxGeometry(0.03,0.9,0.04).translate(sd,0.48,0.98); plank.add(r3); } }
// passengers
const skinMat=new THREE.MeshStandardMaterial({color:lc('#e0b594'),roughness:.8});
const CLOTH=['#2f4a7a','#7a2f3a','#3c6b4a','#d9c7a0','#4a4a50','#8a6fb0','#c9803c','#1f2024','#9fb6c8','#b0413e','#f1f1ee','#5b6e2e'];
const people=CLOTH.map((col,i)=>{ const g=new THREE.Group(); const cm=new THREE.MeshStandardMaterial({color:lc(col),roughness:.85});
  const legs=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.13,0.82,8),M.dark); legs.position.y=0.41; g.add(legs);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.21,0.17,0.66,9),cm); body.position.y=1.14; g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.12,10,8),skinMat); head.position.y=1.6; g.add(head);
  if(i%3===0){ const bag=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.36,0.14),M.dark); bag.position.set(0.24,0.8,0); g.add(bag); }
  const sc=0.92+((i*37)%17)/100; g.scale.setScalar(sc);
  mergeGroup(g); g.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); g.visible=false; scene.add(g); return {g,path:null,seg:0,delay:0,done:true,speed:1.25+((i*13)%7)/20,ph:i}; });
function walk(p,pts,delay){ p.path=pts; p.seg=0; p.delay=delay; p.done=false; p.pos=pts[0].clone(); p.g.position.copy(pts[0]); p.g.visible=delay<=0; }
function updatePeople(dt,t){
  for(const p of people){ if(p.done||!p.path) continue;
    if(p.delay>0){ p.delay-=dt; if(p.delay>0) continue; p.g.visible=true; }
    let step=p.speed*dt;
    while(step>0 && p.seg<p.path.length-1){ const B=p.path[p.seg+1]; _p.subVectors(B,p.pos); const d=_p.length();
      if(d<=step){ p.pos.copy(B); p.seg++; step-=d; } else { p.pos.addScaledVector(_p,step/d); p.g.rotation.y=Math.atan2(_p.x,_p.z); step=0; } }
    p.g.position.copy(p.pos); p.g.position.y+=Math.abs(Math.sin(t*7+p.ph))*0.04;
    if(p.seg>=p.path.length-1){ p.done=true; if(p.hideAtEnd) p.g.visible=false; }
  }
}
/* The player works the gangway: once the lines are fast it waits to be lowered (phase 'plankWait'), and once everyone
   is aboard it waits to be stowed ('stowWait'). G or the on-screen button gives the order. */
function gangPrompt(label){ const b=$('#gangBtn'); b.hidden=!label; if(label) b.textContent=label+'（G）'; }
function workGangway(){ if(dock.phase==='plankWait'||dock.phase==='stowWait') dock.go=true; }
const dock={ go:false, phase:'none', t:0, P:null, side:1, ropes:[makeRope(),makeRope(),makeRope()], pairs:[], ext:0, hold:0, contactKn:0, moorAng:0, moorAlong:0, result:false };
function shipWorld(v,side){ ferry.updateMatrixWorld(); return new THREE.Vector3(v.x,v.y,v.z*side).applyMatrix4(ferry.matrixWorld); }
function ponWorld(P,v){ P.pon.updateMatrixWorld(); return v.clone().applyMatrix4(P.pon.matrixWorld); }
function sideToward(P){ const lz=(P.x-S.x)*Math.sin(S.psi)+(P.pz-S.z)*Math.cos(S.psi); return lz>0?1:-1; }
function setupLines(P){
  dock.P=P; dock.side=sideToward(P);
  const cl=ferry.userData.cleats, fwd=new THREE.Vector3(Math.cos(S.psi),0,-Math.sin(S.psi));
  const bw=P.bollards.map(b=>ponWorld(P,b));
  const nearest=(pt,excl)=>{ let bi=0,bd=1e9; bw.forEach((b,i)=>{ if(excl.includes(i)) return; const d=b.distanceTo(pt); if(d<bd){bd=d;bi=i;} }); return bi; };
  const bowC=shipWorld(cl.bow,dock.side), sternC=shipWorld(cl.stern,dock.side);
  const b1=nearest(bowC.clone().addScaledVector(fwd,5),[]), b2=nearest(sternC.clone().addScaledVector(fwd,-5),[b1]), b3=nearest(shipWorld(new THREE.Vector3(-2,0,0),1),[b1,b2]);
  dock.pairs=[[cl.bow,b1],[cl.stern,b2],[cl.bow,b3]];
}
function ropeEnds(i){ const [c,b]=dock.pairs[i]; return [shipWorld(c,dock.side), ponWorld(dock.P,dock.P.bollards[b])]; }
function doorPoints(){
  const u=ferry.userData, A=shipWorld(u.door,dock.side), deck=shipWorld(u.deckPt,dock.side), rdoor=shipWorld(u.rdoor,1), inside=shipWorld(u.inside,1);
  const P=dock.P, py=P.pon.position.y+1.25; let B;
  if(u.gangway){ // the foot of the ship's gangway: its length out from the hinge, down on the pontoon deck
    const drop=clamp(A.y-py,-u.gangLen*0.5,u.gangLen*0.9), reach=Math.sqrt(u.gangLen*u.gangLen-drop*drop)*dock.side;
    B=new THREE.Vector3(A.x+Math.sin(S.psi)*reach,py,A.z+Math.cos(S.psi)*reach);
  } else B=new THREE.Vector3(A.x,py,P.pz+P.dir*3.3);
  return {A,B,deck,rdoor,inside};
}
function updatePlank(){
  const u=ferry.userData;
  if(u.gangway){ // swing the berth-side gangway down from upright until its foot rests on the pontoon; it then rides the relative heave
    const e=dock.ext, ease=e*e*(3-2*e); let down=0;
    if(e>0.001){ const {A,B}=doorPoints(); down=Math.asin(clamp((A.y-B.y)/u.gangLen,-0.5,0.9)); }
    for(const sd of [1,-1]) u.gangway[sd].rotation.set(sd*lerp(-Math.PI/2,down,sd===dock.side?ease:0),0,0);
    return; }
  if(dock.ext<=0.001){ plank.visible=false; return; }
  const {A,B}=doorPoints(); const d=B.clone().sub(A); const len=d.length(); d.normalize();
  // hinged at the gate: swings down from upright onto the pontoon, then rides the relative heave
  const e=dock.ext, ease=e*e*(3-2*e); const up=new THREE.Vector3(0,1,0).lerp(d,ease).normalize();
  plank.visible=true; plank.position.copy(A); plank.quaternion.setFromUnitVectors(_zAxis,up); plank.scale.set(1,1,len+0.25);
}
function holdAtBerth(dt,k){
  const P=dock.P; if(!P) return;
  const tx=clamp(S.x,P.bx-5,P.bx+5);
  let d=S.psi-P.psi; d=((d%Math.PI)+Math.PI*1.5)%Math.PI-Math.PI/2;
  const a=Math.min(1,dt*1.2*k);
  S.x+=(tx-S.x)*a; S.z+=(P.bz-S.z)*a; S.psi-=d*a;
  const damp=Math.exp(-dt*3*k); S.u*=damp; S.v*=damp; S.r*=damp;
}
function queuePassengers(P,list){
  const {B}=doorPoints();
  list.forEach((p,i)=>{ const q=new THREE.Vector3(B.x-1.2-i*0.9,P.pon.position.y+1.25,B.z-P.dir*(1.2+(i%2)*0.5)); walk(p,[q,q.clone()],0); p.done=true; p.g.visible=true; p.g.position.copy(q); p.g.rotation.y=Math.PI/2; p.waiting=true; });
}
function setMoored(key){
  const P=PIERS[key]; placeAtBerth(key); ferry.position.set(S.x,S.y,S.z); ferry.rotation.set(0,S.psi,0); ferry.updateMatrixWorld();
  setupLines(P); dock.phase='moored'; dock.ext=1; dock.hold=1;
  queuePassengers(P,people.slice(0,5));
}
function beginMooring(P,along,ang){
  game.state='mooring'; S.throttle=0; input.rudTouch=null;
  setupLines(P); dock.phase='throw'; dock.t=0; dock.hold=0; dock.moorAng=ang; dock.moorAlong=along;
  toast('係留索を投げています…','ok');
}
function beginDeparture(){
  const P=dock.P; game.state='boarding'; dock.phase='boarding'; dock.t=0;
  const {A,B,deck,rdoor,inside}=doorPoints();
  const q=people.filter(p=>p.waiting); dock.boarders=q;
  q.forEach((p,i)=>{ p.waiting=false; p.hideAtEnd=true; p.speed=1.6+i*0.05; walk(p,[p.g.position.clone(),B.clone(),A.clone(),deck.clone(),rdoor.clone(),inside.clone().add(new THREE.Vector3(0,0,(i-2)*0.3))],i*0.55); p.g.visible=true; });
  toast('乗船中…','ok');
}
let squeakT=2;
function updateDock(dt,t){
  if(dock.phase==='none') return;
  if(dock.hold>0.4 && dock.P){ squeakT-=dt; if(squeakT<=0){
      const P=dock.P; sfx.squeak(0.6+rnd()*0.4); if(rnd()<0.6) setTimeout(()=>sfx.squeak(0.5+rnd()*0.4),130+rnd()*140);
      squeakT=(1.2+rnd()*3.0)/(0.6+waveAmp*0.6);
      let best=null,bd=1e9; for(const f of P.fenders){ const d=Math.abs(P.x+f.position.x-(S.x+(rnd()-.5)*16)); if(d<bd){bd=d;best=f;} } if(best) best.userData.sq=Math.max(best.userData.sq,0.75); } }
  dock.t+=dt;
  const P=dock.P;
  if(dock.phase==='throw'){
    dock.hold=Math.min(0.5,dock.hold+dt*0.4);
    let landed=0;
    dock.ropes.forEach((r,i)=>{ const st=i*0.7, p=clamp((dock.t-st)/0.9,0,1); if(dock.t<st){ r.visible=false; return; }
      const [A,B]=ropeEnds(i); const E=A.clone().lerp(B,p); E.y+=Math.sin(p*Math.PI)*2.6; setRope(r,A,E,0.25*p); if(p>=1) landed++; });
    if(landed===3){ dock.phase='pull'; dock.t=0; sfx.fender(0.2); }
  } else if(['pull','plankWait','plank','disembark','moored','boarding','stowWait'].includes(dock.phase)){
    if(dock.phase==='pull'){ dock.hold=Math.min(1,0.5+dock.t*0.25); if(dock.t>2.8){ dock.phase='plankWait'; dock.go=false; toast('係留完了。G キーで渡し板を掛けてください','ok'); gangPrompt('渡し板を掛ける'); } }
    if(dock.phase==='plankWait' && dock.go){ dock.go=false; dock.phase='plank'; dock.t=0; gangPrompt(''); toast('渡し板を掛けます','ok'); }
    if(dock.phase==='plank'){ dock.ext=clamp(dock.t/2.2,0,1); if(dock.t>2.4){ dock.phase='disembark'; dock.t=0;
        const {A,B,deck,rdoor,inside}=doorPoints(); const foot=new THREE.Vector3(P.gx,P.pon.position.y+1.25,P.pz-P.dir*3.4), top=new THREE.Vector3(P.gx,3.4,P.shore-P.dir*1.5), away=new THREE.Vector3(P.gx+(rnd()-.5)*6,3.4,P.shore-P.dir*14);
        people.slice(5,11).forEach((p,i)=>{ p.hideAtEnd=true; walk(p,[inside.clone(),rdoor.clone(),deck.clone(),A.clone(),B.clone(),foot.clone().add(new THREE.Vector3((i%2)*0.6-0.3,0,0)),top.clone(),away.clone().add(new THREE.Vector3(i*0.8,0,0))],0.4+i*1.1); });
        toast('下船中…','ok'); } }
    if(dock.phase==='disembark' && dock.t>5.5 && !dock.result){ dock.result=true; showResult(); dock.phase='moored'; }
    const sag = dock.phase==='pull' ? lerp(0.9,0.18,clamp(dock.t/2.8,0,1)) : 0.18;
    dock.ropes.forEach((r,i)=>{ const [A,B]=ropeEnds(i); setRope(r,A,B,sag+0.04*Math.sin(t*1.3+i)); });
    if(dock.phase==='boarding'){ const all=(dock.boarders||[]).every(p=>p.done); if((all && dock.t>1.5)||dock.t>12){ (dock.boarders||[]).forEach(p=>{ p.done=true; p.g.visible=false; }); dock.phase='stowWait'; dock.go=false; toast('乗船完了。G キーで渡し板を格納してください','ok'); gangPrompt('渡し板を格納する'); } }
    if(dock.phase==='stowWait' && dock.go){ dock.go=false; dock.phase='plankIn'; dock.t=0; gangPrompt(''); toast('渡し板を格納します','ok'); }
  } 
  if(dock.phase==='plankIn'){ dock.ext=clamp(1-dock.t/1.6,0,1); dock.ropes.forEach((r,i)=>{ const [A,B]=ropeEnds(i); setRope(r,A,B,0.2); }); if(dock.t>1.7){ dock.ext=0; updatePlank(); dock.phase='castoff'; dock.t=0; } }
  if(dock.phase==='castoff'){
    dock.hold=Math.max(0,1-dock.t*0.8);
    dock.ropes.forEach((r,i)=>{ const st=i*0.35, p=clamp((dock.t-st)/1.1,0,1); const [A,B]=ropeEnds(i); if(p>=1){ r.visible=false; return; } const E=B.clone().lerp(A,p); E.y+=Math.sin(p*Math.PI)*1.6; setRope(r,A,E,0.4*(1-p)); });
    if(dock.t>1.9){ dock.phase='none'; dock.hold=0; dock.ropes.forEach(r=>r.visible=false); game.state='sailing'; game.elapsed=0; toast('もやいを放しました。'+PIERS[game.to].name+'へ向けて出航','ok'); sfx.horn(); }
  }
  updatePlank();
}
function checkDock(){
  if(game.state!=='sailing') return;
  const P=PIERS[game.to], O=PIERS[game.from];
  if(!game.departed && Math.hypot(S.x-O.bx,S.z-O.bz)>60) game.departed=true;
  if(!game.departed) return;
  const along=S.x-P.bx, gap=Math.abs(S.z-P.pz)-4.45-SHIP_B/2-0.07;
  const ang=Math.abs(Math.asin(clamp(Math.sin(S.psi-P.psi),-1,1)))*180/Math.PI;
  const sog=Math.hypot(S.u,S.v);
  const dist=Math.hypot(S.x-P.bx,S.z-P.bz);
  if(dist<70 && game.msgT<=0){ game.msgT=5;
    if(sog*1.944>3) toast('減速してください。接舷は 1kn 前後が目安です');
    else if(ang>12) toast('船体を桟橋と平行にしてください（低速では A/D でその場回頭）');
    else if(Math.abs(along)>8) toast(along<0?'もう少し前へ':'行き過ぎです。少し後進を');
    else if(gap>1.0) toast('Q/E の平行移動でゆっくり桟橋に寄せてください'); }
  if(routeBlocksDocking(dist)) return;
  if(Math.abs(along)<8 && gap<1.0 && sog<0.62 && ang<10 && Math.abs(S.throttle)<0.35){ const c=Math.cos(S.psi), sn=Math.sin(S.psi); const toward=Math.max(0,(-sn*S.u+c*S.v)*Math.sign(P.pz-S.z)); dock.contactKn=Math.max(dock.contactKn,toward*1.944); beginMooring(P,along,ang); }
}
function fmtTime(s){ const m=Math.floor(s/60), r=Math.floor(s%60); return String(m).padStart(2,'0')+':'+String(r).padStart(2,'0'); }
function showResult(){
  game.state='docked'; sfx.horn();
  const time=game.elapsed, kn=dock.contactKn, ang=dock.moorAng;
  const score=Math.round(clamp(1000 - time*1.4 - game.hits*150 - Math.max(0,kn-0.4)*260 - ang*6 - Math.abs(dock.moorAlong)*4,0,1000));
  const rank=score>=820?'S':score>=680?'A':score>=480?'B':'C';
  const key='kanmon-best-'+game.from+'-'+game.to; const best=Math.max(score,parseInt(store.get(key)||'0',10)); store.set(key,String(best));
  $('#rank').textContent=rank; $('#resRoute').textContent=PIERS[game.from].name+' ➜ '+PIERS[game.to].name;
  $('#rsTime').textContent=fmtTime(time); $('#rsHits').textContent=game.hits+' 回'; $('#rsSpd').textContent=kn.toFixed(1)+' kn';
  $('#rsAng').textContent=ang.toFixed(0)+'°'; $('#rsScore').textContent=score; $('#rsBest').textContent=best;
  $('#next').textContent=PIERS[game.to].name+' 発 '+PIERS[game.from].name+' 行きの乗船を始める';
  queuePassengers(dock.P,people.slice(0,5));
  $('#result').hidden=false; $('#next').focus();
}
function startLeg(){
  game.hits=0; game.departed=false; game.msgT=0; game.elapsed=0; dock.contactKn=0; dock.result=false; resetRoute();
  $('#rFrom').textContent=PIERS[game.from].name; $('#rTo').textContent=PIERS[game.to].name;
  beginDeparture();
}
$('#start').onclick=()=>{ $('#intro').hidden=true; sfx.init(); startLeg(); canvas.focus(); };
$('#next').onclick=()=>{ $('#result').hidden=true; const f=game.from; game.from=game.to; game.to=f; startLeg(); canvas.focus(); };
