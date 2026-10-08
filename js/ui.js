/* 関門汽船 運転シミュレーター — 操作と表示：カメラ、HUD、ミニマップ、メニュー、効果音 */
'use strict';

/* ============================================================
   Camera
   ============================================================ */
const CAM_MODES=[{k:'chase',label:'追従'},{k:'helm',label:'操舵席'},{k:'mirror',label:'右ミラー'},{k:'cabin',label:'客室'},{k:'high',label:'俯瞰'}].concat(STAGE.piers.map(p=>({k:'pax',label:'お客様・'+p.name,pier:p.key})));   // one passenger view per shore
let camMode=0;
const cam={ yaw:0, pitch:0.22, dist:48, pos:new THREE.Vector3(-60,20,-560), look:new THREE.Vector3() };
const camK=()=>CAM_MODES[camMode].k;
/* cabin view: the passenger can walk (W/A/S/D) on the aft deck, through the door, along the aisle and round the lobby
   in front of the helm partition; up the ladder on the aft cabin wall there is the roof deck (lvl 1). Boxes are [x0,x1,z0,z1]
   in the ship's frame and overlap where they connect. On the roof they leave out the skylight housing, the rafts, the mast and the chest. */
const WALK={ x:-8.2, z:0.15, lvl:0, seat:null, eye:1.6, speed:1.5, areas:[[-11.6,-8.9,-2.7,2.7],[-9.0,-8.5,-0.42,0.42],[-8.6,2.1,-0.38,0.38],[2.05,2.7,-2.1,2.1]],
  roof:[[-8.5,3.0,-2.0,-1.6],[-8.5,-1.45,1.6,2.0],[-6.4,-6.0,-2.0,2.0],[-6.4,-0.3,-0.6,0.6],[-1.6,-0.3,-2.0,1.1],[0.5,3.0,-2.0,2.0]] };
const ROOF_Y=4.81, LADDER={foot:[-9.35,2.0],top:[-8.3,1.8]};
/* places to sit in the saloon: eight rows of benches each side of the aisle facing forward, and a bench along each side by the door facing inboard */
const SEATS=[];
for(const x0 of [-7.35,-6.09,-4.83,-3.57,-2.31,-1.05,0.22,1.48]) for(const sd of [1,-1]) for(const z of [0.75,1.27,1.8]) SEATS.push({x:x0+0.3,z:sd*z,yaw:0});
for(const sd of [1,-1]) for(const x of [-8.25,-7.7]) SEATS.push({x,z:sd*2.0,yaw:sd*Math.PI/2});
const KEYS_HINT={ drive:$('#keys').textContent, walk:'W/A/S/D 歩く　F 座る・立つ・はしご　ドラッグで見回す　C / 1〜7 視点　H 汽笛（歩いている間、舵は中央・速力はそのまま）',
  pax:'W/A/S/D 歩く　F 乗る・降りる・座る・はしご　ドラッグで見回す　C / 1〜7 視点' };
const walking=()=>camK()==='cabin'||camK()==='pax';   // views in which the keys walk a person instead of working the ship
/* passenger view: a customer on foot. Ashore they walk the quay, the gangway and the pontoon of PAX.pier (world coordinates);
   with the ship's gangway down they can walk across it (or press F beside it) and then walk the ship like the cabin view, and go ashore again at the other side. */
const PAX={ onShip:false, pier:null, x:0, y:3.5, z:0, seat:null, armed:true };
function paxGround(x,z){ const P=PAX.pier, deck=P.pon.position.y+1.25, a=(z-P.shore)*P.dir;   // a: metres out from the quay edge
  if(Math.abs(x-P.x)<16.6 && Math.abs(z-P.pz)<3.6) return deck;
  if(Math.abs(x-P.gx)<1.5 && a>-3 && a<P.glen+0.6) return lerp(3.5,deck+0.15,clamp(a/P.glen,0,1));
  const d=((P.dir>0?northZ(x):southZ(x))-z)*P.dir;                                              // d: metres inland
  return (Math.abs(x-P.x)<70 && d>0.6 && d<14) ? Math.max(3.2,terrainH(x,z))+0.2 : null; }
function enterPax(){ if(PAX.onShip) return;
  const P=PIERS[CAM_MODES[camMode].pier];
  if(P!==PAX.pier){ PAX.pier=P; PAX.seat=null; PAX.armed=true; PAX.x=P.gx+7; PAX.z=shoreZ(P,PAX.x,6); PAX.y=paxGround(PAX.x,PAX.z)||3.5; }
  cam.yaw=Math.atan2(-(S.z-PAX.z),S.x-PAX.x); }
const gangDown=()=>dock.ext>0.95 && !!dock.P;
function walkShore(dt){
  if(PAX.seat) return;
  const f=(input.up?1:0)-(input.down?1:0), r=(input.right?1:0)-(input.left?1:0);
  if(f||r){ const cy=Math.cos(cam.yaw), sy=Math.sin(cam.yaw), st=WALK.speed*dt/Math.hypot(f,r), nx=PAX.x+(cy*f+sy*r)*st, nz=PAX.z+(-sy*f+cy*r)*st;
    if(paxGround(nx,nz)!==null){ PAX.x=nx; PAX.z=nz; } else if(paxGround(nx,PAX.z)!==null) PAX.x=nx; else if(paxGround(PAX.x,nz)!==null) PAX.z=nz; }
  const g=paxGround(PAX.x,PAX.z); if(g!==null) PAX.y+=(g-PAX.y)*Math.min(1,dt*10);
  // walking onto the foot of the ship's gangway takes them aboard (after stepping ashore they must first move away from it)
  if(gangDown() && dock.P===PAX.pier){ const B=doorPoints().B, d=Math.hypot(PAX.x-B.x,PAX.z-B.z); if(d>1.9) PAX.armed=true; else if(d<0.8 && PAX.armed && (f||r)) boardShip(); } }
/* A short walk the camera is led along: across the gangway, or up and down the ladder. pts() gives the way-points in world
   coordinates, afresh each frame because the ship moves. While it lasts cam.yaw is a world bearing. */
const TRANS={ on:false, t:0, dur:1, pts:null, done:null };
function startTrans(dur,pts,done){ TRANS.on=true; TRANS.t=0; TRANS.dur=dur; TRANS.pts=pts; TRANS.done=done; }
function endTrans(){ if(TRANS.on){ TRANS.on=false; TRANS.done(); } }
const shipPt=(x,y,z)=>ferry.localToWorld(new THREE.Vector3(x,y,z)), eyeUp=v=>v.clone().setY(v.y+WALK.eye);
const gatePt=()=>[ferry.userData.door.x,dock.side*2.0];
function boardShip(){
  const g=gatePt(), from=new THREE.Vector3(PAX.x,PAX.y+WALK.eye,PAX.z); PAX.seat=null;
  startTrans(2.6,()=>{ const {A,B}=doorPoints(); return [from,eyeUp(B),eyeUp(A),shipPt(g[0],HULLF.deckY(sOf(g[0]))+WALK.eye,g[1])]; },
    ()=>{ PAX.onShip=true; WALK.lvl=0; WALK.seat=null; WALK.x=g[0]; WALK.z=g[1]; cam.yaw-=S.psi; viewGlass(); toast('乗船しました','ok'); }); }
function leaveShip(){
  const from=[WALK.x,HULLF.deckY(sOf(WALK.x))+WALK.eye,WALK.z]; cam.yaw+=S.psi;
  startTrans(2.6,()=>{ const {A,B}=doorPoints(); return [shipPt(...from),eyeUp(A),eyeUp(B)]; },
    ()=>{ const B=doorPoints().B; PAX.onShip=false; PAX.pier=dock.P; PAX.seat=null; PAX.armed=false; PAX.x=B.x; PAX.z=B.z; PAX.y=B.y; viewGlass(); toast(PAX.pier.name+'で下船しました','ok'); }); }
function climb(up){
  const f=LADDER.foot, tp=LADDER.top, y0=HULLF.deckY(sOf(f[0]))+WALK.eye, y1=ROOF_Y+WALK.eye;
  const way=[[f[0],y0,f[1]],[f[0],y1,f[1]],[tp[0],y1,tp[1]]]; if(!up) way.reverse();
  way.unshift([WALK.x,up?y0:y1,WALK.z]); cam.yaw+=S.psi;
  startTrans(up?3.4:3.0,()=>way.map(p=>shipPt(...p)),()=>{ WALK.lvl=up?1:0; [WALK.x,WALK.z]=up?tp:f; cam.yaw-=S.psi; toast(up?'二階（屋上デッキ）に上がりました':'一階に下りました','ok'); }); }
/* What F (or the on-screen button) would do just now for the person on foot: [label, action], or null */
function walkAction(){
  const k=camK(); if(!walking()||TRANS.on) return null;
  if(k==='cabin'||PAX.onShip){
    if(WALK.seat) return ['立つ',()=>{ WALK.seat=null; }];
    const near=(p,r)=>Math.hypot(WALK.x-p[0],WALK.z-p[1])<r;
    if(WALK.lvl===1) return near(LADDER.top,1.0)?['一階へ下りる',()=>climb(0)]:null;
    if(near(LADDER.foot,0.9)) return ['二階へ上る',()=>climb(1)];
    if(k==='pax' && gangDown() && near([ferry.userData.door.x,dock.side*2.3],1.6)) return ['船を降りる',leaveShip];
    const ax=WALK.x+Math.cos(cam.yaw)*0.7, az=WALK.z-Math.sin(cam.yaw)*0.7; let best=null, bd=1e9;   // the seat they are facing
    for(const s of SEATS){ if(Math.hypot(s.x-WALK.x,s.z-WALK.z)>2.1) continue; const d=Math.hypot(s.x-ax,s.z-az); if(d<bd){ bd=d; best=s; } }
    return best?['座る',()=>{ WALK.seat=best; cam.yaw=best.yaw; cam.pitch=-0.05; }]:null; }
  if(PAX.seat) return ['立つ',()=>{ PAX.seat=null; }];
  const P=PAX.pier;
  if(gangDown() && dock.P===P){ const B=doorPoints().B; if(Math.hypot(PAX.x-B.x,PAX.z-B.z)<3) return ['船に乗る',boardShip]; }
  for(const bx of P.benches||[]){ const bz=shoreZ(P,bx,4.9); if(Math.hypot(PAX.x-bx,PAX.z-bz)<2)
    return ['ベンチに座る',()=>{ PAX.seat={x:bx,y:3.8+0.72,z:bz}; cam.yaw=-P.dir*Math.PI/2; cam.pitch=0; }]; }
  return null; }
function doWalkAction(){ if(!walking()) return; const a=walkAction(); if(a) return a[1]();
  if(camK()==='pax' && !PAX.onShip && !TRANS.on) toast(gangDown()&&dock.P===PAX.pier?'船の渡し板まで歩くと乗れます':'船の渡し板が掛かると乗れます'); }
let actLabel=null;
function actPrompt(){ const a=walkAction(), l=a?a[0]:''; if(l===actLabel) return; actLabel=l; const b=$('#actBtn'); b.hidden=!l; if(l) b.textContent=l+'（F）'; }
function viewGlass(){ const k=camK(), inside=k==='helm'||k==='cabin'||(k==='pax'&&PAX.onShip); ferry.userData.glassMats.forEach((o,m)=>{ m.opacity=inside?o*0.14:o; }); }
function walkCabin(dt){
  if(WALK.seat) return;
  const f=(input.up?1:0)-(input.down?1:0), r=(input.right?1:0)-(input.left?1:0); if(!f && !r) return;
  const cy=Math.cos(cam.yaw), sy=Math.sin(cam.yaw), l=Math.hypot(f,r), st=WALK.speed*dt/l, areas=WALK.lvl?WALK.roof:WALK.areas;
  const ok=(x,z)=>areas.some(([x0,x1,z0,z1])=>x>=x0&&x<=x1&&z>=z0&&z<=z1);
  const nx=WALK.x+(cy*f+sy*r)*st, nz=WALK.z+(-sy*f+cy*r)*st;
  if(ok(nx,nz)){ WALK.x=nx; WALK.z=nz; } else if(ok(nx,WALK.z)) WALK.x=nx; else if(ok(WALK.x,nz)) WALK.z=nz;   // slide along walls
  // a passenger who walks out through the gate onto the lowered gangway goes ashore
  if(camK()==='pax' && !WALK.lvl && gangDown() && Math.abs(WALK.x-ferry.userData.door.x)<0.6 && WALK.z*dock.side>2.45) leaveShip();
}
function setCabinLight(){ IN.cabLight.intensity=camK()==='cabin'?2.2:IN.night*0.9; }
function setCam(i){ endTrans(); camMode=i; const k=camK(); $('#vCam').textContent=CAM_MODES[i].label; cam.yaw=0;
  if(k==='chase'){cam.pitch=0.22;cam.dist=48;} if(k==='high'){cam.pitch=0.95;cam.dist=320;} if(k==='helm'){cam.pitch=-0.06;} if(k==='cabin'){cam.yaw=0; cam.pitch=-0.05;} if(k==='mirror'){cam.pitch=0;} if(k==='pax'){ cam.pitch=0; enterPax(); }
  viewGlass();
  setCabinLight(); $('#keys').textContent=k==='cabin'?KEYS_HINT.walk:k==='pax'?KEYS_HINT.pax:KEYS_HINT.drive;
  $('#pip').hidden=(k!=='helm'); $('#mirrorTag').hidden=(k!=='mirror');
  IN.mirrorMat.map=(k==='helm'||k==='mirror')?IN.mirrorRT.texture:null; IN.mirrorMat.color.set((k==='helm'||k==='mirror')?0xffffff:0x223038); IN.mirrorMat.needsUpdate=true; }
const _lp=new THREE.Vector3();
function interiorView(eye,sh){
  ferry.updateMatrixWorld();
  const p=eye.clone().applyMatrix4(ferry.matrixWorld);
  const dir=new THREE.Vector3(Math.cos(cam.yaw)*Math.cos(cam.pitch),Math.sin(cam.pitch),-Math.sin(cam.yaw)*Math.cos(cam.pitch));
  _lp.copy(eye).add(dir).applyMatrix4(ferry.matrixWorld);
  camera.position.copy(p).addScaledVector(sh,0.15); camera.up.set(0,1,0).applyQuaternion(ferry.quaternion); camera.lookAt(_lp);
}
function updateCamera(dt,t){
  const shake=game.shake; game.shake=Math.max(0,game.shake-dt*1.5);
  const sh=new THREE.Vector3((rnd()-.5)*shake,(rnd()-.5)*shake,(rnd()-.5)*shake);
  const k=camK(); actPrompt();
  if(k==='helm'){ interiorView(new THREE.Vector3(3.92,3.95,0.42),sh); camera.fov=62; camera.updateProjectionMatrix(); return; }
  if(TRANS.on){ // led along a path: ease along the way-points, with a little bob for each step
    TRANS.t+=dt/TRANS.dur; if(TRANS.t>=1) endTrans();
    else { const pts=TRANS.pts(), e=TRANS.t*TRANS.t*(3-2*TRANS.t), ls=[]; let tot=0; for(let i=1;i<pts.length;i++){ ls.push(pts[i].distanceTo(pts[i-1])); tot+=ls[i-1]; }
      let d=e*tot, i=0; while(i<ls.length-1 && d>ls[i]) d-=ls[i++];
      camera.position.copy(pts[i]).lerp(pts[i+1],ls[i]>0?d/ls[i]:0); camera.position.y+=Math.abs(Math.sin(e*tot*2.6))*0.05; camera.up.set(0,1,0);
      _lp.set(Math.cos(cam.yaw)*Math.cos(cam.pitch),Math.sin(cam.pitch),-Math.sin(cam.yaw)*Math.cos(cam.pitch)).add(camera.position); camera.lookAt(_lp);
      camera.fov=66; camera.updateProjectionMatrix(); return; } }
  if(k==='cabin'||(k==='pax'&&PAX.onShip)){ walkCabin(dt); if(TRANS.on) return; const st=WALK.seat;
    interiorView(st?new THREE.Vector3(st.x,HULLF.deckY(sOf(st.x))+1.27,st.z):new THREE.Vector3(WALK.x,WALK.lvl?ROOF_Y+WALK.eye:HULLF.deckY(sOf(WALK.x))+WALK.eye,WALK.z),sh);
    camera.fov=66; camera.updateProjectionMatrix(); return; }
  if(k==='pax' && !PAX.onShip){ walkShore(dt); if(TRANS.on) return;
    if(PAX.seat) camera.position.set(PAX.seat.x,PAX.seat.y,PAX.seat.z); else camera.position.set(PAX.x,PAX.y+WALK.eye,PAX.z); camera.up.set(0,1,0);
    _lp.set(Math.cos(cam.yaw)*Math.cos(cam.pitch),Math.sin(cam.pitch),-Math.sin(cam.yaw)*Math.cos(cam.pitch)).add(camera.position); camera.lookAt(_lp);
    camera.fov=66; camera.updateProjectionMatrix(); return; }
  if(k==='mirror'){ setMirrorCam(); camera.position.copy(IN.mirrorCam.position); camera.quaternion.copy(IN.mirrorCam.quaternion); camera.up.set(0,1,0); camera.fov=40; camera.updateProjectionMatrix(); return; }
  if(camera.fov!==55){ camera.fov=55; camera.updateProjectionMatrix(); }
  camera.up.set(0,1,0);
  const target=new THREE.Vector3(S.x,S.y+(k==='high'?0:4),S.z);
  const yaw=S.psi+Math.PI+cam.yaw;
  const cp=Math.cos(cam.pitch);
  const want=new THREE.Vector3(target.x+Math.cos(yaw)*cp*cam.dist, target.y+Math.sin(cam.pitch)*cam.dist, target.z-Math.sin(yaw)*cp*cam.dist);
  cam.pos.lerp(want,1-Math.exp(-dt*3.2));
  const minY=waveH(cam.pos.x,cam.pos.z,t)+1.8; if(cam.pos.y<minY) cam.pos.y=minY;
  cam.look.lerp(target,1-Math.exp(-dt*8));
  camera.position.copy(cam.pos).add(sh); camera.lookAt(cam.look);
}
// drag / wheel / pinch on canvas
const ptrs=new Map(); let pinch0=0, dist0=0;
canvas.addEventListener('pointerdown',e=>{ canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; pinch0=Math.hypot(a.x-b.x,a.y-b.y); dist0=cam.dist; } });
canvas.addEventListener('pointermove',e=>{ const p=ptrs.get(e.pointerId); if(!p) return;
  if(ptrs.size===1){ const dx=e.clientX-p.x, dy=e.clientY-p.y; cam.yaw-=dx*0.006; const ik=['helm','cabin','pax'].includes(camK()); if(camK()==='helm'){ cam.yaw=clamp(cam.yaw,-2.6,2.6); } cam.pitch=clamp(cam.pitch+dy*0.004,ik?-0.6:0.02,ik?0.6:1.35); }
  p.x=e.clientX; p.y=e.clientY;
  if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); if(pinch0>0) cam.dist=clamp(dist0*pinch0/d,14,600); } });
const endPtr=e=>{ ptrs.delete(e.pointerId); if(ptrs.size<2) pinch0=0; };
canvas.addEventListener('pointerup',endPtr); canvas.addEventListener('pointercancel',endPtr);
canvas.addEventListener('wheel',e=>{ e.preventDefault(); cam.dist=clamp(cam.dist*Math.exp(e.deltaY*0.001),14,600); },{passive:false});

/* ============================================================
   HUD: lever, helm, minimap, toasts, buttons, keys
   ============================================================ */
const NOTCHES=[[1,'全速'],[0.6,'半速'],[0.3,'微速'],[0,'停止'],[-0.25,'後進微速'],[-0.5,'後進']];
const lever=$('#lever'), notchWrap=$('#notches');
const thToY = v => (1-(v+0.5)/1.5);  // 0..1 top->bottom
NOTCHES.forEach(([v,l])=>{ const d=document.createElement('div'); d.className='notch'; d.textContent=l; d.dataset.v=v; notchWrap.appendChild(d); });
function layoutLever(){
  const rail=lever.querySelector('.rail'); const top=rail.offsetTop, h=rail.offsetHeight;
  notchWrap.querySelectorAll('.notch').forEach(n=>{ n.style.top=(top+thToY(+n.dataset.v)*h)+'px'; });
}
function drawLever(){
  const rail=lever.querySelector('.rail'); const h=rail.offsetHeight;
  const y=thToY(S.throttle)*h, y0=thToY(0)*h;
  $('#lvKnob').style.top=(y-9)+'px';
  const f=$('#lvFill'); f.style.top=Math.min(y,y0)+'px'; f.style.height=Math.abs(y-y0)+'px';
  f.style.background=S.throttle<0?'var(--warn)':'var(--amber)';
  let best=null,bd=9; notchWrap.querySelectorAll('.notch').forEach(n=>{ const d=Math.abs(+n.dataset.v-S.throttle); n.classList.remove('on'); if(d<bd){bd=d;best=n;} }); if(best && bd<0.08) best.classList.add('on');
}
function leverFromEvent(e){
  const rail=lever.querySelector('.rail').getBoundingClientRect();
  let t=clamp((e.clientY-rail.top)/rail.height,0,1); let v=(1-t)*1.5-0.5;
  for(const [nv] of NOTCHES) if(Math.abs(nv-v)<0.04) v=nv;
  if(game.state==='sailing') S.throttle=v;
}
let leverDrag=false;
lever.addEventListener('pointerdown',e=>{ if(AUTO.on) setAuto(false); leverDrag=true; lever.setPointerCapture(e.pointerId); leverFromEvent(e); });
lever.addEventListener('pointermove',e=>{ if(leverDrag) leverFromEvent(e); });
lever.addEventListener('pointerup',()=>leverDrag=false); lever.addEventListener('pointercancel',()=>leverDrag=false);
const rud=$('#rud'); let rudDrag=false;
function rudFromEvent(e){ const r=rud.getBoundingClientRect(); input.rudTouch=clamp(((e.clientX-r.left)/r.width-0.5)*2.2,-1,1); }
rud.addEventListener('pointerdown',e=>{ if(AUTO.on) setAuto(false); rudDrag=true; rud.setPointerCapture(e.pointerId); rudFromEvent(e); });
rud.addEventListener('pointermove',e=>{ if(rudDrag) rudFromEvent(e); });
const rudEnd=()=>{ rudDrag=false; input.rudTouch=null; };
rud.addEventListener('pointerup',rudEnd); rud.addEventListener('pointercancel',rudEnd);
for(const [id,v] of [['#thL',-1],['#thR',1]]){ const b=$(id);
  b.addEventListener('pointerdown',e=>{ b.setPointerCapture(e.pointerId); input.thTouch=v; b.classList.add('act'); });
  const off=()=>{ input.thTouch=0; b.classList.remove('act'); }; b.addEventListener('pointerup',off); b.addEventListener('pointercancel',off); }
function drawHelm(){ $('#rudKnob').style.left=(50+S.rudder*42)+'%'; $('#rudVal').textContent=(S.rudder>0?'右 ':S.rudder<0?'左 ':'')+Math.round(Math.abs(S.rudder)*35)+'°'; }
let toastTimer=0;
function toast(msg,cls){ const t=$('#toast'); t.textContent=msg; t.className='panel show'+(cls?' '+cls:''); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.className='panel',2600); }
$('#bCam').onclick=()=>setCam((camMode+1)%CAM_MODES.length);
$('#bTod').onclick=()=>applyTOD(TOD_ORDER[(TOD_ORDER.indexOf(todKey)+1)%3]);
$('#bSea').onclick=()=>applySea((seaIdx+1)%3);
$('#bTide').onclick=()=>{ game.tide=!game.tide; $('#vTide').textContent=game.tide?'あり':'なし'; };
$('#bSnd').onclick=()=>{ sfx.init(); sfx.toggle(); };
const menuBtn=$('#menuBtn'), toolsEl=$('#tools');
function setMenu(open){ toolsEl.hidden=!open; menuBtn.setAttribute('aria-expanded',open?'true':'false'); }
menuBtn.onclick=e=>{ e.stopPropagation(); setMenu(toolsEl.hidden); };
toolsEl.addEventListener('pointerdown',e=>e.stopPropagation());
window.addEventListener('pointerdown',e=>{ if(!toolsEl.hidden && e.target!==menuBtn && !menuBtn.contains(e.target)) setMenu(false); });
window.addEventListener('keydown',e=>{ if(e.code==='Escape') setMenu(false); });
(function(){ const bind=(id,get,set)=>{ const el=$(id); el.value=Math.round(get()*100); el.addEventListener('input',()=>{ set(el.value/100); sfx.init(); if(!sfx.isOn||true) sfx.applyVol(); try{ localStorage.setItem('kanmon-vol',JSON.stringify({m:MASTERVOL,e:ENGVOL,w:ENVVOL})); }catch(e){} }); };
  bind('#volMaster',()=>MASTERVOL,v=>MASTERVOL=v); bind('#volEng',()=>ENGVOL,v=>ENGVOL=v); bind('#volEnv',()=>ENVVOL,v=>ENVVOL=v); })();
$('#bQ').onclick=()=>{ const order=['auto',0,1,2]; const cur=QUALITY.mode==='auto'?'auto':QUALITY.level; const nx=order[(order.indexOf(cur)+1)%4]; if(nx==='auto'){ QUALITY.mode='auto'; } else { QUALITY.mode='fixed'; QUALITY.level=nx; } applyQuality(); };
$('#bHorn').onclick=()=>{ sfx.init(); sfx.horn(); };
$('#gangBtn').onclick=workGangway; $('#actBtn').onclick=doWalkAction;
$('#bAuto').onclick=()=>setAuto(!AUTO.on);
const KEYMAP={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyQ:'q',KeyE:'e'};
window.addEventListener('keydown',e=>{
  if(e.target && e.target.tagName==='INPUT') return;
  if(AUTO.on && (e.code==='KeyX' || (KEYMAP[e.code] && !walking()))) setAuto(false);   // taking the controls ends the autopilot
  if(KEYMAP[e.code]){ input[KEYMAP[e.code]]=true; e.preventDefault(); }
  if(e.code==='KeyX' && game.state==='sailing') S.throttle=0;
  if(e.code==='KeyP' && !e.repeat) setAuto(!AUTO.on);
  if(e.code==='KeyF' && !e.repeat) doWalkAction();
  if(e.code==='KeyC' && !e.repeat) setCam((camMode+1)%CAM_MODES.length);
  if(/^Digit[1-7]$/.test(e.code)){ const i=+e.code.slice(5)-1; if(i<CAM_MODES.length) setCam(i); }
  if(e.code==='KeyH' && !e.repeat){ sfx.init(); sfx.horn(); }
  if(e.code==='KeyG' && !e.repeat) workGangway();
  if(e.code==='Enter' && !$('#intro').hidden) $('#start').click();
});
window.addEventListener('keyup',e=>{ if(KEYMAP[e.code]) input[KEYMAP[e.code]]=false; });
window.addEventListener('blur',()=>{ for(const k in input) if(typeof input[k]==='boolean') input[k]=false; });

const mm=$('#minimap'), mg=mm.getContext('2d');
const [MX0,MX1]=STAGE.map, MZ0=-(MX1-MX0)*0.375, MZ1=(MX1-MX0)*0.375;   // the map canvas is 4:3
function drawMinimap(){
  const W=mm.width, H=mm.height, sx=W/(MX1-MX0), sz=H/(MZ1-MZ0);
  const X=x=>(x-MX0)*sx, Z=z=>(z-MZ0)*sz;
  const dark = getComputedStyle(document.documentElement).getPropertyValue('--text').trim().startsWith('#e');
  mg.fillStyle=dark?'#0d3346':'#6fa9c2'; mg.fillRect(0,0,W,H);
  mg.fillStyle=dark?'#2b3a33':'#c9cfbf';
  mg.beginPath(); mg.moveTo(0,0); for(let x=MX0;x<=MX1;x+=40) mg.lineTo(X(x),Z(northZ(x))); mg.lineTo(W,0); mg.fill();
  mg.beginPath(); mg.moveTo(0,H); for(let x=MX0;x<=MX1;x+=40) mg.lineTo(X(x),Z(southZ(x))); mg.lineTo(W,H); mg.fill();
  // bridge
  if(STAGE.bridge!==false){ mg.strokeStyle=dark?'#dfe6ea':'#44525d'; mg.lineWidth=3; mg.beginPath(); mg.moveTo(X(BRIDGE_X),Z(northZ(BRIDGE_X)-60)); mg.lineTo(X(BRIDGE_X),Z(southZ(BRIDGE_X)+60)); mg.stroke(); }
  mg.strokeStyle=dark?'#c9d1d6':'#55606a'; mg.lineWidth=3; BW.forEach(pl=>{ mg.beginPath(); pl.forEach(([x,z],i)=>i?mg.lineTo(X(x),Z(z)):mg.moveTo(X(x),Z(z))); mg.stroke(); });
  mg.fillStyle=dark?'#9fb0c0':'#34495e'; EXTRA_PONTOONS.forEach(p=>mg.fillRect(X(p.x)-5,Z(p.z)-2,10,4));
  // piers
  for(const k in PIERS){ const P=PIERS[k]; mg.fillStyle=k===game.to?'#40ffb0':(dark?'#9fb0c0':'#34495e'); mg.fillRect(X(P.x)-7,Z(P.pz)-3,14,6);
    mg.fillStyle=dark?'#e8f1ff':'#0c2244'; mg.font='700 20px "Zen Kaku Gothic New",sans-serif'; mg.textAlign='center'; mg.fillText(P.name,X(P.x),Z(P.pz)+(P.dir>0?-12:26)); }
  // cargo ships
  mg.fillStyle='#ffb02e'; cargos.forEach(c=>{ mg.fillRect(X(c.x)-c.len*sx/2,Z(c.z)-4,c.len*sx,8); });
  // current arrow
  const cur=currentAt(S.x); if(Math.abs(cur)>0.05){ mg.strokeStyle='rgba(255,255,255,.85)'; mg.lineWidth=2; const cx=W-44, cy=H-16, L=Math.min(30,Math.abs(cur)*16)*Math.sign(cur);
    mg.beginPath(); mg.moveTo(cx-L,cy); mg.lineTo(cx+L,cy); mg.lineTo(cx+L-Math.sign(L)*7,cy-5); mg.moveTo(cx+L,cy); mg.lineTo(cx+L-Math.sign(L)*7,cy+5); mg.stroke(); }
  drawRouteMap(mg,X,Z);
  // ship
  mg.save(); mg.translate(X(S.x),Z(S.z)); mg.rotate(-S.psi); mg.fillStyle='#ff4d3d'; mg.strokeStyle='#fff'; mg.lineWidth=2;
  mg.beginPath(); mg.moveTo(13,0); mg.lineTo(-8,7); mg.lineTo(-5,0); mg.lineTo(-8,-7); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
}

/* ============================================================
   Sound (Web Audio, all synthesized)
   ============================================================ */
const sfx=(()=>{
  let lapT=0, surfT=0, wnBuf=null;
  let ac=null, on=false, master, eng, sub, engGain, shaper, engLP, chugGain, chugLFO, chugDepth, turbo, turboGain, jetGain, jetFilt, washGain, washFilt, rpm=650;
  function noiseBuf(brown){ const b=ac.createBuffer(1,ac.sampleRate*3,ac.sampleRate), d=b.getChannelData(0); let l=0; for(let i=0;i<d.length;i++){ const w=Math.random()*2-1; if(brown){ l=(l+0.02*w)/1.02; d[i]=l*3.5; } else d[i]=w; } return b; }
  function dieselWave(){ const n=40, re=new Float32Array(n), im=new Float32Array(n); const amp=[0,1,.75,.9,.55,.7,.4,.5,.3,.42,.22,.3,.18,.24,.12,.16];
    for(let i=1;i<n;i++){ const a=(amp[i]!==undefined?amp[i]:0.1/i*6)*(0.8+0.4*Math.random()); const ph=Math.random()*6.28; re[i]=a*Math.cos(ph); im[i]=a*Math.sin(ph); }
    return ac.createPeriodicWave(re,im); }
  function curve(k){ const n=1024, c=new Float32Array(n); for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.tanh(x*k)/Math.tanh(k); } return c; }
  return {
    init(){ if(ac) return; try{ ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
      master=ac.createGain(); master.gain.value=0; const comp=ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
      // engine core: firing-frequency harmonic stack -> soft clipping -> low-pass (muffled through the hull)
      eng=ac.createOscillator(); eng.setPeriodicWave(dieselWave()); eng.frequency.value=32;
      sub=ac.createOscillator(); sub.type='sine'; sub.frequency.value=16;
      const subG=ac.createGain(); subG.gain.value=0.5;
      shaper=ac.createWaveShaper(); shaper.curve=curve(2.2); shaper.oversample='2x';
      engLP=ac.createBiquadFilter(); engLP.type='lowpass'; engLP.frequency.value=320; engLP.Q.value=0.9;
      engGain=ac.createGain(); engGain.gain.value=0.1;
      eng.connect(shaper); sub.connect(subG); subG.connect(shaper); shaper.connect(engLP); engLP.connect(engGain); engGain.connect(master);
      // exhaust chug: brown noise, amplitude-modulated at the firing frequency
      const ex=ac.createBufferSource(); ex.buffer=noiseBuf(true); ex.loop=true;
      const exF=ac.createBiquadFilter(); exF.type='bandpass'; exF.frequency.value=140; exF.Q.value=0.8;
      chugGain=ac.createGain(); chugGain.gain.value=0.25;
      chugLFO=ac.createOscillator(); chugLFO.type='sawtooth'; chugLFO.frequency.value=32; chugDepth=ac.createGain(); chugDepth.gain.value=0.22; chugLFO.connect(chugDepth); chugDepth.connect(chugGain.gain);
      ex.connect(exF); exF.connect(chugGain); chugGain.connect(master);
      // turbocharger whine
      turbo=ac.createOscillator(); turbo.type='sine'; turbo.frequency.value=1800; turboGain=ac.createGain(); turboGain.gain.value=0.0; turbo.connect(turboGain); turboGain.connect(master);
      // water-jet intake/outlet roar and hull wash
      wnBuf=noiseBuf(false); const wn=ac.createBufferSource(); wn.buffer=wnBuf; wn.loop=true;
      jetFilt=ac.createBiquadFilter(); jetFilt.type='bandpass'; jetFilt.frequency.value=420; jetFilt.Q.value=0.5; jetGain=ac.createGain(); jetGain.gain.value=0.0;
      wn.connect(jetFilt); jetFilt.connect(jetGain); jetGain.connect(master);
      const ns=ac.createBufferSource(); ns.buffer=noiseBuf(true); ns.loop=true;
      washFilt=ac.createBiquadFilter(); washFilt.type='bandpass'; washFilt.frequency.value=700; washFilt.Q.value=0.6;
      washGain=ac.createGain(); washGain.gain.value=0.05; ns.connect(washFilt); washFilt.connect(washGain); washGain.connect(master);
      eng.start(); sub.start(); ex.start(); chugLFO.start(); turbo.start(); wn.start(); ns.start(); this.set(true); },
    set(v){ on=v; if(!ac) return; if(ac.state==='suspended') ac.resume(); master.gain.setTargetAtTime(on?0.85*MASTERVOL:0,ac.currentTime,0.2); $('#vSnd').textContent=on?'オン':'オフ'; },
    toggle(){ this.set(!on); },
    applyVol(){ if(ac&&on) master.gain.setTargetAtTime(0.85*MASTERVOL,ac.currentTime,0.05); },
    update(dt){ if(!ac||!on) return; const t=ac.currentTime, th=Math.abs(S.throttle), sp=clamp(Math.abs(S.u)/VMAX,0,1);
      const target=650+th*1450+Math.abs(S.thr)*250; rpm+=(target-rpm)*Math.min(1,(dt||0.016)*(target>rpm?0.9:0.6));
      const load=clamp(th*1.2-sp*0.5+Math.abs(S.thr)*0.3,0,1);
      const fire=rpm/60*3; // 6-cylinder four-stroke firing frequency
      const wob=1+Math.sin(t*3.1)*0.004+Math.sin(t*7.7)*0.003;
      eng.frequency.setTargetAtTime(fire*wob,t,0.05); sub.frequency.setTargetAtTime(fire/2*wob,t,0.05); chugLFO.frequency.setTargetAtTime(fire*wob,t,0.05);
      engLP.frequency.setTargetAtTime(220+rpm*0.28+load*300,t,0.1);
      engGain.gain.setTargetAtTime((0.07+th*0.10+load*0.05)*ENGVOL,t,0.15);
      chugGain.gain.setTargetAtTime((0.18+load*0.3)*ENGVOL,t,0.15); chugDepth.gain.setTargetAtTime((0.15+load*0.25)*ENGVOL,t,0.15);
      turbo.frequency.setTargetAtTime(900+rpm*1.9,t,0.3); turboGain.gain.setTargetAtTime(Math.max(0,(rpm-900)/1300)*0.012*ENGVOL,t,0.3);
      jetGain.gain.setTargetAtTime((0.02+th*0.09)*ENGVOL,t,0.2); jetFilt.frequency.setTargetAtTime(300+th*500,t,0.2);
      washGain.gain.setTargetAtTime((0.03+sp*0.22+waveAmp*0.02)*ENVVOL,t,0.3); washFilt.frequency.setTargetAtTime(500+sp*900,t,0.3); },
    splash(gain,freq,dur,q){ if(!ac||!on) return; const t=ac.currentTime+Math.random()*0.03, src=ac.createBufferSource(); src.buffer=wnBuf; src.playbackRate.value=0.8+Math.random()*0.5;
      const f=ac.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=q||1.2; const gn=ac.createGain();
      gn.gain.setValueAtTime(0.0001,t); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002,gain*ENVVOL),t+0.012); gn.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      src.connect(f); f.connect(gn); gn.connect(master); src.start(t,Math.random()*2); src.stop(t+dur+0.05); },
    /* a sea burst over the bow: a low boom under a long hiss of falling spray */
    slam(v){ if(!ac||!on) return; this.thud(2+v*2.2); this.splash(clamp(0.3+v*0.16,0.3,0.8),150+Math.random()*70,0.6+v*0.15,0.6); this.splash(clamp(0.22+v*0.1,0.2,0.6),700+Math.random()*400,0.9+v*0.2,0.5); this.splash(clamp(0.12+v*0.06,0.1,0.35),2600+Math.random()*1200,1.3,0.7); },
    slap(v){ if(!ac||!on) return; this.splash(clamp(0.12+v*0.14,0.1,0.5),260+Math.random()*200,0.28+v*0.08,0.8); this.splash(clamp(0.05+v*0.06,0.04,0.25),1400+Math.random()*900,0.35,0.9);
      const t=ac.currentTime, o=ac.createOscillator(), g=ac.createGain(); o.type='sine'; o.frequency.setValueAtTime(95,t); o.frequency.exponentialRampToValueAtTime(45,t+0.18);
      g.gain.setValueAtTime(Math.max(0.002,clamp(0.1+v*0.12,0.05,0.4)*ENVVOL),t); g.gain.exponentialRampToValueAtTime(0.001,t+0.22); o.connect(g); g.connect(master); o.start(t); o.stop(t+0.25); },
    water(dt){ if(!ac||!on) return;
      const sp=Math.abs(S.u), near=-landD(S.x,S.z), atPier=Math.min(...Object.values(PIERS).map(P=>Math.hypot(S.x-P.x,S.z-P.pz)));
      lapT-=dt; if(lapT<=0){ const calm=1-clamp(sp/5,0,1); const rate=(0.6+waveAmp*1.4)*(0.4+calm);
        lapT=(0.35+Math.random()*0.9)/rate;
        const g=(0.025+waveAmp*0.03)*(0.5+calm)*(atPier<45?1.8:1);
        this.splash(g,500+Math.random()*1300,0.18+Math.random()*0.25,1.1);
        if(Math.random()<0.35) this.splash(g*0.7,180+Math.random()*160,0.3,0.9); }
      const shore=clamp(1-near/120,0,1); surfT-=dt; if(shore>0.02 && surfT<=0){ surfT=1.2+Math.random()*2.5; this.splash(0.05+shore*0.14*waveAmp,300+Math.random()*500,1.4+Math.random(),0.5); } },
    horn(){ if(!ac||!on) return; const t=ac.currentTime, g=ac.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.22,t+0.08); g.gain.setValueAtTime(0.22,t+1.3); g.gain.linearRampToValueAtTime(0,t+1.7);
      const lp=ac.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1300; lp.connect(g); g.connect(master);
      for(const f of [147,185,220]){ const o=ac.createOscillator(); o.type='sawtooth'; o.frequency.value=f; o.connect(lp); o.start(t); o.stop(t+1.8); } },
    squeak(v){ if(!ac||!on) return; const t=ac.currentTime+0.01, dur=0.07+Math.random()*0.1;
      const o=ac.createOscillator(); o.type='sawtooth'; const f0=560+Math.random()*420;
      o.frequency.setValueAtTime(f0,t); o.frequency.linearRampToValueAtTime(f0*(1.3+Math.random()*0.5),t+dur*0.7); o.frequency.linearRampToValueAtTime(f0*1.05,t+dur);
      const lfo=ac.createOscillator(); lfo.frequency.value=24+Math.random()*22; const lg=ac.createGain(); lg.gain.value=f0*0.06; lfo.connect(lg); lg.connect(o.frequency);
      const b1=ac.createBiquadFilter(); b1.type='bandpass'; b1.frequency.value=2300+Math.random()*900; b1.Q.value=4;
      const b2=ac.createBiquadFilter(); b2.type='bandpass'; b2.frequency.value=4200+Math.random()*1200; b2.Q.value=5;
      const g=ac.createGain(); const pk=Math.max(0.002,0.7*v*ENVVOL);
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+0.02); g.gain.setValueAtTime(pk,t+dur*0.65); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t+dur+0.05); lfo.stop(t+dur+0.05); },
    fender(v){ if(!ac||!on) return; const t=ac.currentTime, o=ac.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(95,t); o.frequency.exponentialRampToValueAtTime(55,t+0.5); const g=ac.createGain(); g.gain.setValueAtTime(Math.max(0.002,clamp(0.08+v*0.35,0.05,0.5)*ENVVOL),t); g.gain.exponentialRampToValueAtTime(0.001,t+0.6); o.connect(g); g.connect(master); o.start(t); o.stop(t+0.65); },
    /* a firework bursting some way off: heard `delay` seconds after it is seen */
    boom(v,delay){ if(!ac||!on) return; const t=ac.currentTime+delay, src=ac.createBufferSource(); src.buffer=wnBuf; const f=ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=160+v*500; const g=ac.createGain(), pk=Math.max(0.002,v*0.9*ENVVOL);
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+0.015); g.gain.exponentialRampToValueAtTime(0.0001,t+1.3); src.connect(f); f.connect(g); g.connect(master); src.start(t,Math.random()*1.5); src.stop(t+1.4);
      const o=ac.createOscillator(), og=ac.createGain(); o.type='sine'; o.frequency.setValueAtTime(85,t); o.frequency.exponentialRampToValueAtTime(34,t+0.45); og.gain.setValueAtTime(0.0001,t); og.gain.exponentialRampToValueAtTime(pk,t+0.01); og.gain.exponentialRampToValueAtTime(0.0001,t+0.6); o.connect(og); og.connect(master); o.start(t); o.stop(t+0.65); },
    thud(s){ if(!ac||!on) return; const t=ac.currentTime, src=ac.createBufferSource(); src.buffer=noiseBuf(); const f=ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=180; const g=ac.createGain();
      g.gain.setValueAtTime(clamp(s*0.15,0.1,0.8),t); g.gain.exponentialRampToValueAtTime(0.001,t+0.7); src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t+0.8); }
  };
})();
