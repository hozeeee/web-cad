import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web'
import { describe, expect, it } from 'vitest'
import { exampleEntities } from '../../cad/example'
import { createDrawing } from '../../cad/model'
import { exportDxf, importDxf } from '../dxf'
import { convertBytes } from './codec'

const wasm = async () => new Uint8Array(await readFile(resolve('src/io/dwg/webcad-dwg.wasm')))

describe('真实 DWG 二进制引擎', () => {
  it('预编译 WASM 与桥接源码、锁文件和构建清单一致', async () => {
    const manifest = JSON.parse(await readFile(resolve('engine/dwg/build.json'), 'utf8')) as { hashes: Record<string, string> }
    for (const [path, hash] of Object.entries(manifest.hashes))
      expect(createHash('sha256').update(await readFile(resolve(path))).digest('hex'), path).toBe(hash)
    const source = await readFile(resolve('engine/dwg/source.txt'), 'utf8')
    expect(source).toContain('crates.io/api/v1/crates/acadrust/0.6.8/download')
    expect(source).toContain(await readFile(resolve('engine/dwg/src/lib.rs'), 'utf8'))
  })
  it('将示例二维实体编码成 AC1027 DWG 并重新读回', async () => {
    const doc = createDrawing('引擎验证')
    doc.entities = exampleEntities(doc)
    const output = exportDxf(doc)
    const bytes = await convertBytes(await wasm(), new TextEncoder().encode(output.content), 1)
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('AC1027')
    const decoded = JSON.parse(new TextDecoder().decode(await convertBytes(await wasm(), bytes, 0)))
    const imported = importDxf(decoded.dxf, '往返.dwg')
    expect(imported.skipped).toEqual({})
    // 矩形变折线、标注变为 5 条线和 1 个文字，比较转换后的完整几何。
    const expected = importDxf(output.content, '期望.dwg')
    const geometry = (value: typeof imported.doc) => value.entities.map(({ id: _id, layerId: _layerId, ...entity }) => entity)
    expect(geometry(imported.doc)).toEqual(geometry(expected.doc))
  }, 30000)

  it('独立的 LibreDWG 读取器能够识别输出，且直线坐标正确', async () => {
    const doc = createDrawing('独立验证')
    doc.entities = [
      {
        id: 'line',
        layerId: doc.layers[0].id,
        strokeWidth: 0.25,
        type: 'line',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 60 },
      },
    ]
    const bytes = await convertBytes(await wasm(), new TextEncoder().encode(exportDxf(doc).content), 1)
    const libre = await LibreDwg.create(resolve('node_modules/@mlightcad/libredwg-web/wasm'))
    const data = libre.dwg_read_data(bytes.buffer, Dwg_File_Type.DWG)
    if (data === undefined)
      throw new Error('独立引擎未识别生成的 DWG')
    try {
      const db = libre.convert(data)
      const line = db.entities.find(e => e.type === 'LINE')
      expect(line).toMatchObject({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 100, y: 60 },
      })
    }
    finally {
      libre.dwg_free(data)
    }
  }, 30000)

  it('拒绝截断文件，不返回伪装的空图', async () => {
    await expect(convertBytes(await wasm(), new TextEncoder().encode('AC1027坏文件'), 0)).rejects.toThrow()
  })
})
