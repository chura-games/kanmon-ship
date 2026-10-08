/* 関門汽船 運転シミュレーター — 自動運転：ゲート・観察ポイントを順に回り、対岸の桟橋に着けるまで操船する（P キーで切り替え） */
'use strict';
const AUTO = { on:false, final:false, wait:0, obst:null };
const wrapPi = a => Math.atan2(Math.sin(a),Math.cos(a));
function setAuto(on){
  AUTO.on=on; AUTO.final=false; AUTO.wait=0; $('#vAuto').textContent=on?'オン':'オフ';
  if(!on) S.thr=0;
  toast(on?'自動運転を始めます（操船すると解除されます）':'自動運転を解除しました', on?'ok':undefined);
}
/* Called every frame before the ship is stepped. Returns true when it has set the controls (throttle, rudder, thrusters). */
function autoTick(dt){
  if(!AUTO.on) return false;
  // the crew also work the gangway
  if(dock.phase==='plankWait'||dock.phase==='stowWait'){ AUTO.wait+=dt; if(AUTO.wait>1.2){ AUTO.wait=0; dock.go=true; } }
  if(game.state!=='sailing'){ AUTO.final=false; return false; }
  const P=PIERS[game.to], O=PIERS[game.from], cur=currentAt(S.x), sp=Math.hypot(S.u,S.v), fwd=Math.cos(S.psi)>=0?1:-1;
  let thr=0, rud=0, side=0;
  /* steer for a point: follow the straight line to it but stay in the channel, go round whirlpools and drift ice,
     allow for the tide, give way to ships crossing ahead, and (stop) come to rest within `arrive` metres of it */
  const steer=(tx,tz,stop,arrive,vmax)=>{
    let dx=tx-S.x, dz=tz-S.z; const dist=Math.hypot(dx,dz)||1e-3;
    let ax=tx, az=tz;
    if(dist>110){ ax=S.x+dx/dist*100; az=S.z+dz/dist*100; const n=northZ(ax), so=southZ(ax), m=Math.min(45,(so-n)*0.3); az=clamp(az,n+m,so-m); }
    if(!AUTO.obst) AUTO.obst=WHIRLS.map(w=>({x:w.x,z:w.z,r:w.R*1.25})).concat(NATURE.floes.map(f=>({x:f.x,z:f.z,r:f.r+12})));
    for(const o of AUTO.obst){ if(Math.abs(o.x-S.x)>o.r+110 || Math.abs(o.z-S.z)>o.r+110) continue;
      const sx=ax-S.x, sz=az-S.z, l2=sx*sx+sz*sz||1, t=clamp(((o.x-S.x)*sx+(o.z-S.z)*sz)/l2,0,1);
      let px=S.x+sx*t-o.x, pz=S.z+sz*t-o.z, d=Math.hypot(px,pz); if(d>=o.r) continue;
      if(d<0.5){ px=-sz; pz=sx; d=Math.hypot(px,pz)||1; }
      const k=(o.r-d)/Math.max(t,0.25)/d; ax+=px*k; az+=pz*k; }
    dx=ax-S.x; dz=az-S.z; const d2=Math.hypot(dx,dz)||1e-3;
    let v=vmax; if(stop) v=Math.min(v,0.7*Math.sqrt(1.6*Math.max(0,dist-arrive)));
    for(const c of cargos){ const dl=c.z-S.z; if(Math.abs(dl)>170 || Math.abs(dl)<c.beam/2+12 || dl*dz<=0) continue;   // a ship whose lane lies ahead
      const tc=Math.abs(dl)/Math.max(Math.abs(Math.sin(S.psi)*S.u),3), cx=c.x+c.dir*c.spd*tc; if(Math.abs(cx-S.x)<c.len/2+70) v=0; }
    const vw=Math.max(v,2.5), e=wrapPi(Math.atan2(-dz/d2*vw,dx/d2*vw-cur)-S.psi);
    v*=1-0.6*Math.min(1,Math.abs(e)/1.2);
    if(stop && dist<arrive) v=0;
    rud=(v===0 && sp<0.6) ? 0 : clamp(-(clamp(e*0.7,-0.3,0.3)-S.r)*7,-1,1);
    thr=clamp((v/VMAX)*(v/VMAX)+(v-S.u)*0.4,-0.5,1);
  };
  const offO=(S.z-O.bz)*O.dir;
  if(!game.departed && offO<16 && Math.abs(S.x-O.bx)<25){ side=fwd*O.dir; }   // leaving: slide clear of the pontoon before turning
  else {
    // what is still to be done, in the order it comes along the route
    const sgn=Math.sign(P.bx-O.bx)||1, list=[];
    ROUTE.order.forEach((g,i)=>{ if(i>=ROUTE.next) list.push({x:g.x,z:g.z}); });
    ROUTE.sights.forEach(s=>{ if(!s.done) list.push({x:s.x,z:s.z,sight:s}); });
    list.sort((a,b)=>(a.x-b.x)*sgn);
    const vmax=STAGE.wild?8:10, tg=list[0];
    if(tg && tg.sight){ const s=tg.sight; let tx=s.x, tz=s.z, arrive=Math.min(25,s.r*0.3);
      if(s.min){ const d=Math.hypot(S.x-s.x,S.z-s.z)||1, k=(s.min+25)/d; tx=s.x+(S.x-s.x)*k; tz=s.z+(S.z-s.z)*k; arrive=10; }   // keep a respectful distance
      steer(tx,tz,true,arrive,vmax); }
    else if(tg) steer(tg.x,tg.z,false,0,vmax);
    else if(!AUTO.final){ const zx=P.bx, zz=P.bz+P.dir*24;   // stop abreast of the berth, a little way off
      steer(zx,zz,true,6,vmax); if(Math.hypot(S.x-zx,S.z-zz)<10 && sp<1.2) AUTO.final=true; }
    else { // berthing: square up to the pier, hold position along it against the tide, and slide in on the thrusters
      const e=wrapPi((fwd>0?0:Math.PI)-S.psi), along=S.x-P.bx, off=(S.z-P.bz)*P.dir;
      rud=clamp(-(clamp(e*0.8,-0.25,0.25)-S.r)*8,-1,1);
      thr=clamp((fwd*(clamp(-along*0.15,-1,1)-cur)-S.u)*0.6,-0.3,0.3);
      if(Math.abs(e)<0.15) side=clamp(-fwd*P.dir*clamp(off*0.2,0.12,0.55)/1.05,-1,1);
      if(off<0.9 && Math.abs(along)<6) thr=clamp(-S.u,-0.3,0.3);   // alongside: take the way off her so the lines can go ashore
    }
  }
  S.throttle=thr; S.rudder+=(rud-S.rudder)*Math.min(1,dt*5); S.thr=side;
  return true;
}
