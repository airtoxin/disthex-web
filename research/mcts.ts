import { canSwap, other, playerFor } from '../src/game'
import type { Game, GameEvent, Player } from '../src/game'
import type { SearchOptions, SearchResult } from '../src/ai'
import { evaluate } from '../src/search/evaluate'
import { actions, advance, allowed, cheapPriority, denies, winningCells } from '../src/search/position'

export function seededRandom(seed:number):()=>number {
  let state=seed>>>0
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
}
type Node={game:Game;parent:Node|null;event:GameEvent|null;children:Node[];untried:GameEvent[];visits:number;total:number}
function policy(game:Game):GameEvent[] {
  let events=actions(game)
  const own=winningCells(game,game.turn).filter(index=>allowed(game,index))
  if(own.length)return own.map(index=>({type:'place',index}))
  const threats=winningCells(game,other(game.turn))
  if(threats.length){const safe=events.filter(event=>denies(game,event,threats));if(safe.length)events=safe}
  return events.sort((a,b)=>cheapPriority(game,b)-cheapPriority(game,a))
}
export function chooseMcts(game:Game,options:SearchOptions & {seed?:number}):SearchResult {
  const now=options.now??(()=>performance.now()),start=now(),deadline=start+Math.max(0,Math.min(1500,options.budgetMs)),random=seededRandom(options.seed??12345)
  const rootPlayer=playerFor(game,game.turn)
  const make=(state:Game,parent:Node|null,event:GameEvent|null):Node=>({game:state,parent,event,children:[],untried:policy(state),visits:0,total:0})
  const root=make(game,null,null)
  let fallback=root.untried[0]??null,nodes=0,simulations=0
  const result=(action:GameEvent|null):SearchResult=>({action,depth:simulations,nodes,elapsedMs:now()-start,timedOut:now()>=deadline})
  if(!fallback||root.untried.length===1)return result(fallback)
  if(canSwap(game)&&game.lastMove===Math.floor(game.board.length/2))return result({type:'swap'})
  const immediate=winningCells(game,game.turn).find(index=>allowed(game,index))
  if(immediate!==undefined)return result({type:'place',index:immediate})
  function reward(state:Game,rootPlayer:Player):number {
    if(state.winner)return playerFor(state,state.winner)===rootPlayer?1:0
    return 1/(1+Math.exp(-evaluate(state,rootPlayer,'distance')/150))
  }
  while(now()<deadline){
    let node=root
    while(!node.game.winner&&!node.untried.length&&node.children.length){
      const maximize=playerFor(node.game,node.game.turn)===rootPlayer
      let chosen=node.children[0],best=-Infinity
      for(const child of node.children){
        const mean=child.total/child.visits
        const ucb=(maximize?mean:1-mean)+Math.sqrt(2*Math.log(node.visits+1)/child.visits)
        if(ucb>best){best=ucb;chosen=child}
      }
      node=chosen
      if(now()>=deadline)break
    }
    if(now()>=deadline)break
    if(node.untried.length){
      // All root moves are eligible; random expansion prevents positional order
      // from excluding distant moves when only a few simulations fit the budget.
      const offset=Math.floor(random()*node.untried.length),event=node.untried.splice(offset,1)[0]
      const child=make(advance(node.game,event),node,event)
      node.children.push(child);node=child;nodes++
    }
    let state=node.game
    // Bounded tactical-biased rollout; nonterminal cutoff uses a declared value
    // estimate, so these are not pure terminal-only Monte Carlo win rates.
    for(let ply=0;ply<14&&!state.winner&&now()<deadline;ply++){
      const events=policy(state)
      if(!events.length)break
      const event=events[Math.floor(random()*(random()<.7?Math.min(8,events.length):events.length))]
      state=advance(state,event);nodes++
    }
    const score=reward(state,rootPlayer)
    for(let current:Node|null=node;current;current=current.parent){current.visits++;current.total+=score}
    simulations++
  }
  const best=root.children.reduce<Node|null>((a,b)=>!a||b.visits>a.visits||(b.visits===a.visits&&b.total/b.visits>a.total/a.visits)?b:a,null)
  if(best?.event)fallback=best.event
  return result(fallback)
}
