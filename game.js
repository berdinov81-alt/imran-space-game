(()=>{'use strict';
// Gameplay clocks, firing, warnings and pickups advance only through update(dt).
const campaign=ImranCampaign,profile=campaign.profile;
const c=document.getElementById('game'),x=c.getContext('2d',{alpha:false});
const el=id=>document.getElementById(id);
const ui={top:el('top'),weapons:el('weapons'),hint:el('hint'),fire:el('fire'),pause:el('pause'),start:el('start'),over:el('over'),lives:el('lives'),score:el('score'),level:el('level'),best:el('best'),final:el('final'),finalBest:el('finalBest'),weaponName:el('weaponName'),weaponPower:el('weaponPower'),stageName:el('stageName'),stageProgress:el('stageProgress'),stageFill:el('stageFill'),bossHud:el('bossHud'),bossName:el('bossName'),bossHealth:el('bossHealth'),bossPhase:el('bossPhase'),announce:el('announce'),announceTitle:el('announceTitle'),announceText:el('announceText'),difficulty:el('difficulty'),sound:el('sound'),missionStats:el('missionStats')};
const pilot=new Image();pilot.src='pilot-v2.png';
const face=new Image();face.src='face.jpg';
const nebula=new Image();nebula.src='nebula-v2.png';
const alienAtlas=new Image();alienAtlas.src='aliens-v2.png';
const bossAtlas=new Image();bossAtlas.src='bosses-v4.png';
const victoryAtlas=new Image();victoryAtlas.src='victory-imran-v5.png';
const TAU=Math.PI*2,MAX_POWER=5,PLAYER_RADIUS=14,WEAPON_DROP_GAP=28,WEAPON_DROP_BUDGET=3,HOSTILE_CAP=72;
let runMode='campaign',selectedMission=profile.state.selected,mission=campaign.mission(selectedMission),world=campaign.worlds[mission.world];
let missionDamage=0,salvageTaken=0,eliteKills=0,shotsFired=0,hitsLanded=0,runFinished=false,special=100,lastDrone=-1,formationTime=1.5,formationIndex=0,stormClock=12,stormWarnings=[],resultSuccess=false,lastReward=null;
function waveDuration(){return runMode==='endless'?Math.min(110,54+Math.floor((level-1)/5)*7):mission.duration}
function maxLives(){return difficulties[difficulty].lives+Math.floor(profile.state.upgrades.hull/2)+(profile.state.ship==='bastion'?1:0)}
function changeMission(id){mission=campaign.mission(id);world=campaign.worlds[mission.world]}

const stats={
 laser:{name:'ФОТОННЫЙ ЛАЗЕР',short:'ЛАЗЕР',icon:'✦',c:'#68e9ff',cool:.15,speed:1050,dmg:1.2,r:4},
 spread:{name:'ВЕЕР «ИСКРА»',short:'ВЕЕР',icon:'⋔',c:'#87ffb0',cool:.28,speed:860,dmg:1,r:4},
 plasma:{name:'ПЛАЗМЕННАЯ ПУШКА',short:'ПЛАЗМА',icon:'◉',c:'#cf86ff',cool:.47,speed:640,dmg:4.3,r:12},
 arc:{name:'ТЕСЛА «ШТОРМ»',short:'ТЕСЛА',icon:'↯',c:'#63ffd9',cool:.48,speed:780,dmg:3.2,r:9},
 beam:{name:'ИОННЫЙ ЛУЧ',short:'ЛУЧ',icon:'ϟ',c:'#fff29b',cool:.105,speed:1700,dmg:1.1,r:7}
};
const enemyTypes={
 scout:{name:'Разведчик',r:21,hp:2.1,speed:112,points:90,fire:2.9,c:'#70e5ff',sprite:0},
 interceptor:{name:'Перехватчик',r:25,hp:3.7,speed:91,points:140,fire:2.45,c:'#c795ff',sprite:1},
 armored:{name:'Броненосец',r:33,hp:8.4,speed:57,points:230,fire:3.35,c:'#ffb55b',sprite:2},
 weaver:{name:'Маневренный охотник',r:24,hp:4.1,speed:102,points:170,fire:2.8,c:'#8cf5a6',sprite:3},
 carrier:{name:'Носитель',r:39,hp:11.4,speed:52,points:310,fire:3.3,c:'#ff7eaa',sprite:5}
};
const difficulties={easy:{lives:5,speed:.82,fire:.8,spawn:1.12,boss:.8,label:'Лёгкий'},normal:{lives:4,speed:1,fire:1,spawn:1,boss:1,label:'Обычный'},hard:{lives:3,speed:1.18,fire:1.2,spawn:.86,boss:1.22,label:'Сложный'}};
const bosses=campaign.bossTypes;

let W=innerWidth,H=innerHeight,D=Math.min(2,devicePixelRatio||1),player=null,target={x:0,y:0};
let running=false,paused=false,last=performance.now(),gameTime=0,score=0,lives=4,level=1,weapon='laser',lastShot=-1,spawn=.7,stageTime=0,stageMode='wave',boss=null,intermission=0,announceTime=0,shake=0;
let stars=[],shots=[],enemies=[],hostileShots=[],pickups=[],parts=[],floaters=[],rings=[],hazards=[];
let inventory={laser:1,spread:0,plasma:0,arc:0,beam:0},guaranteed=new Set(),difficulty='normal',best=0;
let lastWeaponDrop=-Infinity,nextWeaponDrop=12,weaponDropReady=12,weaponDropCount=0,formationPlans=[],formationSerial=0;
let overdrive=0,boostTier=0,lastBoostDrop=-Infinity,boostDropCount=0,arcs=[],fireworks=[],victoryTime=0,victoryBurst=0;
const VICTORY_DURATION=4.6;
let killed=0,bossesKilled=0,pickupsCollected=0;
let movePointerId=null,moveStart=null,playerStart=null;const fireTouches=new Set(),keys=new Set();
const audio=ImranAudio.create({settings:()=>profile.state.settings,onStatus:text=>setText(el('audioStatus'),text)});
function refreshAudioUI(){const s=profile.state.settings;for(const b of [ui.sound,el('audioToggle')]){if(!b)continue;b.setAttribute('aria-pressed',String(s.sound));b.setAttribute('aria-label',s.sound?'Выключить звук':'Включить звук');b.classList.toggle('enabled',s.sound);b.textContent=b===ui.sound?(s.sound?'ВКЛ.':'ВЫКЛ.'):(s.sound?'♪ ЗВУК ВКЛ.':'♪ ВКЛЮЧИТЬ ЗВУК')}for(const range of document.querySelectorAll('[data-volume]')){const value=s[range.dataset.volume];range.value=value;setText(el(range.id+'Value'),value+'%')}}
function toggleAudio(){profile.setting('sound',!profile.state.settings.sound);refreshAudioUI();audio.apply();if(profile.state.settings.sound)audio.resume()}

try{best=Math.max(0,Number(localStorage.getItem('imranMeteorBest2'))||0);if(!localStorage.getItem(campaign.key)){const saved=localStorage.getItem('imranFleetDifficulty');if(difficulties[saved])profile.setting('difficulty',saved);}difficulty=profile.state.settings.difficulty;}catch(error){}
function rnd(a,b){return a+Math.random()*(b-a)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function playerBounds(){return {left:34,right:Math.max(34,W-34),top:H<=500?105:Math.max(260,H*.3),bottom:Math.max(150,H-130)}}
function resize(){W=innerWidth;H=innerHeight;D=Math.min(2,devicePixelRatio||1);c.width=Math.max(1,Math.floor(W*D));c.height=Math.max(1,Math.floor(H*D));c.style.width=W+'px';c.style.height=H+'px';x.setTransform(D,0,0,D,0,0);if(player){const b=playerBounds();player.x=clamp(player.x,b.left,b.right);player.y=clamp(player.y,b.top,b.bottom);clearInput()}for(const s of stars){s.x=clamp(s.x,0,W);s.y=clamp(s.y,-10,H)}}
addEventListener('resize',resize,{passive:true});
function reset(){clearVictory();overdrive=0;boostTier=0;lastBoostDrop=-Infinity;boostDropCount=0;arcs=[];score=0;difficulty=profile.state.settings.difficulty;lives=maxLives();level=runMode==='endless'?1:selectedMission;changeMission(level);missionDamage=0;salvageTaken=0;eliteKills=0;shotsFired=0;hitsLanded=0;runFinished=false;special=100;lastDrone=-1;formationTime=1.5;formationIndex=0;formationPlans=[];formationSerial=0;lastWeaponDrop=-Infinity;weaponDropCount=0;weaponDropReady=level===1?12:20;nextWeaponDrop=level===1?12:rnd(28,41);stormClock=12;stormWarnings=[];resultSuccess=false;lastReward=null;gameTime=0;stageTime=0;stageMode='wave';boss=null;intermission=0;lastShot=-1;spawn=.8;shake=0;killed=0;bossesKilled=0;pickupsCollected=0;shots=[];enemies=[];hostileShots=[];pickups=[];parts=[];floaters=[];rings=[];hazards=[];guaranteed=new Set();inventory=Object.fromEntries(Object.keys(stats).map(k=>[k,profile.state.weaponLevels[k]||(profile.state.arsenal[k]?1:0)]));stars=Array.from({length:110},()=>({x:Math.random()*W,y:Math.random()*H,z:rnd(.25,1),tw:rnd(0,TAU)}));const b=playerBounds();player={x:W*.5,y:clamp(H*.75,b.top,b.bottom),vx:0,vy:0,inv:1.6,shield:profile.state.upgrades.shield*1.8+(profile.state.ship==='bastion'?4:0)};target={x:player.x,y:player.y};clearInput();weapon='laser';updateUI();announce(runMode==='endless'?'БЕСКОНЕЧНЫЙ ПОЛЁТ':mission.name.toUpperCase(),runMode==='endless'?'Нарастающие волны. Каждый босс открывает новый рубеж.':campaign.goalText(mission)+' · победи командира',2.7)}
function setText(element,text){if(element&&element.textContent!==String(text))element.textContent=text}
function updateUI(){setText(el('boostStatus'),overdrive>0?'ТУРБО ×'+fireRate().toFixed(1)+' · '+Math.ceil(overdrive)+' с':'');el('boostStatus').classList.toggle('hidden',overdrive<=0||stageMode==='victory'||!running);setText(ui.score,Math.floor(score));setText(ui.lives,lives);if(ui.lives)ui.lives.setAttribute('aria-label','Жизни: '+lives);setText(ui.level,level);setText(ui.best,best);setText(ui.weaponName,stats[weapon].name);setText(ui.weaponPower,'МОЩНОСТЬ '+inventory[weapon]+' / '+MAX_POWER+' · '+campaign.weaponGrades[Math.max(0,inventory[weapon]-1)].name);if(ui.weaponPower){ui.weaponPower.dataset.rank=String(inventory[weapon]);ui.weaponPower.style.color=campaign.weaponGrades[Math.max(0,inventory[weapon]-1)].color;}setText(ui.stageName,runMode==='endless'?'ВОЛНА '+level+' / '+world.name.toUpperCase():mission.name.toUpperCase());setText(el('objectiveText'),runMode==='endless'?'Бесконечный рубеж':campaign.goalText(mission));setText(el('objectiveCount'),runMode==='endless'?world.code:(mission.objective==='salvage'?salvageTaken:mission.objective==='elite'?eliteKills:killed)+' / '+mission.target);setText(el('specialCharge'),Math.floor(special)+'%');setText(el('fireLabel'),profile.state.settings.autoFire?'ИМПУЛЬС':'ОГОНЬ');ui.fire.disabled=profile.state.settings.autoFire&&special<100;ui.fire.setAttribute('aria-label',profile.state.settings.autoFire?'Защитный импульс, заряд '+Math.floor(special)+' процентов':'Огонь, удерживай для стрельбы');const progress=stageMode==='wave'?Math.min(100,stageTime/waveDuration()*100):100;setText(ui.stageProgress,stageMode==='wave'?Math.max(0,Math.ceil(waveDuration()-stageTime))+' с до босса':stageMode==='boss'?'КОМАНДИР ФЛОТА':'СЕКТОР ОЧИЩЕН');if(ui.stageFill)ui.stageFill.style.width=progress+'%';if(ui.bossHud)ui.bossHud.classList.toggle('hidden',!boss||!running);if(boss){setText(ui.bossName,boss.name);if(ui.bossHealth)ui.bossHealth.style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';setText(ui.bossPhase,boss.warning?'ЗАРЯЖАЕТ АТАКУ':boss.phase>=3?'ФАЗА 3 · СВЕРХНОВАЯ':boss.phase===2?'ФАЗА 2 · ЯРОСТЬ':'ФАЗА 1 · БРОНЯ');}for(const button of document.querySelectorAll('.weapon')){const w=button.dataset.w,power=inventory[w]||0;button.classList.toggle('locked',!power);button.classList.toggle('active',weapon===w);button.disabled=!power;button.setAttribute('aria-disabled',String(!power));button.setAttribute('aria-pressed',String(weapon===w));button.dataset.power=String(power);button.setAttribute('aria-label',stats[w].name+(power?', мощность '+power:' — найди капсулу в полёте'));button.title=power?stats[w].name+' · уровень '+power:'Поймай капсулу '+(stats[w]?stats[w].short:w);const badge=button.querySelector('.weapon-level');if(badge)setText(badge,power?'LV '+power:'С НЕБА')}}
function announce(title,text,time=2.6){setText(ui.announceTitle,title);setText(ui.announceText,text);announceTime=time;if(ui.announce){ui.announce.classList.remove('hidden');ui.announce.classList.add('show')}}
function startGame(){ui.hint.classList.remove('fade','fading');el('pauseMenu').classList.add('hidden');resize();running=true;paused=false;reset();last=performance.now();ui.start.classList.add('hidden');ui.over.classList.add('hidden');[ui.top,ui.weapons,ui.hint,ui.fire,ui.pause].forEach(e=>{if(e)e.classList.remove('hidden')});ui.pause.textContent='⏸';ui.pause.setAttribute('aria-label','Пауза');setText(el('controlHint'),profile.state.settings.autoFire?'Веди ракету пальцем. Нажми ИМПУЛЬС для защиты.':'Веди ракету пальцем. Вторым удерживай ОГОНЬ.');audio.stopVoice();audio.resume();audio.setScene('battle',true);audio.effect('launch');audio.speak('launch',4);}
function saveBest(){if(score>best){best=Math.floor(score);try{localStorage.setItem('imranMeteorBest2',String(best))}catch(error){}}}
function endGame(success=false){if(!running||runFinished)return;success=success||(stageMode==='victory'&&runMode==='campaign');clearVictory();audio.setScene(success?'results':'defeat');if(!success){audio.effect('defeat');audio.speak('defeat',5)}runFinished=true;resultSuccess=success;if(success&&runMode==='campaign'&&!lastReward)lastReward=profile.award(level,{score,kills:killed,salvage:salvageTaken,elites:eliteKills,damage:missionDamage});else if(runMode==='endless')lastReward={credits:profile.awardEndless(score,killed)};running=false;paused=false;el('boostStatus').classList.add('hidden');clearInput();saveBest();setText(ui.final,Math.floor(score));setText(ui.finalBest,best);if(ui.missionStats){ui.missionStats.innerHTML='';for(const [value,label] of [[killed,'кораблей'],[bossesKilled,'боссов'],[pickupsCollected,'капсул']]){const item=document.createElement('div'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=value;span.textContent=label;item.append(strong,span);ui.missionStats.append(item)}}[ui.top,ui.weapons,ui.hint,ui.fire,ui.pause].forEach(e=>{if(e)e.classList.add('hidden')});el('pauseMenu').classList.add('hidden');setText(el('resultTitle'),success?(level===30?'Галактика защищена':'Миссия выполнена'):'Ракета потеряна');setText(el('resultCopy'),success?mission.name+' · '+world.name:'Улучшения и найденное оружие сохранены. Новый вылет — новая попытка.');setText(el('resultMedals'),success?'◆'.repeat(lastReward?.stars||1)+'◇'.repeat(3-(lastReward?.stars||1)):'');setText(el('missionReward'),lastReward?'+'+lastReward.credits+' ◈ СПЛАВА':'Победи командира, чтобы получить награду.');el('nextMission').classList.toggle('hidden',!success||level===30);setText(el('nextMission'),'СЛЕДУЮЩАЯ МИССИЯ ↗');document.dispatchEvent(new CustomEvent('imran:progress'));ui.over.classList.add('result-enter');ui.over.classList.remove('hidden');if(ui.bossHud)ui.bossHud.classList.add('hidden');if(ui.announce){ui.announce.classList.add('hidden');ui.announce.classList.remove('show')}}
function setWeapon(w){if(!stats[w]||!inventory[w])return false;weapon=w;updateUI();return true}
function pulseSound(){/* Event-specific effects are mixed by the audio engine. */}
function shoot(){
 if(!player||!running||paused||stageMode==='victory'||shots.length>170)return false;
 const s=stats[weapon],power=clamp(inventory[weapon],1,MAX_POWER),reactor=1+profile.state.upgrades.reactor*.08;
 if(gameTime-lastShot<s.cool*(1-.04*(power-1))/fireRate())return false;
 lastShot=gameTime;shotsFired++;const py=player.y-65,px=player.x;
 function add(angle=0,offset=0,options={}){shots.push({x:px+offset,y:py,vx:Math.sin(angle)*s.speed,vy:-Math.cos(angle)*s.speed,r:s.r,d:s.dmg*(1+.18*(power-1))*reactor,t:weapon,power,life:2.4,angle,trail:[],pierce:1,hit:new Set(),color:power===5?campaign.weaponGrades[4].color:s.c,...options})}
 if(weapon==='laser'){
  for(let i=0;i<power;i++){const offset=(i-(power-1)/2)*(power>=4?15:18);add(power>=3?(i-(power-1)/2)*.02:0,offset,{pierce:power>=5?3:power>=4?2:1,r:power>=4?5:4,len:22+power*5})}
 }else if(weapon==='spread'){
  const n=3+(power-1)*2;for(let i=0;i<n;i++)add((i-(n-1)/2)*.105,0,{pierce:power>=5?3:power>=3?2:1,bounce:power===5?1:0,r:3.5+power*.25,d:s.dmg*(1+.13*(power-1))*reactor})
 }else if(weapon==='plasma'){
  const n=power>=5?3:power>=3?2:1;for(let i=0;i<n;i++)add((i-(n-1)/2)*.055,(i-(n-1)/2)*25,{blast:72+power*12,r:9+power*2,shards:power>=5?10:power>=4?8:0,d:s.dmg*(1+.25*(power-1))*reactor})
 }else if(weapon==='arc'){
  const n=power===5?2:1;for(let i=0;i<n;i++)add((i-(n-1)/2)*.04,(i-(n-1)/2)*27,{chains:power-1,chainRange:150+power*18,r:8+power,life:2.2})
 }else{
  const n=power>=5?3:power>=3?2:1;for(let i=0;i<n;i++)add(power>=4?(i-(n-1)/2)*.025:0,(i-(n-1)/2)*26,{r:power<3?5+power*2:7+power,len:60+power*32,pierce:2+power+(power>=4?2:0),d:s.dmg*(1+.22*(power-1))*reactor})
 }
 rings.push({x:px,y:py,r:3,max:12+power*3,life:.12,total:.12,c:power===5?campaign.weaponGrades[4].color:s.c});audio.effect(weapon);return true
}
function createEnemy(type='scout',elite=false){if(!enemyTypes[type])type='scout';const cfg=enemyTypes[type],scale=(1+(Math.min(level,30)-1)*.045+Math.max(0,level-30)*.025)*(elite?1.65:1),px=rnd(cfg.r+12,Math.max(cfg.r+13,W-cfg.r-12));const enemy={type,name:cfg.name,x:px,y:-cfg.r-35,baseX:px,r:cfg.r,hp:cfg.hp*scale,maxHp:cfg.hp*scale,vx:rnd(-15,15),vy:cfg.speed*difficulties[difficulty].speed*(1+mission.world*.06+mission.slot*.02),age:0,phase:rnd(0,TAU),fire:cfg.fire*rnd(.65,1.3),points:Math.round(cfg.points*(1+.05*(level-1))*(elite?2:1)),elite,dead:false,hit:0,c:cfg.c};enemies.push(enemy);return enemy}
function chooseEnemy(){const n=Math.random();if(stageTime<6)return n<.78?'scout':'interceptor';if(mission.world===0)return n<.32?'scout':n<.6?'interceptor':n<.8?'weaver':n<.97?'armored':'carrier';return n<.2?'scout':n<.42?'interceptor':n<.65?'weaver':n<.85?'armored':'carrier'}
function fireHostile(px,py,angle,speed=170,r=5,c='#ff818a',kind='bolt'){if(hostileShots.length>=HOSTILE_CAP)return false;hostileShots.push({x:px,y:py,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r,c,t:kind,life:8});return true}
function enemyAttack(enemy){if(!player)return;const aim=Math.atan2(player.y+10-enemy.y,player.x-enemy.x),speed=(145+Math.min(level,30)*2.1)*difficulties[difficulty].speed;if(enemy.type==='scout')fireHostile(enemy.x,enemy.y+15,Math.PI/2,speed,4,'#7df0ff');else if(enemy.type==='interceptor'){fireHostile(enemy.x-14,enemy.y+8,aim-.07,speed+17,5,enemy.c);fireHostile(enemy.x+14,enemy.y+8,aim+.07,speed+17,5,enemy.c)}else if(enemy.type==='armored'){for(let i=-1;i<=1;i++)fireHostile(enemy.x,enemy.y+24,Math.PI/2+i*.24,speed,6,enemy.c)}else if(enemy.type==='weaver'){fireHostile(enemy.x,enemy.y+16,aim,speed+24,5,enemy.c)}else{for(let i=-2;i<=2;i++)fireHostile(enemy.x+i*10,enemy.y+22,Math.PI/2+i*.18,speed,5,enemy.c)}rings.push({x:enemy.x,y:enemy.y+14,r:2,max:18,life:.16,total:.16,c:enemy.c})}
function createPickup(type,px,py){const q={type,x:clamp(px,28,W-28),y:py,vy:145,phase:rnd(0,TAU),r:20,life:15};pickups.push(q);return q}
function unlockedTier(){return level>=11?['laser','spread','plasma','arc','beam']:level>=6?['laser','spread','plasma','arc']:stageTime>=18?['laser','spread','plasma']:['laser','spread']}
function chooseWeaponDrop(){const tier=unlockedTier(),missing=tier.filter(w=>!inventory[w]),upgrades=tier.filter(w=>inventory[w]<MAX_POWER);return missing.length&&Math.random()<.75?missing[0]:upgrades.length?upgrades[Math.floor(Math.random()*upgrades.length)]:tier[Math.floor(Math.random()*tier.length)]}
function spawnWeaponDrop(type,px,py){if(!stats[type]||weaponDropCount>=WEAPON_DROP_BUDGET||gameTime<weaponDropReady||gameTime-lastWeaponDrop<WEAPON_DROP_GAP||pickups.some(q=>stats[q.type]&&!q.collected))return null;lastWeaponDrop=gameTime;weaponDropReady=gameTime+WEAPON_DROP_GAP;nextWeaponDrop=gameTime+rnd(36,51);weaponDropCount++;const q=createPickup(type,px,py);q.vy=Math.max(155,H*.28);if(!inventory[type])announce('РЕДКАЯ КАПСУЛА: '+stats[type].short,'Перехвати её — новое оружие сохранится в арсенале',2.5);return q}
function dropReward(px,py,guaranteeWeapon=false){if(guaranteeWeapon)return spawnWeaponDrop(chooseWeaponDrop(),px,py);const n=Math.random();return n<.3?createPickup('heart',px,py):createPickup('shield',px,py)}
function updateDropSchedule(){if(level===1&&!guaranteed.has('intro')&&stageTime>=12){guaranteed.add('intro');spawnWeaponDrop('spread',player.x,-24);return}if(gameTime<nextWeaponDrop||weaponDropCount>=WEAPON_DROP_BUDGET)return;nextWeaponDrop=gameTime+rnd(22,34);if(Math.random()<.42)spawnWeaponDrop(chooseWeaponDrop(),rnd(W*.18,W*.82),-24)}
function fireRate(){return overdrive>0?1+boostTier*.3:1}
function dropBoost(px,py,force=false){
 const pressure=enemies.filter(e=>!e.dead).length,accelerated=level>=6;
 if(stageMode!=='wave'||stageTime<16||(!accelerated&&pressure<5)||boostDropCount>=4||gameTime-lastBoostDrop<10||pickups.some(q=>q.type==='overdrive'&&!q.collected&&q.life>0))return false;
 if(!force&&Math.random()>=Math.min(.36,.12+pressure*.02+(accelerated?.08:0)))return false;
 createPickup('overdrive',px,py);lastBoostDrop=gameTime;boostDropCount++;return true
}
function chainDischarge(shot,victim){
 let origin={x:victim.x,y:victim.y},damage=shot.d;
 for(let i=0;i<(shot.chains||0);i++){
  let next=null,distance=shot.chainRange;const candidates=[...enemies,...(boss?[boss]:[])];
  for(const candidate of candidates){if(candidate.dead||shot.hit.has(candidate))continue;const d=Math.hypot(candidate.x-origin.x,candidate.y-origin.y);if(d<distance){next=candidate;distance=d}}
  if(!next)break;shot.hit.add(next);damage*=.78;arcs.push({ax:origin.x,ay:origin.y,bx:next.x,by:next.y,life:.24,total:.24,seed:rnd(0,TAU)});
  if(next===boss)damageBoss(damage);else damageEnemy(next,damage);origin={x:next.x,y:next.y};if(stageMode==='victory')break
 }
}
function collectPickup(q){if(!q||q.collected)return false;q.collected=true;pickupsCollected++;const type=q.type;if(stats[type]){const previous=inventory[type];profile.improveWeapon(type);inventory[type]=Math.min(MAX_POWER,previous+1);setWeapon(type);audio.speak(previous===0?type:'upgrade',2);announce(previous===0?'НОВОЕ ОРУЖИЕ: '+stats[type].short:previous<MAX_POWER?stats[type].short+' · МОЩНОСТЬ '+inventory[type]:'МАКСИМАЛЬНАЯ МОЩНОСТЬ',previous===0?'Капсула подобрана — оружие уже в руках!':previous<MAX_POWER?campaign.weaponGrades[inventory[type]-1].name+' · улучшение сохранено':'Бонус +300 очков',2.5);score+=previous===MAX_POWER?300:150;label(q.x,q.y,previous?'LV '+inventory[type]:'НОВОЕ!',stats[type].c)}else if(type==='overdrive'){audio.speak('turbo',2);boostTier=Math.min(3,boostTier+1);overdrive=Math.min(18,overdrive+12);label(q.x,q.y,'ТУРБО ×'+fireRate().toFixed(1),'#69ffd6');announce('ОРУЖИЕ УСКОРЕНО ×'+fireRate().toFixed(1),'Любое оружие стреляет быстрее · временный заряд',1.8)}else if(type==='shield'){audio.speak('shield',2);player.shield=Math.min(20,player.shield+8+profile.state.upgrades.shield);label(q.x,q.y,'ЩИТ · 8 С','#73ddff');announce('ЭНЕРГОЩИТ ВКЛЮЧЁН','Защита от кораблей и их выстрелов',1.9)}else if(type==='heart'){const previous=lives;lives=Math.min(maxLives(),lives+1);label(q.x,q.y,previous===lives?'+250':'♥ +1','#ff9ba4');if(previous===lives)score+=250}else if(type==='salvage'){salvageTaken++;score+=35;label(q.x,q.y,'+1 СПЛАВ','#eac78b')}else score+=200;boom(q.x,q.y,14,stats[type]?stats[type].c:'#9cf8ff',.55);audio.effect(type==='overdrive'?'turbo':type==='shield'?'shield':'pickup');updateUI();return true}
function damageEnemy(enemy,amount){if(!enemy||enemy.dead||enemy.hp<=0)return false;enemy.hp-=amount;enemy.hit=.13;if(enemy.hp<=0){enemy.dead=true;killed++;if(enemy.elite)eliteKills++;score+=enemy.points;if(Math.random()<.26)createPickup('salvage',enemy.x,enemy.y);boom(enemy.x,enemy.y,18+(enemy.r>30?9:0),enemy.c);rings.push({x:enemy.x,y:enemy.y,r:8,max:enemy.r*2.3,life:.34,total:.34,c:enemy.c});label(enemy.x,enemy.y,'+'+enemy.points,enemy.c);dropBoost(enemy.x,enemy.y);if(gameTime>=20&&Math.random()<.035)spawnWeaponDrop(chooseWeaponDrop(),enemy.x,enemy.y);if(Math.random()<.06)dropReward(enemy.x,enemy.y);audio.effect('explosion',enemy.r>30?1:.7)}return true}
function damagePlayer(){if(!player||!running||stageMode==='victory'||player.inv>0)return false;if(player.shield>0){player.inv=.12;rings.push({x:player.x,y:player.y+10,r:30,max:70,life:.24,total:.24,c:'#73efff'});pulseSound(350,.08,'sine',.03);return false}lives--;missionDamage++;audio.effect('damage');if(lives===1)audio.speak('critical',3);document.dispatchEvent(new CustomEvent('imran:haptic',{detail:{kind:'damage'}}));player.inv=1.6;shake=profile.state.settings.reducedMotion?0:.28;boom(player.x,player.y,23,'#ffac73');label(player.x,player.y-45,'♥ −1','#ff9c9c');hostileShots=hostileShots.filter(s=>Math.hypot(s.x-player.x,s.y-player.y)>86);pulseSound(75,.24,'sawtooth',.07);updateUI();if(lives<=0)endGame();return true}
function bossFlightY(){return H<=500?H*.35:Math.max(H*.24,185+boss.r*1.35)}
function beginBoss(){if(stageMode!=='wave'||boss)return;stageMode='boss';audio.setScene('boss');audio.speak('boss',4);const cfg=bosses[mission.boss],scale=1+Math.max(0,level-30)*.022,maxHp=Math.round((cfg.hp+(runMode==='endless'?Math.floor((level-1)/30)*bosses[29].hp:0))*scale*difficulties[difficulty].boss);for(const enemy of enemies)boom(enemy.x,enemy.y,5,'#70c4ff',.45);enemies=[];hostileShots=[];hazards=[];boss={...cfg,r:Math.min(cfg.r,H<=500?52:Math.max(42,(H-370)/3.4)),x:W/2,y:-120,entry:1.6,age:0,hp:maxHp,maxHp,phase:1,fire:cfg.interval,cycle:0,warning:null,queued:[],hit:0,dead:false};announce('ВНИМАНИЕ: '+cfg.title.toUpperCase(),'Уворачивайся от подсвеченных атак и пробей броню',3.3);pulseSound(120,.35,'sawtooth',.07);updateUI()}
function damageBoss(amount){
 if(!boss||boss.dead)return false;
 boss.hp-=amount;boss.hit=.11;
 if(boss.hp<=0){defeatBoss();return true}
 const phase=boss.phases===3&&boss.hp<=boss.maxHp*.26?3:boss.hp<=boss.maxHp*.58?2:1;
 if(phase>boss.phase){boss.phase=phase;boss.fire=Math.min(boss.fire,1.3);rings.push({x:boss.x,y:boss.y,r:15,max:boss.r*2.5,life:.6,total:.6,c:boss.c});announce(phase===3?'БОСС: СВЕРХНОВАЯ':'БОСС: ВТОРАЯ ФАЗА',phase===3?'Последний рубеж — следи за зарядом орудий':'Командир меняет рисунок огня и ускоряет атаки',2.5)}
 return true
}
function defeatBoss(){if(!boss||boss.dead)return false;boss.dead=true;const px=boss.x,py=boss.y,reward=1400+level*220;score+=reward;bossesKilled++;boom(px,py,68,boss.c);boom(px,py,40,'#fff0b7');rings.push({x:px,y:py,r:10,max:Math.min(W*.85,260),life:1.1,total:1.1,c:boss.c});label(px,py,'БОСС +'+reward,'#fff2a1');shake=.45;boss=null;hostileShots=[];enemies=[];hazards=[];stormWarnings=[];beginVictory();return true}
function beginNextStage(){audio.setScene('battle');audio.speak('sector',4);clearVictory();overdrive=0;boostTier=0;boostDropCount=0;lastBoostDrop=gameTime;level++;changeMission((level-1)%30+1);formationTime=1.5;formationIndex=0;formationPlans=[];weaponDropCount=0;nextWeaponDrop=gameTime+rnd(28,41);stormClock=12;stageTime=0;stageMode='wave';spawn=1;guaranteed=new Set();player.inv=Math.max(player.inv,1.4);announce('СЕКТОР '+level+' · '+world.name.toUpperCase(),'Новые корабли, оружие и командир флота',3);updateUI()}
function bossWarning(){
 if(!boss)return;
 const kind=boss.patterns[boss.cycle%boss.patterns.length];boss.cycle++;
 const lanes=[clamp(player.x,35,W-35)];
 if(boss.phase>=2||boss.stage>=10)lanes.push(clamp(player.x+(player.x<W/2?94:-94),35,W-35));
 const duration=Math.max(.68,boss.telegraph-(boss.phase-1)*.07);
 boss.warning={kind,time:duration,total:duration,targetX:player.x,targetY:player.y+10,lanes};
}
function bossAttack(){
 if(!boss||!boss.warning)return;
 const b=boss,w=b.warning,speed=b.speed*difficulties[difficulty].speed,aim=Math.atan2(w.targetY-b.y,w.targetX-b.x);
 const density=Math.min(15,b.density+(b.phase-1)*2),originY=b.y+b.r*.48;
 const fan=(px,py,n,center,step,velocity=speed,r=5)=>{for(let i=0;i<n;i++)fireHostile(px,py,center+(i-(n-1)/2)*step,velocity,r,b.c,'orb')};
 const queue=(delay,px,py,n,center,step,velocity=speed,r=5)=>b.queued.push({delay,px,py,n,center,step,speed:velocity,r});
 if(w.kind==='fan')fan(b.x,originY,density,Math.PI/2,.14,speed,6);
 else if(w.kind==='aim'){fan(b.x,originY,b.phase>=2?5:3,aim,.115,speed+32,6);if(b.phase===3){queue(.2,b.x-b.r*.65,originY,3,aim,.1);queue(.35,b.x+b.r*.65,originY,3,aim,.1)}}
 else if(w.kind==='ring'||w.kind==='nova'){const n=w.kind==='nova'?density+7:density+4,step=Math.PI/(n+1),offset=(b.cycle%2?1:-1)*.08;for(let i=0;i<n;i++){if(w.kind==='nova'&&Math.abs(i-(n-1)/2)<1.5)continue;fireHostile(b.x,originY,.1+i*step+offset,speed*(w.kind==='nova'?.75:.84),w.kind==='nova'?7:6,b.c,'orb')}}
 else if(w.kind==='minions'){const n=Math.min(5,2+Math.floor(b.stage/10));for(let i=0;i<n&&enemies.length<Math.min(7,enemyCap());i++){const e=createEnemy(i%3===1?'armored':'interceptor',b.phase===3&&i===1);e.x=W*(i+1)/(n+1);e.baseX=e.x;e.y=b.y+25;e.vy*=.75;e.fire=1.45}}
 else if(w.kind==='cross'){const n=Math.ceil(density*.6);fan(b.x-b.r*.65,originY,n,Math.PI/2+.24,.14);fan(b.x+b.r*.65,originY,n,Math.PI/2-.24,.14)}
 else if(w.kind==='lanes'){for(const lane of w.lanes)hazards.push({x:lane,y:originY,w:20+b.phase*2,life:.52,total:.52,c:b.c})}
 else if(w.kind==='needles'){for(let i=0;i<3+b.phase;i++)queue(i*.15,b.x+(i%2?1:-1)*b.r*.35,originY,2,aim,.06,speed+42,4)}
 else if(w.kind==='sweep'){const dir=b.cycle%2?1:-1;for(let i=0;i<4;i++)queue(i*.18,b.x,originY,3,Math.PI/2+dir*(i-1.5)*.27,.12,speed*.9)}
 else if(w.kind==='wings'){const n=Math.ceil(density*.55);fan(b.x-b.r*.85,originY,n,Math.PI/2+.3,.15);fan(b.x+b.r*.85,originY,n,Math.PI/2-.3,.15)}
 else if(w.kind==='rake'){const n=5+Math.floor(b.stage/8),gap=b.cycle%n;for(let i=0;i<n;i++)if(i!==gap)queue((i%3)*.11,W*(i+.5)/n,originY,2,Math.PI/2,.04,speed*.88)}
 else if(w.kind==='barrage'){for(let i=0;i<3;i++)queue(i*.22,b.x+(i-1)*b.r*.5,originY,3+b.phase,aim,.11,speed*(.9+i*.07),5)}
 else if(w.kind==='lattice'){const n=Math.ceil(density*.45);fan(b.x-b.r,originY,n,Math.PI/2+.48,.12,speed*.85);fan(b.x+b.r,originY,n,Math.PI/2-.48,.12,speed*.85);queue(.32,b.x,originY,3,Math.PI/2,.21,speed*.8)}
 else if(w.kind==='spiral'){for(let i=0;i<3;i++)queue(i*.2,b.x,originY,Math.ceil(density*.65),Math.PI/2+Math.sin(b.age+i*.55)*.35,.17,speed*.8)}
 rings.push({x:b.x,y:originY,r:5,max:b.r*.8,life:.22,total:.22,c:b.c});
 b.warning=null;b.fire=Math.max(1.25,b.interval-(b.phase-1)*.28)/difficulties[difficulty].fire;pulseSound(170,.19,'triangle',.05);
}
function updateBossFlight(dt){
 const b=boss,m=b.movement,a=b.age*m.frequency+m.phase,amplitude=Math.min(W*m.amplitude,140),base=bossFlightY();
 let vx=Math.sin(a),vy=Math.sin(a*1.4)*m.depth;
 if(m.kind==='figure8'){vx=Math.sin(a);vy=Math.sin(a*2)*m.depth*1.4}
 else if(m.kind==='pendulum'){vx=Math.sin(a)*Math.abs(Math.sin(a*.5));vy=Math.cos(a)*m.depth}
 else if(m.kind==='steps'){vx=Math.tanh(Math.sin(a)*3)*.83;vy=Math.sin(a*2)*m.depth*.5}
 else if(m.kind==='orbit'){vx=Math.cos(a);vy=Math.sin(a)*m.depth*1.6}
 else if(m.kind==='lunge'){vx=Math.sin(a*.8);vy=Math.pow(Math.max(0,Math.sin(a)),4)*Math.min(22,m.depth*2)}
 b.x=clamp(W/2+vx*amplitude,b.r*1.3+8,W-b.r*1.3-8);b.y=base+vy;
 for(const q of b.queued){q.delay-=dt;if(q.delay<=0&&!q.fired){q.fired=true;for(let i=0;i<q.n;i++)fireHostile(q.px,q.py,q.center+(i-(q.n-1)/2)*q.step,q.speed,q.r,b.c,'orb')}}
 b.queued=b.queued.filter(q=>!q.fired);
}
function boom(px,py,count=18,color='#ffad6c',scale=1){const remaining=Math.max(0,260-parts.length);for(let i=0;i<Math.min(count,remaining);i++){const angle=rnd(0,TAU),speed=rnd(45,230)*scale,life=rnd(.28,.75);parts.push({x:px,y:py,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life,total:life,size:rnd(1.7,5.8)*scale,c:color})}}
function label(px,py,text,color='#ffe896'){floaters.push({x:px,y:py,text,c:color,life:1.1})}
function update(dt){if(!running||paused)return;gameTime+=dt;if(stageMode==='victory'){updateVictory(dt);return}if(overdrive>0){overdrive=Math.max(0,overdrive-dt);if(overdrive===0)boostTier=0}arcs=arcs.filter(a=>(a.life-=dt)>0);special=Math.min(100,special+dt*6);if(gameTime>5)ui.hint.classList.add('fade');if(gameTime>6)ui.hint.classList.add('hidden');stageTime+=stageMode==='wave'?dt:0;player.inv=Math.max(0,player.inv-dt);player.shield=Math.max(0,player.shield-dt);shake=Math.max(0,shake-dt);announceTime-=dt;if(announceTime<=0&&ui.announce){ui.announce.classList.add('hidden');ui.announce.classList.remove('show')}for(const s of stars){s.y+=(20+110*s.z)*dt;s.tw+=dt;if(s.y>H+5){s.y=-5;s.x=Math.random()*W}}
 const bounds=playerBounds(),dx=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA')),dy=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));if(dx||dy){const step=350*dt*(profile.state.ship==='swift'?1.25:profile.state.ship==='bastion'?.88:1)/(Math.hypot(dx,dy)||1);target.x=clamp(target.x+dx*step,bounds.left,bounds.right);target.y=clamp(target.y+dy*step,bounds.top,bounds.bottom)}const follow=1-Math.exp(-20*dt),oldX=player.x,oldY=player.y;player.x=clamp(player.x+(target.x-player.x)*follow,bounds.left,bounds.right);player.y=clamp(player.y+(target.y-player.y)*follow,bounds.top,bounds.bottom);player.vx=(player.x-oldX)/Math.max(.001,dt);player.vy=(player.y-oldY)/Math.max(.001,dt);if(fireTouches.size||profile.state.settings.autoFire)shoot();updateDrone();
 if(stageMode==='wave'){
  updateDropSchedule();
  if(mission.objective==='salvage')for(const time of [14,28,42]){const flag='salvage-'+time;if(stageTime>=time&&!guaranteed.has(flag)){guaranteed.add(flag);createPickup('salvage',rnd(W*.2,W*.8),-24)}}
  if(stageTime>=waveDuration())beginBoss();
  else{spawn-=dt;formationTime-=dt;if(spawn<=0){if(enemies.filter(e=>!e.dead).length<enemyCap()-2)createEnemy(chooseEnemy(),stageTime>14&&Math.random()<mission.eliteRate);spawn=Math.max(.56,.98-(Math.min(level,30)-1)*.012)*difficulties[difficulty].spawn*rnd(.85,1.2)}if(formationTime<=0){spawnFormation();formationTime=Math.max(5.8,9.5-(Math.min(level,30)-1)*.1)}updateStorm(dt)}
 }else if(stageMode==='intermission'){intermission-=dt;if(intermission<=0)beginNextStage()}
 for(const enemy of enemies){if(enemy.dead)continue;enemy.age+=dt;enemy.hit=Math.max(0,enemy.hit-dt);moveEnemy(enemy,dt);if((!enemy.entry||enemy.entry.released)&&enemy.y>35&&enemy.y<H*.67&&gameTime>4){enemy.fire-=dt*difficulties[difficulty].fire;if(enemy.fire<=0){enemyAttack(enemy);enemy.fire=enemyTypes[enemy.type].fire/(1+Math.min(level-1,29)*.028)}}if(enemy.y>H+enemy.r+20)enemy.dead=true;if(!enemy.dead&&Math.hypot(enemy.x-player.x,enemy.y-(player.y+10))<enemy.r*.72+PLAYER_RADIUS){if(damagePlayer()){enemy.dead=true;boom(enemy.x,enemy.y,20,enemy.c)}}}
 if(!running)return;
 if(boss){boss.age+=dt;boss.hit=Math.max(0,boss.hit-dt);if(boss.entry>0){boss.entry=Math.max(0,boss.entry-dt);const progress=1-boss.entry/1.6;boss.y=-120+(bossFlightY()+120)*(1-Math.pow(1-progress,3))}else{updateBossFlight(dt);if(boss.warning){boss.warning.time-=dt;if(boss.warning.time<=0)bossAttack()}else{boss.fire-=dt;if(boss.fire<=0)bossWarning()}}if(Math.hypot(boss.x-player.x,boss.y-(player.y+10))<boss.r*.75+PLAYER_RADIUS)damagePlayer()}
 if(!running)return;
 for(const shot of shots){shot.life-=dt;shot.prevX=shot.x;shot.prevY=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;if(shot.bounce>0&&(shot.x<shot.r||shot.x>W-shot.r)){shot.x=clamp(shot.x,shot.r,W-shot.r);shot.vx*=-1;shot.bounce--;shot.d*=.85;}}
 for(let i=shots.length-1;i>=0;i--){
  const shot=shots[i];
  if(shot.life<=0||shot.y<-120||shot.y>H+80||shot.x<-90||shot.x>W+90){shots.splice(i,1);continue}
  let collision=null;for(const enemy of enemies){if(enemy.dead||shot.hit.has(enemy))continue;if(segmentDistance(shot.prevX??shot.x,shot.prevY??shot.y,shot.x,shot.y,enemy.x,enemy.y)<shot.r+enemy.r*.82){collision=enemy;break}}
  const hitBoss=!collision&&boss&&!shot.hit.has(boss)&&segmentDistance(shot.prevX??shot.x,shot.prevY??shot.y,shot.x,shot.y,boss.x,boss.y)<shot.r+boss.r*.78;
  if(!collision&&!hitBoss)continue;
  const victim=collision||boss;hitsLanded++;shot.hit.add(victim);
  if(shot.t==='plasma'){
   const blast=shot.blast||105;for(const enemy of enemies)if(!enemy.dead&&Math.hypot(enemy.x-shot.x,enemy.y-shot.y)<blast+enemy.r*.3)damageEnemy(enemy,shot.d);
   if(boss&&Math.hypot(boss.x-shot.x,boss.y-shot.y)<blast+boss.r*.6)damageBoss(shot.d);
   if(stageMode==='victory')return;
   rings.push({x:shot.x,y:shot.y,r:10,max:blast,life:.38,total:.38,c:stats.plasma.c});boom(shot.x,shot.y,23,stats.plasma.c,.85);
   for(let k=0;k<(shot.shards||0)&&shots.length<180;k++){const angle=TAU*k/shot.shards;shots.push({x:shot.x,y:shot.y,vx:Math.cos(angle)*420,vy:Math.sin(angle)*420,r:4,d:shot.d*.28,t:'spread',power:shot.power,color:'#e6b0ff',life:.8,pierce:1,hit:new Set(shot.hit)})}
   shot.pierce=0
  }else{
   if(collision)damageEnemy(collision,shot.d);else damageBoss(shot.d);
   if(stageMode==='victory')return;
   if(shot.t==='arc')chainDischarge(shot,victim);
   boom(shot.x,shot.y,shot.t==='arc'?18:4,shot.color||stats[shot.t].c,shot.t==='arc'?.85:.45);shot.pierce--
  }
  if(stageMode==='victory')return;
  if(shot.pierce<=0)shots.splice(i,1)
 }
 if(!running)return;
 enemies=enemies.filter(enemy=>!enemy.dead);for(let i=hostileShots.length-1;i>=0;i--){const shot=hostileShots[i];if(!shot)continue;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;if(Math.hypot(shot.x-player.x,shot.y-(player.y+10))<shot.r+PLAYER_RADIUS){damagePlayer();if(!running)return;if(hostileShots[i]===shot)hostileShots.splice(i,1);continue}if(shot.life<=0||shot.y>H+50||shot.y<-90||shot.x<-50||shot.x>W+50)hostileShots.splice(i,1)}
 for(let i=hazards.length-1;i>=0;i--){const hazard=hazards[i];hazard.life-=dt;if(Math.abs(player.x-hazard.x)<hazard.w/2+PLAYER_RADIUS&&player.y+10>hazard.y)damagePlayer();if(hazard.life<=0)hazards.splice(i,1)}
 if(!running)return;
 for(const q of pickups){q.life-=dt;q.phase+=dt*3;q.y+=q.vy*dt;const distance=Math.hypot(q.x-player.x,q.y-(player.y+10));if(distance<102+profile.state.upgrades.magnet*18){q.x+=(player.x-q.x)*Math.min(1,dt*4);q.y+=(player.y+10-q.y)*Math.min(1,dt*3.5)}if(distance<q.r+PLAYER_RADIUS+7)collectPickup(q)}pickups=pickups.filter(q=>!q.collected&&q.life>0&&q.y<H+50);for(const p of parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-2.2*dt);p.vy*=Math.exp(-2.2*dt);p.life-=dt}parts=parts.filter(p=>p.life>0);for(const ring of rings){ring.life-=dt;ring.r+=(ring.max-ring.r)*Math.min(1,dt*10)}rings=rings.filter(r=>r.life>0);for(const f of floaters){f.y-=35*dt;f.life-=dt}floaters=floaters.filter(f=>f.life>0);updateUI();}
function circle(px,py,r,color){x.fillStyle=color;x.beginPath();x.arc(px,py,Math.max(0,r),0,TAU);x.fill()}
function poly(points,fill,stroke,width=1){x.beginPath();points.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();if(fill){x.fillStyle=fill;x.fill()}if(stroke){x.strokeStyle=stroke;x.lineWidth=width;x.stroke()}}
function glow(px,py,r,color,alpha=.2){x.save();x.globalAlpha=alpha;x.shadowColor=color;x.shadowBlur=r*.75;circle(px,py,r*.38,color);x.restore()}
function planet(px,py,r){x.save();x.globalAlpha=.67;const g=x.createRadialGradient(px-r*.55,py-r*.6,r*.1,px,py,r);g.addColorStop(0,world.planet[0]);g.addColorStop(.55,world.planet[1]);g.addColorStop(1,world.planet[2]);circle(px,py,r,g);x.strokeStyle='rgba(122,182,240,.32)';x.lineWidth=1;x.beginPath();x.arc(px,py,r+3,0,TAU);x.stroke();x.globalAlpha=.14;x.strokeStyle='#96a3e2';x.lineWidth=r*.13;x.beginPath();x.ellipse(px,py,r*1.65,r*.3,-.28,0,TAU);x.stroke();x.restore()}
function drawBackground(){x.fillStyle='#03071c';x.fillRect(0,0,W,H);if(nebula.complete&&nebula.naturalWidth){const scale=Math.max(W/nebula.naturalWidth,H/nebula.naturalHeight)*1.08,iw=nebula.naturalWidth*scale,ih=nebula.naturalHeight*scale,offset=Math.sin(gameTime*.028)*Math.min(20,(ih-H)*.4);x.drawImage(nebula,(W-iw)/2,(H-ih)/2+offset,iw,ih);x.fillStyle='rgba(3,7,25,.3)';x.fillRect(0,0,W,H)}else{const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,'#090a28');g.addColorStop(.45,'#112754');g.addColorStop(1,'#03091c');x.fillStyle=g;x.fillRect(0,0,W,H);x.save();x.globalAlpha=.23;x.fillStyle='#6949cf';x.beginPath();x.ellipse(W*.22,H*.34,W*.65,H*.1,-.4,0,TAU);x.fill();x.globalAlpha=.13;x.fillStyle='#24a0cd';x.beginPath();x.ellipse(W*.8,H*.68,W*.55,H*.11,-.4,0,TAU);x.fill();x.restore()}x.fillStyle=world.shade;x.fillRect(0,0,W,H);drawWorldDetails();planet(W*.92,H*.31,Math.min(W,H)*.17);for(const s of stars){const size=.5+s.z*1.2;x.globalAlpha=.23+s.z*.6+Math.sin(s.tw)*.08;x.fillStyle=s.z>.8?'#d9f4ff':'#9baada';x.fillRect(s.x,s.y,size,size+(running&&!paused?s.z*2.4:0))}x.globalAlpha=1;const shade=x.createLinearGradient(0,H*.65,0,H);shade.addColorStop(0,'rgba(2,7,22,0)');shade.addColorStop(1,'rgba(2,7,22,.65)');x.fillStyle=shade;x.fillRect(0,H*.65,W,H*.35)}
function atlasShip(index,size){if(!alienAtlas.complete||!alienAtlas.naturalWidth)return false;const cellW=alienAtlas.naturalWidth/3,cellH=alienAtlas.naturalHeight/2;x.drawImage(alienAtlas,(index%3)*cellW,Math.floor(index/3)*cellH,cellW,cellH,-size/2,-size/2,size,size);return true}
function ship(enemy){x.save();x.translate(enemy.x,enemy.y);x.rotate(enemy.type==='weaver'?Math.cos(enemy.age*2.15+enemy.phase)*.15:Math.sin(enemy.age)*.025);const r=enemy.r,color=enemy.c;glow(0,-r*.3,r*1.2,color,.23);if(!atlasShip(enemyTypes[enemy.type].sprite,r*2.65)){const metal=x.createLinearGradient(0,-r,0,r);metal.addColorStop(0,'#b4c6de');metal.addColorStop(.35,'#34415f');metal.addColorStop(.7,'#14213d');metal.addColorStop(1,'#8493b3');if(enemy.type==='scout'){poly([[-r,-r*.22],[-r*.28,-r*.55],[0,-r*.85],[r*.28,-r*.55],[r,-r*.22],[r*.78,r*.42],[r*.25,r*.22],[0,r],[-r*.25,r*.22],[-r*.78,r*.42]],metal,'#92c5e6',1);poly([[-r*.18,-r*.38],[r*.18,-r*.38],[r*.28,r*.38],[0,r*.7],[-r*.28,r*.38]],'#071b32',color,1.4)}else if(enemy.type==='interceptor'||enemy.type==='weaver'){poly([[-r*1.2,-r*.55],[-r*.48,-r*.22],[-r*.22,-r*.85],[r*.22,-r*.85],[r*.48,-r*.22],[r*1.2,-r*.55],[r*.8,r*.7],[r*.22,r*.3],[0,r],[-r*.22,r*.3],[-r*.8,r*.7]],metal,'#9c93c7',1.4);poly([[-r*.15,-r*.4],[r*.15,-r*.4],[r*.24,r*.4],[0,r*.68],[-r*.24,r*.4]],'#332461',color,1.6);circle(-r*.78,r*.28,3,color);circle(r*.78,r*.28,3,color)}else if(enemy.type==='armored'){poly([[-r,-r*.45],[-r*.65,-r*.85],[r*.65,-r*.85],[r,-r*.45],[r*.9,r*.62],[r*.48,r*.85],[-r*.48,r*.85],[-r*.9,r*.62]],metal,'#a2b1bd',1.7);for(const side of [-1,1]){poly([[side*r*.3,-r*.53],[side*r*.8,-r*.35],[side*r*.72,r*.45],[side*r*.32,r*.62]],'#26364a','#7e8b9e',1);x.fillStyle='#0a1222';x.fillRect(side*r*.55-5,r*.48,10,r*.42);circle(side*r*.55,r*.88,4,color)}poly([[-r*.27,-r*.36],[r*.27,-r*.36],[r*.31,r*.16],[0,r*.35],[-r*.31,r*.16]],'#4e351f',color,2)}else{poly([[-r,-r*.52],[-r*.52,-r*.83],[r*.52,-r*.83],[r,-r*.52],[r*1.15,r*.25],[r*.78,r*.63],[r*.3,r*.43],[0,r*.9],[-r*.3,r*.43],[-r*.78,r*.63],[-r*1.15,r*.25]],metal,'#ad93b2',1.5);poly([[-r*.25,-r*.42],[r*.25,-r*.42],[r*.36,r*.38],[0,r*.62],[-r*.36,r*.38]],'#382342',color,1.6);for(let i=-2;i<=2;i++)circle(i*r*.33,r*.27,3.5,color)}}if(enemy.elite){x.strokeStyle='#eed397';x.lineWidth=1.3;x.globalAlpha=.65;x.beginPath();x.arc(0,0,r*1.08,0,TAU);x.stroke();x.globalAlpha=1;x.fillStyle='#f0d397';x.font='700 8px system-ui';x.textAlign='center';x.fillText('ЭЛИТА',0,-r*1.25)}if(enemy.hit>0){x.globalAlpha=.6;circle(0,0,r*.53,'#fff');x.globalAlpha=1}if(enemy.hp<enemy.maxHp){x.fillStyle='#061126';x.fillRect(-r,-r-13,r*2,3);x.fillStyle=color;x.fillRect(-r,-r-13,r*2*Math.max(0,enemy.hp/enemy.maxHp),3)}x.restore()}
function atlasBoss(index,size){if(!bossAtlas.complete||!bossAtlas.naturalWidth)return false;const cw=bossAtlas.naturalWidth/6,ch=bossAtlas.naturalHeight/5,h=size*ch/cw;x.drawImage(bossAtlas,(index%6)*cw,Math.floor(index/6)*ch,cw,ch,-size/2,-h/2,size,h);return true}
function drawBoss(){
 if(!boss)return;const b=boss,r=b.r,v=b.shapeVariant,tier=b.armorTier;
 x.save();x.translate(b.x,b.y);x.rotate(Math.sin(b.age*.9)*.035);
 glow(0,0,r*2.2,b.c,.2);
 if(!atlasBoss(b.artIndex,r*3.35)){
 const metal=x.createLinearGradient(-r,-r,r,r);metal.addColorStop(0,'#718ba5');metal.addColorStop(.2,'#d0dfeb');metal.addColorStop(.35,'#465b75');metal.addColorStop(.6,'#18283f');metal.addColorStop(.83,'#4f6985');metal.addColorStop(1,'#182338');
 const hulls=[
 [[0,-1.3],[.28,-.65],[1.1,-.9],[1.48,-.15],[1.2,.75],[.48,.48],[0,1.1],[-.48,.48],[-1.2,.75],[-1.48,-.15],[-1.1,-.9],[-.28,-.65]],
 [[-.9,-1],[.9,-1],[1.4,-.48],[1.25,.8],[.55,1.05],[0,.72],[-.55,1.05],[-1.25,.8],[-1.4,-.48]],
 [[0,-1.25],[.6,-.7],[1.38,-.45],[1.2,.6],[.55,.88],[0,1.22],[-.55,.88],[-1.2,.6],[-1.38,-.45],[-.6,-.7]],
 [[0,-1.3],[.42,-.55],[1.42,-1],[1.15,1.03],[.48,.48],[0,1.3],[-.48,.48],[-1.15,1.03],[-1.42,-1],[-.42,-.55]],
 [[-.85,-1],[0,-.55],[.85,-1],[1.5,.1],[1.08,.84],[.45,.66],[0,1.2],[-.45,.66],[-1.08,.84],[-1.5,.1]]
 ];
 poly(hulls[v].map(([xx,yy])=>[xx*r,yy*r]),metal,b.accent,1.7);
 for(const side of [-1,1]){
  poly([[side*r*.48,-r*.64],[side*r*(1.05+v*.025),-r*.42],[side*r*.9,r*.46],[side*r*.44,r*.3]],'#112239',b.c,1.2);
  for(let j=0;j<tier;j++){const yy=-r*.37+j*r*.17;poly([[side*r*.62,yy],[side*r*.93,yy-r*.04],[side*r*.9,yy+r*.07],[side*r*.64,yy+r*.09]],'#536b81',b.accent,.5)}
  const barrel=r*(.63+v*.07);x.fillStyle='#071221';x.fillRect(side*barrel-5,r*.32,10,r*(.46+tier*.02));
  circle(side*barrel,r*(.77+tier*.02),4+b.phase,b.c);glow(side*barrel,r*.8,22,b.c,.3);
  if(tier>=3)poly([[side*r*.96,-r*.5],[side*r*(1.48+tier*.025),-r*.78],[side*r*1.35,-r*.13]],metal,b.c,1);
 }
 // The supplied alien art forms the central cockpit; the silhouette and armor kit belong to this commander.
 x.save();x.globalAlpha=.92;atlasShip(b.sprite,r*(v===1?1.64:1.9));x.restore();
 poly([[-r*.23,-r*.46],[0,-r*.73],[r*.23,-r*.46],[r*.27,r*.35],[0,r*.57],[-r*.27,r*.35]],'#0b1831',b.c,1.5);
 glow(0,-r*.03,r*.54,b.c,.36);circle(0,-r*.03,r*(.11+v*.013),b.c);circle(-r*.025,-r*.06,r*.045,'#fff');
 x.strokeStyle=b.accent;x.lineWidth=1.1;x.globalAlpha=.55;
 for(let j=0;j<tier;j++){x.beginPath();x.arc(0,-r*.03,r*(.28+j*.045),Math.PI*.1+b.age*.08,Math.PI*.88+b.age*.08);x.stroke()}
 x.globalAlpha=1;
 if(tier>=5){for(const side of [-1,1]){circle(side*r*1.25,r*.2,7,b.c);circle(side*r*1.25,r*.2,2,'#fff')}}
 }
 if(b.phase>=2){x.strokeStyle=b.c;x.globalAlpha=.32;x.lineWidth=b.phase===3?3:1.5;x.beginPath();x.arc(0,0,r*(1.48+Math.sin(b.age*3)*.05),0,TAU);x.stroke();x.globalAlpha=1}
 if(b.hit>0){x.globalAlpha=.5;circle(0,0,r*.32,'#fff')}
 x.restore();if(b.warning)drawWarning(b.warning)
}
function drawWarning(w){if(!boss)return;const b=boss,flicker=profile.state.settings.reducedMotion?.25:.25+Math.sin(gameTime*18)*.1;x.save();x.strokeStyle='#ffb677';x.lineWidth=1.5;x.setLineDash([7,9]);x.globalAlpha=.7;if(w.kind==='lanes'){for(const lane of w.lanes){x.fillStyle='rgba(255,113,101,'+flicker+')';x.fillRect(lane-(20+b.phase*2),b.y+b.r*.5,40+b.phase*4,H-b.y);x.beginPath();x.moveTo(lane,b.y+b.r*.5);x.lineTo(lane,H);x.stroke();circle(lane,H-148,18,'rgba(255,180,112,.5)')}}else if(['aim','needles','barrage'].includes(w.kind)){const angle=Math.atan2(w.targetY-b.y,w.targetX-b.x);x.beginPath();x.moveTo(b.x,b.y);x.lineTo(b.x+Math.cos(angle)*H*1.4,b.y+Math.sin(angle)*H*1.4);x.stroke();x.beginPath();x.arc(w.targetX,w.targetY,28,0,TAU);x.stroke()}else{const n=w.kind==='ring'?9:5,spread=w.kind==='ring'?1.33:.51;for(let i=0;i<n;i++){const angle=Math.PI/2+(i-(n-1)/2)*spread/((n-1)/2);x.beginPath();x.moveTo(b.x,b.y+20);x.lineTo(b.x+Math.cos(angle)*150,b.y+20+Math.sin(angle)*150);x.stroke()}}x.setLineDash([]);x.globalAlpha=.9;x.strokeStyle='#fff2aa';x.lineWidth=3;x.beginPath();x.arc(b.x,b.y,b.r*.32,-Math.PI/2,-Math.PI/2+TAU*(1-w.time/w.total));x.stroke();x.restore()}
function drawShot(s){x.save();x.translate(s.x,s.y);const color=s.color||stats[s.t].c;x.shadowColor=color;x.shadowBlur=s.t==='plasma'?17:10;if(s.t==='laser'){x.strokeStyle=color;x.lineWidth=s.r;x.beginPath();x.moveTo(0,13);x.lineTo(0,-(s.len||18));x.stroke();x.strokeStyle='#effeff';x.lineWidth=1.5;x.stroke()}else if(s.t==='beam'){x.strokeStyle='rgba(255,215,88,.23)';x.lineWidth=s.r*2.4;x.beginPath();x.moveTo(0,35);x.lineTo(0,-s.len);x.stroke();x.strokeStyle=color;x.lineWidth=s.r;x.stroke();x.strokeStyle='#fffef2';x.lineWidth=2;x.stroke() }else if(s.t==='arc'){glow(0,0,s.r*3,color,.45);x.rotate(gameTime*7);x.strokeStyle=color;x.lineWidth=2;for(let j=0;j<3;j++){x.rotate(TAU/3);x.beginPath();x.moveTo(-s.r,-s.r*.7);x.lineTo(0,-s.r*.3);x.lineTo(-s.r*.25,s.r*.1);x.lineTo(s.r,s.r*.7);x.stroke()}circle(0,0,s.r*.4,'#eafff9');x.beginPath();x.arc(0,0,s.r+3,0,TAU);x.stroke()}else if(s.t==='plasma'){glow(0,0,s.r*2.8,color,.4);circle(0,0,s.r,color);circle(-3,-3,s.r*.46,'#ffebff');x.strokeStyle='#f8c3ff';x.lineWidth=2;x.beginPath();x.arc(0,0,s.r+5,gameTime*8,gameTime*8+Math.PI*1.3);x.stroke()}else{circle(0,0,s.r,color);circle(0,0,1.8,'#fff')}x.restore()}
function drawPickup(q){const cfg=stats[q.type],color=cfg?cfg.c:q.type==='overdrive'?'#69ffd6':q.type==='heart'?'#ff90a4':q.type==='salvage'?'#e7c68d':'#78e6ff';x.save();x.translate(q.x,q.y);x.rotate(Math.sin(q.phase)*.07);glow(0,0,54,color,.32);x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=1;x.beginPath();x.moveTo(-11,-q.r-8);x.lineTo(-6,-q.r-18);x.moveTo(0,-q.r-12);x.lineTo(0,-q.r-27);x.moveTo(11,-q.r-8);x.lineTo(6,-q.r-18);x.stroke();poly([[-21,-15],[-14,-22],[14,-22],[21,-15],[21,15],[14,22],[-14,22],[-21,15]],'#112540',color,2);x.fillStyle=color;x.font='900 24px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText(cfg?cfg.icon:q.type==='overdrive'?'»':q.type==='heart'?'♥':q.type==='salvage'?'◈':'⬡',0,0);if(cfg||q.type==='overdrive'){x.font='900 9px system-ui';x.fillStyle='#e8f7ff';x.fillText(cfg?cfg.short:'ТУРБО',0,34)}x.restore()}
function drawFallbackPilot(){const rgrad=x.createLinearGradient(-28,0,32,0);rgrad.addColorStop(0,'#88adc4');rgrad.addColorStop(.38,'#f0fbff');rgrad.addColorStop(1,'#7194b4');poly([[0,-34],[19,-5],[26,45],[17,66],[-17,66],[-26,45],[-19,-5]],rgrad,'#bed8ee',1.5);poly([[-22,30],[-44,65],[-21,58]],'#fb6a51','#ffaf6f',1);poly([[22,30],[44,65],[21,58]],'#fb6a51','#ffaf6f',1);poly([[0,-34],[17,-8],[-17,-8]],'#ff8c53');poly([[-19,4],[19,4],[24,22],[-24,22]],'#2679b6');x.fillStyle='#132841';x.fillRect(-15,46,30,9);x.strokeStyle='#ffa58c';x.lineWidth=8;x.beginPath();x.moveTo(-14,-24);x.lineTo(-26,3);x.lineTo(-32,31);x.moveTo(14,-24);x.lineTo(24,-5);x.lineTo(28,23);x.stroke();x.strokeStyle='#3379bf';x.lineWidth=11;x.beginPath();x.moveTo(-11,-42);x.lineTo(-24,-20);x.lineTo(-15,-5);x.moveTo(11,-42);x.lineTo(26,-24);x.lineTo(14,-12);x.stroke();poly([[-17,-54],[17,-54],[19,-22],[-19,-22]],'#448fdb','#91bded',1);x.save();x.beginPath();x.arc(0,-67,22,0,TAU);x.clip();circle(0,-67,22,'#eab7a3');if(face.complete&&face.naturalWidth)x.drawImage(face,-23,-90,46,46);x.restore();x.strokeStyle='#8ceaff';x.lineWidth=1.3;x.beginPath();x.arc(0,-67,23,0,TAU);x.stroke()}
function drawPlayer(){if(!player)return;x.save();x.translate(player.x,player.y);x.rotate(clamp(player.vx/1800,-.13,.13));if(player.inv>0&&!profile.state.settings.reducedMotion)x.globalAlpha=.4+.6*(Math.sin(gameTime*37)*.5+.5);const f=x.createLinearGradient(0,49,0,128);f.addColorStop(0,'#faffea');f.addColorStop(.22,'#91f5ff');f.addColorStop(.55,'#38a8ff');f.addColorStop(1,'rgba(42,94,255,0)');x.fillStyle=f;x.beginPath();x.moveTo(-13,53);x.quadraticCurveTo(-10,90,0,126+Math.sin(gameTime*48)*9);x.quadraticCurveTo(10,90,13,53);x.fill();glow(0,64,55,'#4fdfff',.25);if(pilot.complete&&pilot.naturalWidth){const desiredH=Math.min(154,Math.max(143,H*.175)),scale=Math.min(108/pilot.naturalWidth,desiredH/pilot.naturalHeight),iw=pilot.naturalWidth*scale,ih=pilot.naturalHeight*scale;x.drawImage(pilot,-iw/2,-ih*.57,iw,ih)}else drawFallbackPilot();x.restore();if(player.shield>0){x.save();x.translate(player.x,player.y+10);const pulse=48+Math.sin(gameTime*4)*2;glow(0,0,pulse*1.4,'#73e7ff',.13);x.strokeStyle='rgba(124,238,255,.7)';x.lineWidth=2;x.beginPath();x.ellipse(0,0,pulse,pulse*1.32,0,0,TAU);x.stroke();x.globalAlpha=.45;x.strokeStyle='#c4f6ff';x.lineWidth=4;x.beginPath();x.ellipse(0,0,pulse,pulse*1.32,0,gameTime*1.6,gameTime*1.6+.9);x.stroke();x.restore()}x.save();x.globalAlpha=.45;circle(player.x,player.y+10,2.5,'#e6faff');x.restore()}
function draw(){drawBackground();if(stageMode==='victory'&&running){drawFireworks();return}x.save();drawArcs();if(shake>0&&!paused&&!profile.state.settings.reducedMotion)x.translate(Math.sin(gameTime*120)*shake*6,Math.cos(gameTime*131)*shake*4);for(const q of pickups)drawPickup(q);for(const s of shots)drawShot(s);for(const enemy of enemies)ship(enemy);drawBoss();for(const warning of stormWarnings){x.fillStyle='rgba(125,231,166,.14)';x.fillRect(warning.x-32,170,64,H);x.strokeStyle='#a4efb4';x.setLineDash([8,10]);x.strokeRect(warning.x-32,170,64,H-170);x.setLineDash([])}for(const hazard of hazards){x.save();x.globalAlpha=Math.min(1,hazard.life/.15);const g=x.createLinearGradient(hazard.x-hazard.w,0,hazard.x+hazard.w,0);g.addColorStop(0,'rgba(255,113,146,0)');g.addColorStop(.45,hazard.c);g.addColorStop(.5,'#fff8d5');g.addColorStop(.55,hazard.c);g.addColorStop(1,'rgba(255,113,146,0)');x.fillStyle=g;x.fillRect(hazard.x-hazard.w,hazard.y,hazard.w*2,H-hazard.y);x.restore()}for(const s of hostileShots){x.save();x.shadowColor=s.c;x.shadowBlur=8;circle(s.x,s.y,s.r,s.c);circle(s.x-s.r*.2,s.y-s.r*.2,s.r*.4,'#fffbef');x.restore()}drawPlayer();drawDrone();for(const p of parts){x.globalAlpha=Math.max(0,p.life/p.total);circle(p.x,p.y,p.size,p.c)}x.globalAlpha=1;for(const ring of rings){x.save();x.globalAlpha=ring.life/ring.total*.7;x.strokeStyle=ring.c;x.lineWidth=2;x.beginPath();x.arc(ring.x,ring.y,ring.r,0,TAU);x.stroke();x.restore()}for(const f of floaters){x.save();x.globalAlpha=Math.min(1,f.life*2);x.fillStyle=f.c;x.font='900 15px system-ui';x.textAlign='center';x.shadowColor='#02071a';x.shadowBlur=4;x.fillText(f.text,f.x,f.y);x.restore()}x.restore();if(paused){x.fillStyle='rgba(2,7,23,.72)';x.fillRect(0,0,W,H);}}
function clearVictory(){fireworks=[];victoryTime=0;victoryBurst=0;el('victoryScene').classList.add('hidden');el('victoryScene').classList.remove('victory-exit','scene-paused')}
function beginVictory(){
 audio.setScene('victory',true);audio.speak(runMode==='campaign'&&level===30?'finale':'victory',5);stageMode='victory';victoryTime=0;victoryBurst=0;shots=[];pickups=[];arcs=[];parts=[];rings=[];floaters=[];formationPlans=[];clearInput();shake=0;overdrive=0;boostTier=0;
 // Save victory immediately, so leaving during the celebration never loses a clear.
 if(runMode==='campaign'&&!lastReward){lastReward=profile.award(level,{score,kills:killed,salvage:salvageTaken,elites:eliteKills,damage:missionDamage});saveBest();document.dispatchEvent(new CustomEvent('imran:progress'))}
 const finale=runMode==='campaign'&&level===30;
 setText(el('victorySector'),(runMode==='campaign'?'МИССИЯ ':'СЕКТОР ')+String(level).padStart(2,'0')+' · ЗАЩИЩЁН');setText(el('victoryTitle'),finale?'ТРИУМФ!':'ПОБЕДА!');setText(el('victoryCopy'),finale?'Имран освободил всю галактику':'Имран защитил этот сектор');setText(el('victoryNextLabel'),finale?'ВСЕ 30 МИССИЙ ПРОЙДЕНЫ':'ВПЕРЕДИ НОВЫЙ СЕКТОР');setText(el('victoryNext'),finale?'Теперь — бесконечный рубеж':runMode==='campaign'?String(level+1).padStart(2,'0')+' / '+campaign.mission(level+1).name:'ВОЛНА '+(level+1)+' · '+campaign.mission(level%30+1).name);
 for(const item of [ui.top,ui.weapons,ui.hint,ui.fire,ui.announce,ui.bossHud,el('boostStatus')])item.classList.add('hidden');ui.over.classList.add('hidden');el('victoryScene').classList.remove('hidden','victory-exit');setClapFrame(0);firework(W*.22,H*.3);pulseSound(523,.22,'triangle',.07);updateUI()
}
function setClapFrame(frame){el('victoryPilot').style.backgroundPosition=(frame%3)*50+'% '+Math.floor(frame/3)*100+'%'}
function firework(px,py){const colors=['#ffe599','#77ffe0','#91cbff','#e1abff'];const count=profile.state.settings.reducedMotion?12:36;const color=colors[victoryBurst%colors.length];for(let i=0;i<count&&fireworks.length<180;i++){const angle=TAU*i/count,speed=rnd(55,135);fireworks.push({x:px,y:py,px,py,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:rnd(.8,1.3),total:1.3,color})}}
function updateVictory(dt){
 victoryTime+=dt;setClapFrame(profile.state.settings.reducedMotion?2:Math.floor(victoryTime*11)%6);
 const due=Math.floor(victoryTime/.55);if(due>victoryBurst&&victoryTime<3.9){victoryBurst=due;const positions=[[.76,.27],[.15,.54],[.83,.58],[.4,.18],[.62,.7],[.27,.7],[.8,.38]];const p=positions[(due-1)%positions.length];firework(W*p[0],H*p[1]);audio.effect('firework',.35)}
 for(const p of fireworks){p.px=p.x;p.py=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=35*dt;p.life-=dt}fireworks=fireworks.filter(p=>p.life>0);
 for(const s of stars){s.y+=(12+35*s.z)*dt;s.tw+=dt;if(s.y>H)s.y=0}
 if(victoryTime>=VICTORY_DURATION-.55)el('victoryScene').classList.add('victory-exit');
 if(victoryTime>=VICTORY_DURATION){if(runMode==='campaign')endGame(true);else{clearVictory();stageMode='intermission';intermission=.9;[ui.top,ui.weapons,ui.fire].forEach(e=>e.classList.remove('hidden'));createPickup('salvage',W*.5,H*.4);if(lives<maxLives())createPickup('heart',W*.5+40,H*.4);updateUI()}}
}
function drawFireworks(){x.save();for(const p of fireworks){x.globalAlpha=Math.max(0,Math.min(1,p.life/.45));x.strokeStyle=p.color;x.lineWidth=2;x.beginPath();x.moveTo(p.x-p.vx*.035,p.y-p.vy*.035);x.lineTo(p.x,p.y);x.stroke();circle(p.x,p.y,1.6,p.color)}x.restore()}
function drawArcs(){x.save();for(const a of arcs){x.globalAlpha=a.life/a.total;x.strokeStyle=stats.arc.c;x.lineWidth=3;const dx=a.bx-a.ax,dy=a.by-a.ay,length=Math.hypot(dx,dy)||1;x.beginPath();x.moveTo(a.ax,a.ay);for(let i=1;i<=7;i++){const t=i/7,offset=i===7?0:Math.sin(i*2.3+a.seed+gameTime*28)*11;x.lineTo(a.ax+dx*t-dy/length*offset,a.ay+dy*t+dx/length*offset)}x.stroke();x.strokeStyle='#effff8';x.lineWidth=1;x.stroke()}x.restore()}
const lobbyPilot=el('homePage').querySelector('.pilot-showcase'),lobbyEngine=el('homePage').querySelector('.engine-glow'),lobbyEnemies=['.enemy-a','.enemy-b','.enemy-c'].map(s=>el('homePage').querySelector(s));
const systemLowMotion=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
function animateLobby(now){
 if(running||document.hidden||ui.start.classList.contains('hidden')||el('homePage').classList.contains('hidden'))return;
 const t=now/1000,amount=profile.state.settings.reducedMotion?0:(systemLowMotion && systemLowMotion.matches ? 0.2 : 1);
 if(lobbyPilot)lobbyPilot.style.transform='translate3d(0,'+(Math.sin(t*1.25)*7*amount).toFixed(2)+'px,0) rotate('+(Math.sin(t*1.25)*amount).toFixed(2)+'deg)';
 if(lobbyEngine){lobbyEngine.style.opacity=String(.7+Math.sin(t*3)*.15*amount);lobbyEngine.style.transform='translateX(-50%) scale(1,'+(.97+Math.sin(t*3)*.06*amount).toFixed(3)+')'}
 lobbyEnemies.forEach((enemy,i)=>{if(enemy)enemy.style.transform='translate3d('+(Math.sin(t*.8+i)*5*amount).toFixed(2)+'px,'+(Math.cos(t*.7+i)*9*amount).toFixed(2)+'px,0)'})
}

function frame(now){const dt=Math.max(0,Math.min(.035,(now-last)/1000||0));last=now;update(dt);animateLobby(now);draw();requestAnimationFrame(frame)}

function segmentDistance(ax,ay,bx,by,px,py){const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy,t=length?clamp(((px-ax)*dx+(py-ay)*dy)/length,0,1):0;return Math.hypot(px-ax-dx*t,py-ay-dy*t)}
function enemyCap(){return Math.min(20,12+Math.floor((Math.min(level,30)-1)/4))}
function spawnFormation(requested){
 const sequence=['group','semicircle','wedge','pincer','horde','columns'];
 const initial={patrol:'group',wedge:'wedge',crossfire:'pincer',armada:'horde',siege:'columns'};
 const kind=sequence.includes(requested)?requested:formationIndex===0?initial[mission.formation]:sequence[(formationIndex+mission.id-1)%sequence.length];
 const growth=Math.floor((Math.min(level,30)-1)/6),base=kind==='horde'?7:kind==='semicircle'?5:kind==='pincer'?4:kind==='columns'?4:3;
 const count=Math.min(enemyCap()-enemies.filter(e=>!e.dead).length,base+growth+(difficulty==='hard'?1:0));
 if(count<2)return null;
 formationIndex++;const plan={id:++formationSerial,kind,count,stage:level,started:gameTime};formationPlans.push(plan);if(formationPlans.length>12)formationPlans.shift();
 const cy=Math.min(H*.31,240),cx=kind==='group'?rnd(W*.37,W*.63):W/2,elite=mission.objective==='elite'&&formationIndex%2===0;
 for(let i=0;i<count;i++){
  const type=kind==='columns'?(i%3===0?'armored':'interceptor'):kind==='pincer'?'weaver':kind==='horde'?(i%4===3?'interceptor':'scout'):formationIndex%3===0?'interceptor':'scout';
  const e=createEnemy(type,elite&&i===Math.floor(count/2)),off=i-(count-1)/2;
  let startX,startY,targetX,targetY,delay=i*.035,duration=1.9,hold=1.05,exitX=0;
  if(kind==='group'){
   const cols=Math.min(3,count),col=i%cols,row=Math.floor(i/cols);targetX=cx+(col-(cols-1)/2)*47;targetY=cy+row*40;startX=targetX;startY=-75-row*44;hold=1.2;
  }else if(kind==='semicircle'){
   const angle=Math.PI+Math.PI*i/Math.max(1,count-1);targetX=W/2+Math.cos(angle)*W*.35;targetY=cy-Math.sin(angle)*Math.min(72,H*.09);startX=W/2+(targetX-W/2)*.35;startY=-90-Math.abs(off)*12;duration=2.2;hold=1.35;exitX=Math.cos(angle)*52;
  }else if(kind==='pincer'){
   const side=i%2?1:-1,row=Math.floor(i/2);targetX=W*(side>0?.76:.24)-side*row*9;targetY=cy+row*32;startX=side>0?W+65:-65;startY=cy-100-row*28;delay=row*.11;duration=1.85;hold=.6;exitX=-side*(64+growth*5);
  }else if(kind==='horde'){
   const cols=Math.min(W<500?4:6,count),col=i%cols,row=Math.floor(i/cols);targetX=W*.14+col*W*.72/Math.max(1,cols-1);targetY=cy+row*38;startX=targetX;startY=-90-row*52;delay=row*.15+col*.035;duration=1.35;hold=.22;exitX=(col-(cols-1)/2)*9;
  }else if(kind==='wedge'){
   targetX=W/2+off*Math.min(48,W*.76/Math.max(1,count-1));targetY=cy+Math.abs(off)*26;startX=targetX;startY=-100-Math.abs(off)*40;duration=2;hold=1.1;exitX=off*7;
  }else{
   const col=i%2,row=Math.floor(i/2);targetX=W*(col?.72:.28);targetY=cy+row*43;startX=targetX;startY=-95-row*54;delay=row*.15;duration=2.15;hold=.95;
  }
  targetX=clamp(targetX,e.r+8,W-e.r-8);e.x=startX;e.y=startY;e.baseX=startX;e.vx=0;e.fire=Math.max(.5,e.fire);
  e.entry={kind,planId:plan.id,startX,startY,targetX,targetY,delay,elapsed:0,duration,hold,exitVx:exitX,exitVy:e.vy*(kind==='horde'?1.28:kind==='pincer'?1.12:1),released:false};
 }
 return plan
}
function moveEnemy(enemy,dt){
 const entry=enemy.entry;
 if(entry&&!entry.released){
  entry.elapsed+=dt;const time=Math.max(0,entry.elapsed-entry.delay),t=clamp(time/entry.duration,0,1),ease=1-Math.pow(1-t,2);
  enemy.x=entry.startX+(entry.targetX-entry.startX)*ease;enemy.y=entry.startY+(entry.targetY-entry.startY)*ease;
  if(entry.kind==='pincer')enemy.y-=Math.sin(t*Math.PI)*35;
  if(time>entry.duration)enemy.y=entry.targetY+Math.sin((time-entry.duration)*2)*2;
  if(time>=entry.duration+entry.hold){entry.released=true;enemy.baseX=enemy.x;enemy.vx=entry.exitVx;enemy.vy=entry.exitVy;enemy.formationMotion=true;enemy.fire=Math.max(.35,enemy.fire)}
  return
 }
 enemy.y+=enemy.vy*dt;
 if(enemy.formationMotion){enemy.x+=enemy.vx*dt;if(enemy.x<enemy.r||enemy.x>W-enemy.r)enemy.vx*=-1;return}
 if(enemy.type==='interceptor')enemy.x=clamp(enemy.baseX+Math.sin(enemy.age*1.5+enemy.phase)*46,enemy.r,W-enemy.r);
 else if(enemy.type==='weaver')enemy.x=clamp(enemy.baseX+Math.sin(enemy.age*2.15+enemy.phase)*Math.min(W*.24,90),enemy.r,W-enemy.r);
 else if(enemy.type==='carrier')enemy.x=clamp(enemy.baseX+Math.sin(enemy.age*.65+enemy.phase)*30,enemy.r,W-enemy.r);
 else{enemy.x+=enemy.vx*dt;if(enemy.x<enemy.r||enemy.x>W-enemy.r)enemy.vx*=-1}
}
function updateStorm(dt){for(const warning of stormWarnings){warning.time-=dt;if(warning.time<=0&&!warning.fired){warning.fired=true;hazards.push({x:warning.x,y:180,w:30,life:.5,total:.5,c:'#aeefae'})}}stormWarnings=stormWarnings.filter(w=>!w.fired);if(world.style!=='storm'||stageTime<10)return;stormClock-=dt;if(stormClock<=0){stormWarnings.push({x:player.x,time:1.5,fired:false});stormClock=13;announce('ИОННЫЙ РАЗРЯД','Покинь подсвеченный коридор',1.3)}}
function activateSpecial(){if(!running||paused||stageMode==='victory'||special<100)return false;audio.effect('pulse');special=0;hostileShots=[];hazards=[];stormWarnings=[];for(const enemy of enemies)if(!enemy.dead)damageEnemy(enemy,7+profile.state.upgrades.reactor);if(boss)damageBoss(10+profile.state.upgrades.reactor*2);rings.push({x:player.x,y:player.y,r:10,max:Math.min(W,440),life:.65,total:.65,c:'#bceff6'});pulseSound(100,.3,'sine',.07);document.dispatchEvent(new CustomEvent('imran:haptic',{detail:{kind:'pulse'}}));return true}
function dronePosition(){return {x:clamp(player.x+Math.cos(gameTime*1.9)*64,18,W-18),y:player.y-6+Math.sin(gameTime*1.9)*25}}
function updateDrone(){const u=profile.state.upgrades.wingman;if(!u||gameTime-lastDrone<Math.max(.38,.95-u*.13))return;lastDrone=gameTime;const p=dronePosition();shots.push({x:p.x,y:p.y-14,vx:0,vy:-960,r:3,d:.75+u*.32,t:'laser',life:2.2,angle:0,trail:[],pierce:1,hit:new Set()})}
function drawDrone(){if(!player||!profile.state.upgrades.wingman||!running)return;const p=dronePosition();x.save();x.translate(p.x,p.y);glow(0,0,26,'#8bdfff',.27);poly([[-13,4],[-6,-6],[0,-14],[6,-6],[13,4],[5,1],[0,9],[-5,1]],'#6a9db5','#c6eaff',1);circle(0,0,3,'#ddfbff');x.restore()}
function drawWorldDetails(){x.save();x.globalAlpha=.15;x.strokeStyle=world.color;x.fillStyle=world.color;x.lineWidth=1;const offset=gameTime*14;for(let i=0;i<12;i++){const px=((i*113.7)%Math.max(1,W)),py=((i*173.1+offset*(.3+i%3*.3))%(H+180))-90;if(world.style==='ice'){poly([[px,py-34],[px+11,py],[px,py+45],[px-14,py]],null,world.color)}else if(world.style==='dust'){x.beginPath();x.moveTo(px,py);x.lineTo(px-24,py+9);x.stroke()}else if(world.style==='storm'){x.beginPath();x.moveTo(px,py);x.lineTo(px+18,py+18);x.lineTo(px+5,py+29);x.lineTo(px+29,py+57);x.stroke()}else if(world.style==='hive'){const points=Array.from({length:6},(_,j)=>[px+Math.cos(j*TAU/6)*44,py+Math.sin(j*TAU/6)*44]);poly(points,null,world.color)}else if(world.style==='nebula'){x.globalAlpha=.025;x.beginPath();x.ellipse(px,py,100+i*2,34,-.4,0,TAU);x.fill()}}if(world.style==='orbit'){x.globalAlpha=.18;x.beginPath();x.ellipse(W*.12,H*.46,105,22,.6,0,TAU);x.stroke();x.beginPath();x.ellipse(W*.12,H*.46,85,17,.6,0,TAU);x.stroke()}x.restore()}
function ensureAudio(){audio.unlock()}
function returnToLobby(page='home'){audio.stopVoice();audio.setScene('menu');audio.resume();clearVictory();el('boostStatus').classList.add('hidden');running=false;paused=false;clearInput();for(const item of [ui.top,ui.weapons,ui.hint,ui.fire,ui.pause,ui.over,ui.announce,ui.bossHud,el('pauseMenu')])item.classList.add('hidden');ui.start.classList.remove('hidden');document.dispatchEvent(new CustomEvent('imran:lobby',{detail:{page}}));profile.save()}
 document.addEventListener('imran:launch',event=>{const detail=event.detail||{};runMode=detail.mode==='endless'?'endless':'campaign';selectedMission=Math.floor(Number(detail.mission)||1);if(runMode==='campaign'&&(selectedMission<1||selectedMission>profile.state.unlocked))return;startGame()});
document.addEventListener('imran:pause',()=>{audio.pause();setPaused(true)});document.addEventListener('imran:active',()=>{if(!running)audio.resume()});document.addEventListener('imran:settings',()=>{difficulty=profile.state.settings.difficulty;audio.apply();refreshAudioUI()});
document.addEventListener('pointerdown',ensureAudio,{capture:true,passive:true});addEventListener('keydown',ensureAudio);document.addEventListener('click',event=>{const button=event.target.closest?.('button');if(button&&button.id!=='fire')audio.effect('ui',.45)});
for(const range of document.querySelectorAll('[data-volume]'))range.addEventListener('input',()=>{profile.setting(range.dataset.volume,Number(range.value));refreshAudioUI();audio.apply()});el('audioToggle').addEventListener('click',toggleAudio);el('audioPreview').addEventListener('click',async()=>{profile.setting('sound',true);profile.setting('voice',true);refreshAudioUI();await audio.resume();await audio.load();audio.stopVoice();audio.speak('welcome',5,true)});
el('resumeBtn').addEventListener('click',()=>setPaused(false));el('restartMission').addEventListener('click',startGame);el('returnMenu').addEventListener('click',()=>returnToLobby());el('resultMenu').addEventListener('click',()=>returnToLobby('campaign'));el('nextMission').addEventListener('click',()=>{runMode='campaign';selectedMission=Math.min(30,level+1);if(profile.select(selectedMission))startGame()});

// Each pointer retains its acquired role: releasing fire never releases movement.
function stopMoving(){movePointerId=null;moveStart=null;playerStart=null;if(player)target={x:player.x,y:player.y}}
function clearInput(){stopMoving();fireTouches.clear();keys.clear();if(ui.fire)ui.fire.classList.remove('pressed')}
function setPaused(value){if(!running)return;paused=Boolean(value);el('victoryScene').classList.toggle('scene-paused',paused);clearInput();last=performance.now();ui.pause.textContent=paused?'▶':'⏸';ui.pause.setAttribute('aria-label',paused?'Продолжить':'Пауза');el('pauseMenu').classList.toggle('hidden',!paused);setText(el('pauseMission'),runMode==='endless'?'Бесконечный полёт · волна '+level:'Миссия '+level+' · '+mission.name);if(paused)audio.pause();else audio.resume()}
function capture(element,event){try{element.setPointerCapture(event.pointerId)}catch(error){}}
c.addEventListener('pointerdown',e=>{if(!running||paused||movePointerId!==null||(e.pointerType==='mouse'&&e.button!==0)||fireTouches.has(e.pointerId))return;e.preventDefault();movePointerId=e.pointerId;moveStart={x:e.clientX,y:e.clientY};playerStart={x:player.x,y:player.y};target={...playerStart};capture(c,e)});
c.addEventListener('pointermove',e=>{if(!running||paused||e.pointerId!==movePointerId)return;e.preventDefault();const b=playerBounds();target.x=clamp(playerStart.x+(e.clientX-moveStart.x)*(profile.state.ship==='swift'?1.25:profile.state.ship==='bastion'?.88:1),b.left,b.right);target.y=clamp(playerStart.y+(e.clientY-moveStart.y)*(profile.state.ship==='swift'?1.25:profile.state.ship==='bastion'?.88:1),b.top,b.bottom)});
function endPointer(e){if(e.pointerId===movePointerId)stopMoving();fireTouches.delete(e.pointerId);ui.fire.classList.toggle('pressed',fireTouches.size>0)}
ui.fire.addEventListener('pointerdown',e=>{if(!running||paused||(e.pointerType==='mouse'&&e.button!==0)||e.pointerId===movePointerId)return;e.preventDefault();fireTouches.add(e.pointerId);ui.fire.classList.add('pressed');capture(ui.fire,e);if(profile.state.settings.autoFire)activateSpecial();else shoot()});
for(const type of ['pointerup','pointercancel'])addEventListener(type,endPointer);
c.addEventListener('lostpointercapture',endPointer);ui.fire.addEventListener('lostpointercapture',endPointer);
ui.fire.addEventListener('contextmenu',e=>e.preventDefault());c.addEventListener('contextmenu',e=>e.preventDefault());
ui.weapons.addEventListener('click',e=>{const button=e.target.closest('.weapon');if(button&&running&&!paused)setWeapon(button.dataset.w)});
ui.pause.addEventListener('click',()=>setPaused(!paused));el('startBtn').addEventListener('click',()=>{runMode='campaign';selectedMission=profile.state.selected;startGame()});el('again').addEventListener('click',startGame);
const movementCodes=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD']);
addEventListener('keydown',e=>{if(!running)return;if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat)setPaused(!paused);e.preventDefault();return}if(paused)return;const w=Object.keys(stats)[Number(e.key)-1];if(w)setWeapon(w);if(movementCodes.has(e.code)){e.preventDefault();keys.add(e.code)}if(e.code==='Space'){if(profile.state.settings.autoFire&&!e.repeat)activateSpecial();fireTouches.add('key');ui.fire.classList.add('pressed');e.preventDefault()}});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'){fireTouches.delete('key');ui.fire.classList.toggle('pressed',fireTouches.size>0)}});
addEventListener('blur',()=>{audio.pause();setPaused(true)});addEventListener('pagehide',()=>{audio.pause();setPaused(true)});addEventListener('focus',()=>{if(!running)audio.resume()});document.addEventListener('visibilitychange',()=>{if(document.hidden){audio.pause();setPaused(true)}else if(!running)audio.resume()});
if(ui.difficulty){for(const button of ui.difficulty.querySelectorAll('[data-difficulty]'))button.classList.toggle('selected',button.dataset.difficulty===difficulty);ui.difficulty.addEventListener('click',e=>{const button=e.target.closest('[data-difficulty]');if(!button||!difficulties[button.dataset.difficulty]||running)return;difficulty=button.dataset.difficulty;profile.setting('difficulty',difficulty);for(const option of ui.difficulty.querySelectorAll('[data-difficulty]'))option.classList.toggle('selected',option===button);try{localStorage.setItem('imranFleetDifficulty',difficulty)}catch(error){}})}
if(ui.sound)ui.sound.addEventListener('click',toggleAudio);refreshAudioUI();resize();stars=Array.from({length:110},()=>({x:Math.random()*W,y:Math.random()*H,z:rnd(.25,1),tw:rnd(0,TAU)}));setText(ui.best,best);el('startBtn').disabled=false;document.dispatchEvent(new CustomEvent('imran:settings'));if(el('loading'))el('loading').classList.add('hidden');requestAnimationFrame(frame);
})();
