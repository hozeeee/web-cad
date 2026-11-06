import type { LucideIcon } from 'lucide-react'
import type { Tool } from '../../cad/model'
import {
  Circle,
  Copy,
  FlipHorizontal2,
  GitBranch,
  MousePointer2,
  Move,
  Radius,
  RotateCw,
  Ruler,
  Scissors,
  Slash,
  Square,
  Type,
} from 'lucide-react'
import { toolNames } from '../../cad/tools'
import { useEditor } from './store'

const groups: {
  label: string
  tools: { tool: Tool, icon: LucideIcon, key?: string }[]
}[] = [
  {
    label: '选择',
    tools: [
      { tool: 'select', icon: MousePointer2, key: 'V' },
    ],
  },
  {
    label: '绘制',
    tools: [
      { tool: 'line', icon: Slash, key: 'L' },
      { tool: 'polyline', icon: GitBranch, key: 'P' },
      { tool: 'rectangle', icon: Square, key: 'R' },
      { tool: 'circle', icon: Circle, key: 'C' },
      { tool: 'arc', icon: Radius, key: 'A' },
    ],
  },
  {
    label: '注释',
    tools: [
      { tool: 'text', icon: Type, key: 'T' },
      { tool: 'dimension', icon: Ruler, key: 'D' },
    ],
  },
  {
    label: '修改',
    tools: [
      { tool: 'move', icon: Move, key: 'M' },
      { tool: 'copy', icon: Copy },
      { tool: 'rotate', icon: RotateCw },
      { tool: 'mirror', icon: FlipHorizontal2 },
      { tool: 'trim', icon: Scissors },
    ],
  },
]
export function ToolRail() {
  const tool = useEditor(s => s.tool)
  const setTool = useEditor(s => s.setTool)
  return (
    <aside className="tool-rail" aria-label="绘图工具">
      {groups.map(group => (
        <div className="tool-group" key={group.label}>
          <span>{group.label}</span>
          {group.tools.map(({ tool: name, icon: Icon, key }) => (
            <button
              key={name}
              className={tool === name
                ? 'active'
                : ''}
              title={`${toolNames[name]}${key
                ? ` (${key})`
                : ''}`}
              aria-label={toolNames[name]}
              aria-pressed={tool === name}
              onClick={() => setTool(name)}
            >
              <Icon size={19} strokeWidth={1.5} />
              <small>
                {toolNames[name] === '三点圆弧'
                  ? '圆弧'
                  : toolNames[name] === '尺寸标注'
                    ? '标注'
                    : toolNames[name]}
              </small>
            </button>
          ))}
        </div>
      ))}
      <div className="rail-footer">2D</div>
    </aside>
  )
}
