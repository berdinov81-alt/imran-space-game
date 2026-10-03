const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('./campaign.js');
function storage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values};}
test('each of 30 missions owns a distinct and progressively tougher commander',()=>{
 assert.equal(C.missions.length,30);assert.equal(new Set(C.missions.map(m=>m.name)).size,30);assert.equal(C.worlds.length,6);assert.equal(C.bossTypes.length,30);
 assert.equal(new Set(C.bossTypes.map(b=>b.name)).size,30);assert.equal(new Set(C.bossTypes.map(b=>b.title)).size,30);
 assert.ok(C.missions.every(m=>m.duration>=54&&m.duration<=130));assert.ok(new Set(C.missions.map(m=>m.formation)).size>=5);
 for(let index=0;index<30;index++){
  assert.equal(C.missions[index].boss,index);assert.ok(C.bossTypes[index].patterns.length>=2);
  if(index)assert.ok(C.bossTypes[index].hp>C.bossTypes[index-1].hp,'Boss '+(index+1)+' HP');
 }
 assert.ok(new Set(C.bossTypes.map(b=>JSON.stringify(b.patterns))).size>=6,'Commanders use varied attack sequences');
 assert.ok(new Set(C.bossTypes.map(b=>JSON.stringify(b.movement))).size>=6,'Commanders have varied flight paths');
});
test('weapon grades describe five named power tiers',()=>{
 assert.equal(C.weaponGrades.length,5);assert.equal(new Set(C.weaponGrades.map(g=>g.name)).size,5);
 for(const [index,grade] of C.weaponGrades.entries()){
  assert.equal(grade.rank,index+1);assert.ok(typeof grade.color==='string'&&grade.color.length>0);assert.ok(typeof grade.description==='string'&&grade.description.length>0);
 }
});
test('progress, purchases, settings and arsenal survive a new session',()=>{
 const save=storage(),p=C.createProfile(save);p.award(1,{kills:40,salvage:12,damage:0,elites:3,score:3000});p.buy('hull');p.unlockWeapon('plasma');p.setting('autoFire',false);
 const next=C.createProfile(save);assert.equal(next.state.unlocked,2);assert.equal(next.state.upgrades.hull,1);assert.equal(next.state.missions[1].stars,3);assert.equal(next.state.arsenal.plasma,true);assert.equal(next.state.settings.autoFire,false);assert.equal(next.state.credits,p.state.credits);
});
test('locked missions, unaffordable upgrades and locked ships cannot be purchased',()=>{
 const p=C.createProfile(storage());assert.equal(p.select(2),false);assert.equal(p.award(30,{score:999}),null);assert.equal(p.buy('reactor'),false);assert.equal(p.selectShip('swift'),false);assert.equal(p.state.credits,0);assert.equal(p.state.ship,'pioneer');
});
test('upgrade prices rise, caps are enforced and replay keeps best medals',()=>{
 const p=C.createProfile(storage());p.state.credits=999999;const first=p.cost('reactor');assert.equal(p.buy('reactor'),true);assert.ok(p.cost('reactor')>first);for(let i=0;i<10;i++)p.buy('reactor');assert.equal(p.state.upgrades.reactor,5);assert.equal(p.buy('reactor'),false);
 p.award(1,{score:900,kills:20,damage:0});p.award(1,{score:10,kills:0,damage:3});assert.equal(p.state.missions[1].stars,3);assert.equal(p.state.missions[1].score,900);assert.equal(p.state.missions[1].clears,2);
});
test('broken or unavailable storage does not break a playable in-memory profile',()=>{
 const p=C.createProfile({getItem(){throw Error('Denied')},setItem(){throw Error('Denied')}});assert.equal(p.state.unlocked,1);assert.ok(p.award(1,{score:100,kills:12,damage:1}));assert.equal(p.state.unlocked,2);assert.equal(p.storageAvailable,false);
 const corrupt=C.createProfile({getItem:()=>'{bad json',setItem(){}});assert.equal(corrupt.state.unlocked,1);
});
test('save validation rejects impossible progress and clamps numeric values',()=>{
 const s=C.sanitize({unlocked:30,selected:30,credits:Infinity,upgrades:{hull:999,reactor:-10},missions:{30:{stars:3}},settings:{difficulty:'cheat',autoFire:'false'}});
 assert.equal(s.unlocked,1);assert.equal(s.selected,1);assert.equal(s.upgrades.hull,4);assert.equal(s.upgrades.reactor,0);assert.equal(s.settings.difficulty,'normal');assert.equal(s.settings.autoFire,true);assert.ok(Number.isFinite(s.credits));
});

test('a v3 saved campaign keeps progress, credits, settings, ship and arsenal after migration',()=>{
 const save=storage(),old={version:3,credits:12345,unlocked:6,selected:4,endlessBest:67890,
  missions:Object.fromEntries(Array.from({length:5},(_,i)=>[i+1,{stars:(i%3)+1,score:1000+i*300,clears:i+1}])),
  upgrades:{hull:2,reactor:3,magnet:4,shield:2,wingman:1,salvage:2},
  arsenal:{laser:true,spread:true,plasma:true,rockets:false,beam:false},ships:['pioneer','swift'],ship:'swift',
  settings:{sound:true,music:false,autoFire:false,reducedMotion:true,vibration:false,difficulty:'hard'}};
 assert.equal(C.key,'imranStarDefender.v3');save.setItem(C.key,JSON.stringify(old));
 const profile=C.createProfile(save);
 for(const field of ['credits','unlocked','selected','endlessBest','ship'])assert.equal(profile.state[field],old[field],field);
 for(const field of ['missions','upgrades','arsenal','settings','ships'])assert.deepEqual(profile.state[field],old[field],field);
 profile.save();assert.deepEqual(Array.from(save.values.keys()),['imranStarDefender.v3']);
 const reloaded=C.createProfile(save);for(const field of ['missions','upgrades','arsenal','settings','ships'])assert.deepEqual(reloaded.state[field],old[field],field);
});

test('every mission resolves to its own boss artwork cell',()=>{assert.equal(new Set(C.bossTypes.map(b=>b.artIndex)).size,30);for(const m of C.missions)assert.ok(Number.isInteger(C.bossTypes[m.boss].artIndex));});
