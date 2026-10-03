/* 関門汽船 運転シミュレーター — 船：関門汽船の船体モデル、操舵席・右ミラー・客室の内装、船首波 */
'use strict';

/* ============================================================
   The ferry (white hull, red bottom, dark window band)
   ============================================================ */
/* ============================================================
   The ferry — modelled on the photo: raked white hull with red bottom,
   black rubbing strake, flush full-width cabin with a continuous dark
   window band, raked windshield, small wheelhouse + radar mast on the roof,
   life-raft canisters, open aft deck with the boarding gate.
   Local frame: +x bow, +y up, +z starboard.
   ============================================================ */
const HULLF = {
  deckHalf: s => Math.max(0.02, s<0.58 ? SHIP_B/2*(s<0.03?0.93+s*2.3:1) : SHIP_B/2*Math.sqrt(Math.max(0,1-Math.pow((s-0.58)/0.42,2)))),
  deckY: s => 2.05 + 0.85*Math.pow(smooth(0.45,1,s),1.4),
  chineHalf: s => s<0.5 ? SHIP_B/2*0.9 : SHIP_B/2*0.9*Math.sqrt(Math.max(0,1-Math.pow((s-0.5)/0.38,2))),
  chineY: s => -0.45 + 0.9*Math.pow(smooth(0.5,0.88,s),1.3),
  keelY: s => s<0.55 ? -0.95 : s<0.88 ? -0.95+1.4*Math.pow((s-0.55)/0.33,2) : lerp(0.45, 2.85, (s-0.88)/0.12),
};
const sOf = x => (x+SHIP_L/2)/SHIP_L;
function canvasTex(w,h,draw,srgb){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c); if(srgb) t.encoding=THREE.sRGBEncoding; t.anisotropy=8; return t; }
function buildFerry(){
  const ship=new THREE.Group(); ship.rotation.order='YZX';
  const L=SHIP_L, F=HULLF, N=60;
  const paint=new THREE.MeshPhysicalMaterial({color:lc('#f5f7f8'),roughness:.28,metalness:0,clearcoat:.6,clearcoatRoughness:.15});
  /* ---------- hull ---------- */
  const hullTex=canvasTex(1024,512,(g,w,h)=>{ const Y=y=>h-(y+1.0)/4.0*h, r=mulberry(99);
    g.fillStyle='#f4f6f7'; g.fillRect(0,0,w,h);
    for(let i=0;i<9000;i++){ g.fillStyle=`rgba(${r()<.5?255:150},${r()<.5?255:155},${r()<.5?255:160},${0.03+r()*0.05})`; g.fillRect(r()*w,Y(0.3)+r()*(Y(3)-Y(0.3))*-1,1,1); }
    for(let i=0;i<=10;i++){ const x=i/10*w; g.fillStyle='rgba(140,150,155,0.10)'; g.fillRect(x,Y(3.0),1.5,Y(0.3)-Y(3.0)); }
    let gr=g.createLinearGradient(0,Y(1.0),0,Y(0.24)); gr.addColorStop(0,'rgba(110,125,120,0)'); gr.addColorStop(1,'rgba(110,125,120,0.32)');
    g.fillStyle=gr; g.fillRect(0,Y(1.0),w,Y(0.24)-Y(1.0));
    for(let i=0;i<90;i++){ const x=r()*w, y0=Y(1.2+r()*1.4), len=30+r()*120; const sg=g.createLinearGradient(0,y0,0,y0+len); const c=r()<0.2?'150,95,60':'95,105,105';
      sg.addColorStop(0,`rgba(${c},${0.10+r()*0.1})`); sg.addColorStop(1,`rgba(${c},0)`); g.fillStyle=sg; g.fillRect(x,y0,1+r()*2.5,len); }
    gr=g.createLinearGradient(0,Y(0.10),0,h); gr.addColorStop(0,'#9c2019'); gr.addColorStop(0.25,'#a8261e'); gr.addColorStop(1,'#7e1d17');
    g.fillStyle=gr; g.fillRect(0,Y(0.10),w,h);
    gr=g.createLinearGradient(0,Y(0.10),0,Y(-0.35)); gr.addColorStop(0,'rgba(55,70,40,0.55)'); gr.addColorStop(1,'rgba(55,70,40,0)'); g.fillStyle=gr; g.fillRect(0,Y(0.10),w,Y(-0.35)-Y(0.10));
    g.fillStyle='#15191c'; g.fillRect(0,Y(0.26),w,Y(0.10)-Y(0.26));
    for(let i=0;i<4;i++){ const x=w*(0.78+i*0.012); g.fillStyle='#f4f6f7'; g.fillRect(x,Y(0.0),6,2); g.fillRect(x,Y(-0.2),6,2); }
  },true);
  const sec=[];
  for(let i=0;i<=N;i++){ const s=i/N, x=-L/2+s*L, dh=F.deckHalf(s), dy=F.deckY(s), ch=F.chineHalf(s), cy=F.chineY(s), ky=F.keelY(s);
    const sy=dy-0.28;
    sec.push([[x,dy,dh],[x,sy,dh],[x,Math.min(cy,sy-0.05),ch],[x,ky,0],[x,Math.min(cy,sy-0.05),-ch],[x,sy,-dh],[x,dy,-dh]]); }
  const pos=[], uv=[], idx=[]; let v=0;
  for(let j=0;j<6;j++){ const st=v;
    for(let i=0;i<=N;i++) for(const k of [j,j+1]){ const p=sec[i][k]; pos.push(p[0],p[1],p[2]); uv.push(i/N,(p[1]+1.0)/4.0); v++; }
    for(let i=0;i<N;i++){ const a=st+i*2; idx.push(a,a+1,a+2,a+1,a+3,a+2); } }
  const hg=new THREE.BufferGeometry(); hg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); hg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); hg.setIndex(idx); hg.computeVertexNormals();
  ship.add(new THREE.Mesh(hg,new THREE.MeshPhysicalMaterial({map:hullTex,roughness:.3,clearcoat:.5,clearcoatRoughness:.2,side:THREE.DoubleSide})));
  // deck + transom
  const dp=[], di=[]; for(let i=0;i<=N;i++){ const a=sec[i][0], b=sec[i][6]; dp.push(a[0],a[1]-0.02,a[2], b[0],b[1]-0.02,b[2]); if(i<N){ const k=i*2; di.push(k,k+2,k+1,k+1,k+2,k+3);} }
  const dg=new THREE.BufferGeometry(); dg.setAttribute('position',new THREE.Float32BufferAttribute(dp,3)); dg.setIndex(di); dg.computeVertexNormals();
  const deckMat=new THREE.MeshStandardMaterial({color:lc('#5d6f6a'),roughness:.85,side:THREE.DoubleSide});
  ship.add(new THREE.Mesh(dg,deckMat));
  const tp=[], ti=[], st=sec[0]; tp.push(st[0][0],(st[0][1]+st[3][1])/2,0); st.forEach(p=>tp.push(p[0],p[1],p[2])); for(let i=1;i<=7;i++) ti.push(0,i,i===7?1:i+1);
  const tg=new THREE.BufferGeometry(); tg.setAttribute('position',new THREE.Float32BufferAttribute(tp,3)); tg.setIndex(ti); tg.computeVertexNormals();
  ship.add(new THREE.Mesh(tg,new THREE.MeshStandardMaterial({color:lc('#eef1f2'),roughness:.4,side:THREE.DoubleSide})));
  // thin dark sheer line on the topsides (follows the sheer like in the photo)
  const lp=[], li=[]; let lv=0;
  for(const sd of [1,-1]){ const s0=lv;
    for(let i=1;i<=Math.floor(N*0.97);i++){ const s=i/N, x=-L/2+s*L, dy=F.deckY(s);
      for(const yy of [dy-0.62,dy-0.70]){ const sy=dy-0.28, cy=Math.min(F.chineY(s),sy-0.05); const t=clamp((sy-yy)/(sy-cy),0,1); const hw=lerp(F.deckHalf(s),F.chineHalf(s),t); lp.push(x,yy,sd*(hw+0.012)); lv++; } }
    for(let i=s0;i<lv-2;i+=2) li.push(i,i+1,i+2,i+1,i+3,i+2); }
  const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(lp,3)); lg.setIndex(li); lg.computeVertexNormals();
  ship.add(new THREE.Mesh(lg,new THREE.MeshStandardMaterial({color:lc('#1d2b27'),roughness:.5,side:THREE.DoubleSide})));
  // black rubber rubbing strake around the sheer
  const rs=[]; for(let i=0;i<=N;i++){ const s=i/N; rs.push(new THREE.Vector3(-L/2+s*L,F.deckY(s)-0.1,F.deckHalf(s)+0.07)); }
  for(let i=N;i>=0;i--){ const s=i/N; rs.push(new THREE.Vector3(-L/2+s*L,F.deckY(s)-0.1,-F.deckHalf(s)-0.07)); }
  const rubber=new THREE.MeshStandardMaterial({color:lc('#15181a'),roughness:.7});
  ship.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rs,true,'centripetal'),240,0.12,6,true),rubber));
  /* ---------- main cabin (lofted, flush with the hull sides) ---------- */
  const WX0=0.21, WX1=1.13, WY0=0.74, WY1=2.02;
  const winPath=(g,X,Y,inf)=>{ const x0=X(WX0-inf), x1=X(WX1+inf), y0=Y(WY1+inf), y1=Y(WY0-inf), rr=X(0.12+inf); g.beginPath(); g.moveTo(x0+rr,y0); g.lineTo(x1-rr,y0); g.quadraticCurveTo(x1,y0,x1,y0+rr); g.lineTo(x1,y1-rr); g.quadraticCurveTo(x1,y1,x1-rr,y1); g.lineTo(x0+rr,y1); g.quadraticCurveTo(x0,y1,x0,y1-rr); g.lineTo(x0,y0+rr); g.quadraticCurveTo(x0,y0,x0+rr,y0); g.closePath(); };
  const cabTex=canvasTex(256,512,(g,w,h)=>{ const Y=m=>h-m/2.8*h, X=m=>m/1.3*w;
    g.fillStyle='#f3f5f6'; g.fillRect(0,0,w,h);
    g.fillStyle='#1d2926'; g.fillRect(0,Y(0.70),w,Y(0.61)-Y(0.70));
    const sh=g.createLinearGradient(0,Y(2.22),0,Y(2.08)); sh.addColorStop(0,'rgba(150,160,165,0)'); sh.addColorStop(1,'rgba(150,160,165,0.55)'); g.fillStyle=sh; g.fillRect(0,Y(2.22),w,Y(2.08)-Y(2.22));
    winPath(g,X,Y,0.035); g.fillStyle='#14181b'; g.fill();
    winPath(g,X,Y,0); g.save(); g.clip();
    const gr=g.createLinearGradient(0,Y(WY1),0,Y(WY0)); gr.addColorStop(0,'#081016'); gr.addColorStop(0.10,'#34485a'); gr.addColorStop(0.22,'#16222c'); gr.addColorStop(0.6,'#101a22'); gr.addColorStop(1,'#1a2833');
    g.fillStyle=gr; g.fillRect(0,0,w,h);
    g.fillStyle='rgba(5,10,20,0.9)'; for(const sx of [0.22,0.68]){ g.beginPath(); const x0=X(sx), x1=X(sx+0.36), y0=Y(1.28), y1=Y(WY0-0.1); g.moveTo(x0,y1); g.lineTo(x0,y0+8); g.quadraticCurveTo(x0,y0,x0+8,y0); g.lineTo(x1-8,y0); g.quadraticCurveTo(x1,y0,x1,y0+8); g.lineTo(x1,y1); g.fill(); }
    g.fillStyle='rgba(40,70,120,0.35)'; for(const sx of [0.22,0.68]) g.fillRect(X(sx)+3,Y(1.26),X(0.36)-6,6);
    g.restore(); winPath(g,X,Y,0); g.globalCompositeOperation='destination-out'; g.fill(); g.globalCompositeOperation='source-over'; },true);
  cabTex.wrapS=THREE.RepeatWrapping;
  const cabRM=canvasTex(256,512,(g,w,h)=>{ const Y=m=>h-m/2.8*h, X=m=>m/1.3*w; g.fillStyle='rgb(0,80,0)'; g.fillRect(0,0,w,h);
    winPath(g,X,Y,0.035); g.fillStyle='rgb(0,150,0)'; g.fill(); winPath(g,X,Y,0); g.fillStyle='rgb(0,10,150)'; g.fill(); });
  cabRM.wrapS=THREE.RepeatWrapping;
  const cabEM=canvasTex(256,512,(g,w,h)=>{ const Y=m=>h-m/2.8*h, X=m=>m/1.3*w; g.fillStyle='#000'; g.fillRect(0,0,w,h);
    winPath(g,X,Y,0); g.save(); g.clip(); const gr=g.createLinearGradient(0,Y(WY1),0,Y(WY0)); gr.addColorStop(0,'#fff0d0'); gr.addColorStop(0.2,'#ffd49a'); gr.addColorStop(1,'#a06a30'); g.fillStyle=gr; g.fillRect(0,0,w,h);
    g.fillStyle='#000'; for(const sx of [0.22,0.68]) g.fillRect(X(sx),Y(1.28),X(0.36),Y(WY0-0.1)-Y(1.28)); g.restore(); },true);
  cabEM.wrapS=THREE.RepeatWrapping;
  const cabMat=new THREE.MeshStandardMaterial({map:cabTex,roughnessMap:cabRM,metalnessMap:cabRM,roughness:1,metalness:1,emissive:lc('#ffffff'),emissiveMap:cabEM,emissiveIntensity:0,side:THREE.DoubleSide,alphaTest:0.5});
  const winMask=canvasTex(256,512,(g,w,h)=>{ const Y=m=>h-m/2.8*h, X=m=>m/1.3*w; g.fillStyle='#000'; g.fillRect(0,0,w,h); winPath(g,X,Y,0); g.fillStyle='#fff'; g.fill(); }); winMask.wrapS=THREE.RepeatWrapping;
  const xs=[]; for(let x=-8.8;x<3.6;x+=0.7) xs.push(x); xs.push(3.6,3.62); for(let x=3.85;x<6.3;x+=0.3) xs.push(x); xs.push(6.3);
  const ROOF=4.72, CX0=3.62, CX1=6.3;
  const csec=xs.map(x=>{ const s=sOf(x), base=F.deckY(s)-0.03, hw=Math.min(2.98,F.deckHalf(s)-0.07);
    const top = x<=CX0 ? ROOF : lerp(ROOF, base+0.95, (x-CX0)/(CX1-CX0));
    const sill=Math.min(base+0.72, top-0.4);
    return {x,base,top,hw,pts:[[base,hw],[sill,hw],[top-0.3,hw*0.975],[top-0.05,hw*0.9],[top+0.07,0]]}; });
  const cp=[], cu=[], ci=[]; let cv=0;
  const pushV=(x,y,z,u,vv)=>{ cp.push(x,y,z); cu.push(u,vv); return cv++; };
  for(const sd of [1,-1]) for(let j=0;j<4;j++){ const st=cv;
    csec.forEach(c=>{ for(const k of [j,j+1]){ const [y,hz]=c.pts[k]; const z=sd*hz; let u=c.x/1.3, vv=(y-c.base)/2.8;
      if(j<2 && c.x>CX0+0.25) vv=0.4/2.8;
      if(j>=2){ if(c.x>CX0+0.001){ u=z/1.3+0.5; vv=lerp(2.06,0.70,(c.x-CX0)/(CX1-CX0))/2.8; } else vv=2.6/2.8; }
      pushV(c.x,y,z,u,vv); } });
    for(let i=0;i<csec.length-1;i++){ const a=st+i*2; if(sd>0) ci.push(a,a+2,a+1,a+1,a+2,a+3); else ci.push(a,a+1,a+2,a+1,a+3,a+2); } }
  for(const [c,dirx] of [[csec[csec.length-1],1]]){ const ctr=pushV(c.x,(c.base+c.top)/2,0,0,2.6/2.8); const ring=[];
    for(const sd of [1,-1]) for(let k=(sd>0?0:4);sd>0?k<=4:k>=0;k+=(sd>0?1:-1)){ const [y,hz]=c.pts[k]; ring.push(pushV(c.x,y,sd*hz,0,(dirx>0?0.4:2.6)/2.8)); }
    for(let k=0;k<ring.length;k++) ci.push(ctr,ring[k],ring[(k+1)%ring.length]); }
  const cg=new THREE.BufferGeometry(); cg.setAttribute('position',new THREE.Float32BufferAttribute(cp,3)); cg.setAttribute('uv',new THREE.Float32BufferAttribute(cu,2)); cg.setIndex(ci); cg.computeVertexNormals();
  const cabin=new THREE.Mesh(cg,cabMat); cabin.userData.keep=true; ship.add(cabin);
  cabin.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:cabTex,alphaTest:0.5,side:THREE.DoubleSide});
  const tint=new THREE.Mesh(cg,new THREE.MeshStandardMaterial({color:lc('#0e1d26'),transparent:true,opacity:0.52,alphaMap:winMask,roughness:0.04,metalness:0.35,side:THREE.DoubleSide,depthWrite:false}));
  tint.userData.keep=true; tint.renderOrder=2; ship.add(tint);
  // aft bulkhead of the saloon with an open doorway and two windows (entrance from the aft deck)
  { const c=csec[0], sh=new THREE.Shape(); const pts=[]; for(let k=0;k<=4;k++) pts.push([c.pts[k][1],c.pts[k][0]]); for(let k=3;k>=0;k--) pts.push([-c.pts[k][1],c.pts[k][0]]);
    pts.forEach(([z,y],i)=>i?sh.lineTo(z,y):sh.moveTo(z,y)); sh.closePath();
    const b=c.base, hole=(z0,z1,y0,y1)=>{ const h=new THREE.Path(); h.moveTo(z0,y0); h.lineTo(z1,y0); h.lineTo(z1,y1); h.lineTo(z0,y1); h.closePath(); sh.holes.push(h); };
    hole(-0.62,0.62,b+0.06,b+1.98); hole(1.35,2.35,b+0.95,b+1.9); hole(-2.35,-1.35,b+0.95,b+1.9);
    const rw=new THREE.Mesh(new THREE.ShapeGeometry(sh),new THREE.MeshStandardMaterial({color:lc('#f2f4f5'),roughness:.35,side:THREE.DoubleSide})); rw.rotation.y=-Math.PI/2; rw.position.x=c.x; rw.userData.keep=true; rw.castShadow=true; ship.add(rw);
    const fm=new THREE.MeshStandardMaterial({color:lc('#23282c'),roughness:.5,metalness:.4});
    box(0.1,1.98,0.07,fm,c.x-0.03,b+1.0,0.65,ship); box(0.1,1.98,0.07,fm,c.x-0.03,b+1.0,-0.65,ship); box(0.1,0.08,1.37,fm,c.x-0.03,b+2.0,0,ship); box(0.35,0.06,1.3,M.steel,c.x-0.1,b+0.03,0,ship);
    const dg=new THREE.MeshStandardMaterial({color:lc('#1a2a33'),transparent:true,opacity:0.35,roughness:0.05,metalness:0.3,depthWrite:false});
    for(const sd of [1,-1]){ const panel=new THREE.Group(); panel.position.set(c.x-0.08,b+1.0,sd*0.95); ship.add(panel); panel.userData.keep=true;
      box(0.05,1.9,0.62,dg,0,0,0,panel); box(0.06,1.94,0.05,fm,0,0,0.31,panel); box(0.06,1.94,0.05,fm,0,0,-0.31,panel); box(0.06,0.05,0.64,fm,0,0.95,0,panel); box(0.06,0.05,0.64,fm,0,-0.95,0,panel);
      const wg=box(0.03,0.95,1.0,dg,c.x-0.02,b+1.42,sd*1.85,ship); wg.userData.keep=true; }
    const es=new THREE.Mesh(new THREE.PlaneGeometry(1.1,0.26),new THREE.MeshStandardMaterial({map:textTexture([{t:'客室入口  CABIN',font:'900 52px "Zen Kaku Gothic New",sans-serif',y:.55}],{w:520,h:120,bg:'#1d4fa6',fg:'#ffffff'}),roughness:.5}));
    es.position.set(c.x-0.02,b+2.2,0); es.rotation.y=-Math.PI/2; es.userData.keep=true; ship.add(es); }
  // side boarding doors (port & starboard, aft of the cabin)
  const doorMat=new THREE.MeshStandardMaterial({color:lc('#e6eaec'),roughness:.4});
  /* ---------- roof: wheelhouse, radar mast, rafts, rails ---------- */
  const wh=new THREE.Shape(); wh.moveTo(-1.4,0); wh.lineTo(1.9,0); wh.lineTo(1.35,1.1); wh.lineTo(-1.2,1.1); wh.quadraticCurveTo(-1.4,1.1,-1.4,0.9); wh.closePath();
  const whg=new THREE.ExtrudeGeometry(wh,{depth:2.7,bevelEnabled:true,bevelThickness:.12,bevelSize:.12,bevelSegments:3}); whg.translate(0,0,-1.35);
  const whm=new THREE.Mesh(whg,paint); whm.position.set(1.4,ROOF+0.05,0); whm.userData.keep=true; ship.add(whm);
  const glass=new THREE.MeshStandardMaterial({color:lc('#0d161d'),roughness:.05,metalness:.8,emissive:lc('#ffcf88'),emissiveIntensity:0});
  const wb=new THREE.Shape(); wb.moveTo(-1.3,0.42); wb.lineTo(1.78,0.42); wb.lineTo(1.5,0.92); wb.lineTo(-1.3,0.92); wb.closePath();
  const wbg=new THREE.ExtrudeGeometry(wb,{depth:2.96,bevelEnabled:false}); wbg.translate(0.08,0,-1.48);
  const wbm=new THREE.Mesh(wbg,glass); wbm.position.set(1.4,ROOF+0.05,0); wbm.userData.keep=true; ship.add(wbm);
  const mastX=0.0, mastY=ROOF+0.05;
  for(const sd of [1,-1]){ const leg=box(0.12,2.5,0.12,paint,mastX,mastY+1.2,sd*0.55,ship); leg.rotation.x=sd*0.2; }
  box(0.14,0.14,1.3,paint,mastX,mastY+2.35,0,ship);
  box(0.5,0.35,0.5,paint,mastX,mastY+2.6,0,ship);
  const radar=new THREE.Group(); radar.userData.keep=true; radar.position.set(mastX,mastY+2.95,0); ship.add(radar);
  box(0.22,0.14,2.1,new THREE.MeshStandardMaterial({color:lc('#f0f2f3'),roughness:.4}),0,0,0,radar);
  const staff=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,1.6,6),M.steel); staff.position.set(mastX-0.3,mastY+3.4,0); ship.add(staff);
  const flagGeo=new THREE.PlaneGeometry(1.0,0.62,10,2); flagGeo.translate(0.5,0,0);
  const flag=new THREE.Mesh(flagGeo,new THREE.MeshStandardMaterial({color:lc('#ffffff'),side:THREE.DoubleSide,roughness:.8}));
  flag.userData.keep=true; flag.position.set(mastX-0.3,mastY+3.85,0); flag.rotation.y=Math.PI; ship.add(flag);
  for(const sd of [1,-1]){ const dome=new THREE.Mesh(new THREE.SphereGeometry(0.18,12,8),paint); dome.position.set(mastX+0.3,mastY+2.25,sd*0.75); ship.add(dome); }
  const horn=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.14,0.45,10),M.steel); horn.rotation.z=-Math.PI/2; horn.position.set(mastX+0.4,mastY+2.8,0.3); ship.add(horn);
  // life-raft canisters in cradles
  const raftMat=new THREE.MeshStandardMaterial({color:lc('#f2f2ee'),roughness:.45});
  for(let i=0;i<3;i++) for(const sd of [1,-1]){ const x=-2.6-i*1.25;
    const c=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,1.0,14),raftMat); c.rotation.z=Math.PI/2; c.position.set(x,ROOF+0.42,sd*1.3); ship.add(c);
    for(const e of [-0.5,0.5]){ const cap=new THREE.Mesh(new THREE.SphereGeometry(0.34,12,8,0,Math.PI*2,0,Math.PI/2),raftMat); cap.rotation.z=-e*Math.PI; cap.position.set(x+e,ROOF+0.42,sd*1.3); ship.add(cap); }
    box(0.08,0.2,0.8,M.dark,x-0.3,ROOF+0.12,sd*1.3,ship); box(0.08,0.2,0.8,M.dark,x+0.3,ROOF+0.12,sd*1.3,ship); }
  // aft roof house with signs
  box(1.9,0.95,3.4,paint,-7.4,ROOF+0.52,0,ship);
  box(1.92,0.32,3.1,glass,-7.4,ROOF+0.62,0,ship);
  box(0.02,0.3,0.55,M.orange,-6.44,ROOF+0.62,0.9,ship);
  // roof railing
  const rail=new THREE.MeshStandardMaterial({color:lc('#d8dde0'),roughness:.35,metalness:.6});
  for(const sd of [1,-1]){ box(8.6,0.05,0.05,rail,-4.4,ROOF+1.0,sd*2.75,ship); for(let x=-8.6;x<=-0.1;x+=0.95) box(0.04,0.95,0.04,rail,x,ROOF+0.52,sd*2.75,ship); }
  box(0.05,0.05,5.5,rail,-8.65,ROOF+1.0,0,ship);
  /* ---------- foredeck & aft deck ---------- */
  const bowRail=[]; for(let x=6.6;x<=11.3;x+=0.55){ const s=sOf(x); for(const sd of [1,-1]){ const z=sd*(F.deckHalf(s)-0.12); box(0.04,0.8,0.04,rail,x,F.deckY(s)+0.4,z,ship); bowRail.push([x,F.deckY(s)+0.8,z]); } }
  for(const sd of [1,-1]){ const pts=[]; for(let x=6.6;x<=11.3;x+=0.3){ const s=sOf(x); pts.push(new THREE.Vector3(x,F.deckY(s)+0.8,sd*(F.deckHalf(s)-0.12))); }
    pts.push(new THREE.Vector3(11.75,F.deckY(sOf(11.75))+0.8,0)); ship.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),30,0.025,5,false),rail)); }
  const bitt=(x,z)=>{ const s=sOf(x); for(const dx of [-0.18,0.18]){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.3,10),M.dark); c.position.set(x+dx,F.deckY(s)+0.15,z); ship.add(c); } };
  bitt(8.6,1.5); bitt(8.6,-1.5); bitt(-11.2,2.5); bitt(-11.2,-2.5);
  box(0.6,0.35,0.6,M.dark,9.6,F.deckY(sOf(9.6))+0.18,0,ship);
  for(const sd of [1,-1]){ box(3.0,0.05,0.05,rail,-10.5,F.deckY(0.05)+1.0,sd*2.95,ship); for(let x=-11.9;x<=-9.0;x+=0.7) box(0.04,1.0,0.04,rail,x,F.deckY(0.05)+0.5,sd*2.95,ship); }
  box(0.05,0.05,5.9,rail,-11.95,F.deckY(0)+1.0,0,ship);
  // boarding gate frame at the stern quarter (tall white panel seen in the photo)
  for(const sd of [1,-1]){ box(0.8,2.4,0.1,paint,-11.5,F.deckY(0.05)+1.2,sd*2.9,ship); box(0.6,0.9,0.12,glass,-11.5,F.deckY(0.05)+1.55,sd*2.91,ship); }
  // water-jet nozzles
  for(const sd of [1,-1]){ const j=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,0.7,14),M.dark); j.rotation.z=Math.PI/2; j.position.set(-12.2,-0.15,sd*1.3); ship.add(j); }
  // name boards
  const nameTex=textTexture([{t:'かんもん',font:'900 70px "Zen Kaku Gothic New",sans-serif',y:.52}],{w:512,h:96,bg:'rgba(0,0,0,0)',fg:'#1b2f55'});
  for(const sd of [1,-1]){ const s=sOf(7.8); const nb=new THREE.Mesh(new THREE.PlaneGeometry(1.9,0.36),new THREE.MeshStandardMaterial({map:nameTex,roughness:.4,transparent:true,alphaTest:0.35}));
    nb.position.set(7.8,F.deckY(s)-0.45,sd*(F.deckHalf(s)+0.02)); if(sd<0) nb.rotation.y=Math.PI; nb.userData.keep=true; ship.add(nb); }
  // roof visor over the windshield, wipers
  box(0.55,0.07,5.7,paint,CX0+0.12,ROOF+0.02,0,ship);
  { const yb=lerp(ROOF,F.deckY(sOf(CX1))-0.03+0.95,0.55), xb=lerp(CX0,CX1,0.55), ang=Math.atan2(CX1-CX0,ROOF-(F.deckY(sOf(CX1))+0.92));
    for(const z of [-1.0,0.9]){ const wpr=box(0.03,0.85,0.03,rubber,xb,yb+0.05,z,ship); wpr.rotation.z=ang; wpr.rotation.x=z*0.25; } }
  // door windows
  // whip antennas, GPS dome, searchlight
  for(const sd of [1,-1]){ const an=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.02,2.4,5),new THREE.MeshStandardMaterial({color:lc('#eeeeee'),roughness:.5})); an.position.set(mastX,mastY+3.5,sd*0.62); an.rotation.x=sd*0.12; ship.add(an); }
  const gps=new THREE.Mesh(new THREE.SphereGeometry(0.13,12,8,0,Math.PI*2,0,Math.PI/2),paint); gps.position.set(mastX+0.3,mastY+2.78,-0.3); ship.add(gps);
  const sl=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.13,0.3,12),M.steel); sl.rotation.z=Math.PI/2; sl.position.set(3.2,ROOF+1.35,0); ship.add(sl);
  box(0.25,0.2,0.25,M.dark,3.0,ROOF+1.22,0,ship);
  // lifebuoys on the aft rails and roof rail
  const buoyMat=new THREE.MeshStandardMaterial({color:lc('#f2601c'),roughness:.55});
  for(const sd of [1,-1]){ const lb=new THREE.Mesh(new THREE.TorusGeometry(0.3,0.075,8,20),buoyMat); lb.position.set(-9.3,F.deckY(0.05)+0.6,sd*3.0); ship.add(lb);
    const lb2=lb.clone(); lb2.position.set(-5.9,ROOF+0.6,sd*2.78); ship.add(lb2); }
  // stern: ensign staff with the national flag, name & port of registry on the transom
  const esY=F.deckY(0)+0.1;
  const est=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.03,2.3,6),M.steel); est.position.set(-11.85,esY+1.15,0); ship.add(est);
  const ensTex=canvasTex(128,86,(g,w,h)=>{ g.fillStyle='#ffffff'; g.fillRect(0,0,w,h); g.fillStyle='#bc002d'; g.beginPath(); g.arc(w/2,h/2,h*0.3,0,Math.PI*2); g.fill(); },true);
  const ensGeo=new THREE.PlaneGeometry(0.9,0.6,10,2); ensGeo.translate(-0.45,0,0);
  const ensign=new THREE.Mesh(ensGeo,new THREE.MeshStandardMaterial({map:ensTex,side:THREE.DoubleSide,roughness:.8})); ensign.userData.keep=true; ensign.position.set(-11.85,esY+2.0,0); ship.add(ensign);
  const sternTex=textTexture([{t:'かんもん',font:'900 64px "Zen Kaku Gothic New",sans-serif',y:.32},{t:'下 関',font:'700 44px "Zen Kaku Gothic New",sans-serif',y:.78}],{w:512,h:180,bg:'rgba(0,0,0,0)',fg:'#1b2f55'});
  const sn=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.85),new THREE.MeshStandardMaterial({map:sternTex,roughness:.4,transparent:true,alphaTest:0.35})); sn.position.set(-L/2-0.02,1.25,0); sn.rotation.y=-Math.PI/2; sn.userData.keep=true; ship.add(sn);
  // navigation lights
  const lpS=navLight(0xff2a2a,2.2); lpS.position.set(2.6,ROOF+0.8,-1.62); ship.add(lpS);
  const lsS=navLight(0x2aff6a,2.2); lsS.position.set(2.6,ROOF+0.8,1.62); ship.add(lsS);
  const lm=navLight(0xffffff,2.6); lm.position.set(mastX,mastY+3.2,0); ship.add(lm);
  const lt=navLight(0xffffff,2.2); lt.position.set(-11.9,F.deckY(0)+1.2,0); ship.add(lt);
  mergeGroup(ship);
  ship.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  ship.userData={whm,wbm,cabin,flag,radar,flagGeo,flagBase:flagGeo.attributes.position.array.slice(),ensGeo,ensBase:ensGeo.attributes.position.array.slice(),cabMat,glass,
    door:new THREE.Vector3(-10.35,F.deckY(sOf(-10.35))+0.05,3.0), deckPt:new THREE.Vector3(-10.1,F.deckY(sOf(-10.1))+0.03,1.3), rdoor:new THREE.Vector3(-9.1,F.deckY(sOf(-9.1))+0.03,0), inside:new THREE.Vector3(-7.9,F.deckY(sOf(-7.9))+0.03,0.2),
    cleats:{bow:new THREE.Vector3(8.6,F.deckY(sOf(8.6))+0.3,1.5),stern:new THREE.Vector3(-11.2,F.deckY(0.05)+0.3,2.5)}};
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
   Helm station (inside the roof wheelhouse), right-hand mirror,
   and the passenger saloon interior (red velvet benches, beige walls)
   ============================================================ */
const IN = {};
let cabinSafe=true;
(function buildInteriors(){
  const ud=ferry.userData, F=HULLF, ROOF=4.72, CX0=3.62, CX1=6.3;
  // ---------------- helm ----------------
  const cp=new THREE.Group(); cp.visible=false; ferry.add(cp); IN.helm=cp;
  const inWall=new THREE.MeshStandardMaterial({color:lc('#cfd2d1'),roughness:.8,emissive:lc('#4a4d4f'),emissiveIntensity:1});
  const dash=new THREE.MeshStandardMaterial({color:lc('#2a2f34'),roughness:.7,emissive:lc('#16191c'),emissiveIntensity:1});
  const frame=new THREE.MeshStandardMaterial({color:lc('#1b1f22'),roughness:.6});
  const wy0=ROOF+0.47, wy1=ROOF+0.97, xf=y=>3.3-0.5*((y-ROOF-0.05)/1.1);
  box(3.3,0.06,2.95,inWall,1.65,ROOF+1.13,0,cp);
  box(3.2,0.42,0.06,inWall,1.7,ROOF+0.26,1.45,cp); box(3.2,0.42,0.06,inWall,1.7,ROOF+0.26,-1.45,cp);
  box(0.06,0.42,2.9,inWall,xf(ROOF+0.26)-0.03,ROOF+0.26,0,cp);
  const ang=Math.atan2(0.5*(0.5/1.1),0.5);
  for(const z of [-1.42,-0.48,0.48,1.42]){ const p=box(0.07,0.55,0.07,frame,(xf(wy0)+xf(wy1))/2-0.02,(wy0+wy1)/2,z,cp); p.rotation.z=ang; }
  for(const x of [0.2,1.1,2.1]) for(const z of [-1.45,1.45]) box(0.07,0.55,0.07,frame,x,(wy0+wy1)/2,z,cp);
  box(0.07,0.06,2.95,frame,xf(wy1)-0.02,wy1,0,cp); box(0.07,0.06,2.95,frame,xf(wy0)-0.02,wy0,0,cp);
  for(const z of [-1.45,1.45]){ box(3.2,0.06,0.07,frame,1.65,wy1,z,cp); box(3.2,0.06,0.07,frame,1.65,wy0,z,cp); }
  const glassT=new THREE.MeshStandardMaterial({color:lc('#9fb8c4'),transparent:true,opacity:0.1,roughness:0.03,metalness:0.1,depthWrite:false});
  const fg=new THREE.Mesh(new THREE.PlaneGeometry(0.55,2.9),glassT); fg.rotation.set(0,-Math.PI/2,0); fg.rotateX(0); fg.position.set((xf(wy0)+xf(wy1))/2,(wy0+wy1)/2,0); fg.rotation.z=0; fg.rotateOnWorldAxis(new THREE.Vector3(0,0,1),ang); cp.add(fg);
  // console, screens, compass
  const con=box(0.6,0.52,2.75,dash,xf(ROOF+0.3)-0.36,ROOF+0.3,0,cp);
  const top=box(0.62,0.04,2.77,frame,xf(ROOF+0.3)-0.36,ROOF+0.57,0,cp); top.rotation.z=-0.25;
  const mkScreen=(w,h,cw,ch)=>{ const c=document.createElement('canvas'); c.width=cw; c.height=ch; const tx=new THREE.CanvasTexture(c); tx.encoding=THREE.sRGBEncoding;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tx,toneMapped:false})); return {c,g:c.getContext('2d'),tx,m}; };
  IN.radar=mkScreen(0.42,0.32,256,196); IN.chart=mkScreen(0.42,0.32,256,196); IN.gauge=mkScreen(0.5,0.22,320,140);
  [[IN.radar,-0.62],[IN.chart,-0.12],[IN.gauge,0.55]].forEach(([s,z])=>{ s.m.position.set(xf(ROOF+0.5)-0.42,ROOF+0.6,z); s.m.rotation.set(0,-Math.PI/2,0); s.m.rotateX(-1.0); s.m.scale.setScalar(0.85); cp.add(s.m); });
  const comp=new THREE.Mesh(new THREE.SphereGeometry(0.09,16,10),new THREE.MeshStandardMaterial({color:lc('#20262b'),roughness:.1,metalness:.3})); comp.position.set(xf(ROOF+0.6)-0.2,ROOF+0.66,0.12); cp.add(comp);
  // steering wheel
  const wheel=new THREE.Group(); wheel.position.set(xf(ROOF+0.45)-0.62,ROOF+0.5,0.42); wheel.rotation.z=0.5; cp.add(wheel);
  const whl=new THREE.Group(); wheel.add(whl);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(0.2,0.022,8,32),new THREE.MeshStandardMaterial({color:lc('#1a1a1a'),roughness:.6})); rim.rotation.y=Math.PI/2; whl.add(rim);
  for(let i=0;i<3;i++){ const sp=box(0.02,0.2,0.025,M.steel,0,0,0,whl); sp.geometry.translate(0,0.1,0); sp.rotation.x=i*2.094; }
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.06,12),M.steel); hub.rotation.z=Math.PI/2; whl.add(hub);
  const col=box(0.05,0.05,0.35,dash,0.18,0,0,wheel); col.rotation.set(0,Math.PI/2,0);
  IN.wheel=whl;
  // throttle levers and joystick (操縦桿) under the right hand
  const lvBase=box(0.22,0.08,0.3,dash,xf(ROOF+0.45)-0.75,ROOF+0.44,0.95,cp);
  IN.levers=[];
  for(const dz of [-0.06,0.06]){ const lv=new THREE.Group(); lv.position.set(lvBase.position.x,ROOF+0.48,0.95+dz); cp.add(lv);
    box(0.02,0.2,0.02,M.steel,0,0.1,0,lv); const k=new THREE.Mesh(new THREE.SphereGeometry(0.03,10,8),new THREE.MeshStandardMaterial({color:lc('#c0301f'),roughness:.4})); k.position.y=0.2; lv.add(k); IN.levers.push(lv); }
  const js=new THREE.Group(); js.position.set(lvBase.position.x+0.05,ROOF+0.48,1.22); cp.add(js);
  box(0.12,0.04,0.12,dash,0,-0.02,0,js); box(0.025,0.16,0.025,frame,0,0.08,0,js);
  const kn=new THREE.Mesh(new THREE.SphereGeometry(0.035,12,8),new THREE.MeshStandardMaterial({color:lc('#1f1f1f'),roughness:.5})); kn.position.y=0.17; js.add(kn); IN.joy=js;
  // right mirror (outside, starboard) — shows a live mirror image
  IN.mirrorRT=new THREE.WebGLRenderTarget(512,340); IN.mirrorRT.texture.repeat.x=-1; IN.mirrorRT.texture.offset.x=1; IN.mirrorRT.texture.encoding=THREE.LinearEncoding;
  const mg=new THREE.Group(); mg.position.set(2.7,ROOF+0.7,3.2); ferry.add(mg);
  box(0.04,0.04,1.75,M.steel,0,0.05,-0.88,mg); box(0.04,0.5,0.04,M.steel,0,-0.2,-1.72,mg);
  const mf=box(0.05,0.3,0.42,frame,0,0,0,mg);
  IN.mirrorMat=new THREE.MeshBasicMaterial({color:0x223038,toneMapped:false});
  const mplane=new THREE.Mesh(new THREE.PlaneGeometry(0.38,0.26),IN.mirrorMat); mplane.position.x=-0.03; mplane.rotation.y=-Math.PI/2; mg.add(mplane);
  mg.rotation.y=-0.35; IN.mirrorGroup=mg;
  IN.mirrorCam=new THREE.PerspectiveCamera(36,512/340,0.5,6000);
  // ---------------- passenger saloon ----------------
  const cab=new THREE.Group(); ferry.add(cab); IN.cabin=cab;
  const WX0=0.21, WX1=1.13, WY0=0.74, WY1=2.02;
  const wall=canvasTex(256,512,(g,w,h)=>{ const Y=m=>h-m/2.8*h, X=m=>m/1.3*w, r=mulberry(5);
    g.fillStyle='#e7d7b3'; g.fillRect(0,0,w,h);
    for(let i=0;i<5000;i++){ g.fillStyle=`rgba(${120+r()*60|0},${90+r()*50|0},${60+r()*40|0},${0.12+r()*0.15})`; g.fillRect(r()*w,r()*h,1.5,1.5); }
    g.fillStyle='#f3f0ea'; g.fillRect(0,0,w,Y(2.45)); g.fillStyle='#fff8e0'; g.fillRect(w*0.35,Y(2.75),w*0.3,Y(2.62)-Y(2.75));
    g.fillStyle='#6b5642'; g.fillRect(0,Y(0.12),w,h-Y(0.12));
    const rr=X(0.14); const path=inf=>{ const x0=X(WX0-inf), x1=X(WX1+inf), y0=Y(WY1+inf), y1=Y(WY0-inf), q=rr+X(inf); g.beginPath(); g.moveTo(x0+q,y0); g.lineTo(x1-q,y0); g.quadraticCurveTo(x1,y0,x1,y0+q); g.lineTo(x1,y1-q); g.quadraticCurveTo(x1,y1,x1-q,y1); g.lineTo(x0+q,y1); g.quadraticCurveTo(x0,y1,x0,y1-q); g.lineTo(x0,y0+q); g.quadraticCurveTo(x0,y0,x0+q,y0); g.closePath(); };
    path(0.05); g.fillStyle='#b9bec2'; g.fill(); path(0.03); g.fillStyle='#d9dde0'; g.fill(); path(0.012); g.fillStyle='#2a2d30'; g.fill();
    path(0); g.globalCompositeOperation='destination-out'; g.fill(); g.globalCompositeOperation='source-over'; },true);
  wall.wrapS=THREE.RepeatWrapping;
  const wallMat=IN.wallMat=new THREE.MeshStandardMaterial({map:wall,roughness:.85,side:THREE.DoubleSide,alphaTest:0.5,transparent:false,emissive:lc('#ffffff'),emissiveMap:wall,emissiveIntensity:0.22});
  const xs=[]; for(let x=-8.75;x<3.6;x+=0.65) xs.push(x); xs.push(3.6,3.62); for(let x=3.85;x<6.25;x+=0.3) xs.push(x); xs.push(6.25);
  const secs=xs.map(x=>{ const s=sOf(x), base=F.deckY(s)-0.03, hw=Math.min(2.98,F.deckHalf(s)-0.07)-0.07; const top=(x<=CX0?ROOF:lerp(ROOF,base+0.95,(x-CX0)/(CX1-CX0)))-0.07;
    return {x,base,hw,pts:[[base,hw],[Math.min(base+0.72,top-0.4),hw],[top-0.3,hw*0.975],[top-0.05,hw*0.9],[top+0.06,0]]}; });
  const P=[],UV=[],I=[]; let v=0;
  for(const sd of [1,-1]) for(let j=0;j<4;j++){ const st=v; secs.forEach(c=>{ for(const k of [j,j+1]){ const [y,hz]=c.pts[k]; let u=c.x/1.3, vv=(y-c.base)/2.8;
      if(j<2 && c.x>CX0+0.25) vv=0.4/2.8;
      if(j>=2){ if(c.x>CX0+0.001){ u=sd*hz/1.3+0.5; vv=lerp(2.06,0.70,(c.x-CX0)/(CX1-CX0))/2.8; } else vv=2.7/2.8; } P.push(c.x,y,sd*hz); UV.push(u,vv); v++; } });
    for(let i=0;i<secs.length-1;i++){ const a=st+i*2; I.push(a,a+2,a+1,a+1,a+2,a+3); } }
  const cap=(c,vv)=>{ const ctr=v; P.push(c.x,(c.base+c.pts[4][0])/2,0); UV.push(0.5,vv); v++; const ring=[]; for(const sd of [1,-1]) for(let k=(sd>0?0:4);sd>0?k<=4:k>=0;k+=(sd>0?1:-1)){ P.push(c.x,c.pts[k][0],sd*c.pts[k][1]); UV.push(0.5,vv); ring.push(v++); } for(let k=0;k<ring.length;k++) I.push(ctr,ring[k],ring[(k+1)%ring.length]); };
  cap(secs[secs.length-1],0.3/2.8);
  { const c=secs[0], sh=new THREE.Shape(); const pts=[]; for(let k=0;k<=4;k++) pts.push([c.pts[k][1],c.pts[k][0]]); for(let k=3;k>=0;k--) pts.push([-c.pts[k][1],c.pts[k][0]]);
    pts.forEach(([z,y],i)=>i?sh.lineTo(z,y):sh.moveTo(z,y)); sh.closePath(); const b=c.base;
    const hole=(z0,z1,y0,y1)=>{ const h=new THREE.Path(); h.moveTo(z0,y0); h.lineTo(z1,y0); h.lineTo(z1,y1); h.lineTo(z0,y1); h.closePath(); sh.holes.push(h); };
    hole(-0.62,0.62,b+0.06,b+1.98); hole(1.35,2.35,b+0.95,b+1.9); hole(-2.35,-1.35,b+0.95,b+1.9);
    const iw=new THREE.Mesh(new THREE.ShapeGeometry(sh),new THREE.MeshStandardMaterial({color:lc('#e4d3ae'),roughness:.85,side:THREE.DoubleSide,emissive:lc('#e4d3ae'),emissiveIntensity:0.2})); iw.rotation.y=-Math.PI/2; iw.position.x=c.x; iw.userData.keep=true; cab.add(iw); }
  const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); wg.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2)); wg.setIndex(I); wg.computeVertexNormals();
  const shell=new THREE.Mesh(wg,wallMat); shell.userData.keep=true; cab.add(shell);
  const floorTex=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#c79a5e'; g.fillRect(0,0,w,h); const r=mulberry(8); for(let i=0;i<3000;i++){ g.fillStyle=`rgba(90,60,30,${r()*0.12})`; g.fillRect(r()*w,r()*h,2,2); } g.fillStyle='#9aa1a6'; g.fillRect(0,h/2-2,w,4); },true);
  floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping; floorTex.repeat.set(8,2);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(15,5.8),new THREE.MeshStandardMaterial({map:floorTex,roughness:.6})); floor.rotation.x=-Math.PI/2; floor.position.set(-1.3,F.deckY(sOf(-2))+0.0,0); floor.userData.keep=true; cab.add(floor);
  // red velvet benches with white vinyl headrest covers and dark steel bases
  const velvet=new THREE.MeshStandardMaterial({color:lc('#8c1420'),roughness:.95});
  const vinyl=new THREE.MeshStandardMaterial({color:lc('#efede6'),roughness:.3});
  const baseM=new THREE.MeshStandardMaterial({color:lc('#4a3b30'),roughness:.8,metalness:.3});
  const seats=new THREE.Group(); cab.add(seats);
  const bench=(x,z,w)=>{ const y=F.deckY(sOf(x));
    box(0.5,0.36,w,baseM,x,y+0.18,z,seats); const c=box(0.52,0.14,w,velvet,x+0.02,y+0.43,z,seats);
    const b=box(0.1,0.42,w,velvet,x-0.24,y+0.7,z,seats); b.rotation.z=0.1; const cv=box(0.13,0.2,w+0.02,vinyl,x-0.265,y+0.97,z,seats); cv.rotation.z=0.1;
    for(const e of [-w/2+0.03,w/2-0.03]) box(0.5,0.05,0.04,M.steel,x,y+0.52,z+e,seats); };
  for(let x=-7.4;x<=2.6;x+=1.3){ bench(x,1.55,1.9); bench(x,-1.55,1.9); }
  // longitudinal benches at the aft end (like the photo)
  { const y=F.deckY(sOf(-8.3)); for(const sd of [1,-1]){ box(1.3,0.36,0.5,baseM,-8.25,y+0.18,sd*2.55,seats); box(1.3,0.14,0.52,velvet,-8.25,y+0.43,sd*2.5,seats); box(1.3,0.5,0.1,velvet,-8.25,y+0.78,sd*2.8,seats); box(1.32,0.3,0.14,vinyl,-8.25,y+1.1,sd*2.84,seats); } }
  mergeGroup(seats);
  // blue curtains, signs, ceiling lights
  const curtain=new THREE.MeshStandardMaterial({color:lc('#3d67aa'),roughness:.9});
  for(let x=-8.2;x<3.4;x+=2.6) for(const sd of [1,-1]){ const hz=Math.min(2.98,F.deckHalf(sOf(x))-0.07)-0.13; const c=box(0.14,0.95,0.08,curtain,x,F.deckY(sOf(x))+1.55,sd*hz,cab); c.userData.keep=true; }
  const sign=(txt,sub,x,sd,col)=>{ const tx=textTexture([{t:txt,font:'900 54px "Zen Kaku Gothic New",sans-serif',y:.3},{t:sub,font:'500 30px "Zen Kaku Gothic New",sans-serif',y:.72}],{w:420,h:200,bg:'#f7f5ef',fg:col}); const m=new THREE.Mesh(new THREE.PlaneGeometry(0.34,0.16),new THREE.MeshStandardMaterial({map:tx,roughness:.6})); const hz=Math.min(2.98,F.deckHalf(sOf(x))-0.07)-0.08; m.position.set(x,F.deckY(sOf(x))+0.5,sd*hz); m.rotation.y=sd>0?Math.PI:0; m.userData.keep=true; cab.add(m); };
  sign('船内禁煙','お煙草は後部デッキにて',-5.8,1,'#c43a1c'); sign('船内禁煙','お煙草は後部デッキにて',-1.9,-1,'#c43a1c'); sign('優先席','Priority Seat',-7.1,-1,'#2f7a3a');
  const lampM=new THREE.MeshStandardMaterial({color:lc('#ffffff'),emissive:lc('#fff3dd'),emissiveIntensity:0.8});
  for(let x=-8;x<3.5;x+=2.4){ const l=box(1.4,0.03,0.25,lampM,x,ROOF-0.1,0,cab); l.userData.keep=true; }
  IN.cabLight=new THREE.PointLight(0xfff0d8,2.2,18,1.5); IN.cabLight.position.set(-2.5,ROOF-0.4,0); IN.cabLight.visible=false; cab.add(IN.cabLight);
  cab.traverse(o=>{ if(o.isMesh) o.receiveShadow=true; });
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


