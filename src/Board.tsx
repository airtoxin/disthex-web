import { useState } from 'react'
import { coordinate, forbiddenCells, isLegal } from './game'
import type { Game } from './game'

type Props = { game: Game; selected: number | null; onSelect: (index: number) => void; zoomed: boolean }
const R = 22
const DX = Math.sqrt(3) * R
const point = (index: number, size: number) => ({ x: 60 + DX * (index % size + Math.floor(index / size) / 2), y: 63 + 1.5 * R * Math.floor(index / size) })
const polygon = Array.from({ length: 6 }, (_, i) => `${(R - 1.7) * Math.cos((60 * i - 30) * Math.PI / 180)},${(R - 1.7) * Math.sin((60 * i - 30) * Math.PI / 180)}`).join(' ')
export default function Board({ game, selected, onSelect, zoomed }: Props) {
  const [focus, setFocus] = useState(0)
  const { size, board } = game
  const forbidden = new Set(forbiddenCells(game))
  const path = new Set(game.winningPath)
  const tl = point(0, size), tr = point(size - 1, size), bl = point(size * (size - 1), size), br = point(size * size - 1, size)
  const width = br.x + 60, height = br.y + 63
  return <div className={`board-scroller ${zoomed ? 'zoomed' : ''}`}>
    <svg className="board" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${size}×${size}の盤面。青は上下、赤は左右をつなぎます。矢印キーで移動、Enterでマスを選択。`}>
      <defs><pattern id="restricted" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="#b6bbae" strokeWidth="1"/></pattern></defs>
      <path className="goal blue-goal" d={`M${tl.x - 20},${tl.y - 29} L${tr.x + 21},${tr.y - 29} M${bl.x - 21},${bl.y + 29} L${br.x + 20},${br.y + 29}`} />
      <path className="goal red-goal" d={`M${tl.x - 29},${tl.y - 7} L${bl.x - 29},${bl.y + 7} M${tr.x + 29},${tr.y - 7} L${br.x + 29},${br.y + 7}`} />
      {Array.from({ length: size }, (_, i) => {
        const top = point(i, size), left = point(i * size, size)
        return <g key={i} className="axis" aria-hidden="true"><text x={top.x} y={top.y - 43}>{String.fromCharCode(65 + i)}</text><text x={left.x - 44} y={left.y + 4}>{i + 1}</text></g>
      })}
      {board.map((color, index) => {
        const { x, y } = point(index, size)
        const legal = isLegal(game, index)
        const blocked = !color && forbidden.has(index) && !game.winner
        const label = `${coordinate(index, size)}：${color ? `${color === 'blue' ? '青' : '赤'}の石` : blocked ? '直前の石に隣接・置けません' : game.winner ? '対局終了' : '置けます'}`
        return <g key={index} transform={`translate(${x},${y})`} role="button" aria-label={label} aria-disabled={!legal} aria-pressed={selected === index} tabIndex={focus === index ? 0 : -1}
          data-cell={index} data-legal={legal ? 'true' : 'false'} data-color={color ?? ''}
          className={`cell ${color ?? 'empty'} ${blocked ? 'restricted' : ''} ${selected === index ? 'selected' : ''} ${path.has(index) ? 'winning' : ''}`}
          onFocus={() => setFocus(index)} onClick={() => { if (legal) onSelect(index) }}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (legal) onSelect(index); return }
            const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size }
            if (delta[event.key] !== undefined) {
              event.preventDefault()
              const next = Math.max(0, Math.min(board.length - 1, index + delta[event.key]))
              const element = event.currentTarget.parentElement?.querySelector<SVGGElement>(`[data-cell="${next}"]`)
              element?.focus()
            }
          }}>
          <polygon className="hex" points={polygon}/>
          {blocked ? <polygon className="hatching" points={polygon} fill="url(#restricted)"/> : null}
          {color ? <><circle className="stone" r="13.4"/><circle className="stone-shine" cx="-4" cy="-4" r="3"/></> : legal ? <circle className="legal-dot" r="2"/> : null}
          {game.lastMove === index ? <circle className="last-ring" r="17"/> : null}
          {selected === index ? <><circle className="selection-ring" r="14"/><path className="selection-plus" d="M-5 0H5M0-5V5"/></> : null}
          {path.has(index) ? <circle className="win-dot" r="3.2"/> : null}
        </g>
      })}
    </svg>
  </div>
}
