import type { Color, Game, Player } from '../game'
import { other } from '../game'
import { graph, terminalScore } from './position'
export type Evaluation = 'distance' | 'routes' | 'resistance'
type Paths = {distance:number; width:number; bottlenecks:number}
function distances(game:Game,color:Color,reverse:boolean):Float64Array {
  const n=game.board.length, dist=new Float64Array(n).fill(1000)
  const forbidden=game.turn===color && game.lastMove!==null?graph(game.size)[game.lastMove]:[]
  const cost=(i:number)=>game.board[i]===color?0:1+(forbidden.includes(i)?.35:0)
  // Binary-heap Dijkstra preserves the same distances while avoiding a full
  // board scan for every extracted node, especially on 9/11 boards.
  const heapCells:number[]=[],heapCosts:number[]=[]
  const push=(cell:number,weight:number)=>{
    let at=heapCells.length;heapCells.push(cell);heapCosts.push(weight)
    while(at>0){
      const parent=(at-1)>>1
      if(heapCosts[parent]<=weight)break
      heapCells[at]=heapCells[parent];heapCosts[at]=heapCosts[parent];at=parent
    }
    heapCells[at]=cell;heapCosts[at]=weight
  }
  for(let i=0;i<game.size;i++){
    const cell=color==='blue'?(reverse?(game.size-1)*game.size+i:i):(reverse?i*game.size+game.size-1:i*game.size)
    if(game.board[cell]!==other(color)){dist[cell]=cost(cell);push(cell,dist[cell])}
  }
  while(heapCells.length){
    const cell=heapCells[0],best=heapCosts[0],lastCell=heapCells.pop()!,lastCost=heapCosts.pop()!
    if(heapCells.length){
      let at=0
      while(at*2+1<heapCells.length){
        let child=at*2+1
        if(child+1<heapCells.length&&heapCosts[child+1]<heapCosts[child])child++
        if(heapCosts[child]>=lastCost)break
        heapCells[at]=heapCells[child];heapCosts[at]=heapCosts[child];at=child
      }
      heapCells[at]=lastCell;heapCosts[at]=lastCost
    }
    if(best!==dist[cell])continue
    for(const next of graph(game.size)[cell])if(game.board[next]!==other(color)){
      const candidate=best+cost(next)
      if(candidate<dist[next]){dist[next]=candidate;push(next,candidate)}
    }
  }
  return dist
}
export function connectionDistance(game:Game,color:Color):number {
  const dist=distances(game,color,false)
  let best=1000
  for(let i=0;i<game.size;i++)best=Math.min(best,dist[color==='blue'?(game.size-1)*game.size+i:i*game.size+game.size-1])
  return Math.min(game.size*3,best)
}
function paths(game:Game,color:Color):Paths {
  const first=distances(game,color,false),last=distances(game,color,true)
  let distance=1000
  for(let i=0;i<game.size;i++)distance=Math.min(distance,first[color==='blue'?(game.size-1)*game.size+i:i*game.size+game.size-1])
  if(distance>=1000)return {distance:game.size*3,width:0,bottlenecks:game.size}
  const levels=new Map<number,number>(),blocked=game.turn===color&&game.lastMove!==null?graph(game.size)[game.lastMove]:[]
  for(let i=0;i<game.board.length;i++)if(!game.board[i]){
    const cost=1+(blocked.includes(i)?.35:0)
    // Count actual empty alternatives on equally short routes, grouped by cost
    // from the start. Shared own-stone segments are not fictitious bridges.
    if(first[i]+last[i]-cost<=distance+.001){
      const level=Math.round(first[i]*100)
      levels.set(level,(levels.get(level)??0)+1)
    }
  }
  const widths=[...levels.values()]
  return {distance,width:widths.reduce((sum,n)=>sum+Math.log2(n),0)/Math.max(1,widths.length),
    bottlenecks:widths.filter(n=>n===1).length/Math.max(1,widths.length)}
}
// Fixed-sweep resistor-network proxy. Own stones conduct strongly, empty cells
// conduct weakly, opponent stones are absent. This is a heuristic, not a proof.
export function conductance(game:Game,color:Color):number {
  const adjacency=graph(game.size),n=game.board.length,voltage=new Float64Array(n),next=new Float64Array(n)
  const forbidden=game.turn===color&&game.lastMove!==null?adjacency[game.lastMove]:[]
  const resistance=(i:number)=>game.board[i]===color?.08:1+(forbidden.includes(i)?.35:0)
  const enabled=(i:number)=>game.board[i]!==other(color)
  const near=(i:number)=>color==='blue'?Math.floor(i/game.size)===0:i%game.size===0
  const far=(i:number)=>color==='blue'?Math.floor(i/game.size)===game.size-1:i%game.size===game.size-1
  const weights=adjacency.map((neighbors,i)=>neighbors.map(j=>enabled(i)&&enabled(j)?2/(resistance(i)+resistance(j)):0))
  for(let i=0;i<n;i++)voltage[i]=color==='blue'?1-Math.floor(i/game.size)/(game.size-1):1-(i%game.size)/(game.size-1)
  for(let sweep=0;sweep<24;sweep++){
    for(let i=0;i<n;i++)if(enabled(i)){
      let sum=near(i)?2/resistance(i):0,total=(near(i)?2/resistance(i):0)+(far(i)?2/resistance(i):0)
      for(let j=0;j<adjacency[i].length;j++){const w=weights[i][j];sum+=w*voltage[adjacency[i][j]];total+=w}
      next[i]=total?sum/total:0
    }
    voltage.set(next)
  }
  // Average source and sink flow reduces finite-iteration directional bias.
  let source=0,sink=0
  for(let i=0;i<n;i++)if(enabled(i)){if(near(i))source+=(1-voltage[i])*2/resistance(i);if(far(i))sink+=voltage[i]*2/resistance(i)}
  return Math.max(.00001,(source+sink)/2)
}
export function evaluate(game:Game,root:Player,kind:Evaluation='routes'):number {
  const terminal=terminalScore(game,root)
  if(terminal!==null)return terminal
  const own:Color=game.bluePlayer===root?'blue':'red',enemy=other(own)
  let score:number
  if(kind==='routes'){
    const ours=paths(game,own),theirs=paths(game,enemy)
    score=(theirs.distance-ours.distance)*100+18*(ours.width-theirs.width)-12*(ours.bottlenecks-theirs.bottlenecks)
  }else{
    score=(connectionDistance(game,enemy)-connectionDistance(game,own))*100
    if(kind==='resistance')score+=40*Math.log(conductance(game,own)/conductance(game,enemy))
  }
  const mid=(game.size-1)/2
  for(let i=0;i<game.board.length;i++)if(game.board[i]){
    const centrality=game.size-Math.abs(Math.floor(i/game.size)-mid)-Math.abs(i%game.size-mid)
    score+=(game.board[i]===own?1:-1)*centrality*2
  }
  return score
}
