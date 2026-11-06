import type { useProjects } from './useProjects'
import { Copy, FilePlus2, FileText, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { useEditor } from '../editor/store'

interface Props {
  projects: ReturnType<typeof useProjects>
  busy: boolean
  run: (action: () => Promise<void>) => Promise<void>
  close: () => void
}
export function ProjectDialog({ projects: p, busy, run, close }: Props) {
  const doc = useEditor(s => s.doc)
  return (
    <Modal title="我的图纸" onClose={close}>
      <p className="modal-description">
        保存在这个浏览器里的设计。无需账号，随时继续。
      </p>
      <div className="project-modal-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await p.createNew()
              close()
            })}
        >
          <FilePlus2 size={15} />
          新建图纸
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await p.duplicate()
              close()
            })}
        >
          <Copy size={15} />
          复制当前图纸
        </button>
      </div>
      <div className="project-list">
        {p.projects.map(project => (
          <div
            className={`project-row ${project.id === doc?.id
              ? 'current'
              : ''}`}
            key={project.id}
          >
            <FileText size={23} strokeWidth={1.3} />
            <button
              className="project-open"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await p.open(project.id)
                  close()
                })}
            >
              <strong>{project.name}</strong>
              <span>
                {project.entityCount}
                {' '}
                个图形 ·
                {' '}
                {new Date(project.updatedAt).toLocaleString('zh-CN')}
                {project.id === doc?.id
                  ? ' · 当前'
                  : ''}
              </span>
            </button>
            <button
              aria-label={`删除项目 ${project.name}`}
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `删除图纸「${project.name}」？项目删除不能撤销。`,
                  )
                ) {
                  void run(() => p.remove(project.id))
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <p className="modal-footnote">
        {p.temporary
          ? '当前处于临时模式，关闭页面前务必导出。'
          : '不同浏览器、Pages 和本地 HTML 的图纸不会自动共享。使用 JSON 迁移。'}
      </p>
    </Modal>
  )
}
