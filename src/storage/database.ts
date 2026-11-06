import type { DBSchema, IDBPDatabase } from 'idb'
import type { Drawing } from '../cad/model'
import { openDB } from 'idb'
import { drawingSchema } from '../io/schema'

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
  entityCount: number
}
interface CADDatabase extends DBSchema {
  projects: { key: string, value: ProjectSummary }
  documents: { key: string, value: Drawing }
  settings: { key: string, value: string }
}
let connection: Promise<IDBPDatabase<CADDatabase>> | undefined
export async function database() {
  connection ??= openDB<CADDatabase>('forma-cad', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects'))
        db.createObjectStore('projects', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('documents'))
        db.createObjectStore('documents', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings')
    },
    blocking() {
      const previous = connection
      connection = undefined
      void previous?.then(db => db.close())
    },
    terminated() {
      connection = undefined
    },
  }).catch((error) => {
    connection = undefined
    throw error
  })
  return connection
}
export async function recentProjectId() {
  return (await database()).get('settings', 'recent')
}
export async function saveProjects(docs: Drawing[]) {
  const valid = docs.map(doc => drawingSchema.parse(doc))
  const db = await database()
  const tx = db.transaction(['projects', 'documents', 'settings'], 'readwrite')
  if (valid[0])
    await tx.objectStore('settings').put(valid[0].id, 'recent')
  await Promise.all(
    valid.flatMap(doc => [
      tx.objectStore('documents').put(doc),
      tx.objectStore('projects').put({
        id: doc.id,
        name: doc.name,
        updatedAt: doc.updatedAt,
        entityCount: doc.entities.length,
      }),
    ]),
  )
  await tx.done
}
export async function listProjects() {
  const db = await database()
  return (await db.getAll('projects')).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )
}
export async function readProject(id: string) {
  const doc = await (await database()).get('documents', id)
  return doc
    ? drawingSchema.parse(doc)
    : undefined
}
export async function allProjects() {
  return (await (await database()).getAll('documents')).map(doc =>
    drawingSchema.parse(doc),
  )
}
export async function deleteProject(id: string) {
  const db = await database()
  const tx = db.transaction(['projects', 'documents'], 'readwrite')
  await Promise.all([
    tx.objectStore('projects').delete(id),
    tx.objectStore('documents').delete(id),
  ])
  await tx.done
}
