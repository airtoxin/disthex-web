import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { GameEvent } from '../src/game'
import type { AiRequest } from '../src/ai.worker'
type FakeWorker={reply:(action:GameEvent,id?:number)=>void;request:AiRequest;terminated:boolean;onerror:((event:{preventDefault:()=>void})=>void)|null}
const errors=new WeakMap<Page,string[]>()
test.beforeEach(async({page})=>{
  const list:string[]=[];errors.set(page,list)
  page.on('pageerror',error=>list.push(error.message))
  page.on('console',message=>{if(message.type()==='error')list.push(message.text())})
})
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([])})
async function start(page:Page,human:1|2=1,size=7){
  await page.goto('/')
  await page.getByLabel('対戦モード').selectOption('cpu')
  await page.getByLabel('CPUの読み').selectOption('easy')
  await page.getByLabel('盤のサイズ',{exact:true}).selectOption(String(size))
  await page.getByLabel('あなたの手番').selectOption(String(human))
}
async function ready(page:Page){
  await expect.poll(async()=>await page.locator('.turn-card.finished').count()>0 || await page.locator('[data-legal="true"]').count()>0,{timeout:6000}).toBe(true)
  await expect(page.getByRole('alert')).toHaveCount(0)
}
async function move(page:Page,index:number){await page.locator(`[data-cell="${index}"]`).click();await page.getByRole('button',{name:'ここに置く',exact:true}).click()}
async function cursor(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('disthex.game.v1')!).session.cursor as number)}
async function mockCpu(page:Page){
  await page.addInitScript({content:`
    window.__cpuWorkers=[];
    window.Worker=class {
      constructor(){this.onmessage=null;this.onerror=null;this.terminated=false;window.__cpuWorkers.push(this)}
      postMessage(request){this.request=request;const callback=this.onmessage;this.reply=(action,id=request.id)=>callback?.({data:{id,result:{action}}})}
      terminate(){this.terminated=true}
    };
  `})
}
const countWorkers=(page:Page)=>page.evaluate(()=>(window as unknown as {__cpuWorkers:FakeWorker[]}).__cpuWorkers.length)
const reply=(page:Page,index:number,action:GameEvent)=>page.evaluate(({index,action})=>(window as unknown as {__cpuWorkers:FakeWorker[]}).__cpuWorkers[index].reply(action),{index,action})
for(const size of [7,9,11])test(`real worker plays legal replies on ${size}×${size}`,async({page},info)=>{
  await start(page,1,size)
  await move(page,0)
  await ready(page)
  await expect(page.getByRole('status')).toContainText('あなたの手番')
  expect(await cursor(page)).toBe(2)
  const occupied=await page.locator('[data-color="blue"], [data-color="red"]').count()
  expect(occupied).toBeGreaterThanOrEqual(1)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  if(size===7)await page.screenshot({path:`test-results/${info.project.name}-cpu-playing.png`,fullPage:true})
})
test('CPU swaps a central first move; undo, redo and reload keep human color',async({page})=>{
  await start(page)
  await move(page,24);await ready(page)
  expect(await cursor(page)).toBe(2)
  await expect(page.getByRole('status')).toContainText('赤の石')
  await expect(page.locator('[data-cell="24"]')).toHaveAttribute('data-color','blue')
  await expect(page.locator('[data-cell="23"]')).toHaveAttribute('aria-disabled','true')
  await move(page,0);await ready(page)
  await page.getByRole('button',{name:'戻す',exact:true}).click()
  expect(await cursor(page)).toBe(2)
  await expect(page.locator('[data-cell="0"]')).toHaveAttribute('data-color','')
  await page.getByRole('button',{name:'やり直す',exact:true}).click();await ready(page)
  expect(await cursor(page)).toBe(4)
  await page.reload();await ready(page)
  await expect(page.getByRole('status')).toContainText('赤の石')
  expect(await cursor(page)).toBe(4)
})
test('human second waits for CPU opening and can swap, undo and redo the decision',async({page})=>{
  await start(page,2);await ready(page)
  expect(await cursor(page)).toBe(1)
  await expect(page.getByRole('button',{name:'戻す',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'色を交換する'}).click();await ready(page)
  expect(await cursor(page)).toBe(3)
  await expect(page.getByRole('status')).toContainText('青の石')
  await page.getByRole('button',{name:'戻す',exact:true}).click()
  expect(await cursor(page)).toBe(1)
  await expect(page.getByRole('button',{name:'色を交換する'})).toBeVisible()
  await page.getByRole('button',{name:'やり直す',exact:true}).click();await ready(page)
  await expect(page.getByRole('status')).toContainText('青の石')
})
test('a full human vs real CPU game reaches a winner and rematch',async({page})=>{
  await start(page)
  for(let turn=0;turn<60;turn++){
    await ready(page)
    if(await page.locator('.turn-card.finished').count())break
    const index=Number(await page.locator('[data-legal="true"]').first().getAttribute('data-cell'))
    await move(page,index)
  }
  await expect(page.locator('.turn-card.finished')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('の勝利')
  await page.getByRole('button',{name:'もう一局あそぶ'}).click()
  await expect(page.locator('[data-legal="true"]')).toHaveCount(49)
  await expect(page.getByLabel('対戦モード')).toHaveValue('cpu')
})
const blocked=[[0,2],[3,4],[6,4],[6,1],[6,5],[4,2],[6,3],[2,3],[2,1],[4,6],[3,3],[0,5],[6,2],[5,0],[3,0],[0,3],[3,1],[6,6],[2,4],[4,3],[0,0],[3,6],[1,6],[5,4],[2,6],[5,3],[1,0],[5,5],[2,0],[4,4],[1,5],[6,0],[2,2],[1,4],[4,5],[2,5],[5,2],[1,2],[5,1],[0,4],[1,1],[5,6],[0,6],[1,3],[3,2],[0,1],[3,5],[4,0]]
for(const human of [1,2] as const)test(`forced pass progresses automatically for human player ${human}`,async({page})=>{
  await page.goto('/')
  await page.evaluate(({blocked,human})=>localStorage.setItem('disthex.game.v1',JSON.stringify({version:2,settings:{mode:'cpu',humanPlayer:human,difficulty:'easy'},session:{version:1,size:7,cursor:48,events:blocked.map(([r,c])=>({type:'place',index:r*7+c}))}})),{blocked,human})
  await page.reload();await ready(page)
  if(human===2){await expect(page.locator('[data-cell="29"]')).toHaveAttribute('data-legal','true');await move(page,29)}
  await expect(page.getByRole('status')).toContainText(human===1?'CPUの勝利':'あなたの勝利')
  expect(await cursor(page)).toBe(50)
  await page.locator('.history summary').click()
  await expect(page.locator('.history')).toContainText('パス（合法手なし）')
  await page.reload()
  await expect(page.getByRole('status')).toContainText('の勝利')
})
test('queued obsolete responses cannot change undo, reset confirmation, cancel or board-size changes',async({page})=>{
  await mockCpu(page);await start(page)
  await move(page,0);await expect.poll(()=>countWorkers(page)).toBe(1)
  await expect(page.getByRole('button',{name:'思考中…',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'戻す',exact:true}).click()
  await reply(page,0,{type:'place',index:48})
  expect(await cursor(page)).toBe(0)
  await expect(page.locator('[data-legal="true"]')).toHaveCount(49)
  await page.getByRole('button',{name:'やり直す',exact:true}).click()
  await expect.poll(()=>countWorkers(page)).toBe(2)
  await reply(page,1,{type:'place',index:48});await ready(page)
  await move(page,7);await expect.poll(()=>countWorkers(page)).toBe(3)
  await page.getByRole('button',{name:'新しい対局',exact:true}).click()
  await reply(page,2,{type:'place',index:37})
  expect(await cursor(page)).toBe(3)
  await page.getByRole('button',{name:'キャンセル'}).click()
  await expect.poll(()=>countWorkers(page)).toBe(4)
  await reply(page,2,{type:'place',index:37});expect(await cursor(page)).toBe(3)
  await reply(page,3,{type:'place',index:37});await ready(page)
  await move(page,1);await expect.poll(()=>countWorkers(page)).toBe(5)
  await page.getByLabel('盤のサイズ',{exact:true}).selectOption('9')
  await reply(page,4,{type:'place',index:38});expect(await cursor(page)).toBe(5)
  await page.getByRole('button',{name:'新しい対局を始める'}).click()
  await reply(page,4,{type:'place',index:38})
  expect(await cursor(page)).toBe(0)
  await expect(page.locator('[data-legal="true"]')).toHaveCount(81)
})
test('pending CPU opening is cancelled by mode, seat and difficulty changes',async({page})=>{
  await mockCpu(page);await start(page,2)
  await expect.poll(()=>countWorkers(page)).toBe(1)
  await page.getByLabel('対戦モード').selectOption('local')
  await reply(page,0,{type:'place',index:24})
  await expect(page.locator('[data-legal="true"]')).toHaveCount(49)
  await page.getByLabel('対戦モード').selectOption('cpu');await expect.poll(()=>countWorkers(page)).toBe(2)
  await page.getByLabel('あなたの手番').selectOption('1')
  await reply(page,1,{type:'place',index:24});expect(await cursor(page)).toBe(0)
  await page.getByLabel('あなたの手番').selectOption('2');await expect.poll(()=>countWorkers(page)).toBe(3)
  await page.getByLabel('CPUの読み').selectOption('deep');await expect.poll(()=>countWorkers(page)).toBe(4)
  await reply(page,2,{type:'place',index:24});expect(await cursor(page)).toBe(0)
  await reply(page,3,{type:'place',index:24});await ready(page)
  await expect(page.getByLabel('CPUの読み')).toHaveValue('deep')
  expect(await cursor(page)).toBe(1)
})
test('reload resumes one pending CPU move without duplicating its reply',async({page})=>{
  await mockCpu(page);await start(page)
  await move(page,0);await expect.poll(()=>countWorkers(page)).toBe(1)
  await page.reload()
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__cpuWorkers:FakeWorker[]}).__cpuWorkers.filter(worker=>!worker.terminated).length)).toBe(1)
  const activeIndex=await page.evaluate(()=>(window as unknown as {__cpuWorkers:FakeWorker[]}).__cpuWorkers.findIndex(worker=>!worker.terminated))
  // Development StrictMode starts then cancels an initial worker. It must not
  // apply a queued result; exactly one replacement worker remains active.
  if(activeIndex>0){await reply(page,0,{type:'place',index:48});expect(await cursor(page)).toBe(1)}
  await reply(page,activeIndex,{type:'place',index:48});await ready(page)
  expect(await cursor(page)).toBe(2)
  await page.reload();await ready(page)
  expect(await countWorkers(page)).toBe(0)
  expect(await cursor(page)).toBe(2)
})
test('worker timeout is cancellable and retry produces a legal turn',async({page})=>{
  await mockCpu(page);await start(page)
  await move(page,0);await expect.poll(()=>countWorkers(page)).toBe(1)
  await expect(page.getByRole('alert')).toContainText('時間内',{timeout:5000})
  await page.getByRole('button',{name:'CPUを再開'}).click()
  await expect.poll(()=>countWorkers(page)).toBe(2)
  await reply(page,0,{type:'place',index:48});expect(await cursor(page)).toBe(1)
  await reply(page,1,{type:'place',index:48});await ready(page)
  expect(await cursor(page)).toBe(2)
})

test('deep real-worker search keeps the UI usable and pauses while rules are open',async({page})=>{
  await start(page,1,11)
  await page.getByLabel('CPUの読み').selectOption('deep')
  await move(page,0)
  await expect(page.getByRole('button',{name:'思考中…',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'遊び方',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await cursor(page)).toBe(1)
  await page.waitForTimeout(1400)
  expect(await cursor(page)).toBe(1)
  await page.getByRole('button',{name:'対局にもどる'}).click();await ready(page)
  expect(await cursor(page)).toBe(2)
})
