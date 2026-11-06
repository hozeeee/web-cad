import type { Entity } from './model'
import { describe, expect, it } from 'vitest'
import {
  add,
  anchors,
  arcFromThree,
  bounds,
  dimensionGeometry,
  intersections,
  mirrorPoint,
  moveGrip,
  onArc,
  polar,
  rotatePoint,
  screenToWorld,
  snap,
  sweep,
  transform,
  worldToScreen,
} from './geometry'
import { trimEntity } from './trim'

const base = { id: 'a', layerId: 'l', strokeWidth: 0.5 }
const line: Entity = {
  ...base,
  type: 'line',
  a: { x: -20, y: 0 },
  b: { x: 20, y: 0 },
}
const circle: Entity = {
  ...base,
  id: 'c',
  type: 'circle',
  center: { x: 0, y: 0 },
  radius: 10,
}
describe('二维几何', () => {
  it('屏幕与世界坐标互为逆变换', () => {
    const p = { x: 25, y: -18 }
    const v = { x: 3, y: 5, scale: 2.5 }
    expect(screenToWorld(worldToScreen(p, v, 800, 600), v, 800, 600)).toEqual(p)
  })
  it('三点圆弧正确经过中间点，且方向正确', () => {
    const arc = arcFromThree(
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
    )!
    const e: Entity = {
      ...base,
      type: 'arc',
      ...arc,
    }
    expect(arc.radius).toBeCloseTo(10)
    expect(arc.ccw).toBe(true)
    expect(onArc(e, Math.PI / 2)).toBe(true)
    expect(onArc(e, -Math.PI / 2)).toBe(false)
    expect(sweep(e)).toBeCloseTo(Math.PI)
    expect(
      arcFromThree({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }),
    ).toBeNull()
  })
  it('圆弧边界不包含不在弧上的圆心', () => {
    const e: Entity = {
      ...base,
      type: 'arc',
      center: { x: 0, y: 0 },
      radius: 10,
      start: Math.PI / 6,
      end: Math.PI / 3,
      ccw: true,
    }
    expect(bounds(e).minX).toBeCloseTo(5)
    expect(bounds(e).minY).toBeCloseTo(5)
  })
  it('对象吸附容差以屏幕像素衡量', () => {
    expect(snap({ x: 20.4, y: 0 }, [line], 2, false, true, 10).snapped).toBe(
      true,
    )
    expect(snap({ x: 20.4, y: 0 }, [line], 100, false, true, 10).snapped).toBe(
      false,
    )
    expect(snap({ x: 7, y: 13 }, [], 2, true, false, 10).point).toEqual({
      x: 10,
      y: 10,
    })
    expect(
      snap({ x: 18, y: 5 }, [], 2, false, false, 10, { x: 0, y: 0 }, true)
        .point,
    ).toEqual({ x: 18, y: 0 })
  })
  it('矩形、闭合折线与圆弧支持中点吸附', () => {
    const rect: Entity = {
      ...base,
      type: 'rectangle',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 50 },
    }
    expect(snap({ x: 50.2, y: 0 }, [rect], 2, false, true, 10).point).toEqual({
      x: 50,
      y: 0,
    })
    const poly: Entity = {
      ...base,
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      closed: true,
    }
    expect(snap({ x: 50.2, y: 50 }, [poly], 2, false, true, 10).point).toEqual({
      x: 50,
      y: 50,
    })
    const arc: Entity = {
      ...circle,
      type: 'arc',
      start: 0,
      end: Math.PI,
      ccw: true,
    }
    expect(
      snap({ x: 0, y: 10.2 }, [arc], 2, false, true, 10).point.y,
    ).toBeCloseTo(10)
  })
  it('正交约束不会被网格或非共线对象吸附破坏', () => {
    const basePoint = { x: 3, y: 4 }
    expect(
      snap({ x: 18, y: 5 }, [], 2, true, false, 10, basePoint, true).point,
    ).toEqual({ x: 20, y: 4 })
    const offAxis: Entity = {
      ...line,
      a: { x: 18, y: 6 },
      b: { x: 100, y: 100 },
    }
    expect(
      snap({ x: 18, y: 5 }, [offAxis], 2, false, true, 10, basePoint, true)
        .point,
    ).toEqual({ x: 18, y: 4 })
  })
  it('直线、圆与圆弧交点', () => {
    expect(intersections(line, circle)).toEqual([
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ])
    const c2: Entity = {
      ...circle,
      center: { x: 10, y: 0 },
    }
    expect(intersections(circle, c2)).toHaveLength(2)
    const e: Entity = {
      ...circle,
      type: 'arc',
      start: 0,
      end: Math.PI / 2,
      ccw: true,
    }
    expect(intersections(line, e)).toHaveLength(1)
  })
  it('移动矩形保持矩形，旋转转换闭合折线', () => {
    const rect: Entity = {
      ...base,
      type: 'rectangle',
      a: { x: 0, y: 0 },
      b: { x: 20, y: 10 },
    }
    expect(transform(rect, p => add(p, { x: 5, y: 3 })).type).toBe(
      'rectangle',
    )
    const result = transform(
      rect,
      p => rotatePoint(p, { x: 0, y: 0 }, Math.PI / 2),
      90,
    )
    expect(result.type).toBe('polyline')
    if (result.type === 'polyline') {
      expect(result.closed).toBe(true)
      expect(result.points[1].y).toBeCloseTo(20)
    }
  })
  it('镜像圆弧反转方向并保持端点', () => {
    const e: Entity = {
      ...circle,
      type: 'arc',
      start: 0,
      end: Math.PI / 2,
      ccw: true,
    }
    const result = transform(
      e,
      p => mirrorPoint(p, { x: 0, y: 0 }, { x: 1, y: 0 }),
      0,
      true,
    )
    expect(result.type).toBe('arc')
    if (result.type === 'arc') {
      expect(result.ccw).toBe(false)
      expect(polar(result.center, result.radius, result.end).y).toBeCloseTo(-10)
    }
  })
  it('水平、垂直和对齐尺寸数值', () => {
    const e: Entity = {
      ...base,
      type: 'dimension',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 4 },
      at: { x: 10, y: 10 },
      mode: 'aligned',
    }
    expect(dimensionGeometry(e).value).toBe(5)
    expect(dimensionGeometry({ ...e, mode: 'horizontal' }).value).toBe(3)
    expect(dimensionGeometry({ ...e, mode: 'vertical' }).value).toBe(4)
  })
  it('尺寸旋转和镜像保持原测量数值及端点', () => {
    const e: Entity = {
      ...base,
      type: 'dimension',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 4 },
      at: { x: 2, y: 10 },
      mode: 'horizontal',
    }
    const rotated = transform(
      e,
      p => rotatePoint(p, { x: 0, y: 0 }, Math.PI / 2),
      90,
    )
    const mirrored = transform(
      e,
      p => mirrorPoint(p, { x: 0, y: 0 }, { x: 1, y: 1 }),
      0,
      true,
    )
    for (const result of [rotated, mirrored]) {
      expect(result.type).toBe('dimension')
      if (result.type === 'dimension')
        expect(dimensionGeometry(result).value).toBeCloseTo(3)
    }
  })
})
describe('类型化对象捕捉', () => {
  it('返回捕捉类型和对象 ID，禁用某类型后不会误捕捉', () => {
    expect(snap({ x: 20.02, y: 0 }, [line], 100, false, true, 10, undefined, false, ['endpoint'])).toMatchObject({
      point: line.b,
      type: 'endpoint',
      entityIds: ['a'],
    })
    expect(snap({ x: 20.2, y: 0 }, [line], 100, false, true, 10, undefined, false, ['midpoint']).snapped).toBe(false)
    expect(snap({ x: 0.2, y: 0 }, [line], 2, false, true, 10, undefined, false, ['midpoint']).type).toBe('midpoint')
    expect(snap({ x: 0, y: 10.1 }, [circle], 2, false, true, 10, undefined, false, ['quadrant']).type).toBe('quadrant')
  })
  it('交点可独立启用且非共线交点不能破坏正交约束', () => {
    const vertical: Entity = {
      ...line,
      id: 'b',
      a: { x: 8, y: -20 },
      b: { x: 8, y: 20 },
    }
    const hit = snap({ x: 8.2, y: 0.1 }, [line, vertical], 2, false, true, 10, undefined, false, ['intersection'])
    expect(hit).toMatchObject({
      point: { x: 8, y: 0 },
      type: 'intersection',
      entityIds: ['a', 'b'],
    })
    expect(snap({ x: 8.2, y: 0.1 }, [line, vertical], 100, false, true, 10, { x: 0, y: 1 }, true, ['intersection']).snapped).toBe(false)
  })
  it('垂足、最近点支持线段范围并要求垂足存在', () => {
    const hit = snap({ x: 3.1, y: 0.1 }, [line], 2, false, true, 10, { x: 3, y: 8 }, false, ['perpendicular'])
    expect(hit).toMatchObject({
      point: { x: 3, y: 0 },
      type: 'perpendicular',
    })
    expect(snap({ x: 21, y: 0 }, [line], 2, false, true, 10, { x: 30, y: 8 }, false, ['perpendicular']).snapped).toBe(false)
    expect(snap({ x: 19, y: 1 }, [line], 2, false, true, 10, undefined, false, ['nearest'])).toMatchObject({
      point: { x: 19, y: 0 },
      type: 'nearest',
    })
  })
  it('切点与基点连线垂直半径，圆弧仅捕捉扫角内的点', () => {
    const basePoint = { x: 20, y: 0 }
    const target = {
      x: 5,
      y: Math.sqrt(75),
    }
    const hit = snap(target, [circle], 2, false, true, 10, basePoint, false, ['tangent'])
    expect(hit.type).toBe('tangent')
    expect(hit.point.x).toBeCloseTo(5)
    expect(hit.point.y).toBeCloseTo(target.y)
    expect((hit.point.x - basePoint.x) * hit.point.x + hit.point.y ** 2).toBeCloseTo(0)
    expect(snap(target, [circle], 2, false, true, 10, { x: 0, y: 0 }, false, ['tangent']).snapped).toBe(false)
    const arc: Entity = {
      ...circle,
      type: 'arc',
      start: -Math.PI / 2,
      end: 0,
      ccw: true,
    }
    expect(snap(target, [arc], 100, false, true, 10, basePoint, false, ['tangent']).snapped).toBe(false)
    expect(snap({ x: 10.1, y: 0 }, [arc], 2, false, true, 10, undefined, false, ['quadrant']).type).toBe('quadrant')
  })
})
describe('夹点几何编辑', () => {
  it('直线端点只拉伸一端，中点整体移动且不修改原实体', () => {
    expect(moveGrip(line, 0, { x: -40, y: 10 })).toMatchObject({
      a: { x: -40, y: 10 },
      b: { x: 20, y: 0 },
    })
    expect(moveGrip(line, 1, { x: 50, y: 20 })).toMatchObject({
      a: { x: -20, y: 0 },
      b: { x: 50, y: 20 },
    })
    expect(moveGrip(line, 2, { x: 10, y: 10 })).toMatchObject({
      a: { x: -10, y: 10 },
      b: { x: 30, y: 10 },
    })
    expect(line.a).toEqual({ x: -20, y: 0 })
    expect(moveGrip(line, 0, line.b)).toBeNull()
    expect(moveGrip(line, 9, { x: 0, y: 0 })).toBeNull()
    expect(moveGrip(line, 0, line.a)).toBe(line)
  })
  it.each([false, true])('折线顶点和边中点索引正确，闭合=%s', (closed) => {
    const poly: Entity = {
      ...base,
      type: 'polyline',
      closed,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
    }
    expect(moveGrip(poly, closed ? 2 : 1, { x: 50, y: 10 })).toMatchObject({
      closed,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 10 },
        { x: 40, y: 40 },
      ],
    })
    expect(moveGrip(poly, closed ? 3 : 2, { x: 20, y: 10 })).toMatchObject({
      points: [
        { x: 0, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 40 },
      ],
    })
    if (closed) {
      expect(moveGrip(poly, 1, { x: 30, y: 20 })).toMatchObject({
        points: [
          { x: 10, y: 0 },
          { x: 40, y: 0 },
          { x: 50, y: 40 },
        ],
      })
    }
  })
  it('矩形角点固定对角，边中点只改变对应边，跨越后仍为矩形', () => {
    const rect: Entity = {
      ...base,
      type: 'rectangle',
      a: { x: 0, y: 0 },
      b: { x: 40, y: 20 },
    }
    expect(moveGrip(rect, 2, { x: 60, y: -10 })).toMatchObject({
      type: 'rectangle',
      a: { x: 0, y: -10 },
      b: { x: 60, y: 20 },
    })
    expect(moveGrip(rect, 3, { x: -20, y: 15 })).toMatchObject({
      a: { x: 0, y: 0 },
      b: { x: -20, y: 20 },
    })
    expect(moveGrip(rect, 1, { x: 100, y: -10 })).toMatchObject({
      a: { x: 0, y: -10 },
      b: { x: 40, y: 20 },
    })
    expect(moveGrip(rect, 4, { x: 0, y: 20 })).toBeNull()
    expect(moveGrip(rect, 1, { x: 100, y: 0 })).toBe(rect)
  })
  it('圆心移动保留半径，圆周夹点改变半径并拒绝零半径', () => {
    expect(moveGrip(circle, 0, { x: 15, y: 5 })).toMatchObject({
      center: { x: 15, y: 5 },
      radius: 10,
    })
    expect(moveGrip(circle, 1, { x: 20, y: 0 })).toMatchObject({
      center: { x: 0, y: 0 },
      radius: 20,
    })
    expect(moveGrip(circle, 1, circle.center)).toBeNull()
  })
  it.each([false, true])('圆弧端点和弧中点重建三点圆弧，顺逆方向=%s', (ccw) => {
    const arc: Entity = {
      ...circle,
      type: 'arc',
      start: 0,
      end: Math.PI,
      ccw,
    }
    for (const index of [1, 2, 3]) {
      const grips = anchors(arc)
      const target = add(grips[index], {
        x: 3,
        y: ccw
          ? 4
          : -4,
      })
      const edited = moveGrip(arc, index, target)!
      expect(edited.type).toBe('arc')
      if (edited.type !== 'arc')
        continue
      const start = polar(edited.center, edited.radius, edited.start)
      const end = polar(edited.center, edited.radius, edited.end)
      expect(start.x).toBeCloseTo(index === 1
        ? target.x
        : grips[1].x)
      expect(start.y).toBeCloseTo(index === 1
        ? target.y
        : grips[1].y)
      expect(end.x).toBeCloseTo(index === 2
        ? target.x
        : grips[2].x)
      expect(end.y).toBeCloseTo(index === 2
        ? target.y
        : grips[2].y)
      expect(edited.ccw).toBe(ccw)
      expect(onArc(edited, Math.atan2(target.y - edited.center.y, target.x - edited.center.x))).toBe(true)
    }
    expect(moveGrip(arc, 3, { x: 0, y: 0 })).toBeNull()
    expect(moveGrip(arc, 0, { x: 20, y: 20 })).toMatchObject({
      center: { x: 20, y: 20 },
      radius: 10,
    })
  })
  it('文字和标注位置夹点可移动，标注端点只修改测量点', () => {
    const text: Entity = {
      ...base,
      type: 'text',
      at: { x: 0, y: 0 },
      text: '测试',
      size: 10,
      rotation: 30,
    }
    expect(moveGrip(text, 0, { x: 10, y: 20 })).toMatchObject({
      at: { x: 10, y: 20 },
      rotation: 30,
    })
    const dim: Entity = {
      ...base,
      type: 'dimension',
      a: { x: 0, y: 0 },
      b: { x: 40, y: 0 },
      at: { x: 20, y: 20 },
      mode: 'horizontal',
    }
    expect(moveGrip(dim, 0, { x: -10, y: 5 })).toMatchObject({
      a: { x: -10, y: 5 },
      b: dim.b,
      at: dim.at,
    })
    expect(moveGrip(dim, 2, { x: 20, y: 40 })).toMatchObject({
      a: dim.a,
      b: dim.b,
      at: { x: 20, y: 40 },
    })
  })
})
describe('修剪', () => {
  it('删除直线两个交点之间的区段', () => {
    const trimmed = trimEntity(line, [circle], { x: 0, y: 0 })!
    expect(trimmed).toHaveLength(2)
    expect(trimmed[0]).toMatchObject({
      a: { x: -20, y: 0 },
      b: { x: -10, y: 0 },
    })
    expect(trimmed[1]).toMatchObject({
      a: { x: 10, y: 0 },
      b: { x: 20, y: 0 },
    })
  })
  it('跨越零角度的圆区段修剪保留另一半圆', () => {
    const cutter: Entity = {
      ...line,
      a: { x: 0, y: -20 },
      b: { x: 0, y: 20 },
    }
    const trimmed = trimEntity(circle, [cutter], { x: 10, y: 0 })!
    expect(trimmed).toHaveLength(1)
    expect(trimmed[0].type).toBe('arc')
    if (trimmed[0].type === 'arc') {
      expect(onArc(trimmed[0], Math.PI)).toBe(true)
      expect(onArc(trimmed[0], 0)).toBe(false)
    }
  })
  it('圆弧支持顺时针修剪', () => {
    const e: Entity = {
      ...circle,
      type: 'arc',
      start: Math.PI,
      end: 0,
      ccw: false,
    }
    const cutter: Entity = {
      ...line,
      a: { x: 0, y: -20 },
      b: { x: 0, y: 20 },
    }
    const trimmed = trimEntity(e, [cutter], { x: -8, y: 6 })!
    expect(trimmed).toHaveLength(1)
    if (trimmed[0].type === 'arc') {
      expect(trimmed[0].ccw).toBe(false)
      expect(sweep(trimmed[0])).toBeCloseTo(Math.PI / 2)
    }
  })
  it('无交点和相切不修改圆', () => {
    expect(trimEntity(line, [], { x: 0, y: 0 })).toBeNull()
    const tangent: Entity = {
      ...line,
      a: { x: -20, y: 10 },
      b: { x: 20, y: 10 },
    }
    expect(trimEntity(circle, [tangent], { x: 0, y: -10 })).toBeNull()
  })
})
