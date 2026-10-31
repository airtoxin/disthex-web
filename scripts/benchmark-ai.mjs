import { createServer } from 'vite'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cpus, platform, release } from 'node:os'
import { execFileSync } from 'node:child_process'
const expectedBaseline=execFileSync('git',['show','baseline/cpu-v1:src/ai.ts'],{encoding:'utf8'}).replaceAll("from './game'","from '../src/game'").replaceAll('\r\n','\n').trim()
if(readFileSync('research/ai-v1.ts','utf8').replaceAll('\r\n','\n').trim()!==expectedBaseline)throw new Error('Baseline source does not match published commit')
const mode=process.argv[2]??'tune',selected=process.argv[3]??'distance',output=process.argv[4]??mode
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try{
 const [{chooseMove:old},{chooseMove:enhanced},{chooseMcts},{tuning,holdout,scale,fresh,fixtureGame},rules]=await Promise.all([
  server.ssrLoadModule('/research/ai-v1.ts'),server.ssrLoadModule('/src/ai.ts'),
  server.ssrLoadModule('/research/mcts.ts'),server.ssrLoadModule('/research/fixtures.ts'),server.ssrLoadModule('/src/game.ts')])
 const variants={
  adaptive:(game,budgetMs)=>enhanced(game,{budgetMs,maxDepth:4,beam:7}),
  'old-full':(game,budgetMs)=>old(game,{budgetMs,maxDepth:6,beam:7}),
  old:(game,budgetMs)=>old(game,{budgetMs,maxDepth:2,beam:7}),
  distance:(game,budgetMs)=>enhanced(game,{budgetMs,maxDepth:4,beam:7,evaluation:'distance'}),
  routes:(game,budgetMs)=>enhanced(game,{budgetMs,maxDepth:4,beam:7,evaluation:'routes'}),
  resistance:(game,budgetMs)=>enhanced(game,{budgetMs,maxDepth:4,beam:7,evaluation:'resistance'}),
  'no-tactics':(game,budgetMs)=>enhanced(game,{budgetMs,maxDepth:4,beam:7,evaluation:selected,tactics:false,extensions:false}),
  'no-extensions':(game,budgetMs)=>enhanced(game,{budgetMs,maxDepth:4,beam:7,evaluation:selected,extensions:false}),
  'no-coverage':(game,budgetMs)=>enhanced(game,{budgetMs,maxDepth:4,beam:7,evaluation:selected,diversity:false,widening:false}),
  mcts:(game,budgetMs)=>chooseMcts(game,{budgetMs,seed:1229+game.placements})
 }
 const budgetMs=120,maxWallMs=mode==='tune'?240000:180000,started=performance.now()
 const report={mode,selected,budgetMs,maxWallMs,started:new Date().toISOString(),environment:{node:process.version,cpu:cpus()[0].model,platform:platform(),release:release()},sourceHashes:Object.fromEntries(['src/ai.ts','src/search/position.ts','src/search/evaluate.ts','research/ai-v1.ts','research/mcts.ts','research/fixtures.ts'].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),games:[],summary:{},aborted:false}
 const schedule=mode==='tune'?['distance','routes','resistance'].flatMap(name=>tuning.map(f=>[name,'old',f])):
  mode==='ablate'?['no-tactics','no-extensions','no-coverage','mcts'].flatMap(name=>tuning.slice(1,4).map(f=>[name,selected,f])):
  mode==='confirm'?holdout.flatMap(f=>[[selected,'old',f],[selected,'old-full',f]]):
  mode==='scale'?scale.map(f=>[selected,'old',f]):
  mode==='mcts'?holdout.slice(0,4).map(f=>['mcts',selected,f]):
  mode==='fresh'?fresh.flatMap(f=>f.size===7?[[selected,'old',f],[selected,'old-full',f]]:[[selected,'old',f]]):[]
 if(!schedule.length)throw new Error('Unknown benchmark mode')
 // Warm up both code paths without spending measured game budgets.
 for(const fn of Object.values(variants))fn(fixtureGame(tuning[2]),5)
 for(const [a,b,fixture] of schedule)for(const aPlayer of [1,2]){
  if(performance.now()-started>=maxWallMs){report.aborted=true;break}
  let game=fixtureGame(fixture);const moves=[],errors=[]
  for(let ply=0;ply<fixture.size*fixture.size*2+3&&!game.winner;ply++){
   if(performance.now()-started>=maxWallMs){report.aborted=true;break}
   const actor=rules.playerFor(game,game.turn),name=actor===aPlayer?a:b,t0=performance.now()
   const result=variants[name](game,budgetMs),ms=performance.now()-t0
   const next=result.action?rules.applyEvent(game,result.action):null
   if(!next){errors.push({name,action:result.action,state:game});break}
   moves.push({name,actor,event:result.action,ms,nodes:result.nodes,depth:result.depth,timedOut:result.timedOut,stats:result.stats})
   game=next
  }
  const winner=game.winner?rules.playerFor(game,game.winner):null
  report.games.push({a,b,aPlayer,fixture,winner:winner===null?null:winner===aPlayer?a:b,actions:moves,errors,complete:winner!==null})
  console.log(JSON.stringify({match:a+' vs '+b,fixture:fixture.id,aPlayer,winner:report.games.at(-1).winner,moves:moves.length}))
  mkdirSync('research/results',{recursive:true})
  writeFileSync('research/results/'+output+'.json',JSON.stringify(report,null,2))
 }
 const names=new Set(report.games.flatMap(g=>[g.a,g.b]))
 const percentile=(data,p)=>data.length?[...data].sort((a,b)=>a-b)[Math.min(data.length-1,Math.floor(data.length*p))]:0
 for(const name of names){
  const games=report.games.filter(g=>g.a===name||g.b===name),moves=games.flatMap(g=>g.actions.filter(m=>m.name===name)),times=moves.map(m=>m.ms)
  report.summary[name]={wins:games.filter(g=>g.winner===name).length,losses:games.filter(g=>g.complete&&g.winner!==name).length,incomplete:games.filter(g=>!g.complete).length,games:games.length,moves:moves.length,meanMs:times.reduce((a,b)=>a+b,0)/Math.max(1,times.length),p95Ms:percentile(times,.95),maxMs:Math.max(0,...times),nodes:moves.reduce((s,m)=>s+m.nodes,0),timeouts:moves.filter(m=>m.timedOut).length,illegal:games.reduce((s,g)=>s+g.errors.filter(e=>e.name===name).length,0)}
 }
 report.elapsedMs=performance.now()-started
 writeFileSync('research/results/'+output+'.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify({summary:report.summary,elapsedMs:report.elapsedMs,aborted:report.aborted},null,2))
}finally{await server.close()}
