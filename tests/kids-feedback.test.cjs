const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../emberwood.html'),'utf8');
const context=vm.createContext({window:{},console,Math,Set,Map,structuredClone});
vm.runInContext(html.match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1],context);
const {GameEngine,VERSION}=context.window.EmberwoodGame;
const game=()=>new GameEngine({seed:45,config:{enemySpeed:0,contactDamage:0,axeDamage:0}});
const cues=g=>Array.from(g.drainEvents().filter(e=>e.type==='sound'),e=>e.name);
test('combat and inventory emit distinct audio feedback without charging resources',()=>{
  const g=game();g.start();g.drainEvents();const e=g.state.enemies[0];g.damage(e,1);assert.ok(cues(g).includes('hit'));
  g.damage(e,999);assert.ok(cues(g).includes('enemyDown'));
  const p=g.state.player;g.state.pickups=[{id:'coin',type:'coin',amount:3,x:p.x,y:p.y,phase:0}];g.collectPickups(.05);assert.equal(g.state.coins,6);assert.ok(cues(g).includes('coin'));
  g.state.player.x=g.state.site.x;g.state.player.y=g.state.site.y;g.depositWood(.1);assert.ok(cues(g).includes('deposit'));
});
test('building, weapon upgrades, daily choice and ending each have sound feedback',()=>{
  const g=game();g.start();g.state.site.deposited=30;g.requestBuild();g.drainEvents();g.chooseTower({...g.state.buildRequest,towerType:'cannon'});assert.ok(cues(g).includes('build'));
  g.state.coins=100;g.upgradeWeapon('bow');assert.ok(cues(g).includes('upgrade'));
  g.state.enemies=[];g.step(.05);assert.ok(cues(g).includes('day'));const q=g.state.dayChoice;g.chooseDayReward({requestId:q.requestId,choiceId:q.options[0].id});assert.ok(cues(g).includes('confirm'));
  g.finish(true);assert.ok(cues(g).includes('win'));g.finish(true);assert.equal(cues(g).length,0);
});
test('mini shot outcomes and rewards provide visual reward data and sound once',()=>{
  const g=game();g.startMiniGame('targets');g.drainEvents();const id=g.miniGame.id,target=g.miniGame.snapshot().targets[0];
  g.miniInput({gameId:id,action:'shoot',x:target.x,y:target.y});assert.ok(cues(g).includes('targetHit'));
  for(let i=0;i<500;i++)g.step(.05);
  const mini=g.snapshot().miniGame;assert.ok(Array.isArray(mini.rewards));assert.ok(mini.rewards.some(r=>r.type==='coin'&&r.amount>0));assert.ok(cues(g).some(c=>c==='miniWin'||c==='miniEnd'));
  const before=g.state.coins;g.step(.05);assert.equal(g.state.coins,before);assert.equal(cues(g).length,0);
});
test('2.3 accepts existing 2.0 / 2.1 (schema 2) saves and clears new optional reward decorations safely',()=>{
  assert.equal(VERSION,'2.3.0');
  for(const version of ['2.0.0','2.1.0']){
    const g=game(),save=g.exportSave();save.schema=2;save.version=version;delete save.state.miniRewards;
    for(const key of ['combo','milestoneSeen','milestoneRequest','enemyShots','moves','emotion'])delete save.state[key];delete save.state.perks.haste;delete save.state.player.facing;
    for(const e of save.state.enemies)for(const key of ['family','baseHp','baseSpeed','baseDamage','clock','clock2','armed','facing','blocked','windup','charge','blink','blinkX','blinkY','summoned','stage','split'])delete e[key];
    const h=game();assert.equal(h.importSave(save),true,version);assert.equal(h.state.bagWood,g.state.bagWood);
    const out=h.exportSave();assert.equal(out.version,'2.3.0');assert.equal(out.schema,4);assert.equal(out.state.moves.charge,0);assert.equal(out.state.perks.haste,0);assert.equal(out.state.milestoneSeen,1);
  }
});
test('an accurate target hit sounds correct even when previous misses keep total score at zero',()=>{
  const g=game();g.startMiniGame('targets');const id=g.miniGame.id;g.drainEvents();
  for(let i=0;i<5;i++)g.miniInput({gameId:id,action:'shoot',x:0,y:0});g.drainEvents();
  const target=g.miniGame.snapshot().targets[0];g.miniInput({gameId:id,action:'shoot',x:target.x,y:target.y});
  assert.equal(g.miniGame.snapshot().score,0);assert.deepEqual(cues(g),['targetHit']);
});
