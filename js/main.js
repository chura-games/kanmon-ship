/* 関門汽船 運転シミュレーター — メインループ：画質の自動調整、水面反射、毎フレームの更新 */
'use strict';

/* ============================================================
   Main loop
   ============================================================ */
buildLights();
applyTOD('day'); applySea(STAGE.sea===undefined?1:STAGE.sea); setCam(0);
setMoored(STAGE.piers[0].key);
cam.pos.set(S.x-40,14,S.z-30);
requestAnimationFrame(()=>layoutLever());
window.addEventListener('resize',layoutLever);
/* ============================================================
   Quality (adaptive resolution) + planar reflection pass
   ============================================================ */
var QUALITY = { mode:'auto', level:1, pr:Math.min(window.devicePixelRatio||1,1), rs:0.33 };
const QLEVELS=[{name:'軽量',prMax:0.8,refl:false,rs:0.25},{name:'標準',prMax:1.25,refl:true,rs:0.33},{name:'高',prMax:Math.min(window.devicePixelRatio||1,2),refl:true,rs:0.5}];
function applyQuality(){
  const L=QLEVELS[QUALITY.level]; QUALITY.rs=L.rs;
  QUALITY.pr = QUALITY.mode==='auto' ? Math.min(QUALITY.pr,L.prMax) : L.prMax;
  renderer.setPixelRatio(QUALITY.pr); resize();
  U.uReflOn.value=L.refl?1:0;
  const sm=QUALITY.level===2?2048:1024;
  // 軽量 turns shadows off by no longer redrawing the shadow map and leaving it blank — switching the light's castShadow would make every shader recompile
  const shadows=QUALITY.level>0;
  if(renderer.shadowMap.autoUpdate!==shadows){ renderer.shadowMap.autoUpdate=shadows;
    if(!shadows && sun.shadow.map){ const c=renderer.getClearColor(new THREE.Color()), a=renderer.getClearAlpha(); renderer.setRenderTarget(sun.shadow.map); renderer.setClearColor(0xffffff,1); renderer.clear(); renderer.setRenderTarget(null); renderer.setClearColor(c,a); } }
  if(sun.shadow.mapSize.x!==sm){ sun.shadow.mapSize.set(sm,sm); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; } }
  $('#vQ').textContent=(QUALITY.mode==='auto'?'自動・':'')+L.name;
}
let perfAcc=0, perfN=0, perfT=0, qHold=0;
function adaptQuality(dt){
  if(QUALITY.mode!=='auto' || document.hidden) return;
  perfAcc+=dt; perfN++; perfT+=dt;
  if(perfT<1.5) return;
  const avg=perfAcc/perfN; perfAcc=0; perfN=0; perfT=0;
  const L=QLEVELS[QUALITY.level];
  // Resizing the canvas wipes it, so only touch the quality when it really changes (and before the frame is drawn, see frame()).
  // After stepping down, wait a while before trying to step back up, or a machine on the edge keeps flipping between the two.
  qHold=Math.max(0,qHold-1.5);
  if(avg>1/36){ if(QUALITY.pr>0.62){ QUALITY.pr=Math.max(0.6,QUALITY.pr*0.85); } else if(QUALITY.level>0){ QUALITY.level--; } else return; qHold=30; applyQuality(); }
  else if(avg<1/57 && qHold<=0){ if(QUALITY.pr<L.prMax-0.01){ QUALITY.pr=Math.min(L.prMax,QUALITY.pr*1.1); applyQuality(); } else if(QUALITY.level<2 && avg<1/75){ QUALITY.level++; QUALITY.pr=Math.min(QUALITY.pr,QLEVELS[QUALITY.level].prMax); applyQuality(); } }
}
const reflCam=new THREE.PerspectiveCamera();
const clipPlane=new THREE.Plane(new THREE.Vector3(0,1,0),1e6);
renderer.clippingPlanes=[clipPlane];
const _cd=new THREE.Vector3();
function reflHideList(){ const l=[waterInner,waterOuter,spPoints,flPoints,wakeT.mesh,wakeK.mesh,plank]; if(streakMesh) l.push(streakMesh); cargos.forEach(c=>l.push(c.wake.mesh,c.wakeK.mesh)); for(const k in PIERS) l.push(PIERS[k].marker); return l; }
let REFL_HIDE=null;
function renderReflection(){
  if(!REFL_HIDE) REFL_HIDE=reflHideList();
  camera.updateMatrixWorld(); camera.getWorldDirection(_cd);
  const p=camera.position;
  reflCam.position.set(p.x,-p.y,p.z);
  reflCam.up.set(camera.up.x,-camera.up.y,camera.up.z);
  reflCam.lookAt(p.x+_cd.x,-p.y-_cd.y,p.z+_cd.z);
  reflCam.projectionMatrix.copy(camera.projectionMatrix); reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  const vis=REFL_HIDE.map(o=>o.visible); REFL_HIDE.forEach(o=>o.visible=false);
  sky.position.copy(reflCam.position);
  clipPlane.constant=0.25;
  renderer.setRenderTarget(reflRT); renderer.render(scene,reflCam); renderer.setRenderTarget(null);
  clipPlane.constant=1e6;
  REFL_HIDE.forEach((o,i)=>o.visible=vis[i]);
  sky.position.copy(camera.position);
}
function updateAssist(){
  const el=$('#assist'), P=PIERS[game.to];
  const dist=Math.hypot(S.x-P.bx,S.z-P.bz);
  if(game.state!=='sailing' || !game.departed || dist>150){ if(!el.hidden) el.hidden=true; return; }
  el.hidden=false;
  const along=S.x-P.bx, gap=Math.abs(S.z-P.pz)-4.45-SHIP_B/2-0.07;
  const c=Math.cos(S.psi), s=Math.sin(S.psi), vz=-s*S.u+c*S.v, toward=vz*Math.sign(P.pz-S.z);
  const ang=Math.abs(Math.asin(clamp(Math.sin(S.psi-P.psi),-1,1)))*180/Math.PI, sog=Math.hypot(S.u,S.v)*1.944;
  const set=(id,txt,ok)=>{ const d=$(id); d.textContent=txt; d.className='num '+(ok?'ok':'ng'); };
  set('#asAlong',(Math.abs(along)<0.5?'±0':(along<0?'手前 ':'行き過ぎ '))+Math.abs(along).toFixed(1)+' m',Math.abs(along)<8);
  set('#asGap',Math.max(0,gap).toFixed(1)+' m',gap<1.0);
  set('#asLat',(toward*1.944).toFixed(2)+' kn',toward*1.944<0.8);
  set('#asSog',sog.toFixed(1)+' kn',sog<1.2);
  set('#asAng',ang.toFixed(0)+'°',ang<10);
}
applyQuality();
const _dbs=new THREE.Vector2();
const fullRT=new THREE.WebGLRenderTarget(4,4); fullRT.texture.repeat.x=-1; fullRT.texture.offset.x=1;
const blitScene=new THREE.Scene(), blitCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const blitQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({toneMapped:false,depthTest:false,depthWrite:false})); blitQuad.frustumCulled=false; blitScene.add(blitQuad);
let last=performance.now(), mmT=0;
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  adaptQuality(dt);
  game.simT+=dt; const t=game.simT; U.uTime.value=t;
  U.uFlow.value.x+=currentAt(camera.position.x)*dt;
  if(game.state==='sailing'){ game.elapsed+=dt; game.msgT-=dt; }
  stepShip(dt,t); stepWorld(dt,t); updateSpray(dt,t); checkDock(); updateDock(dt,t); updatePeople(dt,t);
  updateCamera(dt,t);
  const snap=v=>Math.round(v/4)*4;
  waterInner.position.set(snap(camera.position.x),0,snap(camera.position.z)); waterOuter.position.copy(waterInner.position);
  sky.position.copy(camera.position);
  sun.position.set(S.x+U.uSunDir.value.x*300,S.y+U.uSunDir.value.y*300,S.z+U.uSunDir.value.z*300); sun.target.position.set(S.x,S.y,S.z); sun.target.updateMatrixWorld();
  drawLever(); drawHelm();
  mmT-=dt;
  if(mmT<=0){ mmT=0.1;
    const P=PIERS[game.to];
    $('#dist').textContent=Math.round(Math.hypot(S.x-P.bx,S.z-P.bz)).toLocaleString('ja-JP')+' m';
    $('#time').textContent=fmtTime(game.elapsed); $('#hits').textContent=game.hits+' 回';
    $('#spd').textContent=(S.u*1.944).toFixed(1);
    const hdg=((Math.atan2(Math.cos(S.psi),Math.sin(S.psi))*180/Math.PI)+360)%360;
    $('#hdg').textContent=String(Math.round(hdg)%360).padStart(3,'0')+'°';
    const cur=currentAt(S.x); $('#cur').textContent=Math.abs(cur)<0.05?'—':(cur>0?'東 ':'西 ')+(Math.abs(cur)*1.944).toFixed(1)+'kn';
    drawMinimap(); updateAssist();
  }
  sfx.update(dt); sfx.water(dt);
  const ck=camK();
  updateHelmParts();
  if(ck==='helm'||ck==='mirror'){
    if(ck==='helm'){ drawInstruments(dt); setMirrorCam(); const ro=U.uReflOn.value; U.uReflOn.value=0; IN.mirrorGroup.visible=false; renderer.setRenderTarget(IN.mirrorRT); renderer.render(scene,IN.mirrorCam); renderer.setRenderTarget(null); IN.mirrorGroup.visible=true; U.uReflOn.value=ro; }
  }
  IN.mirrorGroup.visible=(ck!=='mirror');
  if(U.uReflOn.value>0.5) renderReflection();
  if(ck==='mirror'){
    const sz=renderer.getDrawingBufferSize(_dbs); if(fullRT.width!==sz.x||fullRT.height!==sz.y) fullRT.setSize(sz.x,sz.y);
    renderer.setRenderTarget(fullRT); renderer.render(scene,camera); renderer.setRenderTarget(null);
    blitQuad.material.map=fullRT.texture; renderer.render(blitScene,blitCam);
  } else renderer.render(scene,camera);
  if(ck==='helm'){ const r=$('#pip').getBoundingClientRect(); if(r.width>0){ const y=window.innerHeight-r.bottom;
      renderer.setScissorTest(true); renderer.setViewport(r.left+4,y+4,r.width-8,r.height-8); renderer.setScissor(r.left+4,y+4,r.width-8,r.height-8);
      blitQuad.material.map=IN.mirrorRT.texture; renderer.render(blitScene,blitCam);
      renderer.setScissorTest(false); renderer.setViewport(0,0,window.innerWidth,window.innerHeight); } }
  requestAnimationFrame(frame);
}
/* ============================================================
   Shader warm-up. The GPU compiles one program per kind of material, which adds up to tens of seconds on
   integrated graphics. Left to the first frame it freezes the page, so compile here one material at a time,
   each drawn alone on a few pixels (to the screen and to a render target, which use different programs), showing the progress
   on the start button. Hidden parts (helm, gangplank, sea life…) are included so they don't stall later.
   ============================================================ */
function warmUp(done){
  const objs=[], state=[], seen=new Set(), rt=new THREE.WebGLRenderTarget(8,8); let i=0;
  scene.traverse(o=>{ state.push([o,o.visible,o.frustumCulled]); o.frustumCulled=false;
    if(o.isMesh||o.isPoints||o.isLine||o.isSprite){ o.visible=false; objs.push(o); } else if(!o.isLight) o.visible=true; });
  renderer.setScissorTest(true); renderer.setViewport(0,0,8,8); renderer.setScissor(0,0,8,8);
  (function step(){
    const t0=performance.now();
    while(i<objs.length && performance.now()-t0<30){ const o=objs[i++];
      const key=[].concat(o.material).map(m=>m.uuid).join()+(o.isInstancedMesh?'i':'')+(o.castShadow?'c':'')+(o.receiveShadow?'r':'');
      if(seen.has(key)) continue; seen.add(key);
      o.visible=true; renderer.render(scene,camera); renderer.setRenderTarget(rt); renderer.render(scene,camera); renderer.setRenderTarget(null); o.visible=false; }
    if(i<objs.length){ BOOT.progress('3D を準備中… '+Math.round(i/objs.length*100)+'%'); requestAnimationFrame(step); return; }
    state.forEach(([o,v,fc])=>{ o.visible=v; o.frustumCulled=fc; });
    renderer.setScissorTest(false); resize(); rt.dispose();
    BOOT.done(); done();
  })();
}
warmUp(()=>{ last=performance.now(); requestAnimationFrame(frame); });

