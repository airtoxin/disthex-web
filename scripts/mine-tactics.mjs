import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try{
 const p=await server.ssrLoadModule('/src/search/position.ts'),g=await server.ssrLoadModule('/src/game.ts'),{seededRandom}=await server.ssrLoadModule('/research/mcts.ts')
 const start=performance.now(),found=[]
 for(let seed=1;seed<150&&found.length<3&&performance.now()-start<15000;seed++){
  const random=seededRandom(seed);let game=g.initialGame(7);const events=[]
  for(let ply=0;ply<48&&!game.winner;ply++){
   const enemy=p.winningCells(game,g.other(game.turn)),own=p.winningCells(game,game.turn)
   if(enemy.length>=2&&!own.some(i=>p.allowed(game,i))){
    const safe=p.actions(game).filter(event=>p.denies(game,event,enemy))
    if(safe.length){found.push({seed,events:[...events],threats:enemy,defenses:safe});break}
   }
   const legal=p.actions(game),event=legal[Math.floor(random()*legal.length)]
   events.push(event);game=p.advance(game,event)
  }
 }
 writeFileSync('research/tactical-fixtures.json',JSON.stringify(found,null,2))
 console.log(JSON.stringify(found))
}finally{await server.close()}
