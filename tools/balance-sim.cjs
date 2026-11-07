#!/usr/bin/env node
// Headless balance simulator for emberwood.html: scripted bots play the real
// 100-day campaign with the shipped CONFIG (no test shortcuts) and report how far
// they get. Usage:
//   node tools/balance-sim.cjs [bot=human] [seeds=3] [weapon=axe] [maxDay=100]
// SIM_CONFIG='{"specialKills":40}' overrides CONFIG values for a tuning run.
// Bots: idle (never moves after starting), camper (stands at the build site),
// human (decides every 0.3 s with aim noise), smart (decides every frame). Both use the
// dash and special buttons once they unlock (days 20 and 40).
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../emberwood.html'),'utf8');
const context=vm.createContext({window:{},console,Math,Set,Map,structuredClone});
vm.runInContext(html.match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1],context);
const {GameEngine}=context.window.EmberwoodGame;

function mulberry(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const PERK_ORDER=['attack','haste','health','armor','heal','speed','supply'];

/** Movement intent for one decision: avoid danger first, then build, then fight and loot. */
function decide(g,fleeAt){
  const s=g.state,p=s.player,c=g.config,stats=g.weaponStats();
  let vx=0,vy=0;const away=(x,y,w)=>{const dx=p.x-x,dy=p.y-y,d=Math.hypot(dx,dy)||1;vx+=dx/d*w;vy+=dy/d*w;};
  // 1. Danger: armed bombers, falling bombs and arrows heading at us.
  for(const e of s.enemies)if(e.alive&&e.armed>0&&Math.hypot(e.x-p.x,e.y-p.y)<c.bomberRadius+30)away(e.x,e.y,3);
  for(const q of s.enemyShots){
    if(q.kind==='bomb'){if(Math.hypot(q.x-p.x,q.y-(p.y-26))<q.radius+25)away(q.x,q.y+26,3);continue;}
    const rx=p.x-q.x,ry=p.y-26-q.y,along=(rx*q.vx+ry*q.vy)/Math.hypot(q.vx,q.vy);
    if(along>0&&along<140){const cross=(rx*q.vy-ry*q.vx)/Math.hypot(q.vx,q.vy),side=cross>=0?1:-1;vx+=q.vy/Math.hypot(q.vx,q.vy)*side*2;vy+=-q.vx/Math.hypot(q.vx,q.vy)*side*2;}
  }
  if(Math.hypot(vx,vy)>.5)return [vx,vy];
  // 2. Too close to a hitter: back off.
  let near=null,nd=Infinity;for(const e of s.enemies){if(!e.alive)continue;const d=Math.hypot(e.x-p.x,e.y-p.y);if(d<nd){nd=d;near=e;}}
  if(near&&nd<fleeAt){away(near.x,near.y,1);return [vx,vy];}
  // 3. Feed the build site when carrying enough wood.
  const site=s.site,need=site.required-site.deposited;
  if(site.level<c.maxTowerLevel&&s.bagWood>0&&(s.bagWood>=need||s.phase==='intermission'))return [site.x-p.x,site.y-p.y];
  // 4. Loot nearby.
  let loot=null,ld=170;for(const q of s.pickups){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<ld){ld=d;loot=q;}}
  if(loot)return [loot.x-p.x,loot.y-p.y];
  // 5. Engage: melee hugs the axe ring, ranged keeps its distance.
  if(near){const want=s.equipped==='axe'?stats.range*.8:stats.range*.7,dir=nd>want?1:-.6;return [(near.x-p.x)*dir,(near.y-p.y)*dir];}
  return [s.fire.x-p.x,s.fire.y-120-p.y];
}

/** 2.3 buttons, pressed the way a child would: the star when a crowd is near, the wind when something is touching. */
function useSkills(g){
  const s=g.state,p=s.player;let near=0,close=false;
  for(const e of s.enemies){if(!e.alive)continue;const d=Math.hypot(e.x-p.x,e.y-p.y);if(d<260)near++;if(d<45)close=true;}
  if(s.moves.charge>=1&&near>=4)g.special();if(close)g.dash();
}

function play(bot,seed,weapon='axe',maxDay=100,config={}){
  const g=new GameEngine({seed,config}),rng=mulberry(seed*31+7),dt=1/60;g.equipWeapon(weapon);
  let hold=[0,0],clock=0,t=0,minHp=100,hits=0,lastHp=100,towerTurn=0;const dayLog=[];
  g.setInput(.3,0);
  while(!['won','lost'].includes(g.state.phase)&&g.state.wave<=maxDay&&t<6*3600){
    const s=g.state;
    if(s.milestoneRequest)g.ackMilestone({requestId:s.milestoneRequest.requestId});
    if(s.dayChoice){const q=s.dayChoice,pick=PERK_ORDER.find(id=>q.options.some(o=>o.id===id));g.chooseDayReward({requestId:q.requestId,choiceId:pick});dayLog.push({day:s.wave,hp:Math.round(s.player.hp),time:Math.round(t)});if(s.wave>=maxDay)break;}
    if(s.buildRequest){const type=['cannon','flame','archer'][towerTurn++%3];g.chooseTower({...s.buildRequest,towerType:s.towers[0]?.type||type});}
    while(s.coins>=g.weaponCost(s.equipped).coins&&s.gems>=g.weaponCost(s.equipped).gems&&s.weapons[s.equipped]<10)if(!g.upgradeWeapon(s.equipped))break;
    let move=[0,0];
    if(bot==='camper'){const dx=s.site.x-s.player.x,dy=s.site.y-60-s.player.y;move=Math.hypot(dx,dy)<6?[0,0]:[dx,dy];}
    else if(bot==='human'){clock-=dt;if(clock<=0){clock=.3;const [x,y]=decide(g,26),n=Math.hypot(x,y);if(n<2)hold=[0,0];else{const a=Math.atan2(y,x)+(rng()-.5)*.6;hold=[Math.cos(a),Math.sin(a)];}g.setInput(hold[0],hold[1]);useSkills(g);}move=hold;}
    else if(bot==='smart'){const [x,y]=decide(g,32),n=Math.hypot(x,y);move=n<2?[0,0]:[x/n,y/n];g.setInput(move[0],move[1]);useSkills(g);}
    if(bot!=='idle'||t<.05)g.setInput(move[0],move[1]);
    g.step(dt);t+=dt;g.drainEvents();
    if(s.player.hp<lastHp-.5)hits++;lastHp=s.player.hp;if(s.phase==='running')minHp=Math.min(minHp,s.player.hp);
  }
  const s=g.state;
  return {bot,seed,weapon,result:s.phase==='won'?'WON':s.phase==='lost'?'lost':'stop',day:s.wave,minutes:+(t/60).toFixed(1),minHp:Math.round(minHp),hits,kills:s.kills,weaponLevel:s.weapons[s.equipped],tower:s.towers[0]?`${s.towers[0].type}${s.towers[0].level}`:'-',speed:+g.attackSpeed().toFixed(2),dayLog};
}

if(require.main===module){
  const [bot='human',seeds='3',weapon='axe',maxDay='100']=process.argv.slice(2);
  for(let i=1;i<=Number(seeds);i++){
    const r=play(bot,i,weapon,Number(maxDay),JSON.parse(process.env.SIM_CONFIG||'{}'));
    const curve=r.dayLog.filter(d=>d.day%10===0).map(d=>`d${d.day}:${d.hp}hp`).join(' ');
    console.log(`${r.bot.padEnd(6)} seed ${r.seed} ${r.weapon.padEnd(5)} ${r.result.padEnd(4)} day ${String(r.day).padStart(3)}  ${String(r.minutes).padStart(5)} min  minHP ${String(r.minHp).padStart(3)}  hits ${String(r.hits).padStart(4)}  kills ${String(r.kills).padStart(4)}  weapon L${r.weaponLevel}  tower ${r.tower}  speed x${r.speed}  ${curve}`);
  }
}
module.exports={play};
