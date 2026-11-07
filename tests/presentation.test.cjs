const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(process.env.EMBERWOOD_TEST_SOURCE||path.resolve(__dirname,'../emberwood.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const noop=()=>{},gradient={addColorStop:noop};
const paint=new Proxy({}, {get:(_,key)=>key==='createPattern'?()=>({}):key==='createLinearGradient'||key==='createRadialGradient'?()=>gradient:noop,set:()=>true});
const nodes=new Map(),globalEvents=new Map();let scheduledFrame;
function node(id=''){
  const classes=new Set(),events=new Map();
  return {id,events,children:[],style:{},dataset:{},width:320,height:292,open:false,hidden:false,disabled:false,writes:{text:0,html:0},
    get textContent(){return this._text??'';},set textContent(value){this._text=value;this.writes.text++;},
    get innerHTML(){return this._html??'';},set innerHTML(value){this._html=value;this.writes.html++;},
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
    getBoundingClientRect:()=>({left:0,top:0,width:360,height:220}),
    getContext:()=>paint,setAttribute:noop,focus:noop,hasPointerCapture:()=>false,releasePointerCapture:noop,setPointerCapture:noop,
    addEventListener(type,fn){if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},
    click(){if(this.disabled)return;for(const fn of events.get('click')||[])fn({});},
    showModal(){this.open=true;},close(){if(!this.open)return;this.open=false;for(const fn of events.get('close')||[])fn({});}
  };
}
function get(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);}
const cards=['cannon','archer','flame'].map(type=>{const n=node();n.dataset.tower=type;return n;});
const arts=['cannon','archer','flame'].map(type=>{const n=node();n.dataset.art=type;return n;});
const document={hidden:false,getElementById:get,createElement:()=>node(),addEventListener:noop,
  querySelector:selector=>get(selector),querySelectorAll:selector=>selector==='.tower-card'?cards:selector==='.card-art'?arts:[]};
const scope=vm.createContext({window:{},document,console,Math,Set,Map,URLSearchParams,structuredClone,
  location:{search:'?runtime=logic'},innerWidth:540,innerHeight:960,devicePixelRatio:2,
  performance:{now:()=>0},matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>scheduledFrame=fn,
  localStorage:{getItem:()=>null,setItem:noop},
  addEventListener:(type,fn)=>{const old=globalEvents.get(type);globalEvents.set(type,old?event=>{old(event);fn(event);}:fn);}});
for(const script of scripts)new Function(script);
// Test presentation ownership independently of Claude's future gameplay block.
for(const script of scripts.slice(0,2))vm.runInContext(script,scope,{filename:'emberwood.html'});
const UI=scope.window.EmberwoodUI,fixtures=scope.window.EmberwoodVisualFixtures;
const plain=x=>JSON.parse(JSON.stringify(x));let passed=0;
function check(name,fn){UI.closeBuildMenu();UI.setSnapshot(fixtures.create('scene'));fn();passed++;console.log(`PASS ${name}`);}
check('all script sections parse and UI contract is exposed',()=>{
  assert.equal(scripts.length,3);assert.equal(UI.version,1);
  for(const key of ['setSnapshot','getSnapshot','getViewport','onAction','project','openBuildMenu','closeBuildMenu','closeMenus','openSettings','setBuildPending','showResult'])assert.equal(typeof UI[key],'function');
});
check('renderer snapshots copy caller data and getters cannot mutate live data',()=>{
  const source=fixtures.create('scene');UI.setSnapshot(source);source.hud.wood=999;source.player.x=-1;
  assert.equal(UI.getSnapshot().hud.wood,13);assert.equal(UI.getSnapshot().player.x,245);
  const copy=UI.getSnapshot();copy.hud.wood=300;assert.equal(UI.getSnapshot().hud.wood,13);
});
check('rendering and ambient animations never change gameplay state',()=>{
  const before=plain(UI.getSnapshot());for(let i=1;i<20;i++)scheduledFrame(i*50);
  assert.deepEqual(plain(UI.getSnapshot()),before);
});
check('publishing moving actors preserves unchanged HUD DOM and updates changed inventory once',()=>{
  const s=fixtures.create('scene');UI.setSnapshot(s);get('wood').writes.text=0;get('monsterCount').writes.html=0;
  for(let i=0;i<60;i++){s.player.x+=.1;UI.setSnapshot(s);}
  assert.equal(get('wood').writes.text,0,'movement alone must not rewrite the inventory every frame');
  assert.equal(get('monsterCount').writes.html,0,'movement alone must preserve the counter DOM');
  s.hud.wood=12;UI.setSnapshot(s);assert.equal(get('wood').textContent,12);assert.equal(get('wood').writes.text,1);
});
check('six viewport sizes preserve all world positions and resource values',()=>{
  const before=plain(UI.getSnapshot());
  for(const [w,h]of [[392,533],[375,812],[844,390],[1280,720],[320,480],[540,960]]){
    scope.innerWidth=w;scope.innerHeight=h;globalEvents.get('resize')();
    assert.equal(get('scene').width,w*2);assert.equal(get('scene').height,h*2);
    assert.deepEqual(plain(UI.getSnapshot()),before);scheduledFrame(1200);
    assert.ok(Number.isFinite(UI.project({x:270,y:520}).x));
  }
});
check('build menu requires owner-supplied identity and selection emits once',()=>{
  assert.throws(()=>UI.openBuildMenu({}),/requires siteId and requestId/);
  const actions=[];const unsubscribe=UI.onAction(a=>actions.push(plain(a)));
  UI.openBuildMenu({siteId:'site-1',requestId:'req-10',options:['cannon','archer','flame']});
  cards[1].click();cards[1].click();
  assert.deepEqual(actions.filter(a=>a.type==='build:select'),[{type:'build:select',siteId:'site-1',requestId:'req-10',towerType:'archer'}]);
  assert.equal(get('buildDialog').open,true);assert.equal(cards[0].disabled,true);
  assert.equal(UI.getSnapshot().hud.wood,13);assert.equal(UI.getSnapshot().towers.length,0);
  UI.setBuildPending(false);assert.equal(cards[0].disabled,false);unsubscribe();
});
check('runtime=logic disables fixture decisions and construction popup triggers',()=>{
  const actions=[];const unsubscribe=UI.onAction(a=>actions.push(plain(a)));const before=plain(UI.getSnapshot());
  get('siteTarget').click();
  assert.deepEqual(actions,[{type:'site:interact',siteId:'site-1'}]);assert.equal(get('buildDialog').open,false);
  assert.deepEqual(plain(UI.getSnapshot()),before);assert.equal(get('visualPreviewControls').hidden,true);unsubscribe();
});
check('keyboard produces intent only, with zero input on release',()=>{
  const actions=[];const unsubscribe=UI.onAction(a=>actions.push(plain(a)));const before=plain(UI.getSnapshot());
  globalEvents.get('keydown')({key:'d',preventDefault:noop});globalEvents.get('keyup')({key:'d'});
  assert.deepEqual(actions,[{type:'input:change',x:1,y:0},{type:'input:change',x:0,y:0}]);
  assert.deepEqual(plain(UI.getSnapshot()),before);unsubscribe();
});
check('touch joystick emits direction without moving actors or spending resources',()=>{
  const actions=[];const unsubscribe=UI.onAction(a=>actions.push(plain(a)));const before=plain(UI.getSnapshot());const scene=get('scene');
  const fire=(type,event)=>{for(const fn of scene.events.get(type)||[])fn(event);};
  fire('pointerdown',{pointerId:5,clientX:100,clientY:200,preventDefault:noop});
  fire('pointermove',{pointerId:5,clientX:135,clientY:200});
  assert.deepEqual(actions.at(-1),{type:'input:change',x:1,y:0});
  assert.equal(get('joystick').classList.contains('visible'),true);
  fire('pointerup',{pointerId:5});assert.deepEqual(actions.at(-1),{type:'input:change',x:0,y:0});
  assert.equal(get('joystick').classList.contains('visible'),false);assert.deepEqual(plain(UI.getSnapshot()),before);unsubscribe();
});
check('all three towers and combat VFX have independent prepared visual states',()=>{
  assert.equal(fixtures.create('build').site.deposited,30);assert.equal(fixtures.create('build').hud.wood,6);
  for(const type of ['cannon','archer','flame']){const fixture=fixtures.create(type);assert.equal(fixture.towers[0].type,type);assert.equal(fixture.site.required,60);assert.equal(fixture.site.deposited,0);assert.equal(fixture.hud.wood,6);UI.setSnapshot(fixture);scheduledFrame(1500);}
  UI.setSnapshot(fixtures.create('effects'));scheduledFrame(1600);
  assert.ok(UI.getSnapshot().effects.length);assert.ok(UI.getSnapshot().damageTexts.length);
});
check('result dialog renders externally supplied data without deciding victory',()=>{
  const before=plain(UI.getSnapshot());UI.showResult({won:true,waves:5,kills:85,time:'3:20',description:'ทดสอบภาพ'});
  assert.equal(get('resultDialog').open,true);assert.equal(get('resultWaves').textContent,5);assert.deepEqual(plain(UI.getSnapshot()),before);get('resultDialog').close();
});
check('every hero pose, emotion and effect renders from snapshot fields alone',()=>{
  const s=fixtures.create('scene'),{x,y}=s.player;
  for(const pose of ['idle','run','attack','spin','dash','special','victory','greet','sleep',undefined])for(const emotion of [null,'happy','angry','surprised','sad','sleep','greet']){
    Object.assign(s.player,{pose,poseT:.5,emotion,facing:emotion==='sad'?-1:1,wings:!!emotion,crown:!!emotion,dash:pose==='dash'?{fromX:x-60,fromY:y,progress:.5}:null,special:pose==='special'?{progress:.3,level:emotion?2:1}:null});
    s.effects=[{type:'spin',x,y:y-26,radius:115,progress:.4}];UI.setSnapshot(s);scheduledFrame(500);
  }
  UI.showResult({won:false,waves:3,kills:20,time:'1:00'});get('resultDialog').close();UI.openSettings();scheduledFrame(900);get('settingsDialog').close();
});
check('dash and special buttons follow the snapshot and only send intents',()=>{
  UI.closeMenus();const s=fixtures.create('scene'),actions=[],off=UI.onAction(a=>actions.push(plain(a)));
  const press=id=>{for(const fn of get(id).events.get('pointerdown'))fn({preventDefault:noop});};
  UI.setSnapshot(s);assert.equal(get('skillButtons').hidden,true,'no moves in the snapshot, no buttons');
  s.hud.moves={dash:{unlocked:false,day:20,ready:0,active:false},special:{unlocked:false,day:40,charge:0,active:false,level:1}};UI.setSnapshot(s);
  assert.equal(get('skillButtons').hidden,false);assert.equal(get('dashLabel').textContent,'วัน 20');assert.ok(get('specialButton').classList.contains('locked'));
  press('dashButton');assert.equal(actions.length,0,'a locked button only says when it opens');assert.equal(get('toast').classList.contains('visible'),true);
  s.hud.moves={dash:{unlocked:true,day:20,ready:1,active:false},special:{unlocked:true,day:40,charge:.5,active:false,level:2}};UI.setSnapshot(s);
  assert.equal(get('dashLabel').textContent,'พุ่ง');assert.ok(get('dashButton').classList.contains('ready'));assert.ok(!get('specialButton').classList.contains('ready'));
  assert.match(get('specialButton').style.background,/#ffd86a 180deg/);
  const before=plain(UI.getSnapshot());press('dashButton');press('specialButton');
  globalEvents.get('keydown')({key:'Shift',repeat:false,preventDefault:noop});globalEvents.get('keydown')({key:'e',repeat:false,preventDefault:noop});
  globalEvents.get('keydown')({key:'e',repeat:true,preventDefault:noop});
  assert.deepEqual(actions.map(a=>a.type),['move:dash','move:special','move:dash','move:special']);assert.deepEqual(plain(UI.getSnapshot()),before);
  UI.openSettings();assert.equal(get('skillButtons').hidden,true,'hidden behind menus');globalEvents.get('keydown')({key:'Shift',repeat:false,preventDefault:noop});
  assert.equal(actions.filter(a=>a.type.startsWith('move:')).length,4,'no skill intents behind a menu');get('settingsDialog').close();off();
});
check('3.0 weapon menu locks future weapons, shows the orbit tier bar, badge, banner and every orbit tier',()=>{
  UI.closeMenus();const s=fixtures.create('scene'),ids=['axe','spear','bow','sword','staff','hammer','dagger','magic','gun','shield'];
  const days={axe:1,spear:1,bow:1,sword:5,staff:15,hammer:25,dagger:35,magic:45,gun:55,shield:65};
  s.campaign={version:'3.0.0',day:20,totalDays:100,phase:'running',scene:'night',equipped:'sword',resources:{coins:50,gems:2,wood:3},miniAvailable:true,miniUsedToday:false,milestones:[],
    weapons:ids.map(id=>({id,name:id,level:1,maxLevel:10,damage:10,interval:1,range:80,upgradeCost:{coins:25,gems:0},unlocked:days[id]<=20,day:days[id],canUpgrade:days[id]<=20,selected:id==='sword'})),
    arsenal:{count:150,tier:2,tiers:[1,10,100,1000,5000,10000]}};
  s.hud.arsenal={count:1234,tier:3};UI.setSnapshot(s);
  assert.equal(get('arsenalBadge').hidden,false);assert.equal(get('arsenalValue').textContent,'1,234');assert.equal(get('arsenalBadge').dataset.tier,'3');
  const cards=get('campaignWeaponCards').children;assert.equal(cards.length,10);
  assert.deepEqual(cards.filter(c=>c.classList.contains('is-locked')).map(c=>c.dataset.weaponId),['hammer','dagger','magic','gun','shield']);
  const steps=get('campaignArsenalSteps').children;assert.equal(steps.length,6);assert.equal(steps.filter(n=>n.classList.contains('is-reached')).length,3);assert.ok(steps[2].classList.contains('is-current'));
  assert.equal(get('campaignArsenalFill').style.width,'18%');assert.equal(get('campaignArsenalCount').textContent,'150 ชิ้น');
  UI.showTierUp({tier:3,count:1000});assert.ok(get('tierBanner').classList.contains('visible'));assert.equal(get('tierTitle').textContent,'อาวุธ 1,000 ชิ้น!');
  const before=plain(UI.getSnapshot());
  for(let tier=0;tier<=5;tier++){s.player.orbit={tier,count:[1,10,100,1000,5000,10000][tier],rings:[{radius:56,angle:tier,blades:Array(8).fill('sword')},{radius:98,angle:-tier,blades:ids.slice(0,10)},{radius:140,angle:.5,blades:Array(20).fill('magic')}].slice(0,tier>=3?3:tier>=2?2:1),aura:tier>=4?{radius:tier>=5?190:150,pulse:.4}:null};
    s.player.weapon={type:ids[3+tier],angle:.4,flash:.1,range:90};s.effects=[{type:'slash',x:245,y:474,angle:0,radius:95,arc:2.4,progress:.3},{type:'bash',x:245,y:474,angle:1,radius:82,arc:1.75,progress:.5},{type:'slam',x:245,y:500,radius:92,progress:.2},{type:'stab',x:245,y:474,angle:0,length:60,progress:.4},{type:'chain',x:245,y:474,points:[[300,470],[380,470]],progress:.2},{type:'orbHit',x:300,y:470,radius:48,progress:.5}];
    s.projectiles=[{type:'orb',x:260,y:470,angle:0},{type:'bullet',x:270,y:470,angle:.2}];UI.setSnapshot(s);scheduledFrame(700+tier);}
  for(const type of ids){s.player.weapon={type,angle:2.5,flash:.1,range:90};UI.setSnapshot(s);scheduledFrame(720);}
  assert.equal(UI.getSnapshot().player.orbit.tier,5);assert.equal(before.player.x,UI.getSnapshot().player.x,'rendering never moves the hero');
});
check('one HTML uses no remote libraries, fonts, images, or network APIs',()=>{
  assert.doesNotMatch(html,/<(?:img|script|link)\b[^>]*(?:src|href)=/i);
  assert.doesNotMatch(scripts.join('\n'),/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.match(html,/<html lang="th">/);assert.match(html,/id="game-logic"/);
});
check('default engine adapter connects real input, construction, pause, focus and restart to the UI',()=>{
  scope.location.search='';vm.runInContext(scripts[1],scope);vm.runInContext(scripts[2],scope);
  assert.equal(typeof scope.window.EmberwoodGame?.GameEngine,'function','normal play must load the real engine');
  assert.equal(get('startDialog').open,true);get('campaignNew').click();assert.equal(get('startDialog').open,false);
  get('siteTarget').click();assert.equal(get('buildDialog').open,false,'far-away site clicks must not enter the visual fixture chooser');
  let now=2000;const frames=n=>{for(let i=0;i<n;i++){now+=1000/60;scheduledFrame(now);}};
  globalEvents.get('keydown')({key:'s',preventDefault:noop});frames(160);
  assert.equal(get('buildDialog').open,true);assert.equal(UI.getSnapshot().hud.wood,6);assert.equal(UI.getSnapshot().site.deposited,30);
  const choosing=plain(UI.getSnapshot());frames(60);assert.deepEqual(plain(UI.getSnapshot()),choosing);
  cards[1].click();assert.equal(get('buildDialog').open,false);
  assert.equal(UI.getSnapshot().towers[0].type,'archer');assert.equal(UI.getSnapshot().site.required,60);assert.equal(UI.getSnapshot().site.deposited,0);
  UI.openSettings();const paused=plain(UI.getSnapshot());frames(60);assert.deepEqual(plain(UI.getSnapshot()),paused);
  get('settingsDialog').close();frames(10);assert.notDeepEqual(plain(UI.getSnapshot()),paused);
  globalEvents.get('blur')();assert.equal(get('settingsDialog').open,true);
  globalEvents.get('focus')();const focusedButPaused=plain(UI.getSnapshot());frames(30);assert.deepEqual(plain(UI.getSnapshot()),focusedButPaused);
  get('settingsDialog').close();frames(10);assert.notDeepEqual(plain(UI.getSnapshot()),focusedButPaused);
  UI.openSettings();get('restartButton').click();frames(30);
  assert.equal(get('startDialog').open,true);get('campaignNew').click();assert.equal(get('campaignNewConfirm').hidden,false);get('campaignConfirmNew').click();
  assert.deepEqual([UI.getSnapshot().hud.wave,UI.getSnapshot().hud.wood,UI.getSnapshot().site.deposited,UI.getSnapshot().towers.length],[1,13,23,0]);
});
console.log(`${passed} presentation checks passed.`);
