import { beforeEach, describe, expect, it } from 'vitest'
import { cloneDrawing, createDrawing } from '../cad/model'
import {
  allProjects,
  database,
  deleteProject,
  listProjects,
  readProject,
  recentProjectId,
  saveProjects,
} from './database'
import 'fake-indexeddb/auto'

beforeEach(async () => {
  const db = await database()
  const tx = db.transaction(['projects', 'documents', 'settings'], 'readwrite')
  await Promise.all([
    tx.objectStore('projects').clear(),
    tx.objectStore('documents').clear(),
    tx.objectStore('settings').clear(),
  ])
  await tx.done
})
describe('indexedDB 本地存储', () => {
  it('文档与摘要同步保存，重复保存不重复创建', async () => {
    const doc = createDrawing('持久化')
    await saveProjects([doc])
    await saveProjects([doc])
    expect(await readProject(doc.id)).toEqual(doc)
    expect(await listProjects()).toHaveLength(1)
    expect(await recentProjectId()).toBe(doc.id)
  })
  it('复制项目为新 ID，删除同时移除摘要与文档', async () => {
    const doc = createDrawing()
    const copy = cloneDrawing(doc)
    await saveProjects([doc, copy])
    await deleteProject(doc.id)
    expect(await readProject(doc.id)).toBeUndefined()
    expect(await allProjects()).toEqual([copy])
    expect(await listProjects()).toHaveLength(1)
  })
  it('批量导入全部校验后再写入，不留下部分数据', async () => {
    const doc = createDrawing()
    const invalid = {
      ...createDrawing(),
      version: 2,
    } as unknown as typeof doc
    await expect(saveProjects([doc, invalid])).rejects.toThrow()
    expect(await allProjects()).toHaveLength(0)
    expect(await listProjects()).toHaveLength(0)
  })
  it('数据库事务中途失败时回滚两个 store', async () => {
    const doc = createDrawing()
    const db = await database()
    const tx = db.transaction(['projects', 'documents'], 'readwrite')
    await tx.objectStore('documents').put(doc)
    tx.abort()
    await expect(tx.done).rejects.toThrow()
    expect(await readProject(doc.id)).toBeUndefined()
    expect(await listProjects()).toHaveLength(0)
  })
})
