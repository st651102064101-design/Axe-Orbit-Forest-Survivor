// 2.2 progression: faster attacks every day, combos, "something new" every 5 days,
// new enemy families with their behaviours, scenes, and schema 3 saves.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../emberwood.html'),'utf8');
const context=vm.createContext({window:{},console,Math,Set,Map,structuredClone});
vm.runInContext(html.match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1],context);
const {GameEngine,CONFIG}=context.window.EmberwoodGame;
const plain=v=>JSON.parse(JSON.stringify(v));
const game=(config={})=>new GameEngine({seed:7,config:{enemySpeed:0,contactDamage:0,axeDamage:0,orbitBase:0,...config}});
const advance=(g,time,dt=1/60)=>{for(let i=0;i<Math.ceil(time/dt);i++)g.step(dt);};
/** A lone enemy of a given family placed relative to the player. */
function lone(g,variant,dx,dy,extra={}){
  const p=g.state.player,base=g.dayBase(g.state.wave),e=g.makeEnemy(variant,p.x+dx,p.y+dy,base,extra.family||null);
  Object.assign(e,extra);g.state.enemies=[e];g.state.waveTotal=1;return e;
}

test('attacks get faster every day survived and never drop below the minimum interval',()=>{
  const g=game();let previous=Infinity;
  for(const day of [1,2,10,25,50,75,100]){g.state.wave=day;const interval=g.weaponStats('axe').interval;assert.ok(interval<previous,`day ${day} is faster`);previous=interval;}
  g.state.wave=100;g.state.weapons.axe=10;g.state.perks.haste=CONFIG.hasteMax;g.state.combo.stacks=CONFIG.comboMax;
  assert.ok(g.weaponStats('axe').interval>=CONFIG.minAttackInterval);
  for(const id of ['spear','bow'])assert.ok(g.weaponStats(id).interval>=CONFIG.minAttackInterval);
  g.state.wave=1;g.state.combo.stacks=0;g.state.perks.haste=0;g.state.weapons.axe=1;assert.equal(g.attackSpeed(),1);
});

test('player hits build a combo that speeds attacks up, then decays when hits stop',()=>{
  const g=game();g.start();const e=lone(g,'normal',300,0,{hp:1e6,maxHp:1e6});const base=g.weaponStats('axe').interval;
  for(let i=0;i<12;i++)g.damage(e,1,'player');assert.equal(g.state.combo.stacks,CONFIG.comboMax);
  assert.ok(g.weaponStats('axe').interval<base,'combo shortens the interval');
  const events=g.drainEvents().filter(x=>x.type==='sound').map(x=>x.name);assert.ok(events.includes('combo')&&events.includes('comboMax'));
  g.damage(e,1,'tower');g.damage(e,1);assert.equal(g.state.combo.stacks,CONFIG.comboMax,'towers and burns do not add combo');
  advance(g,CONFIG.comboWindow+.2);assert.ok(g.state.combo.stacks<CONFIG.comboMax,'decays after the window');
  advance(g,10);assert.equal(g.state.combo.stacks,0);assert.equal(g.snapshot().hud.combo,0);
});

test('the haste perk raises attack speed and stops being offered at its cap',()=>{
  const g=game();g.start();for(const e of g.state.enemies)g.damage(e,1e6);g.step(.05);
  const q=g.state.dayChoice;assert.ok(q);q.options[0]={...q.options[0],id:'haste'};
  const before=g.attackSpeed();assert.equal(g.chooseDayReward({requestId:q.requestId,choiceId:'haste'}),true);
  assert.equal(g.state.perks.haste,CONFIG.hasteStep);assert.ok(g.attackSpeed()>before);
  g.state.perks.haste=CONFIG.hasteMax;g.state.phase='running';g.state.enemies=[];g.step(.05);
  assert.ok(g.state.dayChoice.options.every(o=>o.id!=='haste'),'capped perk is not offered again');
});

test('every fifth day brings exactly one milestone card, and the day waits for it',()=>{
  const g=game({intermission:.05});g.start();const seen=[];
  for(let day=1;day<100;day++){
    for(const e of g.state.enemies)g.damage(e,1e7);g.step(.05);
    const q=g.state.dayChoice;assert.ok(q,`day ${day} ends with a choice`);g.chooseDayReward({requestId:q.requestId,choiceId:q.options[0].id});
    advance(g,.2,.05);assert.equal(g.state.wave,day+1);
    const next=day+1,request=g.state.milestoneRequest;
    if(next%5===0){
      assert.ok(request,`milestone on day ${next}`);assert.equal(request.day,next);assert.ok(request.items.length>=1);
      const t=g.state.elapsed;advance(g,1,.05);assert.equal(g.state.elapsed,t,'the day is frozen behind the card');
      g.setInput(1,0);assert.deepEqual(plain(g.input),{x:0,y:0},'no movement behind the card');
      assert.equal(g.ackMilestone({requestId:'stale'}),false);assert.equal(g.ackMilestone({requestId:request.requestId}),true);
      assert.equal(g.ackMilestone({requestId:request.requestId}),false,'acknowledged once');seen.push(next);
      assert.equal(g.openMilestone(next),false,'never shown twice');
    }else assert.equal(request,null,`no milestone on day ${next}`);
  }
  assert.deepEqual(seen,Array.from({length:20},(_,i)=>(i+1)*5));
});

test('a pending milestone survives save and load with a fresh request id',()=>{
  const g=game({intermission:.05});g.start();g.state.wave=4;for(const e of g.state.enemies)g.damage(e,1e7);g.step(.05);
  const q=g.state.dayChoice;g.chooseDayReward({requestId:q.requestId,choiceId:q.options[0].id});advance(g,.2,.05);
  const old=plain(g.state.milestoneRequest);assert.equal(old.day,5);
  const h=game();assert.equal(h.importSave(g.exportSave()),true);assert.equal(h.state.milestoneRequest.day,5);
  assert.notEqual(h.state.milestoneRequest.requestId,old.requestId);assert.ok(h.drainEvents().some(e=>e.type==='milestone:open'));
  assert.equal(h.ackMilestone({requestId:old.requestId}),false);assert.equal(h.ackMilestone({requestId:h.state.milestoneRequest.requestId}),true);
  const k=game();assert.equal(k.importSave(h.exportSave()),true);assert.equal(k.state.milestoneRequest,null);assert.equal(k.openMilestone(5),false);
});

test('each new family arrives on its day, keeps older families, and bosses carry their family',()=>{
  const g=game(),first={runner:5,brute:15,bat:25,bomber:35,archer:45,shield:55,slime:65,ghost:75,shaman:85,golden:95};
  for(const [variant,day]of Object.entries(first)){
    g.spawnWave(day-1);assert.ok(!g.state.enemies.some(e=>e.variant===variant),`${variant} not before day ${day}`);
    g.spawnWave(day);assert.ok(g.state.enemies.filter(e=>e.variant===variant).length>=3,`${variant} shows up at least 3 times on day ${day}`);
  }
  g.spawnWave(99);for(const variant of ['runner','brute','bat','bomber','archer','shield','slime','ghost','shaman','golden'])assert.ok(g.state.enemies.some(e=>e.variant===variant),`${variant} still appears late`);
  for(let day=10;day<=100;day+=10){g.spawnWave(day);const boss=g.state.enemies.filter(e=>e.variant==='boss');assert.equal(boss.length,1);assert.ok(boss[0].family,`day ${day} boss has a family`);}
  g.spawnWave(1);const early=g.state.enemies[0].maxHp;g.spawnWave(60);assert.ok(g.state.enemies.find(e=>e.variant==='normal').maxHp>early*5,'enemy HP keeps growing');
});

test('a bomber arms near the player, shows its danger circle, then explodes exactly once',()=>{
  const g=game({contactDamage:5});g.start();const p=g.state.player,hp=p.hp,e=lone(g,'bomber',30,0,{speed:0});
  g.step(.05);assert.ok(e.armed>0);assert.ok(g.snapshot().effects.some(x=>x.type==='telegraph'));
  advance(g,CONFIG.bomberFuse+.1,.05);assert.equal(e.alive,false);assert.ok(p.hp<hp,'the blast hurts a player inside the circle');
  assert.equal(g.state.effects.filter(x=>x.type==='explosion').length,1);assert.equal(g.state.waveKills,1);assert.equal(g.state.kills,0,'self-destruct is not a player kill');
  const h=game({contactDamage:5});h.start();const q=h.state.player,full=q.hp,b=lone(h,'bomber',30,0,{speed:0});h.step(.05);q.x+=200;advance(h,CONFIG.bomberFuse+.1,.05);
  assert.equal(b.alive,false);assert.equal(q.hp,full,'running out of the circle avoids the blast');
});

test('an archer keeps its distance, and its arrows can be dodged',()=>{
  const g=game({contactDamage:6,enemySpeed:24});g.start();const p=g.state.player,e=lone(g,'archer',80,0,{clock:99});
  advance(g,1,.05);assert.ok(Math.hypot(e.x-p.x,e.y-p.y)>80,'backs away when too close');
  e.clock=0;g.step(.05);assert.equal(g.state.enemyShots.length,1);e.clock=99;const hp=p.hp;
  // Step up (away from the build site below the player, which would open the tower menu).
  p.y-=120;advance(g,3,.05);assert.equal(g.state.phase,'running');assert.equal(p.hp,hp,'stepping aside dodges the arrow');assert.equal(g.state.enemyShots.length,0,'arrows expire');
  p.y+=120;Object.assign(e,{x:p.x+170,y:p.y,clock:0});g.step(.05);advance(g,1.5,.05);assert.ok(p.hp<hp,'standing still gets hit');
});

test('shield zombies block frontal hits but not hits from behind',()=>{
  const g=game();g.start();const p=g.state.player,e=lone(g,'shield',100,0,{hp:1000,maxHp:1000});g.moveEnemies(0);
  g.damage(e,100,'player',{x:p.x,y:p.y});const front=1000-e.hp;e.hp=1000;
  g.damage(e,100,'player',{x:e.x+60,y:e.y});const back=1000-e.hp;
  assert.ok(Math.abs(front-100*(1-CONFIG.shieldBlock))<1e-9);assert.equal(back,100);
});

test('slimes split exactly once and the day counts the new slimelets',()=>{
  const g=game();g.start();const e=lone(g,'slime',200,0);const total=g.state.waveTotal;g.damage(e,1e6);
  const kids=g.state.enemies.filter(x=>x.variant==='slimelet'&&x.alive);assert.equal(kids.length,2);assert.equal(g.state.waveTotal,total+2);
  for(const k of kids)g.damage(k,1e6);assert.equal(g.state.enemies.filter(x=>x.alive).length,0,'slimelets do not split');
  g.step(.05);assert.equal(g.state.phase,'day-choice');
});

test('a shaman heals wounded allies on its rhythm, never above full health',()=>{
  const g=game();g.start();const p=g.state.player,s=lone(g,'shaman',170,0),base=g.dayBase(1),ally=g.makeEnemy('normal',p.x+190,p.y,base);
  ally.hp=ally.maxHp*.5;ally.speed=0;s.speed=0;g.state.enemies.push(ally);s.clock=0;g.step(.05);
  assert.ok(ally.hp>ally.maxHp*.5);assert.ok(g.state.effects.some(x=>x.type==='heal'));
  for(let i=0;i<20;i++){s.clock=0;g.step(.05);}assert.equal(ally.hp,ally.maxHp);
});

test('bats and ghosts pass over towers while ordinary zombies are pushed around them',()=>{
  for(const [variant,passes]of [['bat',true],['ghost',true],['normal',false]]){
    const g=game({enemySpeed:60});g.start();const p=g.state.player;g.state.towers=[{id:'t',type:'cannon',x:p.x+60,y:p.y,level:1,cooldown:99}];
    const e=lone(g,variant,120,0,{speed:60});let closest=Infinity;for(let i=0;i<40;i++){g.moveEnemies(.05);closest=Math.min(closest,Math.hypot(e.x-(p.x+60),e.y-p.y));}
    if(passes)assert.ok(closest<40,`${variant} flies through`);else assert.ok(closest>=49,`${variant} is pushed`);
  }
});

test('the emperor enrages once at half health and the ghost lord telegraphs its warp',()=>{
  const g=game();g.spawnWave(100);g.start();const boss=g.state.enemies.find(e=>e.family==='emperor');assert.ok(boss);
  const count=g.state.enemies.length;g.damage(boss,boss.maxHp*.55);assert.equal(boss.stage,2);assert.equal(g.state.enemies.length,count+4);
  g.damage(boss,1);assert.equal(g.state.enemies.length,count+4,'only once');
  const h=game();h.spawnWave(80);h.start();const lord=h.state.enemies.find(e=>e.family==='ghostlord');h.state.enemies=[lord];lord.clock=0;
  h.moveEnemies(.05);assert.ok(lord.blink>0);assert.ok(h.snapshot().effects.some(x=>x.type==='warp'));
  advance(h,1,.05);assert.ok(Math.hypot(lord.x-h.state.player.x,lord.y-h.state.player.y)<140,'arrives near the player');
});

test('the scene changes every 20 days and the snapshot reports it',()=>{
  const g=game();for(const [day,scene]of [[1,'dusk'],[9,'dusk'],[10,'night'],[39,'night'],[40,'snow'],[60,'crimson'],[80,'stars'],[100,'stars']]){
    g.state.wave=day;const s=g.snapshot();assert.equal(s.scene,scene,`day ${day}`);assert.equal(s.campaign.scene,scene,`day ${day} (campaign)`);
  }
});

test('current saves round-trip the 2.2 state and reject malformed enemy shots',()=>{
  const g=game({contactDamage:5});g.start();g.state.combo.stacks=4;g.state.perks.haste=.08;const e=lone(g,'archer',170,0,{clock:0});g.step(.05);
  const save=g.exportSave();assert.equal(save.schema,5);assert.equal(save.state.enemyShots.length,1);
  const h=game();assert.equal(h.importSave(save),true);assert.equal(h.state.combo.stacks,g.state.combo.stacks);assert.equal(h.state.perks.haste,.08);assert.equal(h.state.enemyShots.length,1);
  for(const bad of [{kind:'laser'},{vx:NaN},{ttl:0},{damage:-1}]){const broken=plain(save);Object.assign(broken.state.enemyShots[0],bad);assert.equal(game().importSave(broken),false,JSON.stringify(bad));}
  const wrongFamily=plain(save);wrongFamily.state.enemies[0].family='dragon';assert.equal(game().importSave(wrongFamily),false);
});
