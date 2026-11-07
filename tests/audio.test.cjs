const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const file = process.env.EMBERWOOD_AUDIO_SOURCE;
const html = file ? '' : fs.readFileSync(path.resolve(__dirname, '../emberwood.html'), 'utf8');
const source = file ? fs.readFileSync(file, 'utf8') : html.match(/<script id="presentation-layer">([\s\S]*?)\/\* Campaign UI/)[1];
const requiredCues = ['ui','confirm','error','start','swing','spear','bow','hit','hurt','enemyDown','coin','gem','wood','deposit','build','upgrade','levelUp','day','boss','shoot','cannon','flame','targetHit','miss','dodgeHit','parry','parryMiss','miniWin','miniEnd','win','lose','combo','comboMax','milestone','explode','spin','dash','special'];
class Param {
  constructor(value = 1) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value=value; this.events.push({type:'set',value,time}); }
  linearRampToValueAtTime(value,time) { this.value=value; this.events.push({type:'linear',value,time}); }
  exponentialRampToValueAtTime(value,time) { assert.ok(value>0); this.value=value; this.events.push({type:'exponential',value,time}); }
  cancelScheduledValues(time) { this.events=this.events.filter(e=>e.time<time); }
  setTargetAtTime(value,time) { this.value=value; this.events.push({type:'target',value,time}); }
}
class Node {
  constructor(ctx, kind) { this.ctx=ctx; this.kind=kind; this.connections=[]; this.gain=new Param(); this.frequency=new Param(); this.Q=new Param(); }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections=[]; }
}
class Voice extends Node {
  constructor(ctx,kind) { super(ctx,kind); this.playbackRate=new Param(); ctx.voices.push(this); }
  start(time=0) { this.started=time; }
  stop(time=0) { this.stopped=time; if(time<=this.ctx.currentTime) { this.finished=true; if(this.onended)this.onended(); } }
}
class FakeAudioContext {
  constructor() { this.currentTime=0; this.sampleRate=24000; this.state='suspended'; this.destination={kind:'destination'}; this.voices=[]; this.nodes=[]; this.resumes=0; this.suspends=0; this.closed=0; this.sample=.125; }
  createGain() { const node=new Node(this,'gain'); this.nodes.push(node); return node; }
  createOscillator() { return new Voice(this,'oscillator'); }
  createBufferSource() { return new Voice(this,'noise'); }
  createBuffer(channels,length,rate) { const data=new Float32Array(length); return {getChannelData:()=>data,length,sampleRate:rate}; }
  createBiquadFilter() { return new Node(this,'filter'); }
  createDynamicsCompressor() { const node=new Node(this,'compressor'); for(const key of ['threshold','knee','ratio','attack','release'])node[key]=new Param(); return node; }
  createAnalyser() { const node=new Node(this,'analyser'); node.fftSize=256; node.getFloatTimeDomainData=data=>data.fill(this.state==='running'?this.sample:0); return node; }
  async resume() { this.resumes++; this.state='running'; }
  async suspend() { this.suspends++; this.state='suspended'; }
  async close() { this.closed++; this.state='closed'; }
  advance(seconds) { this.currentTime+=seconds; for(const voice of this.voices)if(!voice.finished&&voice.stopped<=this.currentTime){voice.finished=true;if(voice.onended)voice.onended();} }
}
function load(extraWindow={}) {
  const scope=vm.createContext({window:{...extraWindow},console,Math,Set,Map,Float32Array,Uint8Array,Promise,Number,Object,JSON});
  vm.runInContext(source,scope,{filename:file||'emberwood-audio.js'});
  assert.equal(typeof scope.window.EmberwoodAudio?.SoundEngine,'function','audio engine is exported before Campaign UI');
  return scope.window.EmberwoodAudio;
}
function create(options={}) { const api=load(),ctx=new FakeAudioContext(),audio=new api.SoundEngine({createContext:()=>ctx,...options}); return {audio,ctx,api}; }
const settle=async()=>{for(let n=0;n<6;n++)await Promise.resolve();};
const signatures=ctx=>ctx.voices.map(v=>({kind:v.kind,type:v.type,start:v.started,stop:v.stopped,freq:v.frequency.events.map(e=>[e.value,e.time]),rate:v.playbackRate.events.map(e=>e.value)}));
test('constructing and pregesture activation cannot create or resume audio',async()=>{
  let creates=0; const api=load(),ctx=new FakeAudioContext(); const audio=new api.SoundEngine({createContext:()=>{creates++;return ctx;}});
  assert.equal(creates,0); audio.play('start'); audio.tick(100,{scene:'game'}); audio.setActive(false); audio.setActive(true); await settle();
  assert.equal(creates,0);assert.equal(ctx.resumes,0); assert.equal(audio.getState().ready,false);assert.equal(audio.getLevel(),0);
  assert.equal(await audio.unlock(),true);assert.equal(creates,1);assert.equal(audio.getState().ready,true);assert.equal(ctx.state,'running');
});
test('every requested cue is present, playable and not all the same synthesized sound',async()=>{
  const {api}=create();for(const cue of requiredCues)assert.ok(Object.hasOwn(api.CUES,cue),cue);
  const unique=new Set();for(const cue of requiredCues){const {audio,ctx}=create();await audio.unlock();assert.equal(audio.play(cue),true,cue);assert.ok(ctx.voices.length>0,cue);unique.add(JSON.stringify(signatures(ctx)));}
  assert.ok(unique.size>=25,`only ${unique.size} distinct cue voices`);
});
test('rapid repeated hits and wood collection are rate limited and total effect polyphony is bounded',async()=>{
  const {audio,ctx}=create();await audio.unlock();audio.play('hit');const hits=ctx.voices.length;for(let i=0;i<100;i++)audio.play('hit');assert.equal(ctx.voices.length,hits);
  ctx.advance(.041);assert.equal(audio.play('hit'),true);audio.play('wood');const wood=ctx.voices.length;ctx.advance(.05);audio.play('wood');assert.equal(ctx.voices.length,wood);
  for(let i=0;i<120;i++){ctx.advance(.001);audio.play(requiredCues[i%requiredCues.length]);}
  const active=ctx.voices.filter(v=>!v.finished&&v.stopped>ctx.currentTime);assert.ok(active.length<=28,`active voices: ${active.length}`);
});
test('music schedules only a quarter-second ahead and never catches up after a long frame',async()=>{
  const {audio,ctx}=create();await audio.unlock();audio.tick(0,{scene:'game',paused:false});assert.ok(ctx.voices.length>0);
  assert.ok(ctx.voices.every(v=>v.started>=ctx.currentTime&&v.started<=ctx.currentTime+.251));
  const before=ctx.voices.length;for(let i=0;i<100;i++)audio.tick(99999,{scene:'game'});assert.equal(ctx.voices.length,before);
  ctx.advance(90);audio.tick(99999,{scene:'boss'});const next=ctx.voices.slice(before);assert.ok(next.length>0&&next.length<=8);assert.ok(next.every(v=>v.started>=90&&v.started<=90.251));
});
test('scene changes produce distinct menu, game, boss, mini, victory and defeat music',async()=>{
  const scores=new Set();for(const scene of ['menu','game','boss','mini','won','lost']){const {audio,ctx}=create();await audio.unlock();audio.tick(0,{scene});scores.add(JSON.stringify(signatures(ctx)));}
  assert.equal(scores.size,6);
});
test('music and effects switches silence only their own channels while mute stops all sound',async()=>{
  const {audio,ctx}=create();await audio.unlock();audio.setMusic(false);audio.tick(0,{scene:'game'});assert.equal(ctx.voices.length,0);assert.equal(audio.play('coin'),true);
  audio.setEffects(false);assert.equal(audio.play('gem'),false);assert.equal(ctx.voices.filter(v=>!v.finished).length,0);
  audio.setMusic(true);audio.tick(0,{scene:'game'});assert.ok(ctx.voices.some(v=>!v.finished));audio.setMuted(true);await settle();assert.ok(ctx.voices.every(v=>v.finished));assert.equal(audio.getLevel(),0);assert.equal(audio.play('win'),false);
  audio.setMuted(false);await settle();assert.equal(ctx.state,'running');audio.tick(0,{scene:'game'});assert.ok(ctx.voices.some(v=>!v.finished));
});
test('pause and focus suspend, remain silent and resume only after the first unlock',async()=>{
  const {audio,ctx}=create();await audio.unlock();audio.play('day');audio.setActive(false);await settle();assert.equal(ctx.state,'suspended');assert.equal(audio.play('ui'),false);assert.ok(ctx.voices.every(v=>v.finished));
  audio.setActive(true);await settle();assert.equal(ctx.state,'running');audio.tick(0,{scene:'game',paused:true});await settle();assert.equal(ctx.state,'suspended');
  audio.tick(0,{scene:'game',paused:false});await settle();assert.equal(ctx.state,'running');audio.tick(0,{scene:'game'});assert.ok(ctx.voices.some(v=>!v.finished));
});
test('rapid focus toggles settle in the latest desired state',async()=>{
  const {audio,ctx}=create();await audio.unlock();let finishSuspend;ctx.suspend=()=>new Promise(resolve=>{finishSuspend=()=>{ctx.state='suspended';resolve();};});
  audio.setActive(false);await settle();audio.setActive(true);finishSuspend();await settle();assert.equal(ctx.state,'running');
});
test('settings are validated, clamped, isolated from game saves and persisted',async()=>{
  const writes=[];const storage={getItem:key=>key==='emberwood.audio.v1'?JSON.stringify({muted:false,music:false,effects:true,volume:.34}):null,setItem:(...args)=>writes.push(args)};
  const {audio}=create({storage});assert.equal(audio.getState().volume,.34);assert.equal(audio.getState().music,false);audio.setVolume(9);assert.equal(audio.getState().volume,1);audio.setVolume(-2);assert.equal(audio.getState().volume,0);audio.setVolume(NaN);assert.equal(audio.getState().volume,0);
  audio.setEffects(false);audio.setMuted(true);assert.ok(writes.length);assert.ok(writes.every(([key])=>key==='emberwood.audio.v1'));const saved=JSON.parse(writes.at(-1)[1]);assert.equal(saved.effects,false);assert.equal(saved.muted,true);
});
test('malformed or blocked settings safely use the soft default volume and enabled sound',()=>{
  for(const raw of ['invalid','null','[]','{"volume":"loud","music":"false","effects":0,"muted":1}']){const {audio}=create({storage:{getItem:()=>raw,setItem:()=>{throw Error('blocked');}}});const state=audio.getState();assert.equal(state.music,true);assert.equal(state.effects,true);assert.equal(state.muted,false);assert.ok(state.volume>0&&state.volume<=.7);assert.doesNotThrow(()=>audio.setMusic(false));}
  assert.doesNotThrow(()=>create({storage:{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}}}));
});
test('level is actual analyser RMS from output and zero while muted or inactive',async()=>{
  const {audio,ctx}=create();await audio.unlock();assert.ok(Math.abs(audio.getLevel()-.125)<.0001);ctx.sample=.25;assert.ok(Math.abs(audio.getLevel()-.25)<.0001);
  ctx.sample=2;assert.equal(audio.getLevel(),1);audio.setActive(false);assert.equal(audio.getLevel(),0);
});
test('unsupported browsers and rejected context operations never throw or leak rejected promises',async()=>{
  const api=load();const unsupported=new api.SoundEngine();assert.equal(unsupported.getState().available,false);assert.equal(await unsupported.unlock(),false);assert.equal(unsupported.play('ui'),false);unsupported.tick(0);unsupported.setActive(false);unsupported.setMuted(true);unsupported.dispose();
  const {audio,ctx}=create();ctx.resume=async()=>{throw Error('denied');};assert.equal(await audio.unlock(),false);assert.equal(audio.getState().ready,false);assert.equal(audio.play('ui'),false);audio.setActive(false);audio.setActive(true);await settle();
  const broken=new api.SoundEngine({createContext:()=>{throw Error('audio unavailable');}});assert.equal(await broken.unlock(),false);assert.equal(broken.getState().available,false);
});
test('interrupted contexts and disposal are silent, safe and release all sources',async()=>{
  const {audio,ctx}=create();await audio.unlock();audio.play('levelUp');ctx.state='interrupted';assert.equal(audio.play('coin'),false);assert.equal(audio.getLevel(),0);assert.doesNotThrow(()=>audio.tick(0,{scene:'game'}));
  ctx.state='running';audio.dispose();await settle();assert.ok(ctx.voices.every(v=>v.finished));assert.equal(ctx.state,'closed');assert.equal(audio.getState().ready,false);assert.equal(audio.play('coin'),false);assert.equal(await audio.unlock(),false);assert.doesNotThrow(()=>audio.dispose());
});


test('cannon and flame have a soft low thump and a short filtered air texture',async()=>{
  const {audio,ctx}=create();await audio.unlock();audio.play('cannon');
  const pitches=ctx.voices.filter(v=>v.kind==='oscillator').flatMap(v=>v.frequency.events.map(e=>e.value));assert.ok(pitches.every(hz=>hz<200));
  ctx.advance(.5);const before=ctx.voices.length;audio.play('flame');const flame=ctx.voices.slice(before);const air=flame.find(v=>v.kind==='noise');assert.ok(air);assert.ok(air.connections[0].frequency.value<=900);assert.ok(air.stopped-air.started<=.25);
});
test('interruption clears queued tones so a later user gesture cannot replay old combat',async()=>{
  const {audio,ctx}=create();await audio.unlock();audio.play('win');ctx.state='interrupted';audio.tick(0,{scene:'game'});assert.ok(ctx.voices.every(v=>v.finished));assert.equal(await audio.unlock(),true);assert.ok(ctx.voices.every(v=>v.finished));
});
test('a first gesture after interruption clears old voices before the next animation frame',async()=>{
  const {audio,ctx}=create();await audio.unlock();audio.play('win');ctx.state='interrupted';
  assert.equal(await audio.unlock(),true);assert.ok(ctx.voices.every(v=>v.finished));
});
