import type { Entity, Point, Tool } from './model'
import { arcFromThree, distance, EPS } from './geometry'
import { uid } from './model'

export const toolNames: Record<Tool, string> = {
  select: '选择',
  line: '直线',
  polyline: '折线',
  rectangle: '矩形',
  circle: '圆',
  arc: '三点圆弧',
  text: '文字',
  dimension: '尺寸标注',
  move: '移动',
  copy: '复制',
  rotate: '旋转',
  mirror: '镜像',
  trim: '修剪',
}
export function hint(tool: Tool, count: number) {
  if (tool === 'select')
    return '点击选择 · Shift 切换选择 · Alt 减选 · 左→右窗口，右→左交叉'
  if (tool === 'trim')
    return '点击需要移除的区段 · 可见图形作为修剪边界'
  if (tool === 'polyline')
    return count ? '下一点 / @相对坐标 / 距离 · Close 闭合 · U 退回 · Enter 完成折线' : '指定折线起点，或输入 x,y'
  if (tool === 'arc') {
    return ['点击圆弧起点', '点击圆弧经过点', '点击圆弧终点'][
      Math.min(count, 2)
    ]
  }
  if (tool === 'dimension') {
    return ['点击第一个测量点', '点击第二个测量点', '点击尺寸线位置'][
      Math.min(count, 2)
    ]
  }
  if (tool === 'text')
    return '点击文字插入位置'
  if (tool === 'rotate')
    return count ? '旋转角度：移动鼠标预览并点击，或输入角度后 Enter 确认' : '指定旋转中心'
  if (tool === 'mirror')
    return count ? '点击镜像轴第二点' : '先选择图形，再点击镜像轴起点'
  if (tool === 'move' || tool === 'copy')
    return count ? '指定目标点，或输入 @位移 / 距离' : '指定基准点'
  if (tool === 'circle')
    return count ? '点击圆周点，或输入半径' : '点击圆心'
  if (tool === 'line')
    return count ? '指定下一点 / @相对坐标 / 距离 · Close 闭合 · U 退回 · Enter 结束' : '指定直线起点，或输入 x,y'
  return count ? '点击终点，或输入坐标' : '点击起点'
}
export function buildEntity(
  tool: Tool,
  points: Point[],
  layerId: string,
  options: {
    text: string
    size: number
    mode: 'horizontal' | 'vertical' | 'aligned'
  },
): Entity | null {
  const base = {
    id: uid(),
    layerId,
    strokeWidth: 0.5,
  }
  const [a, b, c] = points
  if (!a)
    return null
  if (tool === 'text') {
    return options.text.trim()
      ? {
          ...base,
          type: 'text',
          at: a,
          text: options.text,
          size: options.size,
          rotation: 0,
        }
      : null
  }
  if (!b || distance(a, b) < EPS)
    return null
  if (tool === 'line')
    return { ...base, type: 'line', a, b }
  if (tool === 'rectangle') {
    return Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS
      ? { ...base, type: 'rectangle', a, b }
      : null
  }
  if (tool === 'circle') {
    return {
      ...base,
      type: 'circle',
      center: a,
      radius: distance(a, b),
    }
  }
  if (tool === 'polyline') {
    return {
      ...base,
      type: 'polyline',
      points,
      closed: false,
    }
  }
  if (tool === 'arc' && c) {
    const arc = arcFromThree(a, b, c)
    return arc
      ? {
          ...base,
          type: 'arc',
          ...arc,
        }
      : null
  }
  if (tool === 'dimension' && c) {
    return {
      ...base,
      type: 'dimension',
      a,
      b,
      at: c,
      mode: options.mode,
    }
  }
  return null
}
