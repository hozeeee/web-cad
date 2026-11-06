import { describe, expect, it } from 'vitest'
import { worldToScreen } from '../cad/geometry'
import { createDrawing } from '../cad/model'
import { exportDxf, importDxf } from './dxf'

function source(entities: string, units = 4) {
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${units}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`
}
const line = '0\nLINE\n8\n轮廓\n10\n0\n20\n0\n11\n100\n21\n60\n'

describe('基础二维 CAD 格式映射', () => {
  it('保留线、圆、圆弧、闭合折线、中文文字与图层', () => {
    const doc = createDrawing('测试')
    const base = { layerId: doc.layers[0].id, strokeWidth: 0.25 }
    doc.layers[1].visible = false
    doc.layers[2].locked = true
    doc.entities = [
      {
        ...base,
        id: 'line',
        type: 'line',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 60 },
      },
      {
        ...base,
        id: 'circle',
        type: 'circle',
        center: { x: 3, y: 5 },
        radius: 8,
      },
      {
        ...base,
        id: 'arc',
        type: 'arc',
        center: { x: 0, y: 0 },
        radius: 10,
        start: 0.5,
        end: 2,
        ccw: false,
      },
      {
        ...base,
        id: 'rect',
        type: 'rectangle',
        a: { x: 1, y: 2 },
        b: { x: 3, y: 4 },
      },
      {
        ...base,
        id: 'text',
        type: 'text',
        at: { x: 5, y: 6 },
        text: '安装孔 Φ10',
        size: 6,
        rotation: 30,
      },
    ]
    const result = importDxf(exportDxf(doc).content, '测试.dwg')
    expect(result.skipped).toEqual({})
    expect(result.doc.entities.map(e => e.type)).toEqual([
      'line',
      'circle',
      'arc',
      'polyline',
      'text',
    ])
    expect(result.doc.entities[0]).toMatchObject({
      a: { x: 0, y: 0 },
      b: { x: 100, y: 60 },
      strokeWidth: 0.25,
    })
    expect(result.doc.entities[2]).toMatchObject({ start: 2, end: 0.5, ccw: true })
    expect(result.doc.entities[3]).toMatchObject({
      closed: true,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 4 },
        { x: 1, y: 4 },
      ],
    })
    expect(result.doc.entities[4]).toMatchObject({ text: '安装孔 Φ10', rotation: 30 })
    expect(result.doc.layers.map(l => ({ visible: l.visible, locked: l.locked, color: l.color }))).toEqual(doc.layers.map(l => ({ visible: l.visible, locked: l.locked, color: l.color })))
  })
  it('导入后的视图以世界坐标中心居中，不改变几何位置', () => {
    const result = importDxf(source(line), '居中.dwg')
    expect(result.doc.view).toMatchObject({ x: 50, y: 30 })
    expect(worldToScreen({ x: 50, y: 30 }, result.doc.view, 900, 700)).toEqual({ x: 450, y: 350 })
  })
  it('单位换算为毫米，未知单位显式提示', () => {
    const inch = importDxf(source(line, 1), 'inches.dwg')
    expect(inch.doc.entities[0]).toMatchObject({
      b: { x: 2540, y: 1524 },
    })
    expect(inch.warnings.join()).toContain('倍率 25.4')
    expect(importDxf(source(line, 0), 'unknown.dwg').warnings.join()).toContain('按毫米解释')
  })
  it('明确统计块、标注、弧段折线、三维与图纸空间的跳过项', () => {
    const data = source(`${line}0\nINSERT\n2\nblock\n0\nDIMENSION\n0\nLWPOLYLINE\n10\n0\n20\n0\n42\n1\n10\n2\n20\n0\n0\nLINE\n10\n0\n20\n0\n30\n1\n11\n2\n21\n0\n0\nCIRCLE\n67\n1\n10\n0\n20\n0\n40\n3\n`)
    const result = importDxf(data, '部分.dwg')
    expect(result.total).toBe(6)
    expect(result.doc.entities).toHaveLength(1)
    expect(result.skipped).toEqual({
      'INSERT': 1,
      'DIMENSION': 1,
      'LWPOLYLINE（弧段或宽度）': 1,
      'LINE（非 XY 平面或有厚度）': 1,
      'CIRCLE（图纸空间）': 1,
    })
  })
  it('不将空、错误或全部不支持的内容导入为空图', () => {
    expect(() => importDxf(source(''), '空.dwg')).toThrow('未找到')
    expect(() => importDxf(source('0\nINSERT\n'), '块.dwg')).toThrow('未找到')
    expect(() => importDxf(source(line.replace('100', 'NaN')), '坏.dwg')).toThrow('未找到')
    expect(() => importDxf('0\nSECTION\n2', '截断.dwg')).toThrow('不完整')
  })
  it('标注降级与文字换行、线宽量化均给出导出风险提示', () => {
    const doc = createDrawing('降级')
    const base = { layerId: doc.layers[0].id, strokeWidth: 10 }
    doc.entities = [
      {
        ...base,
        id: 'dim',
        type: 'dimension',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        at: { x: 0, y: 5 },
        mode: 'horizontal',
      },
      {
        ...base,
        id: 'txt',
        type: 'text',
        at: { x: 0, y: 0 },
        text: '第一行\n第二行',
        size: 5,
        rotation: 0,
      },
    ]
    const output = exportDxf(doc)
    expect(output.warnings.join()).toContain('标注拆成')
    expect(output.warnings.join()).toContain('量化')
    expect(output.warnings.join()).toContain('多行文字')
    expect(importDxf(output.content, '导出.dwg').doc.entities).toHaveLength(7)
  })
})
