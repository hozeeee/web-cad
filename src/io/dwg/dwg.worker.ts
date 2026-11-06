import type { Drawing } from '../../cad/model'
import { exportDxf, importDxf } from '../dxf'
import { convertBytes, embeddedWasm } from './codec'
import wasmUrl from './webcad-dwg.wasm?url&inline'

interface Task { action: 'import' | 'export', input?: ArrayBuffer, name?: string, doc?: Drawing }
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<Task>) => void
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}
scope.onmessage = async (event: MessageEvent<Task>) => {
  try {
    const wasm = embeddedWasm(wasmUrl)
    const task = event.data
    if (task.action === 'import' && task.input && task.name) {
      const output = await convertBytes(wasm, new Uint8Array(task.input), 0)
      const decoded = JSON.parse(new TextDecoder().decode(output)) as { dxf: string, warnings: string[], notificationCount: number }
      const result = importDxf(decoded.dxf, task.name)
      if (decoded.notificationCount) {
        result.warnings.push(`DWG 引擎报告 ${decoded.notificationCount} 条诊断，部分对象可能未完整转换。以下为原始诊断（最多 100 条）：`)
        result.warnings.push(...decoded.warnings)
      }
      scope.postMessage({ ok: true, result })
    }
    else if (task.action === 'export' && task.doc) {
      const dxf = exportDxf(task.doc)
      const output = await convertBytes(wasm, new TextEncoder().encode(dxf.content), 1)
      if (new TextDecoder().decode(output.subarray(0, 6)) !== 'AC1027')
        throw new Error('DWG 输出文件头校验失败，未生成下载')
      scope.postMessage({ ok: true, result: output.buffer }, [output.buffer])
    }
    else {
      throw new Error('无效的 DWG 任务')
    }
  }
  catch (error) {
    scope.postMessage({
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'DWG 转换失败',
    })
  }
}
