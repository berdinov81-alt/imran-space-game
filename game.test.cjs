const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
function harness({width=390,height=844,storageBlocked=false}={}) {
 const elements=new Map(),frames=[],events=new Map();let clock=1000;
 function element(id){if(elements.has(id))return elements.get(id);const listeners=new Map(),classes=new Set();const e={id,disabled:true,textContent:'',style:{},dataset:{},setAttribute(){},setPointerCapture(pointerId){this.captured=pointerId},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c)}},addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler)},emit(type,props={}){for(const fn of listeners.get(type)||[])fn({pointerId:1,pointerType:'touch',clientX:100,clientY:500,button:0,preventDefault(){},...props})}};elements.set(id,e);return e}
 const gradient={addColorStop(){}};
 const drawing=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get(target,key){return key in target?target[key]:()=>{}}});
 element('game').getContext=()=>drawing;
 const weapons=['laser','plasma','multi'].map(w=>{const e=element(w);e.dataset.w=w;return e});
 const document={hidden:false,getElementById:element,querySelectorAll:()=>weapons,addEventListener:(t,fn)=>{events.set('document:'+t,fn)}};
 const sandbox={document,Image:class{complete=true;naturalWidth=256},innerWidth:width,innerHeight:height,devicePixelRatio:3,performance:{now:()=>clock},localStorage:{getItem(){if(storageBlocked)throw Error('storage blocked');return null},setItem(){if(storageBlocked)throw Error('storage blocked')}},requestAnimationFrame:fn=>frames.push(fn),addEventListener(t,fn){if(!events.has(t))events.set(t,[]);events.get(t).push(fn)}};
 vm.createContext(sandbox);
 // Expose lexical state only in this test VM; the shipped game has no test API.
 const instrumented=source.replace(/\}\)\(\);\s*$/, `globalThis.inspection={get state(){return {running,paused,player,target,shots,rocks,score,lives,weapon,movePointerId,fireCount:fireTouches.size}},endGame,update,clearInput};})();`);
 vm.runInContext(instrumented,sandbox);
 return {sandbox,element,frames,get state(){return sandbox.inspection.state},emit(type,props={}){for(const fn of events.get(type)||[])fn({preventDefault(){},...props})},visibility(hidden){document.hidden=hidden;events.get('document:visibilitychange')()},tick(n=1){for(let i=0;i<n;i++){clock+=1000/60;assert.equal(frames.length,1);frames.shift()(clock)}},start(){element('startBtn').emit('click')}};
}
test('static project has every local resource, original artwork, and no host preview dependencies',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const [,resource] of html.matchAll(/(?:src|href)="([^"]+)"/g)){assert.ok(!resource.startsWith('/'));assert.ok(fs.existsSync(path.join(root,resource)),resource)}
 assert.match(html,/<html lang="ru">/);assert.match(html,/<script src="game.js" defer/);
 assert.doesNotMatch(html,/skybridge|oaiusercontent|__EMBEDDED_IMAGE__/i);
 assert.ok(fs.statSync(path.join(root,'face.jpg')).size>20000);
 assert.ok(fs.statSync(path.join(root,'cover.jpg')).size>190000);
 assert.ok(fs.existsSync(path.join(root,'.nojekyll')));
});
test('starts and animates even when storage is blocked',()=>{
 const h=harness({storageBlocked:true});assert.equal(h.element('startBtn').disabled,false);h.tick();h.start();h.tick(90);assert.equal(h.state.running,true);assert.ok(h.state.rocks.length>0);assert.equal(h.frames.length,1);
});
test('two fingers move and shoot simultaneously; releasing fire does not stop movement',()=>{
 const h=harness();h.start();const startX=h.state.player.x;
 h.element('game').emit('pointerdown',{pointerId:7});h.element('game').emit('pointermove',{pointerId:7,clientX:200,clientY:380});
 h.element('fire').emit('pointerdown',{pointerId:9});h.tick(12);
 assert.ok(h.state.player.x>startX+70);assert.ok(h.state.shots.length>0);assert.equal(h.state.movePointerId,7);assert.equal(h.element('fire').captured,9);
 h.emit('pointerup',{pointerId:9});assert.equal(h.state.fireCount,0);assert.equal(h.state.movePointerId,7);
 h.element('game').emit('pointermove',{pointerId:7,clientX:80,clientY:400});h.tick(12);assert.ok(h.state.player.x<startX);
 h.emit('pointerup',{pointerId:7});const x=h.state.player.x;h.tick(12);assert.equal(h.state.player.x,x);
});
test('fire can be the first finger; releasing movement keeps fire held',()=>{
 const h=harness();h.start();h.element('fire').emit('pointerdown',{pointerId:1});h.element('game').emit('pointerdown',{pointerId:2});h.tick(2);h.emit('pointerup',{pointerId:2});assert.equal(h.state.fireCount,1);h.tick(10);assert.ok(h.state.shots.length>0);h.emit('pointercancel',{pointerId:1});assert.equal(h.state.fireCount,0);
});
test('capture loss, pause, app switch, resize, and restart cannot leave controls stuck',()=>{
 const h=harness();h.start();h.element('fire').emit('pointerdown',{pointerId:4});h.element('fire').emit('lostpointercapture',{pointerId:4});assert.equal(h.state.fireCount,0);
 h.element('game').emit('pointerdown',{pointerId:2});h.element('fire').emit('pointerdown',{pointerId:3});h.element('pause').emit('click');assert.equal(h.state.paused,true);assert.equal(h.state.fireCount,0);assert.equal(h.state.movePointerId,null);
 h.element('pause').emit('click');h.element('game').emit('pointermove',{pointerId:2,clientX:350});h.tick();assert.equal(h.state.player.x,h.state.target.x);
 h.element('fire').emit('pointerdown',{pointerId:4});h.visibility(true);assert.equal(h.state.paused,true);assert.equal(h.state.fireCount,0);h.visibility(false);assert.equal(h.state.paused,true);
 h.element('pause').emit('click');h.sandbox.innerWidth=844;h.sandbox.innerHeight=390;h.emit('resize');assert.ok(h.state.player.y<=285);assert.equal(h.state.movePointerId,null);
 h.sandbox.inspection.endGame();h.element('fire').emit('pointerdown',{pointerId:1});assert.equal(h.state.fireCount,0);h.element('again').emit('click');assert.equal(h.state.running,true);assert.equal(h.state.score,0);assert.equal(h.state.weapon,'laser');assert.equal(h.frames.length,1);
});
test('keyboard movement, shooting, and blur reset work',()=>{
 const h=harness();h.start();const before=h.state.player.x;h.emit('keydown',{code:'ArrowRight',key:'ArrowRight'});h.emit('keydown',{code:'Space',key:' '});h.tick(15);assert.ok(h.state.player.x>before);assert.ok(h.state.shots.length>0);h.emit('blur');assert.equal(h.state.paused,true);assert.equal(h.state.fireCount,0);
});

test('plasma removes and rewards every destroyed rock in its blast exactly once',()=>{
 const h=harness();h.start();
 const rock=(x,hp)=>({x,y:180,vx:0,vy:0,r:25,hp,rot:0,vr:0,hot:false});
 h.state.rocks.push(rock(100,3),rock(175,3),rock(240,4));
 h.state.shots.push({x:100,y:180,vx:0,vy:0,r:14,d:3,t:'plasma'});
 h.sandbox.inspection.update(0,1000);
 assert.equal(h.state.rocks.length,1);
 assert.equal(h.state.rocks[0].x,240);
 assert.equal(h.state.rocks[0].hp,4);
 assert.equal(h.state.score,264);
 h.sandbox.inspection.update(0,1001);
 assert.equal(h.state.score,264);
});

test('rocks that survive plasma retain damage and remain available for the next shot',()=>{
 const h=harness();h.start();
 h.state.rocks.push({x:100,y:180,vx:0,vy:0,r:25,hp:4,rot:0,vr:0,hot:false});
 h.state.shots.push({x:100,y:180,vx:0,vy:0,r:14,d:3,t:'plasma'});
 h.sandbox.inspection.update(0,1000);
 assert.equal(h.state.rocks.length,1);assert.equal(h.state.rocks[0].hp,1);assert.equal(h.state.score,0);
 h.state.shots.push({x:100,y:180,vx:0,vy:0,r:5,d:1,t:'laser'});
 h.sandbox.inspection.update(0,1001);
 assert.equal(h.state.rocks.length,0);assert.equal(h.state.score,132);
});
