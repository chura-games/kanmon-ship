/* 関門汽船 運転シミュレーター — 基盤：ユーティリティ、地形の関数、波、レンダラー、空、水面シェーダー */
'use strict';
/* ============================================================
   Utilities
   ============================================================ */
const $ = s => document.querySelector(s);
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const lerp = (a,b,t) => a + (b-a)*t;
const smooth = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const lc = hex => new THREE.Color(hex).convertSRGBToLinear();
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const rnd = mulberry(20260925);
function h2(x,y){ let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))|0; h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16; return (h>>>0)/4294967296; }
function vn(x,y){ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi; const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  return lerp(lerp(h2(xi,yi),h2(xi+1,yi),u), lerp(h2(xi,yi+1),h2(xi+1,yi+1),u), v); }
function fbm2(x,y){ let s=0,a=.5; for(let i=0;i<5;i++){ s+=a*vn(x,y); x=x*2.03+17.1; y=y*2.03-9.3; a*=.5; } return s/0.96875; }
const SHIP_L=24, SHIP_B=6.2;
let ENGVOL=0.55, ENVVOL=0.8, MASTERVOL=0.7;
try{ const v=JSON.parse(localStorage.getItem('kanmon-vol')||'null'); if(v){ MASTERVOL=v.m; ENGVOL=v.e; ENVVOL=v.w; } }catch(e){}
const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };

/* ============================================================
   Geography — a strait running east-west (x: east, z: south, 1 unit = 1 m), shaped by js/stage.js.
   It narrows where the bridge crosses. One shore formula is written out for both the CPU and the shaders.
   ============================================================ */
const BRIDGE_X = STAGE.bridgeX;
const bumpX = x => { const q=(x-BRIDGE_X)/700; return Math.exp(-q*q); };
const plat = (x,a,b,e) => smooth(a-e,a+e,x)*(1-smooth(b-e,b+e,x));
const glNum = n => Number.isInteger(n) ? n+'.0' : String(n);
function shoreExpr(sp,plats){ let e=glNum(sp.z0); for(const [a,f,p] of sp.sin) e+='+'+glNum(a)+'*sin(x*'+glNum(f)+'+'+glNum(p)+')'; e+='+'+glNum(sp.bump)+'*bumpX(x)';
  if(plats) for(const [a,x0,x1,w] of sp.plats) e+='+'+glNum(a)+'*plat(x,'+glNum(x0)+','+glNum(x1)+','+glNum(w)+')'; return e; }
const shoreFn = e => new Function('bumpX','plat','sin','return x=>'+e)(bumpX,plat,Math.sin);
const southZ0 = shoreFn(shoreExpr(STAGE.south,false));   // the south shore without its inlets and headlands
const northZ = shoreFn(shoreExpr(STAGE.north,true));
const southZ = shoreFn(shoreExpr(STAGE.south,true));
function landD(x,z){ const n=northZ(x), s=southZ(x); if(z<n) return n-z; if(z>s) return z-s; return -Math.min(z-n, s-z); }
function terrainH(x,z){
  const d = landD(x,z);
  if(d<0) return Math.max(-22, d*0.65-2.0);
  // built-up shores stand on a 3.2 m quay; natural ones (STAGE.wild) rise from the water as a beach, except around the piers
  let quay = 3.2;
  if(STAGE.wild){ let k=0; for(const p of STAGE.piers) k=Math.max(k,smooth(330,260,Math.abs(x-p.x))); quay=lerp(Math.min(3.2,0.35+d*0.12),3.2,k); }
  let h = quay + (fbm2(x*.02,z*.02)-.5)*0.8*smooth(30,120,d);
  h += smooth(170,720,d)*(40+190*fbm2(x*.0011+3.3, z*.0011-7.1));
  for(const [hx,hz,hw,hh] of STAGE.hills) h += hh*Math.exp(-((x-hx)**2+(z-hz)**2)/(2*hw*hw))*smooth(60,320,d);
  return h;
}

/* ============================================================
   Waves — a 16-component directional sea (Gerstner), shared by CPU and GPU.
   Long swell to short chop; each component is faded out where the mesh
   (vertex LOD) or the pixel footprint (fragment LOD) can no longer carry it.
   ============================================================ */
const G = 9.81;
const WAVES = (()=>{ const r=mulberry(4242), Ls=[68,52,41,33,27,22,18,15,12.5,10.4,8.7,7.3,6.1,5.1,4.3,3.6], wind=0.3;
  return Ls.map((L,i)=>{ const k=2*Math.PI/L, spread=0.3+i*0.075; const a=wind+(r()-0.5)*2*spread+(i%5===3?(r()-0.5)*1.6:0);
    const s=0.046*(1-i/Ls.length*0.5); return {L,dx:Math.cos(a),dz:Math.sin(a),s,k,w:Math.sqrt(G*k),A:s/k,ph:r()*6.283}; }); })();
const NW = WAVES.length, NV = NW;
const SUMA = WAVES.slice(0,6).reduce((t,w)=>t+w.A,0);
const GRID_N = 320;
function gridSpacingAt(D){ const t=clamp(D/1500,0,1); let lo=0,hi=1; for(let i=0;i<30;i++){ const m=(lo+hi)/2; if(1500*(0.12*m+0.88*Math.pow(m,2.2))<D*1.0) lo=m; else hi=m; } const u=(lo+hi)/2; return 1500*(0.12+0.88*2.2*Math.pow(u,1.2))*(2/GRID_N); }
WAVES.forEach(w=>{ let D=0; while(D<3000 && gridSpacingAt(D)<w.L/3.2) D+=5; w.vEnd=D; w.vStart=D*0.6; });
let waveAmp = 1.0;
function waveEnv(x,z,t){ return 1+0.32*Math.sin(0.01396*(0.95*x+0.31*z)-0.0628*t+1.3)+0.22*Math.sin(0.00898*(0.80*x-0.60*z)-0.0404*t+4.1); }
/* harbours are sheltered: the sea dies down toward the shore (to 30% within 40 m of it, full strength 260 m out), so it doesn't wash over quays and pontoons */
const shelter = d => 0.3+0.7*smooth(40,260,d);
/* whirlpools (js/stage.js): w.s is the current strength 0..1, set every frame by js/route.js. Each pulls the surface down into a broad bowl with a steep throat. */
const WHIRLS = STAGE.whirls.map(w=>Object.assign({s:0},w));
function whirlDip(x,z){ let d=0; for(const w of WHIRLS){ const dx=x-w.x, dz=z-w.z, q=(dx*dx+dz*dz)/(w.R*w.R*0.64); if(q<9) d+=w.s*w.depth*(0.6*Math.exp(-q)+0.4*Math.exp(-q*8)); } return d; }
/* sea height at a point. n: how many wave components (default all); sh: a known shelter factor, to skip working out the distance to shore */
function waveH(x,z,t,n,sh){ n=n||NW; if(sh===undefined) sh=shelter(-landD(x,z)); const env=waveEnv(x,z,t)*sh; let h=0; for(let i=0;i<n;i++){ const w=WAVES[i]; h += w.A*waveAmp*(i<6?env:sh)*Math.sin(w.k*(w.dx*x+w.dz*z) - w.w*t + w.ph); } return WHIRLS.length ? h-whirlDip(x,z) : h; }
function glslWaves(){
  const f = n => n.toFixed(6);
  const ENV='1.0+0.32*sin(0.01396*dot(vec2(0.95,0.31),p)-0.0628*uTime+1.3)+0.22*sin(0.00898*dot(vec2(0.80,-0.60),p)-0.0404*uTime+4.1)';
  let s = WHIRLS.length ? `uniform vec4 uWhirl[${WHIRLS.length}]; uniform float uWhirlDepth[${WHIRLS.length}];\nfloat whirlDip(vec2 p){ float d=0.0; for(int i=0;i<${WHIRLS.length};i++){ vec4 w=uWhirl[i]; vec2 r=p-w.xy; float q=dot(r,r)/(w.z*w.z*0.64); if(q<9.0) d+=abs(w.w)*uWhirlDepth[i]*(0.6*exp(-q)+0.4*exp(-q*8.0)); } return d; }\n` : '';
  s += `float shelter(vec2 p){ return 0.3+0.7*smoothstep(40.0,260.0,-landD(p)); }\nvec3 wavesV(vec2 p, float amp0, out vec3 nrm){ amp0*=shelter(p); vec3 d=vec3(0.0); vec2 sl=vec2(0.0); float j=0.0; float D=distance(p,cameraPosition.xz); float f,c,sn,a,amp; float env=${ENV};\n`;
  for(const w of WAVES){ s+=` amp=amp0${WAVES.indexOf(w)<6?'*env':''};`;
    const body=` f=${f(w.k)}*dot(vec2(${f(w.dx)},${f(w.dz)}),p)-${f(w.w)}*uTime+${f(w.ph)}; c=cos(f); sn=sin(f); d.x+=${f(w.dx*w.A)}*a*c; d.y+=${f(w.A)}*a*sn; d.z+=${f(w.dz*w.A)}*a*c; sl+=vec2(${f(w.dx*w.s)},${f(w.dz*w.s)})*a*c; j+=${f(w.s)}*a*sn;`;
    s += w.vEnd>=3000 ? ` a=amp;${body}\n` : ` if(D<${f(w.vEnd)}){ a=amp*(1.0-smoothstep(${f(w.vStart)},${f(w.vEnd)},D));${body} }\n`;
  }
  s += ` nrm=vec3(-sl.x,1.0-j,-sl.y);${WHIRLS.length?' d.y-=whirlDip(p);':''} return d; }\n`;
  s += `float foamTrail(vec2 p){ float env=${ENV}; float tr=0.0, ph;\n`;
  WAVES.slice(0,5).forEach(w=>{ s+=` ph=fract((${f(w.k)}*dot(vec2(${f(w.dx)},${f(w.dz)}),p)-${f(w.w)}*uTime+${f(w.ph)})/6.2831853-0.25); tr+=exp(-ph*7.0)*${f(w.s/0.046)};\n`; });
  s += ` return tr*env*0.28*shelter(p); }\n`;
  s += `vec2 wavesS(vec2 p, float amp0, float D){ amp0*=shelter(p); vec2 sl=vec2(0.0); float f,a,amp; float env=${ENV};\n`;
  for(const w of WAVES){ const e=w.L*26, st=w.L*10;
    s += ` amp=amp0${WAVES.indexOf(w)<6?'*env':''}; if(D<${f(e)}){ a=amp*(1.0-smoothstep(${f(st)},${f(e)},D)); f=${f(w.k)}*dot(vec2(${f(w.dx)},${f(w.dz)}),p)-${f(w.w)}*uTime+${f(w.ph)}; sl+=vec2(${f(w.dx*w.s)},${f(w.dz*w.s)})*a*cos(f); }\n`; }
  return s + ` return sl; }\n`;
}

/* ============================================================
   Renderer / scene
   ============================================================ */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.0));
renderer.localClippingEnabled = false;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 20000);
scene.fog = new THREE.FogExp2(0xaaccdd, 0.00022);

/* ---- procedural textures: tileable wave-slope map and value-noise map ---- */
function makeSlopeTexture(N){
  const r=mulberry(771), waves=[];
  for(let i=0;i<72;i++){
    const mag = 2 + Math.floor(Math.pow(r(),1.8)*44);
    const ang = (r()-0.5)*2.6 + (r()<0.25?Math.PI*(r()-0.5)*2:0);
    const kx=Math.round(Math.cos(ang)*mag), ky=Math.round(Math.sin(ang)*mag);
    if(kx===0&&ky===0) continue;
    const km=Math.hypot(kx,ky);
    waves.push([kx,ky,Math.pow(km,-1.25)*(0.6+0.8*r()),r()*6.283]);
  }
  const h=new Float32Array(N*N);
  for(const [kx,ky,a,ph] of waves){ const fx=6.283185*kx/N, fy=6.283185*ky/N;
    for(let y=0;y<N;y++){ const by=fy*y+ph; const o=y*N; for(let x=0;x<N;x++) h[o+x]+=a*Math.sin(fx*x+by); } }
  // sharpen crests a little (trochoid-like)
  let mn=1e9,mx=-1e9; for(let i=0;i<h.length;i++){ mn=Math.min(mn,h[i]); mx=Math.max(mx,h[i]); }
  for(let i=0;i<h.length;i++){ const t=(h[i]-mn)/(mx-mn); h[i]=Math.pow(t,1.35); }
  const sx=new Float32Array(N*N), sz=new Float32Array(N*N); let ms=0;
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const i=y*N+x; const a=h[y*N+((x+1)%N)]-h[y*N+((x-1+N)%N)], b=h[((y+1)%N)*N+x]-h[((y-1+N)%N)*N+x];
    sx[i]=a; sz[i]=b; ms=Math.max(ms,Math.abs(a),Math.abs(b)); }
  const d=new Uint8Array(N*N*4);
  for(let i=0;i<N*N;i++){ d[i*4]=clamp(Math.round((sx[i]/ms*0.5+0.5)*255),0,255); d[i*4+1]=clamp(Math.round((sz[i]/ms*0.5+0.5)*255),0,255); d[i*4+2]=Math.round(h[i]*255); d[i*4+3]=255; }
  const t=new THREE.DataTexture(d,N,N,THREE.RGBAFormat,THREE.UnsignedByteType);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.generateMipmaps=true; t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; t.anisotropy=4; t.needsUpdate=true;
  return t;
}
function makeNoiseTexture(N){
  const d=new Uint8Array(N*N*4);
  const ch=(seed)=>{ const out=new Float32Array(N*N); let amp=0.5,tot=0;
    for(let o=0;o<6;o++){ const f=4<<o;
      for(let y=0;y<N;y++) for(let x=0;x<N;x++){
        const fx=x/N*f, fy=y/N*f, xi=Math.floor(fx), yi=Math.floor(fy), xf=fx-xi, yf=fy-yi;
        const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
        const H=(a,b)=>h2(((a%f)+f)%f+seed*131+o*977,((b%f)+f)%f+seed*57);
        out[y*N+x]+=amp*lerp(lerp(H(xi,yi),H(xi+1,yi),u),lerp(H(xi,yi+1),H(xi+1,yi+1),u),v);
      }
      tot+=amp; amp*=0.5; }
    for(let i=0;i<out.length;i++) out[i]/=tot; return out; };
  const a=ch(1), b=ch(2);
  for(let i=0;i<N*N;i++){ d[i*4]=Math.round(clamp((a[i]-0.5)*1.6+0.5,0,1)*255); d[i*4+1]=Math.round(clamp((b[i]-0.5)*1.6+0.5,0,1)*255); d[i*4+2]=0; d[i*4+3]=255; }
  const t=new THREE.DataTexture(d,N,N,THREE.RGBAFormat,THREE.UnsignedByteType);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.generateMipmaps=true; t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; t.needsUpdate=true;
  return t;
}
const TEX_SLOPE = makeSlopeTexture(256);
const TEX_NOISE = makeNoiseTexture(256);
function makeFoamTexture(N){
  const d=new Uint8Array(N*N*4), r=mulberry(313);
  const layer=(cells,wall)=>{ const px=new Float32Array(cells*cells*2); for(let i=0;i<cells*cells;i++){ px[i*2]=r(); px[i*2+1]=r(); }
    const out=new Float32Array(N*N), cs=N/cells;
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const gx=Math.floor(x/cs), gy=Math.floor(y/cs); let f1=1e9,f2=1e9;
      for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++){ const cx=(gx+ox+cells)%cells, cy=(gy+oy+cells)%cells; const k=(cy*cells+cx)*2;
        const fx=(gx+ox+px[k])*cs, fy=(gy+oy+px[k+1])*cs; const dd=Math.hypot(fx-x,fy-y); if(dd<f1){ f2=f1; f1=dd; } else if(dd<f2) f2=dd; }
      out[y*N+x]=1-smooth(0,wall*cs,f2-f1); }
    return out; };
  const a=layer(18,0.16), b=layer(46,0.2), c=layer(90,0.28);
  for(let i=0;i<N*N;i++){ const lace=clamp(a[i]*0.55+b[i]*0.45+(r()-0.5)*0.08,0,1); const bub=clamp(c[i]*0.8+(r()<0.004?1:0),0,1);
    d[i*4]=Math.round(lace*255); d[i*4+1]=Math.round(bub*255); d[i*4+2]=0; d[i*4+3]=255; }
  const t=new THREE.DataTexture(d,N,N,THREE.RGBAFormat,THREE.UnsignedByteType);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.generateMipmaps=true; t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; t.anisotropy=4; t.needsUpdate=true; return t;
}
const TEX_FOAM = makeFoamTexture(512);
const reflRT = new THREE.WebGLRenderTarget(256,256,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat});
reflRT.texture.generateMipmaps=false;

const U = {
  uTime:{value:0}, uAmp:{value:1}, uSunDir:{value:new THREE.Vector3(-.4,.7,-.3).normalize()},
  uSunColor:{value:new THREE.Color(3,3,3)}, uAmbient:{value:new THREE.Color(1,1,1)},
  uSkyTop:{value:new THREE.Color()}, uSkyHor:{value:new THREE.Color()}, uFogColor:{value:new THREE.Color()},
  uFogDensity:{value:0.00022}, uNight:{value:0}, uCloudCol:{value:new THREE.Color(1,1,1)},
  uScale:{value:800},
  uShip:{value:new THREE.Vector4(0,0,0,0)}, uShipDim:{value:new THREE.Vector2(26,6.6)}, uChurn:{value:0}, uWake:{value:new THREE.Vector2(0,1)},   // uChurn: 0..1, water thrashed by the jets while she gets under way
  uWhirl:{value:WHIRLS.map(w=>new THREE.Vector4(w.x,w.z,w.R,0))}, uWhirlDepth:{value:WHIRLS.map(w=>w.depth)},
  uWL:{value:new Float32Array(26)}, uSlap:{value:new Float32Array(26)},   // ferry waterline: wetted half-width and wave impact at 13 stations, starboard then port
  uRipples:{value:Array.from({length:24},()=>new THREE.Vector4(0,0,-999,0))},
  uFlow:{value:new THREE.Vector2(0,0)}, tNoise:{value:TEX_NOISE}, tFoam:{value:TEX_FOAM}, tSlope:{value:TEX_SLOPE}, tRefl:{value:reflRT.texture}, uReflOn:{value:0}, uRes:{value:new THREE.Vector2(1,1)}
};

const COMMON = `
uniform float uTime; uniform float uAmp; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbient;
uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uNight; uniform vec3 uCloudCol;
uniform sampler2D tNoise; uniform sampler2D tFoam;
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  float a=hash21(mod(i,512.0)), b=hash21(mod(i+vec2(1.0,0.0),512.0)), c=hash21(mod(i+vec2(0.0,1.0),512.0)), d=hash21(mod(i+vec2(1.0,1.0),512.0));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s/0.9375; }
float bumpX(float x){ float q=(x-${BRIDGE_X.toFixed(1)})/700.0; return exp(-q*q); }
float plat(float x,float a,float b,float e){ return smoothstep(a-e,a+e,x)*(1.0-smoothstep(b-e,b+e,x)); }
float northZ(float x){ return ${shoreExpr(STAGE.north,true)}; }
float southZ(float x){ return ${shoreExpr(STAGE.south,true)}; }
float landD(vec2 p){ float n=northZ(p.x); float s=southZ(p.x); if(p.y<n) return n-p.y; if(p.y>s) return p.y-s; return -min(p.y-n,s-p.y); }
vec3 skyColor(vec3 d){
  float y=d.y;
  vec3 col=mix(uSkyHor,uSkyTop,pow(clamp(y,0.0,1.0),0.5));
  col=mix(col,uFogColor,smoothstep(0.02,-0.08,y));
  float sd=max(dot(d,uSunDir),0.0);
  col+=uSunColor*(pow(sd,8.0)*0.10+pow(sd,90.0)*0.35)*(1.0-uNight*0.8);
  col+=vec3(0.35,0.18,0.08)*uNight*exp(-max(y,0.0)*25.0)*0.35;
  return col;
}
uniform vec4 uShip; uniform vec2 uShipDim; uniform vec2 uWake;
  float kelvin(vec2 p){
    // The wavelength follows uWake.x, a slowly settling copy of the speed, and the pattern is faded (uWake.y) while the speed is still
    // changing: tied to the instantaneous speed, the whole pattern astern would slide and flicker as she accelerates.
    float U=uWake.x; if(U<0.6) return 0.0;
    vec2 f=vec2(cos(uShip.z),-sin(uShip.z)); vec2 sd=vec2(sin(uShip.z),cos(uShip.z));
    vec2 rel=p-uShip.xy;
    float a=-dot(rel,f)+uShipDim.x*0.5;
    if(a<0.0||a>460.0) return 0.0;
    float b=abs(dot(rel,sd));
    float k=9.81/(U*U);
    float w=a*0.354+uShipDim.y*0.5;
    float inside=smoothstep(w+3.0,w-3.0,b);
    float trans=sin(k*a)*inside*0.35;
    float e=(b-w)/(2.0+a*0.06);
    float dv=sin(k*1.8*(a*0.82+b*0.57))*exp(-e*e)*0.9;
    return (trans+dv)*exp(-a/260.0)*smoothstep(0.6,4.0,U)*0.85*uWake.y;
  }

// pressure field of the hull: bow hump, shoulder trough along the sides, stern rise
float hullWave(vec2 p){
  float U=abs(uShip.w); if(U<0.5) return 0.0;
  vec2 f=vec2(cos(uShip.z),-sin(uShip.z)); vec2 sd=vec2(sin(uShip.z),cos(uShip.z)); vec2 rel=p-uShip.xy;
  float al=dot(rel,f), lat=abs(dot(rel,sd)); if(abs(al)>uShipDim.x*1.1||lat>uShipDim.y*3.0) return 0.0;
  float sp=clamp(U/9.0,0.0,1.3), hb=uShipDim.y*0.5;
  float bow=exp(-pow((al-uShipDim.x*0.26)/3.4,2.0))*exp(-pow((lat-hb-1.0)/1.5,2.0))*0.85;
  float spread=exp(-pow((al-uShipDim.x*0.05+ (lat-hb)*1.1)/3.0,2.0))*exp(-pow((lat-hb-3.2)/2.2,2.0))*0.45;
  float trough=-exp(-pow((al+uShipDim.x*0.12)/5.5,2.0))*exp(-pow((lat-hb-0.5)/2.0,2.0))*0.5;
  float stern=exp(-pow((al+uShipDim.x*0.66)/3.2,2.0))*exp(-pow(lat/2.6,2.0))*0.4;
  return (bow+spread+trough+stern)*sp*sp;
}
float shipWaves(vec2 p){ if(distance(p,uShip.xy)>500.0) return 0.0; return kelvin(p)*smoothstep(3.2,5.5,abs(uShip.w))+hullWave(p); }
float fogF(float dist){ float x=uFogDensity*dist; return 1.0-exp(-x*x); }
${glslWaves()}
`;
const TAIL = `\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n`;

function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
  U.uScale.value = h*renderer.getPixelRatio() / (2*Math.tan(camera.fov*Math.PI/360));
  const pr=renderer.getPixelRatio(); U.uRes.value.set(Math.floor(w*pr),Math.floor(h*pr));
  if(typeof QUALITY!=='undefined') reflRT.setSize(Math.max(64,Math.floor(w*pr*QUALITY.rs)),Math.max(64,Math.floor(h*pr*QUALITY.rs)));
}
window.addEventListener('resize', resize); resize();

/* ============================================================
   Sky + environment
   ============================================================ */
const skyMat = new THREE.ShaderMaterial({
  uniforms:U, side:THREE.BackSide, depthWrite:false, fog:false,
  vertexShader:`varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: COMMON + `varying vec3 vW;
  void main(){
    vec3 d=normalize(vW-cameraPosition);
    vec3 col=skyColor(d);
    float sd=dot(d,uSunDir);
    col+=uSunColor*smoothstep(0.99955,0.9998,sd)*6.0*(1.0-uNight);
    col+=vec3(0.85,0.9,1.0)*smoothstep(0.99965,0.99985,sd)*uNight*3.0;
    if(d.y>0.0){
      vec2 uv=d.xz/(d.y+0.12)*0.32+vec2(uTime*0.0011,uTime*0.0004);
      float c=texture2D(tNoise,uv).r*0.62+texture2D(tNoise,uv*2.7+0.31).g*0.28+texture2D(tNoise,uv*7.3+0.7).r*0.10;
      float cov=smoothstep(0.52,0.84,c)*smoothstep(0.0,0.2,d.y);
      float lit=0.72+0.4*pow(max(sd,0.0),4.0);
      col=mix(col,uCloudCol*lit,cov*0.85);
      vec3 sp=floor(d*300.0);
      float st=step(0.9982,hash21(sp.xy+sp.z*17.0));
      col+=vec3(st)*uNight*(1.0-cov)*smoothstep(0.05,0.3,d.y)*1.5;
    }
    gl_FragColor=vec4(col,1.0);
    ${TAIL}
  }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(9000,32,16), skyMat);
sky.renderOrder = -10; scene.add(sky);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16), skyMat));
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2); scene.add(sun); scene.add(sun.target);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sun.castShadow = true; sun.shadow.mapSize.set(1024,1024);
{ const sc=sun.shadow.camera; sc.left=-24; sc.right=24; sc.top=24; sc.bottom=-24; sc.near=5; sc.far=500; }
sun.shadow.bias=-0.0005; sun.shadow.normalBias=0.04;

/* ============================================================
   Water — inner detailed grid + outer skirt, both follow camera
   ============================================================ */
const waterMat = new THREE.ShaderMaterial({
  uniforms:U, fog:false,
  vertexShader: COMMON + `
  varying vec3 vW; varying vec2 vP; varying float vH; varying float vJ;
  void main(){
    vec4 wp=modelMatrix*vec4(position,1.0);
    vec2 p=wp.xz;
    float dist=length(p-cameraPosition.xz);
    float fade=1.0-smoothstep(700.0,1400.0,dist);
    vec3 n; vec3 d=wavesV(p,uAmp*fade,n);
    wp.xyz+=d; wp.y+=shipWaves(p)*fade;
    vW=wp.xyz; vP=p; vH=d.y/(max(uAmp,0.05)*${SUMA.toFixed(4)}); vJ=n.y;
    gl_Position=projectionMatrix*viewMatrix*wp;
  }`,
  fragmentShader: COMMON + `
  uniform vec4 uRipples[24]; uniform float uChurn;
  uniform sampler2D tSlope; uniform sampler2D tRefl; uniform float uReflOn; uniform vec2 uRes; uniform vec2 uFlow;
  varying vec3 vW; varying vec2 vP; varying float vH; varying float vJ;
  vec3 TM(vec3 c){ return ACESFilmicToneMapping(c); }
  uniform float uWL[26]; uniform float uSlap[26]; const float SHIPLEN=24.0;   // SHIP_L
  // distance outside the ferry's actual waterline (negative inside the hull), and the wave impact on the nearest stretch of hull
  float hullOut(float al, float lat, out float slap){
    float u=clamp(al/SHIPLEN+0.5,0.0,1.0)*12.0; float hw=0.0; slap=0.0;
    for(int i=0;i<12;i++){ float fi=float(i); if(u>=fi && u<=fi+1.0){
      if(lat>0.0){ hw=mix(uWL[i],uWL[i+1],u-fi); slap=mix(uSlap[i],uSlap[i+1],u-fi); } else { hw=mix(uWL[13+i],uWL[14+i],u-fi); slap=mix(uSlap[13+i],uSlap[14+i],u-fi); } } }
    float g=abs(lat)-hw, ax=max(abs(al)-SHIPLEN*0.5,0.0);
    return (g>0.0||ax>0.0) ? length(vec2(max(g,0.0),ax)) : g;
  }
  vec2 ripples(vec2 p, inout float foam){
    vec2 g=vec2(0.0);
    for(int i=0;i<24;i++){
      vec4 r=uRipples[i];
      float age=uTime-r.z;
      if(age<0.0||age>13.0||r.w<=0.0) continue;
      vec2 dv=p-r.xy; float d=length(dv)+1e-4;
      float spd=1.2+r.w*1.1; float front=age*spd; float x=d-front;
      if(abs(x)>8.0+age*2.0) continue;
      float wd=0.8+age*0.9;
      float env=exp(-x*x/(wd*wd))*r.w*exp(-age*0.3)/(1.0+front*0.1);
      float kk=3.2/(1.0+age*0.25);
      g+=dv/d*cos(x*kk)*kk*env*0.35;
      foam+=smoothstep(0.45,0.95,env)*0.14*step(0.3,sin(x*kk));
    }
    return g;
  }
  // multi-scale wind-wave slopes from a tileable spectrum map (mip-mapped: far water smooths out naturally)
  vec2 slopeAt(vec2 p0, float dist){
    vec2 p=p0-uFlow; vec2 t=vec2(uTime);
    mat2 r1=mat2(0.8,-0.6,0.6,0.8); mat2 r2=mat2(0.28,0.96,-0.96,0.28);
    vec2 s=(texture2D(tSlope,p/41.0+t*vec2(0.0040,0.0017)).rg*2.0-1.0)*0.18;
    s+=((texture2D(tSlope,(r1*p)/15.0+t*vec2(-0.0081,0.0063)).rg*2.0-1.0)*r1)*0.35;
    float nf=1.0-smoothstep(60.0,450.0,dist);
    s+=((texture2D(tSlope,(r2*p)/7.9+t*vec2(0.017,-0.013)).rg*2.0-1.0)*r2)*0.55*nf;
    s+=(texture2D(tSlope,p/2.7+t*vec2(-0.029,0.022)).rg*2.0-1.0)*0.5*(1.0-smoothstep(15.0,150.0,dist));
    s+=((texture2D(tSlope,(r1*p)/1.05+t*vec2(0.05,0.04)).rg*2.0-1.0)*r1)*0.35*(1.0-smoothstep(4.0,40.0,dist));
    return s;
  }
  ${WHIRLS.length ? `// foam in a whirlpool is pulled out into long thin filaments along the water's spiral path. Sampled in spiral
  // coordinates (around: angle + log radius, inward: log radius); the texture repeats a whole number of times
  // round the circle, and a second copy with its seam on the far side hides the seam of the angle.
  float whirlStreak(vec2 r, float lu, float sp, float t){
    float a=atan(r.y,r.x), b=atan(-r.y,-r.x), inw=lu*0.55+t*0.03;
    float pa=(a*sp+2.4*lu)/6.2831853-t, pb=(b*sp+2.4*lu)/6.2831853-t;
    float fa=texture2D(tFoam,vec2(pa*4.0,inw)).r*0.55+texture2D(tFoam,vec2(pa*8.0+0.37,inw*2.1+0.2)).r*0.45;
    float fb=texture2D(tFoam,vec2(pb*4.0,inw)).r*0.55+texture2D(tFoam,vec2(pb*8.0+0.37,inw*2.1+0.2)).r*0.45;
    return mix(fb,fa,smoothstep(2.6,2.0,abs(a)));
  }
  float whirlFx(vec2 p, inout vec2 g, out float core, out float aer){ float foam=0.0; core=0.0; aer=0.0;
    for(int i=0;i<${WHIRLS.length};i++){ vec4 w=uWhirl[i]; float st=abs(w.w); vec2 r=p-w.xy; float d=length(r)+1e-3, u=d/w.z; if(st<0.02||u>3.8) continue;
      float sp=sign(w.w), lu=log(u+0.06);
      float fil=whirlStreak(r,lu,sp,uTime*(0.035+0.05*st));
      float tw=sp*uTime*(0.35+0.6*st)/(0.35+u);   // the inner water turns faster
      float cs=cos(tw), sn=sin(tw); vec2 rp=vec2(cs*r.x+sn*r.y,-sn*r.x+cs*r.y);
      float ring=exp(-pow((u-0.55)/0.5,2.0));     // most of the white water sits between the throat and the rim
      float amt=st*(ring*0.85+exp(-u*u*0.35)*0.35)*(0.7+0.6*texture2D(tNoise,rp*0.008).r);   // in uneven patches
      foam+=smoothstep(1.0-amt,1.0-amt+0.3,fil*0.72+texture2D(tFoam,rp*0.045).r*0.28)*min(1.0,amt*1.5);
      foam+=st*exp(-pow((u-0.16)/0.07,2.0))*0.9;  // a collar of froth round the throat
      core+=st*exp(-u*u*60.0);
      aer+=st*exp(-u*u*0.5)*0.7;
      float q=d*d/(w.z*w.z*0.64), k=st*uWhirlDepth[i]*(0.6*exp(-q)+3.2*exp(-q*8.0));
      g+=r*(2.0*k/(w.z*w.z*0.64))+vec2(-r.y,r.x)/d*(fil-0.5)*0.4*st*ring; }
    // the tide rip: a band of broken white water along the line where the fast stream shears past the slack, under the bridge
    float bx=p.x-${glNum(BRIDGE_X)};
    float rip=exp(-bx*bx/(460.0*460.0))*exp(-pow((p.y-35.0*sin(bx*0.011))/75.0,2.0));
    float rn=texture2D(tNoise,(p-uFlow)*0.011).r*0.6+texture2D(tFoam,(p-uFlow)*0.05).r*0.4;
    foam+=rip*smoothstep(0.5,0.8,rn)*0.6; aer+=rip*0.3;
    g+=rip*0.12*vec2(cos(p.x*1.1+uTime*3.1),sin(p.y*1.3-uTime*2.7));
    return foam; }` : ''}
  void main(){
    vec3 toC=cameraPosition-vW; float dist=length(toC); vec3 V=toC/dist;
    float fade=1.0-smoothstep(700.0,1400.0,length(vP-cameraPosition.xz));
    vec2 ws=wavesS(vP,uAmp*fade,dist)*1.9;
    vec2 s=slopeAt(vP,dist)*(0.09+0.075*uAmp);
    float slick=smoothstep(0.56,0.74,texture2D(tNoise,(vP-uFlow*0.9)*vec2(0.0009,0.0055)).r)*(1.0-smoothstep(500.0,1600.0,dist));
    s*=1.0-slick*0.75;
    float swirl=texture2D(tNoise,vP*0.0016+vec2(-uTime*0.002,uTime*0.0011)).g;
    float foam=0.0;
    vec2 g=ripples(vP,foam);
    float wcore=0.0, waer=0.0, wfoam=0.0; ${WHIRLS.length?'wfoam=whirlFx(vP,g,wcore,waer);':''}
    if(length(vP-uShip.xy)<500.0){
      float h0=shipWaves(vP);
      g+=vec2(shipWaves(vP+vec2(0.5,0.0))-h0,shipWaves(vP+vec2(0.0,0.5))-h0)/0.5*1.3;
    }
    float ldq=landD(vP);
    if(ldq>-40.0){ float cl=smoothstep(-40.0,-2.0,ldq)*(0.4+0.6*uAmp); float sgn=vP.y<0.0?-1.0:1.0;
      float st=cos(ldq*0.85)*sin(uTime*2.3+vP.x*0.05)+0.6*cos(ldq*1.9+1.0)*sin(uTime*3.4-vP.x*0.08);
      g.y+=sgn*st*0.09*cl; g.x+=0.04*cl*sin(vP.x*0.4+uTime*2.9)*cos(ldq*1.3); }
    vec3 N=normalize(vec3(-ws.x-s.x-g.x,1.0,-ws.y-s.y-g.y));
    float NoV=max(dot(N,V),0.0);
    float fres=0.02+0.98*pow(1.0-NoV,5.0);
    vec3 R=reflect(-V,N); R.y=abs(R.y);
    // reflection: rendered mirror image of the scene, distorted by the surface slope
    vec3 refl;
    if(uReflOn>0.5){
      vec2 suv=gl_FragCoord.xy/uRes;
      vec2 off=vec2(-(N.x),N.z*1.6)*0.085/(1.0+dist*0.0025);
      vec2 ruv=clamp(vec2(1.0-suv.x,suv.y)+off,vec2(0.002),vec2(0.998));
      refl=texture2D(tRefl,ruv).rgb;
    } else {
      vec3 sk=skyColor(R);
      float hl=max(length(R.xz),1e-3);
      float along=abs(R.z)/hl;
      float dn=max(vW.z-northZ(vW.x),1.0), ds=max(southZ(vW.x)-vW.z,1.0);
      float dShore=(R.z<0.0?dn:ds)/max(along,0.06);
      float elev=85.0/dShore;
      float landR=smoothstep(elev*1.1,elev*0.55,R.y/hl);
      vec3 landCol=mix(vec3(0.035,0.06,0.04)*(uAmbient*1.4+uSunColor*0.08),uFogColor,fogF(dShore)*0.9);
      landCol+=vec3(0.5,0.3,0.12)*uNight*0.08;
      refl=TM(mix(sk,landCol,landR*0.8));
    }
    vec2 f=vec2(cos(uShip.z),-sin(uShip.z)); vec2 sdv=vec2(sin(uShip.z),cos(uShip.z));
    vec2 rel=vP-uShip.xy;
    float alg=dot(rel,f), lat=dot(rel,sdv);
    float e=9.0, slapF=0.0; if(length(rel)<40.0) e=1.0+hullOut(alg,lat,slapF)/3.3;   // 1 at the waterline, growing outward
    float sp=clamp(uShip.w/8.0,0.0,1.0);
    vec2 so=rel+uSunDir.xz/max(uSunDir.y,0.25)*2.6;
    float es=length(vec2(dot(so,f)/(uShipDim.x*0.56),dot(so,sdv)/(uShipDim.y*0.66)));
    float shade=(1.0-smoothstep(0.7,1.15,es))*(1.0-uNight)*0.6;
    float ao=(1.0-smoothstep(0.98,1.45,e))*0.45;
    // water body: absorption + forward scattering through the crests
    vec3 deep=vec3(${(STAGE.water?STAGE.water.deep:[0.003,0.024,0.040]).map(glNum).join(',')});
    vec3 scat=vec3(${(STAGE.water?STAGE.water.scat:[0.022,0.135,0.190]).map(glNum).join(',')});
    float sunUp=clamp(uSunDir.y*3.0,0.0,1.0);
    float crestH=clamp(vH*0.5+0.5,0.0,1.0);
    vec3 body=deep*uAmbient*1.6+scat*(0.30+0.70*crestH)*(uAmbient*0.55+uSunColor*0.30*sunUp);
    vec2 sh=normalize(uSunDir.xz+1e-4); vec2 vh=normalize(-V.xz+1e-4);
    float sss=pow(max(dot(vh,sh),0.0),5.0)*pow(crestH,2.0)*(1.0-abs(V.y))*sunUp;
    body+=vec3(0.03,0.30,0.26)*uSunColor*sss*0.35;
    body*=0.86+0.28*swirl;
    body=mix(body,vec3(0.05,0.33,0.36)*(uAmbient*0.6+uSunColor*0.25),min(waer,1.0)*0.55)*(1.0-0.6*min(wcore,1.0));   // whirlpools: churned pale water, a small dark hole at the throat
    body*=0.9+0.2*clamp(dot(N,normalize(uSunDir+vec3(0.0,0.6,0.0))),0.0,1.0);
    float ld=landD(vP);
    body=mix(body,body*vec3(1.15,1.35,1.1)+vec3(0.0,0.012,0.006),smoothstep(-60.0,-5.0,ld)*0.6);
    // sun glitter (GGX), widening with distance like a real glitter path
    vec3 H=normalize(V+uSunDir);
    float NoH=max(dot(N,H),0.0), NoL=max(dot(N,uSunDir),0.0);
    float al=0.045+dist*0.00005;
    float a2=al*al; float dd=NoH*NoH*(a2-1.0)+1.0; float D=a2/(3.14159*dd*dd);
    float Fs=0.02+0.98*pow(1.0-max(dot(V,H),0.0),5.0);
    vec3 spec=uSunColor*min(D*Fs*NoL*0.25/max(NoV,0.2),60.0)*(1.0-uNight*0.7);
    body*=1.0-max(shade*0.75,ao*0.6); spec*=1.0-shade;
    vec3 col=mix(TM(body),refl*(1.0-ao*0.35),fres)+TM(spec);
    // foam
    vec2 vPf=vP-uFlow; vec2 fuv=vPf*0.013+vec2(uTime*0.0021,-uTime*0.0013);
    float nz=texture2D(tNoise,fuv).r*0.65+texture2D(tNoise,vPf*0.061-vec2(uTime*0.004)).g*0.35;
    float crest=smoothstep(0.78,0.34,vJ-nz*0.3)*smoothstep(0.3,1.15,uAmp)*fade*smoothstep(0.15,0.5,nz+0.25);
    float shore=smoothstep(-32.0,-0.8,ld)*(0.5+0.5*smoothstep(0.15,0.75,nz+0.45*sin(ld*0.55+uTime*1.1)))*(0.6+0.5*uAmp);
    float n2=texture2D(tNoise,vP*0.19+vec2(uTime*0.09,uTime*0.05)).g;
    float hullF=smoothstep(0.98,1.03,e)*smoothstep(1.14+1.0*sp+0.5*slapF+1.5*uChurn,1.0,e)*(0.55+0.9*sp*smoothstep(-0.45*uShipDim.x,0.25*uShipDim.x,alg)+1.4*slapF+0.85*uChurn);
    float behind=-alg-uShipDim.x*0.5;
    hullF+=smoothstep(-1.0,1.5,behind)*(1.0-smoothstep(0.0,18.0+75.0*sp,behind))*smoothstep(uShipDim.y*0.45+behind*0.05,uShipDim.y*0.1,abs(lat))*clamp(abs(uShip.w)/2.5,0.0,1.0)*1.3;
    float n3=texture2D(tNoise,vP*0.55-vec2(uTime*0.13,uTime*0.07)).r;
    hullF*=smoothstep(0.42,0.78,n2*0.6+n3*0.4+sp*0.18+uChurn*0.2);
    float trailF=smoothstep(0.28,0.85,foamTrail(vP)*uAmp)*smoothstep(0.15,0.65,nz+0.3)*fade;
    float fAmt=clamp(wfoam+foam*0.8+crest*0.95+shore*1.0+hullF+trailF*0.9+smoothstep(0.6,0.82,nz)*0.18*uAmp*fade,0.0,1.25);
    float lace=texture2D(tFoam,vPf*0.085).r*0.6+texture2D(tFoam,vPf*0.21+vec2(0.37,0.11)).r*0.4;
    float bub=texture2D(tFoam,vPf*0.47+vec2(uTime*0.01,0.0)).g;
    float foamV=smoothstep(1.0-fAmt,1.0-fAmt+0.2,lace)*min(1.0,fAmt*1.7)+bub*min(fAmt,1.0)*0.35;
    foam=clamp(mix(fAmt*0.6,foamV,1.0-smoothstep(150.0,600.0,dist)),0.0,1.0);
    vec3 foamCol=vec3(0.92,0.96,1.0)*(uAmbient*0.9+uSunColor*max(uSunDir.y,0.0)*0.8);
    col=mix(col,TM(foamCol),foam);
    col=mix(col,TM(uFogColor),fogF(dist));
    gl_FragColor=vec4(col,1.0);
    #include <encodings_fragment>
  }`
});
const waterInnerGeo = new THREE.PlaneGeometry(3000,3000,GRID_N,GRID_N).rotateX(-Math.PI/2);
{ const pa=waterInnerGeo.attributes.position; const f=v=>{ const t=Math.abs(v)/1500; return Math.sign(v)*1500*(0.12*t+0.88*Math.pow(t,2.2)); };
  for(let i=0;i<pa.count;i++){ pa.setX(i,f(pa.getX(i))); pa.setZ(i,f(pa.getZ(i))); } pa.needsUpdate=true; waterInnerGeo.computeBoundingSphere(); }
const waterInner = new THREE.Mesh(waterInnerGeo, waterMat);
const skirtShape = new THREE.Shape([new THREE.Vector2(-14000,-14000),new THREE.Vector2(14000,-14000),new THREE.Vector2(14000,14000),new THREE.Vector2(-14000,14000)]);
skirtShape.holes.push(new THREE.Path([new THREE.Vector2(-1500,-1500),new THREE.Vector2(-1500,1500),new THREE.Vector2(1500,1500),new THREE.Vector2(1500,-1500)]));
const waterOuter = new THREE.Mesh(new THREE.ShapeGeometry(skirtShape).rotateX(-Math.PI/2), waterMat);
waterInner.frustumCulled = waterOuter.frustumCulled = false;
scene.add(waterInner, waterOuter);
