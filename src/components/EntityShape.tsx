import type { Entity } from '../cad/model'
import { dimensionGeometry, polar, sweep } from '../cad/geometry'

export function EntityShape({
  entity: e,
  color,
  width = e.strokeWidth,
}: {
  entity: Entity
  color: string
  width?: number
}) {
  const style = {
    fill: 'none',
    stroke: color,
    strokeWidth: width,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (e.type === 'line')
    return <line {...style} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} />
  if (e.type === 'rectangle') {
    return (
      <rect
        {...style}
        x={Math.min(e.a.x, e.b.x)}
        y={Math.min(e.a.y, e.b.y)}
        width={Math.abs(e.a.x - e.b.x)}
        height={Math.abs(e.a.y - e.b.y)}
      />
    )
  }
  if (e.type === 'polyline') {
    return (
      <path
        {...style}
        d={`${e.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} ${e.closed ? 'Z' : ''}`}
      />
    )
  }
  if (e.type === 'circle')
    return <circle {...style} cx={e.center.x} cy={e.center.y} r={e.radius} />
  if (e.type === 'arc') {
    const a = polar(e.center, e.radius, e.start)
    const b = polar(e.center, e.radius, e.end)
    return (
      <path
        {...style}
        d={`M ${a.x} ${a.y} A ${e.radius} ${e.radius} 0 ${
          sweep(e) > Math.PI
            ? 1
            : 0
        } ${e.ccw ? 1 : 0} ${b.x} ${b.y}`}
      />
    )
  }
  if (e.type === 'text') {
    return (
      <text
        transform={`translate(${e.at.x} ${e.at.y}) rotate(${e.rotation}) scale(1 -1)`}
        fill={color}
        fontSize={e.size}
        fontFamily="sans-serif"
      >
        {e.text}
      </text>
    )
  }
  const { p, q, midpoint, value, rotation } = dimensionGeometry(e)
  const tick = 2.5
  return (
    <g {...style}>
      <path
        d={`M ${e.a.x} ${e.a.y} L ${p.x} ${p.y} M ${e.b.x} ${e.b.y} L ${q.x} ${q.y} M ${p.x} ${p.y} L ${q.x} ${q.y}`}
      />
      <path
        d={`M ${p.x - tick} ${p.y - tick} L ${p.x + tick} ${p.y + tick} M ${q.x - tick} ${q.y - tick} L ${q.x + tick} ${q.y + tick}`}
      />
      <text
        transform={`translate(${midpoint.x} ${midpoint.y}) rotate(${rotation}) scale(1 -1)`}
        y={-3}
        textAnchor="middle"
        stroke="none"
        fill={color}
        fontSize={6}
        fontFamily="sans-serif"
      >
        {Number(value.toFixed(2))}
      </text>
    </g>
  )
}
