import type { SnapType } from '../../cad/geometry'
import { Grid2X2, Magnet, MoveRight, ShieldCheck } from 'lucide-react'
import { snapNames } from '../../cad/geometry'
import { useEditor } from './store'

export function StatusBar({
  status,
  retry,
}: {
  status: string
  retry: () => void
}) {
  const s = useEditor()
  return (
    <footer className="status-bar">
      <div className="coordinates">
        <span>
          X
          <b>{s.cursor.x.toFixed(2)}</b>
        </span>
        <span>
          Y
          <b>{s.cursor.y.toFixed(2)}</b>
        </span>
        <span className="muted">mm</span>
      </div>
      <div className="status-switches">
        <label className="background-setting">
          背景
          <select
            aria-label="画布背景"
            value={s.background}
            onChange={e =>
              useEditor.setState({
                background: e.target.value as typeof s.background,
              })}
          >
            <option value="grid">网格（默认）</option>
            <option value="white">纯白</option>
            <option value="black">纯黑</option>
          </select>
        </label>
        <button
          aria-label="网格吸附"
          aria-pressed={s.grid}
          className={s.grid ? 'active' : ''}
          onClick={() => useEditor.setState({ grid: !s.grid })}
        >
          <Grid2X2 size={13} />
          {s.background !== 'grid' && s.grid
            ? '网格吸附（网格隐藏）'
            : '网格吸附'}
        </button>
        <button
          aria-pressed={s.objects}
          className={s.objects ? 'active' : ''}
          onClick={() => useEditor.setState({ objects: !s.objects })}
        >
          <Magnet size={13} />
          对象吸附
        </button>
        <details className="snap-settings">
          <summary>
            捕捉设置
            {s.snapOverride ? ' · 临时' : ''}
          </summary>
          <div className="snap-menu">
            <p>
              常驻类型（总开关：
              {s.objects ? '开启' : '关闭'}
              ）
            </p>
            {(Object.keys(snapNames) as SnapType[]).map(type => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={s.snapTypes.includes(type)}
                  onChange={e => useEditor.setState({
                    snapTypes: e.target.checked
                      ? [...s.snapTypes, type]
                      : s.snapTypes.filter(t => t !== type),
                  })}
                />
                {snapNames[type]}
              </label>
            ))}
            <label>
              下一点临时捕捉
              <select
                aria-label="临时捕捉"
                value={s.snapOverride ?? ''}
                onChange={e => useEditor.setState({ snapOverride: (e.target.value || null) as typeof s.snapOverride })}
              >
                <option value="">使用常驻设置</option>
                <option value="none">不捕捉对象</option>
                {(Object.keys(snapNames) as SnapType[]).map(type => <option key={type} value={type}>{snapNames[type]}</option>)}
              </select>
            </label>
            <p>可见锁定对象仍可捕捉；垂足、切点需要基点。临时设置在取点或取消后恢复。</p>
          </div>
        </details>
        <button
          aria-pressed={s.ortho}
          className={s.ortho ? 'active' : ''}
          onClick={() => useEditor.setState({ ortho: !s.ortho })}
        >
          <MoveRight size={13} />
          正交
        </button>
        <select
          aria-label="网格间距"
          value={s.gridStep}
          onChange={e =>
            useEditor.setState({
              gridStep: Number(e.target.value),
            })}
        >
          {[1, 5, 10, 20, 50].map(n => (
            <option key={n} value={n}>
              {n}
              {' '}
              mm
            </option>
          ))}
        </select>
      </div>
      <button className="save-status" onClick={retry} title="立即保存 / 重试">
        <ShieldCheck size={13} />
        <span data-testid="save-status">{status}</span>
      </button>
    </footer>
  )
}
