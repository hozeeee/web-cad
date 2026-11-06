import type { Drawing } from '../../cad/model'
import type { CadImport } from '../dxf'
import DwgWorker from './dwg.worker?worker&inline'

export const dwgVersions = new Set([
  'AC1009',
  'AC1012',
  'AC1014',
  'AC1015',
  'AC1018',
  'AC1021',
  'AC1024',
  'AC1027',
  'AC1032',
])

function job<T>(task: object, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('已取消 DWG 转换'))
      return
    }
    let worker: Worker
    try {
      worker = new DwgWorker()
    }
    catch {
      reject(new Error('浏览器无法启动本地 DWG Worker，请检查浏览器兼容性和安全策略。'))
      return
    }
    let timer: ReturnType<typeof setTimeout>
    let finished = false
    function abort() {
      finish(new Error('已取消 DWG 转换，未保存或下载文件'))
    }
    function finish(error?: Error, result?: T) {
      if (finished)
        return
      finished = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      if (error)
        reject(error)
      else resolve(result!)
    }
    timer = setTimeout(() => finish(new Error('DWG 转换超过 30 秒，已停止。请尝试更小的二维图纸。')), 30000)
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }: MessageEvent<{ ok: boolean, error?: string, result?: T }>) => {
      finish(data.ok
        ? undefined
        : new Error(`DWG 转换失败：${data.error}`), data.result)
    }
    worker.onerror = (event) => {
      event.preventDefault()
      finish(new Error('DWG 引擎异常或内存不足。未保存文件，请保留原文件并尝试较小的图纸。'))
    }
    worker.onmessageerror = () => finish(new Error('DWG 转换结果传输失败'))
    try {
      worker.postMessage(task)
    }
    catch {
      finish(new Error('无法提交 DWG 转换任务'))
    }
  })
}

export async function importDwg(file: File, signal?: AbortSignal): Promise<CadImport> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error('文件超过 20 MB 上限')
  const input = await file.arrayBuffer()
  const version = new TextDecoder().decode(new Uint8Array(input, 0, Math.min(6, input.byteLength)))
  if (!dwgVersions.has(version))
    throw new Error('不是支持的 DWG 文件：需要 AC1009–AC1032 文件头，改后缀不会转换格式。')
  return job<CadImport>({ action: 'import', input, name: file.name }, signal)
}

export async function exportDwg(doc: Drawing, signal?: AbortSignal) {
  return job<ArrayBuffer>({ action: 'export', doc }, signal)
}
