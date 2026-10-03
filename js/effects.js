/* 関門汽船 運転シミュレーター — 演出：航跡、水しぶき */
'use strict';

/* ============================================================
   Wake ribbons (turbulent centre + Kelvin arms)
   ============================================================ */
const wakeMat = mode => new THREE.ShaderMaterial({
  uniforms:Object.assign({uMode:{value:mode}},U), transparent:true, depthWrite:false, fog:false,
  polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-4,
  vertexShader: COMMON + `attribute float aAge; attribute float aU; attribute float aStr; varying float vAge; varying float vU; varying float vStr; varying vec3 vW;
  void main(){ vec3 p=position; vec3 n; vec3 d=wavesV(p.xz,uAmp,n); p+=d; p.y+=0.14+shipWaves(position.xz); vW=p; vAge=aAge; vU=aU; vStr=aStr; gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0); }`,
  fragmentShader: COMMON + `uniform float uMode; varying float vAge; varying float vU; varying float vStr; varying vec3 vW;
  void main(){
    float n=fbm(vW.xz*0.22+vec2(3.1,1.7)); float n2=vnoise(vW.xz*0.9+uTime*0.35);
    float edge=abs(vU); float a;
    if(uMode<0.5){
      float body=smoothstep(1.0,0.35,edge);
      float fresh=pow(1.0-vAge,1.6);
      float m=n*0.8+n2*0.35+fresh*0.55-0.25*edge;
      float lace=texture2D(tFoam,vW.xz*0.12).r*0.6+texture2D(tFoam,vW.xz*0.31+0.2).r*0.4;
      float persist=0.46+0.54*fresh;
      float amt=clamp(persist*1.1*(0.55+0.6*n)-0.28*edge,0.0,1.0)*smoothstep(1.0,0.7,vAge);
      a=body*vStr*(smoothstep(1.0-amt,1.0-amt+0.18,lace)*min(1.0,amt*1.8)+texture2D(tFoam,vW.xz*0.6).g*amt*0.45) + body*fresh*fresh*vStr*0.3 + body*vStr*0.17*smoothstep(1.0,0.5,vAge);
    } else {
      float line=smoothstep(0.72,0.9,edge)*smoothstep(1.0,0.94,edge);
      a=line*pow(1.0-vAge,1.8)*vStr*smoothstep(0.3,0.6,n+n2*0.3);
    }
    vec3 foamCol=vec3(0.93,0.97,1.0)*(uAmbient*0.9+uSunColor*max(uSunDir.y,0.0)*0.8);
    float dist=length(cameraPosition-vW);
    gl_FragColor=vec4(mix(foamCol,uFogColor,fogF(dist)),clamp(a,0.0,1.0)*(1.0-fogF(dist)*0.7));
    ${TAIL}
  }`
});
class Wake{
  constructor(max, mode, w0, spread, life){
    const NC=7; Object.assign(this,{max,w0,spread,life,pts:[],NC});
    const g=new THREE.BufferGeometry();
    this.pos=new Float32Array(max*NC*3); this.age=new Float32Array(max*NC); this.u=new Float32Array(max*NC); this.str=new Float32Array(max*NC);
    for(let i=0;i<max;i++) for(let c=0;c<NC;c++) this.u[i*NC+c]=1-2*c/(NC-1);
    g.setAttribute('position',new THREE.BufferAttribute(this.pos,3)); g.setAttribute('aAge',new THREE.BufferAttribute(this.age,1));
    g.setAttribute('aU',new THREE.BufferAttribute(this.u,1)); g.setAttribute('aStr',new THREE.BufferAttribute(this.str,1));
    const idx=[]; for(let i=0;i<max-1;i++) for(let c=0;c<NC-1;c++){ const a=i*NC+c, b=a+NC; idx.push(a,a+1,b,a+1,b+1,b); } g.setIndex(idx);
    this.geo=g; this.mesh=new THREE.Mesh(g,wakeMat(mode)); this.mesh.frustumCulled=false; this.mesh.renderOrder=1; scene.add(this.mesh);
  }
  add(x,z,sx,sz,str,sp,t){ this.pts.push({x,z,sx,sz,str,sp,t}); if(this.pts.length>this.max-1) this.pts.shift(); }
  last(){ return this.pts[this.pts.length-1]; }
  update(t, head, drift){
    while(this.pts.length && t-this.pts[0].t>this.life) this.pts.shift();
    const list=this.pts.slice(); if(head) list.push(head);
    let n=0; const NC=this.NC;
    for(const p of list){
      if(drift) p.x+=drift;
      const age=t-p.t, w=this.w0+(this.life>100?Math.sqrt(age)*2.4:age)*this.spread*p.sp, a=clamp(age/this.life,0,1);
      for(let c=0;c<NC;c++){ const k=n*NC+c, f=(1-2*c/(NC-1))*w; this.pos[k*3]=p.x+p.sx*f; this.pos[k*3+1]=0; this.pos[k*3+2]=p.z+p.sz*f; this.age[k]=a; this.str[k]=p.str; }
      n++;
    }
    if(head && drift) head.x-=drift;
    this.geo.setDrawRange(0,Math.max(0,n-1)*(NC-1)*6);
    for(const k of ['position','aAge','aStr']) this.geo.attributes[k].needsUpdate=true;
  }
}
const wakeT=new Wake(420,0,SHIP_B*0.40,0.085,150);
const wakeK=new Wake(140,1,SHIP_B*0.5,0.34,30); wakeK.mesh.visible=false;
cargos.forEach(c=>{ c.wake=new Wake(160,0,c.beam*0.45,0.05,90); c.wakeK=new Wake(120,1,c.beam*0.5,0.3,45); c.wakeK.mesh.visible=false; });

/* ============================================================
   Spray particles
   ============================================================ */
const SP_N=16000;
const spray={ pos:new Float32Array(SP_N*3), vel:new Float32Array(SP_N*3), life:new Float32Array(SP_N), max:new Float32Array(SP_N), size:new Float32Array(SP_N),
  aSize:new Float32Array(SP_N), aAlpha:new Float32Array(SP_N), cur:0 };
const spGeo=new THREE.BufferGeometry();
spGeo.setAttribute('position',new THREE.BufferAttribute(spray.pos,3));
spGeo.setAttribute('aSize',new THREE.BufferAttribute(spray.aSize,1));
spGeo.setAttribute('aAlpha',new THREE.BufferAttribute(spray.aAlpha,1));
const spMat=new THREE.ShaderMaterial({ uniforms:U, transparent:true, depthWrite:false, fog:false,
  vertexShader:`uniform float uScale; attribute float aSize; attribute float aAlpha; varying float vA;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); float ps=aSize*uScale/max(-mv.z,0.5); gl_PointSize=clamp(ps,1.3,14.0); vA=aAlpha*clamp(ps/1.3,0.25,1.0); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: COMMON + `varying float vA;
    void main(){ if(vA<=0.001) discard; vec2 c=gl_PointCoord-0.5; float r=length(c)*2.0; if(r>1.0) discard;
      float a=(1.0-smoothstep(0.55,1.0,r))*vA;
      vec3 col=vec3(0.95,0.98,1.0)*(uAmbient*1.0+uSunColor*max(uSunDir.y,0.0)*0.9);
      col+=uSunColor*0.35*(1.0-smoothstep(0.0,0.45,length(c-vec2(-0.14,0.14))*2.0));
      gl_FragColor=vec4(col,a*0.88); ${TAIL} }`
});
const spPoints=new THREE.Points(spGeo,spMat); spPoints.frustumCulled=false; spPoints.renderOrder=3; scene.add(spPoints);
const dropSize=(k)=>rnd()<0.92?0.016+rnd()*0.055:0.08+rnd()*0.18*k;
function emit(x,y,z,vx,vy,vz,life,size){
  const i=spray.cur; spray.cur=(spray.cur+1)%SP_N;
  spray.pos[i*3]=x; spray.pos[i*3+1]=y; spray.pos[i*3+2]=z;
  spray.vel[i*3]=vx; spray.vel[i*3+1]=vy; spray.vel[i*3+2]=vz;
  spray.life[i]=life; spray.max[i]=life; spray.size[i]=size;
}
let rippleCool=0;
function updateSpray(dt,t){
  for(let i=0;i<SP_N;i++){
    if(spray.life[i]<=0){ spray.aAlpha[i]=0; spray.aSize[i]=0; continue; }
    const k=i*3;
    spray.vel[k+1]-=9.8*dt; const drag=1-dt*0.9; spray.vel[k]*=drag; spray.vel[k+1]*=(1-dt*0.3); spray.vel[k+2]*=drag;
    spray.pos[k]+=spray.vel[k]*dt; spray.pos[k+1]+=spray.vel[k+1]*dt; spray.pos[k+2]+=spray.vel[k+2]*dt;
    spray.life[i]-=dt;
    if(spray.vel[k+1]<0 && spray.pos[k+1]<waveH(spray.pos[k],spray.pos[k+2],t,3)){
      spray.life[i]=0; if(rnd()<0.25) fleck(spray.pos[k]+(rnd()-.5)*0.6,spray.pos[k+2]+(rnd()-.5)*0.6,3+rnd()*6,0.1+rnd()*0.18);
      if(rippleCool<=0 && spray.size[i]>0.7){ addRipple(spray.pos[k],spray.pos[k+2],0.35+rnd()*0.3,t); rippleCool=0.07; }
    }
    const f=clamp(spray.life[i]/spray.max[i],0,1);
    spray.aAlpha[i]=Math.pow(f,0.7); spray.aSize[i]=spray.size[i]*(spray.size[i]>0.3?(1.6-0.6*f):(1.15-0.15*f));
  }
  rippleCool-=dt;
  spGeo.attributes.position.needsUpdate=true; spGeo.attributes.aSize.needsUpdate=true; spGeo.attributes.aAlpha.needsUpdate=true;
}
let ripIdx=0;
function addRipple(x,z,amp,t){ U.uRipples.value[ripIdx].set(x,z,t,amp); ripIdx=(ripIdx+1)%24; }
