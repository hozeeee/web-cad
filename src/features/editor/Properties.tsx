import type { Entity, Point } from '../../cad/model'
import { MousePointer2, SlidersHorizontal, Trash2 } from 'lucide-react'
import { toolNames } from '../../cad/tools'
import { NumberField } from '../../components/NumberField'
import { useEditor } from './store'

const entityNames = {
  line: '直线',
  polyline: '折线',
  rectangle: '矩形',
  circle: '圆',
  arc: '圆弧',
  text: '文字',
  dimension: '尺寸标注',
}
export function Properties() {
  const s = useEditor()
  const doc = s.doc
  if (!doc)
    return null
  const selected = doc.entities.filter(
    e =>
      s.selected.includes(e.id)
      && doc.layers.some(l => l.id === e.layerId && l.visible && !l.locked),
  )
  const entity = selected.length === 1
    ? s.gripEdit?.preview.id === selected[0].id
      ? s.gripEdit.preview
      : selected[0]
    : undefined
  const update = (patch: Partial<Entity>) => {
    if (entity) {
      s.commit(d => ({
        ...d,
        entities: d.entities.map(e =>
          e.id === entity.id
            ? ({
                ...e,
                ...patch,
              } as Entity)
            : e,
        ),
      }))
    }
  }
  const pointFields = (
    label: string,
    p: Point,
    updatePoint: (p: Point) => void,
  ) => (
    <div className="point-fields" key={label}>
      <span className="field-heading">{label}</span>
      <div className="field-pair">
        <NumberField
          label={`${label} X`}
          value={p.x}
          onChange={x => updatePoint({ ...p, x })}
        />
        <NumberField
          label={`${label} Y`}
          value={p.y}
          onChange={y => updatePoint({ ...p, y })}
        />
      </div>
    </div>
  )
  return (
    <section className="properties">
      <div className="section-title">
        <span>
          <SlidersHorizontal size={14} />
          属性
        </span>
        <span className="section-count">
          {selected.length
            ? `${selected.length} 已选`
            : '未选择'}
        </span>
      </div>
      {entity
        ? (
            <div className="property-content" key={entity.id}>
              <div className="entity-heading">
                <span>{entityNames[entity.type]}</span>
                <span className="tag">mm</span>
              </div>
              {entity.type === 'dimension' && <p className="cad-risk">非关联标注：原图形改变后，尺寸不会自动更新，请重新核对测量点。</p>}
              <label className="field-label">
                图层
                <select
                  aria-label="实体图层"
                  value={entity.layerId}
                  onChange={e => update({ layerId: e.target.value })}
                >
                  {doc.layers.map(l => (
                    <option
                      key={l.id}
                      value={l.id}
                      disabled={!l.visible || l.locked}
                    >
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-pair">
                <label className="field-label">
                  颜色
                  <input
                    aria-label="实体颜色"
                    type="color"
                    value={
                      entity.color
                      ?? doc.layers.find(l => l.id === entity.layerId)!.color
                    }
                    onChange={e => update({ color: e.target.value })}
                  />
                </label>
                <NumberField
                  label="线宽"
                  value={entity.strokeWidth}
                  min={0.01}
                  max={100}
                  onChange={strokeWidth => update({ strokeWidth })}
                />
              </div>
              {'a' in entity && pointFields('起点', entity.a, a => update({ a }))}
              {'b' in entity && pointFields('终点', entity.b, b => update({ b }))}
              {'center' in entity
                && pointFields('圆心', entity.center, center => update({ center }))}
              {'radius' in entity && (
                <NumberField
                  label="半径"
                  value={entity.radius}
                  min={0.001}
                  onChange={radius => update({ radius })}
                />
              )}
              {entity.type === 'arc' && (
                <>
                  <NumberField
                    label="起始角度°"
                    value={(entity.start * 180) / Math.PI}
                    onChange={n => update({ start: (n * Math.PI) / 180 })}
                  />
                  <NumberField
                    label="终止角度°"
                    value={(entity.end * 180) / Math.PI}
                    onChange={n => update({ end: (n * Math.PI) / 180 })}
                  />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={entity.ccw}
                      onChange={e => update({ ccw: e.target.checked })}
                    />
                    逆时针
                  </label>
                </>
              )}
              {'at' in entity
                && pointFields('位置', entity.at, at => update({ at }))}
              {entity.type === 'text' && (
                <>
                  <label className="field-label">
                    文字内容
                    <input
                      aria-label="文字内容"
                      key={entity.text}
                      defaultValue={entity.text}
                      maxLength={10000}
                      title="按回车或移开焦点生效"
                      onBlur={(e) => {
                        const text = e.currentTarget.value
                        if (!text.trim())
                          e.currentTarget.value = entity.text
                        else if (text !== entity.text)
                          update({ text })
                      }}
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
                  <NumberField
                    label="文字高度"
                    value={entity.size}
                    min={0.01}
                    max={10000}
                    onChange={size => update({ size })}
                  />
                  <NumberField
                    label="文字旋转°"
                    value={entity.rotation}
                    onChange={rotation => update({ rotation })}
                  />
                </>
              )}
              {entity.type === 'polyline' && (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={entity.closed}
                      onChange={e => update({ closed: e.target.checked })}
                    />
                    闭合折线
                  </label>
                  {entity.points.map((p, i) =>
                    pointFields(`点 ${i + 1}`, p, next =>
                      update({
                        points: entity.points.map((old, j) =>
                          j === i
                            ? next
                            : old,
                        ),
                      })),
                  )}
                </>
              )}
              {entity.type === 'dimension' && (
                <label className="field-label">
                  标注方向
                  <select
                    value={entity.mode}
                    onChange={e =>
                      update({
                        mode: e.target.value as 'aligned',
                        direction: undefined,
                      })}
                  >
                    <option value="aligned">对齐</option>
                    <option value="horizontal">水平</option>
                    <option value="vertical">垂直</option>
                  </select>
                </label>
              )}
              <button className="danger-button" onClick={s.remove}>
                <Trash2 size={14} />
                删除图形
              </button>
            </div>
          )
        : (
            <div className="property-empty">
              <MousePointer2 size={26} strokeWidth={1.2} />
              <p>
                {selected.length
                  ? `已选择 ${selected.length} 个图形`
                  : '选择一个图形'}
              </p>
              <span>
                {selected.length
                  ? '使用移动、复制、旋转或镜像工具'
                  : '查看和编辑它的几何属性'}
              </span>
              {selected.length > 0 && (
                <button className="danger-button" onClick={s.remove}>
                  删除所选
                </button>
              )}
            </div>
          )}
      {s.tool !== 'select' && s.tool !== 'trim' && s.phase !== 'selection' && (
        <div className="tool-properties">
          <div className="field-heading">
            {toolNames[s.tool]}
            {' '}
            · 精确输入
          </div>
          {s.tool === 'rotate' && (
            <>
              <NumberField
                label="旋转角度°"
                value={s.rotation}
                onChange={rotation => useEditor.setState({ rotation })}
              />
              {s.phase === 'angle' && <button type="button" className="secondary" onClick={() => useEditor.getState().confirmRotation()}>确认旋转</button>}
            </>
          )}
          {s.tool === 'text' && (
            <>
              <label className="field-label">
                插入文字
                <input
                  aria-label="插入文字"
                  value={s.text}
                  maxLength={10000}
                  onChange={e => useEditor.setState({ text: e.target.value })}
                />
              </label>
              <NumberField
                label="文字高度"
                value={s.textSize}
                min={0.01}
                max={10000}
                onChange={textSize => useEditor.setState({ textSize })}
              />
            </>
          )}
          {s.tool === 'dimension' && <p className="cad-risk">当前为非关联标注，修改原图形后须人工核对尺寸。</p>}
          {s.tool === 'dimension' && (
            <label className="field-label">
              方向
              <select
                aria-label="标注方向"
                value={s.dimensionMode}
                onChange={e =>
                  useEditor.setState({
                    dimensionMode: e.target.value as 'aligned',
                  })}
              >
                <option value="aligned">对齐</option>
                <option value="horizontal">水平</option>
                <option value="vertical">垂直</option>
              </select>
            </label>
          )}
          {s.phase !== 'angle' && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const data = new FormData(e.currentTarget)
                const x = Number(data.get('x'))
                const y = Number(data.get('y'))
                if (
                  Number.isFinite(x)
                  && Number.isFinite(y)
                  && Math.abs(x) <= 1e9
                  && Math.abs(y) <= 1e9
                ) {
                  s.submitInput(`${x},${y}`)
                }
              }}
            >
              <div className="field-pair">
                <label className="field-label">
                  X
                  <input
                    aria-label="输入 X"
                    type="number"
                    name="x"
                    defaultValue="0"
                    required
                    min={-1e9}
                    max={1e9}
                    step="any"
                  />
                </label>
                <label className="field-label">
                  Y
                  <input
                    aria-label="输入 Y"
                    type="number"
                    name="y"
                    defaultValue="0"
                    required
                    min={-1e9}
                    max={1e9}
                    step="any"
                  />
                </label>
              </div>
              <button type="submit" className="secondary full-width">确认坐标点</button>
            </form>
          )}
          {s.tool === 'circle' && s.points.length === 1 && (
            <form
              className="radius-input"
              onSubmit={(e) => {
                e.preventDefault()
                const radius = Number(
                  new FormData(e.currentTarget).get('radius'),
                )
                if (radius > 0 && radius <= 1e9)
                  s.place({ x: s.points[0].x + radius, y: s.points[0].y })
              }}
            >
              <label className="field-label">
                半径
                <input
                  aria-label="输入半径"
                  type="number"
                  name="radius"
                  min="0.001"
                  max="1000000000"
                  step="any"
                  required
                  defaultValue="20"
                />
              </label>
              <button className="secondary full-width">按半径绘制</button>
            </form>
          )}
          {s.tool === 'polyline' && (
            <button
              className="secondary full-width"
              disabled={s.points.length < 2}
              onClick={s.finish}
            >
              完成折线 · Enter
            </button>
          )}
        </div>
      )}
    </section>
  )
}
