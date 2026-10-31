import { canSwap, connectedPath, other, playerFor } from '../game'
import type { Color, Game, GameEvent, Player } from '../game'

const graphs = new Map<number, number[][]>()
export function graph(size: number): number[][] {
  let value = graphs.get(size)
  if (!value) {
    value = Array.from({ length: size * size }, (_, index) => {
      const row = Math.floor(index / size), col = index % size
      return [[-1,0],[1,0],[0,-1],[0,1],[-1,1],[1,-1]]
        .filter(([dr,dc]) => row+dr>=0 && row+dr<size && col+dc>=0 && col+dc<size)
        .map(([dr,dc]) => (row+dr)*size+col+dc)
    })
    graphs.set(size, value)
  }
  return value
}
// Include every rule-relevant field. Equal boards alone are not equal positions.
export function stateKey(game: Game): string {
  return `${game.size}|${game.board.map(x=>x==='blue'?'b':x==='red'?'r':'.').join('')}|${game.turn}|${game.lastMove ?? '-'}|${game.bluePlayer}|${game.swapped?1:0}|${game.placements}|${game.winner ?? '-'}`
}
export function allowed(game: Game, index: number): boolean {
  return !game.winner && index>=0 && index<game.board.length && Number.isInteger(index) &&
    !game.board[index] && (game.lastMove===null || !graph(game.size)[game.lastMove].includes(index))
}
export function actions(game: Game): GameEvent[] {
  if (game.winner) return []
  const moves: GameEvent[] = []
  for (let i=0;i<game.board.length;i++) if (allowed(game,i)) moves.push({type:'place',index:i})
  if (!moves.length && game.board.some(x=>!x)) moves.push({type:'pass'})
  if (canSwap(game)) moves.push({type:'swap'})
  return moves
}
// Flood each real stone component and record the two actual goal contacts.
// This is physical connectivity, not a Hex virtual-connection/bridge inference.
export function winningCells(game: Game, color: Color): number[] {
  if (game.winner) return []
  const adjacency=graph(game.size), masks=new Uint8Array(game.board.length), seen=new Uint8Array(game.board.length)
  const edge=(i:number)=>(color==='blue'?Math.floor(i/game.size)===0:i%game.size===0)?1:0
  const far=(i:number)=>(color==='blue'?Math.floor(i/game.size)===game.size-1:i%game.size===game.size-1)?2:0
  for(let i=0;i<game.board.length;i++) if(game.board[i]===color && !seen[i]) {
    const component=[i];seen[i]=1;let mask=0
    for(let head=0;head<component.length;head++){
      const cell=component[head]; mask|=edge(cell)|far(cell)
      for(const n of adjacency[cell]) if(game.board[n]===color && !seen[n]){seen[n]=1;component.push(n)}
    }
    for(const cell of component)masks[cell]=mask
  }
  const wins:number[]=[]
  for(let i=0;i<game.board.length;i++) if(!game.board[i]){
    let mask=edge(i)|far(i)
    for(const n of adjacency[i])mask|=masks[n]
    if(mask===3)wins.push(i)
  }
  return wins
}
// Search uses immutable, legal children. Differential tests compare this adapter
// with the public rules engine, including winning paths, swaps and forced passes.
export function advance(game: Game, event: GameEvent, wins=winningCells(game,game.turn)): Game {
  if(event.type==='swap'){
    if(!canSwap(game))throw new Error('Illegal search swap')
    return {...game,bluePlayer:2,swapped:true}
  }
  if(event.type==='pass'){
    if(game.winner || !game.board.some(x=>!x) || game.board.some((_,i)=>allowed(game,i)))throw new Error('Illegal search pass')
    return {...game,turn:other(game.turn),lastMove:null}
  }
  if(!allowed(game,event.index))throw new Error('Illegal search placement')
  const board=[...game.board];board[event.index]=game.turn
  const winner=wins.includes(event.index)?game.turn:null
  return {...game,board,turn:other(game.turn),lastMove:event.index,placements:game.placements+1,
    winner,winningPath:winner?connectedPath(board,game.size,winner):[]}
}
export function denies(game: Game, event: GameEvent, threats: number[]): boolean {
  // A placement denies by occupying a winning point or by forbidding it for
  // precisely the next turn. A pass clears all prohibitions.
  return threats.every(index=>event.type==='place' &&
    (event.index===index || graph(game.size)[event.index].includes(index)))
}
export function cheapPriority(game: Game, event: GameEvent): number {
  if(event.type==='swap')return 100
  if(event.type==='pass')return -100
  const mid=(game.size-1)/2
  let score=game.size-Math.abs(Math.floor(event.index/game.size)-mid)-Math.abs(event.index%game.size-mid)
  for(const n of graph(game.size)[event.index])score+=game.board[n]===game.turn?5:game.board[n]?3:0
  return score
}
export const WIN = 100000
export function terminalScore(game: Game, root: Player): number | null {
  return game.winner ? (playerFor(game,game.winner)===root?WIN:-WIN) : null
}
