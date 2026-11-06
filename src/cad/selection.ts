import type { Entity, Point } from './model'
import { add, bounds, corners, dimensionGeometry, EPS, intersections, lineIntersection, polar, rotatePoint, segments } from './geometry'

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'toggle'

export function combineSelection(current: string[], ids: string[], mode: SelectionMode): string[] {
  if (mode === 'replace') {
    return [
      ...new Set(ids),
    ]
  }
  if (mode === 'subtract')
    return current.filter(id => !ids.includes(id))
  if (mode === 'toggle') {
    return [
      ...current.filter(id => !ids.includes(id)),
      ...ids.filter(id => !current.includes(id)),
    ]
  }
  return [
    ...new Set([
      ...current,
      ...ids,
    ]),
  ]
}

// 交叉选择检查实际曲线，不把圆心或包围盒内部当成曲线。
export function inSelectionBox(entity: Entity, a: Point, b: Point, crossing: boolean): boolean {
  const min = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
  }
  const max = {
    x: Math.max(a.x, b.x),
    y: Math.max(a.y, b.y),
  }
  const inside = (p: Point) => p.x >= min.x - EPS && p.x <= max.x + EPS
    && p.y >= min.y - EPS && p.y <= max.y + EPS
  if (!crossing) {
    const r = bounds(entity)
    return inside({ x: r.minX, y: r.minY }) && inside({ x: r.maxX, y: r.maxY })
  }
  const box: Entity = {
    id: 'selection',
    layerId: entity.layerId,
    strokeWidth: 1,
    type: 'rectangle',
    a: min,
    b: max,
  }
  if (entity.type === 'circle' || entity.type === 'arc') {
    const start = polar(entity.center, entity.radius, entity.type === 'arc'
      ? entity.start
      : 0)
    return inside(start) || intersections(entity, box).length > 0
  }
  let edges = segments(entity)
  if (entity.type === 'dimension') {
    const d = dimensionGeometry(entity)
    edges = [
      [entity.a, d.p],
      [d.p, d.q],
      [d.q, entity.b],
    ]
  }
  if (entity.type === 'text') {
    // 普通 SVG 文字使用旋转后的排版矩形作为选择区域。
    const points = corners({ x: 0, y: -entity.size * 0.2 }, { x: entity.size * Array.from(entity.text).length * 0.8, y: entity.size })
      .map(p => add(entity.at, rotatePoint(p, { x: 0, y: 0 }, entity.rotation * Math.PI / 180)))
    edges = points.map((p, i) => [p, points[(i + 1) % points.length]])
    const local = rotatePoint(min, entity.at, -entity.rotation * Math.PI / 180)
    if (local.x >= entity.at.x && local.x <= entity.at.x + entity.size * Array.from(entity.text).length * 0.8
      && local.y >= entity.at.y - entity.size * 0.2 && local.y <= entity.at.y + entity.size) {
      return true
    }
  }
  return edges.some(([p, q]) => inside(p) || inside(q)
    || segments(box).some(([r, s]) => lineIntersection(p, q, r, s).length > 0))
}
