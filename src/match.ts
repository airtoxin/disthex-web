import { canPass, newSession, parseSession, playerFor, replay } from './game'
import type { BoardSize, Player, Session } from './game'
import type { Difficulty } from './ai'
export type Settings={mode:'local'|'cpu';humanPlayer:Player;difficulty:Difficulty}
export type Match={version:2;session:Session;settings:Settings}
export const DEFAULT_SETTINGS:Settings={mode:'local',humanPlayer:1,difficulty:'normal'}
export const newMatch=(size:BoardSize=7,settings:Settings=DEFAULT_SETTINGS):Match=>({version:2,session:newSession(size),settings:{...settings}})
export function parseMatch(raw:string|null):Match|null{
  if(!raw)return null
  try{
    const value=JSON.parse(raw)
    if(value?.version===1){const session=parseSession(raw);return session?{version:2,session,settings:{...DEFAULT_SETTINGS}}:null}
    if(value?.version!==2)return null
    const session=parseSession(JSON.stringify(value.session)), s=value.settings
    if(!session || !s || !['local','cpu'].includes(s.mode) || ![1,2].includes(s.humanPlayer) || !['easy','normal','deep'].includes(s.difficulty))return null
    return {version:2,session,settings:{mode:s.mode,humanPlayer:s.humanPlayer,difficulty:s.difficulty}}
  }catch{return null}
}
// Return to the position before the human's latest decision, including after a swap
// or an automatic pass. Never erase a CPU opening with no human decision to undo.
export function decisionUndoCursor(match:Match):number{
  const {session,settings}=match
  if(settings.mode==='local')return Math.max(0,session.cursor-1)
  for(let cursor=session.cursor-1;cursor>=0;cursor--){
    const game=replay({...session,cursor})
    if(playerFor(game,game.turn)===settings.humanPlayer && session.events[cursor].type!=='pass')return cursor
  }
  return session.cursor
}
export function decisionRedoCursor(match:Match):number{
  const {session,settings}=match
  if(settings.mode==='local')return Math.min(session.events.length,session.cursor+1)
  for(let cursor=session.cursor+1;cursor<=session.events.length;cursor++){
    const game=replay({...session,cursor})
    if(game.winner || (playerFor(game,game.turn)===settings.humanPlayer && !canPass(game)))return cursor
  }
  return session.events.length
}
