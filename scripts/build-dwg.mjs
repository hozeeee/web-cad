import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const manifest = resolve('engine/dwg/Cargo.toml')
const cargo = process.env.CARGO ?? 'cargo'
const env = {
  ...process.env,
  RUSTFLAGS: `${process.env.RUSTFLAGS ?? ''} -C link-arg=--max-memory=536870912`,
}
const built = spawnSync(cargo, [
  'build',
  '--locked',
  '--manifest-path',
  manifest,
  '--target',
  'wasm32-unknown-unknown',
  '--release',
], { env, stdio: 'inherit' })
if (built.status !== 0)
  process.exit(built.status ?? 1)
const metadata = spawnSync(cargo, [
  'metadata',
  '--manifest-path',
  manifest,
  '--format-version',
  '1',
], { env, encoding: 'utf8' })
if (metadata.status !== 0)
  throw new Error(metadata.stderr)
const data = JSON.parse(metadata.stdout)
const wasm = resolve(data.target_directory, 'wasm32-unknown-unknown/release/webcad_dwg.wasm')
copyFileSync(wasm, 'src/io/dwg/webcad-dwg.wasm')
const library = data.packages.find(pkg => pkg.name === 'acadrust')
const source = dirname(library.manifest_path)
mkdirSync('engine/dwg/licenses', { recursive: true })
copyFileSync(resolve(source, 'LICENSE'), 'engine/dwg/licenses/MPL-2.0.txt')
copyFileSync(resolve(source, 'THIRD_PARTY_NOTICES.md'), 'engine/dwg/licenses/acadrust-NOTICES.txt')
// 将依赖许可一同保留在源码与单 HTML 中，避免离线分发遗漏归属信息。
const notices = data.packages.map((pkg) => {
  const root = dirname(pkg.manifest_path)
  const licenses = readdirSync(root).filter(name => /^(?:LICENSE|COPYING|NOTICE)/i.test(name) && !name.endsWith('.json'))
  const texts = licenses.map((name) => {
    try {
      return readFileSync(resolve(root, name), 'utf8')
    }
    catch {
      return ''
    }
  }).join('\n')
  return `${pkg.name} ${pkg.version} — ${pkg.license ?? '未声明'} — ${pkg.repository ?? ''}\n${texts}`
}).join('\n\n')
writeFileSync('engine/dwg/licenses/dependencies.txt', `${notices}\n`)
const tracked = [
  'engine/dwg/Cargo.toml',
  'engine/dwg/Cargo.lock',
  'engine/dwg/src/lib.rs',
  'engine/dwg/clock/Cargo.toml',
  'engine/dwg/clock/lib.rs',
  'scripts/build-dwg.mjs',
  'src/io/dwg/webcad-dwg.wasm',
]
const hashes = Object.fromEntries(tracked.map(path => [
  path,
  createHash('sha256').update(readFileSync(path)).digest('hex'),
]))
writeFileSync('engine/dwg/build.json', `${JSON.stringify({ engine: 'acadrust 0.6.8', hashes }, null, 2)}\n`)
const sourceBundle = tracked.filter(path => !path.endsWith('.wasm')).map(path => `===== ${path} =====\n${readFileSync(path, 'utf8')}`).join('\n\n')
writeFileSync('engine/dwg/source.txt', `webCAD DWG 桥接与时钟源码（MPL-2.0）\n依赖源代码可按 Cargo.lock 中的版本与校验和从 crates.io 获取。\nacadrust 0.6.8: https://crates.io/api/v1/crates/acadrust/0.6.8/download\n构建需要 Rust 1.90.0 与 wasm32-unknown-unknown target，运行 npm run build:dwg。\n\n${sourceBundle}\n`)
console.log(`DWG WASM: ${(Buffer.byteLength(readFileSync(wasm)) / 1024 / 1024).toFixed(2)} MB`)
