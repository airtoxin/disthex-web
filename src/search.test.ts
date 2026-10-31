import { describe, expect, it } from 'vitest'
import { applyEvent, connectedPath, initialGame, other } from './game'
import type { BoardSize, Game, GameEvent } from './game'
import { chooseMove, retainCandidates } from './ai'
import type { Candidate } from './ai'
import { actions, advance, allowed, denies, stateKey, winningCells } from './search/position'
import { conductance, evaluate, connectionDistance } from './search/evaluate'
import { chooseMove as old, connectionDistance as oldDistance } from '../research/ai-v1'
import { chooseMcts, seededRandom } from '../research/mcts'
const play=(events:number[])=>events.reduce((game,index)=>{
  const next=applyEvent(game,{type:'place',index});expect(next).not.toBeNull();return next!
},initialGame(7))
const threat=[48,0,47,1,46,2,45,3,44,4,43,5]
const blocked=[2,25,46,43,47,30,45,17,15,34,24,5,44,35,21,3,22,48,18,31,0,27,13,39,20,38,7,40,14,32,12,42,16,11,33,19,37,9,36,4,8,41,6,10,23,1,26,28]
describe('complete Disthex search states and rules parity',()=>{
  it('keys distinguish restriction, turn, color ownership, swap right, placement count and size',()=>{
    const game=play([24]),key=stateKey(game)
    for(const change of [{lastMove:null},{lastMove:0},{turn:'blue' as const},{bluePlayer:2 as const},{swapped:true},{placements:2},{size:9 as const},{winner:'blue' as const}])
      expect(stateKey({...game,...change})).not.toBe(key)
    expect(stateKey({...game,board:[...game.board]})).toBe(key)
  })
  it.each([7,9,11] as BoardSize[])('matches authoritative rules for every action across sampled %s states',size=>{
    const random=seededRandom(2027+size);let game=initialGame(size)
    for(let ply=0;ply<36&&!game.winner;ply++){
      const before=JSON.stringify(game),events=actions(game)
      for(const event of events)expect(advance(game,event)).toEqual(applyEvent(game,event))
      for(const color of ['blue','red'] as const){
        const actual=winningCells(game,color)
        const expected=game.board.flatMap((cell,index)=>{
          if(cell)return []
          const board=[...game.board];board[index]=color
          return connectedPath(board,size,color).length?[index]:[]
        })
        expect(actual).toEqual(expected)
        expect(connectionDistance(game,color)).toBeCloseTo(oldDistance(game,color),10)
      }
      expect(JSON.stringify(game)).toBe(before)
      game=advance(game,events[Math.floor(random()*events.length)])
    }
  })
  it('preserves swap and mandatory pass transitions, including clearing the old restriction',()=>{
    const opening=play([24]);expect(advance(opening,{type:'swap'})).toEqual(applyEvent(opening,{type:'swap'}))
    const state=play(blocked);expect(actions(state)).toEqual([{type:'pass'}])
    const passed=advance(state,{type:'pass'})
    expect(passed).toEqual(applyEvent(state,{type:'pass'}));expect(passed.lastMove).toBeNull()
    expect(actions(passed)).toEqual([{type:'place',index:29}])
    expect(advance(passed,{type:'place',index:29}).winner).toBe('red')
  })
})
describe('temporary bans and global tactical coverage',()=>{
  it('a block lasts one turn, and distant play reopens the threatened point',()=>{
    const game=play(threat)
    expect(winningCells(game,'red')).toEqual([6])
    expect(actions(game).filter(event=>denies(game,event,[6]))).toEqual([{type:'place',index:13}])
    const banned=advance(game,{type:'place',index:13})
    expect(allowed(banned,6)).toBe(false)
    const distant=advance(banned,{type:'place',index:28})
    expect(allowed(distant,6)).toBe(true)
    expect(winningCells(distant,'red')).toEqual([6])
    const move=chooseMove(distant,{budgetMs:150,maxDepth:2}).action!
    expect(denies(distant,move,[6])).toBe(true)
    const careless=advance(distant,{type:'place',index:14})
    expect(advance(careless,{type:'place',index:6}).winner).toBe('red')
  })
  it('one legal move denies three separate next-turn wins by occupancy and temporary bans',()=>{
    const game=play([11,26,7,38,30,4,14,25,27,36,32,3,31,41,19,23,0,17,48,20,45,29,39,13,10,6,9,12,2,24])
    const threats=winningCells(game,'red')
    expect(threats).toEqual([28,35,42])
    expect(actions(game).filter(event=>denies(game,event,threats))).toEqual([{type:'place',index:35}])
    for(const evaluation of ['distance','routes','resistance'] as const)
      expect(chooseMove(game,{budgetMs:120,maxDepth:2,evaluation}).action).toEqual({type:'place',index:35})
    const reply=advance(game,{type:'place',index:35})
    expect(winningCells(reply,'red').filter(index=>allowed(reply,index))).toEqual([])
  })
  it('retains distant forcing and multiple-threat defensive candidates outside the quiet quota',()=>{
    const game=initialGame(7)
    const candidates:Candidate[]=actions(game).map(event=>({event,game,score:0,forcing:false,defense:false}))
    candidates[41].forcing=true;candidates[47].defense=true
    const result=retainCandidates(candidates,2,7)
    expect(result).toContain(candidates[41]);expect(result).toContain(candidates[47])
    const regions=new Set(result.map(({event})=>event.type==='place'?Math.floor(Math.floor(event.index/7)*3/7)*3+Math.floor((event.index%7)*3/7):-1))
    expect(regions.size).toBe(9)
    expect(denies(game,{type:'place',index:24},[17,18,23,25,30,31])).toBe(true)
    expect(denies(game,{type:'pass'},[17])).toBe(false)
  })
  it('extends forcing exchanges at a nominal one-ply horizon',()=>{
    const game=play([0,6,7,13,14,20,21,27,28,34])
    const on=chooseMove(game,{budgetMs:200,maxDepth:1,extensions:true,now:()=>0})
    const off=chooseMove(game,{budgetMs:200,maxDepth:1,extensions:false,now:()=>0})
    expect(applyEvent(game,on.action!)).not.toBeNull()
    expect(on.stats?.tacticalExtensions).toBeGreaterThan(0)
    expect(off.stats?.tacticalExtensions).toBe(0)
  })
  it('cached and uncached completed searches agree',()=>{
    const game=play(threat)
    const cached=chooseMove(game,{budgetMs:100,maxDepth:2,cache:true,now:()=>0})
    const uncached=chooseMove(game,{budgetMs:100,maxDepth:2,cache:false,now:()=>0})
    expect(cached.action).toEqual(uncached.action);expect(cached.depth).toBe(uncached.depth)
  })
})
describe('bounded old, enhanced and Monte Carlo policies',()=>{
  it.each([7,9,11] as BoardSize[])('keeps legal immutable %s positions under zero/short budgets',size=>{
    const random=seededRandom(301+size);let game=initialGame(size)
    for(let ply=0;ply<20&&!game.winner;ply++){
      const before=JSON.stringify(game)
      for(const policy of [old,chooseMove,chooseMcts]){
        for(const budgetMs of [0,2]){
          const answer=policy(game,{budgetMs,maxDepth:2})
          expect(answer.action).not.toBeNull()
          expect(applyEvent(game,answer.action!)).not.toBeNull()
        }
      }
      expect(JSON.stringify(game)).toBe(before)
      const events=actions(game);game=advance(game,events[Math.floor(random()*events.length)])
    }
  },10000)
  it('all policies take a legal forced pass, a center swap and a final win',()=>{
    for(const policy of [old,chooseMove,chooseMcts]){
      expect(policy(play([24]),{budgetMs:10}).action).toEqual({type:'swap'})
      const state=play(blocked)
      expect(policy(state,{budgetMs:10}).action).toEqual({type:'pass'})
      const passed=advance(state,{type:'pass'}),event=policy(passed,{budgetMs:10}).action!
      const end=advance(passed,event)
      expect(end.winner).toBe('red');expect(policy(end,{budgetMs:10}).action).toBeNull()
    }
  })
  it('evaluation variants are finite and respect color/goal transposition',()=>{
    const game=play([24,0,47,6,42,3,35,13])
    const transpose=(state:Game):Game=>({...state,board:state.board.map((_,i)=>state.board[(i%7)*7+Math.floor(i/7)]).map(cell=>cell?other(cell):null),
      turn:other(state.turn),bluePlayer:state.bluePlayer===1?2:1,lastMove:state.lastMove===null?null:(state.lastMove%7)*7+Math.floor(state.lastMove/7)})
    for(const kind of ['distance','routes','resistance'] as const){
      expect(Number.isFinite(evaluate(game,1,kind))).toBe(true)
      expect(evaluate(transpose(game),1,kind)).toBeCloseTo(evaluate(game,1,kind),7)
    }
    expect(conductance(game,'blue')).toBeGreaterThan(0)
  })
  it('throws rather than accepting an illegal search transition',()=>{
    const game=play([24])
    const events:GameEvent[]=[{type:'place',index:24},{type:'place',index:23},{type:'pass'}]
    for(const event of events)expect(()=>advance(game,event)).toThrow()
  })
})
