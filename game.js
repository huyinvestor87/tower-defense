const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const field = document.querySelector('#battlefield');
const $ = (id) => document.getElementById(id);

const towerTypes = [
  { id:'pulse', name:'Pulse Cannon', icon:'⌾', cost:120, damage:18, range:115, rate:.7, color:'#50d8ff', desc:'Reliable energy bursts' },
  { id:'rail', name:'Rail Driver', icon:'◇', cost:220, damage:48, range:165, rate:1.55, color:'#ffd166', desc:'Long-range heavy impact' },
  { id:'frost', name:'Cryo Field', icon:'❄', cost:175, damage:7, range:100, rate:.45, color:'#9d8cff', desc:'Slows clustered threats' },
  { id:'arc', name:'Arc Node', icon:'ϟ', cost:280, damage:28, range:125, rate:.9, color:'#5bf2bb', desc:'Chains between targets' }
];
// Serpentine route: four vertical runs so a wide battlefield stays interesting.
// It ends at the lower-centre so the side drawer never covers the core.
const PATH=[[0,.18],[.15,.18],[.23,.6],[.41,.6],[.49,.2],[.67,.2],[.75,.62],[.86,.62],[.9,.88],[.72,.88]];
const state = { credits:500, lives:20, wave:0, speed:1, paused:false, running:false, placing:null, selected:null, enemies:[], towers:[], shots:[], fx:[], spawned:0, total:0, nextSpawn:0, audio:true };
let view={w:0,h:0,dpr:1}, last=performance.now(), raf, toastTimer, audioContext, musicGain, musicClock=0, musicStep=0, hover=null;

// Ambient background loop: Am–F–C–G arpeggio, 8 steps per chord (rests add breathing room)
const MUSIC_STEP=.42;
const musicPattern=[
  220,261.63,329.63,261.63,220,329.63,261.63,0,       // Am
  174.61,220,261.63,220,174.61,261.63,220,0,          // F
  261.63,329.63,392,329.63,261.63,392,329.63,0,       // C
  196,246.94,293.66,246.94,196,293.66,246.94,0        // G
];

function shop(){
  $('shop').innerHTML=towerTypes.map(t=>`<button class="tower-card" data-tower="${t.id}"><span class="tower-icon" style="color:${t.color}">${t.icon}</span><span><b>${t.name}</b><small>${t.desc}</small></span><span class="cost">◆ ${t.cost}</span></button>`).join('');
  document.querySelectorAll('.tower-card').forEach(b=>b.addEventListener('click',()=>beginPlacement(b.dataset.tower)));
}
function resize(){
  const r=field.getBoundingClientRect(), oldW=view.w, oldH=view.h; view.dpr=Math.min(window.devicePixelRatio||1,2); view.w=r.width;view.h=r.height;
  if(oldW&&oldH&&(oldW!==view.w||oldH!==view.h))state.towers.forEach(t=>{t.x=t.x/oldW*view.w;t.y=t.y/oldH*view.h});
  canvas.width=Math.round(r.width*view.dpr);canvas.height=Math.round(r.height*view.dpr);canvas.style.width=`${r.width}px`;canvas.style.height=`${r.height}px`;
  ctx.setTransform(view.dpr,0,0,view.dpr,0,0); draw();
}
function pathMetrics(){const lengths=[];let total=0;for(let i=1;i<PATH.length;i++){const dx=(PATH[i][0]-PATH[i-1][0])*view.w,dy=(PATH[i][1]-PATH[i-1][1])*view.h;total+=Math.hypot(dx,dy);lengths.push(total)}return{lengths,total}}
function pathLength(){return Math.max(1,pathMetrics().total)}
function pathPoint(p){
  const {lengths,total}=pathMetrics();
  let d=Math.max(0,Math.min(1,p))*total,prev=0;
  for(let i=0;i<lengths.length;i++){if(d<=lengths[i]){const q=(d-prev)/((lengths[i]-prev)||1);return{x:(PATH[i][0]+(PATH[i+1][0]-PATH[i][0])*q)*view.w,y:(PATH[i][1]+(PATH[i+1][1]-PATH[i][1])*q)*view.h}}prev=lengths[i]}
  return{x:PATH[PATH.length-1][0]*view.w,y:PATH[PATH.length-1][1]*view.h};
}
function roadWidth(){return Math.max(40,Math.min(view.w,view.h)*.115)}
function blocked(p){const clear=roadWidth()/2+15;for(let i=0;i<=120;i++){const q=pathPoint(i/120);if(Math.hypot(q.x-p.x,q.y-p.y)<clear)return true}return state.towers.some(t=>Math.hypot(t.x-p.x,t.y-p.y)<46)}

function draw(){
  const {w,h}=view,now=performance.now()/1000;ctx.setTransform(view.dpr,0,0,view.dpr,0,0);
  const bg=ctx.createLinearGradient(0,0,w*.35,h);bg.addColorStop(0,'#0d2637');bg.addColorStop(.55,'#08192a');bg.addColorStop(1,'#05101c');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const grid=Math.max(32,Math.min(w,h)/14);ctx.strokeStyle='rgba(96,182,214,.07)';ctx.lineWidth=1;ctx.beginPath();for(let x=grid/2;x<w;x+=grid){ctx.moveTo(x,0);ctx.lineTo(x,h)}for(let y=grid/2;y<h;y+=grid){ctx.moveTo(0,y);ctx.lineTo(w,y)}ctx.stroke();
  drawRoute(now);drawPortal(now);drawCore(now);
  for(const t of state.towers)drawTower(t,now);
  for(const e of state.enemies)drawEnemy(e);
  for(const s of state.shots)drawShot(s);
  for(const f of state.fx)drawFx(f);
  drawGhost();
  const vg=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.34,w/2,h/2,Math.max(w,h)*.72);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.5)');ctx.fillStyle=vg;ctx.fillRect(0,0,w,h);
}
function drawRoute(now){
  const pts=[];for(let i=0;i<=90;i++)pts.push(pathPoint(i/90));
  const road=roadWidth(),trace=()=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y))};
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='rgba(80,216,255,.1)';ctx.lineWidth=road+18;trace();ctx.stroke();
  ctx.strokeStyle='rgba(80,216,255,.3)';ctx.lineWidth=road;trace();ctx.stroke();
  ctx.strokeStyle='#0f2a39';ctx.lineWidth=road-5;trace();ctx.stroke();
  ctx.strokeStyle='rgba(130,228,255,.32)';ctx.lineWidth=1.6;ctx.setLineDash([11,15]);ctx.lineDashOffset=-now*30;trace();ctx.stroke();
  ctx.restore();
}
function drawPortal(now){const p=pathPoint(0),r=15+Math.sin(now*2.4)*2.5;ctx.save();ctx.shadowColor='#ff6b7f';ctx.shadowBlur=20;ctx.strokeStyle='rgba(255,107,127,.85)';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(p.x+14,p.y,r,0,6.283);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,107,127,.3)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x+14,p.y,r+8,0,6.283);ctx.stroke();ctx.restore()}
function drawCore(now){const c=pathPoint(1),x=c.x,y=c.y,pulse=(now*.55)%1;ctx.save();ctx.strokeStyle=`rgba(91,242,187,${.4*(1-pulse)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,22+pulse*26,0,6.283);ctx.stroke();ctx.shadowColor='#5bf2bb';ctx.shadowBlur=26;ctx.fillStyle='#0c3440';ctx.beginPath();ctx.arc(x,y,23,0,6.283);ctx.fill();ctx.strokeStyle='#5bf2bb';ctx.lineWidth=2.5;ctx.stroke();ctx.shadowBlur=14;ctx.fillStyle='#c8fde9';ctx.beginPath();ctx.arc(x,y,7+Math.sin(now*3)*1.6,0,6.283);ctx.fill();ctx.restore()}
function drawTower(t,now){
  const type=towerTypes.find(x=>x.id===t.type),selected=state.selected===t,rng=type.range*(1+(t.level-1)*.1),flash=Math.max(0,t.flash||0),a=t.angle||0;
  ctx.save();
  if(selected){ctx.fillStyle='rgba(80,216,255,.06)';ctx.beginPath();ctx.arc(t.x,t.y,rng,0,6.283);ctx.fill();ctx.setLineDash([7,9]);ctx.lineDashOffset=-now*20;ctx.strokeStyle='rgba(80,216,255,.5)';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([])}
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(t.x,t.y+14,20,7,0,0,6.283);ctx.fill();
  ctx.shadowColor=type.color;ctx.shadowBlur=12+flash*90;
  const base=ctx.createRadialGradient(t.x-6,t.y-8,2,t.x,t.y,21);base.addColorStop(0,'#16394d');base.addColorStop(1,'#06161f');ctx.fillStyle=base;ctx.beginPath();ctx.arc(t.x,t.y,20,0,6.283);ctx.fill();ctx.shadowBlur=0;
  ctx.strokeStyle=selected?'#ffffff':type.color;ctx.lineWidth=2.2;ctx.stroke();
  ctx.lineCap='round';ctx.strokeStyle=type.color;ctx.lineWidth=6;ctx.globalAlpha=.92;ctx.beginPath();ctx.moveTo(t.x+Math.cos(a)*4,t.y+Math.sin(a)*4);ctx.lineTo(t.x+Math.cos(a)*(21+flash*28),t.y+Math.sin(a)*(21+flash*28));ctx.stroke();ctx.globalAlpha=1;
  if(flash>0){ctx.fillStyle=`rgba(255,248,220,${Math.min(.75,flash*6)})`;ctx.beginPath();ctx.arc(t.x+Math.cos(a)*25,t.y+Math.sin(a)*25,4+flash*45,0,6.283);ctx.fill()}
  ctx.fillStyle='#07202c';ctx.beginPath();ctx.arc(t.x,t.y,14,0,6.283);ctx.fill();
  ctx.fillStyle=type.color;ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(type.icon,t.x,t.y+1);
  for(let i=0;i<3;i++){ctx.fillStyle=i<t.level?'#ffd166':'rgba(120,160,180,.35)';ctx.beginPath();ctx.arc(t.x-7+i*7,t.y-24,2.4,0,6.283);ctx.fill()}
  if(t.ability>0){ctx.strokeStyle='rgba(185,146,255,.9)';ctx.lineWidth=2;ctx.setLineDash([4,6]);ctx.lineDashOffset=-now*36;ctx.beginPath();ctx.arc(t.x,t.y,26,0,6.283);ctx.stroke();ctx.setLineDash([])}
  ctx.restore();
}
function drawEnemy(e){
  const p=pathPoint(e.progress);e.x=p.x;e.y=p.y;const r=e.radius,hurt=Math.max(0,e.hurt||0);
  ctx.save();ctx.shadowColor=e.color;ctx.shadowBlur=15;
  const g=ctx.createRadialGradient(p.x-r*.4,p.y-r*.45,1,p.x,p.y,r);g.addColorStop(0,'#ffffff');g.addColorStop(.35,e.color);g.addColorStop(1,e.dark);ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,6.283);ctx.fill();ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1.4;ctx.stroke();
  if(e.chilled>0){ctx.strokeStyle='rgba(157,140,255,.75)';ctx.lineWidth=1.6;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(p.x,p.y,r+4,0,6.283);ctx.stroke();ctx.setLineDash([])}
  if(hurt>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(.65,hurt*4.5)})`;ctx.beginPath();ctx.arc(p.x,p.y,r+2,0,6.283);ctx.fill()}
  const bw=Math.max(24,r*2.6),bx=p.x-bw/2,by=p.y-r-10,f=Math.max(0,e.hp/e.maxHp);
  ctx.fillStyle='rgba(3,11,18,.85)';ctx.fillRect(bx-1,by-1,bw+2,5);ctx.fillStyle=f>.5?'#5bf2bb':f>.25?'#ffd166':'#ff6b7f';ctx.fillRect(bx,by,bw*f,3);
  ctx.restore();
}
function seg(x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function rnd(n){const x=Math.sin(n*127.1)*43758.5453;return x-Math.floor(x)}
function bolt(x1,y1,x2,y2,seed,k,color){
  const dx=x2-x1,dy=y2-y1,len=Math.max(1,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len,steps=8;
  ctx.globalAlpha=k;ctx.shadowColor=color;ctx.shadowBlur=18;ctx.beginPath();ctx.moveTo(x1,y1);
  for(let i=1;i<steps;i++){const q=i/steps,o=(rnd(seed+i)-.5)*Math.min(30,len*.24);ctx.lineTo(x1+dx*q+nx*o,y1+dy*q+ny*o)}
  ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=3.5;ctx.stroke();ctx.strokeStyle='#ffffff';ctx.lineWidth=1.3;ctx.stroke();
}
function drawShot(s){
  const k=Math.max(0,s.life/s.max);ctx.save();ctx.lineCap='round';
  if(s.type==='rail'){
    ctx.globalAlpha=k;ctx.shadowColor=s.color;ctx.shadowBlur=22;ctx.strokeStyle=s.color;ctx.lineWidth=3+7*k;seg(s.x,s.y,s.tx,s.ty);ctx.strokeStyle='#fffdf2';ctx.lineWidth=1+3*k;seg(s.x,s.y,s.tx,s.ty);
    ctx.fillStyle=`rgba(255,240,190,${k*.8})`;ctx.beginPath();ctx.arc(s.tx,s.ty,6+18*(1-k),0,6.283);ctx.fill();
  }else if(s.type==='arc'){
    bolt(s.x,s.y,s.tx,s.ty,s.seed,k,s.color);if(s.chain)bolt(s.tx,s.ty,s.chain.x,s.chain.y,s.seed+13,k*.85,s.color);
  }else if(s.type==='frost'){
    ctx.globalAlpha=k*.85;ctx.shadowColor=s.color;ctx.shadowBlur=16;ctx.strokeStyle=s.color;ctx.lineWidth=4;ctx.setLineDash([6,7]);ctx.lineDashOffset=-performance.now()/28;seg(s.x,s.y,s.tx,s.ty);ctx.setLineDash([]);
    ctx.strokeStyle='#dbe9ff';ctx.lineWidth=2;ctx.globalAlpha=k;ctx.beginPath();ctx.arc(s.tx,s.ty,7+24*(1-k),0,6.283);ctx.stroke();
  }else{
    ctx.globalAlpha=k*.95;ctx.shadowColor=s.color;ctx.shadowBlur=16;ctx.strokeStyle=s.color;ctx.lineWidth=4.5;seg(s.x,s.y,s.tx,s.ty);ctx.strokeStyle='#eafcff';ctx.lineWidth=1.6;seg(s.x,s.y,s.tx,s.ty);
    const q=1-k;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(s.x+(s.tx-s.x)*q,s.y+(s.ty-s.y)*q,4,0,6.283);ctx.fill();
  }
  ctx.restore();
}
function drawFx(f){
  const k=Math.max(0,f.life/f.max);ctx.save();ctx.globalAlpha=k;ctx.shadowColor=f.color;
  if(f.kind==='ring'){ctx.shadowBlur=16;ctx.strokeStyle=f.color;ctx.lineWidth=1.5+2.5*k;ctx.beginPath();ctx.arc(f.x,f.y,f.r0+(f.r1-f.r0)*(1-k),0,6.283);ctx.stroke()}
  else{ctx.shadowBlur=8;ctx.fillStyle=f.color;ctx.beginPath();ctx.arc(f.x,f.y,f.r*k+.6,0,6.283);ctx.fill()}
  ctx.restore();
}
function drawGhost(){
  if(!state.placing||!hover)return;
  const type=towerTypes.find(t=>t.id===state.placing),bad=blocked(hover);
  ctx.save();ctx.fillStyle=bad?'rgba(255,107,127,.09)':'rgba(80,216,255,.09)';ctx.strokeStyle=bad?'rgba(255,107,127,.7)':'rgba(80,216,255,.7)';ctx.lineWidth=1.5;ctx.setLineDash([7,8]);
  ctx.beginPath();ctx.arc(hover.x,hover.y,type.range,0,6.283);ctx.fill();ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(hover.x,hover.y,20,0,6.283);ctx.stroke();
  ctx.fillStyle=bad?'#ff6b7f':type.color;ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(bad?'✕':type.icon,hover.x,hover.y);ctx.restore();
}
function burst(x,y,color,n,power){for(let i=0;i<n;i++){const a=Math.random()*6.283,sp=power*(.25+Math.random()*.75);state.fx.push({kind:'spark',x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.28+Math.random()*.26,max:.54,color,r:1.4+Math.random()*2.2})}if(state.fx.length>260)state.fx.splice(0,state.fx.length-260)}
function ring(x,y,r0,r1,color,life){state.fx.push({kind:'ring',x,y,r0,r1,color,life,max:life})}

function beginPlacement(id){const type=towerTypes.find(t=>t.id===id);if(state.credits<type.cost)return toast('Not enough credits');state.placing=id;state.selected=null;hover=null;$('cancelPlacement').hidden=false;closePanel();toast(`Tap an open area to deploy ${type.name}`)}
function canvasPoint(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top}}
canvas.addEventListener('pointermove',ev=>{if(state.placing)hover=canvasPoint(ev)});
canvas.addEventListener('pointerleave',()=>{hover=null});
canvas.addEventListener('pointerup',ev=>{ev.preventDefault();resumeAudio();const p=canvasPoint(ev);
  if(state.placing){const type=towerTypes.find(t=>t.id===state.placing);hover=p;if(blocked(p))return toast('Choose a clear deployment zone');state.credits-=type.cost;state.towers.push({x:p.x,y:p.y,type:type.id,level:1,cooldown:0,target:'First',ability:0,angle:0,flash:0});state.placing=null;hover=null;$('cancelPlacement').hidden=true;ring(p.x,p.y,8,40,type.color,.4);updateHud();tone(460,.06);toast(`${type.name} online`);return}
  const found=[...state.towers].reverse().find(t=>Math.hypot(t.x-p.x,t.y-p.y)<32);if(found)selectTower(found);else{state.selected=null;showShop();draw()}
},{passive:false});
$('cancelPlacement').onclick=()=>{state.placing=null;hover=null;$('cancelPlacement').hidden=true};
function selectTower(t){state.selected=t;const type=towerTypes.find(x=>x.id===t.type);$('shop').hidden=true;$('selectedTower').hidden=false;$('panelEyebrow').textContent='TOWER CONTROL';$('panelTitle').textContent=type.name;$('selectedIcon').textContent=type.icon;$('selectedIcon').style.color=type.color;$('selectedName').textContent=type.name;$('selectedLevel').textContent=`LEVEL ${t.level}`;$('statDamage').textContent=Math.round(type.damage*(1+(t.level-1)*.5));$('statRange').textContent=Math.round(type.range*(1+(t.level-1)*.1));$('statRate').textContent=`${(1/type.rate).toFixed(1)}/s`;$('targetMode').value=t.target;$('upgradeCost').textContent=t.level>=3?'MAX':`◆ ${100*t.level}`;$('sellValue').textContent=`◆ ${Math.round(type.cost*.65*t.level)}`;openPanel();draw()}
function showShop(){$('shop').hidden=false;$('selectedTower').hidden=true;$('panelEyebrow').textContent='ARSENAL';$('panelTitle').textContent='Deploy a tower'}
function openPanel(){$('towerPanel').classList.add('open')}function closePanel(){$('towerPanel').classList.remove('open')}
$('arsenalBtn').onclick=()=>{showShop();openPanel()};$('closePanel').onclick=closePanel;
$('targetMode').onchange=e=>{if(state.selected)state.selected.target=e.target.value};
$('upgradeBtn').onclick=()=>{const t=state.selected;if(!t||t.level>=3)return toast('Maximum level reached');const cost=100*t.level;if(state.credits<cost)return toast('Not enough credits');state.credits-=cost;t.level++;const type=towerTypes.find(x=>x.id===t.type);ring(t.x,t.y,10,46,type.color,.45);burst(t.x,t.y,type.color,10,120);updateHud();selectTower(t);tone(650,.08)};
$('sellBtn').onclick=()=>{const t=state.selected;if(!t)return;const type=towerTypes.find(x=>x.id===t.type);state.credits+=Math.round(type.cost*.65*t.level);burst(t.x,t.y,'#7e9db1',12,140);state.towers.splice(state.towers.indexOf(t),1);state.selected=null;showShop();updateHud();closePanel()};
$('abilityBtn').onclick=()=>{const t=state.selected;if(!t||t.ability>0)return;t.ability=10;ring(t.x,t.y,12,54,'#b992ff',.5);$('abilityBtn').classList.add('cooldown');tone(760,.12);toast('Overcharge activated')};

function startWave(){if(state.running)return;state.wave++;state.running=true;state.spawned=0;state.total=7+state.wave*3;state.nextSpawn=.1;updateHud();$('waveBtn').classList.add('running');$('waveState').textContent=`WAVE ${state.wave} IN PROGRESS`;resumeAudio();tone(330,.1)}
function spawn(){const hp=45+state.wave*18,elite=state.wave%5===0;state.enemies.push({progress:0,hp,maxHp:hp,speed:64+state.wave*2.5,radius:9+Math.min(state.wave,8)*.4,color:elite?'#b992ff':'#ff6b7f',dark:elite?'#331258':'#4d1220',hurt:0,chilled:0});state.spawned++;const p=pathPoint(0);burst(p.x+8,p.y,'#ff6b7f',6,110)}
function damage(e,amount,color){
  e.hp-=amount;e.hurt=.14;burst(e.x,e.y,color,3,90);
  if(e.hp<=0){const i=state.enemies.indexOf(e);if(i>-1){state.enemies.splice(i,1);state.credits+=9+state.wave;burst(e.x,e.y,e.color,14,190);ring(e.x,e.y,e.radius,e.radius+30,e.color,.34)}}
}
function update(dt){if(state.paused)return;
  if(state.audio){musicClock+=dt;if(musicClock>=MUSIC_STEP){musicClock-=MUSIC_STEP;playMusicNote()}}
  if(state.running&&state.spawned<state.total){state.nextSpawn-=dt;if(state.nextSpawn<=0){spawn();state.nextSpawn=.65}}
  const len=pathLength();
  for(const e of state.enemies){e.progress+=e.speed*dt/len;e.hurt=Math.max(0,e.hurt-dt);e.chilled=Math.max(0,e.chilled-dt)}
  for(const e of [...state.enemies])if(e.progress>=1){state.enemies.splice(state.enemies.indexOf(e),1);state.lives--;const c=pathPoint(1);ring(c.x,c.y,14,70,'#ff6b7f',.5);burst(c.x,c.y,'#ff6b7f',16,200);tone(100,.08);if(state.lives<=0){state.lives=20;state.credits=Math.max(200,state.credits);state.running=false;state.enemies=[];toast('Core restored — regroup and try again')}}
  for(const t of state.towers){
    const type=towerTypes.find(x=>x.id===t.type);t.cooldown-=dt;t.ability=Math.max(0,t.ability-dt);t.flash=Math.max(0,(t.flash||0)-dt);
    if(t.cooldown<=0){
      let candidates=state.enemies.filter(e=>Math.hypot(e.x-t.x,e.y-t.y)<=type.range*(1+(t.level-1)*.1));
      if(t.target==='Strong')candidates.sort((a,b)=>b.hp-a.hp);else if(t.target==='Close')candidates.sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y));else candidates.sort((a,b)=>b.progress-a.progress);
      const e=candidates[0];
      if(e){
        const boost=t.ability>0?2:1,dmg=type.damage*(1+(t.level-1)*.5)*boost,ex=e.x,ey=e.y;
        t.angle=Math.atan2(ey-t.y,ex-t.x);t.flash=.12;t.cooldown=type.rate/(t.ability>0?1.8:1);
        let chain=null;
        if(type.id==='arc'){const near=state.enemies.filter(o=>o!==e&&Math.hypot(o.x-ex,o.y-ey)<115).sort((a,b)=>Math.hypot(a.x-ex,a.y-ey)-Math.hypot(b.x-ex,b.y-ey))[0];if(near){chain={x:near.x,y:near.y};damage(near,dmg*.5,type.color)}}
        if(type.id==='frost'){e.speed*=.94;e.chilled=.6}
        damage(e,dmg,type.color);
        state.shots.push({x:t.x,y:t.y,tx:ex,ty:ey,life:.18,max:.18,type:type.id,color:type.color,seed:Math.random()*100,chain});
      }
    }
  }
  for(const s of state.shots)s.life-=dt;state.shots=state.shots.filter(s=>s.life>0);
  for(const f of state.fx){f.life-=dt;if(f.kind!=='ring'){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.93;f.vy*=.93}}
  state.fx=state.fx.filter(f=>f.life>0);
  if(state.running&&state.spawned===state.total&&!state.enemies.length){state.running=false;state.credits+=50;toast('Sector clear +50 credits');$('waveBtn').classList.remove('running');$('waveState').textContent='SECTOR SECURE';saveGame()}
  updateHud();
}
function loop(now){const dt=Math.min((now-last)/1000,.05)*state.speed;last=now;update(dt);draw();raf=requestAnimationFrame(loop)}
function updateHud(){$('credits').textContent=state.credits;$('lives').textContent=state.lives;$('wave').textContent=state.wave;const remaining=state.enemies.length+(state.total-state.spawned);$('enemyCount').textContent=state.running?`${remaining} threats remaining`:'Ready for deployment';$('waveProgress').style.width=state.running?`${100*(state.spawned-state.enemies.length*.3)/state.total}%`:'0%';if(state.selected){const sec=Math.ceil(state.selected.ability);$('abilityStatus').textContent=sec?`${sec}s cooldown`:'Ready';$('abilityBtn').classList.toggle('cooldown',!!sec)}}

function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800)}
function resumeAudio(){if(!state.audio)return;if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)();musicGain=audioContext.createGain();musicGain.gain.value=.05;musicGain.connect(audioContext.destination)}if(audioContext.state==='suspended')audioContext.resume()}
function tone(freq,duration){if(!state.audio)return;resumeAudio();if(!audioContext)return;const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(.045,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(g).connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration)}
function playMusicNote(){if(!audioContext)return;const freq=musicPattern[musicStep%musicPattern.length];musicStep++;if(!freq)return;const t=audioContext.currentTime,tail=MUSIC_STEP*1.8,o=audioContext.createOscillator(),g=audioContext.createGain(),f=audioContext.createBiquadFilter();o.type='triangle';o.frequency.value=freq;f.type='lowpass';f.frequency.value=900;f.Q.value=.7;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+.05);g.gain.exponentialRampToValueAtTime(.001,t+tail);o.connect(f).connect(g).connect(musicGain);o.start(t);o.stop(t+tail+.05)}
function saveGame(){try{localStorage.setItem('aegis-grid-save',JSON.stringify({credits:state.credits,lives:state.lives,wave:state.wave,towers:state.towers.map(({x,y,...t})=>({...t,x:x/view.w,y:y/view.h}))}));toast('Progress saved')}catch{toast('Storage unavailable') }}
function loadGame(){try{const d=JSON.parse(localStorage.getItem('aegis-grid-save'));if(!d)return;Object.assign(state,{credits:d.credits,lives:d.lives,wave:d.wave});requestAnimationFrame(()=>{state.towers=d.towers.map(t=>({angle:0,flash:0,...t,x:t.x*view.w,y:t.y*view.h}));updateHud()})}catch{localStorage.removeItem('aegis-grid-save')}}
function resetGame(){Object.assign(state,{credits:500,lives:20,wave:0,paused:false,running:false,placing:null,selected:null,enemies:[],towers:[],shots:[],fx:[],spawned:0,total:0,nextSpawn:0});hover=null;$('pauseBtn').textContent='Ⅱ';$('cancelPlacement').hidden=true;$('waveBtn').classList.remove('running');$('waveState').textContent='SECTOR SECURE';showShop();closePanel();updateHud();draw();saveGame();tone(220,.15);toast('New game started')}
$('waveBtn').onclick=startWave;$('saveBtn').onclick=saveGame;$('resetBtn').onclick=()=>{if(confirm('Reset all progress and start a new game? This cannot be undone.'))resetGame()};$('pauseBtn').onclick=()=>{state.paused=!state.paused;$('pauseBtn').textContent=state.paused?'▶':'Ⅱ';toast(state.paused?'Game paused':'Game resumed')};
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{state.speed=+b.dataset.speed;document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b));tone(520,.04)});
$('audioBtn').onclick=()=>{state.audio=!state.audio;$('audioBtn').textContent=state.audio?'♫':'♩';if(state.audio)tone(520,.06)};
$('fullscreenBtn').onclick=async()=>{const fn=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;if(fn)try{await fn.call(document.documentElement)}catch{toast('Fullscreen is unavailable')}else toast('Add to Home Screen for fullscreen')};
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.paused=true;saveGame()}else{last=performance.now();resumeAudio();toast('Game paused while you were away')}});
window.addEventListener('pagehide',saveGame);window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);screen.orientation?.addEventListener?.('change',()=>setTimeout(resize,150));
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
shop();resize();loadGame();updateHud();raf=requestAnimationFrame(loop);
