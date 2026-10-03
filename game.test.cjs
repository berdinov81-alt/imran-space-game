const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;

// Test the shipped loop and handlers without exposing a test API to players.
function harness({ width = 390, height = 844, storageBlocked = false, mode = 'campaign', autoFire = false, randomSeed = 810011, saved = {} } = {}) {
  const elements = new Map(), frames = [], events = new Map(), storageValues = new Map(Object.entries(saved));
  let clock = 1000, seed = randomSeed, created = 0;
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const listeners = new Map(), classes = new Set(), attributes = new Map();
    const e = {
      id, disabled: id === 'startBtn', textContent: '', innerHTML: '', style: {}, dataset: {},
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      setPointerCapture(pointerId) { this.captured = pointerId; },
      releasePointerCapture(pointerId) { if (this.captured === pointerId) this.captured = null; },
      closest() { return this; },
      querySelectorAll(selector) { return document.querySelectorAll(selector); },
      querySelector(selector) { return element(id + ':' + selector); },
      append(...children) { this.children = [...(this.children || []), ...children]; },
      getBoundingClientRect() { return { left: 0, top: 0, width, height }; },
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, on) { if (on === undefined) on = !classes.has(name); if (on) classes.add(name); else classes.delete(name); return on; }
      },
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      emit(type, props = {}) {
        for (const fn of listeners.get(type) || []) fn({
          pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 500, button: 0,
          target: e, preventDefault() {}, ...props
        });
      }
    };
    elements.set(id, e);
    return e;
  }
  const gradient = { addColorStop() {} };
  const drawing = new Proxy({
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: text => ({ width: String(text).length * 8 })
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  element('game').getContext = () => drawing;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const weapons = Array.from(html.matchAll(/data-w="([^"]+)"/g), ([, type]) => {
    const button = element('weapon:' + type); button.dataset.w = type; return button;
  });
  const difficultyButtons = Array.from(html.matchAll(/data-difficulty="([^"]+)"/g), ([, type]) => {
    const button = element('difficulty:' + type); button.dataset.difficulty = type; return button;
  });
  const document = {
    hidden: false, dispatchEvent(event) { for (const fn of events.get('document:'+event.type)||[]) fn(event); }, getElementById: element, createElement: tag => element(tag + ':created:' + created++),
    querySelectorAll: selector => selector === '.weapon' ? weapons : selector === '[data-difficulty]' ? difficultyButtons : [],
    addEventListener(type, fn) { if (!events.has('document:' + type)) events.set('document:' + type, []); events.get('document:' + type).push(fn); }
  };
  const seededMath = Object.create(Math);
  seededMath.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = {
    document, CustomEvent: class { constructor(type, options={}){this.type=type;this.detail=options.detail;} }, Math: seededMath, Image: class { complete = true; naturalWidth = 256; naturalHeight = 256; },
    innerWidth: width, innerHeight: height, devicePixelRatio: 3,
    performance: { now: () => clock },
    localStorage: {
      getItem(key) { if (storageBlocked) throw Error('storage blocked'); return storageValues.get(key) ?? null; },
      setItem(key, value) { if (storageBlocked) throw Error('storage blocked'); storageValues.set(key, String(value)); }
    },
    requestAnimationFrame: fn => frames.push(fn),
    addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); }
  };
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'campaign.js'),'utf8'),sandbox);sandbox.ImranCampaign.profile.state.settings.autoFire=autoFire;
  const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  const instrumented = source.replace(/\}\)\(\);\s*$/, `
    globalThis.inspection = {
      get state() { return { running, paused, gameTime, level, stageTime, stageMode, boss,
        player, target, weapon, inventory, enemies, shots, hostileShots, pickups, score, lives, runMode, mission, world, missionDamage, salvageTaken, eliteKills, special, hazards, stormWarnings, formationIndex, formationPlans, lastWeaponDrop, nextWeaponDrop, weaponDropCount, parts, rings, floaters,
        movePointerId, fireCount: fireTouches.size, keyCount: keys.size }; },
      reset, startGame, update, shoot, createEnemy, createPickup, beginBoss,
      damageEnemy, damageBoss, damagePlayer, collectPickup, defeatBoss, setWeapon, setPaused, clearInput, resize,
      enemyTypes, MAX_POWER, waveDuration, activateSpecial, spawnFormation, enemyCap, spawnWeaponDrop, updateStorm, bossWarning, bossAttack, profile, returnToLobby,
      configureMission: id => { selectedMission=id;profile.state.unlocked=id;profile.state.selected=id;level=id;changeMission(id); },
      endGame: () => endGame(), setScore: value => { score = value; }
    };
  })();`);
  assert.notEqual(instrumented, source, 'Game must retain its private IIFE boundary for test instrumentation');
  vm.runInContext(instrumented, sandbox);
  return {
    sandbox, element, frames, storageValues, api: sandbox.inspection,
    random(value) { seededMath.random = () => value; },
    get state() { return sandbox.inspection.state; },
    emit(type, props = {}) { for (const fn of events.get(type) || []) fn({ preventDefault() {}, ...props }); },
    visibility(hidden) { document.hidden = hidden; for (const fn of events.get('document:visibilitychange') || []) fn(); },
    tick(n = 1) { for (let i = 0; i < n; i++) { clock += 1000 / 60; assert.equal(frames.length, 1, 'Exactly one animation loop'); frames.shift()(clock); } },
    advance(seconds) { this.tick(Math.ceil(seconds * 60)); },
    start() { if(mode==='endless')document.dispatchEvent(new sandbox.CustomEvent('imran:launch',{detail:{mode:'endless',mission:1}}));else element('startBtn').emit('click'); },
    pressWeapon(type) { const button = weapons.find(w => w.dataset.w === type); assert.ok(button, type + ' must be in the weapon bar'); element('weapons').emit('click', { target: button }); },
    weaponButton(type) { return weapons.find(w => w.dataset.w === type); },
    pickup(type) { this.api.createPickup(type, this.state.player.x, this.state.player.y); this.api.update(0); }
  };
}

test('release uses local resources, the original portrait, and all five weapon controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, resource] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if(resource.startsWith('#') || resource === 'https://github.com/berdinov81-alt/imran-space-game/issues') continue;
    assert.ok(!/^(?:\/|https?:)/.test(resource), 'Resource should work from a static folder: ' + resource);
    assert.ok(fs.existsSync(path.join(root, resource.split(/[?#]/)[0])), resource);
  }
  assert.match(html, /<html lang="ru">/);
  assert.match(html, /<script src="game.js(?:\?[^\"]*)?" defer/);
  assert.doesNotMatch(html, /skybridge|oaiusercontent|__EMBEDDED_IMAGE__/i);
  assert.ok(fs.statSync(path.join(root, 'face.jpg')).size > 0);
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')));
  for (const type of ['laser', 'spread', 'plasma', 'rockets', 'beam']) assert.match(html, new RegExp('data-w="' + type + '"'));
});

test('campaign victory awards a mission once, persists medals and unlocks only the next mission',()=>{
 const h=harness();h.start();h.state.player.inv=Infinity;h.api.beginBoss();h.api.damageBoss(h.state.boss.maxHp);
 assert.equal(h.state.running,false);assert.equal(h.api.profile.state.unlocked,2);assert.ok(h.api.profile.state.missions[1].stars>=1);
 const credits=h.api.profile.state.credits;h.api.defeatBoss();h.api.endGame();assert.equal(h.api.profile.state.credits,credits);
 h.element('nextMission').emit('click');assert.equal(h.state.level,2);assert.equal(h.state.running,true);assert.equal(h.state.gameTime,0);
});

test('automatic fire works without a held finger, and defensive pulse has a real cooldown',()=>{
 const h=harness({autoFire:true});h.start();h.advance(.5);assert.ok(h.state.shots.length>0);h.state.hostileShots.push({x:50,y:350,vx:0,vy:100,r:5,c:'#fff',life:5});
 assert.equal(h.api.activateSpecial(),true);assert.equal(h.state.hostileShots.length,0);assert.equal(h.state.special,0);assert.equal(h.api.activateSpecial(),false);
 h.api.setPaused(true);h.advance(20);assert.equal(h.state.special,0);h.api.setPaused(false);h.state.player.inv=Infinity;h.advance(17);assert.equal(h.state.special,100);
});

test('all 30 missions use their own timers, worlds, formation and functioning boss patterns',()=>{
 const h=harness(),commanders=new Set();let previousHp=0;
 for(let id=1;id<=30;id++){h.api.configureMission(id);h.start();h.state.player.inv=Infinity;
 assert.equal(h.state.level,id);assert.equal(h.state.mission.id,id);assert.equal(h.state.world.name,h.sandbox.ImranCampaign.worlds[Math.floor((id-1)/5)].name);
 assert.ok(h.api.waveDuration()>=54);h.api.spawnFormation();assert.ok(h.state.enemies.length>=2);
 h.api.beginBoss();const b=h.state.boss;commanders.add(b.name);assert.ok(b.maxHp>previousHp,'Mission '+id+' boss must be tougher than its predecessor');previousHp=b.maxHp;b.entry=0;h.api.damageBoss(b.maxHp*.55);
 for(let i=0;i<b.patterns.length;i++){h.api.bossWarning();h.api.bossAttack();h.tick();}
 h.api.damageBoss(b.maxHp);assert.equal(h.state.running,false);assert.ok(h.api.profile.state.missions[id]);assert.equal(h.frames.length,1);
 }
 assert.equal(commanders.size,30);assert.equal(Object.keys(h.api.profile.state.missions).length,30);assert.equal(h.api.profile.state.unlocked,30);
});

test('group, semicircle and horde formations have different staged geometry',()=>{
 const snapshots={};
 for(const kind of ['group','semicircle','horde']){
  const h=harness();h.start();h.api.spawnFormation(kind);
  const entries=Array.from(h.state.enemies.filter(e=>e.entry?.kind===kind),e=>e.entry);
  assert.ok(entries.length>=3,kind+' has a visible squad');
  assert.ok(entries.every(e=>[e.startX,e.startY,e.targetX,e.targetY,e.delay,e.duration].every(Number.isFinite)),kind+' finite route coordinates');
  assert.ok(entries.every(e=>e.startY<0||e.startX<0||e.startX>390),kind+' enters from outside the play area');
  snapshots[kind]=entries;
  h.api.setPaused(true);const before=JSON.stringify(h.state.enemies.map(e=>({x:e.x,y:e.y,entry:e.entry})));h.advance(3);
  assert.equal(JSON.stringify(h.state.enemies.map(e=>({x:e.x,y:e.y,entry:e.entry}))),before,kind+' route freezes while paused');
 }
 const ring=snapshots.semicircle.sort((a,b)=>a.targetX-b.targetX),middle=ring[Math.floor(ring.length/2)];
 assert.ok(new Set(ring.map(e=>Math.round(e.targetX))).size>=3);
 assert.ok(new Set(ring.map(e=>Math.round(e.targetY))).size>=2,'Semicircle must curve rather than form one horizontal row');
 assert.ok(Math.abs((ring[0].targetX+ring.at(-1).targetX)/2-middle.targetX)<35,'Semicircle spans both sides of its centre');
 const group=snapshots.group;assert.ok(Math.max(...group.map(e=>e.targetX))-Math.min(...group.map(e=>e.targetX))<390*.75,'Group remains a compact squad');
 assert.ok(snapshots.horde.length>group.length,'A horde has more ships than a small squad');
 assert.ok(new Set(snapshots.horde.map(e=>e.delay)).size>=3,'Horde entrance is staggered');
});

test('entering squads cannot attack before their route and repeated formation requests stay bounded',()=>{
 const h=harness();h.api.configureMission(30);h.start();h.state.player.inv=Infinity;h.advance(10);
 h.state.enemies.length=0;h.state.hostileShots.length=0;h.api.spawnFormation('group');
 const group=h.state.enemies.filter(e=>e.entry?.kind==='group');assert.ok(group.length>=3);for(const enemy of group)enemy.fire=0;
 h.api.update(.1);assert.equal(h.state.hostileShots.length,0,'Enemies do not shoot while their entrance begins');
 for(let i=0;i<100;i++)h.api.spawnFormation('horde');
 assert.ok(h.state.enemies.length<=h.api.enemyCap());assert.ok(h.state.formationPlans.length<=12,'Formation history stays bounded');
 h.advance(3);assert.ok(h.state.enemies.length<=h.api.enemyCap());
});

test('a bounded late-stage firefight keeps formations, projectiles and effects finite',()=>{
 const h=harness({autoFire:true,randomSeed:123456});h.api.configureMission(30);h.start();h.state.player.inv=Infinity;
 h.state.inventory.plasma=5;h.api.setWeapon('plasma');h.api.profile.state.upgrades.reactor=5;h.api.profile.state.upgrades.wingman=4;
 for(let frame=0;frame<30*60;frame++){
  if(frame%120===0)h.api.spawnFormation(frame%240===0?'horde':'semicircle');h.tick();
  assert.ok(h.state.enemies.length<=h.api.enemyCap());assert.ok(h.state.shots.length<240);assert.ok(h.state.hostileShots.length<=72);
  assert.ok(h.state.parts.length<=260);assert.ok(h.state.pickups.length<120);assert.ok(h.state.formationPlans.length<=12);
  for(const item of [...h.state.enemies,...h.state.shots,...h.state.hostileShots,...h.state.pickups])assert.ok(Number.isFinite(item.x)&&Number.isFinite(item.y));
 }
 assert.equal(h.state.running,true);assert.equal(h.frames.length,1);assert.ok(h.state.score>0,'Weapons really hit the incoming squads');
});

test('ion storm warns before creating a hazard and pauses safely',()=>{
 const h=harness();h.api.configureMission(21);h.start();h.state.player.inv=Infinity;h.advance(22.2);assert.ok(h.state.stormWarnings.length>0);assert.equal(h.state.hazards.length,0);
 h.api.setPaused(true);const before=h.state.stormWarnings[0].time;h.advance(4);assert.equal(h.state.stormWarnings[0].time,before);
 h.api.setPaused(false);h.advance(h.state.stormWarnings[0].time+.1);assert.ok(h.state.hazards.length>0);
});

test('hangar improvements affect health, weapon damage, shields and drone firing',()=>{
 const h=harness();h.api.profile.state.upgrades.hull=4;h.api.profile.state.upgrades.reactor=5;h.api.profile.state.upgrades.shield=2;h.api.profile.state.upgrades.wingman=2;
 h.start();assert.equal(h.state.lives,6);assert.ok(h.state.player.shield>0);h.api.shoot();assert.ok(h.state.shots[0].d>1.2);h.advance(.25);assert.ok(h.state.shots.length>1,'Drone fires independently without holding fire');assert.equal(h.state.fireCount,0);
});

test('fast beam detects a small ship crossed between animation frames',()=>{
 const h=harness();h.start();h.pickup('beam');h.api.shoot();const shot=h.state.shots[0],enemy=h.api.createEnemy('scout');enemy.x=shot.x;enemy.y=shot.y-30;enemy.vy=0;enemy.vx=0;
 const hp=enemy.hp;h.api.update(.035);assert.ok(enemy.hp<hp,'Swept projectile collision must not tunnel through a scout');
});

test('returning to the lobby clears controls and keeps one animation loop',()=>{
 const h=harness();h.start();h.element('fire').emit('pointerdown',{pointerId:99});h.api.returnToLobby('campaign');h.advance(2);
 assert.equal(h.state.running,false);assert.equal(h.state.fireCount,0);assert.equal(h.frames.length,1);assert.equal(h.element('start').classList.contains('hidden'),false);
});

test('blocked storage cannot prevent starting, spawning enemies, ending, or replaying', () => {
  const h = harness({ storageBlocked: true });
  assert.equal(h.element('startBtn').disabled, false);
  h.tick(); h.start(); h.tick(90);
  assert.equal(h.state.running, true);
  assert.ok(h.state.enemies.length > 0);
  h.api.endGame(); h.element('again').emit('click'); h.tick();
  assert.equal(h.state.running, true);
  assert.equal(h.frames.length, 1);
});

test('two fingers move and shoot; releasing fire keeps the movement finger active', () => {
  const h = harness(); h.start(); const startX = h.state.player.x;
  h.element('game').emit('pointerdown', { pointerId: 7 });
  h.element('game').emit('pointermove', { pointerId: 7, clientX: 200, clientY: 380 });
  h.element('fire').emit('pointerdown', { pointerId: 9 }); h.tick(12);
  assert.ok(h.state.player.x > startX + 70);
  assert.ok(h.state.shots.length > 0);
  assert.equal(h.state.movePointerId, 7);
  assert.equal(h.element('fire').captured, 9);
  h.emit('pointerup', { pointerId: 9 });
  assert.equal(h.state.fireCount, 0); assert.equal(h.state.movePointerId, 7);
  h.element('game').emit('pointermove', { pointerId: 7, clientX: 80, clientY: 400 }); h.tick(12);
  assert.ok(h.state.player.x < startX);
  h.emit('pointerup', { pointerId: 7 }); const x = h.state.player.x; h.tick(12);
  assert.equal(h.state.player.x, x);
});

test('fire may be the first finger and keeps firing when movement is released', () => {
  const h = harness(); h.start();
  h.element('fire').emit('pointerdown', { pointerId: 1 });
  h.element('game').emit('pointerdown', { pointerId: 2 }); h.tick(2);
  h.emit('pointerup', { pointerId: 2 }); assert.equal(h.state.fireCount, 1);
  h.tick(10); assert.ok(h.state.shots.length > 0);
  h.emit('pointercancel', { pointerId: 1 }); assert.equal(h.state.fireCount, 0);
});

test('capture loss, pause, visibility, resize, and restart clear owned controls', () => {
  const h = harness(); h.start();
  h.element('fire').emit('pointerdown', { pointerId: 4 });
  h.element('fire').emit('lostpointercapture', { pointerId: 4 }); assert.equal(h.state.fireCount, 0);
  h.element('game').emit('pointerdown', { pointerId: 2 });
  h.element('game').emit('lostpointercapture', { pointerId: 2 }); assert.equal(h.state.movePointerId, null);
  h.element('game').emit('pointerdown', { pointerId: 2 });
  h.element('fire').emit('pointerdown', { pointerId: 3 }); h.element('pause').emit('click');
  assert.equal(h.state.paused, true); assert.equal(h.state.fireCount, 0); assert.equal(h.state.movePointerId, null);
  h.element('pause').emit('click');
  const x = h.state.player.x;
  h.element('game').emit('pointermove', { pointerId: 2, clientX: 350 }); h.tick(); assert.equal(h.state.player.x, x);
  h.element('fire').emit('pointerdown', { pointerId: 4 }); h.visibility(true);
  assert.equal(h.state.paused, true); assert.equal(h.state.fireCount, 0);
  h.visibility(false); assert.equal(h.state.paused, true);
  h.element('pause').emit('click');
  h.element('game').emit('pointerdown', { pointerId: 6 }); h.element('fire').emit('pointerdown', { pointerId: 8 });
  h.sandbox.innerWidth = 844; h.sandbox.innerHeight = 390; h.emit('resize');
  assert.ok(h.state.player.y < 390); assert.equal(h.state.movePointerId, null); assert.equal(h.state.fireCount, 0);
  h.api.endGame(); h.element('fire').emit('pointerdown', { pointerId: 1 }); assert.equal(h.state.fireCount, 0);
  h.element('again').emit('click'); assert.equal(h.state.running, true); assert.equal(h.state.weapon, 'laser');
  assert.equal(h.frames.length, 1);
});

test('keyboard movement, key release, shooting, pause and blur remain responsive', () => {
  const h = harness(); h.start(); const before = h.state.player.x;
  h.emit('keydown', { code: 'ArrowRight', key: 'ArrowRight' });
  h.emit('keydown', { code: 'Space', key: ' ' }); h.tick(15);
  assert.ok(h.state.player.x > before); assert.ok(h.state.shots.length > 0);
  h.emit('keyup', { code: 'ArrowRight', key: 'ArrowRight' }); h.emit('keyup', { code: 'Space', key: ' ' });
  assert.equal(h.state.fireCount, 0); assert.equal(h.state.keyCount, 0);
  h.emit('keydown', { code: 'KeyP', key: 'p' }); assert.equal(h.state.paused, true);
  h.emit('keydown', { code: 'KeyP', key: 'p', repeat: true }); assert.equal(h.state.paused, true);
  h.emit('keydown', { code: 'KeyP', key: 'p' }); assert.equal(h.state.paused, false);
  h.emit('keydown', { code: 'Space', key: ' ' }); h.emit('blur');
  assert.equal(h.state.paused, true); assert.equal(h.state.fireCount, 0); assert.equal(h.state.keyCount, 0);
});

test('locked weapons cannot be selected by the bar, keyboard, or game setter', () => {
  const h = harness(); h.start();
  for (const [type, key] of [['spread', '2'], ['plasma', '3'], ['rockets', '4'], ['beam', '5']]) {
    assert.equal(h.state.inventory[type], 0);
    assert.equal(h.weaponButton(type).disabled, true);
    h.pressWeapon(type); assert.equal(h.state.weapon, 'laser');
    h.emit('keydown', { code: 'Digit' + key, key }); assert.equal(h.state.weapon, 'laser');
    h.api.setWeapon(type); assert.equal(h.state.weapon, 'laser');
  }
});

test('falling weapon pods can be collected and unlock the weapon immediately', () => {
  const h = harness(); h.start();
  h.api.createPickup('spread', h.state.player.x, 120);
  const pickup = h.state.pickups.at(-1), initialY = pickup.y;
  h.advance(.2); assert.ok(pickup.y > initialY); assert.equal(h.state.inventory.spread, 0);
  pickup.x = h.state.player.x; pickup.y = h.state.player.y; h.api.update(0);
  assert.ok(h.state.inventory.spread > 0); assert.equal(h.state.weapon, 'spread');
  assert.equal(h.weaponButton('spread').disabled, false);
  assert.ok(!h.state.pickups.includes(pickup));
  h.api.setWeapon('laser'); h.pressWeapon('spread'); assert.equal(h.state.weapon, 'spread');
  h.api.setWeapon('laser'); h.emit('keydown', { code: 'Digit2', key: '2' }); assert.equal(h.state.weapon, 'spread');
});

test('the first weapon introduction is occasional and later pods obey a strict cooldown and run budget', () => {
  const h = harness(); h.start(); h.state.player.inv = Infinity;
  h.advance(10);
  assert.equal(h.state.pickups.filter(p => ['laser','spread','plasma','rockets','beam'].includes(p.type)).length,0,'No weapon showers every few seconds');
  h.advance(3);
  assert.ok(h.state.pickups.some(p=>p.type==='spread'),'Mission one introduces a collectible weapon in reasonable time');
  assert.equal(h.state.weaponDropCount,1);
  const first=h.state.lastWeaponDrop;
  assert.equal(h.api.spawnWeaponDrop('plasma',120,90),null,'Immediate repeated drop is blocked');
  h.api.setPaused(true);h.advance(40);assert.equal(h.state.lastWeaponDrop,first);assert.equal(h.state.weaponDropCount,1);
  const late=harness();late.api.configureMission(30);late.start();late.state.player.inv=Infinity;late.advance(21);
  assert.ok(late.api.spawnWeaponDrop('plasma',120,90));const firstLate=late.state.lastWeaponDrop;
  late.advance(27);assert.equal(late.api.spawnWeaponDrop('beam',120,90),null);
  late.advance(2);assert.ok(late.api.spawnWeaponDrop('beam',120,90));assert.ok(late.state.lastWeaponDrop-firstLate>=28);
  late.advance(29);assert.ok(late.api.spawnWeaponDrop('rockets',120,90));assert.equal(late.state.weaponDropCount,3);
  late.advance(40);assert.equal(late.api.spawnWeaponDrop('laser',120,90),null,'Long fights cannot exceed the pod budget');
});

test('enemy kill rewards keep weapon pods rare and cannot bypass drop limits',()=>{
 const h=harness();h.api.configureMission(30);h.start();h.state.player.inv=Infinity;h.advance(10);h.random(0);
 const kill=()=>{const enemy=h.api.createEnemy('scout');assert.ok(enemy);h.api.damageEnemy(enemy,enemy.hp+1);h.api.update(0);h.state.pickups.length=0;};
 for(let i=0;i<20;i++)kill();assert.equal(h.state.weaponDropCount,0,'No random weapons in the opening grace period');
 h.advance(11);h.random(.99999);for(let i=0;i<100;i++)kill();assert.equal(h.state.weaponDropCount,0,'Ordinary rewards usually omit weapon pods');
 h.random(0);for(let i=0;i<100;i++)kill();assert.equal(h.state.weaponDropCount,1,'Even a lucky kill burst respects cooldown');
 h.advance(29);for(let i=0;i<50;i++)kill();assert.equal(h.state.weaponDropCount,2);
 h.advance(29);for(let i=0;i<50;i++)kill();assert.equal(h.state.weaponDropCount,3);
 h.advance(29);for(let i=0;i<50;i++)kill();assert.equal(h.state.weaponDropCount,3,'Enemy kills cannot exceed the run budget');
});

test('repeated weapon pickups improve firepower and stop at a finite upgrade cap', () => {
  const h = harness(); h.start(); h.api.shoot();
  const baseline = h.state.shots[0].d;
  h.pickup('laser'); assert.ok(h.state.inventory.laser > 1);
  h.advance(.5); h.state.shots.length = 0; h.api.shoot();
  assert.ok(h.state.shots[0].d > baseline, 'Laser pickup must make shots stronger');
  for (let i = 0; i < 20; i++) h.pickup('laser');
  assert.equal(h.state.inventory.laser, h.api.MAX_POWER);
  for (let i = 0; i < 20; i++) h.pickup('laser'); assert.equal(h.state.inventory.laser, h.api.MAX_POWER);
});

test('every collected weapon fires and spread creates an angled volley', () => {
  const h = harness(); h.start(); h.state.player.inv = Infinity;
  const volleys = {};
  for (const type of ['laser', 'spread', 'plasma', 'rockets', 'beam']) {
    if (type !== 'laser') h.pickup(type);
    h.api.setWeapon(type); h.advance(1); h.state.shots.length = 0; h.api.shoot();
    volleys[type] = Array.from(h.state.shots);
    assert.ok(volleys[type].length > 0, type + ' must fire after unlocking');
    assert.ok(volleys[type].every(shot => shot.d > 0), type + ' shots damage enemies');
  }
  assert.ok(volleys.spread.length > volleys.laser.length);
  assert.ok(volleys.spread.some(shot => shot.vx < 0));
  assert.ok(volleys.spread.some(shot => shot.vx > 0));
});

test('all five power tiers improve real volleys for every weapon',()=>{
 for(const type of ['laser','spread','plasma','rockets','beam']){
  const h=harness();h.start();h.state.player.inv=Infinity;assert.equal(h.api.MAX_POWER,5);
  if(type!=='laser')h.pickup(type);const volleys=[];
  for(let rank=1;rank<=5;rank++){
   if(rank>1)h.pickup(type);assert.equal(h.state.inventory[type],rank,type+' rank '+rank);
   h.advance(.8);h.state.shots.length=0;assert.equal(h.api.shoot(),true);
   const shots=Array.from(h.state.shots);assert.ok(shots.length>0&&shots.every(s=>s.d>0));
   volleys.push({damage:shots.reduce((sum,s)=>sum+s.d,0),count:shots.length,
    blast:Math.max(...shots.map(s=>s.blast||0)),pierce:Math.max(...shots.map(s=>s.pierce)),radius:Math.max(...shots.map(s=>s.r))});
  }
  for(let rank=1;rank<5;rank++){
   assert.ok(volleys[rank].damage>volleys[rank-1].damage,type+' damage must improve at rank '+(rank+1));
   if(type==='laser'||type==='spread'||type==='rockets')assert.ok(volleys[rank].count>=volleys[rank-1].count,type+' must not lose projectiles on upgrade');
   if(type==='plasma')assert.ok(volleys[rank].blast>volleys[rank-1].blast,'Plasma blast expands with power');
   if(type==='beam')assert.ok(volleys[rank].pierce>volleys[rank-1].pierce,'Beam pierces more enemies with power');
  }
  h.pickup(type);assert.equal(h.state.inventory[type],5);
 }
});

test('earned weapon power survives a new session while old arsenal saves remain usable',()=>{
 const h=harness();h.start();for(let i=0;i<4;i++)h.pickup('laser');h.pickup('plasma');h.pickup('plasma');
 const next=harness({saved:Object.fromEntries(h.storageValues)});next.start();
 assert.equal(next.state.inventory.laser,5);assert.equal(next.state.inventory.plasma,2);
 const old={version:3,credits:123,unlocked:1,selected:1,missions:{},arsenal:{laser:true,spread:true,plasma:true,rockets:false,beam:false},settings:{autoFire:false,difficulty:'normal'}};
 const migrated=harness({saved:{'imranStarDefender.v3':JSON.stringify(old)}});migrated.start();
 assert.equal(migrated.api.profile.state.credits,123);assert.equal(migrated.state.inventory.laser,1);
 assert.equal(migrated.state.inventory.spread,1);assert.equal(migrated.state.inventory.plasma,1);assert.equal(migrated.state.inventory.rockets,0);
});

test('score cannot skip a stage and the wave ends with a mandatory boss', () => {
  const h = harness(); h.start(); h.state.player.inv = Infinity;
  h.api.setScore(1000000); h.api.update(0); assert.equal(h.state.level, 1);
  h.advance(h.api.waveDuration()-1); assert.equal(h.state.stageMode, 'wave'); assert.equal(h.state.boss, null);
  h.advance(1.2); assert.equal(h.state.stageMode, 'boss'); assert.ok(h.state.boss);
  const boss = h.state.boss; assert.ok(boss.hp > 0 && boss.maxHp >= boss.hp);
  h.advance(10); assert.equal(h.state.level, 1); assert.equal(h.state.stageMode, 'boss'); assert.equal(h.state.boss, boss);
});

test('bosses gain attack phases as HP falls and their defeat unlocks the next stage', () => {
  const h = harness({mode:'endless'}); h.start(); h.state.player.inv = Infinity; h.api.beginBoss();
  const first = h.state.boss, firstPhase = first.phase;
  h.api.damageBoss(first.maxHp * .55); h.api.update(0);
  assert.ok(first.hp < first.maxHp * .5); assert.ok(first.phase > firstPhase);
  const scoreBefore = h.state.score;
  h.api.damageBoss(first.maxHp); assert.equal(h.state.stageMode, 'intermission'); assert.equal(h.state.level, 1);
  assert.ok(h.state.score > scoreBefore);
  const defeatScore = h.state.score; h.api.defeatBoss(); assert.equal(h.state.score, defeatScore, 'Boss defeat must not be rewarded twice');
  h.advance(2); assert.equal(h.state.level, 1);
  h.advance(1.6); assert.equal(h.state.level, 2); assert.equal(h.state.stageMode, 'wave'); assert.equal(h.state.boss, null);
  h.api.beginBoss(); assert.ok(h.state.boss.maxHp > first.maxHp, 'Later-stage boss must be tougher');
});

test('pausing freezes wave clocks, projectiles, pickups and boss intermission', () => {
  const h = harness({mode:'endless'}); h.start(); h.state.player.inv = Infinity;
  h.api.createPickup('plasma', 80, 100); h.api.shoot(); h.advance(.2);
  const snapshot = () => JSON.stringify({ gameTime: h.state.gameTime, stageTime: h.state.stageTime,
    shots: h.state.shots, hostileShots: h.state.hostileShots, enemies: h.state.enemies, pickups: h.state.pickups });
  h.api.setPaused(true); const before = snapshot(); h.advance(5); assert.equal(snapshot(), before);
  h.api.setPaused(false); const resume = h.state.gameTime; h.tick(); assert.ok(h.state.gameTime - resume < .04);
  h.api.beginBoss(); h.api.damageBoss(h.state.boss.maxHp); h.api.setPaused(true);
  h.advance(10); assert.equal(h.state.level, 1); assert.equal(h.state.stageMode, 'intermission');
  h.api.setPaused(false); h.advance(3.6); assert.equal(h.state.level, 2);
});

test('restart resets stage clocks, inventory, projectiles, boss and input', () => {
  const h = harness(); h.start(); const startingLives = h.state.lives;
  h.pickup('plasma'); h.pickup('beam'); h.api.createEnemy('scout'); h.api.shoot(); h.advance(.5);
  h.api.beginBoss(); h.api.damageBoss(h.state.boss.maxHp);
  h.element('fire').emit('pointerdown', { pointerId: 12 }); h.emit('keydown', { code: 'KeyD', key: 'd' });
  h.api.endGame(); h.element('again').emit('click');
  assert.equal(h.state.running, true); assert.equal(h.state.paused, false);
  assert.equal(h.state.gameTime, 0); assert.equal(h.state.stageTime, 0); assert.equal(h.state.level, 1);
  assert.equal(h.state.stageMode, 'wave'); assert.equal(h.state.boss, null);
  assert.equal(h.state.score, 0); assert.equal(h.state.lives, startingLives); assert.equal(h.state.weapon, 'laser');
  assert.equal(h.state.inventory.laser, 1);
  for (const type of ['spread','rockets']) assert.equal(h.state.inventory[type],0);for (const type of ['plasma','beam']) assert.equal(h.state.inventory[type],1,'Found weapons persist across sorties');
  for (const name of ['enemies', 'shots', 'hostileShots', 'pickups']) assert.equal(h.state[name].length, 0, name);
  assert.equal(h.state.fireCount, 0); assert.equal(h.state.keyCount, 0); assert.equal(h.state.movePointerId, null);
  assert.equal(h.frames.length, 1);
  h.advance(2); assert.equal(h.state.level, 1); assert.equal(h.state.stageMode, 'wave');
});

test('alien ship variants have different toughness and fire real moving projectiles', () => {
  const h = harness(); h.start(); h.state.player.inv = Infinity;
  const ships = {};
  for (const type of ['scout', 'interceptor', 'armored', 'weaver', 'carrier']) {
    assert.ok(h.api.enemyTypes[type], type + ' configuration');
    h.api.createEnemy(type); ships[type] = h.state.enemies.at(-1);
    assert.ok(ships[type].hp > 0);
  }
  assert.ok(ships.armored.hp > ships.scout.hp, 'Armored ships take more hits');
  assert.ok(ships.carrier.hp > ships.scout.hp, 'Carriers take more hits');
  ships.carrier.y = 150; ships.carrier.vy = 0; ships.carrier.fire = 0;
  h.advance(4.2);
  assert.ok(h.state.hostileShots.length > 0, 'Enemy attacks create hostile bullets');
  const shot = h.state.hostileShots[0], before = { x: shot.x, y: shot.y };
  h.tick(); assert.ok(shot.x !== before.x || shot.y !== before.y, 'Enemy bullets travel through the game');
  const lives = h.state.lives; h.state.player.inv = 0; h.state.player.shield = 0;
  h.state.enemies.length = 0;
  shot.x = h.state.player.x; shot.y = h.state.player.y; h.api.update(0);
  assert.equal(h.state.lives, lives - 1, 'Enemy projectile can damage the player');
  assert.ok(!h.state.hostileShots.includes(shot), 'Bullet is consumed on contact');
});

test('one hit gives temporary invincibility and shielded hits cannot consume lives', () => {
  const h = harness(); h.start(); h.state.player.inv = 0; h.state.player.shield = 0;
  const lives = h.state.lives;
  assert.equal(h.api.damagePlayer(), true); assert.equal(h.state.lives, lives - 1);
  assert.ok(h.state.player.inv > 0);
  assert.equal(h.api.damagePlayer(), false); assert.equal(h.state.lives, lives - 1);
  const inv = h.state.player.inv; h.advance(.2); assert.ok(h.state.player.inv > 0 && h.state.player.inv < inv);
  h.state.player.inv = 0; h.state.player.shield = 1;
  assert.equal(h.api.damagePlayer(), false); assert.equal(h.state.lives, lives - 1);
  h.state.player.shield = 0; h.state.player.inv = 0;
  assert.equal(h.api.damagePlayer(), true); assert.equal(h.state.lives, lives - 2);
  while (h.state.running) { h.state.player.inv = 0; h.api.damagePlayer(); }
  assert.equal(h.state.lives, 0); assert.equal(h.state.running, false);
  h.element('fire').emit('pointerdown'); assert.equal(h.state.fireCount, 0);
  h.element('again').emit('click'); assert.equal(h.state.lives, lives); assert.equal(h.state.running, true);
});

test('a clustered enemy volley deals one hit and cannot break the animation loop', () => {
  const h = harness(); h.start(); h.state.player.inv = 0; h.state.player.shield = 0;
  const lives = h.state.lives;
  for (let i = 0; i < 5; i++) h.state.hostileShots.push({
    x: h.state.player.x + i, y: h.state.player.y + 10, vx: 0, vy: 0,
    r: 5, c: '#ff818a', t: 'orb', life: 5
  });
  assert.doesNotThrow(() => h.api.update(0));
  assert.equal(h.state.lives, lives - 1);
  h.tick(); assert.equal(h.frames.length, 1);
});

test('plasma blast destroys multiple ships and rewards each exactly once', () => {
  const h = harness(); h.start();
  const ships = [];
  for (let i = 0; i < 3; i++) { h.api.createEnemy('scout'); ships.push(h.state.enemies.at(-1)); }
  for (const [i, enemy] of ships.entries()) { enemy.x = [100, 165, 285][i]; enemy.y = 180; enemy.hp = i === 2 ? 5 : 2; }
  h.state.shots.push({ x: 100, y: 180, vx: 0, vy: 0, r: 14, d: 3, t: 'plasma', hit: new Set(), pierce: 1, life: 2 });
  h.api.update(0);
  assert.equal(h.state.enemies.length, 1); assert.equal(h.state.enemies[0], ships[2]); assert.equal(ships[2].hp, 5);
  const score = h.state.score; assert.ok(score > 0);
  h.api.update(0); assert.equal(h.state.score, score);
  h.api.damageEnemy(ships[0], 10); h.api.damageEnemy(ships[1], 10);
  assert.equal(h.state.score, score, 'Destroyed ships cannot be awarded twice');
});

test('ships surviving splash retain damage and award points only on a later kill', () => {
  const h = harness(); h.start(); h.api.createEnemy('armored');
  const enemy = h.state.enemies[0]; enemy.x = 100; enemy.y = 180; enemy.hp = 4;
  h.state.shots.push({ x: 100, y: 180, vx: 0, vy: 0, r: 14, d: 3, t: 'plasma', hit: new Set(), pierce: 1, life: 2 });
  h.api.update(0); assert.equal(h.state.enemies.length, 1); assert.equal(enemy.hp, 1); assert.equal(h.state.score, 0);
  h.state.shots.push({ x: 100, y: 180, vx: 0, vy: 0, r: 5, d: 1, t: 'laser', hit: new Set(), pierce: 1, life: 2 });
  h.api.update(0); assert.equal(h.state.enemies.length, 0); assert.ok(h.state.score > 0);
  const score = h.state.score; h.api.update(0); assert.equal(h.state.score, score);
});

test('formation routes arrive at their authored geometry, hold, release and shoot',()=>{
 for(const kind of ['group','semicircle','pincer','horde','wedge','columns']){
  const h=harness();h.start();h.state.player.inv=Infinity;h.api.spawnFormation(kind);
  const squad=h.state.enemies.filter(e=>e.entry?.kind===kind);
  const first=squad[0],e=first.entry,initial=first.y;
  h.api.update(.1);assert.ok(first.y>initial,kind+' route actually advances');
  assert.equal(e.elapsed,.1);h.api.update(e.duration-.1+.03);
  assert.ok(Math.abs(first.x-e.targetX)<.1&&Math.abs(first.y-e.targetY)<3,kind+' arrives at designated point');
  assert.equal(e.released,false,kind+' holds formation before the sortie');
  h.api.update(e.hold+.1);assert.equal(e.released,true,kind+' releases from formation');
  const before=first.y;h.api.update(.1);assert.ok(first.y>before,kind+' exits towards the player');
 }
});

test('all authored attack kinds deliver a distinct real projectile or hazard pattern',()=>{
 const signatures=new Set(),kinds=['fan','aim','ring','minions','cross','lanes','needles','sweep','wings','rake','barrage','lattice','nova','spiral'];
 for(const kind of kinds){
  const h=harness();h.api.configureMission(30);h.start();h.state.player.inv=Infinity;h.api.beginBoss();const b=h.state.boss;
  b.entry=0;b.patterns=[kind];b.phase=2;b.fire=100;
  h.api.update(.05);h.api.bossWarning();const warning=b.warning;assert.equal(warning.kind,kind);
  assert.ok(warning.total>=.68,'Every pattern gives a reaction window');h.api.bossAttack();
  const pending=b.queued.length;
  assert.ok(h.state.hostileShots.length||pending||h.state.hazards.length||h.state.enemies.length,kind+' actually attacks');
  for(let i=0;i<80;i++)h.api.update(.01);
  assert.equal(b.queued.length,0,kind+' scheduled bursts fire instead of remaining inert');
  assert.ok(h.state.hostileShots.length<=72);assert.ok(h.state.enemies.length<=h.api.enemyCap());
  const signature=JSON.stringify({shots:h.state.hostileShots.map(s=>[Math.round(s.vx),Math.round(s.vy),s.r]),pending,enemies:h.state.enemies.map(e=>e.type),hazards:h.state.hazards.map(q=>[q.x,q.w])});
  assert.ok(!signatures.has(signature),kind+' must not silently reuse a fallback attack');signatures.add(signature);
 }
});

test('commanders fly distinct finite routes and late bosses enter a third phase',()=>{
 const paths=new Set();
 for(let id=1;id<=30;id++){
  const h=harness();h.api.configureMission(id);h.start();h.state.player.inv=Infinity;h.api.beginBoss();const b=h.state.boss;
  const coordinates=[];
  for(let i=0;i<200;i++){h.api.update(.03);if(i%20===0)coordinates.push([Math.round(b.x*10)/10,Math.round(b.y*10)/10]);assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y))}
  assert.ok(new Set(coordinates.map(p=>p[0])).size>2,'Boss '+id+' really moves');
  const signature=JSON.stringify(coordinates);assert.ok(!paths.has(signature),'Boss '+id+' flies its own route');paths.add(signature);
  if(b.phases===3){h.api.damageBoss(b.maxHp*.76);assert.equal(b.phase,3,'Late commander has a third combat phase')}
 }
});

test('top weapon tiers really create fragments, splash, steering and ricochet',()=>{
 const plasma=harness();plasma.start();plasma.state.inventory.plasma=5;plasma.api.setWeapon('plasma');plasma.api.shoot();
 const ball=plasma.state.shots[0],victim=plasma.api.createEnemy('armored');victim.x=ball.x;victim.y=ball.y-20;victim.vx=0;victim.vy=0;plasma.api.update(.035);
 assert.ok(plasma.state.shots.some(s=>s.color==='#e6b0ff'),'LV5 plasma creates moving fragmentation shots');
 const rockets=harness();rockets.start();rockets.state.inventory.rockets=5;rockets.api.setWeapon('rockets');rockets.api.shoot();
 const rocket=rockets.state.shots[2],target=rockets.api.createEnemy('armored'),nearby=rockets.api.createEnemy('armored');
 target.x=rocket.x;target.y=rocket.y-14;target.vx=target.vy=0;nearby.x=target.x+48;nearby.y=target.y;nearby.vx=nearby.vy=0;const hp=nearby.hp;
 rockets.api.update(.035);assert.ok(nearby.hp<hp,'LV5 rocket explosion damages a nearby ship');
 const spread=harness();spread.start();spread.state.inventory.spread=5;spread.api.setWeapon('spread');spread.api.shoot();
 const orb=spread.state.shots[0];orb.x=2;orb.y=450;orb.vx=-400;spread.api.update(.035);assert.ok(orb.vx>0&&orb.bounce===0,'Legendary spread ricochets once off a side');
});

test('endless campaign keeps growing after the thirtieth commander',()=>{
 const h=harness({mode:'endless'});h.start();h.state.player.inv=Infinity;
 let previous=0;
 for(let stage=1;stage<=32;stage++){
  assert.equal(h.state.level,stage);h.api.beginBoss();assert.ok(h.state.boss.maxHp>previous,'Endless stage '+stage+' does not reset boss difficulty');previous=h.state.boss.maxHp;
  h.api.damageBoss(previous);assert.equal(h.state.stageMode,'intermission');
  h.api.update(3.5);assert.equal(h.state.running,true);assert.ok(h.state.enemies.length<=h.api.enemyCap());
 }
});
