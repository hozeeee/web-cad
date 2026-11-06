import type { Point } from './model'
import { add, angle, distance, EPS, polar } from './geometry'

const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?'
const cartesian = new RegExp(`^(@)?(${number}),(${number})$`, 'i')
const polarInput = new RegExp(`^(@)?(${number})<(${number})$`, 'i')
const scalar = new RegExp(`^${number}$`, 'i')

export function parseScalar(value: string): number {
  if (!scalar.test(value.trim()))
    throw new Error('请输入有效数字')
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n) > 1e9)
    throw new Error('数值超出允许范围')
  return n
}

// 精确输入不再经过网格或对象捕捉；鼠标方向只用于直接距离输入。
export function parsePointInput(value: string, base?: Point, direction?: Point): Point {
  const text = value.trim().replace(/\s*([@,<])\s*/g, '$1')
  const xy = cartesian.exec(text)
  const pa = polarInput.exec(text)
  let point: Point
  if (xy) {
    if (xy[1] && !base)
      throw new Error('相对坐标需要先指定基点')
    point = add(xy[1]
      ? base!
      : { x: 0, y: 0 }, {
      x: parseScalar(xy[2]),
      y: parseScalar(xy[3]),
    })
  }
  else if (pa) {
    if (pa[1] && !base)
      throw new Error('相对极坐标需要先指定基点')
    const length = parseScalar(pa[2])
    if (length < 0)
      throw new Error('极坐标距离不能为负数')
    point = polar(pa[1]
      ? base!
      : { x: 0, y: 0 }, length, parseScalar(pa[3]) * Math.PI / 180)
  }
  else {
    const length = parseScalar(text)
    if (!base || !direction || distance(base, direction) < EPS)
      throw new Error('距离输入需要先指定基点，再用鼠标指定方向')
    if (length <= 0)
      throw new Error('距离必须大于零')
    point = polar(base, length, angle(direction, base))
  }
  if (![point.x, point.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1e9))
    throw new Error('坐标超出允许范围')
  return point
}
