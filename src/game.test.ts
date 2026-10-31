import { describe, expect, it } from 'vitest'
import { applyEvent, canSwap, connectedPath, forbiddenCells, initialGame, isLegal, legalMoves, neighbors, newSession, parseSession, playerFor, record, redo, replay, undo } from './game'
import type { BoardSize, Color, Game, Session } from './game'
const blueWin = [0,6,7,13,14,20,21,27,28,34,35,41,42]
const redWin = [0,21,1,22,2,23,3,24,4,25,5,26,6,27]
function play(indices: number[]): Session { return indices.reduce((session, index) => record(session, { type: 'place', index }), newSession()) }
export const blockedCoordinates = [[0,2],[3,4],[6,4],[6,1],[6,5],[4,2],[6,3],[2,3],[2,1],[4,6],[3,3],[0,5],[6,2],[5,0],[3,0],[0,3],[3,1],[6,6],[2,4],[4,3],[0,0],[3,6],[1,6],[5,4],[2,6],[5,3],[1,0],[5,5],[2,0],[4,4],[1,5],[6,0],[2,2],[1,4],[4,5],[2,5],[5,2],[1,2],[5,1],[0,4],[1,1],[5,6],[0,6],[1,3],[3,2],[0,1],[3,5],[4,0]]
describe('Disthex rules', () => {
  it.each([7,9,11] as BoardSize[])('starts with every cell legal on %s×%s', size => {
    const game = initialGame(size)
    expect(legalMoves(game)).toHaveLength(size * size)
    expect(game.turn).toBe('blue')
    expect(canSwap(game)).toBe(false)
  })
  it('uses exactly the six Hex neighbors with no row wrap', () => {
    expect(neighbors(24,7).sort((a,b)=>a-b)).toEqual([17,18,23,25,30,31])
    expect(neighbors(0,7).sort((a,b)=>a-b)).toEqual([1,7])
    expect(neighbors(6,7).sort((a,b)=>a-b)).toEqual([5,12,13])
    expect(neighbors(48,7).sort((a,b)=>a-b)).toEqual([41,47])
  })
  it('blocks only the latest stone and reopens older neighbors', () => {
    let game = replay(play([24]))
    expect(forbiddenCells(game).sort((a,b)=>a-b)).toEqual([17,18,23,25,30,31])
    expect(isLegal(game,23)).toBe(false)
    game = applyEvent(game,{ type:'place', index:0 })!
    expect(isLegal(game,23)).toBe(true)
    expect(isLegal(game,1)).toBe(false)
    expect(isLegal(game,7)).toBe(false)
    expect(isLegal(game,24)).toBe(false)
  })
  it('rejects illegal, fractional and out-of-bounds moves without mutation', () => {
    const game = replay(play([24]))
    const before = JSON.stringify(game)
    for (const index of [-1,49,1.2,NaN,24,23]) expect(applyEvent(game,{ type:'place',index })).toBeNull()
    expect(JSON.stringify(game)).toBe(before)
  })
  it('swaps players, not stones/goals, and preserves the opening restriction and red turn', () => {
    const before = replay(play([24]))
    expect(canSwap(before)).toBe(true)
    const game = applyEvent(before,{ type:'swap' })!
    expect(game.board).toEqual(before.board)
    expect(game.turn).toBe('red')
    expect(playerFor(game,'red')).toBe(1)
    expect(playerFor(game,'blue')).toBe(2)
    expect(game.lastMove).toBe(24)
    expect(isLegal(game,23)).toBe(false)
    expect(canSwap(game)).toBe(false)
    expect(applyEvent(game,{ type:'swap' })).toBeNull()
    const next = applyEvent(game,{ type:'place',index:0 })!
    expect(next.turn).toBe('blue')
    expect(playerFor(next,next.turn)).toBe(2)
  })
  it('ends the swap option when player 2 places a stone', () => expect(canSwap(replay(play([24,0])))).toBe(false))
  it.each([[blueWin,'blue'],[redWin,'red']] as const)('recognizes a completed connection and prevents further play', (moves,color) => {
    const session = play([...moves])
    expect(session.cursor).toBe(moves.length)
    const game = replay(session)
    expect(game.winner).toBe(color)
    expect(game.winningPath).toHaveLength(7)
    expect(legalMoves(game)).toEqual([])
    expect(applyEvent(game,{ type:'place',index:48 })).toBeNull()
  })
  it('detects a winding chain but not a wrong-color or disconnected chain', () => {
    const board: (Color|null)[] = Array(49).fill(null)
    ;[3,9,16,22,29,35,42].forEach(index => board[index]='blue')
    expect(connectedPath(board,7,'blue')).toHaveLength(7)
    expect(connectedPath(board,7,'red')).toEqual([])
    board[22]='red'
    expect(connectedPath(board,7,'blue')).toEqual([])
  })
  it('reaches the author-review fixture with only a forbidden cell remaining', () => {
    const session = play(blockedCoordinates.map(([r,c])=>r*7+c))
    expect(session.cursor).toBe(48)
    const game = replay(session)
    expect(game.winner).toBeNull()
    expect(game.turn).toBe('blue')
    expect(game.board[29]).toBeNull()
    expect(game.lastMove).toBe(28)
    expect(legalMoves(game)).toEqual([])
  })
  it('maintains legal and immutable transitions across 100 deterministic playouts', () => {
    let seed=12345
    const random=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296 }
    for(let n=0;n<100;n++){
      let game:Game=initialGame(7)
      while(!game.winner){
        const moves=legalMoves(game)
        if(!moves.length)break
        const move=moves[Math.floor(random()*moves.length)], old=JSON.stringify(game)
        const next=applyEvent(game,{type:'place',index:move})!
        expect(next.board.filter(Boolean)).toHaveLength(game.placements+1)
        expect(JSON.stringify(game)).toBe(old)
        game=next
      }
      expect(game.winner !== null || legalMoves(game).length===0).toBe(true)
    }
  })
})
describe('history and browser persistence', () => {
  it('undoes and redoes wins and swaps with exact ownership and restrictions', () => {
    let session=record(play([24]),{type:'swap'})
    const swapped=replay(session)
    session=undo(session)
    expect(replay(session).bluePlayer).toBe(1)
    expect(canSwap(replay(session))).toBe(true)
    expect(replay(redo(session))).toEqual(swapped)
    const win=play(blueWin)
    expect(replay(undo(win)).winner).toBeNull()
    expect(replay(redo(undo(win)))).toEqual(replay(win))
  })
  it('truncates the redo branch after a new move and bounds the history cursor', () => {
    const old=play([24,0,48])
    const changed=record(undo(old),{type:'place',index:47})
    expect(changed.events.at(-1)).toEqual({type:'place',index:47})
    expect(redo(changed).cursor).toBe(3)
    expect(undo(newSession()).cursor).toBe(0)
  })
  it('restores the full timeline including undone moves', () => {
    const session=undo(play([24,0,48]))
    expect(parseSession(JSON.stringify(session))).toEqual(session)
  })
  it('rejects corrupt, oversized, illegal and incompatible saved games', () => {
    for(const value of ['bad','null','{}',JSON.stringify({...newSession(),size:8}),JSON.stringify({...newSession(),cursor:-1}),JSON.stringify({...newSession(),events:[{type:'place',index:24},{type:'place',index:23}],cursor:2}),JSON.stringify({...newSession(),events:[null],cursor:1})]) expect(parseSession(value)).toBeNull()
  })
})
