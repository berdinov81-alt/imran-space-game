const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;

// Test the shipped loop and handlers without exposing a test API to players.
function harness({ width = 390, height = 844, storageBlocked = false } = {}) {
  const elements = new Map(), frames = [], events = new Map();
  let clock = 1000, seed = 810011, created = 0;
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
    hidden: false, getElementById: element, createElement: tag => element(tag + ':created:' + created++),
    querySelectorAll: selector => selector === '.weapon' ? weapons : selector === '[data-difficulty]' ? difficultyButtons : [],
    addEventListener(type, fn) { if (!events.has('document:' + type)) events.set('document:' + type, []); events.get('document:' + type).push(fn); }
  };
  const seededMath = Object.create(Math);
  seededMath.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = {
    document, Math: seededMath, Image: class { complete = true; naturalWidth = 256; naturalHeight = 256; },
    innerWidth: width, innerHeight: height, devicePixelRatio: 3,
    performance: { now: () => clock },
    localStorage: {
      getItem() { if (storageBlocked) throw Error('storage blocked'); return null; },
      setItem() { if (storageBlocked) throw Error('storage blocked'); }
    },
    requestAnimationFrame: fn => frames.push(fn),
    addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); }
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  const instrumented = source.replace(/\}\)\(\);\s*$/, `
    globalThis.inspection = {
      get state() { return { running, paused, gameTime, level, stageTime, stageMode, boss,
        player, target, weapon, inventory, enemies, shots, hostileShots, pickups, score, lives,
        movePointerId, fireCount: fireTouches.size, keyCount: keys.size }; },
      reset, startGame, update, shoot, createEnemy, createPickup, beginBoss,
      damageEnemy, damageBoss, damagePlayer, collectPickup, defeatBoss, setWeapon, setPaused, clearInput, resize,
      enemyTypes, MAX_POWER,
      endGame: () => endGame(), setScore: value => { score = value; }
    };
  })();`);
  assert.notEqual(instrumented, source, 'Game must retain its private IIFE boundary for test instrumentation');
  vm.runInContext(instrumented, sandbox);
  return {
    sandbox, element, frames, api: sandbox.inspection,
    get state() { return sandbox.inspection.state; },
    emit(type, props = {}) { for (const fn of events.get(type) || []) fn({ preventDefault() {}, ...props }); },
    visibility(hidden) { document.hidden = hidden; for (const fn of events.get('document:visibilitychange') || []) fn(); },
    tick(n = 1) { for (let i = 0; i < n; i++) { clock += 1000 / 60; assert.equal(frames.length, 1, 'Exactly one animation loop'); frames.shift()(clock); } },
    advance(seconds) { this.tick(Math.ceil(seconds * 60)); },
    start() { element('startBtn').emit('click'); },
    pressWeapon(type) { const button = weapons.find(w => w.dataset.w === type); assert.ok(button, type + ' must be in the weapon bar'); element('weapons').emit('click', { target: button }); },
    weaponButton(type) { return weapons.find(w => w.dataset.w === type); },
    pickup(type) { this.api.createPickup(type, this.state.player.x, this.state.player.y); this.api.update(0); }
  };
}

test('release uses local resources, the original portrait, and all five weapon controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, resource] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
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

test('guaranteed early weapons arrive even without killing ships', () => {
  const h = harness(); h.start(); h.state.player.inv = Infinity;
  h.advance(6.2);
  assert.ok(h.state.pickups.some(p => p.type === 'spread' || p.t === 'spread'), 'Early spread pickup');
  h.state.pickups.length = 0;
  h.advance(16.2);
  assert.ok(h.state.pickups.some(p => p.type === 'plasma' || p.t === 'plasma'), 'Guaranteed first-stage plasma pickup');
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

test('score cannot skip a stage and the wave ends with a mandatory boss', () => {
  const h = harness(); h.start(); h.state.player.inv = Infinity;
  h.api.setScore(1000000); h.api.update(0); assert.equal(h.state.level, 1);
  h.advance(37); assert.equal(h.state.stageMode, 'wave'); assert.equal(h.state.boss, null);
  h.advance(1.2); assert.equal(h.state.stageMode, 'boss'); assert.ok(h.state.boss);
  const boss = h.state.boss; assert.ok(boss.hp > 0 && boss.maxHp >= boss.hp);
  h.advance(10); assert.equal(h.state.level, 1); assert.equal(h.state.stageMode, 'boss'); assert.equal(h.state.boss, boss);
});

test('bosses gain attack phases as HP falls and their defeat unlocks the next stage', () => {
  const h = harness(); h.start(); h.state.player.inv = Infinity; h.api.beginBoss();
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
  const h = harness(); h.start(); h.state.player.inv = Infinity;
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
  for (const type of ['spread', 'plasma', 'rockets', 'beam']) assert.equal(h.state.inventory[type], 0);
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
