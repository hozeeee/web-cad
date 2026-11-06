import type { Drawing } from '../../cad/model'
import type { ProjectSummary } from '../../storage/database'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cloneDrawing, createDrawing } from '../../cad/model'
import {
  allProjects,
  deleteProject,
  listProjects,
  readProject,
  recentProjectId,
  saveProjects,
} from '../../storage/database'
import { useEditor } from '../editor/store'

export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [status, setStatus] = useState('正在打开本地数据库')
  const [temporary, setTemporary] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const memory = useRef(new Map<string, Drawing>())
  const temp = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const doc = useEditor(s => s.doc)
  const revision = useEditor(s => s.revision)
  const refresh = useCallback(async () => {
    setProjects(
      temp.current
        ? Array.from(memory.current.values()).map(d => ({
            id: d.id,
            name: d.name,
            updatedAt: d.updatedAt,
            entityCount: d.entities.length,
          }))
        : await listProjects(),
    )
  }, [])
  const write = useCallback(
    async (docs: Drawing[]) => {
      if (temp.current)
        docs.forEach(d => memory.current.set(d.id, structuredClone(d)))
      else await saveProjects(docs)
      await refresh()
    },
    [refresh],
  )
  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const current = useEditor.getState().doc
    if (!current)
      return
    setStatus(temp.current ? '临时编辑 · 请导出备份' : '正在保存…')
    const job = queue.current.catch(() => {}).then(() => write([current]))
    queue.current = job
    try {
      await job
      if (useEditor.getState().doc === current)
        setStatus(temp.current ? '临时编辑 · 请导出备份' : '已保存到本地')
      setError('')
    }
    catch (e) {
      setStatus('保存失败 · 点击重试')
      setError(
        `本地保存失败：${
          e instanceof Error
            ? e.message
            : '数据库不可用'
        }。请先导出备份。`,
      )
      throw e
    }
  }, [write])
  useEffect(() => {
    let alive = true
    async function initialize() {
      try {
        const summaries = await listProjects()
        const recent = await recentProjectId()
        const id
          = summaries.find(p => p.id === recent)?.id ?? summaries[0]?.id
        const latest = id
          ? await readProject(id)
          : undefined
        if (!alive)
          return
        const next = latest ?? createDrawing('未命名图纸')
        if (!latest)
          await saveProjects([next])
        if (!alive)
          return
        useEditor.getState().load(next)
        setProjects(latest
          ? summaries
          : await listProjects())
        setStatus('已保存到本地')
      }
      catch {
        if (!alive)
          return
        temp.current = true
        setTemporary(true)
        useEditor.getState().load(createDrawing())
        setStatus('临时编辑 · 请导出备份')
        setError(
          'IndexedDB 不可用，当前项目仅保留在内存中。关闭页面前请导出 JSON。',
        )
      }
      setReady(true)
    }
    void initialize()
    return () => {
      alive = false
      clearTimeout(timer.current)
    }
  }, [])
  useEffect(() => {
    if (!ready || !doc)
      return
    setStatus(temp.current ? '临时编辑 · 请导出备份' : '待保存…')
    timer.current = setTimeout(() => {
      void flush().catch(() => {})
    }, 600)
    return () => clearTimeout(timer.current)
  }, [doc, revision, ready, flush])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (status !== '已保存到本地') {
        event.preventDefault()
        void flush().catch(() => {})
      }
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden')
        void flush().catch(() => {})
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [status, flush])
  const open = async (id: string) => {
    await flush()
    const next = temp.current
      ? memory.current.get(id)
      : await readProject(id)
    if (next) {
      await write([next])
      useEditor.getState().load(structuredClone(next))
    }
  }
  const createNew = async () => {
    await flush()
    const next = createDrawing()
    await write([next])
    useEditor.getState().load(next)
  }
  const duplicate = async () => {
    await flush()
    const current = useEditor.getState().doc
    if (current) {
      const next = cloneDrawing(current)
      await write([next])
      useEditor.getState().load(next)
    }
  }
  const remove = async (id: string) => {
    await flush()
    if (temp.current)
      memory.current.delete(id)
    else await deleteProject(id)
    if (useEditor.getState().doc?.id === id) {
      const next = createDrawing()
      await write([next])
      useEditor.getState().load(next)
    }
    await refresh()
  }
  const importDocs = async (docs: Drawing[]) => {
    await flush()
    await write(docs)
    useEditor.getState().load(docs[0])
  }
  const backup = async () => {
    await flush()
    return temp.current
      ? Array.from(memory.current.values())
      : await allProjects()
  }
  return {
    projects,
    status,
    temporary,
    ready,
    error,
    setError,
    flush,
    open,
    createNew,
    duplicate,
    remove,
    importDocs,
    backup,
  }
}
