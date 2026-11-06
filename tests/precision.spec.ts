import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { createDrawing } from '../src/cad/model'

async function ready(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText('已保存到本地')
}
async function input(page: Page, text: string) {
  const field = page.getByLabel('命令输入', { exact: true })
  await field.fill(text)
  await field.press('Enter')
}
async function drawing(page: Page) {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /项目 JSON/ }).click()
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
}
async function line(page: Page, a = '0,0', b = '100,0') {
  await page.getByRole('button', { name: '直线', exact: true }).click()
  await input(page, a)
  await input(page, b)
  await input(page, '')
}
async function world(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('cad-canvas').boundingBox())!
  return { x: box.x + box.width / 2 + x * 2, y: box.y + box.height / 2 - y * 2 }
}
async function click(page: Page, x: number, y: number) {
  const p = await world(page, x, y)
  await page.mouse.click(p.x, p.y)
}
async function boxSelect(page: Page, ax: number, ay: number, bx: number, by: number, modifier?: 'Shift' | 'Alt') {
  const a = await world(page, ax, ay)
  const b = await world(page, bx, by)
  if (modifier)
    await page.keyboard.down(modifier)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await expect(page.getByTestId('selection-box')).toHaveAttribute('data-mode', bx < ax
    ? 'crossing'
    : 'window')
  await page.mouse.up()
  if (modifier)
    await page.keyboard.up(modifier)
}

for (const target of ['开发服务', '标准构建', '单 HTML 离线']) {
  test.describe(`精确命令 ${target}`, () => {
    test.beforeEach(async ({ page, context }) => {
      if (target === '单 HTML 离线')
        await context.setOffline(true)
      await page.goto(target === '开发服务'
        ? '/'
        : target === '标准构建'
          ? 'http://127.0.0.1:4174/repository/'
          : pathToFileURL(resolve('dist/single/index.html')).href)
      await ready(page)
    })
    test('关闭侧栏，键盘输入相对/极坐标绘制闭合轮廓、退回、撤销并保存', async ({ page }) => {
      await page.getByRole('button', { name: '切换属性面板', exact: true }).click()
      await expect(page.locator('#design-panel')).toBeHidden()
      await page.getByRole('button', { name: '直线', exact: true }).click()
      await page.getByTestId('cad-canvas').focus()
      await page.keyboard.type('13,7')
      await expect(page.getByLabel('命令输入')).toHaveValue('13,7')
      await page.keyboard.press('Enter')
      await input(page, '@120,0')
      await input(page, '@80<90')
      await expect(page.locator('[data-entity]')).toHaveCount(2)
      await input(page, 'U')
      await expect(page.locator('[data-entity]')).toHaveCount(1)
      await input(page, '@80<90')
      await input(page, '@-120,0')
      await input(page, 'Close')
      const doc = await drawing(page)
      expect(doc.version).toBe(1)
      expect(doc.entities).toHaveLength(4)
      expect(doc.entities[0]).toMatchObject({
        a: { x: 13, y: 7 },
        b: { x: 133, y: 7 },
      })
      expect(doc.entities[1].b.y).toBeCloseTo(87)
      expect(doc.entities[3].b).toEqual({ x: 13, y: 7 })
      await page.getByRole('button', { name: '撤销', exact: true }).click()
      await expect(page.locator('[data-entity]')).toHaveCount(3)
      await page.getByRole('button', { name: '重做', exact: true }).click()
      await ready(page)
      await page.reload()
      await ready(page)
      await expect(page.locator('[data-entity]')).toHaveCount(4)
    })
    test('命令内点选及旋转独立确认，焦点下取消不产生修改', async ({ page }) => {
      await line(page)
      await page.getByRole('button', { name: '移动', exact: true }).click()
      await expect(page.getByLabel('输入 X', { exact: true })).toHaveCount(0)
      await click(page, 50, 0)
      await page.keyboard.press('Enter')
      await input(page, '0,0')
      await input(page, '@20,10')
      const moved = await drawing(page)
      expect(moved.entities[0]).toMatchObject({
        a: { x: 20, y: 10 },
        b: { x: 120, y: 10 },
      })
      await page.getByRole('button', { name: '旋转', exact: true }).click()
      await input(page, '0,0')
      expect((await drawing(page)).entities).toEqual(moved.entities)
      await page.getByLabel('旋转角度°', { exact: true }).fill('90')
      await page.getByLabel('旋转角度°', { exact: true }).press('Enter')
      expect((await drawing(page)).entities).toEqual(moved.entities)
      await input(page, '90')
      const rotated = await drawing(page)
      expect(rotated.entities[0].a.x).toBeCloseTo(-10)
      expect(rotated.entities[0].a.y).toBeCloseTo(20)
      await page.getByRole('button', { name: '旋转', exact: true }).click()
      await input(page, '0,0')
      await page.getByLabel('旋转角度°', { exact: true }).focus()
      await page.keyboard.press('Escape')
      await expect(page.locator('.command-prompt')).toContainText('选择')
      expect((await drawing(page)).entities).toEqual(rotated.entities)
      await page.getByRole('button', { name: '撤销', exact: true }).click()
      expect((await drawing(page)).entities).toEqual(moved.entities)
    })
    test('窗口/交叉及加减选，并在命令内框选后移动', async ({ page }) => {
      await line(page, '-100,0', '100,0')
      await boxSelect(page, -10, 10, 10, -10)
      await expect(page.locator('[data-grip]')).toHaveCount(0)
      await boxSelect(page, 10, 10, -10, -10)
      await expect(page.locator('[data-grip]')).toHaveCount(3)
      await boxSelect(page, 10, 10, -10, -10, 'Alt')
      await expect(page.locator('[data-grip]')).toHaveCount(0)
      await boxSelect(page, 10, 10, -10, -10, 'Shift')
      await expect(page.locator('[data-grip]')).toHaveCount(3)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: '移动', exact: true }).click()
      await boxSelect(page, 10, 10, -10, -10)
      await page.keyboard.press('Enter')
      await input(page, '0,0')
      await input(page, '@0,20')
      expect((await drawing(page)).entities[0]).toMatchObject({
        a: { x: -100, y: 20 },
        b: { x: 100, y: 20 },
      })
    })
  })
}

test('连续鼠标直线和直接距离输入遵循正交方向', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '直线', exact: true }).click()
  await click(page, 0, 0)
  await click(page, 100, 0)
  await click(page, 100, 60)
  await expect(page.locator('[data-entity]')).toHaveCount(2)
  await page.getByRole('button', { name: '正交', exact: true }).click()
  const direction = await world(page, 150, 70)
  await page.mouse.move(direction.x, direction.y)
  await page.getByTestId('cad-canvas').focus()
  await page.keyboard.type('37')
  await page.keyboard.press('Enter')
  const doc = await drawing(page)
  expect(doc.entities[2].b).toEqual({ x: 137, y: 60 })
})

test('Esc 在坐标输入内取消，Enter 在提交按钮上仅提交一点，输入法不结束命令', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '折线', exact: true }).click()
  await input(page, '0,0')
  await input(page, '@100,0')
  const x = page.getByLabel('输入 X', { exact: true })
  await x.fill('100')
  await page.getByLabel('输入 Y', { exact: true }).fill('60')
  await page.getByRole('button', { name: '确认坐标点', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-entity]')).toHaveCount(0)
  await input(page, '')
  const doc = await drawing(page)
  expect(doc.entities).toHaveLength(1)
  expect(doc.entities[0].points).toEqual([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
  ])
  await page.getByRole('button', { name: '直线', exact: true }).click()
  await x.focus()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('输入 X', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '折线', exact: true }).click()
  await input(page, '0,0')
  await input(page, '@10,0')
  await page.getByLabel('命令输入').evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }))
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      keyCode: 229,
      bubbles: true,
      cancelable: true,
    }))
  })
  await expect(page.locator('.command-prompt')).toContainText('折线')
  await expect(page.locator('[data-entity]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  expect((await drawing(page)).entities).toEqual(doc.entities)
})

test('锁定参考层仍可捕捉，临时类型覆盖只作用于下一点', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page, '13,7', '113,7')
  await page.getByRole('button', { name: '锁定图层 轮廓', exact: true }).click()
  await page.getByRole('button', { name: '设为当前图层 辅助线', exact: true }).click()
  await page.getByRole('button', { name: '直线', exact: true }).click()
  await page.getByRole('button', { name: '网格吸附', exact: true }).click()
  await page.getByRole('button', { name: '对象吸附', exact: true }).click()
  await page.locator('.snap-settings summary').click()
  await page.getByLabel('临时捕捉', { exact: true }).selectOption('endpoint')
  await page.locator('.snap-settings summary').click()
  const p = await world(page, 114, 8)
  await page.mouse.move(p.x, p.y)
  await expect(page.getByTestId('snap-indicator')).toHaveAttribute('data-snap-type', 'endpoint')
  await page.mouse.click(p.x, p.y)
  const q = await world(page, 163, 47)
  await page.mouse.move(q.x, q.y)
  await expect(page.getByTestId('snap-indicator')).toHaveCount(0)
  await page.mouse.click(q.x, q.y)
  const doc = await drawing(page)
  expect(doc.entities[1]).toMatchObject({
    a: { x: 113, y: 7 },
    b: { x: 163, y: 47 },
  })
  expect(doc.entities[0]).toMatchObject({
    a: { x: 13, y: 7 },
    b: { x: 113, y: 7 },
  })
})

test('整体拖动与夹点均遵循正交，取消拖动不提交；捕捉可见锁定参考', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page, '0,0', '100,0')
  const doc = createDrawing()
  doc.entities = [
    {
      id: 'moving',
      layerId: doc.layers[0].id,
      strokeWidth: 0.5,
      type: 'line',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
    },
    {
      id: 'reference',
      layerId: doc.layers[1].id,
      strokeWidth: 0.5,
      type: 'line',
      a: { x: 150, y: 0 },
      b: { x: 200, y: 0 },
    },
  ]
  doc.layers[1].locked = true
  await page.getByTestId('import-file').setInputFiles({
    name: '参考.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await ready(page)
  await page.getByRole('button', { name: '正交', exact: true }).click()
  const a = await world(page, 100, 0)
  const b = await world(page, 151, 20)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await expect(page.getByTestId('snap-indicator')).toHaveAttribute('data-snap-type', 'endpoint')
  await page.mouse.up()
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 50, y: 0 },
    b: { x: 150, y: 0 },
  })
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await click(page, 50, 0)
  const grip = (await page.locator('[data-grip="1"]').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await page.mouse.up()
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 0, y: 0 },
    b: { x: 150, y: 0 },
  })
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await click(page, 50, 0)
  const start = await world(page, 20, 0)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 60, start.y + 20, { steps: 5 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
  })
})

test('交叉框不误选圆内部，非关联标注显示风险提示', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '圆', exact: true }).click()
  await input(page, '0,0')
  await input(page, '50')
  await page.keyboard.press('Escape')
  await boxSelect(page, 5, 5, -5, -5)
  await expect(page.locator('[data-grip]')).toHaveCount(0)
  await page.getByRole('button', { name: '尺寸标注', exact: true }).click()
  await expect(page.locator('.tool-properties')).toContainText('非关联标注')
  await input(page, '0,0')
  await input(page, '100,0')
  await input(page, '50,-20')
  await page.keyboard.press('Escape')
  await click(page, 50, -20)
  await expect(page.locator('.property-content')).toContainText('尺寸不会自动更新')
})

for (const viewport of [
  { width: 320, height: 320 },
  { width: 375, height: 400 },
  { width: 640, height: 320 },
  { width: 1440, height: 320 },
]) {
  test(`连续绘图命令栏与捕捉菜单在短屏可操作 ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: '直线', exact: true }).click()
    const bar = page.getByRole('region', { name: '命令栏', exact: true })
    await expect(page.getByLabel('命令输入', { exact: true })).toBeInViewport({ ratio: 1 })
    for (const name of ['退回一点', '闭合', '结束', '取消'])
      await expect(bar.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 })
    await input(page, '0,0')
    await input(page, '@10,0')
    await input(page, '@0,10')
    await bar.getByRole('button', { name: '闭合', exact: true }).click()
    await expect(page.locator('[data-entity]')).toHaveCount(3)
    await page.locator('.snap-settings summary').click()
    await expect(page.locator('.snap-menu')).toBeInViewport({ ratio: 1 })
    await page.getByLabel('临时捕捉', { exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByLabel('临时捕捉', { exact: true })).toBeInViewport({ ratio: 1 })
    await page.getByLabel('临时捕捉', { exact: true }).selectOption('endpoint')
    await page.locator('.snap-settings summary').click()
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
    expect(dimensions.width).toBeLessThanOrEqual(viewport.width)
    expect(dimensions.height).toBeLessThanOrEqual(viewport.height)
  })
}

test('图层切换重置取点阶段，锁定选中对象返回命令内选择', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  await page.getByTestId('cad-canvas').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByRole('button', { name: '旋转', exact: true }).click()
  await input(page, '0,0')
  await expect(page.getByRole('button', { name: '确认旋转', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '设为当前图层 辅助线', exact: true }).click()
  await expect(page.getByLabel('输入 X', { exact: true })).toBeVisible()
  await input(page, '0,0')
  await page.getByRole('button', { name: '锁定图层 轮廓', exact: true }).click()
  await expect(page.locator('.command-prompt')).toContainText('选择对象（0 已选）')
  await expect(page.getByLabel('输入 X', { exact: true })).toHaveCount(0)
  const doc = await drawing(page)
  expect(doc.entities[0]).toMatchObject({
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
  })
})

test('弹窗隔离命令栏，Esc 关闭弹窗但不取消绘图命令', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '直线', exact: true }).click()
  await input(page, '13,7')
  const bar = page.locator('.command-bar')
  await page.getByRole('button', { name: '使用指南', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(bar).toHaveAttribute('inert', '')
  await page.getByLabel('命令输入', { exact: true }).evaluate(element => (element as HTMLInputElement).focus())
  await expect(page.getByLabel('命令输入', { exact: true })).not.toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(bar).not.toHaveAttribute('inert', '')
  await input(page, '@10,0')
  const doc = await drawing(page)
  expect(doc.entities[0]).toMatchObject({
    a: { x: 13, y: 7 },
    b: { x: 23, y: 7 },
  })
})
