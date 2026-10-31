import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try{
 const {chooseMove,LEVELS}=await server.ssrLoadModule('/src/ai.ts'),rules=await server.ssrLoadModule('/src/game.ts')
 const timings=[]
 for(const size of [7,9,11]){
  const game=rules.applyEvent(rules.initialGame(size),{type:'place',index:0})
  for(const [level,options] of Object.entries(LEVELS)){
   const start=performance.now(),result=chooseMove(game,options)
   timings.push({size,level,budgetMs:options.budgetMs,wallMs:performance.now()-start,...result,legal:!!rules.applyEvent(game,result.action)})
  }
 }
 const events=[9,'swap',23,28,42,26,13,29,21,19,11,22,12].map(index=>index==='swap'?{type:'swap'}:{type:'place',index})
 const game=events.reduce((state,event)=>rules.applyEvent(state,event),rules.initialGame(7))
 const extensions=[1,2,3].map(maxDepth=>({maxDepth,on:chooseMove(game,{budgetMs:250,maxDepth}),off:chooseMove(game,{budgetMs:250,maxDepth,extensions:false})}))
 writeFileSync('research/results/timings.json',JSON.stringify({timings,extensions},null,2))
 console.log(JSON.stringify({timings,extensions},null,2))
}finally{await server.close()}
