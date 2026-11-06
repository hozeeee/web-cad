export interface Point {
  x: number
  y: number
}
export interface Layer {
  id: string
  name: string
  color: string
  visible: boolean
  locked: boolean
}
interface Base {
  id: string
  layerId: string
  color?: string
  strokeWidth: number
}
export type Entity
  = | (Base & { type: 'line', a: Point, b: Point })
    | (Base & { type: 'polyline', points: Point[], closed: boolean })
    | (Base & { type: 'rectangle', a: Point, b: Point })
    | (Base & { type: 'circle', center: Point, radius: number })
    | (Base & {
      type: 'arc'
      center: Point
      radius: number
      start: number
      end: number
      ccw: boolean
    })
    | (Base & {
      type: 'text'
      at: Point
      text: string
      size: number
      rotation: number
    })
    | (Base & {
      type: 'dimension'
      a: Point
      b: Point
      at: Point
      mode: 'horizontal' | 'vertical' | 'aligned'
      direction?: number
    })
export interface View {
  x: number
  y: number
  scale: number
}
export interface Drawing {
  version: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  units: 'mm'
  layers: Layer[]
  entities: Entity[]
  view: View
}
export type Tool
  = | 'select'
    | 'line'
    | 'polyline'
    | 'rectangle'
    | 'circle'
    | 'arc'
    | 'text'
    | 'dimension'
    | 'move'
    | 'copy'
    | 'rotate'
    | 'mirror'
    | 'trim'
export function uid() {
  return (
    globalThis.crypto?.randomUUID?.()
    ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}
export function createDrawing(name = '未命名图纸'): Drawing {
  const now = new Date().toISOString()
  return {
    version: 1,
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    units: 'mm',
    layers: [
      {
        id: uid(),
        name: '轮廓',
        color: '#d5dfeb',
        visible: true,
        locked: false,
      },
      {
        id: uid(),
        name: '辅助线',
        color: '#65a4ee',
        visible: true,
        locked: false,
      },
      {
        id: uid(),
        name: '标注',
        color: '#e9b965',
        visible: true,
        locked: false,
      },
    ],
    entities: [],
    view: { x: 0, y: 0, scale: 2 },
  }
}
export function cloneDrawing(doc: Drawing): Drawing {
  const copy = structuredClone(doc)
  const layerIds = new Map(copy.layers.map(layer => [
    layer.id,
    uid(),
  ]))
  copy.layers = copy.layers.map(layer => ({
    ...layer,
    id: layerIds.get(layer.id)!,
  }))
  copy.entities = copy.entities.map(entity => ({
    ...entity,
    id: uid(),
    layerId: layerIds.get(entity.layerId)!,
  }))
  const now = new Date().toISOString()
  return {
    ...copy,
    id: uid(),
    name: `${copy.name.slice(0, 190)} · 副本`,
    createdAt: now,
    updatedAt: now,
  }
}
