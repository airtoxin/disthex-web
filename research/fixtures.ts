import { initialGame, applyEvent } from '../src/game'
import type { BoardSize, Game, GameEvent } from '../src/game'
import { actions } from '../src/search/position'
import { seededRandom } from './mcts'

export type Fixture={id:string;split:'tune'|'holdout'|'scale';size:BoardSize;events:GameEvent[]}
export function generatedFixture(id:string,split:Fixture['split'],size:BoardSize,seed:number,length:number,first?:number):Fixture {
  const random=seededRandom(seed),events:GameEvent[]=[]
  let game=initialGame(size)
  if(first!==undefined){const event:GameEvent={type:'place',index:first};game=applyEvent(game,event)!;events.push(event)}
  while(events.length<length&&!game.winner){
    const legal=actions(game),event=legal[Math.floor(random()*legal.length)]
    events.push(event);game=applyEvent(game,event)!
  }
  if(game.winner)throw new Error('Fixture must be nonterminal')
  return {id,split,size,events}
}
export function fixtureGame(fixture:Fixture):Game {
  return fixture.events.reduce((game,event)=>{
    const next=applyEvent(game,event);if(!next)throw new Error('Invalid fixture');return next
  },initialGame(fixture.size))
}
export const tuning=[
  generatedFixture('tune-empty','tune',7,11,0),
  generatedFixture('tune-offset','tune',7,22,1,9),
  generatedFixture('tune-scattered','tune',7,33,12),
  generatedFixture('tune-midgame','tune',7,44,26),
]
export const holdout=[
  generatedFixture('holdout-center','holdout',7,107,1,24),
  generatedFixture('holdout-corner','holdout',7,211,1,0),
  generatedFixture('holdout-offset','holdout',7,307,1,19),
  generatedFixture('holdout-early','holdout',7,409,8),
  generatedFixture('holdout-scattered','holdout',7,503,14),
  generatedFixture('holdout-middle','holdout',7,601,20),
  generatedFixture('holdout-late-a','holdout',7,709,28),
  generatedFixture('holdout-late-b','holdout',7,809,30),
]
export const scale=([9,11] as BoardSize[]).flatMap(size=>[
  generatedFixture('scale-'+size+'-opening','scale',size,907+size,1,0),
  generatedFixture('scale-'+size+'-middle','scale',size,1009+size,Math.floor(size*size*.45)),
])

export const fresh=[
  generatedFixture('fresh-7-offset','holdout',7,2003,1,16),
  ...[2011,2017,2027,2029,2039,2053,2063].map((seed,i)=>generatedFixture('fresh-7-'+seed,'holdout',7,seed,4+i*4)),
  ...([9,11] as BoardSize[]).flatMap(size=>[
    generatedFixture('fresh-'+size+'-offset','holdout',size,3001+size,1,Math.floor(size*size/2)-2),
    generatedFixture('fresh-'+size+'-middle','holdout',size,4001+size,Math.floor(size*size*.3)),
  ])
]
