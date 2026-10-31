import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
export default function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<Element | null>(null)
  const titleId = useId()
  useEffect(() => {
    const current = dialog.current
    previousFocus.current = document.activeElement
    current?.showModal()
    return () => { current?.close(); if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus() }
  }, [])
  function close() { dialog.current?.close(); if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus(); onClose() }
  return <dialog ref={dialog} className="modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close() } }}>
    <div className="modal-head"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="閉じる" onClick={close}>×</button></div>
    {children}
  </dialog>
}
