import type { Drawing } from '../cad/model'
import { renderToStaticMarkup } from 'react-dom/server'
import { bounds } from '../cad/geometry'
import { EntityShape } from '../components/EntityShape'

export function download(
  content: string | ArrayBuffer,
  filename: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/[\\/:*?"<>|]/g, '_')
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportProject(doc: Drawing) {
  download(JSON.stringify(doc, null, 2), `${doc.name}.json`)
}
export function exportBackup(docs: Drawing[]) {
  download(
    JSON.stringify(
      { format: 'forma-cad-backup', version: 1, projects: docs },
      null,
      2,
    ),
    'webCAD-backup.json',
  )
}
export function svgContent(doc: Drawing) {
  const visible = doc.entities.filter(
    e => doc.layers.find(l => l.id === e.layerId)?.visible,
  )
  const boxes = visible.map(bounds)
  const minX = Math.min(0, ...boxes.map(b => b.minX)) - 15
  const maxX = Math.max(100, ...boxes.map(b => b.maxX)) + 15
  const minY = Math.min(0, ...boxes.map(b => b.minY)) - 15
  const maxY = Math.max(100, ...boxes.map(b => b.maxY)) + 15
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`}
      width={`${maxX - minX}mm`}
      height={`${maxY - minY}mm`}
    >
      <title>{doc.name}</title>
      <g transform="scale(1 -1)">
        {visible.map(e => (
          <EntityShape
            key={e.id}
            entity={e}
            color={e.color ?? doc.layers.find(l => l.id === e.layerId)!.color}
          />
        ))}
      </g>
    </svg>,
  )
}
export function exportSVG(doc: Drawing) {
  download(svgContent(doc), `${doc.name}.svg`, 'image/svg+xml')
}
