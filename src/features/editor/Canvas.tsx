import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SnapResult } from '../../cad/geometry'
import type { Entity, Point, View } from '../../cad/model'
import type { SelectionMode } from '../../cad/selection'
import { Maximize, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  add,
  anchors,
  angle,
  bounds,
  distance,
  mirrorPoint,
  rotatePoint,
  screenToWorld,
  snap,
  snapNames,
  sub,
  transform,
  worldToScreen,
} from '../../cad/geometry'
import { combineSelection, inSelectionBox } from '../../cad/selection'
import { buildEntity, hint } from '../../cad/tools'
import { EntityShape } from '../../components/EntityShape'
import { useEditor } from './store'

interface Gesture {
  kind: 'pan' | 'box' | 'drag' | 'grip'
  pointerId: number
  start: Point
  current: Point
  world: Point
  view: View
  ids: string[]
  mode: SelectionMode
  base?: Point
}
export function Canvas() {
  const s = useEditor()
  const container = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 900, h: 700 })
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const space = useRef(false)
  const [isSpace, setIsSpace] = useState(false)
  const [snapHit, setSnapHit] = useState<SnapResult>({ point: s.cursor, snapped: false })
  const snapped = snapHit.snapped
  const doc = s.doc
  const v = doc?.view ?? { x: 0, y: 0, scale: 2 }
  const eligible
    = doc?.entities.filter((e) => {
      const l = doc.layers.find(l => l.id === e.layerId)
      return l?.visible && !l.locked
    }) ?? []
  const references = doc?.entities.filter(e => doc.layers.find(l => l.id === e.layerId)?.visible) ?? []
  const snapTypes = s.snapOverride === 'none'
    ? []
    : s.snapOverride
      ? [s.snapOverride]
      : s.snapTypes
  const objects = s.snapOverride === 'none'
    ? false
    : s.snapOverride ? true : s.objects
  const setG = (g: Gesture | null) => {
    const previous = gestureRef.current
    gestureRef.current = g
    setGesture(g)
    if (!g) {
      if (useEditor.getState().gripEdit)
        useEditor.getState().cancelGrip()
      if (previous && svg.current?.hasPointerCapture(previous.pointerId))
        svg.current.releasePointerCapture(previous.pointerId)
    }
  }
  useEffect(() => {
    const unsubscribe = useEditor.subscribe((state, previous) => {
      const g = gestureRef.current
      if (g?.kind === 'grip' && !state.gripEdit)
        setG(null)
      if (g && g.kind !== 'pan' && (state.tool !== previous.tool || state.phase !== previous.phase
        || state.doc?.entities !== previous.doc?.entities)) {
        setG(null)
      }
      if (state.tool !== previous.tool || state.snapOverride !== previous.snapOverride
        || state.objects !== previous.objects || state.snapTypes !== previous.snapTypes || state.doc?.id !== previous.doc?.id || state.points !== previous.points) {
        setSnapHit({ point: state.cursor, snapped: false })
      }
    })
    return () => {
      unsubscribe()
      useEditor.getState().cancelGrip()
    }
  }, [])
  useEffect(() => {
    if (!container.current)
      return
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    )
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const element = svg.current
    if (!element)
      return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const state = useEditor.getState()
      const view = state.doc?.view
      if (!view || gestureRef.current)
        return
      const rect = element.getBoundingClientRect()
      const p = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const before = screenToWorld(p, view, rect.width, rect.height)
      const scale = Math.max(
        0.01,
        Math.min(100, view.scale * Math.exp(-event.deltaY * 0.0015)),
      )
      const after = screenToWorld(
        p,
        { ...view, scale },
        rect.width,
        rect.height,
      )
      state.setView({
        scale,
        x: view.x + before.x - after.x,
        y: view.y + before.y - after.y,
      })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        document.querySelector('dialog[open]')
        || container.current?.closest('[inert]')
      ) {
        return
      }
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229)
        return
      const target = event.target as HTMLElement
      const state = useEditor.getState()
      if (event.key === 'Escape') {
        event.preventDefault()
        state.cancel()
        setG(null)
        setSnapHit({ point: state.cursor, snapped: false })
        return
      }
      if (target.closest('input,textarea,select,[contenteditable="true"]'))
        return
      if (target.closest('button,a,summary,[role="button"]') && (event.key === 'Enter' || event.code === 'Space'))
        return
      const mod = event.ctrlKey || event.metaKey
      if (!mod && !event.altKey && /^[0-9@.+-]$/.test(event.key) && (state.phase === 'point' || state.phase === 'angle')) {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('cad-input', { detail: event.key }))
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        space.current = true
        setIsSpace(true)
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey
          ? state.redo()
          : state.undo()
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        state.redo()
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        state.select(state.doc?.entities.map(e => e.id) ?? [], 'replace')
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        state.remove()
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        state.finish()
      }
      if (!mod && event.key.toLowerCase() === 'u') {
        event.preventDefault()
        state.undoStep()
        return
      }
      if (!mod) {
        const tool = (
          {
            v: 'select',
            l: 'line',
            p: 'polyline',
            r: 'rectangle',
            c: 'circle',
            a: 'arc',
            t: 'text',
            d: 'dimension',
            m: 'move',
          } as const
        )[event.key.toLowerCase() as 'v']
        if (tool)
          state.setTool(tool)
      }
    }
    const release = () => {
      space.current = false
      setIsSpace(false)
    }
    const blur = () => {
      release()
      setG(null)
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', release)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', release)
      window.removeEventListener('blur', blur)
    }
  }, [])
  const local = (event: ReactPointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: event.clientX - r.left, y: event.clientY - r.top }
  }
  const world = (p: Point) => screenToWorld(p, v, size.w, size.h)
  const snappedWorld = (p: Point) =>
    snap(
      world(p),
      references.filter(e => !s.points.length || !['move', 'copy', 'mirror'].includes(s.tool) || !s.selected.includes(e.id)),
      v.scale,
      s.grid,
      objects,
      s.gridStep,
      s.points.at(-1),
      s.ortho,
      snapTypes,
    )
  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 2 || gestureRef.current)
      return
    const p = local(event)
    const raw = world(p)
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.button === 1 || space.current) {
      event.preventDefault()
      setG({
        kind: 'pan',
        start: p,
        current: p,
        world: raw,
        pointerId: event.pointerId,
        view: v,
        ids: [],
        mode: 'replace',
      })
      return
    }
    const target = event.target as Element
    const grip = target.closest('[data-grip]')
    const id = target.closest('[data-entity]')?.getAttribute('data-entity')
      ?? target.closest('[data-grip-entity]')?.getAttribute('data-grip-entity')
    if (grip && id && s.tool === 'select' && s.beginGrip(id, Number(grip.getAttribute('data-grip')))) {
      event.preventDefault()
      setG({
        kind: 'grip',
        pointerId: event.pointerId,
        start: p,
        current: p,
        world: raw,
        view: v,
        ids: [id],
        mode: 'replace',
      })
      return
    }
    if (s.tool === 'trim') {
      if (id)
        s.trim(id, raw)
      return
    }
    if (s.tool !== 'select' && s.phase !== 'selection') {
      const result = snappedWorld(p)
      setSnapHit(result)
      s.place(result.point)
      return
    }
    const mode = event.altKey
      ? 'subtract'
      : event.shiftKey
        ? 'add'
        : s.phase === 'selection'
          ? 'add'
          : 'replace'
    if (id && eligible.some(e => e.id === id)) {
      const clickMode = event.altKey
        ? 'subtract'
        : event.shiftKey
          ? 'toggle'
          : s.phase === 'selection' || s.selected.includes(id)
            ? 'add'
            : 'replace'
      const ids = combineSelection(s.selected, [id], clickMode)
      s.select([id], clickMode)
      if (ids.includes(id) && s.tool === 'select' && !event.shiftKey && !event.altKey) {
        const base = snap(raw, eligible.filter(e => ids.includes(e.id)), v.scale, false, true, s.gridStep).point
        setG({
          kind: 'drag',
          start: p,
          current: p,
          world: raw,
          pointerId: event.pointerId,
          view: v,
          ids,
          mode,
          base,
        })
      }
    }
    else {
      if (mode === 'replace')
        s.select([], 'replace')
      setG({
        kind: 'box',
        start: p,
        current: p,
        world: raw,
        pointerId: event.pointerId,
        view: v,
        ids: s.selected,
        mode,
      })
    }
  }
  const gripWorld = (p: Point, g: Gesture) => {
    const edit = useEditor.getState().gripEdit!
    const base = anchors(edit.original)[edit.index]
    const point = add(base, sub(screenToWorld(p, g.view, size.w, size.h), g.world))
    return snap(point, references.filter(e => e.id !== edit.original.id), g.view.scale, s.grid, objects, s.gridStep, base, s.ortho, snapTypes)
  }
  const dragWorld = (p: Point, g: Gesture) => {
    const base = g.base ?? g.world
    const point = add(base, sub(screenToWorld(p, g.view, size.w, size.h), g.world))
    return snap(point, references.filter(e => !g.ids.includes(e.id)), g.view.scale, s.grid, objects, s.gridStep, base, s.ortho, snapTypes)
  }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gestureRef.current
    if (g && event.pointerId !== g.pointerId)
      return
    const p = local(event)
    const result = g?.kind === 'grip' && useEditor.getState().gripEdit
      ? gripWorld(p, g)
      : g?.kind === 'drag'
        ? dragWorld(p, g)
        : snappedWorld(p)
    useEditor.setState({
      cursor: result.point,
      ...(s.phase === 'angle' && s.points[0] && distance(s.points[0], result.point) > 1e-7
        ? { rotation: angle(result.point, s.points[0]) * 180 / Math.PI }
        : {}),
    })
    setSnapHit(result)
    if (!g)
      return
    if (g.kind === 'grip') {
      const edit = useEditor.getState().gripEdit
      if (!edit) {
        setG(null)
        return
      }
      s.previewGrip(distance(g.start, p) > 3
        ? result.point
        : anchors(edit.original)[edit.index])
      if (!useEditor.getState().gripEdit)
        return
    }
    if (g.kind === 'pan') {
      s.setView({
        ...g.view,
        x: g.view.x - (p.x - g.start.x) / g.view.scale,
        y: g.view.y + (p.y - g.start.y) / g.view.scale,
      })
    }
    setG({ ...g, current: p })
  }
  const dragDelta = (g: Gesture) => sub(dragWorld(g.current, g).point, g.base ?? g.world)
  const shownEntity = (e: Entity) => {
    if (gesture?.kind === 'drag' && gesture.ids.includes(e.id)
      && distance(gesture.start, gesture.current) > 3) {
      return transform(e, p => add(p, dragDelta(gesture)))
    }
    return s.gripEdit?.preview.id === e.id
      ? s.gripEdit.preview
      : e
  }
  const up = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gestureRef.current
    if (!active || event.pointerId !== active.pointerId)
      return
    const g = {
      ...active,
      current: local(event),
    }
    if (g.kind === 'grip') {
      const p = local(event)
      if (distance(g.start, p) > 3 && useEditor.getState().gripEdit) {
        s.previewGrip(gripWorld(p, g).point)
        s.finishGrip()
      }
      setG(null)
      return
    }
    if (g.kind === 'drag' && distance(g.start, g.current) > 3) {
      const delta = dragDelta(g)
      if (distance(delta, { x: 0, y: 0 }) > 1e-7)
        s.transformSelection(e => transform(e, p => add(p, delta)))
      useEditor.setState({ snapOverride: null })
    }
    if (g.kind === 'box') {
      const a = screenToWorld(g.start, g.view, size.w, size.h)
      const b = screenToWorld(g.current, g.view, size.w, size.h)
      const ids = distance(g.start, g.current) > 3
        ? eligible.filter(e => inSelectionBox(e, a, b, g.current.x < g.start.x)).map(e => e.id)
        : []
      s.select(combineSelection(g.ids, ids, g.mode), 'replace')
    }
    setG(null)
  }
  const fit = () => {
    const boxes
      = doc?.entities
        .filter(e => doc.layers.find(l => l.id === e.layerId)?.visible)
        .map(bounds) ?? []
    if (!boxes.length) {
      s.setView({ x: 0, y: 0, scale: 2 })
      return
    }
    const minX = Math.min(...boxes.map(b => b.minX))
    const maxX = Math.max(...boxes.map(b => b.maxX))
    const minY = Math.min(...boxes.map(b => b.minY))
    const maxY = Math.max(...boxes.map(b => b.maxY))
    s.setView({
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: Math.max(
        0.01,
        Math.min(
          100,
          (size.w - 160) / Math.max(maxX - minX, 30),
          (size.h - 160) / Math.max(maxY - minY, 30),
        ),
      ),
    })
  }
  let previews: Entity[] = []
  if (s.points.length) {
    const draft = buildEntity(s.tool, s.tool === 'line'
      ? [
          s.points.at(-1)!,
          s.cursor,
        ]
      : [...s.points, s.cursor], s.activeLayer, {
      text: s.text,
      size: s.textSize,
      mode: s.dimensionMode,
    })
    if (draft)
      previews = [draft]
    if (['move', 'copy', 'mirror'].includes(s.tool)) {
      previews = eligible
        .filter(e => s.selected.includes(e.id))
        .map(e =>
          s.tool === 'mirror'
            ? transform(
                e,
                p => mirrorPoint(p, s.points[0], s.cursor),
                (angle(s.cursor, s.points[0]) * 360) / Math.PI,
                true,
              )
            : transform(e, p => add(p, sub(s.cursor, s.points[0]))),
        )
    }
  }
  if (s.tool === 'rotate' && s.phase === 'angle' && s.points[0]) {
    previews = eligible
      .filter(e => s.selected.includes(e.id))
      .map(e =>
        transform(
          e,
          p => rotatePoint(p, s.points[0], (s.rotation * Math.PI) / 180),
          s.rotation,
        ),
      )
  }
  const origin = worldToScreen({ x: 0, y: 0 }, v, size.w, size.h)
  const screenStep = s.gridStep * v.scale
  const step
    = screenStep * 10 ** Math.max(0, Math.ceil(Math.log10(12 / screenStep)))
  const rulerStep = step * Math.max(1, Math.ceil(75 / step))
  return (
    <div
      className={`canvas ${s.tool !== 'select'
        ? 'drawing'
        : ''} ${
        isSpace || gesture?.kind === 'pan'
          ? 'panning'
          : ''
      }`}
      ref={container}
      data-background={s.background}
    >
      <svg
        ref={svg}
        data-testid="cad-canvas"
        aria-label="二维绘图画布"
        tabIndex={0}
        width="100%"
        height="100%"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={(event) => {
          if (event.pointerId === gestureRef.current?.pointerId)
            setG(null)
        }}
        onLostPointerCapture={(event) => {
          if (event.pointerId === gestureRef.current?.pointerId)
            setG(null)
        }}
        onContextMenu={e => e.preventDefault()}
      >
        <defs>
          <pattern
            id="cad-grid"
            x={origin.x % step}
            y={origin.y % step}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${step} 0 H 0 V ${step}`}
              fill="none"
              stroke="#263039"
              strokeWidth="0.6"
            />
          </pattern>
        </defs>
        {s.background === 'grid' && (
          <g data-testid="canvas-grid">
            <rect width="100%" height="100%" fill="url(#cad-grid)" />
            <path
              d={`M 0 ${origin.y} H ${size.w} M ${origin.x} 0 V ${size.h}`}
              stroke="#36424a"
              strokeWidth="1"
            />
          </g>
        )}
        <g
          transform={`translate(${size.w / 2} ${size.h / 2}) scale(${v.scale} ${-v.scale}) translate(${-v.x} ${-v.y})`}
        >
          {doc?.entities.map((e) => {
            const layer = doc.layers.find(l => l.id === e.layerId)
            if (!layer?.visible)
              return null
            const selected = s.selected.includes(e.id) && !layer.locked
            const shown = shownEntity(e)
            return (
              <g
                key={e.id}
                data-entity={e.id}
                data-type={e.type}
                opacity={layer.locked ? 0.45 : 1}
              >
                <EntityShape
                  entity={shown}
                  color={selected
                    ? 'var(--canvas-selection)'
                    : canvasColor(e.color ?? layer.color, s.background)}
                  width={Math.max(
                    e.strokeWidth,
                    (selected ? 1.8 : 1.2) / v.scale,
                  )}
                />
                {!layer.locked && (
                  <g className="hit-target" opacity="0">
                    <EntityShape
                      entity={shown}
                      color="#fff"
                      width={12 / v.scale}
                    />
                  </g>
                )}
              </g>
            )
          })}
          {/* 夹点置于实体上方，避免被后绘制的图形命中区域遮挡。 */}
          {eligible.filter(e => s.selected.includes(e.id)).map(e => (
            <g
              key={e.id}
              data-grip-entity={e.id}
              pointerEvents={s.tool === 'select'
                ? 'all'
                : 'none'}
            >
              {anchors(shownEntity(e)).map((p, i) => (
                <g key={i} data-grip={i} style={{ cursor: 'crosshair' }}>
                  <rect
                    x={p.x - 6 / v.scale}
                    y={p.y - 6 / v.scale}
                    width={12 / v.scale}
                    height={12 / v.scale}
                    fill="transparent"
                  />
                  <rect
                    x={p.x - 3.5 / v.scale}
                    y={p.y - 3.5 / v.scale}
                    width={7 / v.scale}
                    height={7 / v.scale}
                    fill={s.gripEdit?.original.id === e.id && s.gripEdit.index === i
                      ? 'var(--canvas-accent)'
                      : '#10191c'}
                    stroke="var(--canvas-accent)"
                    strokeWidth={1 / v.scale}
                    pointerEvents="none"
                  />
                </g>
              ))}
            </g>
          ))}
          <g
            opacity="0.7"
            pointerEvents="none"
            strokeDasharray={`${5 / v.scale} ${3 / v.scale}`}
          >
            {previews.map(e => (
              <EntityShape
                key={e.id}
                entity={e}
                color="var(--canvas-accent)"
                width={1.3 / v.scale}
              />
            ))}
          </g>
          {s.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3 / v.scale}
              fill="var(--canvas-accent)"
              pointerEvents="none"
            />
          ))}
          {(s.tool !== 'select' || gesture?.kind === 'grip') && (
            <g
              pointerEvents="none"
              stroke={snapped ? 'var(--canvas-snap)' : 'var(--canvas-accent)'}
              strokeWidth={1 / v.scale}
            >
              <path
                d={`M ${s.cursor.x - 8 / v.scale} ${s.cursor.y} h ${16 / v.scale} M ${s.cursor.x} ${s.cursor.y - 8 / v.scale} v ${16 / v.scale}`}
              />
              {snapped && (snapHit.type === 'midpoint'
                ? <path d={`M ${s.cursor.x} ${s.cursor.y + 6 / v.scale} l ${-6 / v.scale} ${-10 / v.scale} h ${12 / v.scale} Z`} fill="none" />
                : snapHit.type === 'center' || snapHit.type === 'quadrant'
                  ? <circle cx={s.cursor.x} cy={s.cursor.y} r={5 / v.scale} fill="none" />
                  : <rect x={s.cursor.x - 5 / v.scale} y={s.cursor.y - 5 / v.scale} width={10 / v.scale} height={10 / v.scale} fill="none" />)}
            </g>
          )}
        </g>
        {snapHit.type && snapped && (s.phase === 'point' || s.phase === 'angle' || gesture?.kind === 'grip' || gesture?.kind === 'drag') && (
          <text
            data-testid="snap-indicator"
            data-snap-type={snapHit.type}
            x={worldToScreen(s.cursor, v, size.w, size.h).x + 12}
            y={worldToScreen(s.cursor, v, size.w, size.h).y - 12}
            fill="var(--canvas-snap)"
            fontSize="12"
            pointerEvents="none"
          >
            {snapNames[snapHit.type]}
          </text>
        )}
        {gesture?.kind === 'box' && (
          <rect
            x={Math.min(gesture.start.x, gesture.current.x)}
            y={Math.min(gesture.start.y, gesture.current.y)}
            width={Math.abs(gesture.current.x - gesture.start.x)}
            height={Math.abs(gesture.current.y - gesture.start.y)}
            data-testid="selection-box"
            data-mode={gesture.current.x < gesture.start.x
              ? 'crossing'
              : 'window'}
            fill={gesture.current.x < gesture.start.x
              ? '#a2ddb019'
              : '#7cb8ee19'}
            stroke={gesture.mode === 'subtract'
              ? '#e0a38f'
              : gesture.current.x < gesture.start.x
                ? 'var(--canvas-accent)'
                : '#7cb8ee'}
            strokeDasharray={gesture.current.x < gesture.start.x
              ? '4 3'
              : undefined}
            pointerEvents="none"
          />
        )}
        <g className="rulers" pointerEvents="none">
          <rect width={size.w} height="22" fill="#161d23" />
          <rect width="22" height={size.h} fill="#161d23" />
          {Array.from({ length: Math.ceil(size.w / rulerStep) + 1 }, (_, i) => {
            const x = (origin.x % rulerStep) + i * rulerStep
            return (
              <g key={i}>
                <path d={`M ${x} 16 v 6`} stroke="#52606a" />
                <text x={x + 4} y={12}>
                  {Math.round((x - origin.x) / v.scale)}
                </text>
              </g>
            )
          })}
          {Array.from({ length: Math.ceil(size.h / rulerStep) + 1 }, (_, i) => {
            const y = (origin.y % rulerStep) + i * rulerStep
            return (
              <g key={i}>
                <path d={`M 16 ${y} h 6`} stroke="#52606a" />
                <text transform={`translate(12 ${y - 4}) rotate(-90)`}>
                  {Math.round((origin.y - y) / v.scale)}
                </text>
              </g>
            )
          })}
          <rect width="22" height="22" fill="#202a31" />
        </g>
      </svg>
      {!doc?.entities.length && s.tool === 'select' && (
        <div className="empty-canvas">
          <div className="empty-glyph">＋</div>
          <span className="eyebrow">A SPACE FOR YOUR NEXT IDEA</span>
          <h2>让想法，有迹可循。</h2>
          <p>
            选择左侧工具，绘制你的第一条线。
            <br />
            或点击「示例图纸」，探索这个工作空间。
          </p>
          <span className="empty-keys">
            <kbd>L</kbd>
            {' '}
            直线
            <kbd>R</kbd>
            {' '}
            矩形
            <kbd>C</kbd>
            {' '}
            圆
          </span>
        </div>
      )}
      <div className="canvas-caption">
        <span className="green-dot" />
        模型空间
        {' '}
        <span>TOP / 2D</span>
      </div>
      <div className="zoom-controls">
        <button
          title="缩小"
          aria-label="缩小"
          onClick={() =>
            s.setView({
              ...v,
              scale: Math.max(0.01, v.scale / 1.25),
            })}
        >
          <Minus size={15} />
        </button>
        <span>
          {Math.round(v.scale * 50)}
          %
        </span>
        <button
          title="放大"
          aria-label="放大"
          onClick={() =>
            s.setView({
              ...v,
              scale: Math.min(100, v.scale * 1.25),
            })}
        >
          <Plus size={15} />
        </button>
        <i />
        <button title="适配全部图形" aria-label="适配全部图形" onClick={fit}>
          <Maximize size={15} />
        </button>
      </div>
      <div className="tool-hint">
        <span className="green-dot" />
        {s.message || (s.gripEdit
          ? '拖动夹点编辑图形，松开确认'
          : s.tool === 'select' && s.selected.length
            ? '拖动夹点编辑 · 拖动图形移动 · Shift 多选'
            : s.phase === 'selection'
              ? '点击或框选对象 · Shift 加选 / Alt 减选 · Enter 确认选择'
              : hint(s.tool, s.points.length))}
        {(s.tool !== 'select' || s.gripEdit) && <kbd>Esc 取消</kbd>}
      </div>
    </div>
  )
}

function canvasColor(color: string, background: 'grid' | 'white' | 'black') {
  if (background === 'grid')
    return color
  const r = Number.parseInt(color.slice(1, 3), 16)
  const g = Number.parseInt(color.slice(3, 5), 16)
  const b = Number.parseInt(color.slice(5, 7), 16)
  const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // 仅调整画布显示，避免浅色或深色图形融入纯色背景，不修改图纸颜色。
  if (background === 'white' && brightness > 200)
    return '#36424a'
  if (background === 'black' && brightness < 40)
    return '#d5dfeb'
  return color
}
