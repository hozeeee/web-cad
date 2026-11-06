import type { Entity, Point, View } from './model'

export const TAU = Math.PI * 2
export const EPS = 1e-7
export function add(a: Point, b: Point): Point {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  }
}
export function sub(a: Point, b: Point): Point {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  }
}
export const mul = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n })
export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
export const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export function angle(p: Point, center: Point) {
  return Math.atan2(p.y - center.y, p.x - center.x)
}
export const normalize = (n: number) => ((n % TAU) + TAU) % TAU
export function polar(c: Point, r: number, t: number): Point {
  return {
    x: c.x + r * Math.cos(t),
    y: c.y + r * Math.sin(t),
  }
}
export function screenToWorld(p: Point, v: View, w: number, h: number): Point {
  return {
    x: (p.x - w / 2) / v.scale + v.x,
    y: -(p.y - h / 2) / v.scale + v.y,
  }
}
export function worldToScreen(p: Point, v: View, w: number, h: number): Point {
  return {
    x: (p.x - v.x) * v.scale + w / 2,
    y: -(p.y - v.y) * v.scale + h / 2,
  }
}
export function sweep(e: Extract<Entity, { type: 'arc' }>) {
  return e.ccw
    ? normalize(e.end - e.start)
    : normalize(e.start - e.end)
}
export function onArc(e: Extract<Entity, { type: 'arc' }>, t: number) {
  return (
    (e.ccw
      ? normalize(t - e.start)
      : normalize(e.start - t)) <= sweep(e) + EPS
  )
}
export function arcFromThree(a: Point, mid: Point, b: Point) {
  const u = sub(mid, a)
  const v = sub(b, a)
  const d = 2 * cross(u, v)
  if (Math.abs(d) < EPS)
    return null
  const center = add(a, {
    x: (dot(u, u) * v.y - dot(v, v) * u.y) / d,
    y: (u.x * dot(v, v) - v.x * dot(u, u)) / d,
  })
  return {
    center,
    radius: distance(center, a),
    start: angle(a, center),
    end: angle(b, center),
    ccw: cross(u, v) > 0,
  }
}
export function corners(a: Point, b: Point): Point[] {
  return [
    a,
    { x: b.x, y: a.y },
    b,
    { x: a.x, y: b.y },
  ]
}
export function dimensionGeometry(e: Extract<Entity, { type: 'dimension' }>) {
  let p: Point, q: Point
  if (e.mode === 'horizontal') {
    p = { x: e.a.x, y: e.at.y }
    q = { x: e.b.x, y: e.at.y }
  }
  else if (e.mode === 'vertical') {
    p = { x: e.at.x, y: e.a.y }
    q = { x: e.at.x, y: e.b.y }
  }
  else {
    const v
      = e.direction === undefined
        ? mul(sub(e.b, e.a), 1 / (distance(e.a, e.b) || 1))
        : {
            x: Math.cos(e.direction),
            y: Math.sin(e.direction),
          }
    const n = { x: -v.y, y: v.x }
    const offset = mul(n, dot(sub(e.at, e.a), n))
    p = add(e.a, offset)
    q = add(p, mul(v, dot(sub(e.b, e.a), v)))
  }
  return {
    p,
    q,
    midpoint: mul(add(p, q), 0.5),
    value: distance(p, q),
    rotation: (angle(q, p) * 180) / Math.PI,
  }
}
export function anchors(e: Entity): Point[] {
  switch (e.type) {
    case 'line':
      return [
        e.a,
        e.b,
        mul(add(e.a, e.b), 0.5),
      ]
    case 'rectangle': {
      const points = corners(e.a, e.b)
      return points.flatMap((p, i) => [
        p,
        mul(add(p, points[(i + 1) % points.length]), 0.5),
      ])
    }
    case 'polyline':
      return e.points.flatMap((p, i) =>
        i || e.closed
          ? [
              p,
              mul(
                add(p, e.points[(i + e.points.length - 1) % e.points.length]),
                0.5,
              ),
            ]
          : [p],
      )
    case 'circle':
      return [
        e.center,
        ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(t =>
          polar(e.center, e.radius, t),
        ),
      ]
    case 'arc':
      return [
        e.center,
        polar(e.center, e.radius, e.start),
        polar(e.center, e.radius, e.end),
        polar(e.center, e.radius, e.start + ((e.ccw
          ? 1
          : -1) * sweep(e)) / 2),
      ]
    case 'text':
      return [e.at]
    case 'dimension':
      return [e.a, e.b, e.at]
  }
}
// 索引与 anchors 的顺序一致；始终基于按下时的实体计算，避免累积位移。
export function moveGrip(e: Entity, index: number, point: Point): Entity | null {
  const anchor = anchors(e)[index]
  if (!Number.isInteger(index) || !anchor)
    return null
  if (distance(anchor, point) < EPS)
    return e
  const delta = sub(point, anchor)
  switch (e.type) {
    case 'line': {
      if (index === 2)
        return transform(e, p => add(p, delta))
      const next = { ...e, [index === 0
        ? 'a'
        : 'b']: point }
      return distance(next.a, next.b) > EPS
        ? next
        : null
    }
    case 'polyline': {
      const vertex = e.closed
        ? Math.floor(index / 2)
        : Math.ceil(index / 2)
      const midpoint = e.closed
        ? index % 2 === 1
        : index > 0 && index % 2 === 0
      const previous = (vertex + e.points.length - 1) % e.points.length
      return {
        ...e,
        points: e.points.map((p, i) => midpoint
          ? i === vertex || i === previous
            ? add(p, delta)
            : p
          : i === vertex
            ? point
            : p),
      }
    }
    case 'rectangle': {
      const corner = Math.floor(index / 2)
      const a = { ...e.a }
      const b = { ...e.b }
      if (index % 2 === 0) {
        if (corner === 0 || corner === 3)
          a.x = point.x
        else
          b.x = point.x
        if (corner === 0 || corner === 1)
          a.y = point.y
        else
          b.y = point.y
      }
      else if (corner === 0) {
        a.y = point.y
      }
      else if (corner === 1) {
        b.x = point.x
      }
      else if (corner === 2) {
        b.y = point.y
      }
      else {
        a.x = point.x
      }
      if (a.x === e.a.x && a.y === e.a.y && b.x === e.b.x && b.y === e.b.y)
        return e
      return Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS
        ? { ...e, a, b }
        : null
    }
    case 'circle':
      return index === 0
        ? { ...e, center: point }
        : distance(e.center, point) > EPS
          ? {
              ...e,
              radius: distance(e.center, point),
            }
          : null
    case 'arc': {
      if (index === 0)
        return transform(e, p => add(p, delta))
      const grips = anchors(e)
      const arc = arcFromThree(
        index === 1
          ? point
          : grips[1],
        index === 3
          ? point
          : grips[3],
        index === 2
          ? point
          : grips[2],
      )
      return arc
        ? {
            ...e,
            ...arc,
          }
        : null
    }
    case 'text':
      return { ...e, at: point }
    case 'dimension':
      return { ...e, [index === 0
        ? 'a'
        : index === 1
          ? 'b'
          : 'at']: point }
  }
}
export function bounds(e: Entity) {
  let points = anchors(e)
  if (e.type === 'circle' || e.type === 'arc') {
    points = [0, Math.PI / 2, Math.PI, Math.PI * 1.5]
      .filter(t => e.type === 'circle' || onArc(e, t))
      .map(t => polar(e.center, e.radius, t))
    if (e.type === 'arc') {
      points.push(
        polar(e.center, e.radius, e.start),
        polar(e.center, e.radius, e.end),
      )
    }
  }
  if (e.type === 'text') {
    const w = e.size * Array.from(e.text).length * 0.8
    points = corners({ x: 0, y: -e.size * 0.2 }, { x: w, y: e.size }).map(p =>
      add(e.at, rotatePoint(p, { x: 0, y: 0 }, (e.rotation * Math.PI) / 180)),
    )
  }
  if (e.type === 'dimension') {
    const d = dimensionGeometry(e)
    points.push(d.p, d.q)
  }
  return {
    minX: Math.min(...points.map(p => p.x)),
    maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)),
    maxY: Math.max(...points.map(p => p.y)),
  }
}
export const snapNames = {
  endpoint: '端点',
  midpoint: '中点',
  center: '圆心',
  quadrant: '象限点',
  intersection: '交点',
  insertion: '插入点',
  nearest: '最近点',
  perpendicular: '垂足',
  tangent: '切点',
} as const
export type SnapType = keyof typeof snapNames
export const defaultSnapTypes: SnapType[] = [
  'endpoint',
  'midpoint',
  'center',
  'quadrant',
  'intersection',
  'insertion',
]
export interface SnapResult {
  point: Point
  snapped: boolean
  type?: SnapType
  entityIds?: string[]
}
function typedAnchors(e: Entity): { point: Point, type: SnapType }[] {
  return anchors(e).map((point, i) => {
    let type: SnapType = 'endpoint'
    if (e.type === 'line' && i === 2)
      type = 'midpoint'
    if (e.type === 'rectangle' && i % 2 === 1)
      type = 'midpoint'
    if (e.type === 'polyline' && (e.closed
      ? i % 2 === 1
      : i > 0 && i % 2 === 0)) {
      type = 'midpoint'
    }
    if (e.type === 'circle') {
      type = i === 0
        ? 'center'
        : 'quadrant'
    }
    if (e.type === 'arc') {
      type = i === 0
        ? 'center'
        : i === 3
          ? 'midpoint'
          : 'endpoint'
    }
    if (e.type === 'text' || (e.type === 'dimension' && i === 2))
      type = 'insertion'
    return { point, type }
  })
}
function projection(p: Point, a: Point, b: Point, clamp: boolean): Point | null {
  const v = sub(b, a)
  if (dot(v, v) < EPS)
    return null
  const t = dot(sub(p, a), v) / dot(v, v)
  if (!clamp && (t < -EPS || t > 1 + EPS))
    return null
  return add(a, mul(v, clamp
    ? Math.max(0, Math.min(1, t))
    : t))
}
export function snap(
  p: Point,
  entities: Entity[],
  scale: number,
  grid: boolean,
  objects: boolean,
  step: number,
  base?: Point,
  ortho = false,
  types: readonly SnapType[] = defaultSnapTypes,
): SnapResult {
  let next = p
  const tolerance = 10 / scale
  let best = tolerance
  let hit: SnapResult | undefined
  const horizontal = !base || Math.abs(p.x - base.x) >= Math.abs(p.y - base.y)
  if (ortho && base) {
    next = horizontal
      ? { x: p.x, y: base.y }
      : { x: base.x, y: p.y }
  }
  const consider = (point: Point | null, type: SnapType, entityIds: string[]) => {
    if (!point || !types.includes(type))
      return
    if (ortho && base && (horizontal
      ? Math.abs(point.y - base.y)
      : Math.abs(point.x - base.x)) > EPS) {
      return
    }
    const d = distance(next, point)
    if (d < best) {
      best = d
      hit = {
        point,
        snapped: true,
        type,
        entityIds,
      }
    }
  }
  if (objects) {
    for (const e of entities) {
      for (const a of typedAnchors(e))
        consider(a.point, a.type, [e.id])
      for (const [a, b] of segments(e)) {
        if (types.includes('nearest'))
          consider(projection(next, a, b, true), 'nearest', [e.id])
        if (base && types.includes('perpendicular'))
          consider(projection(base, a, b, false), 'perpendicular', [e.id])
      }
      if (e.type === 'circle' || e.type === 'arc') {
        const onCurve = (q: Point) => e.type === 'circle' || onArc(e, angle(q, e.center))
        if (e.type === 'arc') {
          for (const t of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
            const q = polar(e.center, e.radius, t)
            if (onCurve(q))
              consider(q, 'quadrant', [e.id])
          }
          consider(polar(e.center, e.radius, e.start), 'nearest', [e.id])
          consider(polar(e.center, e.radius, e.end), 'nearest', [e.id])
        }
        const radial = polar(e.center, e.radius, angle(next, e.center))
        if (onCurve(radial))
          consider(radial, 'nearest', [e.id])
        if (base && distance(base, e.center) > EPS) {
          const t = angle(base, e.center)
          for (const r of [t, t + Math.PI]) {
            const q = polar(e.center, e.radius, r)
            if (onCurve(q))
              consider(q, 'perpendicular', [e.id])
          }
          const d = distance(base, e.center)
          if (d >= e.radius) {
            const offset = Math.acos(e.radius / d)
            for (const r of [t - offset, t + offset]) {
              const q = polar(e.center, e.radius, r)
              if (onCurve(q))
                consider(q, 'tangent', [e.id])
            }
          }
        }
      }
    }
    if (types.includes('intersection')) {
      // 仅比较光标容差附近的包围盒，避免每次移动扫描全图实体对。
      const nearby = entities.filter((e) => {
        const b = bounds(e)
        return next.x >= b.minX - tolerance && next.x <= b.maxX + tolerance
          && next.y >= b.minY - tolerance && next.y <= b.maxY + tolerance
      })
      for (let i = 0; i < nearby.length; i++) {
        for (let j = i + 1; j < nearby.length; j++) {
          for (const q of intersections(nearby[i], nearby[j]))
            consider(q, 'intersection', [nearby[i].id, nearby[j].id])
        }
      }
    }
    if (hit)
      return hit
  }
  if (grid) {
    next = {
      x: Math.round(next.x / step) * step,
      y: Math.round(next.y / step) * step,
    }
  }
  if (ortho && base) {
    next = horizontal
      ? { ...next, y: base.y }
      : { ...next, x: base.x }
  }
  return { point: next, snapped: false }
}
export function rotatePoint(p: Point, c: Point, t: number): Point {
  const v = sub(p, c)
  return add(c, {
    x: v.x * Math.cos(t) - v.y * Math.sin(t),
    y: v.x * Math.sin(t) + v.y * Math.cos(t),
  })
}
export function transform(
  e: Entity,
  fn: (p: Point) => Point,
  rotation = 0,
  reflected = false,
): Entity {
  switch (e.type) {
    case 'line':
      return {
        ...e,
        a: fn(e.a),
        b: fn(e.b),
      }
    case 'rectangle':
      return rotation === 0 && !reflected
        ? {
            ...e,
            a: fn(e.a),
            b: fn(e.b),
          }
        : {
            ...e,
            type: 'polyline',
            points: corners(e.a, e.b).map(fn),
            closed: true,
          }
    case 'polyline':
      return {
        ...e,
        points: e.points.map(fn),
      }
    case 'circle':
      return {
        ...e,
        center: fn(e.center),
      }
    case 'arc': {
      const center = fn(e.center)
      return {
        ...e,
        center,
        start: angle(fn(polar(e.center, e.radius, e.start)), center),
        end: angle(fn(polar(e.center, e.radius, e.end)), center),
        ccw: reflected
          ? !e.ccw
          : e.ccw,
      }
    }
    case 'text':
      return {
        ...e,
        at: fn(e.at),
        rotation: reflected
          ? rotation - e.rotation
          : e.rotation + rotation,
      }
    case 'dimension': {
      const d = dimensionGeometry(e)
      return rotation === 0 && !reflected
        ? {
            ...e,
            a: fn(e.a),
            b: fn(e.b),
            at: fn(e.at),
          }
        : {
            ...e,
            a: fn(e.a),
            b: fn(e.b),
            at: fn(d.midpoint),
            mode: 'aligned',
            direction: angle(fn(d.q), fn(d.p)),
          }
    }
  }
}
export function mirrorPoint(p: Point, a: Point, b: Point) {
  const v = sub(b, a)
  const n = dot(v, v)
  if (n < EPS)
    return p
  const projection = add(a, mul(v, dot(sub(p, a), v) / n))
  return sub(mul(projection, 2), p)
}
export function segments(e: Entity): [Point, Point][] {
  if (e.type === 'line') {
    return [
      [e.a, e.b],
    ]
  }
  const p
    = e.type === 'rectangle'
      ? corners(e.a, e.b)
      : e.type === 'polyline'
        ? e.points
        : []
  return p.flatMap((a, i) =>
    i < p.length - 1
      ? [
          [a, p[i + 1]] as [Point, Point],
        ]
      : e.type === 'rectangle' || (e.type === 'polyline' && e.closed)
        ? [
            [a, p[0]] as [Point, Point],
          ]
        : [],
  )
}
export function lineIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point[] {
  const u = sub(b, a)
  const v = sub(d, c)
  const den = cross(u, v)
  if (Math.abs(den) < EPS)
    return []
  const t = cross(sub(c, a), v) / den
  const s = cross(sub(c, a), u) / den
  return t >= -EPS && t <= 1 + EPS && s >= -EPS && s <= 1 + EPS
    ? [
        add(a, mul(u, t)),
      ]
    : []
}
function lineCircle(
  a: Point,
  b: Point,
  center: Point,
  radius: number,
): Point[] {
  const v = sub(b, a)
  const u = sub(a, center)
  const aa = dot(v, v)
  const bb = 2 * dot(u, v)
  const cc = dot(u, u) - radius * radius
  const disc = bb * bb - 4 * aa * cc
  if (aa < EPS || disc < -EPS)
    return []
  return [
    (-bb - Math.sqrt(Math.max(0, disc))) / (2 * aa),
    (-bb + Math.sqrt(Math.max(0, disc))) / (2 * aa),
  ]
    .filter(t => t >= -EPS && t <= 1 + EPS)
    .map(t => add(a, mul(v, t)))
}
export function intersections(a: Entity, b: Entity): Point[] {
  const sa = segments(a)
  const sb = segments(b)
  const ca = a.type === 'circle' || a.type === 'arc'
    ? a
    : null
  const cb = b.type === 'circle' || b.type === 'arc'
    ? b
    : null
  const points: Point[] = []
  for (const [p, q] of sa) {
    for (const [r, s] of sb) points.push(...lineIntersection(p, q, r, s))
  }
  if (cb) {
    for (const [p, q] of sa)
      points.push(...lineCircle(p, q, cb.center, cb.radius))
  }
  if (ca) {
    for (const [p, q] of sb)
      points.push(...lineCircle(p, q, ca.center, ca.radius))
  }
  if (ca && cb) {
    const d = distance(ca.center, cb.center)
    if (
      d > EPS
      && d <= ca.radius + cb.radius + EPS
      && d >= Math.abs(ca.radius - cb.radius) - EPS
    ) {
      const x = (ca.radius ** 2 - cb.radius ** 2 + d ** 2) / (2 * d)
      const h = Math.sqrt(Math.max(0, ca.radius ** 2 - x ** 2))
      const v = mul(sub(cb.center, ca.center), 1 / d)
      const p = add(ca.center, mul(v, x))
      const n = mul({ x: -v.y, y: v.x }, h)
      points.push(add(p, n), sub(p, n))
    }
  }
  return points.filter(
    p =>
      (!ca || ca.type === 'circle' || onArc(ca, angle(p, ca.center)))
      && (!cb || cb.type === 'circle' || onArc(cb, angle(p, cb.center))),
  )
}
