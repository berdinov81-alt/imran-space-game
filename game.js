
(()=>{'use strict';
const c=document.getElementById('game'),x=c.getContext('2d',{alpha:false});
const ui={top:document.getElementById('top'),weapons:document.getElementById('weapons'),hint:document.getElementById('hint'),fire:document.getElementById('fire'),pause:document.getElementById('pause'),start:document.getElementById('start'),over:document.getElementById('over'),lives:document.getElementById('lives'),score:document.getElementById('score'),level:document.getElementById('level'),best:document.getElementById('best'),final:document.getElementById('final'),finalBest:document.getElementById('finalBest')};
const face=new Image();face.src='face.jpg';
let player=null;let target={x:0,y:0};
let W=innerWidth,H=innerHeight,D=Math.min(2,devicePixelRatio||1);function resize(){W=innerWidth;H=innerHeight;D=Math.min(2,devicePixelRatio||1);c.width=Math.max(1,Math.floor(W*D));c.height=Math.max(1,Math.floor(H*D));c.style.width=W+'px';c.style.height=H+'px';x.setTransform(D,0,0,D,0,0); if(player){player.x=clamp(player.x,48,W-48);player.y=clamp(player.y,H*.16,H-105);clearInput()}}addEventListener('resize',resize,{passive:true});
let best=0;try{best=Math.max(0,Number(localStorage.getItem('imranMeteorBest2'))||0)}catch(e){}
let running=false,paused=false,last=performance.now(),score=0,lives=3,level=1,weapon='laser',lastShot=0,spawn=0;
let stars=[],shots=[],rocks=[],parts=[],coins=[],floaters=[];
let movePointerId=null,moveStart=null,playerStart=null;const fireTouches=new Set(),keys=new Set();
const stats={laser:{cool:135,speed:1050,dmg:1,r:5},plasma:{cool:480,speed:700,dmg:3,r:14},multi:{cool:310,speed:860,dmg:1,r:6}};
function rnd(a,b){return a+Math.random()*(b-a)}function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function reset(){score=0;lives=3;level=1;lastShot=0;spawn=.25;shots=[];rocks=[];parts=[];coins=[];floaters=[];stars=Array.from({length:90},()=>({x:Math.random()*W,y:Math.random()*H,s:rnd(.4,1.7)}));player={x:W*.5,y:H*.76,vx:0,vy:0,inv:0};target={x:player.x,y:player.y};clearInput();setWeapon('laser');updateUI()}
function updateUI(){ui.score.textContent=Math.floor(score);ui.lives.textContent=lives;ui.level.textContent=level;ui.best.textContent=best}
function startGame(){resize();reset();running=true;paused=false;last=performance.now();ui.start.classList.add('hidden');ui.over.classList.add('hidden');[ui.top,ui.weapons,ui.hint,ui.fire,ui.pause].forEach(e=>e.classList.remove('hidden'));ui.pause.textContent='⏸'}
function endGame(){running=false;clearInput();best=Math.max(best,Math.floor(score));try{localStorage.setItem('imranMeteorBest2',String(best))}catch(e){}ui.final.textContent=Math.floor(score);ui.finalBest.textContent=best;ui.over.classList.remove('hidden')}
function setWeapon(w){if(!stats[w])return;weapon=w;document.querySelectorAll('.weapon').forEach(b=>b.classList.toggle('active',b.dataset.w===w))}
function shoot(now){const s=stats[weapon];if(now-lastShot<s.cool)return;lastShot=now;const y=player.y-74;if(weapon==='laser')shots.push({x:player.x,y,vx:0,vy:-s.speed,r:s.r,d:s.dmg,t:'laser'});else if(weapon==='plasma')shots.push({x:player.x,y,vx:0,vy:-s.speed,r:s.r,d:s.dmg,t:'plasma'});else[-.22,0,.22].forEach(a=>shots.push({x:player.x,y,vx:Math.sin(a)*s.speed,vy:-Math.cos(a)*s.speed,r:s.r,d:s.dmg,t:'multi'}))}
function makeRock(){const big=Math.random()<Math.min(.1+level*.015,.28),r=big?rnd(42,62):rnd(22,39),hp=Math.max(1,Math.ceil((big?3:1)+level*.18));rocks.push({x:rnd(r,W-r),y:-r-10,vx:rnd(-45,45),vy:rnd(125,205)+level*13,r,hp,rot:rnd(0,7),vr:rnd(-1.5,1.5),hot:Math.random()<.4})}
function boom(px,py,n=14,col='#ff8a35'){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=rnd(60,260);parts.push({x:px,y:py,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.3,.72),size:rnd(2,7),col})}}
function label(px,py,text){floaters.push({x:px,y:py,text,life:.75})}
function removeDestroyedRocks(){for(let j=rocks.length-1;j>=0;j--){const r=rocks[j];if(r.hp>0)continue;const reward=Math.round(75+r.r*2+level*7);boom(r.x,r.y,Math.round(r.r*.4),'#ff8a35');score+=reward;label(r.x,r.y,'+'+reward);if(Math.random()<.16)coins.push({x:r.x,y:r.y,vy:170,spin:0});rocks.splice(j,1)}}
function update(dt,now){if(!running||paused)return;level=1+Math.floor(score/1600);player.inv=Math.max(0,player.inv-dt);for(const s of stars){s.y+=90*s.s*dt;if(s.y>H){s.y=-4;s.x=Math.random()*W}}
 // Smoothly follow the finger's target. This makes drag control stable on touchscreens.
 const dx=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
 const dy=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
 if(dx||dy){const scale=360*dt/(Math.hypot(dx,dy)||1);target.x=clamp(target.x+dx*scale,48,W-48);target.y=clamp(target.y+dy*scale,H*.16,H-105)}
 const follow=1-Math.exp(-18*dt);player.x=clamp(player.x+(target.x-player.x)*follow,48,W-48);player.y=clamp(player.y+(target.y-player.y)*follow,H*.16,H-105);
 if(fireTouches.size>0)shoot(now);spawn-=dt;if(spawn<=0){makeRock();spawn=Math.max(.20,.70-level*.028)*rnd(.72,1.12)}
 for(const s of shots){s.x+=s.vx*dt;s.y+=s.vy*dt}shots=shots.filter(s=>s.y>-70&&s.x>-50&&s.x<W+50);
 for(const r of rocks){r.x+=r.vx*dt;r.y+=r.vy*dt;r.rot+=r.vr*dt}
 for(let i=shots.length-1;i>=0;i--){const s=shots[i];let used=false;for(let j=rocks.length-1;j>=0;j--){const r=rocks[j];if(Math.hypot(s.x-r.x,s.y-r.y)<s.r+r.r){used=true;if(s.t==='plasma'){for(const rr of rocks)if(Math.hypot(s.x-rr.x,s.y-rr.y)<105)rr.hp-=s.d;boom(s.x,s.y,18,'#d76cff')}else r.hp-=s.d;break}}if(used){shots.splice(i,1);removeDestroyedRocks()}}
 for(let j=rocks.length-1;j>=0;j--){const r=rocks[j];if(r.y-r.r>H+30){rocks.splice(j,1);continue}if(player.inv<=0&&Math.hypot(r.x-player.x,r.y-player.y)<r.r+42){boom(player.x,player.y,25);lives--;player.inv=1.25;rocks.splice(j,1);if(lives<=0){updateUI();endGame();return}}}
 for(let i=coins.length-1;i>=0;i--){const q=coins[i];q.y+=q.vy*dt;q.spin+=dt*5;if(Math.hypot(q.x-player.x,q.y-player.y)<52){score+=250;label(q.x,q.y,'⭐ +250');coins.splice(i,1)}else if(q.y>H+30)coins.splice(i,1)}
 for(const p of parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.985;p.vy*=.985;p.life-=dt}parts=parts.filter(p=>p.life>0);for(const f of floaters){f.y-=38*dt;f.life-=dt}floaters=floaters.filter(f=>f.life>0);if(score>best){best=Math.floor(score);try{localStorage.setItem('imranMeteorBest2',String(best))}catch(e){}}updateUI()}
function circle(px,py,r,fill){x.fillStyle=fill;x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill()}
function draw(){x.fillStyle='#030817';x.fillRect(0,0,W,H);let g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#07122e');g.addColorStop(.55,'#0a2857');g.addColorStop(1,'#020714');x.fillStyle=g;x.fillRect(0,0,W,H);x.globalAlpha=.15;x.fillStyle='#6538e8';x.beginPath();x.ellipse(W*.27,H*.35,W*.45,H*.11,-.35,0,Math.PI*2);x.fill();x.fillStyle='#16dfff';x.beginPath();x.ellipse(W*.76,H*.57,W*.42,H*.08,.3,0,Math.PI*2);x.fill();x.globalAlpha=1;for(const s of stars){x.globalAlpha=.45+.4*s.s/1.7;x.fillStyle='#fff';x.fillRect(s.x,s.y,s.s*1.5,s.s*2.8)}x.globalAlpha=1;planet(W*.83,H*.15,Math.min(W,H)*.075,'#c09bff','#463078');planet(W*.14,H*.24,Math.min(W,H)*.04,'#ffd89b','#a95642');for(const q of coins)star(q.x,q.y,14,q.spin);for(const s of shots)shot(s);for(const r of rocks)rock(r);if(player)rocket();for(const p of parts){x.globalAlpha=Math.max(0,p.life/.7);circle(p.x,p.y,p.size,p.col)}x.globalAlpha=1;for(const f of floaters){x.globalAlpha=Math.min(1,f.life*2);x.fillStyle='#ffe765';x.font='900 18px system-ui';x.textAlign='center';x.fillText(f.text,f.x,f.y)}x.globalAlpha=1;if(paused){x.fillStyle='rgba(0,0,0,.55)';x.fillRect(0,0,W,H);x.fillStyle='white';x.font='1000 42px system-ui';x.textAlign='center';x.fillText('ПАУЗА',W/2,H/2)}}
function planet(px,py,r,a,b){const q=x.createRadialGradient(px-r*.35,py-r*.3,2,px,py,r);q.addColorStop(0,a);q.addColorStop(1,b);x.fillStyle=q;x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill()}
function rock(r){x.save();x.translate(r.x,r.y);x.rotate(r.rot);const q=x.createRadialGradient(-r.r*.3,-r.r*.3,2,0,0,r.r);q.addColorStop(0,r.hot?'#ffbf5b':'#91817b');q.addColorStop(.45,r.hot?'#9c4437':'#5e5558');q.addColorStop(1,'#211a22');x.fillStyle=q;x.beginPath();for(let i=0;i<10;i++){const a=i/10*Math.PI*2,rr=r.r*(.82+.15*Math.sin(i*3.13+r.rot));i?x.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):x.moveTo(Math.cos(a)*rr,Math.sin(a)*rr)}x.closePath();x.fill();if(r.hot){x.strokeStyle='#ff7235';x.lineWidth=3;x.beginPath();x.moveTo(-r.r*.45,0);x.lineTo(-r.r*.05,r.r*.18);x.lineTo(r.r*.43,-r.r*.2);x.stroke()}x.restore()}
function shot(s){x.save();x.translate(s.x,s.y);if(s.t==='laser'){x.strokeStyle='#83f8ff';x.lineWidth=5;x.shadowColor='#41eaff';x.shadowBlur=18;x.beginPath();x.moveTo(0,10);x.lineTo(0,-24);x.stroke()}else if(s.t==='plasma'){x.shadowColor='#da72ff';x.shadowBlur=22;circle(0,0,s.r,'#f4a5ff')}else{x.shadowColor='#89ff68';x.shadowBlur=16;circle(0,0,s.r,'#adff76')}x.restore()}
function star(px,py,r,rot){x.save();x.translate(px,py);x.rotate(rot);x.fillStyle='#ffdb43';x.beginPath();for(let i=0;i<10;i++){const rr=i%2?r*.45:r,a=-Math.PI/2+i*Math.PI/5;i?x.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):x.moveTo(Math.cos(a)*rr,Math.sin(a)*rr)}x.closePath();x.fill();x.restore()}
function rocket(){const px=player.x,py=player.y;if(player.inv>0&&Math.floor(player.inv*12)%2===0)x.globalAlpha=.32;x.save();x.translate(px,py);let f=x.createLinearGradient(0,55,0,145);f.addColorStop(0,'#fff59c');f.addColorStop(.35,'#ff983a');f.addColorStop(1,'rgba(255,60,30,0)');x.fillStyle=f;x.beginPath();x.moveTo(-20,58);x.quadraticCurveTo(0,155,20,58);x.closePath();x.fill();x.fillStyle='#edf6ff';x.beginPath();x.moveTo(0,-88);x.bezierCurveTo(58,-45,63,56,0,84);x.bezierCurveTo(-63,56,-58,-45,0,-88);x.fill();x.fillStyle='#ed3f39';x.beginPath();x.moveTo(0,-108);x.lineTo(35,-67);x.lineTo(-35,-67);x.closePath();x.fill();x.beginPath();x.moveTo(-44,31);x.lineTo(-80,79);x.lineTo(-34,61);x.closePath();x.fill();x.beginPath();x.moveTo(44,31);x.lineTo(80,79);x.lineTo(34,61);x.closePath();x.fill();x.fillStyle='#175f9e';x.fillRect(-39,18,78,38);circle(0,38,14,'#ffd94a');x.save();x.beginPath();x.arc(0,-28,36,0,Math.PI*2);x.clip();x.fillStyle='#73d4ff';x.fillRect(-40,-70,80,80);if(face.complete&&face.naturalWidth)x.drawImage(face,-34,-62,68,68);x.restore();x.strokeStyle='#54dfff';x.lineWidth=5;x.beginPath();x.arc(0,-28,38,0,Math.PI*2);x.stroke();x.restore();x.globalAlpha=1}
function frame(now){const dt=Math.min(.035,(now-last)/1000||0);last=now;update(dt,now);draw();requestAnimationFrame(frame)}resize();requestAnimationFrame(frame);ui.best.textContent=best;document.getElementById('startBtn').disabled=false;document.getElementById('loading').classList.add('hidden');
// Each pointer owns its role. A fire pointer never becomes the movement pointer.
function stopMoving(){movePointerId=null;moveStart=null;playerStart=null;if(player)target={x:player.x,y:player.y}}
function clearInput(){stopMoving();fireTouches.clear();keys.clear();ui.fire.classList.remove('pressed')}
function setPaused(value){if(!running)return;paused=value;clearInput();last=performance.now();ui.pause.textContent=paused?'▶':'⏸';ui.pause.setAttribute('aria-label',paused?'Продолжить':'Пауза')}
function capture(element,e){try{element.setPointerCapture(e.pointerId)}catch(error){/* Pointer may already have been cancelled. */}}
c.addEventListener('pointerdown',e=>{
 if(!running||paused||movePointerId!==null||(e.pointerType==='mouse'&&e.button!==0))return;
 e.preventDefault();movePointerId=e.pointerId;moveStart={x:e.clientX,y:e.clientY};playerStart={x:player.x,y:player.y};target={...playerStart};capture(c,e);
});
c.addEventListener('pointermove',e=>{
 if(!running||paused||e.pointerId!==movePointerId)return;
 e.preventDefault();target.x=clamp(playerStart.x+e.clientX-moveStart.x,48,W-48);target.y=clamp(playerStart.y+e.clientY-moveStart.y,H*.16,H-105);
});
function endPointer(e){
 if(e.pointerId===movePointerId)stopMoving();
 fireTouches.delete(e.pointerId);ui.fire.classList.toggle('pressed',fireTouches.size>0);
}
ui.fire.addEventListener('pointerdown',e=>{
 if(!running||paused||(e.pointerType==='mouse'&&e.button!==0))return;
 e.preventDefault();fireTouches.add(e.pointerId);ui.fire.classList.add('pressed');capture(ui.fire,e);
});
for(const type of ['pointerup','pointercancel'])addEventListener(type,endPointer);
c.addEventListener('lostpointercapture',endPointer);
ui.fire.addEventListener('lostpointercapture',endPointer);
ui.fire.addEventListener('contextmenu',e=>e.preventDefault());
c.addEventListener('contextmenu',e=>e.preventDefault());
ui.weapons.addEventListener('click',e=>{const b=e.target.closest('.weapon');if(b)setWeapon(b.dataset.w)});
ui.pause.addEventListener('click',()=>setPaused(!paused));
document.getElementById('startBtn').addEventListener('click',startGame);
document.getElementById('again').addEventListener('click',startGame);
const movementCodes=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD']);
addEventListener('keydown',e=>{
 if(!running)return;
 if(e.code==='KeyP'){if(!e.repeat)setPaused(!paused);e.preventDefault();return}
 if(paused)return;
 if(e.key==='1')setWeapon('laser');if(e.key==='2')setWeapon('plasma');if(e.key==='3')setWeapon('multi');
 if(movementCodes.has(e.code)){e.preventDefault();keys.add(e.code)}
 if(e.code==='Space'){fireTouches.add('key');e.preventDefault()}
});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space')fireTouches.delete('key')});
addEventListener('blur',()=>setPaused(true));
addEventListener('pagehide',()=>setPaused(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPaused(true)});

})();
