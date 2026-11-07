// 2.3 moves and effects: automatic spin, dash and special buttons, wings, crown,
// the hero's emotions and poses, and schema 4 saves.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../emberwood.html'),'utf8');
const context=vm.createContext({window:{},console,Math,Set,Map,structuredClone});
vm.runInContext(html.match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1],context);
const {GameEngine,CONFIG}=context.window.EmberwoodGame;
const plain=v=>JSON.parse(JSON.stringify(v));
const game=(config={})=>new GameEngine({seed:11,config:{enemySpeed:0,contactDamage:0,axeDamage:10,orbitBase:0,...config}});
const advance=(g,time,dt=1/60)=>{for(let i=0;i<Math.ceil(time/dt);i++)g.step(dt);};
/** Running game on a given day with a hand-placed set of enemies (dx, dy relative to the player).
    A motionless, harmless enemy far below keeps the day from ending while a test runs. */
function scene(day,offsets=[],config={}){
  const g=game(config);g.start();g.spawnWave(day);g.state.milestoneRequest=null;const p=g.state.player,base=g.dayBase(day);
  g.state.enemies=[...offsets,[0,650]].map(([dx,dy])=>Object.assign(g.makeEnemy('normal',p.x+dx,p.y+dy,base),{hp:1e6,maxHp:1e6,speed:0,damage:0}));g.state.waveTotal=g.state.enemies.length;return g;
}

test('from day 10 every fourth attack while running becomes a spin slash; standing still never spins',()=>{
  const spins=g=>g.state.effects.filter(e=>e.type==='spin').length;
  const early=scene(9,[[60,0]]);early.state.player.moving=true;for(let i=0;i<8;i++)early.countAttack();assert.equal(spins(early),0);
  const still=scene(10,[[60,0]]);for(let i=0;i<9;i++)still.countAttack();assert.equal(spins(still),0,'no spin while standing');
  still.state.player.moving=true;still.countAttack();assert.equal(spins(still),1,'built-up attacks spin on the first running attack');
  const g=scene(10,[[60,0],[0,-90],[200,0]]);const [near,above,far]=g.state.enemies,x=near.x;g.state.player.moving=true;
  for(let i=1;i<=8;i++){g.countAttack();assert.equal(spins(g),Math.floor(i/CONFIG.spinEvery),`after ${i} attacks`);}
  assert.ok(near.hp<1e6&&above.hp<1e6,'spin hits all around');assert.equal(far.hp,1e6,'but not beyond its radius');assert.ok(near.x>x,'and knocks back');
  assert.ok(g.drainEvents().some(e=>e.type==='sound'&&e.name==='spin'));
});

test('dash is locked before day 20, then bursts forward, hits along the way once and cools down',()=>{
  const locked=scene(19,[[60,0]]);locked.setInput(1,0);assert.equal(locked.dash(),false);
  const g=scene(20,[[70,0],[70,90],[300,0]]);const p=g.state.player,x=p.x,[inPath,aside,far]=g.state.enemies;g.setInput(1,0);
  assert.equal(g.dash(),true);g.setInput(0,0);assert.equal(g.dash(),false,'one dash at a time');
  assert.equal(g.hurtPlayer(50),false,'i-frames while dashing');advance(g,CONFIG.dashTime+.05);
  assert.ok(Math.abs(p.x-(x+CONFIG.dashDistance))<1,`moved ${p.x-x}`);assert.ok(inPath.hp<1e6);assert.equal(aside.hp,1e6);assert.equal(far.hp,1e6);
  const hit=inPath.hp;advance(g,.2);assert.equal(inPath.hp,hit,'each enemy is hit once per dash');
  assert.equal(g.dash(),false,'cooling down');advance(g,CONFIG.dashCooldown);g.setInput(-1,0);assert.equal(g.dash(),true);
  const s=g.snapshot();assert.equal(s.player.pose,'dash');assert.equal(s.hud.moves.dash.active,true);
});

test('with no input the dash aims at the nearest enemy, and wings make it longer',()=>{
  const g=scene(20,[[0,-100]]);const p=g.state.player,y=p.y;assert.equal(g.dash(),true);advance(g,.3);assert.ok(p.y<y-80,'dashed up toward the enemy');
  const w=scene(30,[]);const q=w.state.player,x=q.x;w.setInput(1,0);w.dash();w.setInput(0,0);advance(w,.3);
  assert.ok(Math.abs(q.x-x-CONFIG.dashDistance*(1+CONFIG.wingsDash))<1||q.x===CONFIG.world.right,'wings add 30%');
});

test('special charges from kills, storms everything nearby, and level 2 arrives on day 80',()=>{
  const locked=scene(39,[]);locked.state.moves.charge=1;assert.equal(locked.special(),false);
  const g=scene(40,[]);const p=g.state.player,base=g.dayBase(40);
  for(let i=0;i<CONFIG.specialKills;i++){const e=g.makeEnemy('normal',p.x+500,p.y,base);g.state.enemies.push(e);g.damage(e,1e9);}
  assert.equal(g.state.moves.charge,1);assert.equal(g.snapshot().hud.moves.special.charge,1);
  const near=Object.assign(g.makeEnemy('normal',p.x+200,p.y,base),{hp:1e9,maxHp:1e9,speed:0}),far=Object.assign(g.makeEnemy('normal',p.x+30,p.y+CONFIG.specialRadius+60,base),{hp:1e9,maxHp:1e9,speed:0});
  g.state.enemies=[near,far];assert.equal(g.special(),true);assert.equal(g.state.moves.charge,0);assert.equal(g.special(),false);
  assert.equal(g.hurtPlayer(99),false,'untouchable during the storm');
  const victim=g.makeEnemy('normal',p.x+600,p.y,base);g.state.enemies.push(victim);g.damage(victim,1e9);assert.equal(g.state.moves.charge,0,'no recharge mid-storm');
  advance(g,CONFIG.specialTime+.1);assert.equal(g.state.moves.special,null);
  const ticks=Math.round((1e9-near.hp)/g.weaponStats().damage);assert.ok(ticks>=9&&ticks<=11,`${ticks} ticks`);assert.equal(far.hp,1e9);
  const late=scene(80,[]);late.state.moves.charge=1;late.special();assert.equal(late.state.moves.special.level,2);assert.equal(late.state.moves.special.duration,CONFIG.specialTime2);
});

test('wings speed the hero up from day 30 and the crown boosts coins and gems from day 50',()=>{
  const walk=day=>{const g=scene(day,[]);const p=g.state.player,x=p.x;g.setInput(1,0);advance(g,1);return p.x-x;};
  assert.ok(Math.abs(walk(30)/walk(29)-(1+CONFIG.wingsSpeed))<.01);
  for(const [day,coins]of [[49,10],[50,15]]){const g=scene(day,[[400,0]]);const p=g.state.player,before=g.state.coins;g.state.pickups=[{id:'c',type:'coin',amount:10,x:p.x,y:p.y,phase:0}];g.collectPickups(.016);assert.equal(g.state.coins-before,coins,`day ${day}`);}
  const s=scene(50,[]).snapshot();assert.equal(s.player.wings,true);assert.equal(s.player.crown,true);
  const t=scene(29,[]).snapshot();assert.equal(t.player.wings,false);assert.equal(t.player.crown,false);
});

test('the hero shows emotions and poses that match what is happening',()=>{
  const g=scene(10,[[400,0]],{contactDamage:5});const view=()=>g.snapshot().player;
  assert.equal(view().pose,'idle');g.setInput(1,0);g.step(.05);assert.equal(view().pose,'run');g.setInput(0,0);
  g.hurtPlayer(5);assert.equal(view().emotion,'surprised');advance(g,1);assert.equal(view().emotion,null);
  g.state.player.hp=g.state.player.maxHp*.2;assert.equal(view().emotion,'sad','low health');g.state.player.hp=g.state.player.maxHp;
  g.state.player.moving=true;for(let i=0;i<CONFIG.spinEvery;i++)g.countAttack();assert.equal(view().pose,'spin');g.state.player.moving=false;
  g.state.enemies=[];g.step(.05);assert.equal(g.state.phase,'day-choice');assert.equal(view().emotion,'happy');
  const b=game({intermission:.05});b.start();b.state.wave=9;for(const e of b.state.enemies)b.damage(e,1e9);b.step(.05);const q=b.state.dayChoice;b.chooseDayReward({requestId:q.requestId,choiceId:q.options[0].id});advance(b,.2,.05);
  assert.equal(b.state.wave,10);assert.equal(b.snapshot().player.emotion,'angry','a boss day starts fierce');
  b.finish(false);assert.equal(b.snapshot().player.emotion,'sad');const w=scene(1,[]);w.finish(true);assert.equal(w.snapshot().player.pose,'victory');assert.equal(w.snapshot().player.emotion,'happy');
});

test('current saves keep an active dash and storm; 2.2 saves migrate',()=>{
  const g=scene(40,[[70,0]]);g.setInput(1,0);g.dash();g.state.moves.charge=1;g.special();g.step(.05);
  const save=g.exportSave();assert.equal(save.schema,5);const h=game();assert.equal(h.importSave(save),true);
  assert.ok(h.state.moves.dash);assert.ok(h.state.moves.special);advance(h,CONFIG.specialTime+.2);assert.equal(h.state.moves.dash,null);assert.equal(h.state.moves.special,null);
  const old=plain(save);old.schema=3;old.version='2.2.0';delete old.state.moves;delete old.state.emotion;delete old.state.player.facing;delete old.state.arsenal;
  for(const id of ['sword','staff','hammer','dagger','magic','gun','shield'])delete old.state.weapons[id];for(const e of old.state.enemies)delete e.ringReady;
  const k=game();assert.equal(k.importSave(old),true);assert.equal(k.state.moves.charge,0);assert.equal(k.state.player.facing,1);
  for(const bad of [{charge:2},{dash:{fromX:NaN}},{special:{t:0,duration:1,tick:0,level:3}}]){const broken=plain(save);Object.assign(broken.state.moves,bad);assert.equal(game().importSave(broken),false,JSON.stringify(bad));}
});
