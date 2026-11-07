const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),assert=require('node:assert/strict');
const script=fs.readFileSync(path.resolve(__dirname,'../emberwood.html'),'utf8').match(/<script id="game-logic">([\s\S]*?)<\/script>/)[1];
for(const [query,key]of [['','emberwood.campaign.v2'],['?playtest=1','emberwood.playtest.v2']])test(`adapter isolates saved progress at ${query||'normal URL'}`,()=>{
  const reads=[],writes=[];let listener;
  const UI={setSnapshot(){},openStartMenu(){},onAction(fn){listener=fn;},closeMenus(){},playSound(){},showToast(){}};
  const scope=vm.createContext({window:{EmberwoodUI:UI},document:{},location:{search:query},URLSearchParams,Math,Set,Map,structuredClone,console,
    localStorage:{getItem(k){reads.push(k);return null;},setItem(k,v){writes.push(k);assert.ok(JSON.parse(v).state);}},requestAnimationFrame(){}});
  vm.runInContext(script,scope);assert.deepEqual(reads,[key]);listener({type:'campaign:new',weaponId:'axe'});assert.deepEqual(writes,[key]);
});
