// 3.0 armory: ten weapons with unlock days, the weapon count ("arsenal"), orbit rings that grow
// with it (1 / 10 / 100 / 1,000 / 5,000 / 10,000), exact blade-sweep hits, and schema 5 saves.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../emberwood.html'),'utf8');
const context=vm.createContext({window:{},console,Math,Set,Map,structuredClone});
vm.runInContext(html.match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1],context);
const {GameEngine,CONFIG,WEAPONS,WEAPON_DAYS,ARSENAL_TIERS,bladeHits}=context.window.EmberwoodGame;
const TAU=Math.PI*2,plain=v=>JSON.parse(JSON.stringify(v));
const game=(config={})=>new GameEngine({seed:5,config:{enemySpeed:0,contactDamage:0,axeDamage:0,orbitBase:0,...config}});
const advance=(g,time,dt=1/60)=>{for(let i=0;i<Math.round(time/dt);i++)g.step(dt);};
/** Running game on `day` with tough, harmless, motionless enemies at (dx, dy) from the hero's feet,
    plus one far below so the day never ends mid-test. */
function scene(day,offsets=[],config={}){
  const g=game(config);g.start();g.spawnWave(day);g.state.milestoneRequest=null;const p=g.state.player,base=g.dayBase(day);
  g.state.enemies=[...offsets,[0,650]].map(([dx,dy])=>Object.assign(g.makeEnemy('normal',p.x+dx,p.y+dy,base),{hp:1e6,maxHp:1e6,speed:0,damage:0}));g.state.waveTotal=g.state.enemies.length;return g;
}
const lost=e=>1e6-e.hp;

test('ten weapons: axe, spear and bow from day 1, the rest on their unlock days',()=>{
  assert.deepEqual(Array.from(WEAPONS),['axe','spear','bow','sword','staff','hammer','dagger','magic','gun','shield']);
  for(const id of WEAPONS){
    const day=WEAPON_DAYS[id],before=scene(Math.max(1,day-1));before.state.coins=1e6;
    if(day>1){assert.equal(before.equipWeapon(id),false,`${id} locked on day ${day-1}`);assert.equal(before.upgradeWeapon(id),false);assert.equal(before.snapshot().campaign.weapons.find(w=>w.id===id).unlocked,false);}
    const after=scene(day);after.state.coins=1e6;assert.equal(after.equipWeapon(id),true,`${id} on day ${day}`);assert.equal(after.upgradeWeapon(id),true);
    const card=after.snapshot().campaign.weapons.find(w=>w.id===id);assert.equal(card.unlocked,true);assert.equal(card.day,day);assert.equal(card.level,2);
  }
  const s=scene(1).snapshot();assert.deepEqual(Array.from(s.campaign.weapons.filter(w=>w.unlocked),w=>w.id),['axe','spear','bow']);
});

test('every fifth day from 5 to 65 that brings a weapon shows it first on the "something new" card',()=>{
  for(const id of WEAPONS.filter(id=>WEAPON_DAYS[id]>1)){const g=game();g.state.wave=WEAPON_DAYS[id]-1;g.state.milestoneSeen=g.state.wave;g.start();
    const road=g.upcomingMilestones(1);assert.equal(road[0].day,WEAPON_DAYS[id]);assert.deepEqual(plain(road[0].items[0]),{kind:'weapon',id,title:road[0].items[0].title});}
});

test('a newly unlocked weapon starts two levels below the best older weapon',()=>{
  const g=game();g.state.wave=24;g.state.milestoneSeen=24;g.state.weapons.spear=7;g.start();g.state.wave=25;assert.equal(g.openMilestone(25),true);
  assert.equal(g.state.weapons.hammer,5);assert.equal(g.state.weapons.staff,1,'only the weapon of that day');
  const low=game();low.state.milestoneSeen=4;low.start();low.state.wave=5;low.openMilestone(5);assert.equal(low.state.weapons.sword,1,'never below level 1');
});

test('sword slashes an arc in front; shield bashes a narrower cone and pushes',()=>{
  const g=scene(5,[[50,0],[30,50],[-60,0],[150,0]]);const [front,side,behind,far]=g.state.enemies;g.equipWeapon('sword');g.step(1/60);
  const hit=g.weaponStats().damage;assert.ok(Math.abs(lost(front)-hit)<1e-6);assert.ok(Math.abs(lost(side)-hit)<1e-6);assert.equal(lost(behind),0);assert.equal(lost(far),0);
  assert.ok(g.state.effects.some(e=>e.type==='slash'));
  const h=scene(65,[[60,0],[40,60]]);const [ahead,wide]=h.state.enemies,x=ahead.x;h.equipWeapon('shield');h.step(1/60);
  assert.ok(lost(ahead)>0);assert.equal(lost(wide),0,'outside the 100-degree cone');assert.ok(ahead.x>x+30,'knocked back');assert.ok(h.state.effects.some(e=>e.type==='bash'));
});

test('hammer slams everything around and pushes it away; dagger stabs the nearest twice',()=>{
  const g=scene(25,[[60,0],[-50,20],[0,-70],[140,0]]);const [right,left,up,far]=g.state.enemies,rx=right.x,lx=left.x;g.equipWeapon('hammer');g.step(1/60);
  for(const e of [right,left,up])assert.ok(Math.abs(lost(e)-g.weaponStats().damage)<1e-6);assert.equal(lost(far),0);assert.ok(right.x>rx+30&&left.x<lx-30);
  assert.ok(g.state.effects.some(e=>e.type==='slam'));
  const d=scene(35,[[50,0],[60,15]]);const [near,next]=d.state.enemies;d.equipWeapon('dagger');d.step(1/60);
  assert.ok(Math.abs(lost(near)-2*d.weaponStats().damage)<1e-6,'two stabs');assert.equal(lost(next),0);assert.ok(d.state.effects.some(e=>e.type==='stab'));
});

test('magic book chains lightning through up to three enemies, weaker at each jump',()=>{
  const g=scene(45,[[100,0],[200,0],[300,0],[400,0]]);const [a,b,c,d]=g.state.enemies;g.equipWeapon('magic');g.step(1/60);const hit=g.weaponStats().damage;
  assert.ok(Math.abs(lost(a)-hit)<1e-6);assert.ok(Math.abs(lost(b)-hit*.8)<1e-6);assert.ok(Math.abs(lost(c)-hit*.64)<1e-6);assert.equal(lost(d),0,'only two jumps');
  const chain=g.state.effects.find(e=>e.type==='chain');assert.equal(chain.points.length,3);
  const gap=scene(45,[[100,0],[260,0]]);gap.equipWeapon('magic');gap.step(1/60);assert.equal(lost(gap.state.enemies[1]),0,'no jump past 130');
});

test('staff orbs burst on arrival; gun bullets hit one target',()=>{
  const g=scene(15,[[150,0],[150,40],[150,90]]);const [target,beside,apart]=g.state.enemies;g.equipWeapon('staff');g.step(1/60);
  assert.equal(g.state.projectiles[0].type,'orb');advance(g,.6);const hit=g.weaponStats().damage;
  assert.ok(lost(target)>=hit-1e-6&&lost(beside)>=hit-1e-6,'splash within 48');assert.equal(lost(apart),0);
  const h=scene(55,[[200,0],[200,20]]);const [shot,other]=h.state.enemies;h.equipWeapon('gun');h.step(1/60);assert.equal(h.state.projectiles[0].type,'bullet');advance(h,.3);
  assert.ok(lost(shot)>0);assert.equal(lost(other),0);
});

test('the shield turns away enemy arrows from the front but not from behind',()=>{
  const g=scene(65,[[60,0]],{contactDamage:0});const p=g.state.player;g.equipWeapon('shield');g.step(1/60);const hp=p.hp;
  const arrow=(x,vx)=>({id:`a${x}`,kind:'arrow',x:p.x+x,y:p.y-26,vx,vy:0,damage:10,radius:0,age:0,ttl:5});
  g.state.enemyShots=[arrow(25,-400)];advance(g,.2);assert.equal(p.hp,hp,'front arrow blocked');
  g.state.enemyShots=[arrow(-25,400)];advance(g,.2);assert.equal(p.hp,hp-10,'arrow from behind hurts');
  const s=scene(64,[[60,0]]);s.state.enemyShots=[arrow(25,-400)];const before=s.state.player.hp;advance(s,.2);assert.equal(s.state.player.hp,before-10,'no shield, no block');
});

test('bladeHits counts exactly the blades that sweep an angle, matching brute force',()=>{
  // Brute force: blade j covers [a, a + delta) turning forward, or (a + delta, a] turning backward.
  const brute=(start,delta,n,theta)=>{let count=0;const gap=TAU/n;for(let j=0;j<n;j++){const a=start+j*gap,lo=delta>0?a:a+delta,hi=delta>0?a+delta:a;
    for(let m=Math.floor((lo-theta)/TAU)-1;m<=Math.ceil((hi-theta)/TAU)+1;m++){const x=theta+m*TAU;if(delta>0?x>=lo&&x<hi:x>lo&&x<=hi)count++;}}return count;};
  let seed=9;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
  for(let i=0;i<4000;i++){const n=1+Math.floor(rnd()*20),start=(rnd()-.5)*40,delta=(rnd()-.5)*(i%5?1.2:30),theta=(rnd()-.5)*40;
    assert.equal(bladeHits(start,delta,n,theta),brute(start,delta,n,theta),JSON.stringify({start,delta,n,theta}));}
  assert.equal(bladeHits(0,TAU,8,1),8,'a full turn passes every blade once');assert.equal(bladeHits(0,0,8,0),0);assert.equal(bladeHits(0,1,0,.5),0);
});

test('orbit blades hit enemies in their band once per pass, at any frame rate',()=>{
  const hits=dt=>{const g=scene(1,[[56,2],[120,2]],{orbitBase:6});const [inBand,outside]=g.state.enemies;advance(g,4,dt);return [lost(inBand)/g.orbitDamage(),lost(outside)];};
  const [smooth,outside]=hits(1/60),[choppy]=hits(1/20);
  assert.equal(outside,0);assert.ok(Math.abs(smooth-Math.round(smooth))<1e-6&&smooth>=2,`${smooth} hits`);assert.equal(Math.round(choppy),Math.round(smooth),'a slow frame rate cannot skip a pass');
});

test('weapon-count tiers grow the orbit: 1 blade, faster ring, two and three rings, aura, universe',()=>{
  const g=scene(1,[]);const view=()=>g.snapshot().player.orbit,events=()=>g.drainEvents().filter(e=>e.type==='tier');g.drainEvents();
  assert.deepEqual(plain(view().rings.map(r=>r.blades.length)),[1]);g.gainArsenal(4);assert.deepEqual(plain(view().rings.map(r=>r.blades.length)),[5]);assert.equal(view().tier,0);
  const slow=g.orbitRings()[0].speed;g.gainArsenal(5);assert.equal(view().tier,1);assert.equal(events().length,1);assert.ok(g.orbitRings()[0].speed>slow,'10 weapons spin faster');
  g.gainArsenal(90);assert.deepEqual(plain(view().rings.map(r=>r.blades.length)),[8,14]);
  g.gainArsenal(900);assert.deepEqual(plain(view().rings.map(r=>r.blades.length)),[8,14,20]);assert.equal(view().aura,null);
  g.gainArsenal(4000);assert.equal(view().tier,4);assert.equal(view().aura.radius,CONFIG.auraRadius);
  g.gainArsenal(5000);assert.equal(view().tier,5);assert.equal(view().aura.radius,CONFIG.auraRadius2);assert.equal(events().length,4,'one event per new tier');
  assert.deepEqual(Array.from(ARSENAL_TIERS),[1,10,100,1000,5000,10000]);
  const late=scene(70,[]);assert.equal(late.snapshot().player.orbit.tier,4,'day 70 brings the god aura regardless of count');
});

test('the aura pulses every half second around the hero, wider at 10,000',()=>{
  const g=scene(1,[[0,130],[0,175]],{orbitBase:6});g.gainArsenal(4999);const [near,far]=g.state.enemies;
  near.ringReady=far.ringReady=[1e9,1e9,1e9];advance(g,1.01);const pulse=g.orbitDamage()*CONFIG.auraDamage;
  assert.ok(Math.abs(lost(near)-2*pulse)<1e-6,`${lost(near)/pulse} pulses`);assert.equal(lost(far),0);
  g.gainArsenal(5000);advance(g,.51);assert.ok(lost(far)>0,'radius 190 at tier 5');
});

test('kills, bosses, the arsenal reward and practice grow the weapon count',()=>{
  const g=scene(30,[[300,0]]);const a=g.state.arsenal,start=a.count,e=g.state.enemies[0];g.damage(e,1e9);assert.ok(Math.abs(a.count-start-(1+CONFIG.arsenalGrowth*29))<1e-9);
  const boss=Object.assign(g.makeEnemy('boss',400,500,g.dayBase(30),'batlord'),{hp:1});g.state.enemies.push(boss);const before=a.count;g.damage(boss,10);assert.ok(Math.abs(a.count-before-(1+CONFIG.arsenalGrowth*29+90))<1e-9);
  const h=game();h.start();h.state.wave=12;h.state.enemies=[];h.step(.05);const q=h.state.dayChoice;q.options[0]={...q.options[0],id:'arsenal'};const count=h.state.arsenal.count;
  assert.equal(h.chooseDayReward({requestId:q.requestId,choiceId:'arsenal'}),true);assert.equal(h.state.arsenal.count-count,8*12);
  const m=game();m.state.wave=20;m.startMiniGame('targets');const id=m.miniGame.id;for(let i=0;i<10;i++){const t=m.miniGame.snapshot().targets[0];if(t)m.miniInput({gameId:id,action:'shoot',x:t.x,y:t.y});}advance(m,25,.05);
  const reward=m.state.miniRewards.find(r=>r.type==='weapons');assert.ok(reward&&reward.amount>0);assert.equal(Math.floor(m.state.arsenal.count),1+reward.amount);
});

test('orbit blades show weapon types in proportion to what each weapon collected',()=>{
  const g=scene(5,[]);g.state.arsenal.by.axe=30;g.state.arsenal.by.sword=10;g.state.arsenal.count=41;const types=g.bladeTypes(8);
  assert.equal(types.filter(t=>t==='axe').length,6);assert.equal(types.filter(t=>t==='sword').length,2);
  g.equipWeapon('bow');assert.ok(g.bladeTypes(8).includes('bow'),'the equipped weapon always shows');
  const fresh=scene(1,[]);fresh.equipWeapon('spear');assert.deepEqual(Array.from(fresh.snapshot().player.orbit.rings[0].blades),['spear']);
});

test('schema 5 saves keep the armory; 2.3 saves gain it; broken armory data is rejected',()=>{
  const g=scene(45,[[100,0],[200,0]],{orbitBase:6});g.equipWeapon('magic');g.gainArsenal(1500);g.step(1/60);
  const save=g.exportSave();assert.equal(save.schema,5);assert.equal(save.version,'3.1.0');const h=game();assert.equal(h.importSave(save),true);
  assert.equal(h.state.arsenal.count,g.state.arsenal.count);assert.equal(h.state.equipped,'magic');assert.ok(h.state.effects.some(e=>e.type==='chain'));
  const old=plain(save);old.schema=4;old.version='2.3.0';delete old.state.arsenal;for(const id of ['sword','staff','hammer','dagger','magic','gun','shield'])delete old.state.weapons[id];for(const e of old.state.enemies)delete e.ringReady;old.state.equipped='axe';old.state.effects=[];old.state.kills=200;
  const k=game();assert.equal(k.importSave(old),true);assert.equal(k.state.weapons.gun,1);assert.ok(Math.abs(k.state.arsenal.count-(1+200*(1+CONFIG.arsenalGrowth*44/2)))<1e-9,'past kills count');assert.equal(k.state.arsenal.by.axe,k.state.arsenal.count-1);assert.ok(k.state.enemies.every(e=>e.ringReady.length===3));
  for(const broken of [s=>{s.arsenal.count=NaN;},s=>{s.arsenal.tier=9;},s=>{delete s.arsenal.by.gun;},s=>{s.weapons.gun=11;},s=>{s.enemies[0].ringReady=[0];},s=>{s.effects=[{type:'chain',x:1,y:1,points:[[1,'x']],age:0,ttl:.2}];},s=>{s.projectiles=[{id:'p',type:'laser',x:1,y:1,targetId:'e',damage:1,radius:0,speed:5,age:0,ttl:1,angle:0}];}]){
    const bad=plain(save);broken(bad.state);assert.equal(game().importSave(bad),false,broken.toString());
  }
});
