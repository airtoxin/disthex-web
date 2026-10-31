import { describe, expect, it } from 'vitest'
import { chooseMove, connectionDistance, LEVELS } from './ai'
import { applyEvent, canSwap, initialGame, newSession, playerFor, record, replay } from './game'
import { decisionRedoCursor, decisionUndoCursor, newMatch, parseMatch } from './match'
import type { BoardSize, GameEvent } from './game'
const blueWin=[0,6,7,13,14,20,21,27,28,34,35,41,42]
const redThreat=[48,0,47,1,46,2,45,3,44,4,43,5]
const play=(moves:number[])=>moves.reduce((s,index)=>record(s,{type:'place',index}),newSession())
const blocked=[[0,2],[3,4],[6,4],[6,1],[6,5],[4,2],[6,3],[2,3],[2,1],[4,6],[3,3],[0,5],[6,2],[5,0],[3,0],[0,3],[3,1],[6,6],[2,4],[4,3],[0,0],[3,6],[1,6],[5,4],[2,6],[5,3],[1,0],[5,5],[2,0],[4,4],[1,5],[6,0],[2,2],[1,4],[4,5],[2,5],[5,2],[1,2],[5,1],[0,4],[1,1],[5,6],[0,6],[1,3],[3,2],[0,1],[3,5],[4,0]]
describe('CPU strategy and bounds',()=>{
  it.each([7,9,11] as BoardSize[])('returns a legal move within each configured %s×%s budget',size=>{
    for(const config of Object.values(LEVELS)){
      const game=applyEvent(initialGame(size),{type:'place',index:0})!
      const start=performance.now(), result=chooseMove(game,config),elapsed=performance.now()-start
      expect(result.action).not.toBeNull()
      expect(applyEvent(game,result.action!)).not.toBeNull()
      expect(elapsed).toBeLessThan(config.budgetMs+400)
      expect(result.nodes).toBeGreaterThan(0)
    }
  },8000)
  it('takes an immediate connection and returns no action after the game ends',()=>{
    const game=replay(play(blueWin.slice(0,-1)))
    const result=chooseMove(game,LEVELS.normal)
    expect(result.action).toEqual({type:'place',index:42})
    const ended=applyEvent(game,result.action!)!
    expect(chooseMove(ended,LEVELS.deep).action).toBeNull()
    expect(connectionDistance(ended,'blue')).toBe(0)
  })
  it('uses the adjacency rule to deny an opponent immediate win',()=>{
    const game=replay(play(redThreat))
    const result=chooseMove(game,{budgetMs:1000,maxDepth:2,beam:12})
    expect(result.depth).toBeGreaterThanOrEqual(2)
    expect(result.action).toEqual({type:'place',index:13})
    expect(chooseMove(game,{budgetMs:120,maxDepth:1}).action).toEqual({type:'place',index:13})
  })
  it('takes a central opening by swap without changing the last stone or red turn',()=>{
    const before=replay(play([24])),result=chooseMove(before,LEVELS.easy)
    expect(result.action).toEqual({type:'swap'})
    const after=applyEvent(before,result.action!)!
    expect(after.turn).toBe('red');expect(after.lastMove).toBe(24)
    expect(playerFor(after,'blue')).toBe(2)
  })
  it('handles forced pass and the final winning move',()=>{
    const before=replay(play(blocked.map(([r,c])=>r*7+c)))
    const pass=chooseMove(before,LEVELS.easy).action!
    expect(pass).toEqual({type:'pass'})
    const after=applyEvent(before,pass)!
    expect(chooseMove(after,LEVELS.easy).action).toEqual({type:'place',index:29})
  })
  it('has a legal immediate fallback for a zero budget and honors an injected deadline',()=>{
    const game=initialGame(11)
    expect(applyEvent(game,chooseMove(game,{budgetMs:0}).action!)).not.toBeNull()
    let clock=0
    const result=chooseMove(game,{budgetMs:4,now:()=>clock++,maxDepth:6})
    expect(result.timedOut).toBe(true);expect(clock).toBeLessThan(12)
    expect(applyEvent(game,result.action!)).not.toBeNull()
  })
  it('never mutates its input or selects an illegal move over deterministic midgames',()=>{
    let session=newSession()
    for(let i=0;i<30 && !replay(session).winner;i++){
      const game=replay(session),before=JSON.stringify(game),result=chooseMove(game,{budgetMs:12,maxDepth:2})
      expect(result.action).not.toBeNull();expect(applyEvent(game,result.action!)).not.toBeNull()
      expect(JSON.stringify(game)).toBe(before)
      session=record(session,result.action!)
    }
  })
})
describe('CPU match persistence and human-decision history',()=>{
  const cpu=(humanPlayer:1|2=1)=>newMatch(7,{mode:'cpu',humanPlayer,difficulty:'normal'})
  it('migrates legacy local games and rejects malformed CPU settings',()=>{
    const legacy=play([24,0]);expect(parseMatch(JSON.stringify(legacy))?.session).toEqual(legacy)
    expect(parseMatch(JSON.stringify(legacy))?.settings.mode).toBe('local')
    const match=cpu(2);expect(parseMatch(JSON.stringify(match))).toEqual(match)
    expect(parseMatch(JSON.stringify({...match,settings:{...match.settings,humanPlayer:3}}))).toBeNull()
    expect(parseMatch(JSON.stringify({...match,settings:{...match.settings,difficulty:'remote'}}))).toBeNull()
    expect(parseMatch('{')).toBeNull()
  })
  it('undoes to the human decision during and after the CPU reply, with redo',()=>{
    const match={...cpu(),session:play([0,48])}
    expect(decisionUndoCursor(match)).toBe(0)
    const undone={...match,session:{...match.session,cursor:0}}
    expect(decisionRedoCursor(undone)).toBe(2)
    expect(decisionUndoCursor({...match,session:{...match.session,cursor:1}})).toBe(0)
  })
  it('preserves the CPU opening while undoing a human swap and CPU response',()=>{
    const events:GameEvent[]=[{type:'place',index:24},{type:'swap'},{type:'place',index:0}]
    const session=events.reduce(record,newSession()),match={...cpu(2),session}
    expect(decisionUndoCursor(match)).toBe(1)
    const undone={...match,session:{...session,cursor:1}}
    expect(decisionUndoCursor(undone)).toBe(1)
    expect(canSwap(replay(undone.session))).toBe(true)
    expect(decisionRedoCursor(undone)).toBe(3)
    expect(parseMatch(JSON.stringify(undone))).toEqual(undone)
  })
  it('skips automatic passes when finding a human decision',()=>{
    const session=record(record(play(blocked.map(([r,c])=>r*7+c)),{type:'pass'}),{type:'place',index:29})
    const match={...cpu(1),session}
    expect(decisionUndoCursor(match)).toBe(46)
    expect(decisionRedoCursor({...match,session:{...session,cursor:46}})).toBe(50)
  })
})
