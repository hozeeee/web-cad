import type { Entity } from './model'
import { describe, expect, it } from 'vitest'
import { combineSelection, inSelectionBox } from './selection'

const base = { id: 'a', layerId: 'l', strokeWidth: 0.5 }
const line: Entity = {
  ...base,
  type: 'line',
  a: { x: -100, y: 0 },
  b: { x: 100, y: 0 },
}
const circle: Entity = {
  ...base,
  type: 'circle',
  center: { x: 0, y: 0 },
  radius: 50,
}
describe('方向框选', () => {
  it('窗口只选完全包含，交叉选穿过的长线', () => {
    const a = { x: -10, y: -10 }
    const b = { x: 10, y: 10 }
    expect(inSelectionBox(line, a, b, false)).toBe(false)
    expect(inSelectionBox(line, a, b, true)).toBe(true)
    expect(inSelectionBox(line, { x: -110, y: -10 }, { x: 110, y: 10 }, false)).toBe(true)
  })
  it('圆心和包围盒内部没有曲线时不会交叉误选', () => {
    expect(inSelectionBox(circle, { x: -5, y: -5 }, { x: 5, y: 5 }, true)).toBe(false)
    expect(inSelectionBox(circle, { x: 42, y: 42 }, { x: 48, y: 48 }, true)).toBe(false)
    expect(inSelectionBox(circle, { x: 45, y: -5 }, { x: 55, y: 5 }, true)).toBe(true)
    expect(inSelectionBox(circle, { x: -55, y: -55 }, { x: 55, y: 55 }, false)).toBe(true)
  })
  it('折线和圆弧依据实际区段而不是整圆/包围盒', () => {
    const poly: Entity = {
      ...base,
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      closed: false,
    }
    expect(inSelectionBox(poly, { x: 40, y: 40 }, { x: 60, y: 60 }, true)).toBe(false)
    expect(inSelectionBox(poly, { x: 95, y: 40 }, { x: 105, y: 60 }, true)).toBe(true)
    const arc: Entity = {
      ...circle,
      type: 'arc',
      start: 0,
      end: Math.PI / 2,
      ccw: true,
    }
    expect(inSelectionBox(arc, { x: -55, y: -5 }, { x: -45, y: 5 }, true)).toBe(false)
    expect(inSelectionBox(arc, { x: 45, y: -5 }, { x: 55, y: 5 }, true)).toBe(true)
  })
  it('替换、加选、减选和切换保持唯一 ID', () => {
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'replace')).toEqual(['b', 'c'])
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'add')).toEqual(['a', 'b', 'c'])
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'subtract')).toEqual(['a'])
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'toggle')).toEqual(['a', 'c'])
  })
})
