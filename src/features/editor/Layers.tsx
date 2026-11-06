import type { Layer } from '../../cad/model'
import {
  Eye,
  EyeOff,
  Layers2,
  LockKeyhole,
  Plus,
  Trash2,
  UnlockKeyhole,
} from 'lucide-react'
import { uid } from '../../cad/model'
import { useEditor } from './store'

export function Layers() {
  const s = useEditor()
  const doc = s.doc
  if (!doc)
    return null
  const update = (id: string, patch: Partial<Layer>) => {
    s.commit(d => ({
      ...d,
      layers: d.layers.map(l =>
        l.id === id
          ? {
              ...l,
              ...patch,
            }
          : l,
      ),
    }))
    if (patch.locked || patch.visible === false)
      s.setTool(s.tool)
  }
  const add = () => {
    if (doc.layers.length >= 100)
      return
    const layer: Layer = {
      id: uid(),
      name: `图层 ${doc.layers.length + 1}`,
      color: '#a2ddb0',
      visible: true,
      locked: false,
    }
    s.commit(d => ({
      ...d,
      layers: [...d.layers, layer],
    }))
    useEditor.setState({ activeLayer: layer.id })
    s.setTool(s.tool)
  }
  const remove = (id: string) => {
    if (doc.layers.length <= 1)
      return
    const count = doc.entities.filter(e => e.layerId === id).length
    if (
      count
      && !window.confirm(`删除此图层及其中的 ${count} 个图形？此操作可以撤销。`)
    ) {
      return
    }
    s.commit(d => ({
      ...d,
      layers: d.layers.filter(l => l.id !== id),
      entities: d.entities.filter(e => e.layerId !== id),
    }))
    useEditor.setState({
      activeLayer: doc.layers.find(l => l.id !== id)!.id,
      selected: [],
    })
    s.setTool(s.tool)
  }
  return (
    <section className="layers-panel">
      <div className="section-title">
        <span>
          <Layers2 size={14} />
          图层
          <span className="section-count">{doc.layers.length}</span>
        </span>
        <button aria-label="添加图层" title="添加图层" onClick={add}>
          <Plus size={15} />
        </button>
      </div>
      <div className="layer-list">
        {doc.layers.map(l => (
          <div
            key={l.id}
            className={`layer-row ${s.activeLayer === l.id
              ? 'active'
              : ''}`}
          >
            <button
              className="layer-select"
              aria-label={`设为当前图层 ${l.name}`}
              title="设为当前图层"
              onClick={() => {
                useEditor.setState({ activeLayer: l.id })
                s.setTool(s.tool)
              }}
            >
              <span style={{ background: l.color }} />
            </button>
            <input
              className="layer-name"
              aria-label={`图层名称 ${l.name}`}
              defaultValue={l.name}
              key={l.name}
              maxLength={100}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== l.name)
                  update(l.id, { name })
                else e.target.value = l.name
              }}
            />
            <input
              className="layer-color"
              aria-label={`图层颜色 ${l.name}`}
              type="color"
              value={l.color}
              onChange={e => update(l.id, { color: e.target.value })}
            />
            <button
              aria-label={`${l.visible ? '隐藏' : '显示'}图层 ${l.name}`}
              title={l.visible ? '隐藏图层' : '显示图层'}
              onClick={() => update(l.id, { visible: !l.visible })}
            >
              {l.visible
                ? <Eye size={13} />
                : <EyeOff size={13} />}
            </button>
            <button
              aria-label={`${l.locked ? '解锁' : '锁定'}图层 ${l.name}`}
              title={l.locked ? '解锁图层' : '锁定图层'}
              onClick={() => update(l.id, { locked: !l.locked })}
            >
              {l.locked
                ? (
                    <LockKeyhole size={13} />
                  )
                : (
                    <UnlockKeyhole size={13} />
                  )}
            </button>
            <button
              aria-label={`删除图层 ${l.name}`}
              title="删除图层"
              disabled={doc.layers.length === 1}
              onClick={() => remove(l.id)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <p className="panel-note">彩色圆点所在行是当前绘图图层</p>
    </section>
  )
}
