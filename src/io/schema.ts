import { z } from 'zod'
import { cloneDrawing } from '../cad/model'

const finite = z.number().finite().min(-1e9).max(1e9)
const point = z.object({ x: finite, y: finite })
const id = z.string().min(1).max(200)
const color = z.string().regex(/^#[\da-f]{6}$/i)
const base = {
  id,
  layerId: id,
  color: color.optional(),
  strokeWidth: z.number().finite().positive().max(100),
}
export const entitySchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('line'),
    a: point,
    b: point,
  }),
  z.object({
    ...base,
    type: z.literal('rectangle'),
    a: point,
    b: point,
  }),
  z.object({
    ...base,
    type: z.literal('polyline'),
    points: z.array(point).min(2).max(10000),
    closed: z.boolean(),
  }),
  z.object({
    ...base,
    type: z.literal('circle'),
    center: point,
    radius: finite.positive(),
  }),
  z.object({
    ...base,
    type: z.literal('arc'),
    center: point,
    radius: finite.positive(),
    start: finite,
    end: finite,
    ccw: z.boolean(),
  }),
  z.object({
    ...base,
    type: z.literal('text'),
    at: point,
    text: z.string().min(1).max(10000),
    size: finite.positive().max(10000),
    rotation: finite,
  }),
  z.object({
    ...base,
    type: z.literal('dimension'),
    a: point,
    b: point,
    at: point,
    mode: z.enum(['horizontal', 'vertical', 'aligned']),
    direction: finite.optional(),
  }),
])
export const drawingSchema = z
  .object({
    version: z.literal(1),
    id,
    name: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    units: z.literal('mm'),
    layers: z
      .array(
        z.object({
          id,
          name: z.string().min(1).max(100),
          color,
          visible: z.boolean(),
          locked: z.boolean(),
        }),
      )
      .min(1)
      .max(100),
    entities: z.array(entitySchema).max(20000),
    view: z.object({
      x: finite,
      y: finite,
      scale: z.number().finite().min(0.01).max(100),
    }),
  })
  .superRefine((doc, ctx) => {
    const layers = new Set(doc.layers.map(l => l.id))
    const entities = new Set(doc.entities.map(e => e.id))
    if (
      layers.size !== doc.layers.length
      || entities.size !== doc.entities.length
    ) {
      ctx.addIssue({ code: 'custom', message: '图层或实体 ID 重复' })
    }
    if (doc.entities.some(e => !layers.has(e.layerId)))
      ctx.addIssue({ code: 'custom', message: '实体引用了不存在的图层' })
  })
export function parseImport(text: string) {
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024)
    throw new Error('文件超过 20 MB 上限')
  let data: unknown
  try {
    data = JSON.parse(text)
  }
  catch {
    throw new Error('不是有效的 JSON 文件')
  }
  const backup = z.object({
    format: z.literal('forma-cad-backup'),
    version: z.literal(1),
    projects: z.array(drawingSchema).min(1).max(500),
  })
  const isBackup = typeof data === 'object' && data !== null && 'format' in data
  const docs = isBackup
    ? backup.parse(data).projects
    : [
        drawingSchema.parse(data),
      ]
  if (new Set(docs.map(doc => doc.id)).size !== docs.length)
    throw new Error('备份内项目 ID 重复')
  return docs.map((doc) => {
    const copy = cloneDrawing(doc)
    copy.name = `${doc.name.slice(0, 190)} · 导入`
    return copy
  })
}
