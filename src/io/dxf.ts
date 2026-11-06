import type { Drawing, Entity, Layer, Point } from '../cad/model'
import { bounds, dimensionGeometry, normalize } from '../cad/geometry'
import { createDrawing, uid } from '../cad/model'
import { drawingSchema } from './schema'

export interface CadImport {
  doc: Drawing
  total: number
  skipped: Record<string, number>
  warnings: string[]
}

type Pair = [number, string]
interface RecordData { type: string, pairs: Pair[] }
const widths = [
  0,
  5,
  9,
  13,
  15,
  18,
  20,
  25,
  30,
  35,
  40,
  50,
  53,
  60,
  70,
  80,
  90,
  100,
  106,
  120,
  140,
  158,
  200,
  211,
]
const first = (r: RecordData, code: number) => r.pairs.find(p => p[0] === code)?.[1]
function num(r: RecordData, code: number, fallback = 0) {
  const value = first(r, code)
  const result = value === undefined
    ? fallback
    : Number(value)
  if (!Number.isFinite(result))
    throw new TypeError('非有限数值')
  return result
}
function point(r: RecordData, code = 10): Point {
  if (first(r, code) === undefined || first(r, code + 10) === undefined)
    throw new Error('缺少坐标')
  return {
    x: num(r, code),
    y: num(r, code + 10),
  }
}
function text(value: string) {
  return value.replace(/\\U\+([\da-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/%%d/gi, '°')
    .replace(/%%p/gi, '±')
    .replace(/%%c/gi, '⌀')
}

function records(source: string) {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')
  while (lines.at(-1) === '') lines.pop()
  if (lines.length % 2)
    throw new Error('DXF 记录不完整')
  const result: RecordData[] = []
  let current: RecordData | undefined
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i].trim())
    if (!lines[i].trim() || !Number.isInteger(code) || code < 0 || code > 1071)
      throw new Error('DXF 组码无效')
    const value = lines[i + 1]
    if (code === 0) {
      current = {
        type: value.trim(),
        pairs: [],
      }
      result.push(current)
    }
    else {
      current?.pairs.push([code, value])
    }
  }
  if (result.at(-1)?.type !== 'EOF')
    throw new Error('DXF 缺少结束标记')
  return result
}

// ACI 基础色；其他颜色使用 CAD 常见的 HSV 色表近似，不声称完全保真。
function aci(index: number): string {
  const basic = [
    '#ffffff',
    '#ff0000',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#0000ff',
    '#ff00ff',
    '#ffffff',
    '#808080',
    '#c0c0c0',
  ]
  if (index < 10)
    return basic[index] ?? '#ffffff'
  if (index >= 250) {
    const v = [51, 80, 105, 130, 190, 255][index - 250] ?? 255
    return `#${v.toString(16).padStart(2, '0').repeat(3)}`
  }
  const hue = Math.floor((index - 10) / 10) * 15
  const shade = (index - 10) % 10
  const v = [255, 165, 127, 76, 38][Math.floor(shade / 2)] / 255
  const s = shade % 2
    ? 0.5
    : 1
  const f = (n: number) => {
    const k = (n + hue / 60) % 6
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(5)}${f(3)}${f(1)}`
}
function color(r: RecordData, fallback: string) {
  const trueColor = first(r, 420)
  if (trueColor !== undefined)
    return `#${Math.max(0, Math.min(0xFFFFFF, num(r, 420))).toString(16).padStart(6, '0')}`
  const index = Math.abs(num(r, 62, 256))
  return index === 256 || index === 0
    ? fallback
    : aci(index)
}

export function importDxf(source: string, name: string): CadImport {
  if (new TextEncoder().encode(source).length > 40 * 1024 * 1024)
    throw new Error('转换结果超过 40 MB 上限')
  const all = records(source)
  const doc = createDrawing(`${name.replace(/\.[^.]+$/, '').slice(0, 185) || 'CAD 图纸'} · 导入`)
  doc.layers = []
  const warnings = new Set<string>([
    '仅导入模型空间的基础二维实体；块、填充、样条、原生标注、布局和自定义数据不保留。',
    '字体、线型、颜色和线宽可能与原软件不同，请核对尺寸与外观。',
  ])
  const skipped: Record<string, number> = Object.create(null)
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }
  const layerRecords = new Map<string, RecordData>()
  const layers = new Map<string, Layer>()
  const entities: RecordData[] = []
  let section = ''
  let unit: number | undefined
  for (const r of all) {
    if (r.type === 'SECTION')
      section = first(r, 2)?.trim() ?? ''
    if (r.type === 'ENDSEC')
      section = ''
    if (section === 'HEADER') {
      const i = r.pairs.findIndex(([code, value]) => code === 9 && value.trim() === '$INSUNITS')
      if (i >= 0)
        unit = Number(r.pairs.slice(i + 1).find(([code]) => code === 70)?.[1])
    }
    if (section === 'TABLES' && r.type === 'LAYER')
      layerRecords.set(text(first(r, 2) ?? '0'), r)
    if (section === 'ENTITIES' && r.type !== 'SECTION')
      entities.push(r)
  }
  const factors: Record<number, number> = {
    1: 25.4,
    2: 304.8,
    4: 1,
    5: 10,
    6: 1000,
  }
  const factor = unit === undefined
    ? 1
    : factors[unit] ?? 1
  if (unit === undefined || !factors[unit])
    warnings.add('文件单位未指定或暂不支持，按毫米解释；请务必核对实际尺寸。')
  else if (factor !== 1)
    warnings.add(`已将文件坐标与文字高度换算为毫米（倍率 ${factor}）。`)
  const getLayer = (name: string) => {
    let layer = layers.get(name)
    if (!layer) {
      if (doc.layers.length >= 100)
        throw new Error('图层数量超过 100 上限')
      const raw = layerRecords.get(name)
      layer = {
        id: uid(),
        name: name.slice(0, 100) || '0',
        color: raw
          ? color(raw, '#ffffff')
          : '#ffffff',
        visible: raw
          ? num(raw, 62, 7) >= 0 && !(num(raw, 70) & 1)
          : true,
        locked: raw
          ? Boolean(num(raw, 70) & 4)
          : false,
      }
      layers.set(name, layer)
      doc.layers.push(layer)
    }
    return layer
  }
  // 保留图层表，即使图层当前没有基础实体。
  for (const name of layerRecords.keys()) getLayer(name)
  let total = 0
  for (let i = 0; i < entities.length; i++) {
    const r = entities[i]
    if (['VERTEX', 'SEQEND', 'ATTRIB'].includes(r.type))
      continue
    total++
    if (total > 20000)
      throw new Error('CAD 实体数量超过试用版 20000 上限')
    try {
      if (num(r, 67) === 1 || (first(r, 410) && first(r, 410) !== 'Model')) {
        skip(`${r.type}（图纸空间）`)
        continue
      }
      if (num(r, 60) === 1) {
        skip(`${r.type}（实体隐藏）`)
        continue
      }
      const types = [
        'LINE',
        'CIRCLE',
        'ARC',
        'LWPOLYLINE',
        'POLYLINE',
        'TEXT',
      ]
      if (!types.includes(r.type)) {
        skip(r.type)
        continue
      }
      if (r.pairs.some(([code, value]) => [30, 31, 38, 39, 210, 220].includes(code) && Math.abs(Number(value)) > 1e-8)
        || Math.abs(num(r, 230, 1) - 1) > 1e-8) {
        skip(`${r.type}（非 XY 平面或有厚度）`)
        continue
      }
      const layer = getLayer(text(first(r, 8) ?? '0'))
      const rawWidth = num(r, 370, -1)
      const inheritedWidth = layerRecords.get(text(first(r, 8) ?? '0'))
      const layerWidth = inheritedWidth
        ? num(inheritedWidth, 370, 25)
        : 25
      const base = {
        id: uid(),
        layerId: layer.id,
        color: color(r, layer.color),
        strokeWidth: Math.max(0.01, (rawWidth >= 0
          ? rawWidth
          : layerWidth >= 0
            ? layerWidth
            : 25) / 100),
      }
      let entity: Entity
      if (r.type === 'LINE') {
        entity = {
          ...base,
          type: 'line',
          a: point(r),
          b: point(r, 11),
        }
      }
      else if (r.type === 'CIRCLE') {
        entity = {
          ...base,
          type: 'circle',
          center: point(r),
          radius: num(r, 40),
        }
      }
      else if (r.type === 'ARC') {
        entity = {
          ...base,
          type: 'arc',
          center: point(r),
          radius: num(r, 40),
          start: num(r, 50) * Math.PI / 180,
          end: num(r, 51) * Math.PI / 180,
          ccw: true,
        }
      }
      else if (r.type === 'TEXT') {
        if (num(r, 72) || num(r, 73) || num(r, 71) || num(r, 51) || Math.abs(num(r, 41, 1) - 1) > 1e-8) {
          skip('TEXT（对齐、倾斜或变形文字）')
          continue
        }
        entity = {
          ...base,
          type: 'text',
          at: point(r),
          text: text(first(r, 1) ?? ''),
          size: num(r, 40),
          rotation: num(r, 50),
        }
      }
      else {
        let points: Point[] = []
        const closed = Boolean(num(r, 70) & 1)
        if (r.type === 'POLYLINE') {
          if (num(r, 70) & ~1) {
            skip('POLYLINE（曲线拟合或三维）')
            continue
          }
          const vertices: RecordData[] = []
          while (entities[i + 1]?.type === 'VERTEX') vertices.push(entities[++i])
          if (vertices.some(v => num(v, 42) || num(v, 30) || num(v, 40) || num(v, 41))) {
            skip('POLYLINE（弧段、宽度或三维）')
            continue
          }
          points = vertices.map(v => point(v))
        }
        else {
          if (r.pairs.some(([code, value]) => [40, 41, 42, 43].includes(code) && Number(value) !== 0)) {
            skip('LWPOLYLINE（弧段或宽度）')
            continue
          }
          for (let j = 0; j < r.pairs.length; j++) {
            if (r.pairs[j][0] !== 10)
              continue
            const x = Number(r.pairs[j][1])
            let k = j + 1
            while (k < r.pairs.length && r.pairs[k][0] !== 20 && r.pairs[k][0] !== 10) k++
            const y = r.pairs[k]
            if (y?.[0] !== 20)
              throw new Error('缺少折线 Y 坐标')
            points.push({
              x,
              y: Number(y[1]),
            })
          }
        }
        entity = {
          ...base,
          type: 'polyline',
          points,
          closed,
        }
      }
      const scaledPoint = (p: Point): Point => ({ x: p.x * factor, y: p.y * factor })
      if (entity.type === 'line') {
        entity.a = scaledPoint(entity.a)
        entity.b = scaledPoint(entity.b)
      }
      else if (entity.type === 'polyline') {
        entity.points = entity.points.map(scaledPoint)
      }
      else if (entity.type === 'circle' || entity.type === 'arc') {
        entity.center = scaledPoint(entity.center)
        entity.radius *= factor
      }
      else if (entity.type === 'text') {
        entity.at = scaledPoint(entity.at)
        entity.size *= factor
      }
      const checked = drawingSchema.safeParse({
        ...doc,
        layers: doc.layers,
        entities: [entity],
      })
      if (!checked.success) {
        skip(`${r.type}（无效或超出范围）`)
        continue
      }
      if (r.pairs.some(([code]) => code >= 1000))
        warnings.add('部分实体包含扩展数据；这些业务数据不会导入或重新导出。')
      doc.entities.push(entity)
    }
    catch (e) {
      if (e instanceof Error && e.message.includes('上限'))
        throw e
      skip(`${r.type}（无效数据）`)
    }
  }
  if (!doc.entities.length)
    throw new Error('未找到可导入的基础二维实体；文件可能为空、仅含块或不支持的对象。未创建项目。')
  if (!doc.layers.length)
    getLayer('0')
  const boxes = doc.entities.map(bounds)
  const minX = Math.min(...boxes.map(b => b.minX))
  const maxX = Math.max(...boxes.map(b => b.maxX))
  const minY = Math.min(...boxes.map(b => b.minY))
  const maxY = Math.max(...boxes.map(b => b.maxY))
  doc.view = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    scale: Math.max(0.01, Math.min(2, 600 / Math.max(maxX - minX, maxY - minY, 1))),
  }
  drawingSchema.parse(doc)
  return {
    doc,
    total,
    skipped,
    warnings: [...warnings],
  }
}

export function exportDxf(doc: Drawing): { content: string, warnings: string[] } {
  drawingSchema.parse(doc)
  const warnings = new Set<string>([
    'DWG 导出为 AutoCAD 2013 格式（AC1027），仅保留 webCAD 当前图纸的数据。',
    '原 DWG 中未导入的对象、布局、字体、线型和扩展数据不会恢复。请保留原文件及项目 JSON 备份，并在目标 CAD 软件核验。',
    '字体与线宽可能变化；矩形导出为闭合折线，尺寸标注拆成普通线条和文字，不再是原生标注。',
  ])
  const lines: string[] = []
  const add = (...pairs: (string | number)[]) => {
    lines.push(...pairs.map(String))
  }
  const layerNames = new Map<string, string>()
  const used = new Set<string>()
  for (const layer of doc.layers) {
    const safe = layer.name.replace(/[<>/\\":;?*|=\r\n]/g, '_').slice(0, 90) || '0'
    let name = safe
    for (let i = 1; used.has(name.toLowerCase()); i++) name = `${safe}_${i}`
    if (name !== layer.name)
      warnings.add('部分图层名称含非法字符或重复，已在导出文件中重命名。')
    used.add(name.toLowerCase())
    layerNames.set(layer.id, name)
  }
  add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1027', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC')
  add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB')
  add(0, 'TABLE', 2, 'LAYER', 70, doc.layers.length)
  for (const layer of doc.layers) {
    add(0, 'LAYER', 2, layerNames.get(layer.id)!, 70, layer.locked ? 4 : 0, 62, layer.visible
      ? 7
      : -7, 420, Number.parseInt(layer.color.slice(1), 16), 6, 'CONTINUOUS')
  }
  add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES')
  const p = (point: Point, code = 10) => add(code, point.x, code + 10, point.y, code + 20, 0)
  const base = (type: string, e: Entity) => {
    const layer = doc.layers.find(l => l.id === e.layerId)!
    const width = widths.reduce((best, next) => Math.abs(next - e.strokeWidth * 100) < Math.abs(best - e.strokeWidth * 100)
      ? next
      : best)
    if (Math.abs(width / 100 - e.strokeWidth) > 0.001)
      warnings.add('部分线宽已量化为 DWG 支持的标准线宽，最大为 2.11 mm。')
    add(0, type, 8, layerNames.get(e.layerId)!, 62, 7, 420, Number.parseInt((e.color ?? layer.color).slice(1), 16), 370, width)
  }
  const line = (e: Entity, a: Point, b: Point) => {
    base('LINE', e)
    p(a)
    p(b, 11)
  }
  const label = (e: Entity, at: Point, value: string, height: number, rotation: number) => {
    base('TEXT', e)
    p(at)
    add(40, height, 1, value.replace(/[\r\n]/g, ' '), 50, rotation, 7, 'Standard')
    if (/[\r\n]/.test(value))
      warnings.add('多行文字已合并为单行。')
  }
  for (const e of doc.entities) {
    if (e.type === 'line') {
      line(e, e.a, e.b)
    }
    else if (e.type === 'circle') {
      base('CIRCLE', e)
      p(e.center)
      add(40, e.radius)
    }
    else if (e.type === 'arc') {
      base('ARC', e)
      p(e.center)
      add(40, e.radius, 50, normalize(e.ccw ? e.start : e.end) * 180 / Math.PI, 51, normalize(e.ccw ? e.end : e.start) * 180 / Math.PI)
    }
    else if (e.type === 'text') {
      label(e, e.at, e.text, e.size, e.rotation)
    }
    else if (e.type === 'dimension') {
      const { p: a, q: b, midpoint, value, rotation } = dimensionGeometry(e)
      line(e, e.a, a)
      line(e, e.b, b)
      line(e, a, b)
      for (const v of [a, b]) line(e, { x: v.x - 2.5, y: v.y - 2.5 }, { x: v.x + 2.5, y: v.y + 2.5 })
      const angle = rotation * Math.PI / 180
      const length = String(Number(value.toFixed(2))).length * 6 * 0.6
      label(e, { x: midpoint.x - Math.cos(angle) * length / 2 - Math.sin(angle) * 3, y: midpoint.y - Math.sin(angle) * length / 2 + Math.cos(angle) * 3 }, String(Number(value.toFixed(2))), 6, rotation)
    }
    else {
      const points = e.type === 'polyline'
        ? e.points
        : [
            e.a,
            { x: e.b.x, y: e.a.y },
            e.b,
            { x: e.a.x, y: e.b.y },
          ]
      base('LWPOLYLINE', e)
      add(90, points.length, 70, e.type === 'rectangle' || e.closed
        ? 1
        : 0)
      for (const point of points) add(10, point.x, 20, point.y)
    }
  }
  add(0, 'ENDSEC', 0, 'EOF')
  return {
    content: `${lines.join('\n')}\n`,
    warnings: [...warnings],
  }
}
