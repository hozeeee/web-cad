import type { SnapType } from '../../cad/geometry'
import type { Drawing, Entity, Point, Tool, View } from '../../cad/model'
import type { SelectionMode } from '../../cad/selection'
import { create } from 'zustand'
import {
  add,
  anchors,
  angle,
  defaultSnapTypes,
  distance,
  mirrorPoint,
  moveGrip,
  rotatePoint,
  sub,
  transform,
} from '../../cad/geometry'
import { parsePointInput, parseScalar } from '../../cad/input'
import { uid } from '../../cad/model'
import { combineSelection } from '../../cad/selection'
import { buildEntity } from '../../cad/tools'
import { trimEntity } from '../../cad/trim'
import { drawingSchema, entitySchema } from '../../io/schema'

interface GripEdit {
  original: Entity
  preview: Entity
  index: number
}
interface EditorState {
  doc: Drawing | null
  gripEdit: GripEdit | null
  beginGrip: (id: string, index: number) => boolean
  previewGrip: (point: Point) => void
  finishGrip: () => void
  cancelGrip: () => void
  history: Drawing[]
  future: Drawing[]
  revision: number
  selected: string[]
  activeLayer: string
  tool: Tool
  phase: 'idle' | 'selection' | 'point' | 'angle'
  lastTool: Tool
  lineSteps: Drawing[]
  snapTypes: SnapType[]
  snapOverride: SnapType | 'none' | null
  select: (ids: string[], mode: SelectionMode) => void
  cancel: () => void
  undoStep: () => void
  closePath: () => void
  submitInput: (value: string) => boolean
  confirmRotation: (degrees?: number) => void
  points: Point[]
  grid: boolean
  objects: boolean
  ortho: boolean
  gridStep: number
  background: 'grid' | 'white' | 'black'
  cursor: Point
  message: string
  text: string
  textSize: number
  dimensionMode: 'horizontal' | 'vertical' | 'aligned'
  rotation: number
  load: (doc: Drawing) => void
  commit: (change: (doc: Drawing) => Drawing) => void
  setView: (view: View) => void
  setTool: (tool: Tool) => void
  undo: () => void
  redo: () => void
  remove: () => void
  place: (point: Point) => void
  finish: () => void
  trim: (id: string, point: Point) => void
  transformSelection: (fn: (e: Entity) => Entity, copy?: boolean) => void
}
export const useEditor = create<EditorState>((set, get) => ({
  doc: null,
  gripEdit: null,
  beginGrip: (id, index) => {
    const s = get()
    const original = s.doc?.entities.find(e => e.id === id)
    if (s.tool !== 'select' || !editableSelection(s).includes(id)
      || !original || !Number.isInteger(index) || !anchors(original)[index]) {
      return false
    }
    set({
      gripEdit: { original, preview: original, index },
      selected: [id],
      message: '',
    })
    return true
  },
  previewGrip: (point) => {
    const s = get()
    const edit = s.gripEdit
    if (!edit)
      return
    if (!validGripEdit(s, edit)) {
      set({ gripEdit: null })
      return
    }
    const preview = moveGrip(edit.original, edit.index, point)
    if (!preview || !entitySchema.safeParse(preview).success) {
      set({
        gripEdit: { ...edit, preview: edit.original },
        message: '夹点位置无效，请避免退化图形或超出坐标范围',
      })
      return
    }
    // 预览独立于 doc：同步画布和属性，但不产生历史或触发自动保存。
    set({
      gripEdit: { ...edit, preview },
      message: '',
    })
  },
  finishGrip: () => {
    const s = get()
    const edit = s.gripEdit
    set({ gripEdit: null, snapOverride: null })
    if (!edit || !validGripEdit(s, edit) || edit.preview === edit.original)
      return
    s.commit(doc => ({
      ...doc,
      entities: doc.entities.map(e => e.id === edit.original.id
        ? edit.preview
        : e),
    }))
  },
  cancelGrip: () => set({ gripEdit: null, snapOverride: null, message: '' }),
  history: [],
  future: [],
  revision: 0,
  selected: [],
  activeLayer: '',
  tool: 'select',
  phase: 'idle',
  lastTool: 'line',
  lineSteps: [],
  snapTypes: [...defaultSnapTypes],
  snapOverride: null,
  points: [],
  grid: true,
  objects: true,
  ortho: false,
  gridStep: 10,
  background: 'grid',
  cursor: { x: 0, y: 0 },
  message: '',
  text: '设计标注',
  textSize: 8,
  dimensionMode: 'aligned',
  rotation: 45,
  load: doc =>
    set({
      doc,
      gripEdit: null,
      history: [],
      future: [],
      selected: [],
      activeLayer: doc.layers[0].id,
      tool: 'select',
      phase: 'idle',
      lastTool: 'line',
      lineSteps: [],
      snapOverride: null,
      cursor: { x: 0, y: 0 },
      points: [],
      revision: 0,
      message: '',
    }),
  commit: (change) => {
    set({ gripEdit: null })
    const { doc, history } = get()
    if (!doc)
      return
    const next = change(structuredClone(doc))
    const valid = drawingSchema.safeParse(next)
    if (!valid.success) {
      set({ message: '数据超出允许范围，请检查数值或图形数量' })
      return
    }
    set({
      doc: {
        ...next,
        updatedAt: new Date().toISOString(),
      },
      history: [
        ...history.slice(-99),
        doc,
      ],
      future: [],
      revision: get().revision + 1,
    })
  },
  setView: (view) => {
    const doc = get().doc
    if (doc) {
      set({
        doc: { ...doc, view },
        revision: get().revision + 1,
      })
    }
  },
  setTool: (tool) => {
    const s = get()
    const selected = editableSelection(s)
    set({
      tool,
      phase: tool === 'select'
        ? 'idle'
        : isTransformTool(tool) && !selected.length
          ? 'selection'
          : 'point',
      lastTool: tool === 'select'
        ? s.lastTool
        : tool,
      selected: tool === 'select' || isTransformTool(tool)
        ? selected
        : [],
      points: [],
      lineSteps: [],
      snapOverride: null,
      message: '',
      gripEdit: null,
    })
  },
  select: (ids, mode) => {
    const s = get()
    if (s.tool !== 'select' && s.phase !== 'selection')
      return
    const selected = combineSelection(s.selected, ids, mode)
    set({
      selected: editableSelection({ ...s, selected }),
      message: '',
    })
  },
  cancel: () => {
    const s = get()
    if (s.gripEdit) {
      s.cancelGrip()
      return
    }
    s.setTool('select')
    set({ selected: [] })
  },
  undoStep: () => {
    const s = get()
    if (s.phase !== 'point' || !s.points.length)
      return
    if (s.tool === 'line' && s.lineSteps.length) {
      if (s.history.at(-1) !== s.lineSteps.at(-1)) {
        set({ message: '图纸已被其他操作修改，请使用全局撤销', lineSteps: [] })
        return
      }
      s.undo()
      set({
        tool: 'line',
        phase: 'point',
        points: s.points.slice(0, -1),
        lineSteps: s.lineSteps.slice(0, -1),
        future: [],
      })
    }
    else if (s.tool === 'line' && s.points.length > 1) {
      set({ message: '已达到命令内撤销上限，请结束当前命令' })
    }
    else {
      set({
        points: s.points.slice(0, -1),
        message: '',
      })
    }
  },
  closePath: () => {
    const s = get()
    if (!['line', 'polyline'].includes(s.tool) || s.points.length < 3) {
      set({ message: '闭合需要至少三个点' })
      return
    }
    if (s.tool === 'line') {
      if (distance(s.points[0], s.points.at(-1)!) > 1e-7) {
        s.place(s.points[0])
        if (get().doc === s.doc)
          return
      }
      get().setTool('select')
    }
    else {
      finishPolyline(s, true)
    }
  },
  submitInput: (value) => {
    const s = get()
    try {
      set({ message: '' })
      const text = value.trim().toLowerCase()
      if (!text) {
        s.finish()
      }
      else if (text === 'u' || text === 'undo') {
        s.undoStep()
      }
      else if (text === 'close' || text === 'cl') {
        s.closePath()
      }
      else if (s.phase === 'angle') {
        s.confirmRotation(parseScalar(value))
      }
      else if (s.phase === 'point' && s.tool !== 'trim') {
        const base = s.points.at(-1)
        const point = s.tool === 'circle' && base && !/[,@<]/.test(value)
          ? { x: base.x + parseScalar(value), y: base.y }
          : parsePointInput(value, base, s.cursor)
        if (s.tool === 'circle' && base && !/[,@<]/.test(value) && parseScalar(value) <= 0)
          throw new Error('半径必须大于零')
        s.place(point)
      }
      else {
        throw new Error(s.phase === 'selection'
          ? '请选择对象，再按 Enter 确认选择'
          : '请先选择绘图工具')
      }
      return !get().message
    }
    catch (e) {
      set({
        message: e instanceof Error
          ? e.message
          : '输入无效',
      })
      return false
    }
  },
  confirmRotation: (degrees) => {
    const s = get()
    if (s.tool !== 'rotate' || s.phase !== 'angle' || !s.points[0])
      return
    const rotation = degrees ?? s.rotation
    if (!Number.isFinite(rotation) || Math.abs(rotation) > 1e9) {
      set({ message: '旋转角度无效' })
      return
    }
    if (Math.abs(rotation % 360) < 1e-7) {
      s.setTool('select')
      return
    }
    s.transformSelection(e => transform(e, p => rotatePoint(p, s.points[0], rotation * Math.PI / 180), rotation))
    if (get().doc !== s.doc) {
      s.setTool('select')
      set({ rotation })
    }
  },
  undo: () => {
    get().setTool('select')
    const { history, doc, future } = get()
    if (!history.length || !doc)
      return
    set({
      doc: {
        ...history[history.length - 1],
        view: doc.view,
      },
      history: history.slice(0, -1),
      future: [doc, ...future],
      selected: [],
      points: [],
      revision: get().revision + 1,
      activeLayer: history[history.length - 1].layers.some(
        l => l.id === get().activeLayer,
      )
        ? get().activeLayer
        : history[history.length - 1].layers[0].id,
    })
  },
  redo: () => {
    get().setTool('select')
    const { future, doc, history } = get()
    if (!future.length || !doc)
      return
    set({
      doc: { ...future[0], view: doc.view },
      history: [...history, doc],
      future: future.slice(1),
      selected: [],
      points: [],
      revision: get().revision + 1,
      activeLayer: future[0].layers.some(l => l.id === get().activeLayer)
        ? get().activeLayer
        : future[0].layers[0].id,
    })
  },
  remove: () => {
    const s = get()
    const ids = editableSelection(s)
    if (ids.length) {
      s.commit(doc => ({
        ...doc,
        entities: doc.entities.filter(e => !ids.includes(e.id)),
      }))
    }
    set({ selected: [] })
  },
  transformSelection: (fn, copy = false) => {
    const s = get()
    const ids = editableSelection(s)
    if (!ids.length) {
      set({ message: '请先选择未锁定的图形' })
      return
    }
    s.commit((doc) => {
      const changed = doc.entities
        .filter(e => ids.includes(e.id))
        .map(e => ({
          ...fn(e),
          id: copy
            ? uid()
            : e.id,
        }))
      return {
        ...doc,
        entities: copy
          ? [
              ...doc.entities,
              ...changed,
            ]
          : doc.entities.map(e => changed.find(c => c.id === e.id) ?? e),
      }
    })
  },
  place: (point) => {
    const s = get()
    if (!s.doc || s.tool === 'select' || s.tool === 'trim')
      return
    if (![point.x, point.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1e9)) {
      set({ message: '坐标超出允许范围' })
      return
    }
    if (s.phase === 'selection') {
      set({ message: '请选择对象，再按 Enter 确认选择' })
      return
    }
    const points = [...s.points, point]
    if (isTransformTool(s.tool)) {
      if (!editableSelection(s).length) {
        set({ phase: 'selection', points: [], message: '请选择未锁定的图形，再按 Enter' })
        return
      }
      if (s.tool === 'rotate') {
        if (!s.points.length) {
          set({
            points: [point],
            phase: 'angle',
            cursor: point,
            message: '',
            snapOverride: null,
          })
        }
        else if (distance(s.points[0], point) > 1e-7) {
          s.confirmRotation(angle(point, s.points[0]) * 180 / Math.PI)
        }
        return
      }
      if (points.length < 2) {
        set({
          points,
          cursor: point,
          message: '',
          snapOverride: null,
        })
        return
      }
      if (s.tool === 'move' && distance(points[0], point) < 1e-7) {
        s.setTool('select')
        return
      }
      if (s.tool === 'mirror' && distance(points[0], point) < 1e-7) {
        set({ message: '镜像轴需要两个不同点' })
        return
      }
      if (s.tool === 'mirror') {
        s.transformSelection(e =>
          transform(
            e,
            p => mirrorPoint(p, points[0], point),
            (angle(point, points[0]) * 360) / Math.PI,
            true,
          ),
        )
      }
      else {
        s.transformSelection(
          e => transform(e, p => add(p, sub(point, points[0]))),
          s.tool === 'copy',
        )
      }
      if (get().doc !== s.doc)
        s.setTool('select')
      return
    }
    const layer = s.doc.layers.find(l => l.id === s.activeLayer)
    if (!layer || layer.locked || !layer.visible) {
      set({ message: '当前图层隐藏或已锁定，请切换图层' })
      return
    }
    const count
      = s.tool === 'text'
        ? 1
        : ['arc', 'dimension'].includes(s.tool)
            ? 3
            : 2
    if (s.points.length && distance(s.points.at(-1)!, point) < 1e-7 && s.tool !== 'dimension') {
      set({ message: '下一点不能与上一点重合' })
      return
    }
    if (s.tool === 'polyline' || points.length < count) {
      set({
        points,
        cursor: point,
        message: '',
        snapOverride: null,
      })
      return
    }
    const entity = buildEntity(s.tool, s.tool === 'line'
      ? [
          s.points.at(-1)!,
          point,
        ]
      : points, s.activeLayer, {
      text: s.text,
      size: s.textSize,
      mode: s.dimensionMode,
    })
    if (!entity) {
      set({ message: '无法构建图形：请检查点的位置或文字内容' })
      return
    }
    s.commit(doc => ({
      ...doc,
      entities: [...doc.entities, entity],
    }))
    if (get().doc !== s.doc) {
      set({
        points: s.tool === 'line'
          ? points
          : [],
        lineSteps: s.tool === 'line'
          ? [
              ...s.lineSteps.slice(-99),
              s.doc,
            ]
          : [],
        cursor: point,
        snapOverride: null,
        message: '',
      })
    }
  },
  finish: () => {
    const s = get()
    if (s.phase === 'selection') {
      const selected = editableSelection(s)
      if (!selected.length) {
        set({ message: '请至少选择一个未锁定的图形' })
        return
      }
      set({ selected, phase: 'point', message: '' })
    }
    else if (s.phase === 'angle') {
      s.confirmRotation()
    }
    else if (s.tool === 'polyline' && s.points.length >= 2) {
      finishPolyline(s, false)
    }
    else if (s.tool === 'select') {
      s.setTool(s.lastTool)
    }
    else {
      s.setTool('select')
    }
  },
  trim: (id, point) => {
    const s = get()
    const target = s.doc?.entities.find(e => e.id === id)
    if (!target || !s.doc)
      return
    const layer = s.doc.layers.find(l => l.id === target.layerId)
    if (!layer?.visible || layer.locked)
      return
    // 点击位置决定移除区段，所有可见几何都可作为边界。
    const trimmed = trimEntity(
      target,
      s.doc.entities.filter(
        e => s.doc!.layers.find(l => l.id === e.layerId)?.visible,
      ),
      point,
    )
    if (!trimmed) {
      set({ message: '没有有效交点，或目标不是直线、圆、圆弧' })
      return
    }
    s.commit(doc => ({
      ...doc,
      entities: [
        ...doc.entities.filter(e => e.id !== id),
        ...trimmed,
      ],
    }))
    set({ selected: [], message: '' })
  },
}))
export function isTransformTool(tool: Tool) {
  return ['move', 'copy', 'rotate', 'mirror'].includes(tool)
}
function finishPolyline(s: EditorState, closed: boolean) {
  const layer = s.doc?.layers.find(l => l.id === s.activeLayer)
  if (!layer?.visible || layer.locked) {
    useEditor.setState({ message: '当前图层不可编辑' })
    return
  }
  const entity = buildEntity('polyline', s.points, s.activeLayer, { text: s.text, size: s.textSize, mode: s.dimensionMode })
  if (!entity || entity.type !== 'polyline') {
    useEditor.setState({ message: '折线点的位置无效' })
    return
  }
  s.commit(doc => ({
    ...doc,
    entities: [
      ...doc.entities,
      { ...entity, closed },
    ],
  }))
  if (useEditor.getState().doc !== s.doc)
    s.setTool('select')
}
function validGripEdit(s: EditorState, edit: GripEdit) {
  return s.tool === 'select'
    && s.doc?.entities.find(e => e.id === edit.original.id) === edit.original
    && editableSelection(s).includes(edit.original.id)
}
function editableSelection(s: EditorState) {
  return s.selected.filter((id) => {
    const e = s.doc?.entities.find(e => e.id === id)
    const layer = s.doc?.layers.find(l => l.id === e?.layerId)
    return layer?.visible && !layer.locked
  })
}
