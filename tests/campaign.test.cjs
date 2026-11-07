const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../emberwood.html'),'utf8');
const context=vm.createContext({window:{},console,Math,Set,Map,structuredClone});
vm.runInContext(html.match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1],context);
const {GameEngine,VERSION}=context.window.EmberwoodGame;
const plain=v=>JSON.parse(JSON.stringify(v));
const game=(config={})=>new GameEngine({seed:42,config:{enemySpeed:0,contactDamage:0,axeDamage:0,...config}});
const advance=(g,time)=>{for(let i=0;i<Math.ceil(time*60);i++)g.step(1/60);};
test('v2 campaign presents 100 days, three distinct weapons and daily combat choices',()=>{
  const g=game(),s=g.snapshot();assert.equal(VERSION,'2.1.0');assert.equal(s.campaign.totalDays,100);
  assert.equal(s.campaign.day,1);assert.deepEqual(Array.from(s.campaign.weapons,w=>w.id),['axe','spear','bow']);
  assert.equal(s.campaign.miniAvailable,true);
});
test('difficulty grows, unlocks variants and bosses without unbounded enemy counts',()=>{
  const g=game({enemySpeed:24,contactDamage:5});g.spawnWave(1);const first=g.state.enemies[0];
  g.spawnWave(50);assert.ok(g.state.enemies.length<=37);assert.ok(g.state.enemies.some(e=>e.variant==='boss'));
  assert.ok(g.state.enemies.some(e=>e.variant==='runner'));assert.ok(g.state.enemies.some(e=>e.variant==='brute'));
  const normal=g.state.enemies.find(e=>e.variant==='normal');assert.ok(normal.maxHp>first.maxHp);assert.ok(normal.speed>first.speed);assert.ok(normal.damage>first.damage);
  g.spawnWave(100);assert.ok(g.state.enemies.length<=37);
});
test('weapon upgrades debit once, improve combat and reject missing funds or maximum level',()=>{
  const g=game({axeDamage:10});g.state.coins=100000;g.state.gems=1000;
  for(const id of ['axe','spear','bow']){
    assert.equal(g.equipWeapon(id),true);const base=g.weaponStats(id),cost=g.weaponCost(id),coins=g.state.coins;
    assert.equal(g.upgradeWeapon(id),true);assert.equal(g.state.coins,coins-cost.coins);assert.ok(g.weaponStats(id).damage>base.damage);
    while(g.state.weapons[id]<10)assert.equal(g.upgradeWeapon(id),true);
    const bag=plain([g.state.coins,g.state.gems]);assert.equal(g.upgradeWeapon(id),false);assert.deepEqual(plain([g.state.coins,g.state.gems]),bag);
  }
  assert.equal(g.equipWeapon('invalid'),false);g.restart();g.state.coins=0;g.state.gems=0;assert.equal(g.upgradeWeapon('axe'),false);
});
test('spear pierces aligned enemies and bow releases damaging arrows',()=>{
  for(const id of ['spear','bow']){const g=game();g.equipWeapon(id);g.start();g.state.enemies=g.state.enemies.slice(0,2);
    g.state.enemies.forEach((e,i)=>Object.assign(e,{x:320+i*30,y:500,hp:100,maxHp:100,speed:0}));
    advance(g,1);assert.ok(g.state.enemies[0].hp<100,id+' must damage');if(id==='spear')assert.ok(g.state.enemies[1].hp<100,'piercing line');
  }
});
test('reselecting or switching weapons cannot bypass the shared attack cooldown',()=>{
  const g=game();g.equipWeapon('bow');g.start();g.state.enemies=g.state.enemies.slice(0,1);Object.assign(g.state.enemies[0],{x:320,y:500,hp:10000,maxHp:10000,speed:0});
  for(let i=0;i<60;i++){g.equipWeapon('spear');g.equipWeapon('bow');g.step(1/60);}
  assert.equal(g.state.enemies[0].hp,9986);
});
test('day end requires exactly one of three choices and keeps the next day locked',()=>{
  const g=game();g.start();for(const e of g.state.enemies)g.damage(e,1000);g.step(.05);
  assert.equal(g.state.phase,'day-choice');const request=plain(g.state.dayChoice);assert.equal(request.options.length,3);
  advance(g,20);assert.equal(g.state.wave,1);assert.equal(g.chooseDayReward({requestId:'stale',choiceId:request.options[0].id}),false);
  assert.equal(g.chooseDayReward({requestId:request.requestId,choiceId:request.options[0].id}),true);
  assert.equal(g.chooseDayReward({requestId:request.requestId,choiceId:request.options[0].id}),false);
  advance(g,4.1);assert.equal(g.state.wave,2);assert.equal(g.state.miniUsedToday,false);
});
test('save roundtrip preserves simulation, rejects malformed data and reissues pending choices',()=>{
  const g=game();g.start();g.state.coins=99;g.equipWeapon('bow');g.upgradeWeapon('bow');advance(g,.5);
  const save=g.exportSave(),h=game();assert.equal(h.importSave(save),true);assert.equal(h.state.coins,g.state.coins);assert.equal(h.state.equipped,'bow');assert.equal(h.state.elapsed,g.state.elapsed);
  const before=plain(h.getState());for(const bad of [null,{}, {...save,schema:1}, {...save,state:{...save.state,wave:101}}, {...save,state:{...save.state,coins:NaN}}, {...save,state:{...save.state,enemies:[{}]}}]){assert.equal(h.importSave(bad),false);assert.deepEqual(plain(h.getState()),before);}
  for(const e of g.state.enemies)g.damage(e,1000);g.step(.05);const old=plain(g.state.dayChoice);assert.equal(h.importSave(g.exportSave()),true);
  assert.notEqual(h.state.dayChoice.requestId,old.requestId);assert.equal(h.chooseDayReward({requestId:old.requestId,choiceId:old.options[0].id}),false);
  assert.equal(h.chooseDayReward({requestId:h.state.dayChoice.requestId,choiceId:h.state.dayChoice.options[0].id}),true);
  const invalidEffect=g.exportSave();invalidEffect.state.effects=[{type:'impact',x:1,y:1,radius:-10,age:0,ttl:100}];assert.equal(game().importSave(invalidEffect),false);
});
test('combat mini pauses campaign, consumes one daily attempt, rewards once and survives save',()=>{
  const g=game();g.start();assert.equal(g.startMiniGame('targets'),true);const id=g.miniGame.snapshot().id,time=g.state.elapsed;
  g.pause('miniGame',true);g.pause('inactive',true);advance(g,1);assert.equal(g.miniGame.snapshot().elapsed,0);g.pause('inactive',false);
  advance(g,.5);assert.ok(g.miniGame.snapshot().elapsed>0);assert.equal(g.state.elapsed,time);
  assert.equal(g.miniInput({gameId:'stale',action:'shoot',x:1,y:1}),false);
  const h=game();assert.equal(h.importSave(g.exportSave()),true);assert.ok(h.miniGame);assert.notEqual(h.miniGame.snapshot().id,id);
  const coins=h.state.coins;advance(h,30);const paid=h.state.coins;assert.ok(paid>=coins);assert.equal(h.state.miniRewardPaid,true);
  const restored=game();assert.equal(restored.importSave(h.exportSave()),true);advance(restored,3);assert.equal(restored.state.coins,paid);
  assert.equal(h.closeMiniGame(h.miniGame.snapshot().id),true);assert.equal(h.startMiniGame('dodge'),false);
});
test('resuming dodge clears held movement and rejects a mini from another campaign day',()=>{
  const g=game();g.startMiniGame('dodge');const id=g.miniGame.snapshot().id;
  g.miniInput({gameId:id,action:'move',x:1,y:0});advance(g,.1);const saved=g.exportSave(),h=game();
  assert.equal(h.importSave(saved),true);const x=h.miniGame.snapshot().player.x;advance(h,.1);assert.equal(h.miniGame.snapshot().player.x,x);
  saved.mini.day=2;assert.equal(game().importSave(saved),false);
});
test('real combat can win only after all 100 days and emits one result',()=>{
  const g=game({enemyHP:1,enemyHPGrowth:0,enemySpeed:220,axeDamage:10000,axeRadius:150,axePeriod:.15,intermission:.05,initialWood:0,initialDeposit:0});g.start();
  for(let i=0;i<150000&&g.state.phase!=='won';i++){
    if(g.state.dayChoice){const q=g.state.dayChoice;g.chooseDayReward({requestId:q.requestId,choiceId:q.options[0].id});}
    g.step(.05);
  }
  assert.equal(g.state.wave,100);assert.equal(g.state.phase,'won');assert.equal(g.drainEvents().filter(e=>e.type==='result').length,1);
  advance(g,2);assert.equal(g.drainEvents().filter(e=>e.type==='result').length,0);
});
