// Rust 桥接的内存仅在单次任务内使用；返回结果必须复制，不能暴露 WASM 内存视图。
export interface DwgExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  input_buffer: (length: number) => number
  output_ptr: () => number
  output_len: () => number
  run: (direction: number) => number
}

export async function convertBytes(wasm: Uint8Array<ArrayBuffer>, input: Uint8Array, direction: 0 | 1) {
  const { instance } = await WebAssembly.instantiate(wasm, {
    webcad: {
      now: () => performance.now(),
    },
  })
  const api = instance.exports as DwgExports
  const pointer = api.input_buffer(input.length)
  new Uint8Array(api.memory.buffer, pointer, input.length).set(input)
  const status = api.run(direction)
  const output = new Uint8Array(api.memory.buffer, api.output_ptr(), api.output_len()).slice()
  if (status)
    throw new Error(new TextDecoder().decode(output).slice(0, 1000))
  return output
}

export function embeddedWasm(url: string) {
  // Vite 强制内嵌资源；即使使用 file:// 或断网，也无需 fetch 外部资源。
  const encoded = url.slice(url.indexOf(',') + 1)
  if (!url.startsWith('data:') || !url.includes(';base64,'))
    throw new Error('DWG 引擎未内嵌，无法离线运行')
  return Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
}
