import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button aria-label="关闭对话框" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
