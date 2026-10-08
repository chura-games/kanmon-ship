/* 関門汽船 運転シミュレーター — ステージ：海峡ごとの地形・桟橋・潮流・渦潮・通過ゲートの定義（?stage=naruto で鳴門海峡編） */
'use strict';
/* 自然のコース（wild:true）は護岸・街灯なし。sights は観察ポイント（近くで速度を落として need 秒とどまると観察完了。min より近づくと離れるよう注意される）。
   side:'n'/'s' と off を書くと、その岸から off m 沖に置く。forest は岸沿いの木、ice は流氷、water は水の色（深い所 / 光が散る所）、land は地面の色。 */
/* 座標は x: 東, z: 南, 1 = 1m。岸の線は z0 + 正弦波 + 橋の位置での張り出し(bump) + 台形の出入り(plats: [量, 始点x, 終点x, なだらかさ]) */
const STAGES = {
  kanmon: {
    id:'kanmon', name:'関門海峡', title:'関門汽船 運転シミュレーター — 唐戸⇄門司港',
    heading:'<small>関門海峡 連絡船</small>唐戸 ⇄ 門司港<br>運転シミュレーター',
    intro:'下関・唐戸桟橋から対岸の門司港桟橋まで、約1.3kmの海峡を渡ります。航路を横切る大型船と、刻々と向きを変える潮流に注意して、ゆっくり桟橋に横付けしてください。',
    bridgeX:2300,
    north:{ z0:-620, sin:[[35,0.0041,0],[20,0.011,2]], bump:300, plats:[[175,-760,-250,45],[55,70,230,35],[45,-1500,-1150,20],[60,450,700,25],[40,920,1150,25],[-30,1300,1420,18]] },
    south:{ z0:630, sin:[[30,0.0033,1],[18,0.009,0]], bump:-290, plats:[[90,340,460,22],[-62,-420,-120,25],[40,-720,-560,20],[-45,650,900,25],[-35,1080,1280,25]] },
    hills:[[2700,-1200,420,230],[1850,1180,430,175]],   // 火の山 / 和布刈・古城山
    piers:[
      { key:'karato', name:'唐戸', x:-150, north:true, style:'karato', sign:['関門汽船唐戸1号桟橋','KARATO PIER 1'], office:'関門汽船  唐戸のりば' },
      { key:'moji', name:'門司港', x:250, north:false, style:'moji', sign:['門司港桟橋','MOJIKO PIER  関門汽船のりば'], office:'関門汽船  門司港のりば' },
    ],
    tide:{ amp:0.95, narrows:1.8 },
    city:{ max:1500, core:[-300,350], height:1 },
    cargos:[ {len:130,beam:21,hex:'#1d2b3a',z:-150,dir:1,spd:6.2,x:-2600}, {len:150,beam:24,hex:'#2e3b2f',z:110,dir:-1,spd:5.4,x:1800}, {len:95,beam:16,hex:'#4a3a2a',z:-40,dir:1,spd:4.6,x:-600} ],
    buoys:[[-600,-240,'red'],[500,-230,'red'],[1400,-260,'red'],[-500,260,'green'],[700,250,'green'],[1500,230,'green']],
    map:[-1500,2700], whirls:[], gates:[], sights:[], fireworks:true,
  },
  naruto: {
    id:'naruto', name:'鳴門海峡', title:'関門汽船 運転シミュレーター — 鳴門海峡編',
    heading:'<small>鳴門海峡 うずしお航路</small>亀浦 ⇄ 福良<br>渦潮くぐり',
    intro:'大鳴門橋の下、渦潮が巻く鳴門海峡を抜けて対岸の港へ向かいます。決められたゲートを順番に通ってください。渦は強くなったり弱くなったりしながら船を引き込みます。渦の中に長くいると浸水が進み、100% で沈没します。巻き込まれたら舵を外へ切り、全速で抜けてください。',
    bridgeX:0,
    north:{ z0:-600, sin:[[30,0.0037,0.5],[18,0.012,1]], bump:250, plats:[[70,-1040,-760,40],[-50,520,760,30]] },
    south:{ z0:610, sin:[[28,0.0031,2],[16,0.01,0]], bump:-250, plats:[[-70,760,1040,40],[55,-800,-520,30]] },
    hills:[[-500,-1150,460,210],[700,-1250,420,160],[450,1150,480,230],[-900,1300,400,150]],
    piers:[
      { key:'kameura', name:'亀浦', x:-900, north:true, style:'karato', sign:['うずしお汽船 亀浦桟橋','KAMEURA PIER'], office:'うずしお汽船  亀浦のりば' },
      { key:'fukura', name:'福良', x:900, north:false, style:'moji', sign:['福良桟橋','FUKURA PIER  うずしお汽船のりば'], office:'うずしお汽船  福良のりば' },
    ],
    tide:{ amp:1.5, narrows:1.2 },
    city:{ max:420, core:[-900,900], height:0.45 },
    cargos:[], buoys:[],
    map:[-2100,2100],
    /* 渦潮: 中心 x,z / 縁の半径 R / 回る向き spin（+1 は地図で時計回り）/ 縁での流速 v (m/s) / 中心のくぼみ depth (m) / 強弱の周期 T (秒) と位相 ph */
    whirls:[
      { x:-220, z:-90, R:64, spin:1,  v:5.0, depth:6.0, T:52, ph:0.0 },
      { x:-60,  z:110, R:80, spin:-1, v:5.6, depth:7.5, T:64, ph:2.1 },
      { x:110,  z:-60, R:72, spin:1,  v:5.3, depth:6.8, T:47, ph:4.0 },
      { x:260,  z:120, R:62, spin:-1, v:4.8, depth:5.6, T:58, ph:1.2 },
      { x:20,   z:-200,R:50, spin:-1, v:4.2, depth:4.8, T:41, ph:3.3 },
    ],
    /* 亀浦→福良の順に通るゲートの中心（福良→亀浦の便は逆順） */
    gates:[[-640,-300],[-380,-60],[-140,10],[25,25],[185,30],[420,190],[680,380]], sights:[],
  },
  okinawa: {
    id:'okinawa', name:'沖縄 クジラウォッチ', title:'関門汽船 運転シミュレーター — 沖縄 クジラウォッチ',
    heading:'<small>沖縄・慶良間の海</small>泊 ⇄ 座間味<br>クジラウォッチ',
    intro:'ザトウクジラが集まる冬の慶良間の海へ出ます。クジラのいる3か所を回り、それぞれ近くで速度を落として観察してから対岸の港に着けてください。近づきすぎは禁物です。100m ほど離れて見守りましょう。',
    wild:true, bridge:false, bridgeX:0, sea:1,
    north:{ z0:-950, sin:[[60,0.0027,0.4],[30,0.0083,1.1]], bump:0, plats:[[120,-1300,-900,60],[-80,300,700,50]] },
    south:{ z0:950, sin:[[55,0.0031,2.2],[28,0.0079,0.3]], bump:0, plats:[[-120,900,1300,60],[90,-600,-200,50]] },
    hills:[[-800,-1500,420,120],[900,1500,460,140],[200,-1600,380,90]],
    piers:[
      { key:'tomari', name:'泊', x:-1100, north:true, style:'karato', sign:['クジラウォッチ 泊桟橋','TOMARI PIER'], office:'クジラウォッチ  泊のりば' },
      { key:'zamami', name:'座間味', x:1100, north:false, style:'moji', sign:['座間味桟橋','ZAMAMI PIER  クジラウォッチのりば'], office:'クジラウォッチ  座間味のりば' },
    ],
    tide:{ amp:0.4, narrows:0 }, city:{ max:160, core:[-1100,1100], height:0.35 }, cargos:[], buoys:[],
    map:[-2100,2100], whirls:[], gates:[],
    water:{ deep:[0.0,0.045,0.085], scat:[0.02,0.30,0.33] },
    land:{ quay:'#eadfbe', city:'#ddd4ae', city2:'#cfc79f', plaza:'#e4d6b0', g1:'#2f7a3a', g2:'#63b04c', rock:'#6b8a50' },
    forest:{ n:520, x:[-1900,1900], d:[10,170], size:1.1, colors:['#2f7a3a','#4f9a45','#3b8a52','#6fb357'] },
    sights:[
      { kind:'whale', name:'ザトウクジラの親子', x:-420, z:-180, need:7, r:150, min:55 },
      { kind:'whale', name:'ブリーチングするクジラ', x:180, z:260, need:7, r:150, min:55 },
      { kind:'whale', name:'クジラの群れ', x:700, z:-120, need:7, r:150, min:55 },
    ],
  },
  hokkaido: {
    id:'hokkaido', name:'北海道 流氷・ヒグマウォッチ', title:'関門汽船 運転シミュレーター — 北海道 流氷・ヒグマウォッチ',
    heading:'<small>オホーツク海・知床</small>網走 ⇄ ウトロ<br>流氷・ヒグマウォッチ',
    intro:'流氷に覆われたオホーツクの海を進みます。氷の間の水路をゲートに沿って抜け、岸に出てくるヒグマを3か所で観察してから対岸の港に着けてください。流氷に速く当たると「接触」になります。氷の近くではゆっくり進みましょう。',
    wild:true, bridge:false, bridgeX:0, sea:0, life:false,
    north:{ z0:-560, sin:[[40,0.0033,0.8],[22,0.0097,2.0]], bump:0, plats:[[90,-200,200,50],[-60,-1300,-1000,40]] },
    south:{ z0:560, sin:[[38,0.0029,1.6],[20,0.0103,0.2]], bump:0, plats:[[-90,350,700,50],[70,-750,-450,40]] },
    hills:[[-300,-1250,520,300],[600,1300,560,360],[-1200,1200,420,220],[1300,-1300,460,260]],
    piers:[
      { key:'abashiri', name:'網走', x:-1000, north:true, style:'karato', sign:['流氷観光船 網走桟橋','ABASHIRI PIER'], office:'流氷観光船  網走のりば' },
      { key:'utoro', name:'ウトロ', x:1000, north:false, style:'moji', sign:['ウトロ桟橋','UTORO PIER  流氷観光船のりば'], office:'流氷観光船  ウトロのりば' },
    ],
    tide:{ amp:0.3, narrows:0 }, city:{ max:120, core:[-1000,1000], height:0.3 }, cargos:[], buoys:[],
    map:[-2100,2100], whirls:[],
    gates:[[-700,-300],[-430,-90],[-150,120],[150,-60],[420,140],[720,330]],
    water:{ deep:[0.002,0.012,0.03], scat:[0.03,0.10,0.15] },
    land:{ quay:'#e3e9ee', city:'#eef2f5', city2:'#dfe6ea', plaza:'#d5dde2', g1:'#eef3f6', g2:'#cdd8df', rock:'#8f9ba3' },
    forest:{ n:420, x:[-1900,1900], d:[14,190], size:1.25, colors:['#1f3d2c','#f2f6f8','#274a36','#e6edf1'] },
    ice:{ n:190, x:[-820,820], lane:55, shore:35 },
    sights:[
      { kind:'bear', name:'岸を歩くヒグマ', x:-520, side:'n', off:120, need:6, r:110 },
      { kind:'bear', name:'ヒグマの親子', x:60, side:'s', off:120, need:6, r:110 },
      { kind:'bear', name:'鮭をねらうヒグマ', x:560, side:'n', off:120, need:6, r:110 },
    ],
  },
  jungle: {
    id:'jungle', name:'ジャングルクルーズ', title:'関門汽船 運転シミュレーター — ジャングルクルーズ',
    heading:'<small>密林の大河</small>船着き場 ⇄ 遺跡の桟橋<br>ジャングルクルーズ',
    intro:'曲がりくねった密林の川を下ります。水浴びするゾウ、カバの群れ、岸のワニ、古い遺跡の4か所で速度を落として観察し、終点の桟橋に着けてください。川幅は狭いので、岸に乗り上げないよう早めに舵を切りましょう。',
    wild:true, bridge:false, bridgeX:0, sea:0, life:false,
    north:{ z0:-80, sin:[[150,0.0042,0],[25,0.0091,1.3]], bump:0, plats:[[-70,-1250,-990,45],[-55,-760,-460,40],[-50,560,900,40]] },
    south:{ z0:80, sin:[[150,0.0042,0],[25,0.0091,1.3]], bump:0, plats:[[70,990,1250,45],[55,-240,60,40],[50,200,480,40]] },
    hills:[[-500,-900,420,160],[600,900,460,190],[1400,-800,380,140]],
    piers:[
      { key:'landing', name:'船着き場', x:-1122, north:true, style:'karato', sign:['ジャングルクルーズ 船着き場','JUNGLE LANDING'], office:'ジャングルクルーズ  のりば' },
      { key:'ruins', name:'遺跡の桟橋', x:1122, north:false, style:'moji', sign:['遺跡の桟橋','TEMPLE PIER'], office:'ジャングルクルーズ  遺跡のりば' },
    ],
    tide:{ amp:0.35, narrows:0 }, city:{ max:0, core:[0,0], height:0.3 }, cargos:[], buoys:[],
    map:[-1600,1600], whirls:[], gates:[],
    water:{ deep:[0.016,0.026,0.010], scat:[0.11,0.12,0.045] },
    land:{ quay:'#6b5a3a', city:'#4f5f2e', city2:'#5a6a33', plaza:'#7a6844', g1:'#1f5a24', g2:'#3d7f2f', rock:'#3f5a30' },
    forest:{ n:1500, x:[-1900,1900], d:[6,170], size:1.5, colors:['#1f5a24','#2f7a2f','#17481f','#4a8f38'] },
    sights:[
      { kind:'elephant', name:'水浴びするゾウ', x:-610, side:'n', off:70, need:6, r:95 },
      { kind:'hippo', name:'カバの群れ', x:-90, side:'s', off:65, need:6, r:95, min:28 },
      { kind:'croc', name:'岸のワニ', x:340, side:'s', off:60, need:6, r:90 },
      { kind:'temple', name:'密林の遺跡', x:730, side:'n', off:70, need:6, r:100 },
    ],
  },
};
const STAGE = STAGES[new URLSearchParams(location.search).get('stage')] || STAGES.kanmon;
