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
const state = { credits:500, lives:20, wave:0, speed:1, paused:false, running:false, placing:null, selected:null, enemies:[], towers:[], shots:[], spawned:0, total:0, nextSpawn:0, audio:true };
let view={w:0,h:0,dpr:1}, last=performance.now(), raf, toastTimer, audioContext;

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
function pathPoint(p){
  const pts=[[0,.22],[.2,.22],[.28,.62],[.53,.62],[.6,.32],[.81,.32],[.88,.72],[1,.72]];
  const lengths=[];let total=0;
  for(let i=1;i<pts.length;i++){const dx=(pts[i][0]-pts[i-1][0])*view.w,dy=(pts[i][1]-pts[i-1][1])*view.h;total+=Math.hypot(dx,dy);lengths.push(total)}
  let d=p*total,prev=0;
  for(let i=0;i<lengths.length;i++){if(d<=lengths[i]){const q=(d-prev)/(lengths[i]-prev);return{x:(pts[i][0]+(pts[i+1][0]-pts[i][0])*q)*view.w,y:(pts[i][1]+(pts[i+1][1]-pts[i][1])*q)*view.h}}prev=lengths[i]}
  return{x:view.w,y:view.h*.72};
}
function draw(){
  const {w,h}=view;ctx.setTransform(view.dpr,0,0,view.dpr,0,0);ctx.fillStyle='#0a1d28';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(85,160,180,.09)';ctx.lineWidth=1;const grid=34;for(let x=0;x<w;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  // route
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#142f3b';ctx.lineWidth=Math.max(34,Math.min(w,h)*.1);ctx.beginPath();for(let i=0;i<=60;i++){const p=pathPoint(i/60);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}ctx.stroke();
  ctx.strokeStyle='rgba(80,216,255,.22)';ctx.lineWidth=2;ctx.setLineDash([8,12]);ctx.stroke();ctx.setLineDash([]);
  // core
  const core=pathPoint(1);ctx.fillStyle='#112d3b';ctx.beginPath();ctx.arc(core.x-5,core.y,22,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#5bf2bb';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#5bf2bb';ctx.beginPath();ctx.arc(core.x-5,core.y,7,0,Math.PI*2);ctx.fill();
  for(const t of state.towers) drawTower(t);
  for(const e of state.enemies) drawEnemy(e);
  ctx.strokeStyle='#dffcff';ctx.lineWidth=1.5;for(const s of state.shots){ctx.globalAlpha=s.life/.12;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.tx,s.ty);ctx.stroke()}ctx.globalAlpha=1;
}
function drawTower(t){
  const type=towerTypes.find(x=>x.id===t.type), selected=state.selected===t;
  if(selected){ctx.fillStyle='rgba(80,216,255,.07)';ctx.strokeStyle='rgba(80,216,255,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(t.x,t.y,type.range*(1+(t.level-1)*.1),0,Math.PI*2);ctx.fill();ctx.stroke()}
  ctx.fillStyle='#09202e';ctx.beginPath();ctx.arc(t.x,t.y,19,0,Math.PI*2);ctx.fill();ctx.strokeStyle=selected?'#fff':type.color;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=type.color;ctx.font='bold 20px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(type.icon,t.x,t.y);ctx.font='8px system-ui';ctx.fillStyle='#fff';ctx.fillText(t.level,t.x+14,t.y-14);
}
function drawEnemy(e){const p=pathPoint(e.progress);e.x=p.x;e.y=p.y;ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(p.x,p.y,e.radius,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#08141d';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#08141d';ctx.fillRect(p.x-12,p.y-e.radius-8,24,3);ctx.fillStyle='#ff6b7f';ctx.fillRect(p.x-12,p.y-e.radius-8,24*Math.max(0,e.hp/e.maxHp),3)}

function beginPlacement(id){const type=towerTypes.find(t=>t.id===id);if(state.credits<type.cost)return toast('Not enough credits');state.placing=id;state.selected=null;$('cancelPlacement').hidden=false;closePanel();toast(`Tap an open area to deploy ${type.name}`)}
function canvasPoint(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top}}
canvas.addEventListener('pointerup',ev=>{ev.preventDefault();resumeAudio();const p=canvasPoint(ev);
  if(state.placing){const type=towerTypes.find(t=>t.id===state.placing);const nearPath=[...Array(51)].some((_,i)=>{const q=pathPoint(i/50);return Math.hypot(q.x-p.x,q.y-p.y)<30});const nearTower=state.towers.some(t=>Math.hypot(t.x-p.x,t.y-p.y)<42);if(nearPath||nearTower)return toast('Choose a clear deployment zone');state.credits-=type.cost;state.towers.push({x:p.x,y:p.y,type:type.id,level:1,cooldown:0,target:'First',ability:0});state.placing=null;$('cancelPlacement').hidden=true;updateHud();tone(460,.06);toast(`${type.name} online`);return}
  const found=[...state.towers].reverse().find(t=>Math.hypot(t.x-p.x,t.y-p.y)<30);if(found)selectTower(found);else{state.selected=null;showShop();draw()}
},{passive:false});
$('cancelPlacement').onclick=()=>{state.placing=null;$('cancelPlacement').hidden=true};
function selectTower(t){state.selected=t;const type=towerTypes.find(x=>x.id===t.type);$('shop').hidden=true;$('selectedTower').hidden=false;$('panelEyebrow').textContent='TOWER CONTROL';$('panelTitle').textContent=type.name;$('selectedIcon').textContent=type.icon;$('selectedIcon').style.color=type.color;$('selectedName').textContent=type.name;$('selectedLevel').textContent=`LEVEL ${t.level}`;$('statDamage').textContent=Math.round(type.damage*(1+(t.level-1)*.5));$('statRange').textContent=Math.round(type.range*(1+(t.level-1)*.1));$('statRate').textContent=`${(1/type.rate).toFixed(1)}/s`;$('targetMode').value=t.target;$('upgradeCost').textContent=t.level>=3?'MAX':`◆ ${100*t.level}`;$('sellValue').textContent=`◆ ${Math.round(type.cost*.65*t.level)}`;openPanel();draw()}
function showShop(){$('shop').hidden=false;$('selectedTower').hidden=true;$('panelEyebrow').textContent='ARSENAL';$('panelTitle').textContent='Deploy a tower'}
function openPanel(){$('towerPanel').classList.add('open')}function closePanel(){$('towerPanel').classList.remove('open')}
$('arsenalBtn').onclick=()=>{showShop();openPanel()};$('closePanel').onclick=closePanel;
$('targetMode').onchange=e=>{if(state.selected)state.selected.target=e.target.value};
$('upgradeBtn').onclick=()=>{const t=state.selected;if(!t||t.level>=3)return toast('Maximum level reached');const cost=100*t.level;if(state.credits<cost)return toast('Not enough credits');state.credits-=cost;t.level++;updateHud();selectTower(t);tone(650,.08)};
$('sellBtn').onclick=()=>{const t=state.selected;if(!t)return;const type=towerTypes.find(x=>x.id===t.type);state.credits+=Math.round(type.cost*.65*t.level);state.towers.splice(state.towers.indexOf(t),1);state.selected=null;showShop();updateHud();closePanel()};
$('abilityBtn').onclick=()=>{const t=state.selected;if(!t||t.ability>0)return;t.ability=10;$('abilityBtn').classList.add('cooldown');tone(760,.12);toast('Overcharge activated')};

function startWave(){if(state.running)return;state.wave++;state.running=true;state.spawned=0;state.total=7+state.wave*3;state.nextSpawn=.1;updateHud();$('waveBtn').classList.add('running');$('waveState').textContent=`WAVE ${state.wave} IN PROGRESS`;resumeAudio();tone(330,.1)}
function spawn(){const hp=45+state.wave*18;state.enemies.push({progress:0,hp,maxHp:hp,speed:.038+state.wave*.0015,radius:9+Math.min(state.wave,8)*.35,color:state.wave%5===0?'#b992ff':'#ff6b7f'});state.spawned++}
function update(dt){if(state.paused)return;
  if(state.running&&state.spawned<state.total){state.nextSpawn-=dt;if(state.nextSpawn<=0){spawn();state.nextSpawn=.65}}
  for(const e of state.enemies)e.progress+=e.speed*dt;
  for(const e of [...state.enemies])if(e.progress>=1){state.enemies.splice(state.enemies.indexOf(e),1);state.lives--;tone(100,.08);if(state.lives<=0){state.lives=20;state.credits=Math.max(200,state.credits);state.running=false;state.enemies=[];toast('Core restored — regroup and try again')}}
  for(const t of state.towers){const type=towerTypes.find(x=>x.id===t.type);t.cooldown-=dt;t.ability=Math.max(0,t.ability-dt);if(t.cooldown<=0){let candidates=state.enemies.filter(e=>Math.hypot(e.x-t.x,e.y-t.y)<=type.range*(1+(t.level-1)*.1));if(t.target==='Strong')candidates.sort((a,b)=>b.hp-a.hp);else if(t.target==='Close')candidates.sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y));else candidates.sort((a,b)=>b.progress-a.progress);const e=candidates[0];if(e){const boost=t.ability>0?2:1;e.hp-=type.damage*(1+(t.level-1)*.5)*boost;t.cooldown=type.rate/(t.ability>0?1.8:1);state.shots.push({x:t.x,y:t.y,tx:e.x,ty:e.y,life:.12});if(type.id==='frost')e.speed*=.94;if(e.hp<=0){state.enemies.splice(state.enemies.indexOf(e),1);state.credits+=9+state.wave}}}}
  for(const s of state.shots)s.life-=dt;state.shots=state.shots.filter(s=>s.life>0);
  if(state.running&&state.spawned===state.total&&!state.enemies.length){state.running=false;state.credits+=50;toast('Sector clear +50 credits');$('waveBtn').classList.remove('running');$('waveState').textContent='SECTOR SECURE';saveGame()}
  updateHud();
}
function loop(now){const dt=Math.min((now-last)/1000,.05)*state.speed;last=now;update(dt);draw();raf=requestAnimationFrame(loop)}
function updateHud(){$('credits').textContent=state.credits;$('lives').textContent=state.lives;$('wave').textContent=state.wave;const remaining=state.enemies.length+(state.total-state.spawned);$('enemyCount').textContent=state.running?`${remaining} threats remaining`:'Ready for deployment';$('waveProgress').style.width=state.running?`${100*(state.spawned-state.enemies.length*.3)/state.total}%`:'0%';if(state.selected){const sec=Math.ceil(state.selected.ability);$('abilityStatus').textContent=sec?`${sec}s cooldown`:'Ready';$('abilityBtn').classList.toggle('cooldown',!!sec)}}

function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800)}
function resumeAudio(){if(!state.audio)return;if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume()}
function tone(freq,duration){if(!state.audio)return;resumeAudio();if(!audioContext)return;const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(.045,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(g).connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration)}
function saveGame(){try{localStorage.setItem('aegis-grid-save',JSON.stringify({credits:state.credits,lives:state.lives,wave:state.wave,towers:state.towers.map(({x,y,...t})=>({...t,x:x/view.w,y:y/view.h}))}));toast('Progress saved')}catch{toast('Storage unavailable') }}
function loadGame(){try{const d=JSON.parse(localStorage.getItem('aegis-grid-save'));if(!d)return;Object.assign(state,{credits:d.credits,lives:d.lives,wave:d.wave});requestAnimationFrame(()=>{state.towers=d.towers.map(t=>({...t,x:t.x*view.w,y:t.y*view.h}));updateHud()})}catch{localStorage.removeItem('aegis-grid-save')}}
$('waveBtn').onclick=startWave;$('saveBtn').onclick=saveGame;$('pauseBtn').onclick=()=>{state.paused=!state.paused;$('pauseBtn').textContent=state.paused?'▶':'Ⅱ';toast(state.paused?'Game paused':'Game resumed')};
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{state.speed=+b.dataset.speed;document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b));tone(520,.04)});
$('audioBtn').onclick=()=>{state.audio=!state.audio;$('audioBtn').textContent=state.audio?'♫':'♩';if(state.audio)tone(520,.06)};
$('fullscreenBtn').onclick=async()=>{const fn=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;if(fn)try{await fn.call(document.documentElement)}catch{toast('Fullscreen is unavailable')}else toast('Add to Home Screen for fullscreen')};
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.paused=true;saveGame()}else{last=performance.now();resumeAudio();toast('Game paused while you were away')}});
window.addEventListener('pagehide',saveGame);window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);screen.orientation?.addEventListener?.('change',()=>setTimeout(resize,150));
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
shop();resize();loadGame();updateHud();raf=requestAnimationFrame(loop);
