const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {create}=require('./audio.js');
const synth=require('./audio-synth.js');

function fixture({deferred=false,broken=false}={}){
 const settings={sound:true,music:true,voice:true,masterVolume:80,musicVolume:55,effectsVolume:70,voiceVolume:90};
 const nodes=[],sources=[],requests=[];let release;
 const gate=deferred?new Promise(resolve=>{release=resolve}):Promise.resolve();
 function node(){const n={connections:[],gain:{value:1,cancelScheduledValues(){},setTargetAtTime(value){this.value=value}},connect(other){this.connections.push(other)},disconnect(){this.connections=[]}};nodes.push(n);return n}
 const ctx={currentTime:0,sampleRate:22050,state:'suspended',destination:{},createGain:node,
  createDynamicsCompressor(){return {...node(),threshold:{},knee:{},ratio:{},attack:{},release:{}}},
  createBuffer(channels,length,sampleRate){return {duration:length/sampleRate,copyToChannel(){}}},
  createBufferSource(){const s={...node(),start(...args){this.started=args},stop(time){this.stopped=time??ctx.currentTime},finish(){this.onended?.()}};sources.push(s);return s},
  async resume(){this.state='running'},async suspend(){this.state='suspended'},async decodeAudioData(){return {duration:40}}
 };
 const clips={welcome:{offset:0,duration:1},launch:{offset:2,duration:2},victory:{offset:5,duration:2},turbo:{offset:8,duration:1},critical:{offset:10,duration:2}};
 const audio=create({settings:()=>settings,contextFactory:()=>ctx,voiceMap:clips,fetch:async file=>{requests.push(file);await gate;if(broken)throw Error('offline');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}},onStatus(){}});
 return{audio,ctx,settings,nodes,sources,requests,release};
}
test('audio loads once, uses real sprite offsets, and ducks music during priority speech',async()=>{
 const f=fixture();await f.audio.unlock();await f.audio.load();assert.equal(f.requests.length,5);await f.audio.unlock();await f.audio.load();assert.equal(f.requests.length,5);
 f.audio.stopVoice();assert.equal(f.audio.speak('launch',4),true);const first=f.sources.at(-1);assert.deepEqual(first.started,[0,2,2]);assert.ok(Math.abs(f.nodes[1].gain.value-.55*.35)<1e-9);
 assert.equal(f.audio.speak('turbo',2),false);assert.equal(f.audio.state.voice,'launch');assert.equal(f.audio.speak('victory',5),true);const victory=f.sources.at(-1);first.finish();assert.equal(f.audio.state.voice,'victory');assert.ok(f.nodes[1].gain.value<.2);victory.finish();assert.equal(f.audio.state.voice,null);assert.equal(f.nodes[1].gain.value,.55);
});
test('rapid scene changes keep music bounded and a finished fanfare does not restart on volume changes',async()=>{
 const f=fixture();await f.audio.unlock();await f.audio.load();
 for(const scene of ['battle','boss','menu','battle','victory']){f.audio.setScene(scene);assert.ok(f.audio.state.activeMusic<=2)}
 const last=f.sources.at(-1);assert.equal(last.loop,false);last.finish();f.settings.musicVolume=30;f.audio.apply();await Promise.resolve();assert.ok(!f.sources.slice(f.sources.indexOf(last)+1).some(s=>s.loop===false));
 f.audio.setScene('victory',true);assert.equal(f.audio.state.activeMusic,1);assert.notEqual(f.sources.at(-1),last);
});
test('background pause stops voice and effects, blocks gesture unlock and resumes the same music loop',async()=>{
 const f=fixture();await f.audio.unlock();await f.audio.load();f.audio.setScene('battle');f.audio.effect('plasma');f.audio.speak('launch',4);const musicCount=f.audio.state.activeMusic;
 f.audio.pause();assert.equal(f.ctx.state,'suspended');assert.equal(f.audio.state.voice,null);assert.equal(f.audio.state.activeEffects,0);await f.audio.unlock();assert.equal(f.ctx.state,'suspended');assert.equal(f.audio.speak('victory',5),false);
 await f.audio.resume();assert.equal(f.ctx.state,'running');assert.equal(f.audio.state.activeMusic,musicCount);assert.equal(f.audio.state.voice,null);
});
test('loading queues only the most important current event and backgrounding discards stale speech',async()=>{
 const f=fixture({deferred:true});await f.audio.unlock();f.audio.setScene('battle');f.audio.speak('launch',4);f.audio.speak('turbo',2);assert.equal(f.audio.state.pending,'launch');f.audio.pause();f.release();await f.audio.load();assert.equal(f.audio.state.pending,null);assert.equal(f.audio.state.voice,null);assert.equal(f.audio.state.activeMusic,0);
 await f.audio.resume();assert.equal(f.audio.state.activeMusic,1);
});
test('mute and independent zero volumes stop only their intended channels',async()=>{
 const f=fixture();await f.audio.unlock();await f.audio.load();f.audio.stopVoice();f.settings.effectsVolume=0;f.audio.apply();assert.equal(f.audio.effect('laser'),false);assert.equal(f.audio.speak('launch',4),true);
 f.settings.voice=false;f.audio.apply();assert.equal(f.audio.state.voice,null);assert.equal(f.audio.speak('victory',5),false);assert.equal(f.nodes[3].gain.value,0);assert.ok(f.audio.state.activeMusic>0);
 f.settings.music=false;f.audio.apply();assert.equal(f.audio.state.activeMusic,0);f.settings.effectsVolume=70;assert.equal(f.audio.effect('laser'),true);
 f.settings.sound=false;f.audio.apply();await Promise.resolve();assert.equal(f.ctx.state,'suspended');assert.equal(f.audio.state.activeEffects,0);assert.equal(f.nodes[0].gain.value,0);
});
test('effects stay capped during a horde and completed sources are disconnected',async()=>{
 const f=fixture();await f.audio.unlock();await f.audio.load();for(let i=0;i<50;i++){f.ctx.currentTime+=.1;f.audio.effect('explosion')}assert.equal(f.audio.state.activeEffects,18);
 for(const s of f.sources.filter(s=>s.loop===undefined))s.finish();assert.equal(f.audio.state.activeEffects,0);assert.equal(f.audio.effect('beam'),true);
});
test('missing assets preserve synthesized gameplay sounds and unavailable Web Audio is nonfatal',async()=>{
 const f=fixture({broken:true});await f.audio.unlock();await f.audio.load();assert.equal(f.audio.state.failed,true);assert.equal(f.audio.effect('laser'),true);assert.equal(f.audio.speak('launch'),false);
 const absent=create({contextFactory:()=>null,onStatus(){}});assert.equal(await absent.unlock(),false);absent.setScene('boss');absent.pause();await absent.resume();assert.equal(absent.effect('laser'),false);
});
function wav(file){const b=fs.readFileSync(__dirname+'/'+file);assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');assert.equal(b.readUInt16LE(20),1);assert.equal(b.readUInt16LE(34),16);let at=12,data;
 while(at+8<=b.length){const size=b.readUInt32LE(at+4);if(b.toString('ascii',at,at+4)==='data'){data=b.subarray(at+8,at+8+size);break}at+=8+size+(size%2)}assert.ok(data);const channels=b.readUInt16LE(22),sampleRate=b.readUInt32LE(24);let energy=0,peak=0;for(let i=0;i<data.length;i+=2){const v=data.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(v));energy+=v*v}return{duration:data.length/2/channels/sampleRate,channels,sampleRate,peak,rms:Math.sqrt(energy/(data.length/2))};}
test('shipped music and voice contain audible unclipped PCM, and every spoken cue lies inside the sprite',()=>{
 const voice=wav('audio-voice.wav');assert.equal(voice.channels,1);assert.equal(voice.sampleRate,22050);assert.ok(voice.rms>.03&&voice.peak<.99);const clips=JSON.parse(fs.readFileSync(__dirname+'/voice-map.json'));assert.equal(Object.keys(clips).length,16);let end=0;
 for(const clip of Object.values(clips)){assert.ok(clip.offset>=end);assert.ok(clip.duration>.5);assert.ok(clip.offset+clip.duration<=voice.duration+.001);assert.ok(/[А-Яа-я]/.test(clip.text));end=clip.offset+clip.duration}
 const tracks=['menu','battle','boss','victory'].map(id=>wav('music-'+id+'.wav'));assert.equal(new Set(tracks.map(t=>t.duration.toFixed(2))).size,4);for(const t of tracks){assert.equal(t.channels,2);assert.ok(t.duration>=6&&t.duration<=30);assert.ok(t.rms>.03&&t.peak<.99)}
 for(const id of ['laser','spread','plasma','arc','beam','explosion','shield','turbo','pulse']){const data=synth.effect(id,22050);assert.ok(data.length>2000);assert.ok(data.every(Number.isFinite));assert.ok(data.some(v=>Math.abs(v)>.02))}
});
