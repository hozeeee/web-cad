import { useEffect, useState } from 'react'

export function NumberField({
  label,
  value,
  onChange,
  min = -1e9,
  max = 1e9,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))))
  useEffect(() => setDraft(String(Number(value.toFixed(4)))), [value])
  const submit = () => {
    const n = Number(draft)
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) {
      if (n !== value)
        onChange(n)
    }
    else {
      setDraft(String(Number(value.toFixed(4))))
    }
  }
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={draft}
        min={min}
        max={max}
        step="any"
        title="按回车或移开焦点生效"
        onChange={e => setDraft(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (
            e.key === 'Enter'
            && !e.nativeEvent.isComposing
            && e.nativeEvent.keyCode !== 229
          ) {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}
