/* 関門汽船 運転シミュレーター — 花火：夜になると両岸から打ち上がる（関門海峡花火大会。stage.js で fireworks:true のコースだけ） */
'use strict';
const FW=(()=>{
  const on=!!STAGE.fireworks, N=on?14000:1;
  const pos=new Float32Array(N*3), vel=new Float32Array(N*3), c0=new Float32Array(N*3), aCol=new Float32Array(N*3), aSize=new Float32Array(N);
  const life=new Float32Array(N), max=new Float32Array(N), size=new Float32Array(N), drag=new Float32Array(N), grav=new Float32Array(N), tw=new Uint8Array(N);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('aCol',new THREE.BufferAttribute(aCol,3)); geo.setAttribute('aSize',new THREE.BufferAttribute(aSize,1));
  /* uMirror 1 draws each star where its reflection meets the water as seen from the camera (used when the water has no real reflections),
     pulled a little way up the line of sight so the waves do not hide it */
  const mkMat=mirror=>new THREE.ShaderMaterial({ uniforms:{uScale:U.uScale,uMirror:{value:mirror}}, transparent:true, depthWrite:false, fog:false, blending:THREE.AdditiveBlending,
    vertexShader:`uniform float uScale; uniform float uMirror; attribute vec3 aCol; attribute float aSize; varying vec3 vC;
      void main(){ vec3 p=position; vC=aCol; float k=1.0;
        if(uMirror>0.5){ float c=max(cameraPosition.y,0.5), h=max(p.y,0.0); k=c/(c+h);
          p=vec3(mix(cameraPosition.x,p.x,k),0.0,mix(cameraPosition.z,p.z,k)); p=mix(p,cameraPosition,0.03); vC*=0.28; }
        vec4 mv=viewMatrix*vec4(p,1.0); gl_PointSize=clamp(aSize*uScale*k/max(-mv.z,1.0),2.2,13.0);
        gl_Position=aSize>0.0?projectionMatrix*mv:vec4(2.0,2.0,2.0,1.0); }`,
    fragmentShader:`varying vec3 vC; void main(){ float r=length(gl_PointCoord-0.5)*2.0; gl_FragColor=vec4(vC*exp(-r*r*3.5),1.0); }` });
  const points=new THREE.Points(geo,mkMat(0)), mirror=new THREE.Points(geo,mkMat(1));
  for(const p of [points,mirror]){ p.frustumCulled=false; p.renderOrder=5; p.visible=false; if(on) scene.add(p); }
  // launching places: a few along the quay on each shore, either side of the pier
  const sites={}; let keys=[];
  if(on){ for(const key in PIERS){ const P=PIERS[key]; sites[key]=[-190,-95,70,160,250].map(o=>{ const x=P.x+o, z=shoreZ(P,x,4); return {x,z,y:Math.max(3.4,terrainH(x,z))}; }); } keys=Object.keys(sites); }
  const PAL=[[1,.22,.18],[1,.5,.12],[1,.82,.32],[.3,1,.38],[.28,.55,1],[.72,.38,1],[1,.38,.72],[.9,.95,1]], GOLD=[1,.68,.28];
  const shells=[]; let cur=0, live=0, nextT=2, volley=0, vKey=0, side=0, flash=0, was=false, ambKey='';
  const flashCol=[1,1,1], amb0=new THREE.Color();
  function star(x,y,z,vx,vy,vz,lf,c,sz,dr,gr,twinkle){
    const i=cur, k=i*3; cur=(cur+1)%N;
    pos[k]=x; pos[k+1]=y; pos[k+2]=z; vel[k]=vx; vel[k+1]=vy; vel[k+2]=vz; c0[k]=c[0]; c0[k+1]=c[1]; c0[k+2]=c[2];
    life[i]=max[i]=lf; size[i]=sz; drag[i]=dr; grav[i]=gr; tw[i]=twinkle?1:0; }
  function launch(key,big){
    const s=sites[key][Math.floor(rnd()*sites[key].length)], h=(170+rnd()*130)*(big?1.25:1), r=rnd();
    shells.push({x:s.x+(rnd()-.5)*8,z:s.z+(rnd()-.5)*4,y0:s.y,h,t:0,T:2.0+h/200,dx:(rnd()-.5)*26,dz:(rnd()-.5)*14,big,
      type:r<0.36?'peony':r<0.56?'double':r<0.7?'ring':r<0.86?'willow':'crackle', c:PAL[Math.floor(rnd()*PAL.length)]}); }
  function sphere(x,y,z,n,v,c,lf,sz,dr,gr,twinkle){
    for(let i=0;i<n;i++){ const u=rnd()*2-1, a=rnd()*6.283, q=Math.sqrt(1-u*u), sp=v*(0.9+rnd()*0.2);
      star(x,y,z,q*Math.cos(a)*sp,u*sp,q*Math.sin(a)*sp,lf*(0.8+rnd()*0.4),c,sz,dr,gr,twinkle); } }
  function burst(s,x,y,z){
    const k=s.big?1.3:1, c=s.c;
    if(s.type==='peony') sphere(x,y,z,340,112*k,c,2.6,4.2*k,1.25,3);
    else if(s.type==='double'){ sphere(x,y,z,300,116*k,c,2.7,4.2*k,1.25,3); sphere(x,y,z,120,52*k,PAL[Math.floor(rnd()*PAL.length)],2.2,3.8*k,1.25,3); }
    else if(s.type==='ring'){ const tx=rnd()*1.2-0.6, tz=rnd()*1.2-0.6, n=150; sphere(x,y,z,50,24,PAL[7],1.5,3.4,1.5,3);
      for(let i=0;i<n;i++){ const a=i/n*6.283, sp=104*k, vx=Math.cos(a), vz=Math.sin(a); star(x,y,z,vx*sp,(vx*tx+vz*tz)*sp,vz*sp,2.3+rnd()*0.4,c,4.4*k,1.25,3); } }
    else if(s.type==='willow') sphere(x,y,z,300,74*k,GOLD,4.6,3.4*k,0.9,9,true);
    else { sphere(x,y,z,280,96*k,PAL[2],3.1,3.8*k,1.25,3.5,true); for(let i=0;i<5;i++) setTimeout(()=>sfx.splash(0.05,3000+Math.random()*2500,0.12,2),(1200+i*190+Math.random()*120)); }
    const d=camera.position.distanceTo(_fp.set(x,y,z)), near=260/(d+200);
    if(near*k>flash){ flash=Math.min(1,near*k); flashCol[0]=c[0]; flashCol[1]=c[1]; flashCol[2]=c[2]; }
    sfx.boom(clamp(near*0.55*k,0.05,0.7),d/340); }
  const _fp=new THREE.Vector3();
  function update(dt){
    if(!on) return;
    const night=U.uNight.value>0.8;
    if(night!==was){ was=night; if(night){ nextT=1.5; if(game.simT>2) toast('花火大会が始まりました','ok'); } }
    if(!night && !live && !shells.length && flash<0.01){ if(points.visible){ points.visible=mirror.visible=false; flash=0; lightUp(); } return; }
    points.visible=true; mirror.visible=U.uReflOn.value<0.5;
    if(night){ nextT-=dt;
      if(nextT<=0){
        if(volley>0){ volley--; launch(keys[vKey],false); nextT=0.14+rnd()*0.2; if(!volley) nextT=1.5+rnd(); }
        else if(rnd()<0.1){ volley=8+Math.floor(rnd()*9); vKey=side=(side+1)%keys.length; nextT=0.1; }   // a rapid volley from one shore
        else { if(rnd()<0.7) side=(side+1)%keys.length; launch(keys[side],rnd()<0.22); nextT=0.5+rnd()*1.5; } } }
    // shells on the way up, trailing sparks
    for(let i=shells.length-1;i>=0;i--){ const s=shells[i]; s.t+=dt; const u=Math.min(1,s.t/s.T), x=s.x+s.dx*u, y=s.y0+s.h*(1-(1-u)*(1-u)), z=s.z+s.dz*u;
      if(u>=1){ shells.splice(i,1); burst(s,x,y,z); } else if(u<0.9) star(x,y,z,(rnd()-.5)*2,-4-rnd()*4,(rnd()-.5)*2,0.35+rnd()*0.3,GOLD,2.2,1,4); }
    live=0;
    for(let i=0;i<N;i++){ const k=i*3;
      if(life[i]<=0){ if(aSize[i]!==0){ aSize[i]=0; aCol[k]=aCol[k+1]=aCol[k+2]=0; } continue; }
      const dr=Math.exp(-drag[i]*dt); vel[k]*=dr; vel[k+1]=vel[k+1]*dr-grav[i]*dt; vel[k+2]*=dr;
      pos[k]+=vel[k]*dt; pos[k+1]+=vel[k+1]*dt; pos[k+2]+=vel[k+2]*dt; life[i]-=dt;
      if(life[i]<=0 || pos[k+1]<0.3){ life[i]=0; continue; }
      live++;
      const f=life[i]/max[i], hot=clamp((f-0.85)/0.15,0,1); let b=Math.min(1,f*3.5)*1.25;   // white-hot at first, fading out at the end
      if(tw[i] && f<0.65) b*=rnd()<0.45?0.15:1.5;
      aCol[k]=(c0[k]+(1-c0[k])*hot)*b; aCol[k+1]=(c0[k+1]+(1-c0[k+1])*hot)*b; aCol[k+2]=(c0[k+2]+(1-c0[k+2])*hot)*b; aSize[i]=size[i]; }
    geo.attributes.position.needsUpdate=true; geo.attributes.aCol.needsUpdate=true; geo.attributes.aSize.needsUpdate=true;
    flash*=Math.exp(-dt*2.4); lightUp();
  }
  /* each burst lights the sea, the shore and the ship for a moment */
  function lightUp(){ const p=TOD[todKey]; if(ambKey!==todKey){ ambKey=todKey; amb0.copy(lc(p.amb)).multiplyScalar(p.ambI); }
    const a=U.uAmbient.value, f=flash*0.55; a.r=amb0.r+flashCol[0]*f; a.g=amb0.g+flashCol[1]*f; a.b=amb0.b+flashCol[2]*f; hemi.intensity=p.hemiI+flash*0.5; }
  return {on,update,points,mirror};
})();
const updateFireworks=FW.update;
