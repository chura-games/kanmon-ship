/* 関門汽船 運転シミュレーター — 航路：渦潮（引き込み・浸水・沈没）、通過ゲート、観察ポイント。どれもないステージでは何もしない */
'use strict';

/* ============================================================
   Route state: the gates to pass in order, the sights to watch, and how flooded the ship is (1 = sinks)
   ============================================================ */
const ROUTE = { order:[], next:0, flood:0, sinkT:0, shown:false, warnT:0, marker:null, hud:'', sightMark:null,
  /* sights: stay within r of one, slower than about 4 kn, for `need` seconds to tick it off */
  sights:STAGE.sights.map(s=>({ kind:s.kind, name:s.name, x:s.x, z:s.side==='n'?northZ(s.x)+s.off:s.side==='s'?southZ(s.x)-s.off:s.z, side:s.side||'', need:s.need||6, r:s.r||90, min:s.min||0, t:0, done:false })) };
const GATE_R = 36;   // a gate counts once the ship is within this distance of its centre
(function buildGates(){
  const pts=STAGE.gates; if(!pts.length) return;
  const buoy=(x,z,red)=>{ const g=new THREE.Group(), mat=red?M.red:M.green;
    const body=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.4,2.2,14),mat); body.position.y=0.6; g.add(body);
    const top=new THREE.Mesh(red?new THREE.CylinderGeometry(.6,.6,1.6,10):new THREE.ConeGeometry(.9,1.8,10),mat); top.position.y=2.6; g.add(top);
    const l=navLight(red?0xff3b30:0x3bff7a,4); l.position.y=4; g.add(l);
    g.position.set(x,0,z); scene.add(g); buoys.push({g,x,z,ph:rnd()*6}); };
  // a red and a green buoy either side of each gate, square to the course through it
  pts.forEach(([x,z],i)=>{ const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)], dx=b[0]-a[0], dz=b[1]-a[1], l=Math.hypot(dx,dz)||1;
    buoy(x-dz/l*GATE_R,z+dx/l*GATE_R,true); buoy(x+dz/l*GATE_R,z-dx/l*GATE_R,false); });
  ROUTE.marker=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,44,18,1,true),new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:.22,depthWrite:false,fog:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  ROUTE.marker.visible=false; scene.add(ROUTE.marker);
})();
{ const dl=$('#route dl'), row=(label,id)=>{ const dt=document.createElement('dt'); dt.textContent=label; const dd=document.createElement('dd'); dd.className='num'; dd.id=id; dl.append(dt,dd); };
  if(STAGE.gates.length) row('ゲート','gateN'); if(WHIRLS.length) row('浸水','floodN'); if(ROUTE.sights.length) row('観察','sightN');
  if(ROUTE.sights.length){ ROUTE.sightMark=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,36,16,1,true),new THREE.MeshBasicMaterial({color:0x40ffb0,transparent:true,opacity:.22,depthWrite:false,fog:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    ROUTE.sightMark.visible=false; scene.add(ROUTE.sightMark); } }
function resetRoute(){
  const pts=STAGE.gates.map(([x,z])=>({x,z}));
  ROUTE.order = game.from===STAGE.piers[0].key ? pts : pts.reverse();
  ROUTE.next=0; ROUTE.flood=0; ROUTE.sinkT=0; ROUTE.shown=false; ROUTE.sights.forEach(s=>{ s.t=0; s.done=false; });
}
resetRoute();
/* berthing only counts once every gate has been passed and every sight watched */
function routeBlocksDocking(dist){
  const left=ROUTE.sights.filter(s=>!s.done).length;
  if(ROUTE.next>=ROUTE.order.length && left){ if(dist<70 && game.msgT<=0){ game.msgT=5; toast('まだ観察していない場所があります（残り '+left+' か所）','warn'); } return true; }
  if(ROUTE.next>=ROUTE.order.length) return false;
  if(dist<70 && game.msgT<=0){ game.msgT=5; toast('まだ通っていないゲートがあります（'+ROUTE.next+' / '+ROUTE.order.length+'）','warn'); }
  return true;
}

/* ============================================================
   Whirlpools. Water circles each one fastest at its rim (radius R) and spirals inward, so a ship is carried
   round, turned and drawn toward the centre. Inside the rim the ship ships water: slowly near the rim, fast in the throat.
   ============================================================ */
function whirlPull(dt){
  if(!WHIRLS.length) return;
  let take=0, deepest=0;
  for(const w of WHIRLS){ const dx=S.x-w.x, dz=S.z-w.z, d=Math.hypot(dx,dz)||1e-3, u=d/w.R; if(u>4) continue;
    const v=w.s*w.v*(2*u/(1+u*u))*smooth(4,1.6,u);
    S.x+=(-dz/d*w.spin-dx/d*0.38)*v*dt; S.z+=(dx/d*w.spin-dz/d*0.38)*v*dt;
    S.psi-=w.spin*v/Math.max(d,w.R*0.5)*0.6*dt;
    if(u<1){ take+=w.s*(0.035+0.2*(1-u)); deepest=Math.max(deepest,w.s*(1-u)); } }
  if(game.state!=='sailing') return;
  if(take>0){ ROUTE.flood+=take*dt; game.shake=Math.max(game.shake,0.1+0.25*deepest);
    ROUTE.warnT-=dt; if(ROUTE.warnT<=0){ ROUTE.warnT=4; toast('渦に巻き込まれています！舵を外へ切って全速で抜けてください','warn'); } }
  else { ROUTE.flood=Math.max(0,ROUTE.flood-0.025*dt); ROUTE.warnT=0; }   // the bilge pump slowly gains once clear
  if(ROUTE.flood>=1){ game.state='sunk'; S.throttle=0; ROUTE.sinkT=0; sfx.thud(4); toast('浸水が限界に達しました。沈没します…','warn'); }
}
function updateRoute(dt,t){
  if(!WHIRLS.length && !ROUTE.order.length && !ROUTE.sights.length) return;
  // whirlpools swell and fade on their own cycles
  WHIRLS.forEach((w,i)=>{ w.s=0.55+0.45*Math.sin(t*6.2832/w.T+w.ph); U.uWhirl.value[i].w=w.s*w.spin;
    if(Math.hypot(w.x-camera.position.x,w.z-camera.position.z)<520){
      let n=w.s*70*dt; n=Math.floor(n)+(rnd()<n%1?1:0);
      for(let k=0;k<n;k++){ const a=rnd()*6.283, r=w.R*(0.1+rnd()*1.5); fleck(w.x+Math.cos(a)*r,w.z+Math.sin(a)*r,3+rnd()*4,0.16+rnd()*0.26); }
      let m=w.s*w.s*170*dt; m=Math.floor(m)+(rnd()<m%1?1:0);   // spray whipped up around the throat, flung along with the water
      for(let k=0;k<m;k++){ const a=rnd()*6.283, r=w.R*(0.06+rnd()*0.5), px=w.x+Math.cos(a)*r, pz=w.z+Math.sin(a)*r, sp=w.v*w.s*(0.4+rnd()*0.4)*w.spin;
        emit(px,waveH(px,pz,t)+0.1,pz,-Math.sin(a)*sp,1.2+rnd()*3.0*w.s,Math.cos(a)*sp,0.6+rnd()*0.9,dropSize(0.9)); } } });
  // gates
  const g=ROUTE.order[ROUTE.next];
  if(g && game.state==='sailing' && Math.hypot(S.x-g.x,S.z-g.z)<GATE_R){ ROUTE.next++;
    toast(ROUTE.next<ROUTE.order.length?'ゲート '+ROUTE.next+' / '+ROUTE.order.length+' 通過':'全ゲート通過。'+PIERS[game.to].name+'桟橋へ向かってください','ok'); }
  if(ROUTE.marker){ const n=ROUTE.order[ROUTE.next]; ROUTE.marker.visible=!!n && game.state==='sailing';
    if(n){ ROUTE.marker.position.set(n.x,waveH(n.x,n.z,t)+22,n.z); ROUTE.marker.material.opacity=0.2+0.1*Math.sin(t*3); } }
  // sinking: she settles and rolls over, then the stage ends
  if(game.state==='sunk'){ ROUTE.sinkT+=dt; ROUTE.flood=Math.min(3.4,ROUTE.flood+dt*0.45);
    if(ROUTE.sinkT>5.5 && !ROUTE.shown){ ROUTE.shown=true;
      $('#sunkRoute').textContent=PIERS[game.from].name+' ➜ '+PIERS[game.to].name;
      $('#sunkText').textContent='通過したゲート '+ROUTE.next+' / '+ROUTE.order.length+'　経過時間 '+fmtTime(game.elapsed);
      $('#sunk').hidden=false; $('#retry').focus(); } }
  // sights: watching needs the ship close, slow, and not crowding the animal
  let watching=null, near=null, nd=1e9; const slow=Math.hypot(S.u,S.v)<2.2;
  for(const s of ROUTE.sights){ if(s.done) continue; const d=Math.hypot(S.x-s.x,S.z-s.z); if(d<nd){ nd=d; near=s; }
    if(d>s.r || game.state!=='sailing') continue;
    if(d<s.min){ s.t=Math.max(0,s.t-dt); ROUTE.warnT-=dt; if(ROUTE.warnT<=0){ ROUTE.warnT=4; toast('近づきすぎです。少し離れて見守ってください','warn'); } watching=s; }
    else if(slow){ s.t+=dt; watching=s; if(s.t>=s.need){ s.done=true; const n=ROUTE.sights.filter(q=>q.done).length; toast(s.name+'を観察しました（'+n+' / '+ROUTE.sights.length+'）','ok'); } }
    else { ROUTE.warnT-=dt; if(ROUTE.warnT<=0){ ROUTE.warnT=5; toast(s.name+'が近くにいます。速度を落として観察してください'); } } }
  if(ROUTE.sightMark){ ROUTE.sightMark.visible=!!near && game.state==='sailing';
    if(near){ ROUTE.sightMark.position.set(near.x,waveH(near.x,near.z,t)+18,near.z); ROUTE.sightMark.material.opacity=0.2+0.1*Math.sin(t*3); } }
  const seen=ROUTE.sights.filter(s=>s.done).length, prog=watching&&!watching.done?Math.round(watching.t/watching.need*100):-1;
  const hud=ROUTE.next+'/'+ROUTE.order.length+'|'+Math.round(Math.min(1,ROUTE.flood)*100)+'|'+seen+'|'+prog;
  if(hud!==ROUTE.hud){ ROUTE.hud=hud;
    if($('#gateN')) $('#gateN').textContent=ROUTE.next+' / '+ROUTE.order.length;
    if($('#floodN')){ const f=$('#floodN'), pc=Math.round(Math.min(1,ROUTE.flood)*100); f.textContent=pc+' %'; f.className='num '+(pc<40?'ok':'ng'); }
    if($('#sightN')) $('#sightN').textContent=seen+' / '+ROUTE.sights.length+(prog>=0?'（観察中 '+prog+'%）':''); }
}
/* minimap: the course through the gates and the whirlpools */
function drawRouteMap(mg,X,Z){
  if(ROUTE.order.length){ mg.strokeStyle='rgba(255,210,74,.9)'; mg.lineWidth=2; mg.setLineDash([6,5]); mg.beginPath();
    const a=PIERS[game.from], b=PIERS[game.to]; mg.moveTo(X(a.bx),Z(a.bz)); ROUTE.order.forEach(p=>mg.lineTo(X(p.x),Z(p.z))); mg.lineTo(X(b.bx),Z(b.bz)); mg.stroke(); mg.setLineDash([]);
    ROUTE.order.forEach((p,i)=>{ mg.fillStyle=i<ROUTE.next?'#40ffb0':i===ROUTE.next?'#ffd24a':'rgba(255,255,255,.75)'; mg.beginPath(); mg.arc(X(p.x),Z(p.z),i===ROUTE.next?6:4,0,6.283); mg.fill(); }); }
  if(typeof NATURE!=='undefined'){ mg.fillStyle='rgba(255,255,255,.9)'; for(const f of NATURE.floes) mg.fillRect(X(f.x)-1.5,Z(f.z)-1.5,3,3); }
  for(const s of ROUTE.sights){ mg.fillStyle=s.done?'#40ffb0':'#ff9ad5'; mg.strokeStyle='#fff'; mg.lineWidth=1.5; mg.beginPath(); const x=X(s.x), z=Z(s.z); mg.moveTo(x,z-7); mg.lineTo(x+6,z); mg.lineTo(x,z+7); mg.lineTo(x-6,z); mg.closePath(); mg.fill(); mg.stroke(); }
  for(const w of WHIRLS){ mg.strokeStyle='rgba(255,255,255,'+(0.35+0.6*w.s).toFixed(2)+')'; mg.lineWidth=2;
    for(const k of [1,0.55]){ mg.beginPath(); mg.arc(X(w.x),Z(w.z),Math.max(3,(X(w.R)-X(0))*k),0,6.283); mg.stroke(); } }
}
$('#retry').onclick=()=>{ $('#sunk').hidden=true; setMoored(game.from); startLeg(); canvas.focus(); };

/* ============================================================
   Stage texts and the way back to the course menu (a course is built at page load, so changing it reloads the page)
   ============================================================ */
document.title=STAGE.title; $('#intro h1').innerHTML=STAGE.heading; $('#introText').textContent=STAGE.intro;
$('#rFrom').textContent=PIERS[game.from].name; $('#rTo').textContent=PIERS[game.to].name;
$('#stageBtn').onclick=()=>{ location.href=location.pathname; };
