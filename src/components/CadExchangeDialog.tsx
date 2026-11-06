import type { Drawing } from '../cad/model'
import type { CadImport } from '../io/dxf'
import { useState } from 'react'
import { exportProject } from '../io/files'
import { Modal } from './Modal'

export type CadExchange
  = | { stage: 'import', file: File }
    | { stage: 'report', result: CadImport }
    | { stage: 'export', doc: Drawing, warnings: string[] }

export function CadExchangeDialog({ state, close, confirm }: {
  state: CadExchange
  close: () => void
  confirm: () => void
}) {
  const [accepted, setAccepted] = useState(false)
  const title = state.stage === 'import'
    ? '导入 DWG · 试用功能'
    : state.stage === 'report'
      ? 'DWG 导入检查'
      : '导出 DWG · 试用功能'
  const warnings = state.stage === 'report'
    ? state.result.warnings
    : state.stage === 'export'
      ? state.warnings
      : [
          '仅支持模型空间中位于 XY 平面的直线、圆、圆弧、无弧段和宽度的普通折线、简单文字及图层。',
          '块参照、填充、样条、原生标注、复杂文字、布局、三维对象和业务扩展数据不会完整保留。解析后会列出已识别的跳过项，但不能保证发现所有损失。',
          '请保留原 DWG；部分导入后再导出不会恢复缺失的内容。试用版不适合未经核验的施工、制造或生产交付。',
          '支持尝试读取 AC1009–AC1032 文件（R11/R12 至 2018+），不保证所有版本变体兼容。文件上限 20 MB、实体上限 20000；失败或取消不会创建项目。',
        ]
  return (
    <Modal title={title} onClose={close}>
      <div className="cad-exchange-content">
        <p className="cad-risk" role="note">兼容性试用版，非无损 DWG 编辑器。全部转换在本地进行，不上传文件。</p>
        {state.stage === 'import' && (
          <p>
            待检查文件：
            {state.file.name}
          </p>
        )}
        {state.stage === 'report' && (
          <>
            <p>检查完成，尚未保存。确认后创建新项目，不覆盖当前图纸。</p>
            <p data-testid="cad-import-summary">
              转换后顶层实体
              {' '}
              {state.result.total}
              {' '}
              个，可导入
              {' '}
              {state.result.doc.entities.length}
              {' '}
              个，已识别跳过
              {' '}
              {Object.values(state.result.skipped).reduce((a, b) => a + b, 0)}
              {' '}
              个。
            </p>
            {Object.entries(state.result.skipped).length > 0 && (
              <ul aria-label="DWG 跳过内容">
                {Object.entries(state.result.skipped).map(([type, count]) => (
                  <li key={type}>
                    {type}
                    ：
                    {count}
                    {' '}
                    个
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <ul className="cad-warnings">
          {[
            ...new Set(warnings),
          ].map(warning => <li key={warning}>{warning}</li>)}
        </ul>
        <label className="cad-consent">
          <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
          我已了解可能丢失内容，并会保留原文件、核对尺寸和外观
        </label>
        <div className="cad-exchange-actions">
          <button onClick={close}>取消</button>
          {state.stage === 'export' && <button onClick={() => exportProject(state.doc)}>先备份项目 JSON</button>}
          <button className="primary" disabled={!accepted} onClick={confirm}>
            {state.stage === 'import'
              ? '开始检查 DWG'
              : state.stage === 'report'
                ? '确认导入为新项目'
                : '确认导出 DWG'}
          </button>
        </div>
        <p className="modal-footnote">DWG 引擎：acadrust 0.6.8 / MPL-2.0。文件必须在目标 CAD 软件中再次核验。许可与源码信息见「使用指南」。</p>
      </div>
    </Modal>
  )
}
