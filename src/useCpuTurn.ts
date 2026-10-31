import { useEffect, useMemo, useRef, useState } from 'react'
import { applyEvent, canPass, playerFor, replay } from './game'
import { LEVELS } from './ai'
import type { GameEvent } from './game'
import type { Match } from './match'
import type { AiRequest, AiResponse } from './ai.worker'
export function useCpuTurn(match:Match,onAction:(action:GameEvent,expected:Match)=>void,paused:boolean){
  const [attempt,setAttempt]=useState(0)
  const [failure,setFailure]=useState<{match:Match;attempt:number;message:string}|null>(null)
  const serial=useRef(0)
  const game=useMemo(()=>replay(match.session),[match.session])
  const cpuTurn=match.settings.mode==='cpu' && !game.winner && playerFor(game,game.turn)!==match.settings.humanPlayer
  const automaticPass=match.settings.mode==='cpu' && canPass(game)
  const error=failure?.match===match && failure.attempt===attempt?failure.message:null
  useEffect(()=>{
    if(paused || error || (!cpuTurn && !automaticPass))return
    let cancelled=false,finished=false,worker:Worker|undefined
    const id=++serial.current
    const reportError=(message:string)=>{if(!cancelled && !finished){finished=true;worker?.terminate();setFailure({match,attempt,message})}}
    let timer:number
    if(automaticPass){timer=window.setTimeout(()=>{if(!cancelled)onAction({type:'pass'},match)},300)}
    else{
      timer=window.setTimeout(()=>reportError('CPUの応答が時間内に届きませんでした。再開できます。'),LEVELS[match.settings.difficulty].budgetMs+2000)
      try{
        worker=new Worker(new URL('./ai.worker.ts',import.meta.url),{type:'module'})
        worker.onmessage=(event:MessageEvent<AiResponse>)=>{
          if(cancelled || finished || event.data.id!==id)return
          const action=event.data.result?.action
          if(!action || !applyEvent(game,action)){reportError(event.data.error??'CPUの着手を確認できませんでした。再開できます。');return}
          finished=true;window.clearTimeout(timer);worker?.terminate();onAction(action,match)
        }
        worker.onerror=(event)=>{event.preventDefault();reportError('CPUを起動できませんでした。再試行するか、ふたり対戦を選んでください。')}
        worker.postMessage({id,game,difficulty:match.settings.difficulty} satisfies AiRequest)
      }catch{queueMicrotask(()=>reportError('このブラウザではCPUを起動できませんでした。ふたり対戦は利用できます。'))}
    }
    return ()=>{cancelled=true;window.clearTimeout(timer);if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate()}}
  },[match,game,onAction,paused,attempt,cpuTurn,automaticPass,error])
  return {cpuTurn,automaticPass,error,retry:()=>setAttempt(value=>value+1)}
}
