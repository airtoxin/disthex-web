export type Color = 'blue' | 'red'
export type Player = 1 | 2
export type BoardSize = 7 | 9 | 11
export type GameEvent = { type: 'place'; index: number } | { type: 'swap' }
export type Game = {
  size: BoardSize
  board: (Color | null)[]
  turn: Color
  bluePlayer: Player
  lastMove: number | null
  placements: number
  swapped: boolean
  winner: Color | null
  winningPath: number[]
}
export type Session = { version: 1; size: BoardSize; events: GameEvent[]; cursor: number }
export const STORAGE_KEY = 'disthex.game.v1'
export const other = (color: Color): Color => color === 'blue' ? 'red' : 'blue'
export const playerFor = (game: Game, color: Color): Player => color === 'blue' ? game.bluePlayer : game.bluePlayer === 1 ? 2 : 1
export const coordinate = (index: number, size: number) => `${String.fromCharCode(65 + index % size)}${Math.floor(index / size) + 1}`
export const newSession = (size: BoardSize = 7): Session => ({ version: 1, size, events: [], cursor: 0 })
export function neighbors(index: number, size: number): number[] {
  const row = Math.floor(index / size), column = index % size
  return [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, -1]]
    .map(([dr, dc]) => [row + dr, column + dc])
    .filter(([r, c]) => r >= 0 && c >= 0 && r < size && c < size)
    .map(([r, c]) => r * size + c)
}
export function initialGame(size: BoardSize): Game {
  return { size, board: Array<Color | null>(size * size).fill(null), turn: 'blue', bluePlayer: 1, lastMove: null, placements: 0, swapped: false, winner: null, winningPath: [] }
}
export function forbiddenCells(game: Game): number[] {
  return game.lastMove === null ? [] : neighbors(game.lastMove, game.size).filter(index => game.board[index] === null)
}
export function isLegal(game: Game, index: number): boolean {
  return !game.winner && Number.isInteger(index) && index >= 0 && index < game.board.length && game.board[index] === null && !forbiddenCells(game).includes(index)
}
export function legalMoves(game: Game): number[] {
  return game.board.flatMap((_, index) => isLegal(game, index) ? [index] : [])
}
export function canSwap(game: Game): boolean {
  return game.placements === 1 && !game.swapped && game.turn === 'red' && !game.winner
}
export function connectedPath(board: (Color | null)[], size: number, color: Color): number[] {
  const parents = new Map<number, number | null>()
  const queue: number[] = []
  for (let i = 0; i < size; i++) {
    const index = color === 'blue' ? i : i * size
    if (board[index] === color) { parents.set(index, null); queue.push(index) }
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]
    if (color === 'blue' ? Math.floor(index / size) === size - 1 : index % size === size - 1) {
      const path: number[] = []
      let current: number | null = index
      while (current !== null) { path.push(current); current = parents.get(current) ?? null }
      return path.reverse()
    }
    for (const next of neighbors(index, size)) {
      if (board[next] === color && !parents.has(next)) { parents.set(next, index); queue.push(next) }
    }
  }
  return []
}
export function applyEvent(game: Game, event: GameEvent): Game | null {
  if (event.type === 'swap') {
    if (!canSwap(game)) return null
    return { ...game, bluePlayer: 2, swapped: true }
  }
  if (event.type !== 'place' || !isLegal(game, event.index)) return null
  const board = [...game.board]
  board[event.index] = game.turn
  const winningPath = connectedPath(board, game.size, game.turn)
  return { ...game, board, turn: other(game.turn), lastMove: event.index, placements: game.placements + 1,
    winningPath, winner: winningPath.length ? game.turn : null }
}
export function replay(session: Session): Game {
  let game = initialGame(session.size)
  for (const event of session.events.slice(0, session.cursor)) {
    const next = applyEvent(game, event)
    if (!next) throw new Error('Invalid game history')
    game = next
  }
  return game
}
export function record(session: Session, event: GameEvent): Session {
  if (!applyEvent(replay(session), event)) return session
  const events = [...session.events.slice(0, session.cursor), event]
  return { ...session, events, cursor: events.length }
}
export function undo(session: Session): Session { return { ...session, cursor: Math.max(0, session.cursor - 1) } }
export function redo(session: Session): Session { return { ...session, cursor: Math.min(session.events.length, session.cursor + 1) } }
export function parseSession(raw: string | null): Session | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const s = value as Session
    if (s.version !== 1 || ![7, 9, 11].includes(s.size) || !Array.isArray(s.events) || s.events.length > s.size * s.size + 1 || !Number.isInteger(s.cursor) || s.cursor < 0 || s.cursor > s.events.length) return null
    let game = initialGame(s.size)
    const events: GameEvent[] = []
    for (const event of s.events) {
      if (!event || typeof event !== 'object' || !['place','swap'].includes(event.type)) return null
      const clean: GameEvent = event.type === 'swap' ? { type: 'swap' } : { type: 'place', index: event.index }
      const next = applyEvent(game, clean)
      if (!next) return null
      game = next
      events.push(clean)
    }
    return { version: 1, size: s.size, events, cursor: s.cursor }
  } catch { return null }
}
