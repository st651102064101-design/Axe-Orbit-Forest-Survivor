const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../emberwood.html'),'utf8');
const script=html.match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1];
const scope=vm.createContext({window:{},console,Math,Set,Map,structuredClone});
vm.runInContext(script,scope,{filename:'emberwood-gameplay.js'});
const plain=v=>JSON.parse(JSON.stringify(v));
function game(config={}){assert.equal(typeof scope.window.EmberwoodGame?.GameEngine,'function','GameEngine must implement the gameplay handoff');return new scope.window.EmberwoodGame.GameEngine({seed:42,config:{enemySpeed:0,contactDamage:0,axeDamage:0,orbitBase:0,...config}});}
function advance(g,seconds){for(let i=0;i<Math.ceil(seconds*60);i++)g.step(1/60);}
function enemy(id,x,y,hp=100){return {id,x,y,hp,maxHp:hp,speed:0,alive:true,phase:0,flash:0,axeReadyAt:-100,vx:0,vy:0,burn:null};}
function ready(g){g.start();g.state.player.x=g.state.site.x;g.state.player.y=g.state.site.y;advance(g,.7);assert.equal(g.state.phase,'choosing');return plain(g.state.buildRequest);}
function build(g,type='cannon'){const request=ready(g);assert.equal(g.chooseTower({...request,towerType:type}),true);return request;}

test('first movement starts the run and diagonal movement has the same speed',()=>{
  const g=game();g.step(.05);assert.equal(g.state.phase,'ready');assert.equal(g.state.elapsed,0);
  const {x,y}=g.state.player;g.setInput(1,1);advance(g,1);
  assert.equal(g.state.phase,'running');assert.ok(Math.abs(Math.hypot(g.state.player.x-x,g.state.player.y-y)-145)<.01);
});
test('movement is clamped to the world and a long frame cannot teleport',()=>{
  const g=game();g.setInput(1,0);const x=g.state.player.x;g.step(100);
  assert.ok(g.state.player.x-x<=7.251);advance(g,5);assert.equal(g.state.player.x,475);
  g.setInput(-1,0);advance(g,5);assert.equal(g.state.player.x,65);
});
test('wood transfer conserves inventory, stops at 30, and opens one request',()=>{
  const g=game();g.start();g.state.player.x=216;g.state.player.y=650;
  advance(g,.5);assert.deepEqual([g.state.bagWood,g.state.site.deposited],[7,29]);assert.equal(g.drainEvents().filter(e=>e.type==='build:open').length,0);
  advance(g,.12);assert.deepEqual([g.state.bagWood,g.state.site.deposited],[6,30]);
  assert.equal(g.drainEvents().filter(e=>e.type==='build:open').length,1);advance(g,10);
  assert.equal(g.drainEvents().filter(e=>e.type==='build:open').length,0);assert.equal(g.state.bagWood+g.state.site.deposited,36);
});
test('empty bags and distance cannot fill a construction site',()=>{
  const g=game({initialWood:0});g.start();g.state.player.x=216;g.state.player.y=650;advance(g,2);
  assert.deepEqual([g.state.bagWood,g.state.site.deposited],[0,23]);assert.equal(g.state.phase,'running');
  const far=game();far.start();advance(far,2);assert.deepEqual([far.state.bagWood,far.state.site.deposited],[13,23]);assert.equal(far.interactSite('site-1'),false);
});
test('construction never overfills or debits more logs than remain in the bag',()=>{
  const g=game({initialWood:2,initialDeposit:29});ready(g);
  assert.deepEqual([g.state.bagWood,g.state.site.deposited],[1,30]);
});
for(const type of ['cannon','archer','flame'])test(`a valid ${type} choice builds exactly one tower without charging the bag again`,()=>{
  const g=game();const fire=plain(g.state.fire),request=ready(g),bag=g.state.bagWood;
  assert.equal(g.chooseTower({...request,towerType:type}),true);assert.equal(g.chooseTower({...request,towerType:type}),false);
  assert.equal(g.state.towers.length,1);assert.equal(g.state.towers[0].type,type);assert.equal(g.state.towers[0].level,1);
  assert.deepEqual([g.state.towers[0].x,g.state.towers[0].y],[216,650]);assert.deepEqual(plain(g.state.fire),fire);
  assert.deepEqual([g.state.bagWood,g.state.site.deposited,g.state.site.required],[bag,0,60]);
});
test('stale, wrong-site and unknown-type choices cannot spend a ready construction',()=>{
  const g=game();const request=ready(g);
  for(const invalid of [{...request,requestId:'stale',towerType:'cannon'},{...request,siteId:'other',towerType:'cannon'},{...request,towerType:'unknown'}])assert.equal(g.chooseTower(invalid),false);
  assert.equal(g.state.towers.length,0);assert.equal(g.state.site.deposited,30);assert.equal(g.state.phase,'choosing');
});
test('60 deposited logs upgrade the existing tower once and may change its type',()=>{
  const g=game();const oldRequest=build(g);g.state.bagWood=60;g.state.player.x=g.state.site.x;g.state.player.y=g.state.site.y;
  advance(g,5.1);assert.equal(g.state.phase,'choosing');const request=plain(g.state.buildRequest);
  assert.notEqual(request.requestId,oldRequest.requestId);assert.equal(g.chooseTower({...request,towerType:'archer'}),true);
  assert.equal(g.state.towers.length,1);assert.deepEqual([g.state.towers[0].type,g.state.towers[0].level,g.state.bagWood,g.state.site.deposited,g.state.site.required],['archer',2,0,0,90]);
});
test('nested menu pauses and inactivity freeze all clocks and motion until all reasons clear',()=>{
  const g=game();g.setInput(1,0);g.pause('settings',true);g.pause('help',true);const before=plain(g.getState());
  advance(g,5);assert.deepEqual(plain(g.getState()),before);g.pause('help',false);const x=g.state.player.x;advance(g,1);assert.equal(g.state.player.x,x);
  g.pause('settings',false);g.setInput(1,0);g.step(100);assert.ok(g.state.player.x-x<=7.251);
  g.pause('inactive',true);const time=g.state.elapsed;advance(g,2);assert.equal(g.state.elapsed,time);
});
test('axe deals one hit during its sweep rather than damage every frame',()=>{
  const g=game({axeDamage:10});g.start();g.state.enemies=[enemy('target',309,504)];
  g.step(.05);assert.equal(g.state.enemies[0].hp,90);advance(g,.4);assert.equal(g.state.enemies[0].hp,90);
  advance(g,1.6);assert.ok(g.state.enemies[0].hp<=80);
});
test('contact i-frames prevent stacked per-frame damage and fire does not heal',()=>{
  const g=game({contactDamage:5});g.start();g.state.enemies=[enemy('contact',g.state.player.x+10,g.state.player.y)];
  g.step(.05);assert.equal(g.state.player.hp,95);advance(g,.3);assert.equal(g.state.player.hp,95);
  g.state.enemies=[enemy('far',440,250)];g.state.player.x=g.state.fire.x;g.state.player.y=g.state.fire.y;advance(g,2);assert.equal(g.state.player.hp,95);
});
test('magnet pickups update resources once and cannot be collected twice',()=>{
  const g=game();g.start();const p=g.state.player;
  g.state.pickups=[{id:'w',type:'wood',amount:7,x:p.x+30,y:p.y},{id:'c',type:'coin',amount:3,x:p.x-30,y:p.y},{id:'gem',type:'gem',amount:1,x:p.x,y:p.y+30}];
  advance(g,.4);assert.deepEqual([g.state.bagWood,g.state.coins,g.state.gems],[20,6,1]);assert.equal(g.state.pickups.length,0);
  advance(g,.4);assert.deepEqual([g.state.bagWood,g.state.coins,g.state.gems],[20,6,1]);
});
test('cannon impact damages both enemies in its blast area',()=>{
  const g=game();g.start();g.state.enemies=[enemy('a',200,450),enemy('b',225,450)];g.state.towers=[{id:'t',type:'cannon',x:200,y:600,level:1,cooldown:0}];
  advance(g,.6);assert.deepEqual(g.state.enemies.map(e=>e.hp),[82,82]);
});
test('an archer projectile damages only its single target',()=>{
  const g=game();g.start();g.state.enemies=[enemy('a',200,450),enemy('b',225,450)];g.state.towers=[{id:'t',type:'archer',x:200,y:600,level:1,cooldown:0}];
  advance(g,.6);assert.deepEqual(g.state.enemies.map(e=>e.hp),[68,100]);
});
test('flame applies timed burning ticks that stop after expiration',()=>{
  const g=game();g.start();g.state.enemies=[enemy('a',200,450)];g.state.towers=[{id:'t',type:'flame',x:200,y:600,level:1,cooldown:0}];
  g.step(.05);assert.equal(g.state.enemies[0].hp,95);assert.ok(g.state.enemies[0].burn);g.state.towers=[];
  advance(g,.3);assert.equal(g.state.enemies[0].hp,95);advance(g,.25);assert.equal(g.state.enemies[0].hp,92);
  advance(g,3);const hp=g.state.enemies[0].hp;assert.equal(hp,83);advance(g,1);assert.equal(g.state.enemies[0].hp,hp);
});
test('flame can damage an acquired target south of the tower, inside its shown range',()=>{
  const g=game();g.start();g.state.enemies=[enemy('south',216,755)];g.state.towers=[{id:'t',type:'flame',x:216,y:650,level:1,cooldown:0}];
  advance(g,.3);assert.ok(g.state.enemies[0].hp<100,'an in-range south-side target must not cause endless misses');
});
test('expired projectiles and dead targets cannot inflict ghost damage',()=>{
  const g=game();g.start();g.state.enemies=[enemy('live',200,450),{...enemy('dead',200,450),alive:false,hp:0}];
  g.state.projectiles=[{id:'p1',type:'arrow',targetId:'dead',x:200,y:450,damage:999,speed:500,age:0,ttl:2},{id:'p2',type:'cannon',targetId:'live',x:200,y:450,damage:999,speed:500,age:0,ttl:.001,radius:80}];
  g.step(.05);assert.equal(g.state.enemies.find(e=>e.id==='live').hp,100);assert.equal(g.state.projectiles.length,0);
});
test('a built tower is solid to the player',()=>{
  const g=game();build(g);g.state.player.x=216;g.state.player.y=590;g.setInput(0,1);advance(g,1);
  assert.ok(g.state.player.y<=600);assert.ok(Math.hypot(g.state.player.x-216,g.state.player.y-650)>=49);
});
test('a configurable short campaign clears every encounter and emits victory exactly once',()=>{
  const g=game({waves:5,waveGrowth:4,enemyHP:1,enemyHPGrowth:0,enemySpeed:200,axeDamage:1000,axeRadius:120,axePeriod:.2,intermission:.1,initialWood:0,initialDeposit:0});g.start();
  for(let i=0;i<10800&&g.state.phase!=='won';i++){if(g.state.dayChoice){const q=g.state.dayChoice;g.chooseDayReward({requestId:q.requestId,choiceId:q.options[0].id});}if(g.state.milestoneRequest)g.ackMilestone({requestId:g.state.milestoneRequest.requestId});g.step(1/60);}
  assert.equal(g.state.phase,'won');assert.equal(g.state.wave,5);assert.equal(g.state.kills,85);
  assert.equal(g.drainEvents().filter(e=>e.type==='result').length,1);advance(g,5);assert.equal(g.drainEvents().filter(e=>e.type==='result').length,0);
});
test('fatal damage ends the run immediately and cannot keep advancing',()=>{
  const g=game({contactDamage:5});g.start();g.state.player.hp=4;g.state.enemies=[enemy('fatal',g.state.player.x,g.state.player.y)];
  g.step(.05);assert.equal(g.state.phase,'lost');assert.equal(g.state.player.hp,0);const ended=plain(g.getState());advance(g,5);assert.deepEqual(plain(g.getState()),ended);
  assert.equal(g.drainEvents().filter(e=>e.type==='result').length,1);
});
test('restart clears entities, requests, inputs and clocks; an old request stays invalid',()=>{
  const g=game();const request=ready(g);g.pause('settings',true);g.restart();
  assert.deepEqual([g.state.phase,g.state.wave,g.state.kills,g.state.elapsed,g.state.bagWood,g.state.site.deposited],['ready',1,0,0,13,23]);
  assert.equal(g.state.enemies.length,9);assert.equal(g.state.projectiles.length,0);assert.equal(g.state.towers.length,0);assert.equal(g.state.buildRequest,null);assert.equal(g.getState().paused,false);
  assert.equal(g.chooseTower({...request,towerType:'cannon'}),false);const x=g.state.player.x;advance(g,1);assert.equal(g.state.player.x,x);assert.equal(g.state.elapsed,0);
});
