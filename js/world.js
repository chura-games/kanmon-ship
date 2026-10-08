/* 関門汽船 運転シミュレーター — 世界：地形、街並み、夜景の光、関門橋、桟橋、港の設備、大型船 */
'use strict';

/* ============================================================
   Terrain, sea walls
   ============================================================ */
(function buildTerrain(){
  const W=9000, D=7000, SX=360, SZ=280;
  const geo = new THREE.PlaneGeometry(W,D,SX,SZ).rotateX(-Math.PI/2);
  geo.translate(300,0,0);
  const pos = geo.attributes.position, col = new Float32Array(pos.count*3);
  const L=Object.assign({quay:'#8d8f90',city:'#7d7f7a',city2:'#8f8a80',plaza:'#a39383',g1:'#3a5630',g2:'#58733f',rock:'#4b5840'},STAGE.land);
  const cSea=lc('#5b5a4c'), cQuay=lc(L.quay), cCity=lc(L.city), cCity2=lc(L.city2), cPlaza=lc(L.plaza),
        cG1=lc(L.g1), cG2=lc(L.g2), cRock=lc(L.rock);
  const tmp=new THREE.Color();
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i), h=terrainH(x,z), d=landD(x,z);
    pos.setY(i,h);
    const n=fbm2(x*.004,z*.004);
    if(d<0) tmp.copy(cSea);
    else {
      tmp.copy(cCity).lerp(cCity2,n);
      if(d<40) tmp.lerp(cQuay,0.6);
      const nearPier = Math.min(...STAGE.piers.map(p=>Math.hypot(x-p.x,z-(p.north?northZ(p.x)-40:southZ(p.x)+40))));
      if(nearPier<110) tmp.lerp(cPlaza,0.7*smooth(110,50,nearPier));
      const green = smooth(10,26,h) * (0.6+0.4*smooth(0.35,0.6,n));
      const g = cG1.clone().lerp(cG2,fbm2(x*.013,z*.013)); if(h>160) g.lerp(cRock,0.4);
      tmp.lerp(g,green);
    }
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col,3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({vertexColors:true, roughness:1, metalness:0}));
  scene.add(m);
  // sea walls: along both shores, or on natural shores (STAGE.wild) only the stretch of quay around each pier
  const pts=[], idx=[]; let v=0;
  const runs=STAGE.wild ? STAGE.piers.map(p=>[p.north?northZ:southZ,p.x-300,p.x+300]) : [[northZ,-4200,4800],[southZ,-4200,4800]];
  for(const [side,xa,xb] of runs){
    const start=v;
    for(let x=xa;x<=xb;x+=12){ const z=side(x); pts.push(x,3.35,z, x,-5,z); v+=2; }
    for(let i=start;i<v-2;i+=2) idx.push(i,i+1,i+2, i+1,i+3,i+2);
  }
  const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3)); wg.setIndex(idx); wg.computeVertexNormals();
  scene.add(new THREE.Mesh(wg,new THREE.MeshStandardMaterial({color:lc('#9a9a92'),roughness:.95,side:THREE.DoubleSide})));
})();

/* ============================================================
   City buildings (instanced; procedural windows lit at night)
   ============================================================ */
const PIERS = {};
for(const d of STAGE.piers) PIERS[d.key] = { name:d.name, x:d.x, shore:(d.north?northZ:southZ)(d.x), dir:d.north?1:-1, style:d.style, sign:d.sign, office:d.office };
for(const k in PIERS){ const p=PIERS[k]; p.pz = p.shore + p.dir*48; p.bz = p.pz + p.dir*(4.45+SHIP_B/2+0.15); p.bx = p.x; p.psi = 0; }

const buildMat = new THREE.ShaderMaterial({
  uniforms:U, fog:false,
  vertexShader:`varying vec3 vW; varying vec3 vN; varying vec3 vC;
  void main(){ mat4 m=modelMatrix*instanceMatrix; vec4 wp=m*vec4(position,1.0); vW=wp.xyz; vN=normalize(mat3(m)*normal);
  #ifdef USE_INSTANCING_COLOR
    vC=instanceColor;
  #else
    vC=vec3(0.8);
  #endif
  gl_Position=projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: COMMON + `varying vec3 vW; varying vec3 vN; varying vec3 vC;
  void main(){
    vec3 N=normalize(vN); vec3 toC=cameraPosition-vW; float dist=length(toC); vec3 V=toC/dist;
    float diff=max(dot(N,uSunDir),0.0);
    vec3 base=vC*(uAmbient*0.75*(0.55+0.45*N.y)+uSunColor*diff*0.55);
    float wall=1.0-step(0.5,abs(N.y));
    float hor=abs(N.x)>0.5?vW.z:vW.x;
    vec2 cell=vec2(hor/3.2,vW.y/3.5);
    vec2 fc=fract(cell);
    float win=wall*step(0.18,fc.x)*step(fc.x,0.82)*step(0.3,fc.y)*step(fc.y,0.85)*step(5.0,vW.y);
    float h=hash21(floor(cell)+floor(vC.xy*97.0));
    vec3 winDay=mix(vec3(0.04,0.06,0.08),skyColor(reflect(-V,N))*0.55,0.55);
    vec3 winNight=vec3(1.0,0.72,0.40)*(0.5+0.9*h)*step(0.52,h)*smoothstep(0.2,0.9,uNight)*1.7;
    float wf=1.0-smoothstep(500.0,1800.0,dist);
    vec3 col=mix(base,winDay,win*0.85*wf+0.2*(1.0-wf)*wall)+winNight*(win*wf+0.22*(1.0-wf)*wall);
    col=mix(col,uFogColor,fogF(dist));
    gl_FragColor=vec4(col,1.0);
    ${TAIL}
  }`
});
(function buildCity(){
  const list=[];
  const palette=['#e9e6df','#d9d6cf','#c9ccd0','#b8bec6','#e3dccd','#a7b0b9','#d7d0c4','#f1efe9','#9ea6ad','#c4b8a6'].map(lc);
  const brick=['#8d4b36','#9a5a42','#7e4432'].map(lc);
  const add=(x,z,w,d,h,rot,c)=>list.push({x,z,w,d,h,rot,c});
  const kanmon=STAGE.id==='kanmon', C=STAGE.city;
  for(let i=0;i<2600 && list.length<C.max;i++){
    const north = rnd()<0.55;
    const x = -3600 + rnd()*7600;
    const d = 22 + Math.pow(rnd(),1.6)*480;
    const z = north ? northZ(x)-d : southZ(x)+d;
    const g = terrainH(x,z); if(g>40) continue;
    let near=false; for(const k in PIERS){ const p=PIERS[k]; if(Math.abs(x-p.x)<70 && d<95) near=true; if(Math.abs(x-p.x)<260 && d<34) near=true; if(Math.abs(x-p.x)<330 && Math.abs(x-p.x)>160 && d<70 && rnd()<0.6) near=true; }
    if(Math.abs(x-BRIDGE_X)<40) near=true;
    if(kanmon){ if(!north && x>-440 && x<-100 && d<120) near=true; if(north && x>-120 && x<-40 && d<30) near=true; if(!north && x>60 && x<230 && d<55) near=true; }
    if(near) continue;
    const slope = north ? (northZ(x+5)-northZ(x-5))/10 : (southZ(x+5)-southZ(x-5))/10;
    const rot = -Math.atan(slope) + (rnd()<0.25 ? (rnd()-.5)*0.8 : 0);
    const core = Math.exp(-((x-(north?C.core[0]:C.core[1]))**2)/(2*700*700));
    if(!kanmon && rnd()>0.25+0.75*core) continue;   // outside Kanmon the towns huddle around the two ports
    const h = 7 + (Math.pow(rnd(),2.6)*(22+40*core) + (d<120?rnd()*8:0))*C.height;
    const w = 9+rnd()*22, dd=9+rnd()*20;
    const retro = kanmon && !north && x>80 && x<700 && d<260 && rnd()<0.45;
    const c = retro ? brick[(rnd()*3)|0] : palette[(rnd()*palette.length)|0];
    add(x,z,w,dd,retro?Math.min(h,16):h,rot,c);
  }
  // landmarks
  if(kanmon){
  add(150,northZ(150)-40,95,45,12,0,lc('#c8c3b8'));                                   // 唐戸市場
  add(-150,northZ(-150)-78,34,20,44,0,lc('#e3ddd2'));                                  // 下関グランドホテル
  const rz=southZ(390)+140; add(390,rz,22,22,127,0.1,lc('#e6dfd0'));                   // 門司港レトロ展望タワー
  add(540,southZ(540)+95,48,20,14,0,lc('#a15c3f'));                                    // 旧門司税関あたり
  }
  const geo=new THREE.BoxGeometry(1,1,1).translate(0,0.5,0);
  const mesh=new THREE.InstancedMesh(geo,buildMat,list.length);
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), p=new THREE.Vector3(), yAx=new THREE.Vector3(0,1,0);
  list.forEach((b,i)=>{ const y=terrainH(b.x,b.z)-2; q.setFromAxisAngle(yAx,b.rot); s.set(b.w,b.h+2,b.d); p.set(b.x,y,b.z); m4.compose(p,q,s); mesh.setMatrixAt(i,m4); mesh.setColorAt(i,b.c); });
  mesh.instanceMatrix.needsUpdate=true; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  mesh.frustumCulled=false;
  scene.add(mesh);
})();

/* ============================================================
   Shared materials & light sprites
   ============================================================ */
const M = {
  white: new THREE.MeshStandardMaterial({color:lc('#f3f5f6'),roughness:.32,metalness:.05}),
  offwhite: new THREE.MeshStandardMaterial({color:lc('#e4e7ea'),roughness:.5}),
  glass: new THREE.MeshStandardMaterial({color:lc('#121e2a'),roughness:.06,metalness:.85,emissive:lc('#ffcf88'),emissiveIntensity:0}),
  dark: new THREE.MeshStandardMaterial({color:lc('#2b3036'),roughness:.6,metalness:.3}),
  steel: new THREE.MeshStandardMaterial({color:lc('#b9c0c7'),roughness:.4,metalness:.6}),
  gray: new THREE.MeshStandardMaterial({color:lc('#8e9398'),roughness:.8}),
  deck: new THREE.MeshStandardMaterial({color:lc('#6d7c77'),roughness:.9}),
  wood: new THREE.MeshStandardMaterial({color:lc('#8b7155'),roughness:.9}),
  green: new THREE.MeshStandardMaterial({color:lc('#3f8a55'),roughness:.8}),
  yellow: new THREE.MeshStandardMaterial({color:lc('#e8c21e'),roughness:.6}),
  orange: new THREE.MeshStandardMaterial({color:lc('#f06a1d'),roughness:.5}),
  red: new THREE.MeshStandardMaterial({color:lc('#c22d24'),roughness:.5}),
  bridge: new THREE.MeshStandardMaterial({color:lc('#d9dde0'),roughness:.55,metalness:.2}),
};
function glowTexture(){
  const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d');
  const gr=g.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.2,'rgba(255,255,255,.6)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64); return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();
const glowSprites=[];
function navLight(color, size, always){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW,color,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false}));
  s.scale.setScalar(size); s.userData.always=!!always; glowSprites.push(s); return s;
}
function textTexture(lines, opt){
  const W=opt.w||512, H=opt.h||128;
  const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d');
  g.fillStyle=opt.bg||'#fff'; g.fillRect(0,0,W,H);
  g.fillStyle=opt.fg||'#000'; g.textAlign='center'; g.textBaseline='middle';
  lines.forEach(l=>{ g.font=l.font; g.fillText(l.t, W/2, l.y*H); });
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t;
}

/* ============================================================
   City/bridge lights at night + their reflections on water
   ============================================================ */
const lightPts=[];   // [x,y,z,r,g,b,size]
function addLight(x,y,z,hex,size){ const c=lc(hex); lightPts.push([x,y,z,c.r,c.g,c.b,size]); }
if(!STAGE.wild) for(const side of [northZ,southZ]){
  const sgn = side===northZ?-1:1;
  for(let x=-3200;x<=4200;x+=24){ const z=side(x)+sgn*7; if(terrainH(x,z)>30) continue; addLight(x+rnd()*4,8.5,z,rnd()<.8?'#ffc98a':'#e7f2ff',5); }
}
/* ---- suspension bridge across the narrows ---- */
if(STAGE.bridge!==false) (function buildBridge(){
  const x=BRIDGE_X, deckY=61, towerH=141;
  const zt1=northZ(x)-25, zt2=southZ(x)+25, mid=(zt1+zt2)/2, half=(zt2-zt1)/2;
  const g=new THREE.Group();
  for(const zt of [zt1,zt2]){
    const base=terrainH(x,zt)-2;
    for(const off of [-13,13]){ const leg=new THREE.Mesh(new THREE.BoxGeometry(5,towerH-base,6),M.bridge); leg.position.set(x+off,(towerH+base)/2,zt); g.add(leg); }
    for(const yy of [deckY-6,100,towerH-3]){ const b=new THREE.Mesh(new THREE.BoxGeometry(31,4,5),M.bridge); b.position.set(x,yy,zt); g.add(b); }
    addLight(x-13,towerH+1,zt,'#ff3020',9); addLight(x+13,towerH+1,zt,'#ff3020',9);
  }
  const deck=new THREE.Mesh(new THREE.BoxGeometry(24,4.5,2400),M.bridge); deck.position.set(x,deckY,mid); g.add(deck);
  const truss=new THREE.Mesh(new THREE.BoxGeometry(22,5,2400),M.gray); truss.position.set(x,deckY-4.5,mid); g.add(truss);
  const cableY = z => { if(z<zt1) return lerp(24,towerH, smooth(zt1-620,zt1,z)); if(z>zt2) return lerp(towerH,24,smooth(zt2,zt2+620,z)); const t=(z-mid)/half; return 66+(towerH-66)*t*t; };
  const hanger=[];
  for(const off of [-12,12]){
    const pts=[]; for(let z=zt1-600; z<=zt2+600; z+=12){ pts.push(new THREE.Vector3(x+off,cableY(z),z)); }
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),220,0.9,6,false),M.bridge); g.add(tube);
    for(let z=zt1+14; z<zt2-10; z+=16){ const cy=cableY(z); hanger.push(x+off,cy,z, x+off,deckY+2,z); addLight(x+off,cy+1,z,'#dff1ff',4); }
  }
  const hg=new THREE.BufferGeometry(); hg.setAttribute('position',new THREE.Float32BufferAttribute(hanger,3));
  g.add(new THREE.LineSegments(hg,new THREE.LineBasicMaterial({color:lc('#c6ccd2')})));
  for(let z=zt1-500; z<=zt2+500; z+=30){ addLight(x-12.5,deckY+4,z,'#fff0c8',6); addLight(x+12.5,deckY+4,z,'#fff0c8',6); }
  scene.add(g);
})();
/* ---- Kaikyo Yume Tower (Shimonoseki landmark) ---- */
if(STAGE.id==='kanmon') (function(){
  const x=-420, z=northZ(-420)-120, base=terrainH(x,z)-1;
  const t=new THREE.Mesh(new THREE.BoxGeometry(13,145,13), new THREE.MeshStandardMaterial({color:lc('#9fb4c4'),roughness:.15,metalness:.7}));
  t.position.set(x,base+72.5,z); scene.add(t);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(11,32,16), new THREE.MeshStandardMaterial({color:lc('#b8d2e6'),roughness:.05,metalness:.9}));
  ball.position.set(x,base+140,z); scene.add(ball);
  for(let a=0;a<12;a++){ addLight(x+Math.cos(a/12*6.283)*11.5,base+140,z+Math.sin(a/12*6.283)*11.5,'#9fe0ff',6); }
  addLight(x,base+156,z,'#ff3020',8);
})();

const lightMat = new THREE.ShaderMaterial({
  uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
  vertexShader:`uniform float uScale; attribute vec3 aCol; attribute float aSize; varying vec3 vCol;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(aSize*uScale/-mv.z,1.5,48.0); vCol=aCol; gl_Position=projectionMatrix*mv; }`,
  fragmentShader:`uniform float uNight; varying vec3 vCol;
    void main(){ float r=length(gl_PointCoord-0.5)*2.0; float a=exp(-r*r*4.0)+0.8*exp(-r*r*40.0); float on=smoothstep(0.25,0.85,uNight);
    gl_FragColor=vec4(vCol*a*on*1.6,1.0); }`
});
let streakMesh=null;
const reflMat = new THREE.ShaderMaterial({
  uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
  vertexShader: COMMON + `attribute vec4 aPos; attribute vec3 aCol; attribute float aSeed; varying vec2 vUv; varying vec3 vCol; varying float vSeed;
  void main(){
    vec2 L=aPos.xz; float lh=aPos.y;
    vec2 tc=cameraPosition.xz-L; float D=length(tc); vec2 dir=tc/max(D,1e-3);
    float ch=max(cameraPosition.y,1.0);
    vec2 cen=L+dir*(D*lh/(ch+lh));
    float len=min(D*0.5,14.0+lh*0.9+D*0.06);
    vec2 side=vec2(-dir.y,dir.x);
    float w=1.0+aPos.w*0.25+D*0.002;
    vec2 xz=cen+side*position.x*w+dir*(position.y-0.5)*len;
    vec3 n; vec3 d=wavesV(xz,uAmp,n);
    vec4 wp=vec4(xz.x+d.x,d.y+0.12,xz.y+d.z,1.0);
    vUv=vec2(position.x+0.5,position.y); vCol=aCol; vSeed=aSeed;
    gl_Position=projectionMatrix*viewMatrix*wp;
  }`,
  fragmentShader:`uniform float uTime; uniform float uNight; varying vec2 vUv; varying vec3 vCol; varying float vSeed;
  void main(){
    float ac=abs(vUv.x-0.5)*2.0; float al=vUv.y;
    float fl=(0.5+0.5*sin(al*38.0+uTime*2.2+vSeed*10.0))*(0.5+0.5*sin(al*13.0-uTime*1.3+vSeed*3.0));
    float a=(1.0-ac*ac)*smoothstep(0.0,0.2,al)*smoothstep(1.0,0.45,al)*(0.2+0.8*fl);
    gl_FragColor=vec4(vCol*a*smoothstep(0.25,0.85,uNight)*0.55,1.0);
  }`
});
function buildLights(){
  const n=lightPts.length, p=new Float32Array(n*3), c=new Float32Array(n*3), s=new Float32Array(n);
  lightPts.forEach((l,i)=>{ p[i*3]=l[0];p[i*3+1]=l[1];p[i*3+2]=l[2]; c[i*3]=l[3];c[i*3+1]=l[4];c[i*3+2]=l[5]; s[i]=l[6]; });
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3)); g.setAttribute('aCol',new THREE.BufferAttribute(c,3)); g.setAttribute('aSize',new THREE.BufferAttribute(s,1));
  const pts=new THREE.Points(g,lightMat); pts.frustumCulled=false; scene.add(pts);
  // reflections for lights near water
  const sel=lightPts.filter(l=>landD(l[0],l[2])<30);
  const base=new THREE.PlaneGeometry(1,1,1,6).translate(0,0.5,0);
  const ig=new THREE.InstancedBufferGeometry(); ig.index=base.index; ig.setAttribute('position',base.attributes.position);
  const ap=new Float32Array(sel.length*4), ac=new Float32Array(sel.length*3), as=new Float32Array(sel.length);
  sel.forEach((l,i)=>{ ap[i*4]=l[0]; ap[i*4+1]=l[1]; ap[i*4+2]=l[2]; ap[i*4+3]=l[6]; ac[i*3]=l[3]; ac[i*3+1]=l[4]; ac[i*3+2]=l[5]; as[i]=rnd()*6.28; });
  ig.setAttribute('aPos',new THREE.InstancedBufferAttribute(ap,4)); ig.setAttribute('aCol',new THREE.InstancedBufferAttribute(ac,3)); ig.setAttribute('aSeed',new THREE.InstancedBufferAttribute(as,1));
  ig.instanceCount=sel.length;
  const rm=new THREE.Mesh(ig,reflMat); rm.frustumCulled=false; rm.renderOrder=2; scene.add(rm); streakMesh=rm;
}

/* ============================================================
   Piers — Karato Pier 1 (gabled gangway) and Moji-ko (arched canopies)
   ============================================================ */
/* merge static child meshes of a group into one mesh per material (far fewer draw calls) */
function mergeGroup(root){
  root.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets=new Map(), remove=[];
  root.traverse(o=>{
    if(o===root || !o.isMesh || o.isInstancedMesh || o.userData.keep) return;
    let p=o.parent, skip=false; while(p && p!==root){ if(p.userData.keep) skip=true; p=p.parent; } if(skip) return;
    let g=o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for(const k of Object.keys(g.attributes)) if(!['position','normal','uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));
    if(!g.attributes.normal) g.computeVertexNormals();
    if(!g.attributes.uv) g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    if(!buckets.has(o.material)) buckets.set(o.material,[]);
    buckets.get(o.material).push(g); remove.push(o);
  });
  remove.forEach(o=>{ const kids=o.children.slice(); kids.forEach(k=>root.attach(k)); o.parent.remove(o); });
  buckets.forEach((gs,mat)=>{
    let n=0; gs.forEach(g=>n+=g.attributes.position.count);
    const P=new Float32Array(n*3), N=new Float32Array(n*3), T=new Float32Array(n*2); let off=0;
    gs.forEach(g=>{ P.set(g.attributes.position.array,off*3); N.set(g.attributes.normal.array,off*3); T.set(g.attributes.uv.array,off*2); off+=g.attributes.position.count; g.dispose(); });
    const mg=new THREE.BufferGeometry();
    mg.setAttribute('position',new THREE.BufferAttribute(P,3)); mg.setAttribute('normal',new THREE.BufferAttribute(N,3)); mg.setAttribute('uv',new THREE.BufferAttribute(T,2));
    mg.computeBoundingSphere();
    root.add(new THREE.Mesh(mg,mat));
  });
  return root;
}

const colliders=[];   // {x,z,hx,hz,ang}
const pontoons=[];
function box(w,h,d,mat,x,y,z,parent){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); (parent||scene).add(m); return m; }
function buildPier(P, style){
  const dir=P.dir, shore=P.shore, x=P.x;
  // pontoon (floats)
  const pon=new THREE.Group(); pon.position.set(x,0,P.pz); scene.add(pon);
  box(34,2.2,8,M.gray,0,0,0,pon);
  box(34,0.15,7.6,style==='karato'?M.wood:M.gray,0,1.15,0,pon);
  box(34,0.25,0.3,M.yellow,0,1.2,-dir*3.95,pon);
  box(34,0.25,0.3,M.yellow,0,1.2,dir*3.95,pon);
  for(let i=-16;i<=16;i+=2){ box(0.1,1.1,0.1,M.steel,i,1.75,-dir*3.7,pon); }
  box(34,0.08,0.08,M.steel,0,2.3,-dir*3.7,pon);
  P.fenders=[];
  const fm=new THREE.MeshStandardMaterial({color:lc('#1b1d1f'),roughness:.75});
  for(let i=-14;i<=14;i+=4){ const f=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,1.7,14),fm); f.position.set(i,0.45,dir*4.15); f.userData.keep=true; f.userData.sq=0; pon.add(f); P.fenders.push(f); }
  P.bollards=[];
  for(const bx of [-13,-4.5,4.5,13]){ const b=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,0.45,12),M.dark); b.position.set(bx,1.45,dir*3.45); pon.add(b);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.2,0.1,12),M.dark); cap.position.set(bx,1.7,dir*3.45); pon.add(cap); P.bollards.push(new THREE.Vector3(bx,1.62,dir*3.45)); }
  P.pon=pon;
  pontoons.push({g:pon, x, z:P.pz, ph:rnd()*6});
  colliders.push({x, z:P.pz, hx:17, hz:4.45, ang:0, fender:true, pier:P});
  // gangway from quay to pontoon
  const g0=shore, g1=P.pz-dir*4, len=Math.abs(g1-g0), gz=(g0+g1)/2, gx=x-8; P.gx=gx;
  const slope=Math.atan2(3.3-1.4,len);
  const gpiv=new THREE.Group(); gpiv.position.set(gx,3.3,g0); gpiv.rotation.x=dir*slope; scene.add(gpiv); P.gpiv=gpiv; P.glen=len;
  const gw=new THREE.Group(); gw.position.set(0,0,dir*len/2); gpiv.add(gw);
  box(3.6,0.35,len,M.steel,0,0,0,gw);
  box(3.2,0.05,len,style==='karato'?M.green:M.gray,0,0.2,0,gw);
  for(const s of [-1.75,1.75]) box(0.08,1.1,len,M.white,s,0.75,0,gw);
  colliders.push({x:gx, z:gz, hx:2.2, hz:len/2, ang:0});
  if(style==='karato'){
    // gabled roof over gangway + entrance frame with sign
    for(const s of [-1,1]){ const r=box(2.4,0.12,len,M.white,s*1.05,3.35,0,gw); r.rotation.z=-s*0.52; }
    for(let i=-len/2+2;i<=len/2-2;i+=5){ box(0.14,2.7,0.14,M.white,-1.8,1.6,i,gw); box(0.14,2.7,0.14,M.white,1.8,1.6,i,gw); }
    const fr=new THREE.Group(); fr.position.set(gx,3.3,shore+dir*1.5); scene.add(fr);
    box(0.4,5.2,0.4,M.white,-2.4,2.6,0,fr); box(0.4,5.2,0.4,M.white,2.4,2.6,0,fr);
    const gable=new THREE.Shape([new THREE.Vector2(-3.2,0),new THREE.Vector2(3.2,0),new THREE.Vector2(0,2.1)]);
    const gm=new THREE.Mesh(new THREE.ExtrudeGeometry(gable,{depth:0.4,bevelEnabled:false}),M.white); gm.position.set(0,6.1,-0.2); fr.add(gm);
    const numTex=textTexture([{t:'1',font:'900 150px "Chakra Petch",sans-serif',y:.55}],{w:256,h:256,bg:'#f3f5f6',fg:'#111'});
    const num=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.2),new THREE.MeshStandardMaterial({map:numTex,roughness:.6}));
    num.position.set(0,6.95,dir>0?0.22:-0.22); if(dir<0) num.rotation.y=Math.PI; fr.add(num);
    const signTex=textTexture([{t:P.sign[0],font:'900 44px "Zen Kaku Gothic New",sans-serif',y:.32},{t:P.sign[1],font:'700 38px "Chakra Petch",sans-serif',y:.76}],{w:640,h:160,bg:'#1c4ea6',fg:'#fff'});
    const tmat=new THREE.MeshStandardMaterial({map:signTex,roughness:.5,emissive:lc('#ffffff'),emissiveMap:signTex,emissiveIntensity:0});
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.8,1.2),tmat); sign.position.set(0,5.4,dir>0?0.25:-0.25); if(dir<0) sign.rotation.y=Math.PI; fr.add(sign);
    const sign2=sign.clone(); sign2.rotation.y=dir>0?Math.PI:0; sign2.position.z=-sign.position.z; fr.add(sign2);
    P.signMat=tmat;
    addLight(gx-2,8.6,shore+dir*2,'#fff4dc',5); addLight(gx+2,8.6,shore+dir*2,'#fff4dc',5);
  } else {
    // Moji-ko: arched canopies on pillars over the pontoon
    for(const cx of [-10,0,10]){
      const arc=new THREE.Mesh(new THREE.CylinderGeometry(4.3,4.3,9.4,24,1,true,-Math.PI/2,Math.PI),new THREE.MeshStandardMaterial({color:lc('#dfe3e6'),roughness:.4,metalness:.3,side:THREE.DoubleSide}));
      arc.rotation.z=Math.PI/2; arc.scale.set(1,1,0.35); arc.position.set(cx,4.6,0); pon.add(arc);
      for(const s of [-1,1]) for(const t of [-3.8,3.8]){ const pl=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,3.6,12),M.offwhite); pl.position.set(cx+t,2.9,s*2.6); pon.add(pl); }
    }
    const roof=box(4.6,0.25,len,M.offwhite,0,2.9,0,gw);
    for(let i=-len/2+2;i<=len/2-2;i+=6){ box(0.18,2.6,0.18,M.offwhite,-2,1.5,i,gw); box(0.18,2.6,0.18,M.offwhite,2,1.5,i,gw); }
    const signTex=textTexture([{t:P.sign[0],font:'900 50px "Zen Kaku Gothic New",sans-serif',y:.34},{t:P.sign[1],font:'700 30px "Zen Kaku Gothic New",sans-serif',y:.76}],{w:640,h:160,bg:'#f4f6f8',fg:'#1c3b6e'});
    const tmat=new THREE.MeshStandardMaterial({map:signTex,roughness:.5,emissive:lc('#ffffff'),emissiveMap:signTex,emissiveIntensity:0});
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5),tmat);
    sign.position.set(gx,5.2,shore+dir*6); sign.rotation.y = dir>0?Math.PI:0; scene.add(sign);
    const sign2=sign.clone(); sign2.rotation.y = dir>0?0:Math.PI; sign2.position.z += 0.05*(dir>0?1:-1); scene.add(sign2);
    box(0.3,5.2,0.3,M.offwhite,gx-3.2,2.6+3.3,shore+dir*6.1); box(0.3,5.2,0.3,M.offwhite,gx+3.2,2.6+3.3,shore+dir*6.1);
    P.signMat=tmat;
    // yellow quay edge
    for(let i=-40;i<=40;i+=6) box(4,0.2,0.6,M.yellow,x+i,3.4,shore-dir*0.8);
    addLight(x-12,6.6,P.pz,'#fff4dc',5); addLight(x+12,6.6,P.pz,'#fff4dc',5);
  }
  mergeGroup(pon); mergeGroup(gw); pon.traverse(o=>{ if(o.isMesh){ o.receiveShadow=true; o.castShadow=true; } });
  // berth marker (visible guide on the water)
  const mk=new THREE.Mesh(new THREE.RingGeometry(0.5,1,4,1),new THREE.MeshBasicMaterial({color:0x40ffb0,transparent:true,opacity:.5,depthWrite:false,fog:false}));
  P.marker=new THREE.Group();
  const frame=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-8-SHIP_L/2,0,-SHIP_B/2-0.5),new THREE.Vector3(8+SHIP_L/2,0,-SHIP_B/2-0.5),new THREE.Vector3(8+SHIP_L/2,0,SHIP_B/2+0.5),new THREE.Vector3(-8-SHIP_L/2,0,SHIP_B/2+0.5)]),new THREE.LineBasicMaterial({color:0x40ffb0,transparent:true,opacity:.55,fog:false}));
  P.marker.add(frame);
  const beacon=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,30,8,1,true),new THREE.MeshBasicMaterial({color:0x40ffb0,transparent:true,opacity:.2,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
  beacon.position.y=15; P.marker.add(beacon);
  P.marker.position.set(P.bx,0.4,P.bz); scene.add(P.marker);
}
for(const k in PIERS) buildPier(PIERS[k],PIERS[k].style);
/* ============================================================
   Harbour dressing: promenades, railings, lamp posts, trees,
   benches, quay fenders, ticket offices, moored boats, landmarks
   ============================================================ */
const TREES=[];
function shoreZ(P,x,d){ return (P.dir>0?northZ(x):southZ(x)) - P.dir*d; }
function shoreRot(P,x){ const f=P.dir>0?northZ:southZ; return -Math.atan((f(x+4)-f(x-4))/8); }
function buildHarbor(P,style){
  const g=new THREE.Group(), kanmon=STAGE.id==='kanmon'; scene.add(g);
  const pave=new THREE.MeshStandardMaterial({color:lc(style==='moji'?'#b9a48e':'#a99f93'),roughness:.9});
  const pave2=new THREE.MeshStandardMaterial({color:lc('#8c8378'),roughness:.9});
  const railM=new THREE.MeshStandardMaterial({color:lc(style==='moji'?'#2d3a33':'#d5d9dc'),roughness:.45,metalness:.5});
  const wood=new THREE.MeshStandardMaterial({color:lc('#8a6a4c'),roughness:.85});
  const tire=new THREE.MeshStandardMaterial({color:lc('#141516'),roughness:.8});
  const X0=style==='karato'?P.x-50:P.x-240, X1=style==='karato'?P.x+180:P.x+62;
  const put=(m,x,d,y,rotExtra)=>{ m.position.set(x,y,shoreZ(P,x,d)); m.rotation.y=shoreRot(P,x)+(rotExtra||0); g.add(m); return m; };
  const gangGap=x=>Math.abs(x-P.gx)<3.5;
  // paved promenade with a darker tile band
  for(let x=X0;x<X1;x+=12){ const xc=x+6; const y=terrainH(xc,shoreZ(P,xc,8));
    put(new THREE.Mesh(new THREE.BoxGeometry(12.3,0.3,15),pave),xc,8,Math.max(3.2,y)+0.05);
    put(new THREE.Mesh(new THREE.BoxGeometry(12.3,0.31,1.2),pave2),xc,1.2,3.36); }
  // quay railing
  for(let x=X0;x<X1;x+=2.4){ if(gangGap(x)||gangGap(x+2.4)) continue;
    put(new THREE.Mesh(new THREE.BoxGeometry(0.07,1.1,0.07),railM),x,0.5,3.95);
    put(new THREE.Mesh(new THREE.BoxGeometry(2.45,0.06,0.06),railM),x+1.2,0.5,4.5);
    put(new THREE.Mesh(new THREE.BoxGeometry(2.45,0.04,0.04),railM),x+1.2,0.5,4.0); }
  // tyre fenders and ladders on the quay wall
  for(let x=X0;x<X1;x+=9){ const t=new THREE.Mesh(new THREE.TorusGeometry(0.45,0.2,8,14),tire); put(t,x,-0.25,1.6); }
  for(let x=X0+20;x<X1;x+=60){ for(let k=0;k<6;k++) put(new THREE.Mesh(new THREE.BoxGeometry(0.5,0.05,0.05),railM),x,-0.12,0.2+k*0.5);
    for(const s of [-0.25,0.25]) put(new THREE.Mesh(new THREE.BoxGeometry(0.05,3.2,0.05),railM),x+s,-0.12,1.7); }
  // benches, planters, bollards
  P.benches=[];
  for(let x=X0+8;x<X1;x+=16){ if(Math.abs(x-P.gx)<10) continue; P.benches.push(x);
    put(new THREE.Mesh(new THREE.BoxGeometry(1.8,0.08,0.5),wood),x,5,3.75);
    put(new THREE.Mesh(new THREE.BoxGeometry(1.8,0.45,0.06),wood),x,5.25,4.0);
    for(const s of [-0.7,0.7]) put(new THREE.Mesh(new THREE.BoxGeometry(0.08,0.42,0.45),railM),x+s,5,3.5); }
  for(let x=X0+4;x<X1;x+=14){ if(gangGap(x)) continue; const b=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.24,0.6,10),M.dark); put(b,x,1.0,3.6); }
  // trees along the back of the promenade
  for(let x=X0+5;x<X1;x+=11+rnd()*5){ if(Math.abs(x-P.gx)<9) continue; const d=13+rnd()*3; TREES.push([x,shoreZ(P,x,d),terrainH(x,shoreZ(P,x,d)),0.8+rnd()*0.5]); }
  // ticket office at the head of the gangway
  const offX=style==='karato'?P.gx-16:P.gx+11; const off=new THREE.Group(); off.position.set(offX,3.3,shoreZ(P,offX,11)); off.rotation.y=shoreRot(P,offX);
  box(12,3.4,6,M.white,0,1.7,0,off); box(12.6,0.3,6.6,M.offwhite,0,3.55,0,off);
  box(11,1.9,0.05,new THREE.MeshStandardMaterial({color:lc('#1d2a33'),roughness:.08,metalness:.8}),0,1.45,P.dir*3.02,off);
  box(12.02,0.45,6.02,new THREE.MeshStandardMaterial({color:lc('#1d4fa6'),roughness:.5}),0,2.9,0,off);
  const tsign=new THREE.Mesh(new THREE.PlaneGeometry(6,0.42),new THREE.MeshStandardMaterial({map:textTexture([{t:P.office,font:'900 54px "Zen Kaku Gothic New",sans-serif',y:.55}],{w:768,h:96,bg:'#1d4fa6',fg:'#ffffff'}),roughness:.5}));
  tsign.position.set(0,2.9,P.dir*3.04); if(P.dir<0) tsign.rotation.y=Math.PI; off.add(tsign);
  g.add(off);
  // small craft moored along the quay
  const boat=(x,len,col)=>{ const bg=new THREE.Group(); const sh=new THREE.Shape(); sh.moveTo(-len/2,-1.2); sh.lineTo(len/2-2,-1.2); sh.quadraticCurveTo(len/2,-1.2,len/2,0); sh.quadraticCurveTo(len/2,1.2,len/2-2,1.2); sh.lineTo(-len/2,1.2); sh.closePath();
    const hm=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:1.7,bevelEnabled:true,bevelThickness:.15,bevelSize:.15,bevelSegments:2}).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:lc(col),roughness:.4})); hm.position.y=-0.6; bg.add(hm);
    box(len*0.28,1.5,1.9,M.white,-len*0.05,1.85,0,bg); box(len*0.28+0.02,0.5,1.92,M.glass,-len*0.05,2.2,0,bg);
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,2.6,6),M.steel); mast.position.set(-len*0.05,3.6,0); bg.add(mast);
    mergeGroup(bg); bg.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
    bg.position.set(x,0,shoreZ(P,x,-2.6)); bg.rotation.y=shoreRot(P,x); scene.add(bg); moored.push({g:bg,x,z:bg.position.z,ph:rnd()*6}); };
  if(style==='karato'){ boat(P.x+62,11,'#f1f1ee'); boat(P.x+95,9,'#2a5c8f'); boat(P.x+132,13,'#f1f1ee'); boat(P.x+168,8,'#b23b30'); }
  else { boat(P.x-95,11,'#f1f1ee'); boat(P.x-128,9,'#2a5c8f'); boat(P.x-170,12,'#f1f1ee'); if(kanmon){ boat(372,8,'#b23b30'); boat(398,10,'#f1f1ee'); boat(428,7,'#2a5c8f'); } }
  // landmarks
  if(kanmon && style==='karato'){
    const kw=new THREE.Group(); const z=shoreZ(P,-40,40); kw.position.set(-40,terrainH(-40,z),z); kw.rotation.y=shoreRot(P,-40);
    box(64,11,24,new THREE.MeshStandardMaterial({color:lc('#c9a77c'),roughness:.8}),0,5.5,0,kw);
    box(64.4,3,24.4,M.glass,0,7,0,kw); box(66,0.6,26,M.offwhite,0,11.2,0,kw); g.add(kw);
    const aq=new THREE.Group(); const z2=northZ(-420)-55; aq.position.set(-420,terrainH(-420,z2),z2);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(18,24,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:lc('#9fc4d6'),roughness:.1,metalness:.7})); dome.scale.y=0.6; dome.position.y=6; aq.add(dome);
    box(56,6,38,M.white,0,3,0,aq); g.add(aq);
  } else if(kanmon){
    const st=new THREE.Group(); const zs=shoreZ(P,640,165); st.position.set(640,terrainH(640,zs),zs); st.rotation.y=shoreRot(P,640);
    const cream=new THREE.MeshStandardMaterial({color:lc('#eadfc4'),roughness:.8}), roofM=new THREE.MeshStandardMaterial({color:lc('#5d7c73'),roughness:.6,metalness:.2});
    box(48,9,12,cream,0,4.5,0,st); box(14,12,14,cream,0,6,0,st);
    const hip=(w,d,h,x,y)=>{ const c=new THREE.Mesh(new THREE.ConeGeometry(0.7071,1,4),roofM); c.rotation.y=Math.PI/4; c.scale.set(w,h,d); c.position.set(x,y+h/2,0); st.add(c); };
    hip(48.5,12.5,4.5,0,9); hip(14.5,14.5,6,0,12);
    for(let i=-21;i<=21;i+=3.2) box(1.4,2.4,0.1,M.glass,i,4.8,P.dir*-6.02,st);
    g.add(st);
    const cu=new THREE.Group(); const zc=shoreZ(P,520,40); cu.position.set(520,terrainH(520,zc),zc); cu.rotation.y=shoreRot(P,520);
    const brickM=new THREE.MeshStandardMaterial({color:lc('#a1553d'),roughness:.85});
    box(26,9,13,brickM,0,4.5,0,cu); const r2=new THREE.Mesh(new THREE.ConeGeometry(0.7071,1,4),new THREE.MeshStandardMaterial({color:lc('#5b5f63'),roughness:.7})); r2.rotation.y=Math.PI/4; r2.scale.set(26.5,4,13.5); r2.position.y=11; cu.add(r2);
    for(let i=-11;i<=11;i+=2.75) for(const y of [2.6,6.4]) box(1.1,1.9,0.1,M.glass,i,y,P.dir*6.52,cu);
    g.add(cu);
  }
  const board=(txt,x,d,y,w)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w*0.18),new THREE.MeshStandardMaterial({map:textTexture([{t:txt,font:'900 70px "Zen Kaku Gothic New",sans-serif',y:.55}],{w:720,h:130,bg:'#f4f1ea',fg:'#20324f'}),roughness:.6,emissive:lc('#ffffff'),emissiveIntensity:0}));
    m.userData.keep=true; m.position.set(x,y,shoreZ(P,x,d)); m.rotation.y=shoreRot(P,x)+(P.dir>0?0:Math.PI); scene.add(m); SIGNS.push(m); };
  if(kanmon && style==='karato'){ board('カモンワーフ',-40,27.6,10,16); board('しものせき水族館 海響館',-420,-120,9,22); board('唐戸市場',150,17.3,10.5,14); board('下関グランドホテル',-150,67.8,40,16); }
  else if(kanmon){ board('門司港駅',640,158,15,12); board('旧門司税関',520,33.3,10,12); board('ブルーウィングもじ',400,-8,9.5,14); }
  mergeGroup(g);
  g.traverse(o=>{ if(o.isMesh){ o.receiveShadow=true; o.castShadow=true; } });
}
const SIGNS=[];
/* Blue Wing Moji: two blue bascule leaves that lift every couple of minutes */
const blueWing={ leaves:[], up:0, zm:0 };
function buildBlueWing(){
  const zm=southZ0(400)+1; blueWing.zm=zm;
  const blue=new THREE.MeshStandardMaterial({color:lc('#2a63c9'),roughness:.45,metalness:.3});
  const white=new THREE.MeshStandardMaterial({color:lc('#eef2f4'),roughness:.4});
  for(const [px,dir] of [[343,1],[457,-1]]){
    const piv=new THREE.Group(); piv.position.set(px,4.2,zm); scene.add(piv);
    const leaf=new THREE.Group(); piv.add(leaf);
    box(57,0.9,4.4,blue,dir*28.5,0,0,leaf); box(57,0.6,0.25,blue,dir*28.5,0.9,2.1,leaf); box(57,0.6,0.25,blue,dir*28.5,0.9,-2.1,leaf);
    for(let i=2;i<56;i+=3){ box(0.06,1.1,0.06,white,dir*i,1.0,2.25,leaf); box(0.06,1.1,0.06,white,dir*i,1.0,-2.25,leaf); }
    box(57,0.06,0.06,white,dir*28.5,1.55,2.25,leaf); box(57,0.06,0.06,white,dir*28.5,1.55,-2.25,leaf);
    mergeGroup(leaf); leaf.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
    box(6,5,7,new THREE.MeshStandardMaterial({color:lc('#9aa3aa'),roughness:.8}),px-dir*2,1.5,zm,scene);
    blueWing.leaves.push({piv,dir});
  }
  colliders.push({x:400,z:zm,hx:57,hz:2.4,ang:0,active:()=>blueWing.up<0.6});
}
function updateBlueWing(t){ const cyc=t%150; const target=(cyc>100&&cyc<140)?1:0; blueWing.up+=(target-blueWing.up)*0.004; blueWing.up=clamp(blueWing.up,0,1);
  blueWing.leaves.forEach(l=>{ l.piv.rotation.z=l.dir*blueWing.up*1.05; }); }
const moored=[];
function buildLampPosts(){
  const g=new THREE.Group(); const m=new THREE.MeshStandardMaterial({color:lc('#3a4046'),roughness:.5,metalness:.6});
  for(const l of lightPts){ if(l[1]!==8.5) continue; const y0=terrainH(l[0],l[2]);
    const p=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.11,8.6-y0+0.2,6),m); p.position.set(l[0],(8.6+y0)/2,l[2]); g.add(p);
    const h=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.2,0.5),m); h.position.set(l[0],8.75,l[2]); g.add(h); }
  scene.add(g); mergeGroup(g);
}
function buildTrees(){
  const n=TREES.length; if(!n) return;
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16,0.24,3.2,6).translate(0,1.6,0),new THREE.MeshStandardMaterial({color:lc('#5a4636'),roughness:.9}),n);
  const crown=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:lc('#ffffff'),roughness:.85,flatShading:true}),n*2);
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), p=new THREE.Vector3(), c=new THREE.Color();
  TREES.forEach(([x,z,y,sc],i)=>{ m4.compose(p.set(x,y,z),q.identity(),s.set(sc,sc,sc)); trunk.setMatrixAt(i,m4);
    for(let k=0;k<2;k++){ m4.compose(p.set(x+(k?0.8:-0.5)*sc,y+(3.6+k*0.9)*sc,z+(k?0.4:-0.3)*sc),q.identity(),s.set(2.3*sc*(k?0.8:1),2.0*sc*(k?0.8:1),2.3*sc*(k?0.8:1))); crown.setMatrixAt(i*2+k,m4);
      c.copy(lc(((STAGE.forest&&STAGE.forest.colors)||['#3f6b35','#4d7a3a','#365e30','#5a8443'])[(i+k)%4])); crown.setColorAt(i*2+k,c); } });
  trunk.castShadow=crown.castShadow=true; scene.add(trunk,crown);
}
/* seagulls: instanced bodies and wings, flapping and circling over the harbours */
const GULLS=[]; let gullBody=null, gullWL=null, gullWR=null;
function buildGulls(){
  const N=16;
  const wing=new THREE.BufferGeometry(); wing.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0.12, 0,0,-0.12, 0.05,0,-0.5, 0.05,0,-0.5, 0.25,0,-0.9, 0,0,0.12],3)); wing.computeVertexNormals();
  const wr=wing.clone(); wr.scale(1,1,-1);
  const wm=new THREE.MeshStandardMaterial({color:lc('#f2f3f1'),roughness:.8,side:THREE.DoubleSide});
  gullWL=new THREE.InstancedMesh(wing,wm,N); gullWR=new THREE.InstancedMesh(wr,wm,N);
  gullBody=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06,0.1,0.5,5).rotateZ(Math.PI/2),wm,N);
  for(let i=0;i<N;i++){ const P=Object.values(PIERS)[i<8?0:1]; GULLS.push({cx:P.x+(rnd()-.5)*120,cz:P.pz+(rnd()-.5)*80,r:15+rnd()*35,h:10+rnd()*18,sp:(0.15+rnd()*0.15)*(rnd()<.5?1:-1),ph:rnd()*6.28,fl:rnd()*6}); }
  [gullWL,gullWR,gullBody].forEach(m=>{ m.frustumCulled=false; scene.add(m); });
}
const _gm=new THREE.Matrix4(), _gq=new THREE.Quaternion(), _ge=new THREE.Euler(), _gp=new THREE.Vector3(), _gs=new THREE.Vector3(1,1,1);
function updateGulls(t){
  if(!gullBody) return;
  GULLS.forEach((g,i)=>{ const a=g.ph+t*g.sp; const x=g.cx+Math.cos(a)*g.r, z=g.cz+Math.sin(a)*g.r, y=g.h+Math.sin(t*0.7+g.ph)*2;
    const yaw=Math.atan2(-Math.cos(a)*g.sp,-Math.sin(a)*g.sp); const bank=-Math.sign(g.sp)*0.3;
    const flap=Math.sin(t*6+g.fl)*(Math.sin(t*0.4+g.fl)>0.2?0.55:0.08);
    _gp.set(x,y,z); _ge.set(bank,yaw,0,'YXZ'); _gq.setFromEuler(_ge); _gm.compose(_gp,_gq,_gs); gullBody.setMatrixAt(i,_gm);
    _ge.set(bank+flap,yaw,0,'YXZ'); _gq.setFromEuler(_ge); _gm.compose(_gp,_gq,_gs); gullWL.setMatrixAt(i,_gm);
    _ge.set(bank-flap,yaw,0,'YXZ'); _gq.setFromEuler(_ge); _gm.compose(_gp,_gq,_gs); gullWR.setMatrixAt(i,_gm); });
  gullBody.instanceMatrix.needsUpdate=gullWL.instanceMatrix.needsUpdate=gullWR.instanceMatrix.needsUpdate=true;
}


/* ============================================================
   Cargo ships transiting the strait
   ============================================================ */
function buildCargo(len,beam,hullHex){
  const g=new THREE.Group();
  const sh=new THREE.Shape(); sh.moveTo(-len/2,-beam/2); sh.lineTo(len/2-beam*1.3,-beam/2); sh.quadraticCurveTo(len/2,-beam/2,len/2,0); sh.quadraticCurveTo(len/2,beam/2,len/2-beam*1.3,beam/2); sh.lineTo(-len/2,beam/2); sh.closePath();
  const lower=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:7.5,bevelEnabled:false}).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:lc('#8e2a22'),roughness:.7})); lower.position.y=-7; g.add(lower);
  const upper=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:8,bevelEnabled:false}).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:lc(hullHex),roughness:.6})); upper.position.y=0.5; g.add(upper);
  const sup=box(12,14,beam*0.9,M.white,-len/2+9,15,0,g);
  box(8,4,beam*0.95,M.white,-len/2+10,23.5,0,g);
  box(3,6,3,M.dark,-len/2+5,24,0,g);
  const cols=['#2b6cb0','#c0392b','#e0a100','#2f855a','#6b7280','#8b4a9c','#dd6b20'].map(lc);
  const cm=new THREE.InstancedMesh(new THREE.BoxGeometry(12,2.6,2.44),new THREE.MeshStandardMaterial({roughness:.7}), 400);
  let n=0; const m4=new THREE.Matrix4();
  for(let x=-len/2+20; x<len/2-beam*1.4; x+=12.8){ const rows=Math.floor(beam/2.6)-1; for(let r=0;r<rows;r++){ const stack=1+((rnd()*4)|0); for(let k=0;k<stack;k++){ if(n>=400) break; m4.makeTranslation(x,8.5+1.3+k*2.6,(r-(rows-1)/2)*2.6); cm.setMatrixAt(n,m4); cm.setColorAt(n,cols[(rnd()*cols.length)|0]); n++; } } }
  cm.count=n; g.add(cm);
  const l1=navLight(0xffffff,5,false); l1.position.set(-len/2+5,28,0); g.add(l1);
  const l2=navLight(0xffffff,5,false); l2.position.set(len/2-8,14,0); g.add(l2);
  return g;
}
const cargos=STAGE.cargos.map(c=>{ const g=buildCargo(c.len,c.beam,c.hex); g.rotation.order='YZX'; scene.add(g); return Object.assign(c,{g}); });
for(const k in PIERS) buildHarbor(PIERS[k],PIERS[k].style);
if(STAGE.id==='kanmon') buildBlueWing();
/* ============================================================
   Proper harbour works: breakwaters with tetrapods & lighthouses,
   a second pontoon, a fishing-boat finger pier, a cargo wharf with
   gantry cranes, containers, warehouses and a moored freighter.
   ============================================================ */
const BW=[], TETRA=[], EXTRA_PONTOONS=[];
const concreteM=new THREE.MeshStandardMaterial({color:lc('#b7b5ad'),roughness:.95});
function makeBoat(x,z,rot,len,col,cabinCol){
  const bg=new THREE.Group(); const b=len/4.6; const sh=new THREE.Shape(); sh.moveTo(-len/2,-b); sh.lineTo(len/2-len*0.2,-b); sh.quadraticCurveTo(len/2,-b,len/2,0); sh.quadraticCurveTo(len/2,b,len/2-len*0.2,b); sh.lineTo(-len/2,b); sh.closePath();
  const hm=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:len*0.15,bevelEnabled:true,bevelThickness:.12,bevelSize:.12,bevelSegments:2}).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:lc(col),roughness:.4})); hm.position.y=-0.6; bg.add(hm);
  box(len*0.26,len*0.13,b*1.5,new THREE.MeshStandardMaterial({color:lc(cabinCol||'#f3f4f2'),roughness:.4}),-len*0.12,len*0.15+0.1,0,bg); box(len*0.26+0.02,len*0.045,b*1.52,M.glass,-len*0.12,len*0.2,0,bg);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,len*0.25,6),M.steel); mast.position.set(-len*0.12,len*0.33,0); bg.add(mast);
  mergeGroup(bg); bg.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
  bg.position.set(x,0,z); bg.rotation.y=rot; scene.add(bg); moored.push({g:bg,x,z,ph:rnd()*6}); return bg;
}
function breakwater(pts,lh){
  BW.push(pts);
  const g=new THREE.Group(); scene.add(g);
  for(let i=0;i<pts.length-1;i++){
    const [x0,z0]=pts[i],[x1,z1]=pts[i+1], dx=x1-x0, dz=z1-z0, len=Math.hypot(dx,dz), a=Math.atan2(-dz,dx), cx=(x0+x1)/2, cz=(z0+z1)/2;
    const nx=Math.sin(a), nz=Math.cos(a), sd=Math.sign(-cz*nz-0.0001)||1; // sea side faces the middle of the strait
    const b=new THREE.Mesh(new THREE.BoxGeometry(len+8,10,8),concreteM); b.position.set(cx,-1.6,cz); b.rotation.y=a; g.add(b);
    const w=new THREE.Mesh(new THREE.BoxGeometry(len+8,1.7,1.1),concreteM); w.position.set(cx+nx*sd*3.4,4.2,cz+nz*sd*3.4); w.rotation.y=a; g.add(w);
    for(let t=-len/2-2;t<=len/2+2;t+=2.1) for(const row of [5.6,7.6]){ const px=cx+Math.cos(a)*t+nx*sd*row, pz=cz-Math.sin(a)*t+nz*sd*row; TETRA.push([px,(row>6?-0.6:0.6)+rnd()*0.6,pz]); }
    colliders.push({x:cx,z:cz,hx:(len+8)/2,hz:9,ang:a});
  }
  if(lh){ const [x,z]=pts[pts.length-1]; const col=lh==='red'?lc('#c8272a'):lc('#f2f2ee');
    const tm=new THREE.MeshStandardMaterial({color:col,roughness:.5});
    const tw=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.5,10,16),tm); tw.position.set(x,3.5+5,z); g.add(tw);
    const gal=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,0.25,16),M.dark); gal.position.set(x,13.6,z); g.add(gal);
    const lan=new THREE.Mesh(new THREE.CylinderGeometry(0.75,0.75,1.3,12),M.glass); lan.position.set(x,14.4,z); g.add(lan);
    const cap=new THREE.Mesh(new THREE.ConeGeometry(0.95,0.9,12),tm); cap.position.set(x,15.5,z); g.add(cap);
    addLight(x,14.4,z,lh==='red'?'#ff2a1a':'#2aff5a',9); }
  mergeGroup(g); g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
}
function smallPontoon(x,north,boatLen,boatCol,label){
  const dir=north?1:-1, shore=north?northZ(x):southZ(x), pz=shore+dir*34;
  const g=new THREE.Group(); scene.add(g);
  box(24,2.0,6,M.gray,x,0.2,pz,g); box(24,0.12,5.6,M.wood,x,1.25,pz,g); box(24,0.2,0.25,M.yellow,x,1.3,pz+dir*2.9,g);
  for(let i=-10;i<=10;i+=4){ const f=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,1.5,10),M.dark); f.position.set(x+i,0.4,pz+dir*3.2); g.add(f); }
  const len=Math.abs(pz-dir*3-shore), gz=(shore+pz-dir*3)/2;
  const gw=box(3,0.3,len,M.steel,x-6,2.3,gz,g); gw.rotation.x=dir*Math.atan2(2.0,len);
  for(const s of [-1.4,1.4]){ const r=box(0.07,1.0,len,M.white,x-6+s,3.0,gz,g); r.rotation.x=gw.rotation.x; }
  box(5,2.6,3,M.white,x+6,2.6,pz,g); box(5.4,0.2,3.4,new THREE.MeshStandardMaterial({color:lc('#1d4fa6')}),x+6,4.0,pz,g);
  mergeGroup(g); g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  colliders.push({x,z:pz,hx:12.5,hz:3.4,ang:0}); colliders.push({x:x-6,z:gz,hx:1.8,hz:len/2,ang:0});
  EXTRA_PONTOONS.push({x,z:pz});
  if(boatLen){ const bz=pz+dir*(3.4+boatLen/9); makeBoat(x,bz,0,boatLen,boatCol,'#f3f4f2'); colliders.push({x,z:bz,hx:boatLen/2,hz:boatLen/8,ang:0}); }
  if(label){ const m=new THREE.Mesh(new THREE.PlaneGeometry(4.6,0.5),new THREE.MeshStandardMaterial({map:textTexture([{t:label,font:'900 60px "Zen Kaku Gothic New",sans-serif',y:.55}],{w:600,h:66,bg:'#1d4fa6',fg:'#ffffff'}),roughness:.5}));
    m.position.set(x+6,4.0,pz+dir*1.72); if(dir<0) m.rotation.y=Math.PI; scene.add(m); }
}
function fingerPier(x,z0,len,dirZ,boats){
  const g=new THREE.Group(); scene.add(g); const zc=z0+dirZ*len/2;
  box(2.6,0.35,len,M.wood,x,1.1,zc,g);
  for(let t=0;t<=len;t+=6) for(const s of [-1.1,1.1]){ const p=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,5,8),concreteM); p.position.set(x+s,-1.2,z0+dirZ*t); g.add(p); }
  mergeGroup(g); colliders.push({x,z:zc,hx:1.5,hz:len/2,ang:0});
  const cols=['#f2f2ee','#e9eef2','#2c5d93','#f2f2ee','#b23b30','#f2f2ee','#3c7a57'];
  for(let i=0;i<boats;i++){ const t=6+i*7.2; if(t>len-3) break; for(const s of [-1,1]){ const L=7+rnd()*3; makeBoat(x+s*(1.6+L/2),z0+dirZ*t,s>0?Math.PI:0,L,cols[(i*2+(s>0?1:0))%cols.length]); } }
  colliders.push({x:x+6.5,z:zc,hx:5,hz:len/2,ang:0}); colliders.push({x:x-6.5,z:zc,hx:5,hz:len/2,ang:0});
}
function cargoWharf(){
  const red=new THREE.MeshStandardMaterial({color:lc('#c43b2d'),roughness:.55}), wh=new THREE.MeshStandardMaterial({color:lc('#eef0f0'),roughness:.55});
  const g=new THREE.Group(); scene.add(g);
  for(const cx of [-360,-250]){ const zq=southZ(cx), y0=3.3;
    for(const dx of [-7,7]) for(const dz of [4,20]){ box(1.4,30,1.4,(dx<0)?red:wh,cx+dx,y0+15,zq+dz,g); }
    box(16,2.2,19,red,cx,y0+30,zq+12,g); box(3,2,64,wh,cx,y0+33,zq-8,g); box(8,4,7,wh,cx,y0+35,zq+12,g);
    for(let k=0;k<5;k++) box(0.25,0.25,24-k*4,M.dark,cx+(k%2?1:-1)*1.2,y0+31.5+k*0.2,zq-20,g); }
  for(let x=-410;x<-140;x+=45){ const z=southZ(x)+85; box(40,11,26,new THREE.MeshStandardMaterial({color:lc(rnd()<.5?'#9fb3c0':'#c9c3b4'),roughness:.8}),x+20,terrainH(x+20,z)+5.5,z,g); }
  mergeGroup(g); g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  const cols=['#2b6cb0','#c0392b','#e0a100','#2f855a','#6b7280','#8b4a9c','#dd6b20','#b7c3cc'].map(lc);
  const cm=new THREE.InstancedMesh(new THREE.BoxGeometry(12,2.6,2.44),new THREE.MeshStandardMaterial({roughness:.7}),420); let n=0; const m4=new THREE.Matrix4();
  for(let x=-415;x<-140;x+=13) for(let r=0;r<8;r++){ const stack=1+((rnd()*3.2)|0); for(let k=0;k<stack&&n<420;k++){ const z=southZ(x)+32+r*2.7; m4.makeTranslation(x,terrainH(x,z)+1.3+k*2.6,z); cm.setMatrixAt(n,m4); cm.setColorAt(n,cols[(rnd()*cols.length)|0]); n++; } }
  cm.count=n; cm.castShadow=true; scene.add(cm);
  const fr=buildCargo(105,18,'#2d3b4a'); fr.rotation.order='YZX'; const fz=southZ(-300)-12; fr.position.set(-300,0,fz); scene.add(fr);
  moored.push({g:fr,x:-300,z:fz,ph:1,big:true}); colliders.push({x:-300,z:fz,hx:53,hz:10,ang:0});
}
function buildTetrapods(){
  if(!TETRA.length) return;
  const geo=new THREE.TetrahedronGeometry(1.35,0);
  const im=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({color:lc('#a9a79f'),roughness:.95,flatShading:true}),TETRA.length);
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3(1,1,1), p=new THREE.Vector3();
  TETRA.forEach(([x,y,z],i)=>{ e.set(rnd()*6.28,rnd()*6.28,rnd()*6.28); q.setFromEuler(e); m4.compose(p.set(x,y,z),q,s); im.setMatrixAt(i,m4); });
  im.castShadow=im.receiveShadow=true; scene.add(im);
}
function buildHarbourWorks(){
  // Karato: breakwater off the aquarium headland (red light), pier No.2, fishing boats off the market
  const hz=northZ(-300);
  breakwater([[-300,hz-4],[-300,hz+62],[-178,hz+96]],'red');
  smallPontoon(-82,true,17,'#1f4f9a','唐戸 2号桟橋');
  fingerPier(122,northZ(122)+1,58,1,6);
  // Moji-ko: breakwater west of the pier (white tower, green light), Kaikyo Plaza, pier for sightseeing boats
  const mz=southZ(30);
  breakwater([[30,mz+4],[30,mz-78],[148,mz-104]],'white');
  smallPontoon(90,false,15,'#f2f2ee','海峡クルーズ のりば');
  // Moji west: cargo wharf with gantry cranes, containers, warehouses and a moored freighter
  cargoWharf();
  buildTetrapods();
}

if(STAGE.id==='kanmon') buildHarbourWorks();
// forests along natural shores
if(STAGE.forest){ const F=STAGE.forest;
  for(let i=0;i<F.n;i++){ const x=F.x[0]+rnd()*(F.x[1]-F.x[0]), d=F.d[0]+Math.pow(rnd(),1.5)*(F.d[1]-F.d[0]), z=rnd()<.5?northZ(x)-d:southZ(x)+d;
    if(Object.values(PIERS).some(p=>Math.abs(x-p.x)<70 && d<45)) continue;
    TREES.push([x,z,terrainH(x,z),F.size*(0.7+rnd()*0.9)]); } }
buildLampPosts(); buildTrees(); buildGulls();

/* ---- lateral buoys ---- */
const buoys=[];
STAGE.buoys.forEach(([x,z,c])=>{
  const g=new THREE.Group(); const mat=c==='red'?M.red:M.green;
  const body=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.4,2.2,14),mat); body.position.y=0.6; g.add(body);
  const top=new THREE.Mesh(c==='red'?new THREE.CylinderGeometry(.6,.6,1.6,10):new THREE.ConeGeometry(.9,1.8,10),mat); top.position.y=2.6; g.add(top);
  const l=navLight(c==='red'?0xff3b30:0x3bff7a,4); l.position.y=4; g.add(l);
  g.position.set(x,0,z); scene.add(g); buoys.push({g,x,z,ph:rnd()*6});
});
