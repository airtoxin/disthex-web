import { applyEvent, canSwap, connectedPath, isLegal, legalMoves, neighbors, other, playerFor } from '../src/game'
import type { Color, Game, GameEvent, Player } from '../src/game'
export type Difficulty = 'easy' | 'normal' | 'deep'
export const LEVELS = {
  easy: { label: '気軽に', budgetMs: 120, maxDepth: 2, beam: 7 },
  normal: { label: 'じっくり', budgetMs: 450, maxDepth: 3, beam: 10 },
  deep: { label: '深く読む', budgetMs: 1200, maxDepth: 5, beam: 14 },
} as const
export type SearchResult = { action: GameEvent | null; depth: number; nodes: number; elapsedMs: number; timedOut: boolean }
export type SearchOptions = { budgetMs: number; maxDepth?: number; beam?: number; now?: () => number }
const WIN = 100000
const TIMEOUT = Symbol('search-timeout')
const adjacency = new Map<number,number[][]>()
function graph(size: number) {
  let list=adjacency.get(size)
  if(!list) { list=Array.from({length:size*size},(_,index)=>neighbors(index,size)); adjacency.set(size,list) }
  return list
}
// A Dijkstra distance counts the empty cells still needed to connect the two goals.
// The current turn's forbidden cells carry a small temporary cost, not a permanent wall.
export function connectionDistance(game: Game, color: Color): number {
  const count=game.board.length, distance=new Float64Array(count).fill(1000), visited=new Uint8Array(count)
  const adjacent=graph(game.size)
  const forbidden=game.lastMove===null ? [] : adjacent[game.lastMove]
  const cost=(index:number)=>game.board[index]===color ? 0 : 1+(game.turn===color && forbidden.includes(index) ? .35 : 0)
  for(let i=0;i<game.size;i++) { const index=color==='blue'?i:i*game.size; if(!game.board[index] || game.board[index]===color)distance[index]=cost(index) }
  for(let step=0;step<count;step++) {
    let current=-1, best=1000
    for(let i=0;i<count;i++) if(!visited[i] && distance[i]<best){ current=i; best=distance[i] }
    if(current<0)return game.size*3
    if(color==='blue' ? Math.floor(current/game.size)===game.size-1 : current%game.size===game.size-1)return best
    visited[current]=1
    for(const next of adjacent[current]) if(!visited[next] && (!game.board[next] || game.board[next]===color)) distance[next]=Math.min(distance[next],best+cost(next))
  }
  return game.size*3
}
function evaluate(game:Game, root:Player):number {
  if(game.winner)return playerFor(game,game.winner)===root?WIN:-WIN
  const own:Color=game.bluePlayer===root?'blue':'red', opponent:Color=own==='blue'?'red':'blue'
  let position=0
  const middle=(game.size-1)/2
  for(let i=0;i<game.board.length;i++)if(game.board[i]) {
    const centrality=game.size-Math.abs(Math.floor(i/game.size)-middle)-Math.abs(i%game.size-middle)
    position+=(game.board[i]===own?1:-1)*centrality
  }
  return (connectionDistance(game,opponent)-connectionDistance(game,own))*100+position*2
}
function cheapPriority(game:Game,event:GameEvent):number {
  if(event.type==='swap')return 100
  if(event.type==='pass')return 0
  const middle=(game.size-1)/2
  let score=game.size-Math.abs(Math.floor(event.index/game.size)-middle)-Math.abs(event.index%game.size-middle)
  for(const n of graph(game.size)[event.index])score+=game.board[n]===game.turn?5:game.board[n]?3:0
  return score
}
function actions(game:Game):GameEvent[] {
  if(game.winner)return []
  const moves=legalMoves(game).map(index=>({type:'place',index} as const))
  const result:GameEvent[]=moves.length ? moves : [{type:'pass'}]
  if(canSwap(game))result.push({type:'swap'})
  return result.sort((a,b)=>cheapPriority(game,b)-cheapPriority(game,a))
}
export function chooseMove(game:Game, options:SearchOptions):SearchResult {
  const now=options.now??(()=>performance.now()), started=now(), deadline=started+Math.max(0,Math.min(1500,options.budgetMs))
  const root=playerFor(game,game.turn), beam=Math.max(2,Math.min(24,options.beam??10)), maxDepth=Math.max(1,Math.min(6,options.maxDepth??3))
  const candidates=actions(game)
  let best:GameEvent|null=candidates[0]??null, depth=0, nodes=0, timedOut=false
  const result=():SearchResult=>({action:best,depth,nodes,elapsedMs:Math.max(0,now()-started),timedOut})
  if(!best || candidates.length===1)return result()
  // The central opening is powerful: take it with the legal pie-rule option.
  if(canSwap(game) && game.lastMove===Math.floor(game.board.length/2)){best={type:'swap'};return result()}
  const check=()=>{ if(now()>=deadline)throw TIMEOUT }
  type Child={event:GameEvent;game:Game;score:number}
  function ordered(state:Game, events:GameEvent[], limit:number, threats:number[]=[]):Child[] {
    const maximizing=playerFor(state,state.turn)===root, children:Child[]=[]
    for(const event of events){
      check()
      const next=applyEvent(state,event)
      if(!next)continue
      const score=evaluate(next,root)-(threats.some(index=>isLegal(next,index))?WIN/2:0)
      children.push({event,game:next,score})
      nodes++
    }
    children.sort((a,b)=>maximizing?b.score-a.score:a.score-b.score)
    return children.slice(0,limit)
  }
  function search(state:Game, remaining:number, alpha:number, beta:number):number {
    check(); nodes++
    if(state.winner || remaining===0)return evaluate(state,root)
    const maximizing=playerFor(state,state.turn)===root
    let value=maximizing?-Infinity:Infinity
    const moves=ordered(state,actions(state),beam)
    for(const child of moves){
      const score=search(child.game,remaining-1,alpha,beta)
      value=maximizing?Math.max(value,score):Math.min(value,score)
      if(maximizing)alpha=Math.max(alpha,value);else beta=Math.min(beta,value)
      if(alpha>=beta)break
    }
    return Number.isFinite(value)?value:evaluate(state,root)
  }
  try {
    // Check every legal immediate win before selective deeper search.
    for(const action of candidates){check();const next=applyEvent(game,action)!;if(next.winner && playerFor(next,next.winner)===root){best=action;depth=1;return result()}}
    const threats:number[]=[]
    for(let index=0;index<game.board.length;index++)if(!game.board[index]){
      check()
      const board=[...game.board];board[index]=other(game.turn)
      if(connectedPath(board,game.size,other(game.turn)).length)threats.push(index)
    }
    // Keep moves that deny an immediate opponent win (including by the adjacency
    // restriction), even when selective beam search would otherwise drop them.
    const isSafe=(next:Game)=>!threats.some(index=>isLegal(next,index))
    if(threats.length){const safeFallback=candidates.find(action=>isSafe(applyEvent(game,action)!));if(safeFallback)best=safeFallback}
    const rankedRoots=ordered(game,candidates,Math.max(beam,12),threats)
    const safeRoots=threats.length?rankedRoots.filter(child=>isSafe(child.game)):[]
    const roots=safeRoots.length?safeRoots:rankedRoots
    if(roots[0])best=roots[0].event
    for(let currentDepth=1;currentDepth<=maxDepth;currentDepth++){
      let iterationBest:GameEvent|null=best; let value=-Infinity
      for(const child of roots){
        const score=search(child.game,currentDepth-1,value,Infinity)
        if(score>value){value=score;iterationBest=child.event}
      }
      // Publish only a fully completed depth. A timeout keeps the last sound choice.
      best=iterationBest;depth=currentDepth
      if(value===WIN)break
    }
  }catch(error){if(error!==TIMEOUT)throw error;timedOut=true}
  return result()
}
