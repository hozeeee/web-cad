import type { Entity, Point } from './model'
import {
  add,
  angle,
  dot,
  EPS,
  intersections,
  mul,
  normalize,
  sub,
  sweep,
  TAU,
} from './geometry'
import { uid } from './model'

function unique(values: number[]) {
  return values
    .sort((a, b) => a - b)
    .filter((v, i, all) => i === 0 || Math.abs(v - all[i - 1]) > EPS)
}
export function trimEntity(
  target: Entity,
  cutters: Entity[],
  click: Point,
): Entity[] | null {
  const points = cutters
    .filter(e => e.id !== target.id)
    .flatMap(e => intersections(target, e))
  if (target.type === 'line') {
    const v = sub(target.b, target.a)
    const n = dot(v, v)
    if (n < EPS)
      return null
    const cuts = unique(
      points
        .map(p => dot(sub(p, target.a), v) / n)
        .filter(t => t > EPS && t < 1 - EPS),
    )
    if (!cuts.length)
      return null
    const ticks = [0, ...cuts, 1]
    const t = Math.max(0, Math.min(1, dot(sub(click, target.a), v) / n))
    const removed = Math.min(
      ticks.length - 2,
      ticks.findIndex((value, i) => i > 0 && t <= value) - 1,
    )
    return ticks.slice(0, -1).flatMap((start, i) =>
      i === removed
        ? []
        : [
            {
              ...target,
              id: uid(),
              a: add(target.a, mul(v, start)),
              b: add(target.a, mul(v, ticks[i + 1])),
            },
          ],
    )
  }
  if (target.type !== 'circle' && target.type !== 'arc')
    return null
  const start = target.type === 'arc'
    ? target.start
    : 0
  const ccw = target.type === 'arc'
    ? target.ccw
    : true
  const parameter = (p: Point) =>
    normalize(
      ccw
        ? angle(p, target.center) - start
        : start - angle(p, target.center),
    )
  const total = target.type === 'arc'
    ? sweep(target)
    : TAU
  const cuts = unique(
    points
      .map(parameter)
      .filter(t => target.type === 'circle' || (t > EPS && t < total - EPS)),
  )
  if (target.type === 'circle') {
    if (cuts.length < 2)
      return null
    const t = parameter(click)
    let i = cuts.findIndex(
      (value, index) => t >= value && t < (cuts[index + 1] ?? cuts[0] + TAU),
    )
    if (i === -1)
      i = cuts.length - 1
    const a = cuts[(i + 1) % cuts.length]
    const b = cuts[i]
    return [
      {
        ...target,
        id: uid(),
        type: 'arc',
        start: a,
        end: b,
        ccw: true,
      },
    ]
  }
  if (!cuts.length)
    return null
  const ticks = [0, ...cuts, total]
  const t = parameter(click)
  const removed = Math.min(
    ticks.length - 2,
    ticks.findIndex((value, i) => i > 0 && t <= value) - 1,
  )
  return ticks.slice(0, -1).flatMap((a, i) =>
    i === removed
      ? []
      : [
          {
            ...target,
            id: uid(),
            start: start + (ccw
              ? a
              : -a),
            end: start + (ccw
              ? ticks[i + 1]
              : -ticks[i + 1]),
          },
        ],
  )
}
