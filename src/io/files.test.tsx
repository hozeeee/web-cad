import { describe, expect, it } from 'vitest'
import { exampleEntities } from '../cad/example'
import { createDrawing } from '../cad/model'
import { svgContent } from './files'
import { drawingSchema, parseImport } from './schema'

function fixture() {
  const d = createDrawing('导入测试')
  d.entities = exampleEntities(d)
  return d
}
describe('文件交换', () => {
  it('jSON 往返保留几何并生成新 ID', () => {
    const original = fixture()
    const [imported] = parseImport(JSON.stringify(original))
    expect(imported.id).not.toBe(original.id)
    expect(imported.entities.map(({ id, layerId, ...e }) => e)).toEqual(
      original.entities.map(({ id, layerId, ...e }) => e),
    )
    expect(imported.layers[0].id).not.toBe(original.layers[0].id)
    expect(drawingSchema.safeParse(imported).success).toBe(true)
  })
  it('批量备份导入两份完整文档', () => {
    const docs = parseImport(
      JSON.stringify({
        format: 'forma-cad-backup',
        version: 1,
        projects: [
          fixture(),
          fixture(),
        ],
      }),
    )
    expect(docs).toHaveLength(2)
    expect(docs[0].id).not.toBe(docs[1].id)
  })
  it('拒绝未知版本、无效图层引用、重复 ID 和坏 JSON', () => {
    const d = fixture()
    expect(() => parseImport(JSON.stringify({ ...d, version: 2 }))).toThrow()
    expect(() => parseImport(JSON.stringify({ ...d, layers: [] }))).toThrow()
    expect(() =>
      parseImport(
        JSON.stringify({
          ...d,
          entities: [...d.entities, d.entities[0]],
        }),
      ),
    ).toThrow()
    expect(() => parseImport('{')).toThrow('JSON')
    const bad = {
      ...d,
      entities: [
        { ...d.entities[0], layerId: 'missing' },
      ],
    }
    expect(drawingSchema.safeParse(bad).success).toBe(false)
  })
  it('拒绝重复项目 ID、非有限数值和超大文件', () => {
    const d = fixture()
    expect(() =>
      parseImport(
        JSON.stringify({
          format: 'forma-cad-backup',
          version: 1,
          projects: [d, d],
        }),
      ),
    ).toThrow('项目 ID 重复')
    expect(
      drawingSchema.safeParse({
        ...d,
        view: { ...d.view, x: Infinity },
      })
        .success,
    ).toBe(false)
    expect(() => parseImport(' '.repeat(20 * 1024 * 1024 + 1))).toThrow('20 MB')
  })
  it('长项目名称复制和导入后仍满足格式限制', () => {
    const d = createDrawing('名'.repeat(200))
    expect(
      drawingSchema.safeParse(parseImport(JSON.stringify(d))[0]).success,
    ).toBe(true)
  })
  it('导出 SVG 正确转义文字与项目名，并排除隐藏图层', () => {
    const d = createDrawing('<script>&图纸')
    d.entities = [
      {
        id: 'text',
        layerId: d.layers[0].id,
        strokeWidth: 1,
        type: 'text',
        text: '<img onerror="x">',
        at: { x: 0, y: 0 },
        size: 8,
        rotation: 0,
      },
    ]
    const svg = svgContent(d)
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('&lt;img')
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('<img')
    d.layers[0].visible = false
    expect(svgContent(d)).not.toContain('&lt;img')
  })
})
