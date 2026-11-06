import type { CadExchange } from '../components/CadExchangeDialog'
import {
  ChevronDown,
  CircleHelp,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  HardDrive,
  Layers2,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Redo2,
  Sparkles,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import brandIcon from '../assets/icons/brand.svg'
import { exampleEntities } from '../cad/example'
import { CadExchangeDialog } from '../components/CadExchangeDialog'
import { HelpDialog } from '../components/HelpDialog'
import { Canvas } from '../features/editor/Canvas'
import { CommandBar } from '../features/editor/CommandBar'
import { Layers } from '../features/editor/Layers'
import { Properties } from '../features/editor/Properties'
import { StatusBar } from '../features/editor/StatusBar'
import { useEditor } from '../features/editor/store'
import { ToolRail } from '../features/editor/ToolRail'
import { ProjectDialog } from '../features/projects/ProjectDialog'
import { useProjects } from '../features/projects/useProjects'
import { exportDwg, importDwg } from '../io/dwg'
import { exportDxf } from '../io/dxf'
import { download, exportBackup, exportProject, exportSVG } from '../io/files'
import { parseImport } from '../io/schema'

export function App() {
  const s = useEditor()
  const p = useProjects()
  const file = useRef<HTMLInputElement>(null)
  const [modal, setModal] = useState<'projects' | 'help' | null>(null)
  const [exportMenu, setExportMenu] = useState(false)
  const [sidebar, setSidebar] = useState(() => !window.matchMedia('(max-width: 800px)').matches)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [exchange, setExchange] = useState<CadExchange | null>(null)
  const [dwgError, setDwgError] = useState('')
  const dwgAbortRef = useRef<AbortController | null>(null)
  useEffect(() => () => dwgAbortRef.current?.abort(), [])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const syncSidebar = (event: MediaQueryListEvent) => setSidebar(!event.matches)
    media.addEventListener('change', syncSidebar)
    return () => media.removeEventListener('change', syncSidebar)
  }, [])
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current)
      return
    busyRef.current = true
    setBusy(true)
    try {
      await action()
    }
    catch (e) {
      p.setError(
        e instanceof z.ZodError
          ? `导入数据不合法：${e.issues[0]?.message ?? '格式不匹配'}（请使用 webCAD 导出的版本 1 JSON）`
          : e instanceof Error
            ? e.message
            : '操作失败，请重试',
      )
    }
    finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const confirmExchange = () => {
    if (!exchange || busyRef.current)
      return
    const state = exchange
    setDwgError('')
    setExchange(null)
    void run(async () => {
      if (state.stage === 'report') {
        await p.importDocs([state.result.doc])
        return
      }
      const controller = new AbortController()
      dwgAbortRef.current = controller
      try {
        if (state.stage === 'import') {
          const result = await importDwg(state.file, controller.signal)
          setExchange({ stage: 'report', result })
        }
        else {
          const bytes = await exportDwg(state.doc, controller.signal)
          download(bytes, `${state.doc.name}.dwg`, 'application/acad')
        }
      }
      catch (e) {
        // 转换提示独立于存储错误，不能被后台自动保存清空。
        setDwgError(e instanceof Error
          ? e.message
          : 'DWG 转换失败，请保留原文件。')
      }
      finally {
        dwgAbortRef.current = null
      }
    })
  }
  const sample = () => {
    if (!s.doc)
      return
    if (
      s.doc.entities.length
      && !window.confirm('将当前图纸替换为示例？可以使用撤销恢复。')
    ) {
      return
    }
    s.commit(d => ({
      ...d,
      name: '安装底板 · Study 001',
      entities: exampleEntities(d),
      layers: d.layers.map(l => ({ ...l, visible: true, locked: false })),
      view: { x: 15, y: -5, scale: 2.2 },
    }))
    s.setTool('select')
  }
  return (
    <div className="app-shell" inert={!p.ready}>
      <header className="topbar" inert={busy}>
        <div className="brand">
          <img className="brand-mark" src={brandIcon} alt="" width={34} height={34} />
          <span className="brand-name">
            web
            <span className="brand-cad">CAD</span>
          </span>
        </div>
        <div className="header-divider" />
        <div className="document-info">
          {/* <span className="workspace-label">设计工作空间</span> */}
          <div className="document-title">
            <span className="tag">本地图纸</span>
            <FileText size={16} />
            <input
              aria-label="项目名称"
              key={`${s.doc?.id}/${s.doc?.name}`}
              defaultValue={s.doc?.name ?? ''}
              maxLength={200}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== s.doc?.name)
                  s.commit(d => ({ ...d, name }))
                else e.target.value = s.doc?.name ?? ''
              }}
            />
          </div>
        </div>
        <div className="topbar-right">
          <div className="document-actions">
            <button
              title="新建图纸"
              aria-label="新建"
              disabled={busy || !p.ready}
              onClick={() => void run(p.createNew)}
            >
              <FilePlus2 size={15} />
              <span>新建</span>
            </button>
            <button
              title="导入图纸"
              aria-label="导入"
              disabled={busy || !p.ready}
              onClick={() => file.current?.click()}
            >
              <Upload size={15} />
              <span>导入</span>
            </button>
            <div className="export-wrapper">
              <button
                className="export-button"
                title="导出图纸"
                aria-label="导出"
                disabled={!p.ready}
                aria-expanded={exportMenu}
                onClick={() => setExportMenu(!exportMenu)}
              >
                <Download size={15} />
                <span>导出</span>
                <ChevronDown size={12} />
              </button>
              {exportMenu && (
                <>
                  <button
                    className="menu-dismiss"
                    aria-label="关闭导出菜单"
                    onClick={() => setExportMenu(false)}
                  />
                  <div className="dropdown-menu">
                    <button
                      onClick={() => {
                        if (s.doc)
                          exportProject(s.doc)
                        setExportMenu(false)
                      }}
                    >
                      <FileText size={15} />
                      <span>
                        项目 JSON
                        <small>可编辑的完整图纸数据</small>
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        if (s.doc)
                          exportSVG(s.doc)
                        setExportMenu(false)
                      }}
                    >
                      <PenTool size={15} />
                      <span>
                        矢量 SVG
                        <small>用于打印或其他设计工具</small>
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setExportMenu(false)
                        void run(async () => {
                          if (!s.doc)
                            return
                          const doc = structuredClone(s.doc)
                          setExchange({ stage: 'export', doc, warnings: exportDxf(doc).warnings })
                        })
                      }}
                    >
                      <FileText size={15} />
                      <span>
                        DWG · 试用版
                        <small>基础二维图纸，导出前确认风险</small>
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setExportMenu(false)
                        void run(async () => exportBackup(await p.backup()))
                      }}
                    >
                      <HardDrive size={15} />
                      <span>
                        全部图纸备份
                        <small>打包保存所有本地项目</small>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <span className="topbar-actions-divider" />
          <button
            className="icon-button"
            title="使用指南"
            aria-label="使用指南"
            onClick={() => setModal('help')}
          >
            <CircleHelp size={18} />
          </button>
          <button
            className="project-button"
            title="我的图纸"
            aria-label="我的图纸"
            onClick={() => setModal('projects')}
          >
            <FolderOpen size={15} />
            <span>我的图纸</span>
            <ChevronDown size={13} />
          </button>
        </div>
      </header>
      <div className="editing-bar" inert={busy}>
        <div className="edit-actions">
          <button
            title="撤销 (⌘/Ctrl+Z)"
            aria-label="撤销"
            disabled={!s.history.length}
            onClick={s.undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            title="重做 (⌘/Ctrl+Shift+Z)"
            aria-label="重做"
            disabled={!s.future.length}
            onClick={s.redo}
          >
            <Redo2 size={16} />
          </button>
          <span className="small-divider" />
          <span className="drawing-label">
            二维绘图
            <span> / 毫米</span>
          </span>
        </div>
        <div className="edit-actions">
          <button className="sample-button" onClick={sample}>
            <Sparkles size={13} />
            示例图纸
          </button>
          <span className="small-divider" />
          <button
            className="sidebar-toggle"
            aria-label="切换属性面板"
            aria-controls="design-panel"
            aria-expanded={sidebar}
            title={sidebar ? '收起属性面板' : '展开属性面板'}
            onKeyDown={(e) => {
              if (e.code === 'Space')
                e.stopPropagation()
            }}
            onClick={() => setSidebar(open => !open)}
          >
            {sidebar
              ? <PanelRightClose size={16} />
              : <PanelRightOpen size={16} />}
          </button>
        </div>
      </div>
      {p.error && (
        <div className="error-banner" role="alert">
          <span>{p.error}</span>
          <button aria-label="关闭提示" onClick={() => p.setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {dwgError && (
        <div className="error-banner" role="alert">
          <span>{dwgError}</span>
          <button aria-label="关闭 DWG 提示" onClick={() => setDwgError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <main className="work-area" inert={busy || !p.ready}>
        <ToolRail />
        <Canvas />
        <aside id="design-panel" className={`inspector ${sidebar ? 'is-open' : ''}`}>
          <div className="inspector-heading">
            <span>设计面板</span>
            <Layers2 size={15} />
          </div>
          <div className="inspector-scroll">
            <Layers />
            <Properties />
          </div>
        </aside>
      </main>
      <CommandBar disabled={busy || !p.ready || modal !== null || exchange !== null} />
      <StatusBar status={p.status} retry={() => void run(p.flush)} />
      <input
        ref={file}
        className="hidden-input"
        data-testid="import-file"
        type="file"
        accept=".json,.dwg,application/json,application/acad"
        onChange={(e) => {
          const selected = e.target.files?.[0]
          e.target.value = ''
          if (selected) {
            void run(async () => {
              if (selected.size > 20 * 1024 * 1024)
                throw new Error('文件超过 20 MB 上限')
              if (/\.dwg$/i.test(selected.name)) {
                setExchange({ stage: 'import', file: selected })
              }
              else {
                await p.importDocs(parseImport(await selected.text()))
              }
            })
          }
        }}
      />
      {busy && (
        <div className="busy-overlay" role="status">
          <div className="busy-card">
            <p>正在处理图纸…</p>
            {dwgAbortRef.current && <button onClick={() => dwgAbortRef.current?.abort()}>取消 DWG 转换</button>}
          </div>
        </div>
      )}
      {modal === 'projects' && (
        <ProjectDialog
          projects={p}
          busy={busy}
          run={run}
          close={() => setModal(null)}
        />
      )}
      {modal === 'help' && <HelpDialog close={() => setModal(null)} />}
      {exchange && !busy && (
        <CadExchangeDialog
          key={exchange.stage}
          state={exchange}
          close={() => setExchange(null)}
          confirm={confirmExchange}
        />
      )}
    </div>
  )
}
