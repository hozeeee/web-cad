import type { Drawing, Entity, Point } from './model'
import { uid } from './model'

export function exampleEntities(doc: Drawing): Entity[] {
  const [outline, guides, notes] = doc.layers
  const base = (layerId = outline.id) => ({
    id: uid(),
    layerId,
    strokeWidth: 0.5,
  })
  const line = (a: Point, b: Point, layerId: string): Entity => ({
    ...base(layerId),
    type: 'line',
    a,
    b,
  })
  const entities: Entity[] = [
    {
      ...base(),
      type: 'polyline',
      points: [
        { x: -110, y: -65 },
        { x: 110, y: -65 },
        { x: 110, y: 25 },
        { x: 70, y: 65 },
        { x: -70, y: 65 },
        { x: -110, y: 25 },
      ],
      closed: true,
    },
    {
      ...base(),
      type: 'circle',
      center: { x: 0, y: 0 },
      radius: 36,
    },
    {
      ...base(),
      type: 'circle',
      center: { x: 0, y: 0 },
      radius: 27,
    },
    ...[-80, 80].flatMap(x =>
      [-40, 20].map(y => ({
        ...base(),
        type: 'circle' as const,
        center: { x, y },
        radius: 8,
      })),
    ),
    {
      ...base(),
      type: 'rectangle',
      a: { x: -17, y: 42 },
      b: { x: 17, y: 53 },
    },
    line({ x: -132, y: 0 }, { x: 132, y: 0 }, guides?.id ?? outline.id),
    line({ x: 0, y: -80 }, { x: 0, y: 85 }, guides?.id ?? outline.id),
    {
      ...base(notes?.id),
      type: 'dimension',
      a: { x: -110, y: -65 },
      b: { x: 110, y: -65 },
      at: { x: 0, y: -93 },
      mode: 'horizontal',
    },
    {
      ...base(notes?.id),
      type: 'dimension',
      a: { x: 110, y: -65 },
      b: { x: 110, y: 65 },
      at: { x: 145, y: 0 },
      mode: 'vertical',
    },
    {
      ...base(notes?.id),
      type: 'text',
      at: { x: -110, y: 105 },
      text: 'MOUNTING PLATE / 安装底板',
      size: 7,
      rotation: 0,
    },
    {
      ...base(notes?.id),
      type: 'text',
      at: { x: -110, y: 91 },
      text: '01 — PLAN VIEW     ·     UNIT: mm',
      size: 4,
      rotation: 0,
    },
    {
      ...base(notes?.id),
      type: 'text',
      at: { x: -110, y: -120 },
      text: 'webCAD / STUDY 001',
      size: 4,
      rotation: 0,
    },
  ]
  return entities
}
