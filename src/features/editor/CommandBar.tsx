import { useEffect, useRef, useState } from 'react'
import { hint, toolNames } from '../../cad/tools'
import { useEditor } from './store'

export function CommandBar({ disabled }: { disabled: boolean }) {
  const s = useEditor()
  const prompt = s.phase === 'selection'
    ? `选择对象（${s.selected.length} 已选），Enter 确认`
    : hint(s.tool, s.points.length)
  return (
    <section className="command-bar" aria-label="命令栏" inert={disabled}>
      <div className="command-prompt" role="status">
        <span>{toolNames[s.tool]}</span>
        <span>{s.message || prompt}</span>
      </div>
      <CommandInput key={`${s.doc?.id}/${s.tool}/${s.phase}`} />
      <div className="command-actions">
        {(s.tool === 'line' || s.tool === 'polyline') && (
          <>
            <button type="button" disabled={!s.points.length} onClick={s.undoStep}>退回一点</button>
            <button type="button" disabled={s.points.length < 3} onClick={s.closePath}>闭合</button>
          </>
        )}
        <button type="button" onClick={s.finish}>
          {s.phase === 'selection' || s.phase === 'angle'
            ? '确认'
            : s.tool === 'select'
              ? '重复'
              : '结束'}
        </button>
        <button type="button" onClick={s.cancel}>取消</button>
      </div>
    </section>
  )
}

function CommandInput() {
  const s = useEditor()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const start = (e: Event) => {
      setValue(v => v + (e as CustomEvent<string>).detail)
      inputRef.current?.focus()
    }
    window.addEventListener('cad-input', start)
    return () => window.removeEventListener('cad-input', start)
  }, [])
  const placeholder = s.phase === 'angle'
    ? '角度°；Enter 确认，Esc 取消'
    : s.tool === 'circle' && s.points.length
      ? '输入半径，或 x,y 圆周点'
      : 'x,y · @dx,dy · @距离<角度 · 距离 · Close / U'
  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      if (useEditor.getState().submitInput(value))
        setValue('')
    }}
    >
      <input
        ref={inputRef}
        data-command-input
        aria-label="命令输入"
        value={value}
        maxLength={120}
        autoComplete="off"
        placeholder={placeholder}
        onChange={e => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
            if (e.key === 'Enter')
              e.preventDefault()
            return
          }
          if (e.key === 'Escape')
            setValue('')
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            if (useEditor.getState().submitInput(value))
              setValue('')
          }
        }}
      />
    </form>
  )
}
