import { canSwap, other, playerFor } from './game'
import type { Game, GameEvent } from './game'
import { evaluate } from './search/evaluate'
import type { Evaluation } from './search/evaluate'
import { actions, advance, allowed, cheapPriority, denies, stateKey, terminalScore, WIN, winningCells } from './search/position'
export { connectionDistance } from './search/evaluate'
export type Difficulty = 'easy' | 'normal' | 'deep'
export const LEVELS = {
  easy: { label: '気軽に', budgetMs: 120, maxDepth: 4, beam: 7 },
  normal: { label: 'じっくり', budgetMs: 450, maxDepth: 6, beam: 10 },
  deep: { label: '深く読む', budgetMs: 1200, maxDepth: 8, beam: 14 },
} as const
export type SearchStats={evaluations:number;ttHits:number;tacticalExtensions:number;tacticalRetained:number;maxCandidates:number}
export type SearchResult={action:GameEvent|null;depth:number;nodes:number;elapsedMs:number;timedOut:boolean;stats?:SearchStats}
export type SearchOptions={budgetMs:number;maxDepth?:number;beam?:number;now?:()=>number;evaluation?:Evaluation;tactics?:boolean;extensions?:boolean;diversity?:boolean;widening?:boolean;cache?:boolean}
export type Candidate={event:GameEvent;game:Game;score:number;forcing:boolean;defense:boolean}
const TIMEOUT=Symbol('deadline')
const eventKey=(event:GameEvent)=>event.type==='place'?String(event.index):event.type
// Exported for regression tests: every forcing action/defense survives the
// quiet-move limit, even if it lies in a distant region or has a poor static score.
export function retainCandidates(candidates:Candidate[],limit:number,size:number,diversity=true):Candidate[]{
  const retained=new Set<Candidate>(candidates.slice(0,limit))
  for(const candidate of candidates)if(candidate.forcing||candidate.defense)retained.add(candidate)
  if(diversity){
    const regions=new Set<number>()
    for(const candidate of candidates)if(candidate.event.type==='place'){
      const index=candidate.event.index
      const region=Math.min(2,Math.floor(Math.floor(index/size)*3/size))*3+Math.min(2,Math.floor((index%size)*3/size))
      if(!regions.has(region)){regions.add(region);retained.add(candidate)}
    }
  }
  return candidates.filter(candidate=>retained.has(candidate))
}
export function chooseMove(game:Game,options:SearchOptions):SearchResult {
  const now=options.now??(()=>performance.now()),start=now(),deadline=start+Math.max(0,Math.min(1500,options.budgetMs))
  const root=playerFor(game,game.turn),beam=Math.max(2,Math.min(32,options.beam??10)),maxDepth=Math.max(1,Math.min(10,options.maxDepth??6))
  const kind=options.evaluation??(game.size===7?'routes':'distance'),tactics=options.tactics!==false,extensions=options.extensions!==false
  const stats:SearchStats={evaluations:0,ttHits:0,tacticalExtensions:0,tacticalRetained:0,maxCandidates:0}
  let nodes=0,depth=0,timedOut=false
  const initial=actions(game).sort((a,b)=>cheapPriority(game,b)-cheapPriority(game,a))
  let best:GameEvent|null=initial[0]??null
  const result=():SearchResult=>({action:best,depth,nodes,elapsedMs:Math.max(0,now()-start),timedOut,stats})
  if(!best||initial.length===1)return result()
  // Retained from v1 so experiments isolate search/evaluation changes.
  if(canSwap(game)&&game.lastMove===Math.floor(game.board.length/2)){best={type:'swap'};return result()}
  const check=()=>{if(now()>=deadline)throw TIMEOUT}
  const values=new Map<string,number>(),facts=new Map<string,{own:number[];enemy:number[]}>()
  const value=(state:Game)=>{
    check();const key=stateKey(state)
    if(options.cache!==false&&values.has(key))return values.get(key)!
    stats.evaluations++;const score=evaluate(state,root,kind)
    if(options.cache!==false)values.set(key,score)
    return score
  }
  const inspect=(state:Game)=>{
    const key=stateKey(state);let data=facts.get(key)
    if(!data){check();data={own:winningCells(state,state.turn),enemy:winningCells(state,other(state.turn))};facts.set(key,data)}
    return data
  }
  type Entry={depth:number;q:number;score:number;bound:'exact'|'lower'|'upper';move:string}
  let table=new Map<string,Entry>(),iteration=1
  const previousMoves=new Map<string,string>()
  function ranked(state:Game,events:GameEvent[],remaining:number):Candidate[]{
    const maximizing=playerFor(state,state.turn)===root,{own,enemy}=inspect(state),candidates:Candidate[]=[]
    const previous=previousMoves.get(stateKey(state))
    for(const event of events){
      check()
      const next=advance(state,event,own)
      const defense=tactics&&enemy.length>0&&denies(state,event,enemy)
      // After our placement these are future threats, not automatically wins.
      // The next search ply must still account for all opponent replies.
      const forcing=tactics&&event.type==='place'&&!next.winner&&winningCells(next,state.turn).length>0
      const score=value(next)
      candidates.push({event,game:next,score,forcing,defense})
    }
    candidates.sort((a,b)=>{
      if(eventKey(a.event)===previous)return -1
      if(eventKey(b.event)===previous)return 1
      if(a.defense!==b.defense)return a.defense?-1:1
      if(a.forcing!==b.forcing)return a.forcing?-1:1
      return maximizing?b.score-a.score:a.score-b.score
    })
    // At the root's one-ply iteration all actions receive an evaluation.
    const limit=options.widening===false?beam:beam+Math.max(0,iteration-1)*4
    const retained=remaining===1?candidates:retainCandidates(candidates,limit,state.size,options.diversity!==false)
    stats.maxCandidates=Math.max(stats.maxCandidates,retained.length)
    stats.tacticalRetained+=retained.filter(c=>c.defense||c.forcing).length
    return retained
  }
  function search(state:Game,remaining:number,alpha:number,beta:number,q:number):number {
    check();nodes++
    const terminal=terminalScore(state,root)
    if(terminal!==null)return terminal
    const maximizing=playerFor(state,state.turn)===root,{own,enemy}=inspect(state)
    const wins=own.filter(index=>allowed(state,index))
    if(wins.length)return maximizing?WIN:-WIN
    let events=actions(state)
    const threatened=tactics&&enemy.length>0
    if(threatened){
      const safe=events.filter(event=>denies(state,event,enemy))
      // No bridge assumption: every possible next-turn winning point is checked.
      if(!safe.length)return maximizing?-WIN:WIN
      events=safe
    }
    if(remaining<=0){
      if(!threatened||!extensions||q<=0)return value(state)
      stats.tacticalExtensions++;remaining=1;q--
    }
    const key=stateKey(state),cached=options.cache===false?undefined:table.get(key)
    const originalAlpha=alpha,originalBeta=beta
    if(cached&&cached.depth===remaining&&cached.q===q){
      stats.ttHits++
      if(cached.bound==='exact')return cached.score
      if(cached.bound==='lower')alpha=Math.max(alpha,cached.score);else beta=Math.min(beta,cached.score)
      if(alpha>=beta)return cached.score
    }
    let score=maximizing?-Infinity:Infinity,bestEvent=''
    for(const child of ranked(state,events,remaining)){
      const childScore=search(child.game,remaining-1,alpha,beta,q)
      if(maximizing?childScore>score:childScore<score){score=childScore;bestEvent=eventKey(child.event)}
      if(maximizing)alpha=Math.max(alpha,score);else beta=Math.min(beta,score)
      if(alpha>=beta)break
    }
    if(!Number.isFinite(score))score=value(state)
    previousMoves.set(key,bestEvent)
    if(options.cache!==false)table.set(key,{depth:remaining,q,score,move:bestEvent,bound:score<=originalAlpha?'upper':score>=originalBeta?'lower':'exact'})
    return score
  }
  try{
    check()
    const {own,enemy}=inspect(game)
    const win=initial.find(event=>event.type==='place'&&own.includes(event.index))
    if(win){best=win;depth=1;return result()}
    let rootEvents=initial
    if(tactics&&enemy.length){
      const safe=initial.filter(event=>denies(game,event,enemy))
      if(safe.length){rootEvents=safe;best=safe[0]}
    }
    for(iteration=1;iteration<=maxDepth;iteration++){
      table=new Map()
      let iterationBest:GameEvent|null=best;let score=-Infinity
      for(const child of ranked(game,rootEvents,iteration)){
        const childScore=search(child.game,iteration-1,score,Infinity,4)
        if(childScore>score){score=childScore;iterationBest=child.event}
      }
      best=iterationBest;depth=iteration
      if(best)previousMoves.set(stateKey(game),eventKey(best))
      if(score===WIN)break
    }
  }catch(error){if(error!==TIMEOUT)throw error;timedOut=true}
  // Maps are scoped to this call. No cross-game/worker stale cache survives.
  return result()
}
