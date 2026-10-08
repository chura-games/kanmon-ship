/* 関門汽船 運転シミュレーター — 船：船体モデル（models/ferry.glb）の組み込み、操舵席の計器・右ミラー、船首波 */
'use strict';

/* ============================================================
   The ferry (white hull, red bottom, dark window band)
   Local frame: +x bow, +y up, +z starboard.
   HULLF is the hull outline the game computes with (bow wave, deck heights,
   boarding points); it does not follow edits made to the model in Blender.
   ============================================================ */
const HULLF = {
  deckHalf: s => Math.max(0.02, s<0.58 ? SHIP_B/2*(s<0.03?0.93+s*2.3:1) : SHIP_B/2*Math.sqrt(Math.max(0,1-Math.pow((s-0.58)/0.42,2)))),
  deckY: s => 2.05 + 0.85*Math.pow(smooth(0.45,1,s),1.4),
  chineHalf: s => s<0.5 ? SHIP_B/2*0.9 : SHIP_B/2*0.9*Math.sqrt(Math.max(0,1-Math.pow((s-0.5)/0.38,2))),
  chineY: s => -0.45 + 0.9*Math.pow(smooth(0.5,0.88,s),1.3),
  keelY: s => s<0.55 ? -0.95 : s<0.88 ? -0.95+1.4*Math.pow((s-0.55)/0.33,2) : lerp(0.45, 2.85, (s-0.88)/0.12),
};
const sOf = x => (x+SHIP_L/2)/SHIP_L;
/* half-width of the hull section at station s where the water stands at height y (hull frame): keel → chine → sheer */
HULLF.halfAt = (s,y) => { const ky=HULLF.keelY(s); if(y<=ky) return 0; const dh=HULLF.deckHalf(s), sy=HULLF.deckY(s)-0.28, cy=Math.min(HULLF.chineY(s),sy-0.05), ch=HULLF.chineHalf(s);
  return y<cy ? ch*(y-ky)/(cy-ky) : y<sy ? lerp(ch,dh,(y-cy)/(sy-cy)) : dh; };
function canvasTex(w,h,draw,srgb){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c); if(srgb) t.encoding=THREE.sRGBEncoding; t.anisotropy=8; return t; }
/* 形は models/ferry.glb にある。ここでは読み込んだモデルから、動かす部品や時刻で光らせるマテリアルを名前で拾う */
function buildFerry(){
  const ship=MODELS.take('ferry'); ship.rotation.order='YZX';
  const F=HULLF, ROOF=4.72, mastX=0.0, mastY=ROOF+0.05;
  const part=n=>MODELS.find(ship,n), mesh=n=>MODELS.mesh(ship,n);
  // navigation lights
  const lpS=navLight(0xff2a2a,2.2); lpS.position.set(3.2,ROOF+0.25,-2.15); ship.add(lpS);
  const lsS=navLight(0x2aff6a,2.2); lsS.position.set(3.2,ROOF+0.25,2.15); ship.add(lsS);
  const lm=navLight(0xffffff,2.6); lm.position.set(mastX,mastY+3.2,0); ship.add(lm);
  const lt=navLight(0xffffff,2.2); lt.position.set(-11.9,F.deckY(0)+1.2,0); ship.add(lt);
  // everything casts and receives shadows except glass; glass is drawn after the water so the sea shows through the cabin
  // the model's glass is dark from outside; from the helm and cabin views it is thinned so the sea is not blacked out (setCam in js/ui.js)
  const glassMats=new Map();
  ship.traverse(o=>{ if(!o.isMesh) return; const mats=[].concat(o.material).filter(m=>m.transparent); mats.forEach(m=>glassMats.set(m,m.opacity)); const clear=mats.length>0; o.castShadow=!clear; o.receiveShadow=true; if(clear) o.renderOrder=2; });
  const flagGeo=mesh('flag').geometry, ensGeo=mesh('ensign').geometry;
  // the ship's own folding gangways (one per side, hinged at the deck edge): stowed upright, lowered onto the pontoon when berthed
  const gangway=['gangway_hinge_stbd','gangway_hinge_port'].every(n=>MODELS.has(ship,n)) ? {1:part('gangway_hinge_stbd'),[-1]:part('gangway_hinge_port')} : null;
  let gangLen=0, door=new THREE.Vector3(-10.35,F.deckY(sOf(-10.35))+0.05,3.0);
  if(gangway){ ship.updateMatrixWorld(true); const g=gangway[1], bb=new THREE.Box3().setFromObject(g); gangLen=bb.max.y-g.position.y; door=g.position.clone(); }   // stowed it stands on end, so its height above the hinge is its reach
  ship.userData={glassMats,gangway,gangLen,radar:part('radar'),flagGeo,flagBase:flagGeo.attributes.position.array.slice(),ensGeo,ensBase:ensGeo.attributes.position.array.slice(),
    door, deckPt:new THREE.Vector3(-10.1,F.deckY(sOf(-10.1))+0.03,1.3), rdoor:new THREE.Vector3(-9.1,F.deckY(sOf(-9.1))+0.03,0), inside:new THREE.Vector3(-7.9,F.deckY(sOf(-7.9))+0.03,0.2),
    cleats:{bow:MODELS.has(ship,'cleat_s')?part('cleat_s').position.clone().add(new THREE.Vector3(0,0.1,0)):new THREE.Vector3(8.6,F.deckY(sOf(8.6))+0.3,1.5),stern:new THREE.Vector3(-11.2,F.deckY(0.05)+0.3,2.5)}};
  return ship;
}
const ferry = buildFerry(); scene.add(ferry);
const bowSheet=(()=>{
  const NU=28, NV=10, F=HULLF;
  const hwAt=x=>{ const s=sOf(x), cy=F.chineY(s), sy=F.deckY(s)-0.28; if(cy>=0) return 0.05; const t=(0-cy)/(sy-cy); return lerp(F.chineHalf(s),F.deckHalf(s),t); };
  const mat=new THREE.ShaderMaterial({ uniforms:Object.assign({uSp:{value:0}},U), transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false,
    vertexShader:`attribute vec2 aUV; varying vec2 vUV; varying vec3 vW; void main(){ vUV=aUV; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: COMMON + `uniform float uSp; varying vec2 vUV; varying vec3 vW;
      void main(){
        float u=vUV.x, v=vUV.y;
        vec2 q=vW.xz*0.35+vec2(-uTime*1.4,uTime*0.4);
        float lace=texture2D(tFoam,q).r*0.6+texture2D(tFoam,vW.xz*0.9+vec2(uTime*0.9,0.0)).r*0.4;
        float crest=exp(-pow((v-0.38)/0.22,2.0));
        float foamAmt=clamp(crest*1.1+(1.0-u)*0.35-v*0.2,0.0,1.0);
        float white=smoothstep(1.0-foamAmt,1.0-foamAmt+0.25,lace);
        float alpha=uSp*smoothstep(1.0,0.72,u)*smoothstep(0.0,0.06,u)*smoothstep(1.0,0.7,v)*smoothstep(0.0,0.05,v);
        vec3 light=uAmbient*0.9+uSunColor*max(uSunDir.y,0.0)*0.8;
        vec3 water=vec3(0.05,0.28,0.30)*light*0.6;
        vec3 col=mix(water,vec3(0.94,0.97,1.0)*light,max(white,crest*0.5));
        float a=alpha*mix(0.35,0.95,max(white,crest*0.6));
        gl_FragColor=vec4(col,a);
        ${TAIL}
      }` });
  const meshes=[];
  for(const sd of [1,-1]){
    const g=new THREE.BufferGeometry(); const pos=new Float32Array((NU+1)*(NV+1)*3), uv=new Float32Array((NU+1)*(NV+1)*2), idx=[];
    for(let i=0;i<=NU;i++) for(let j=0;j<=NV;j++){ const k=i*(NV+1)+j; uv[k*2]=i/NU; uv[k*2+1]=j/NV; }
    for(let i=0;i<NU;i++) for(let j=0;j<NV;j++){ const a=i*(NV+1)+j, b=a+NV+1; idx.push(a,b,a+1,a+1,b,b+1); }
    g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('aUV',new THREE.BufferAttribute(uv,2)); g.setIndex(idx);
    const m=new THREE.Mesh(g,mat); m.frustumCulled=false; m.renderOrder=4; m.userData={sd,pos}; ferry.add(m); meshes.push(m);
  }
  function update(spf,t){
    mat.uniforms.uSp.value=clamp(spf*1.4,0,1);
    const vis=spf>0.08; meshes.forEach(m=>m.visible=vis); if(!vis) return;
    const x0=8.2, x1=-3.5;
    for(const m of meshes){ const sd=m.userData.sd, pos=m.userData.pos;
      for(let i=0;i<=NU;i++){ const u=i/NU, xh=lerp(x0,x1,u), hw=hwAt(xh);
        const H=(0.35+1.05*spf)*Math.sin(Math.PI*Math.min(1,u*1.25+0.08))*(1-0.35*u);
        const W=(0.9+3.4*u)*(0.5+0.8*spf);
        for(let j=0;j<=NV;j++){ const v=j/NV, k=(i*(NV+1)+j)*3;
          const wob=Math.sin(t*9+u*14+j)*0.04*spf;
          pos[k]=xh - v*(1.2+2.2*spf);
          pos[k+1]=H*Math.sin(Math.PI*Math.pow(v,0.8))*(1-0.25*v)-0.05+wob;
          pos[k+2]=sd*(hw+0.06+v*W+Math.sin(Math.PI*v)*0.25*spf); } }
      m.geometry.attributes.position.needsUpdate=true; }
  }
  return {update,hwAt};
})();
/* ============================================================
   Helm station (at the front of the cabin), right-hand mirror view,
   and the passenger saloon interior (red velvet benches, beige walls)
   ============================================================ */
const IN = {};
let cabinSafe=true;
(function buildInteriors(){
  const ROOF=4.72, part=n=>MODELS.find(ferry,n), mesh=n=>MODELS.mesh(ferry,n);
  // ---------------- helm (at the front of the cabin) ----------------
  // screens: the model has blank panels; the instruments are drawn onto them live
  const mkScreen=(name,cw,ch)=>{ const c=document.createElement('canvas'); c.width=cw; c.height=ch; const tx=new THREE.CanvasTexture(c); tx.encoding=THREE.sRGBEncoding;
    const m=mesh(name); m.material=new THREE.MeshBasicMaterial({map:tx,toneMapped:false}); return {c,g:c.getContext('2d'),tx,m}; };
  IN.radar=mkScreen('screen_radar',256,196); IN.chart=mkScreen('screen_chart',256,196); IN.gauge=mkScreen('screen_gauge',320,140);
  // The controls in the model are not all modelled around their own origins. Turn each about where it really is:
  // the wheel about its centre, the levers and the joystick about their feet.
  const pivot=(name,atFoot)=>{ const n=part(name); ferry.updateMatrixWorld(true);
    const bb=new THREE.Box3().setFromObject(n), c=bb.getCenter(new THREE.Vector3()); if(atFoot) c.y=bb.min.y; n.worldToLocal(c);
    const p=new THREE.Group(), kids=n.children.slice(); p.position.copy(c); n.add(p); kids.forEach(k=>{ p.add(k); k.position.sub(c); }); return p; };
  IN.wheel=pivot('helm_wheel'); IN.levers=[pivot('helm_lever_1',true),pivot('helm_lever_2',true)]; IN.joy=pivot('helm_joystick',true);
  // right mirror (outside, starboard) — shows a live mirror image
  IN.mirrorRT=new THREE.WebGLRenderTarget(512,340); IN.mirrorRT.texture.repeat.x=-1; IN.mirrorRT.texture.offset.x=1; IN.mirrorRT.texture.encoding=THREE.LinearEncoding;
  // the model may carry a `mirror` with a `mirror_glass`; without one the view is taken from where a mirror would hang
  IN.mirrorMat=new THREE.MeshBasicMaterial({color:0x223038,toneMapped:false});
  if(MODELS.has(ferry,'mirror')){ IN.mirrorGroup=part('mirror'); if(MODELS.has(ferry,'mirror_glass')) mesh('mirror_glass').material=IN.mirrorMat; }
  else { IN.mirrorGroup=new THREE.Group(); IN.mirrorGroup.position.set(2.7,ROOF+0.7,3.2); IN.mirrorGroup.rotation.y=-0.35; ferry.add(IN.mirrorGroup); }
  IN.mirrorCam=new THREE.PerspectiveCamera(36,512/340,0.5,6000);
  // ---------------- passenger saloon ----------------
  // cabin lighting: full in the cabin view, a glow through the windows at night (never switched off: adding or removing a light would make every shader recompile)
  IN.night=0; IN.cabLight=new THREE.PointLight(0xfff0d8,0,9,1.5); IN.cabLight.position.set(-2.5,ROOF-0.4,0); ferry.add(IN.cabLight);
})();
/* live instrument screens */
let instT=0, radarA=0;
function drawInstruments(dt){
  instT-=dt; radarA+=dt*2.4; if(instT>0) return; instT=0.12;
  // radar: coastlines, ships, piers, sweep
  const R=IN.radar, g=R.g, w=R.c.width, h=R.c.height, cx=w/2, cy=h/2, sc=(h/2-8)/1500;
  g.fillStyle='#021008'; g.fillRect(0,0,w,h);
  g.strokeStyle='rgba(80,255,140,0.25)'; g.lineWidth=1; for(const r of [0.33,0.66,1]){ g.beginPath(); g.arc(cx,cy,(h/2-8)*r,0,6.283); g.stroke(); }
  g.fillStyle='rgba(90,255,150,0.75)';
  const c=Math.cos(S.psi), s=Math.sin(S.psi);
  const toScr=(x,z)=>{ const dx=x-S.x, dz=z-S.z; const f=dx*c-dz*s, l=dx*s+dz*c; return [cx+l*sc, cy-f*sc]; };
  for(let x=S.x-1600;x<S.x+1600;x+=40){ for(const zf of [northZ,southZ]){ const [px,py]=toScr(x,zf(x)); if(Math.hypot(px-cx,py-cy)<h/2-8) g.fillRect(px-1.5,py-1.5,3,3); } }
  cargos.forEach(k=>{ const [px,py]=toScr(k.x,k.z); if(Math.hypot(px-cx,py-cy)<h/2-8){ g.fillRect(px-3,py-3,6,6); } });
  for(const k in PIERS){ const [px,py]=toScr(PIERS[k].x,PIERS[k].pz); if(Math.hypot(px-cx,py-cy)<h/2-8) g.fillRect(px-3,py-1.5,6,3); }
  g.strokeStyle='rgba(120,255,170,0.8)'; g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx+Math.sin(radarA)*(h/2-8),cy-Math.cos(radarA)*(h/2-8)); g.stroke();
  g.strokeStyle='rgba(120,255,170,0.5)'; g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx,8); g.stroke();
  g.fillStyle='#8dffb5'; g.font='12px monospace'; g.fillText('RANGE 1.5km',6,14); g.fillText('HDG '+String(Math.round(((Math.atan2(c,s)*180/Math.PI)+360)%360)).padStart(3,'0'),6,h-6);
  R.tx.needsUpdate=true;
  // chart plotter
  const C=IN.chart, cg=C.g; cg.fillStyle='#bfe3f2'; cg.fillRect(0,0,w,h);
  const ms=w/4200, mx=x=>(x+1500)*ms, mz=z=>(z+1575)*ms*0.95+ (h-3150*ms*0.95)/2;
  cg.fillStyle='#efe3bf'; cg.beginPath(); cg.moveTo(0,0); for(let x=-1500;x<=2700;x+=60) cg.lineTo(mx(x),mz(northZ(x))); cg.lineTo(w,0); cg.fill();
  cg.beginPath(); cg.moveTo(0,h); for(let x=-1500;x<=2700;x+=60) cg.lineTo(mx(x),mz(southZ(x))); cg.lineTo(w,h); cg.fill();
  const P=PIERS[game.to]; cg.strokeStyle='#d0306a'; cg.setLineDash([4,3]); cg.beginPath(); cg.moveTo(mx(S.x),mz(S.z)); cg.lineTo(mx(P.bx),mz(P.bz)); cg.stroke(); cg.setLineDash([]);
  cg.save(); cg.translate(mx(S.x),mz(S.z)); cg.rotate(-S.psi); cg.fillStyle='#d0306a'; cg.beginPath(); cg.moveTo(8,0); cg.lineTo(-5,4); cg.lineTo(-5,-4); cg.fill(); cg.restore();
  cg.fillStyle='#123'; cg.font='bold 12px sans-serif'; cg.fillText((Math.abs(S.u)*1.944).toFixed(1)+' kn   '+Math.round(Math.hypot(S.x-P.bx,S.z-P.bz))+' m',6,h-6);
  C.tx.needsUpdate=true;
  // engine gauges
  const Gg=IN.gauge, gg=Gg.g, gw=Gg.c.width, gh=Gg.c.height; gg.fillStyle='#0d1114'; gg.fillRect(0,0,gw,gh);
  const rpm=650+Math.abs(S.throttle)*1450;
  const dial=(x,val,max,label)=>{ const r=50, y=gh/2+8; gg.strokeStyle='#5d6a74'; gg.lineWidth=3; gg.beginPath(); gg.arc(x,y,r,Math.PI*0.75,Math.PI*2.25); gg.stroke();
    gg.strokeStyle='#e24a2b'; gg.beginPath(); gg.arc(x,y,r,Math.PI*2.0,Math.PI*2.25); gg.stroke();
    const a=Math.PI*0.75+clamp(val/max,0,1)*Math.PI*1.5; gg.strokeStyle='#ffd24a'; gg.lineWidth=3; gg.beginPath(); gg.moveTo(x,y); gg.lineTo(x+Math.cos(a)*(r-6),y+Math.sin(a)*(r-6)); gg.stroke();
    gg.fillStyle='#cfd8de'; gg.font='bold 13px sans-serif'; gg.textAlign='center'; gg.fillText(label,x,y+r-12); gg.font='bold 15px monospace'; gg.fillText(String(Math.round(val)),x,y+22); };
  dial(80,rpm,2400,'RPM'); dial(240,rpm,2400,'RPM');
  gg.fillStyle='#cfd8de'; gg.font='bold 12px sans-serif'; gg.textAlign='center'; gg.fillText('PORT',80,16); gg.fillText('STBD',240,16);
  gg.fillStyle='#3a4650'; gg.fillRect(120,gh-18,80,8); gg.fillStyle='#4ad0ff'; gg.fillRect(160+S.rudder*38-3,gh-20,6,12); gg.textAlign='left';
  Gg.tx.needsUpdate=true;
}
function updateHelmParts(){
  IN.wheel.rotation.x=-S.rudder*2.4;
  IN.levers.forEach(l=>l.rotation.z=-S.throttle*0.6);
  IN.joy.rotation.x=S.thr*0.35; IN.joy.rotation.z=-S.rudder*0.15;
}
function setMirrorCam(){
  IN.mirrorGroup.updateMatrixWorld();
  const p=new THREE.Vector3(-0.2,0,0.25).applyMatrix4(IN.mirrorGroup.matrixWorld);
  const back=new THREE.Vector3(-1,-0.13,0.05).transformDirection(ferry.matrixWorld);
  IN.mirrorCam.position.copy(p); IN.mirrorCam.up.set(0,1,0); IN.mirrorCam.lookAt(p.clone().add(back));
}


