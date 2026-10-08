/* 関門汽船 運転シミュレーター — 起動：コースを選んでもらい、3Dモデル models/*.glb（Blender で編集できる）とゲーム本体を読み込む */
'use strict';
const MODEL_FILES = { ferry:'models/ferry.glb' };
const GAME_SCRIPTS = ['js/stage.js','js/core.js','js/world.js','js/ferry.js','js/effects.js','js/game.js','js/route.js','js/nature.js','js/auto.js','js/ui.js','js/main.js'];
const MODELS = {
  loaded:{},
  /* モデルを新しいグループに入れて返す。部品は find / mesh で名前から探す */
  take(name){ const g=new THREE.Group(); g.name=name; g.add(MODELS.loaded[name]);
    g.traverse(o=>{ if(o!==g) o.name=o.name.replace(/__glb$/,'');   // 書き出し時に付いた接尾辞は無視する
      if(!o.isMesh) return; for(const m of [].concat(o.material)) for(const k of ['map','emissiveMap','roughnessMap']) if(m[k]) m[k].anisotropy=8; });
    return g; },
  /* Blender 上のオブジェクト名で部品を探す。消したり名前を変えたりした部品はここで分かる */
  has(root,name){ return !!root.getObjectByName(name); },
  find(root,name){ const o=root.getObjectByName(name); if(!o) throw new Error(MODEL_FILES[root.name]+' に「'+name+'」という名前のオブジェクトがありません'); return o; },
  /* その部品のメッシュ（Blender で複数マテリアルにすると入れ子になるので、最初の1つ） */
  mesh(root,name){ let m=null; MODELS.find(root,name).traverse(o=>{ if(!m && o.isMesh) m=o; }); if(!m) throw new Error(MODEL_FILES[root.name]+' の「'+name+'」にメッシュがありません'); return m; },
};
/* 出航ボタンに準備の進み具合を出す。js/main.js が 3D の準備を終えたら done() で押せるようにする */
const BOOT = { start:document.querySelector('#start'), label:document.querySelector('#start').textContent,
  progress(text){ BOOT.start.disabled=true; BOOT.start.textContent=text; },
  done(){ BOOT.start.disabled=false; BOOT.start.textContent=BOOT.label; } };
/* 最初はコース選択だけを出す。3D の世界は選ばれたコースの分だけ作る（js/stage.js が URL の ?stage= を見る）。
   モデルのファイルは選んでいる間に受け取っておくが、展開するのは選ばれてから */
(function boot(){
  const start=BOOT.start, select=document.querySelector('#select'), intro=document.querySelector('#intro');
  const files=Object.keys(MODEL_FILES).map(name=>fetch(MODEL_FILES[name]).then(r=>{ if(!r.ok) throw 0; return r.arrayBuffer(); }).catch(()=>{ throw new Error(MODEL_FILES[name]+' を読み込めません'); }));
  files.forEach(p=>p.catch(()=>{}));   // 失敗はコースを選んだあとで表示する
  const chosen=new Promise(res=>{
    const id=new URLSearchParams(location.search).get('stage');
    if(document.querySelector('.course[data-stage="'+id+'"]')) return res();   // コース付きの URL で開いたときはそのまま始める
    select.hidden=false;
    select.querySelectorAll('.course').forEach(b=>b.onclick=()=>{ history.replaceState(null,'','?stage='+b.dataset.stage); select.hidden=true; res(); });
    select.querySelector('.course').focus();
  });
  const parseModel=(name,buf)=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,'',g=>{ MODELS.loaded[name]=g.scene; res(); },()=>rej(new Error(MODEL_FILES[name]+' を読み込めません'))));
  const loadScript=src=>new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error(src+' を読み込めません')); document.body.appendChild(s); });
  chosen.then(()=>{ intro.hidden=false; BOOT.progress('読み込み中…'); return Promise.all(files); })
    .then(bufs=>Promise.all(Object.keys(MODEL_FILES).map((name,i)=>parseModel(name,bufs[i]))))
    .then(()=>GAME_SCRIPTS.reduce((p,src)=>p.then(()=>loadScript(src)),Promise.resolve()))
    .catch(e=>{ console.error(e); start.textContent='読み込みに失敗しました';
      const p=document.createElement('p'); p.textContent=e.message+(location.protocol==='file:'?'。index.html を直接開くと 3D モデルを読み込めません。README の手順で簡易サーバーから開いてください。':'');
      start.parentNode.insertBefore(p,start); });
})();
