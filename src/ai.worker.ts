import { chooseMove, LEVELS } from './ai'
import type { Difficulty, SearchResult } from './ai'
import type { Game } from './game'
export type AiRequest={id:number;game:Game;difficulty:Difficulty}
export type AiResponse={id:number;result?:SearchResult;error?:string}
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<AiRequest>)=>void)|null;postMessage:(message:AiResponse)=>void}
scope.onmessage=({data})=>{
  try{scope.postMessage({id:data.id,result:chooseMove(data.game,LEVELS[data.difficulty])})}
  catch{scope.postMessage({id:data.id,error:'CPUの探索を完了できませんでした。'})}
}
