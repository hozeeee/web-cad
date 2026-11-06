import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const roots = {
  '/repository/': resolve('dist/standard'),
  '/single/': resolve('dist/single'),
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
}
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    )
    const prefix = Object.keys(roots).find(prefix => path.startsWith(prefix))
    if (!prefix) {
      response.writeHead(404).end()
      return
    }
    const root = roots[prefix]
    const file = resolve(root, path.slice(prefix.length) || 'index.html')
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end()
      return
    }
    const content = await readFile(file)
    response
      .writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      })
      .end(content)
  }
  catch {
    response.writeHead(404).end()
  }
}).listen(4174, '127.0.0.1')
