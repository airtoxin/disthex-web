import { useState } from 'react'
import Board from './Board'
import Modal from './Modal'
import { canPass, canSwap, coordinate, legalMoves, newSession, parseSession, playerFor, record, redo, replay, STORAGE_KEY, undo } from './game'
import type { BoardSize, Color, GameEvent, Session } from './game'
const colors = { blue: '青', red: '赤' }
const source = 'https://github.com/airtoxin/my-games/blob/master/Disthex/rule.md'
function load(): Session { try { return parseSession(localStorage.getItem(STORAGE_KEY)) ?? newSession() } catch { return newSession() } }
function Mark() { return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 35 11.5v17L20 37 5 28.5v-17Z" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="14" cy="16" r="4.2" fill="var(--blue)"/><circle cx="26" cy="24" r="4.2" fill="var(--red)"/></svg> }
export default function App() {
  const [session, setSession] = useState(load)
  const [selected, setSelected] = useState<number | null>(null)
  const [modal, setModal] = useState<'rules' | 'reset' | null>(null)
  const [nextSize, setNextSize] = useState<BoardSize>(session.size)
  const [zoomed, setZoomed] = useState(false)
  const [saved, setSaved] = useState(true)
  const game = replay(session)
  const legal = legalMoves(game)
  const mustPass = canPass(game)
  const player = playerFor(game, game.turn)
  const winnerPlayer = game.winner ? playerFor(game, game.winner) : null
  function updateSession(next: Session) { setSession(next); setSelected(null); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(true) } catch { setSaved(false) } }
  function act(event: GameEvent) { updateSession(record(session, event)) }
  function reset(size: BoardSize) {
    setNextSize(size)
    if (session.events.length) setModal('reset')
    else { updateSession(newSession(size)) }
  }
  function changeHistory(direction: 'undo' | 'redo') { updateSession(direction === 'undo' ? undo(session) : redo(session)) }
  const activeEvents = session.events.slice(0, session.cursor)
  return <>
    <header className="site-header"><a href="#main" className="brand"><Mark/><span>DISTHEX<span className="brand-sub">DISTANT HEX</span></span></a><div className="header-right"><span className="local-badge"><i/>同じ端末で、ふたり対戦</span><button className="rule-button" onClick={() => setModal('rules')}><span aria-hidden="true">?</span>遊び方</button></div></header>
    <main id="main">
      <section className="intro"><div><p className="eyebrow">A SMALL DISTANCE. A NEW CONNECTION.</p><h1>距離をあけて、<span>つなぐ。</span></h1><p className="intro-copy">相手の直前の石から、ひとマス空けて。<br className="mobile-break"/>自分の色で、向こう岸をめざそう。</p></div><div className="intro-number" aria-hidden="true"><span>02</span><small>PLAYERS<br/>ONE BOARD</small></div></section>
      <div className="game-layout">
        <section className="board-panel" aria-label="ゲーム盤">
          <div className="board-top"><div className="board-heading"><span className="eyebrow">THE BOARD</span><h2>{session.size} × {session.size}<span>{session.size === 7 ? 'はじめての一局に' : session.size === 9 ? 'じっくり考える一局' : '広がる戦略の一局'}</span></h2></div><label className="size-select"><span>盤のサイズ</span><select aria-label="盤のサイズ" value={session.size} onChange={event => reset(Number(event.target.value) as BoardSize)}><option value="7">7 × 7</option><option value="9">9 × 9</option><option value="11">11 × 11</option></select></label></div>
          <div className={`mobile-turn ${game.winner ?? game.turn}`}><i className="color-dot"/>{game.winner ? `プレイヤー${winnerPlayer}の勝利` : `プレイヤー${player}（${colors[game.turn]}）の手番`}<span>{session.cursor} 手</span></div>
          <Board key={session.size} game={game} selected={selected} onSelect={setSelected} zoomed={zoomed}/>
          <div className="board-meta"><div className="legend"><span><i className="legend-ring"/>直前の一手</span><span><i className="legend-hatch"/>いまは置けない</span></div><button className="text-button zoom-button" aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>{zoomed ? '− 全体を表示' : '＋ 盤面を拡大'}</button></div>
          <div className="placement-bar"><div><span className="eyebrow">{game.winner ? 'GAME SET' : selected === null ? 'YOUR NEXT MOVE' : 'SELECTED CELL'}</span><p>{game.winner ? '対辺が、ひとつにつながりました。' : mustPass ? '置けるマスがないため、パスしてください' : selected === null ? '置きたいマスを選んでください' : <><b>{coordinate(selected, game.size)}</b> に {colors[game.turn]} の石を置きます</>}</p></div><button className={`primary-button ${game.turn}`} disabled={(!mustPass && selected === null) || !!game.winner} onClick={() => { if (mustPass) act({ type: 'pass' }); else if (selected !== null) act({ type: 'place', index: selected }) }}>{mustPass ? 'パスする' : 'ここに置く'}<span aria-hidden="true">↗</span></button></div>
          <div className="board-toolbar"><div><button onClick={() => changeHistory('undo')} disabled={session.cursor === 0}><span aria-hidden="true">↶</span>戻す</button><button onClick={() => changeHistory('redo')} disabled={session.cursor === session.events.length}><span aria-hidden="true">↷</span>やり直す</button></div><button onClick={() => reset(session.size)}><span aria-hidden="true">⟳</span>新しい対局</button></div>
        </section>
        <aside className="game-sidebar">
          <section className={`turn-card ${game.winner ? 'finished' : ''}`} aria-label="対局状況">
            <div className="card-eyebrow"><span>{game.winner ? 'CONNECTED!' : 'NOW PLAYING'}</span><span>{String(session.cursor).padStart(2,'0')} 手</span></div>
            <div className={`turn-title ${game.winner ?? game.turn}`} role="status" aria-live="polite"><i className="large-stone"/><div><p>{game.winner ? `プレイヤー${winnerPlayer}の勝利` : `プレイヤー${player}の手番`}</p><span>{game.winner ? `${colors[game.winner]}の対辺がつながりました` : mustPass ? '置けるマスがないため、パスしてください' : `${colors[game.turn]}の石を置いてください`}</span></div></div>
            <div className="player-list">{(['blue','red'] as Color[]).map(color => <div key={color} className={`player-row ${color} ${!game.winner && game.turn === color ? 'active' : ''}`}><i className="color-dot"/><span>プレイヤー{playerFor(game, color)}<small>{colors[color]}</small></span><b>{color === 'blue' ? '↕ 上下をつなぐ' : '↔ 左右をつなぐ'}</b></div>)}</div>
            {game.winner ? <button className="primary-button replay-button" onClick={() => { updateSession(newSession(session.size)) }}>もう一局あそぶ <span aria-hidden="true">↗</span></button> : <p className="legal-count"><span>置けるマス</span><b>{legal.length}<small> / {game.size * game.size}</small></b></p>}
            {canSwap(game) ? <div className="swap-option"><p>最初の一手、あなたなら選ぶ？</p><span>プレイヤー2は、色を交換することもできます。交換後はプレイヤー1が赤を置きます。</span><button onClick={() => act({ type: 'swap' })}><span aria-hidden="true">⇄</span>色を交換する</button></div> : null}
            {mustPass ? <p className="no-moves">置けるマスがありません。「パスする」で相手に手番を渡してください。</p> : null}{activeEvents.at(-1)?.type === 'pass' ? <p className="pass-note">直前はパスでした。隣接禁止はありません。</p> : null}
          </section>
          <section className="how-card"><span className="eyebrow">ONE TWIST, ENDLESS POSSIBILITIES</span><h2>近づけない、からおもしろい。</h2><p>斜線のマスは、相手が直前に置いた石のとなり。<strong>この一手だけ</strong>、そこには置けません。</p><svg className="mini-diagram" viewBox="0 0 106 93" aria-hidden="true"><defs><pattern id="mini-lines" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(35)"><rect width="5" height="5" fill="#e5e9dd"/><path d="M0 0V5" stroke="#b8c6ae" strokeWidth="1"/></pattern></defs>{[[36,20],[70,20],[19,47],[87,47],[36,74],[70,74]].map(([x,y]) => <polygon key={`${x}-${y}`} points="0,-18 15.6,-9 15.6,9 0,18 -15.6,9 -15.6,-9" transform={`translate(${x},${y})`} fill="url(#mini-lines)" stroke="#c7d1bf"/>)}<polygon points="53,29 68.6,38 68.6,56 53,65 37.4,56 37.4,38" fill="#e2e8d8" stroke="#c7d1bf"/><circle cx="53" cy="47" r="11" fill="var(--red)"/></svg><button className="text-button" onClick={() => setModal('rules')}>ルールを詳しく読む <span aria-hidden="true">↗</span></button></section>
          <details className="history"><summary>棋譜<span>{activeEvents.length} アクション</span></summary>{activeEvents.length ? <ol>{activeEvents.map((event,index) => <li key={index}><span>{index + 1}</span>{event.type === 'swap' ? 'プレイヤー1と2の色を交換' : event.type === 'pass' ? 'パス（合法手なし）' : `${coordinate(event.index, session.size)} に置く`}</li>)}</ol> : <p>最初の一手を置いてみましょう。</p>}</details>
        </aside>
      </div>
      <div className="small-print"><span className="save-note"><i/>{saved ? 'このブラウザに対局を自動保存' : 'このブラウザでは保存できません。ページを閉じると対局が失われます。'}</span><span>考える時間も、ゲームのうち。</span></div>
    </main>
    <footer><a className="footer-brand" href="#main">DISTHEX</a><span>Game design by <a href="https://github.com/airtoxin" target="_blank" rel="noreferrer">airtoxin</a> · 2017</span><a href={source} target="_blank" rel="noreferrer">オリジナルルール <span aria-hidden="true">↗</span></a></footer>
    {modal === 'rules' ? <Modal title="Disthex の遊び方" onClose={() => setModal(null)}><p className="modal-intro">ふたりで交互に石を置く、Hex のバリエーション。<br/>追加されたルールは、たったひとつ。</p><div className="rule-step"><b>01</b><div><h3>自分の色の対辺をつなぐ</h3><p>青は上下、赤は左右。となり合う自分の石をつないで、担当する2辺を先に結んだ人の勝ちです。石は空きマスに1つずつ置き、動かしたり取ったりしません。</p></div></div><div className="rule-step"><b>02</b><div><h3>直前の相手の石から、離れる</h3><p>相手が直前に置いた石に隣接する6方向のマスには置けません。制限は直前の一手にだけ適用され、それ以前の石のとなりには置けます。輪で囲まれた石が直前の一手、斜線が禁止マスです。</p></div></div><div className="rule-step"><b>03</b><div><h3>2番手は、最初に色を交換できる</h3><p>青の初手の後、プレイヤー2は赤を置く代わりに「色を交換する」を選べます。盤上の石やゴールは動かさず、担当する色だけを交換します。次はプレイヤー1が赤を置きます。初手の石の隣接制限はそのままです。</p></div></div><div className="rule-step"><b>04</b><div><h3>置けるマスがなければ、パス</h3><p>空きマスがすべて隣接禁止で置けない場合は、パスして相手に手番を渡します。パスの直後は隣接禁止がなくなり、空いているどのマスにも置けます。次に石が置かれると、その石の周囲が新しく禁止されます。置けるマスがあるときはパスできません。</p></div></div><div className="rule-tip"><strong>はじめてなら 7 × 7 がおすすめ。</strong><p>慣れたら 9 × 9、11 × 11 で遊べます。マスを選んで「ここに置く」で確定。キーボードでは矢印キーと Enter でもマスを選べます。</p></div><p className="source-note">Game design: airtoxin · 2017<br/><a href={source} target="_blank" rel="noreferrer">作者によるオリジナルルールを読む ↗</a></p><button className="primary-button modal-done" onClick={() => setModal(null)}>対局にもどる</button></Modal> : null}
    {modal === 'reset' ? <Modal title="新しい対局を始めますか？" onClose={() => setModal(null)}><p className="modal-intro">現在の盤面と棋譜をリセットして、{nextSize} × {nextSize} の対局を始めます。プレイヤー1が青の先手です。</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>キャンセル</button><button className="primary-button" onClick={() => { updateSession(newSession(nextSize)); setModal(null) }}>新しい対局を始める</button></div></Modal> : null}
  </>
}
