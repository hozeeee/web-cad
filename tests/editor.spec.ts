import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { createDrawing } from '../src/cad/model'
import { convertBytes } from '../src/io/dwg/codec'
import { exportDxf } from '../src/io/dxf'

async function ready(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText('已保存到本地')
}
async function point(page: Page, x: number, y: number) {
  await page.getByLabel('输入 X', { exact: true }).fill(String(x))
  await page.getByLabel('输入 Y', { exact: true }).fill(String(y))
  await page.getByRole('button', { name: '确认坐标点', exact: true }).click()
}
async function line(page: Page) {
  await page.getByRole('button', { name: '直线', exact: true }).click()
  await point(page, 0, 0)
  await point(page, 100, 60)
}
async function dragGrip(page: Page, index: number, dx: number, dy: number, scale = 2) {
  const box = (await page.locator(`[data-grip="${index}"]`).boundingBox())!
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx * scale, start.y - dy * scale, { steps: 5 })
  return start
}
async function dwgDownload(page: Page) {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByRole('button', { name: /DWG · 试用版/ }).click()
  const confirm = page.getByRole('button', { name: '确认导出 DWG', exact: true })
  await expect(confirm).toBeDisabled()
  await expect(page.getByRole('dialog')).toContainText('非无损 DWG 编辑器')
  await page.getByRole('checkbox').check()
  const pending = page.waitForEvent('download')
  await confirm.click()
  const download = await pending
  expect(download.suggestedFilename()).toMatch(/\.dwg$/)
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 6).toString()).toBe('AC1027')
  return bytes
}
async function checkDwg(page: Page, bytes: Buffer) {
  await page.getByTestId('import-file').setInputFiles({ name: '交换.dwg', mimeType: 'application/acad', buffer: bytes })
  const start = page.getByRole('button', { name: '开始检查 DWG', exact: true })
  await expect(start).toBeDisabled()
  await page.getByRole('checkbox').check()
  await start.click()
  await expect(page.getByTestId('cad-import-summary')).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('button', { name: '确认导入为新项目', exact: true })).toBeDisabled()
}
async function jsonDownload(page: Page) {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /项目 JSON/ }).click()
  const download = await pending
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}
async function checkBrandIcon(page: Page, inline = false) {
  const brand = page.locator('img.brand-mark')
  const favicon = page.locator('link[rel="icon"]')
  await expect(brand).toBeVisible()
  await expect.poll(() => brand.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  const src = await brand.evaluate((img: HTMLImageElement) => img.src)
  expect(await favicon.evaluate((link: HTMLLinkElement) => link.href)).toBe(src)
  expect(src).toMatch(inline ? /^data:image\/svg\+xml/ : /\.svg$/)
  expect(await page.evaluate(async (url) => {
    const icon = new Image()
    icon.src = url
    await icon.decode()
    return { width: icon.naturalWidth, height: icon.naturalHeight }
  }, src)).toEqual({ width: 34, height: 34 })
}

for (const target of ['开发服务', '标准构建', '单 HTML 离线']) {
  test(`画布背景可切换且保留默认网格 ${target}`, async ({ page, context }) => {
    if (target === '单 HTML 离线')
      await context.setOffline(true)
    await page.goto(target === '开发服务'
      ? '/'
      : target === '标准构建'
        ? 'http://127.0.0.1:4174/repository/'
        : pathToFileURL(resolve('dist/single/index.html')).href)
    await ready(page)
    const setting = page.getByLabel('画布背景', { exact: true })
    const canvas = page.locator('.canvas')
    const grid = page.getByTestId('canvas-grid')
    const snap = page.getByRole('button', { name: '网格吸附', exact: true })
    await expect(setting).toHaveValue('grid')
    await expect(grid).toBeVisible()
    await expect(canvas).toHaveCSS('background-color', 'rgb(17, 24, 30)')
    await setting.selectOption('white')
    await expect(canvas).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(grid).toHaveCount(0)
    await expect(page.locator('.empty-canvas')).toHaveCSS('background-image', 'none')
    await expect(snap).toHaveAttribute('aria-pressed', 'true')
    await line(page)
    const original = await jsonDownload(page)
    const stroke = page.locator('[data-entity] > line').first()
    await expect(stroke).toHaveCSS('stroke', 'rgb(54, 66, 74)')
    await setting.selectOption('black')
    await expect(canvas).toHaveCSS('background-color', 'rgb(0, 0, 0)')
    await expect(grid).toHaveCount(0)
    await expect(stroke).toHaveCSS('stroke', 'rgb(213, 223, 235)')
    expect(await jsonDownload(page)).toEqual(original)
    await snap.click()
    await expect(snap).toHaveAttribute('aria-pressed', 'false')
    await setting.selectOption('grid')
    await expect(grid).toBeVisible()
    await expect(canvas).toHaveCSS('background-color', 'rgb(17, 24, 30)')
    await expect(snap).toHaveAttribute('aria-pressed', 'false')
    await expect(stroke).toHaveCSS('stroke', 'rgb(213, 223, 235)')
  })
}

test('纯色背景保持黑白图形可见且不修改存储颜色', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  const setting = page.getByLabel('画布背景', { exact: true })
  const color = page.getByLabel('图层颜色 轮廓', { exact: true })
  const stroke = page.locator('[data-entity] > line').first()
  await color.fill('#ffffff')
  const white = await jsonDownload(page)
  await setting.selectOption('white')
  await expect(stroke).toHaveCSS('stroke', 'rgb(54, 66, 74)')
  expect(await jsonDownload(page)).toEqual(white)
  await color.fill('#000000')
  const black = await jsonDownload(page)
  await expect(stroke).toHaveCSS('stroke', 'rgb(0, 0, 0)')
  await setting.selectOption('black')
  await expect(stroke).toHaveCSS('stroke', 'rgb(213, 223, 235)')
  expect(await jsonDownload(page)).toEqual(black)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await setting.selectOption('white')
  await expect(stroke).toHaveCSS('stroke', 'rgb(40, 119, 68)')
})

test('画布背景入口在宽窄屏可用且不挤出保存状态', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  for (const width of [1440, 1000, 801, 800, 640, 375, 320]) {
    await page.setViewportSize({ width, height: 700 })
    const setting = page.getByLabel('画布背景', { exact: true })
    await setting.selectOption('white')
    await expect(setting).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('save-status')).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await expect(page.locator('.canvas')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  }
})

test('顶栏和浏览器标签页共用独立的品牌 SVG', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await checkBrandIcon(page)
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 812 })
    const box = (await page.locator('img.brand-mark').boundingBox())!
    expect(box.width).toBe(width > 460
      ? 34
      : 30)
    expect(box.height).toBe(box.width)
  }
})

test('顶部合并为一行，移除重复提示并适配不同屏宽', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const name = '安装底板 · 长图纸名称响应式布局验证'.repeat(6)
  await page.getByLabel('项目名称').fill(name)
  await page.getByLabel('项目名称').press('Tab')
  await ready(page)
  await expect(page.locator('.document-bar, .local-badge, .privacy-card')).toHaveCount(0)
  await expect(page.getByText('本地优先 · 私密设计')).toHaveCount(0)
  await expect(page.getByText('你的图纸，只属于你。')).toHaveCount(0)

  for (const width of [
    1440,
    1024,
    801,
    800,
    641,
    640,
    461,
    460,
    375,
    320,
  ]) {
    await page.setViewportSize({ width, height: 960 })
    const header = page.locator('.topbar')
    const headerBox = (await header.boundingBox())!
    expect(headerBox.height).toBe(width > 800
      ? 64
      : 54)
    const inputBox = (await header.getByLabel('项目名称').boundingBox())!
    expect(inputBox.width).toBeGreaterThanOrEqual(60)
    expect(inputBox.x).toBeGreaterThanOrEqual(0)

    const sections = await header.evaluate(el => Array.from(el.children)
      .map(child => child.getBoundingClientRect())
      .filter(rect => rect.width > 0)
      .map(rect => ({ x: rect.x, right: rect.right })))
    for (let i = 1; i < sections.length; i++)
      expect(sections[i].x).toBeGreaterThanOrEqual(sections[i - 1].right)
    expect(sections.at(-1)!.right).toBeLessThanOrEqual(width)

    for (const label of ['新建', '导入', '导出', '使用指南', '我的图纸']) {
      const button = header.getByRole('button', { name: label, exact: true })
      await expect(button).toBeVisible()
      const box = (await button.boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(headerBox.y)
      expect(box.y + box.height).toBeLessThanOrEqual(headerBox.y + headerBox.height)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
    const canvasBox = (await page.getByTestId('cad-canvas').boundingBox())!
    expect(canvasBox.y).toBe(headerBox.height + 40)
    await header.getByRole('button', { name: '导出', exact: true }).click()
    const menuBox = (await page.locator('.dropdown-menu').boundingBox())!
    expect(menuBox.x).toBeGreaterThanOrEqual(0)
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width)
    await page.getByRole('button', { name: '关闭导出菜单' }).click({
      position: { x: 1, y: 1 },
    })
  }
  await page.reload()
  await ready(page)
  await expect(page.getByLabel('项目名称')).toHaveValue(name)
})

test('导出菜单各选项纵向对齐、不溢出且 SVG 可点击导出', async ({ page }) => {
  await page.goto('/')
  await ready(page)

  for (const width of [1440, 801, 800, 640, 375, 320]) {
    await page.setViewportSize({ width, height: 960 })
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const menu = page.locator('.dropdown-menu')
    const menuBox = (await menu.boundingBox())!
    expect(menuBox.x).toBeGreaterThanOrEqual(0)
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width)
    await expect(menu.getByRole('button')).toHaveCount(4)

    const items = await menu.getByRole('button').evaluateAll(buttons => buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      const text = button.querySelector('span')!
      const textRect = text.getBoundingClientRect()
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        textRight: textRect.right,
        textFits: text.scrollWidth <= text.clientWidth,
        receivesClick: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
      }
    }))
    let previousBottom = menuBox.y
    for (const item of items) {
      expect(item.x).toBeGreaterThan(menuBox.x)
      expect(item.x).toBeCloseTo(items[0].x, 1)
      expect(item.y).toBeGreaterThanOrEqual(previousBottom)
      expect(item.right).toBeLessThan(menuBox.x + menuBox.width)
      expect(item.bottom).toBeLessThan(menuBox.y + menuBox.height)
      expect(item.textRight).toBeLessThan(item.right)
      expect(item.textFits).toBe(true)
      expect(item.receivesClick).toBe(true)
      previousBottom = item.bottom
    }

    const pending = page.waitForEvent('download')
    await menu.getByRole('button', { name: /矢量 SVG/ }).click()
    const download = await pending
    expect(download.suggestedFilename()).toMatch(/\.svg$/)
    expect(await readFile((await download.path())!, 'utf8')).toContain('<svg')
    await expect(menu).toBeHidden()

    await page.getByRole('button', { name: '导出', exact: true }).click()
    await page.getByRole('button', { name: '关闭导出菜单' }).click({
      position: { x: 1, y: 1 },
    })
    await expect(menu).toBeHidden()
  }
})

test('窄屏顶部的新建、导入、导出与辅助入口可用', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await ready(page)
  const header = page.locator('.topbar')
  await header.getByRole('button', { name: '新建', exact: true }).click()
  await ready(page)
  await header.getByRole('button', { name: '我的图纸', exact: true }).click()
  await expect(page.locator('.project-row')).toHaveCount(2)
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click()
  await header.getByRole('button', { name: '使用指南', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click()
  const doc = await jsonDownload(page)
  const chooser = page.waitForEvent('filechooser')
  await header.getByRole('button', { name: '导入', exact: true }).click()
  await (await chooser).setFiles({
    name: 'drawing.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.getByLabel('项目名称')).toHaveValue(/导入/)
  await ready(page)
  await page.getByRole('button', { name: '切换属性面板' }).click()
  await expect(page.locator('.inspector')).toBeVisible()
  await expect(page.locator('.privacy-card')).toHaveCount(0)
})

for (const width of [1440, 1000, 801, 800, 375]) {
  test(`属性面板按钮可展开收起并同步画布 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/')
    await ready(page)
    const toggle = page.getByRole('button', { name: '切换属性面板', exact: true })
    const inspector = page.locator('#design-panel')
    const canvas = page.getByTestId('cad-canvas')
    const desktop = width > 800
    await expect(toggle).toHaveAttribute('aria-controls', 'design-panel')
    await expect(toggle).toHaveAttribute('aria-expanded', String(desktop))
    if (desktop) {
      await expect(inspector).toBeVisible()
      await line(page)
      await page.getByRole('button', { name: '选择', exact: true }).click()
      await page.keyboard.press('ControlOrMeta+a')
    }
    else {
      await expect(inspector).toBeHidden()
    }
    const beforeWidth = (await canvas.boundingBox())!.width
    const panelWidth = desktop
      ? (await inspector.boundingBox())!.width
      : 0
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', String(!desktop))
    await expect(toggle).toHaveAttribute('title', desktop ? '展开属性面板' : '收起属性面板')
    await expect(toggle.locator(desktop ? '.lucide-panel-right-open' : '.lucide-panel-right-close')).toBeVisible()
    if (desktop)
      await expect(inspector).toBeHidden()
    else
      await expect(inspector).toBeVisible()
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(beforeWidth + panelWidth)

    await toggle.press('Space')
    await expect(toggle).toHaveAttribute('aria-expanded', String(desktop))
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(beforeWidth)
    if (desktop) {
      await expect(inspector).toBeVisible()
      await expect(page.getByLabel('终点 X', { exact: true })).toHaveValue('100')
      await expect(page.locator('[data-entity]')).toHaveCount(1)
    }
    else {
      await expect(inspector).toBeHidden()
    }
    await expect(page.getByTestId('save-status')).toBeInViewport({ ratio: 1 })
  })
}

test('跨越窄屏断点时同步面板默认状态，同一布局内保留切换选择', async ({ page }) => {
  await page.setViewportSize({ width: 801, height: 700 })
  await page.goto('/')
  await ready(page)
  const toggle = page.getByRole('button', { name: '切换属性面板', exact: true })
  const inspector = page.locator('#design-panel')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await page.setViewportSize({ width: 1440, height: 700 })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(inspector).toBeHidden()
  await page.setViewportSize({ width: 800, height: 700 })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(inspector).toBeHidden()
  await toggle.click()
  await page.setViewportSize({ width: 799, height: 700 })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(inspector).toBeVisible()
  await page.setViewportSize({ width: 801, height: 700 })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(inspector).toBeVisible()
  await page.setViewportSize({ width: 800, height: 700 })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(inspector).toBeHidden()
  await page.setViewportSize({ width: 801, height: 700 })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(inspector).toBeVisible()
})

for (const viewport of [
  { width: 1440, height: 700 },
  { width: 1440, height: 480 },
  { width: 1440, height: 400 },
  { width: 1440, height: 320 },
  { width: 375, height: 400 },
  { width: 640, height: 320 },
]) {
  test(`面板独立滚动且底栏完整可见 ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await line(page)
    await page.getByRole('button', { name: '选择', exact: true }).click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.setViewportSize(viewport)
    if (viewport.width <= 800)
      await page.getByRole('button', { name: '切换属性面板' }).click()
    const inspector = page.locator('.inspector-scroll')
    const rail = page.getByRole('complementary', { name: '绘图工具' })
    const footer = page.getByRole('contentinfo')

    const expectLayoutFits = async () => {
      const footerBox = (await footer.boundingBox())!
      expect(footerBox.y + footerBox.height).toBeCloseTo(viewport.height, 0)
      const commandBar = page.getByRole('region', { name: '命令栏', exact: true })
      const commandBox = (await commandBar.boundingBox())!
      expect(commandBox.y + commandBox.height).toBeCloseTo(footerBox.y, 0)
      const canvasBox = (await page.getByTestId('cad-canvas').boundingBox())!
      expect(canvasBox.y + canvasBox.height).toBeCloseTo(commandBox.y, 0)
      expect(canvasBox.height).toBeGreaterThan(60)
      const inspectorBox = (await inspector.boundingBox())!
      expect(inspectorBox.y + inspectorBox.height).toBeLessThanOrEqual(commandBox.y + 1)
      await expect(page.getByLabel('命令输入', { exact: true })).toBeInViewport({ ratio: 1 })
      await expect(commandBar.getByRole('button', { name: '取消', exact: true })).toBeInViewport({ ratio: 1 })
      const documentSize = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        scrollY,
        shellScrollTop: document.querySelector('.app-shell')!.scrollTop,
        workScrollTop: document.querySelector('.work-area')!.scrollTop,
      }))
      expect(documentSize.height).toBeLessThanOrEqual(viewport.height)
      expect(documentSize.scrollY).toBe(0)
      expect(documentSize.shellScrollTop).toBe(0)
      expect(documentSize.workScrollTop).toBe(0)
      await expect(page.getByTestId('save-status')).toBeInViewport({ ratio: 1 })
    }
    await expectLayoutFits()

    const inspectorBox = (await inspector.boundingBox())!
    await page.mouse.move(inspectorBox.x + 20, inspectorBox.y + inspectorBox.height / 2)
    await page.mouse.wheel(0, 4000)
    await expect.poll(() => inspector.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    await page.getByLabel('终点 Y', { exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByLabel('终点 Y', { exact: true })).toBeInViewport({ ratio: 1 })
    await page.getByRole('button', { name: '删除图形', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '删除图形', exact: true })).toBeInViewport({ ratio: 1 })
    const inspectorScrollTop = await inspector.evaluate(el => el.scrollTop)
    expect(await rail.evaluate(el => el.scrollTop)).toBe(0)

    const railBox = (await rail.boundingBox())!
    await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2)
    await page.mouse.wheel(0, 4000)
    await expect.poll(() => rail.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    await rail.getByRole('button', { name: '修剪', exact: true }).scrollIntoViewIfNeeded()
    await expect(rail.getByRole('button', { name: '修剪', exact: true })).toBeInViewport({ ratio: 1 })
    await page.locator('.rail-footer').scrollIntoViewIfNeeded()
    await expect(page.locator('.rail-footer')).toBeInViewport({ ratio: 1 })
    expect(await inspector.evaluate(el => el.scrollTop)).toBe(inspectorScrollTop)
    await expectLayoutFits()

    await page.mouse.wheel(0, 4000)
    await page.getByRole('button', { name: '网格吸附', exact: true }).click()
    await expect(page.getByRole('button', { name: '网格吸附', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.getByLabel('终点 Y', { exact: true }).fill('-110')
    await page.getByLabel('终点 Y', { exact: true }).press('Enter')
    await ready(page)
    await expectLayoutFits()
    expect((await jsonDownload(page)).entities[0].b.y).toBe(-110)
  })
}

test('夹点拖拽实时拉伸直线并同步属性，一次撤销重做且刷新恢复', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await ready(page)
  const original = await jsonDownload(page)
  await dragGrip(page, 0, -20, 30)
  await expect(page.getByLabel('起点 X', { exact: true })).toHaveValue('-20')
  await expect(page.getByLabel('起点 Y', { exact: true })).toHaveValue('30')
  await expect(page.getByLabel('终点 X', { exact: true })).toHaveValue('100')
  await expect(page.locator('[data-entity] > line')).toHaveAttribute('x1', '-20')
  await expect(page.getByTestId('save-status')).toHaveText('已保存到本地')
  await page.mouse.up()
  await ready(page)
  const edited = await jsonDownload(page)
  expect(edited.entities[0]).toMatchObject({
    a: { x: -20, y: 30 },
    b: { x: 100, y: 60 },
  })
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  expect((await jsonDownload(page)).entities).toEqual(original.entities)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await ready(page)
  expect((await jsonDownload(page)).entities).toEqual(edited.entities)
  await page.reload()
  await ready(page)
  expect((await jsonDownload(page)).entities).toEqual(edited.entities)
})

test('夹点编辑支持折线顶点、边中点以及圆半径的实时属性', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '折线', exact: true }).click()
  await point(page, 0, 0)
  await point(page, 100, 0)
  await point(page, 100, 60)
  await page.getByRole('button', { name: '完成折线 · Enter', exact: true }).click()
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await dragGrip(page, 1, 20, 30)
  await expect(page.getByLabel('点 2 X', { exact: true })).toHaveValue('120')
  await expect(page.getByLabel('点 2 Y', { exact: true })).toHaveValue('30')
  await expect(page.getByLabel('点 1 X', { exact: true })).toHaveValue('0')
  await expect(page.getByLabel('点 3 X', { exact: true })).toHaveValue('100')
  await page.mouse.up()
  await page.getByRole('button', { name: '网格吸附', exact: true }).click()
  await dragGrip(page, 2, 0, -20)
  await expect(page.getByLabel('点 1 Y', { exact: true })).toHaveValue('-20')
  await expect(page.getByLabel('点 2 Y', { exact: true })).toHaveValue('10')
  await expect(page.getByLabel('点 3 Y', { exact: true })).toHaveValue('60')
  await page.mouse.up()
  expect((await jsonDownload(page)).entities[0].points).toEqual([
    { x: 0, y: -20 },
    { x: 120, y: 10 },
    { x: 100, y: 60 },
  ])
  await page.getByRole('button', { name: '圆', exact: true }).click()
  await point(page, -100, 0)
  await point(page, -70, 0)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  const canvas = (await page.getByTestId('cad-canvas').boundingBox())!
  await page.mouse.click(canvas.x + canvas.width / 2 - 140, canvas.y + canvas.height / 2)
  await dragGrip(page, 1, 20, 0)
  await expect(page.getByLabel('半径', { exact: true })).toHaveValue('50')
  await expect(page.getByLabel('圆心 X', { exact: true })).toHaveValue('-100')
  await page.mouse.up()
  expect((await jsonDownload(page)).entities[1].radius).toBe(50)
})

for (const cancel of [
  'Esc',
  'Esc-input',
  'pointercancel',
  'capture-loss',
  'blur',
]) {
  test(`夹点编辑 ${cancel} 取消预览，松开不修改原图`, async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await line(page)
    await page.getByRole('button', { name: '选择', exact: true }).click()
    await page.keyboard.press('ControlOrMeta+a')
    await ready(page)
    const original = await jsonDownload(page)
    if (cancel === 'Esc-input')
      await page.getByLabel('起点 X', { exact: true }).focus()
    await dragGrip(page, 0, -20, 30)
    await expect(page.getByLabel('起点 X', { exact: true })).toHaveValue('-20')
    if (cancel.startsWith('Esc')) {
      await page.keyboard.press('Escape')
    }
    else if (cancel === 'pointercancel') {
      await page.getByTestId('cad-canvas').dispatchEvent('pointercancel', { pointerId: 1 })
    }
    else if (cancel === 'capture-loss') {
      await page.getByTestId('cad-canvas').evaluate(el => el.releasePointerCapture(1))
      await page.mouse.move(500, 400)
    }
    else {
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    }
    await expect(page.locator('[data-entity] > line')).toHaveAttribute('x1', '0')
    await page.mouse.up()
    expect((await jsonDownload(page)).entities).toEqual(original.entities)
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(page.locator('[data-entity]')).toHaveCount(0)
  })
}

test('夹点吸附遵循网格、对象和正交设置，缩放后坐标仍准确', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await dragGrip(page, 1, 23, 17)
  await expect(page.getByLabel('终点 X', { exact: true })).toHaveValue('120')
  await expect(page.getByLabel('终点 Y', { exact: true })).toHaveValue('80')
  await page.mouse.up()
  await page.getByRole('button', { name: '网格吸附', exact: true }).click()
  await page.getByRole('button', { name: '正交', exact: true }).click()
  await page.getByRole('button', { name: '放大', exact: true }).click()
  const zoomed = await jsonDownload(page)
  await dragGrip(page, 1, 20, 5, zoomed.view.scale)
  await expect(page.getByLabel('终点 X', { exact: true })).toHaveValue('140')
  await expect(page.getByLabel('终点 Y', { exact: true })).toHaveValue('80')
  await page.mouse.up()
  await page.getByRole('button', { name: '正交', exact: true }).click()
  await line(page)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  const box = (await page.getByTestId('cad-canvas').boundingBox())!
  // 绘图命令清除预选，点击未被新直线覆盖的原直线端点，明确选择待编辑对象。
  await page.mouse.click(box.x + box.width / 2 + 140 * zoomed.view.scale, box.y + box.height / 2 - 80 * zoomed.view.scale)
  await expect(page.getByLabel('终点 X', { exact: true })).toHaveValue('140')
  await expect(page.getByLabel('终点 Y', { exact: true })).toHaveValue('80')
  await dragGrip(page, 1, -39, -19, zoomed.view.scale)
  await expect(page.getByLabel('终点 X', { exact: true })).toHaveValue('100')
  await expect(page.getByLabel('终点 Y', { exact: true })).toHaveValue('60')
  await page.mouse.up()
})

test('夹点优先命中，不被重叠图形覆盖；锁定图层不显示夹点', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const drawing = createDrawing()
  const base = { layerId: drawing.layers[0].id, strokeWidth: 0.5 }
  drawing.entities = [
    {
      ...base,
      id: 'line',
      type: 'line',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 60 },
    },
    {
      ...base,
      id: 'rect',
      type: 'rectangle',
      a: { x: 0, y: 0 },
      b: { x: 200, y: 100 },
    },
  ]
  await page.getByTestId('import-file').setInputFiles({
    name: '夹点.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(drawing)),
  })
  await ready(page)
  const imported = await jsonDownload(page)
  const box = (await page.getByTestId('cad-canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2 + 120, box.y + box.height / 2 - 72)
  await dragGrip(page, 0, -20, 30)
  await expect(page.getByLabel('起点 X', { exact: true })).toHaveValue('-20')
  await page.mouse.up()
  const edited = await jsonDownload(page)
  expect(edited.entities[1]).toEqual(imported.entities[1])
  await page.getByRole('button', { name: '锁定图层 轮廓', exact: true }).click()
  await expect(page.locator('[data-grip]')).toHaveCount(0)
})

test('绘制、属性编辑、撤销重做和刷新恢复', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  await expect(page.locator('[data-entity]')).toHaveCount(1)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('[data-entity]')).toHaveCount(0)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.locator('[data-entity]')).toHaveCount(1)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  const rect = await page.getByTestId('cad-canvas').boundingBox()
  await page.mouse.click(
    rect!.x + rect!.width / 2 + 100,
    rect!.y + rect!.height / 2 - 60,
  )
  await expect(page.getByLabel('终点 X', { exact: true })).toBeVisible()
  await page.getByLabel('终点 X', { exact: true }).fill('120')
  await page.getByLabel('终点 X', { exact: true }).press('Enter')
  await ready(page)
  await page.reload()
  await ready(page)
  expect((await jsonDownload(page)).entities[0].b.x).toBe(120)
})
test('JSON 导入不覆盖原项目，SVG 可导出', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  const original = await jsonDownload(page)
  await page.getByTestId('import-file').setInputFiles({
    name: 'drawing.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(original)),
  })
  await expect(page.getByLabel('项目名称')).toHaveValue(/导入/)
  await ready(page)
  const imported = await jsonDownload(page)
  expect(imported.id).not.toBe(original.id)
  expect(imported.entities[0].b).toEqual(original.entities[0].b)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /矢量 SVG/ }).click()
  expect((await pending).suggestedFilename()).toMatch(/\.svg$/)
  await page.getByRole('button', { name: '我的图纸' }).click()
  await expect(page.locator('.project-row')).toHaveCount(2)
})
test('锁定图层禁止选择与绘图，非法导入不改变图纸', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  await page.getByRole('button', { name: '锁定图层 轮廓', exact: true }).click()
  await line(page)
  await expect(page.locator('[data-entity]')).toHaveCount(1)
  await expect(page.locator('.tool-hint')).toContainText('锁定')
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await expect(
    page.locator('.section-count').filter({ hasText: '未选择' }),
  ).toBeVisible()
  await page.getByTestId('import-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  })
  await expect(page.getByRole('alert')).toContainText('不合法')
  await expect(page.locator('[data-entity]')).toHaveCount(1)
})
test('鼠标绘制、平移缩放与尺寸标注', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '矩形', exact: true }).click()
  const box = await page.getByTestId('cad-canvas').boundingBox()
  await page.mouse.click(box!.x + 200, box!.y + 200)
  await page.mouse.click(box!.x + 420, box!.y + 350)
  await expect(page.locator('[data-type="rectangle"]')).toHaveCount(1)
  const initial = await jsonDownload(page)
  await page.mouse.move(box!.x + 300, box!.y + 200)
  await page.mouse.wheel(0, -250)
  await expect
    .poll(async () => (await jsonDownload(page)).view.scale)
    .toBeGreaterThan(initial.view.scale)
  const zoomed = await jsonDownload(page)
  await page.mouse.move(box!.x + 300, box!.y + 200)
  await page.keyboard.down('Space')
  await page.mouse.down()
  await page.mouse.move(box!.x + 360, box!.y + 240, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  const panned = await jsonDownload(page)
  expect(panned.view.x).toBeCloseTo(zoomed.view.x - 60 / zoomed.view.scale)
  expect(panned.view.y).toBeCloseTo(zoomed.view.y + 40 / zoomed.view.scale)
  await page.getByRole('button', { name: '尺寸标注', exact: true }).click()
  await point(page, 0, 0)
  await point(page, 100, 0)
  await point(page, 50, -20)
  await expect(page.locator('[data-type="dimension"]')).toHaveCount(1)
  await page.getByRole('button', { name: '适配全部图形' }).click()
  await ready(page)
})
test('移动、复制、旋转和镜像使用精确坐标', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await point(page, 0, 0)
  await point(page, 20, 10)
  expect((await jsonDownload(page)).entities[0]).toMatchObject({
    a: { x: 20, y: 10 },
    b: { x: 120, y: 70 },
  })
  await page.getByRole('button', { name: '复制', exact: true }).click()
  await point(page, 0, 0)
  await point(page, 200, 0)
  await expect(page.locator('[data-entity]')).toHaveCount(2)
  await page.getByRole('button', { name: '旋转', exact: true }).click()
  await page.getByLabel('旋转角度°', { exact: true }).fill('90')
  await page.getByLabel('旋转角度°', { exact: true }).press('Enter')
  await point(page, 0, 0)
  await page.getByRole('button', { name: '确认旋转', exact: true }).click()
  const rotated = (await jsonDownload(page)).entities[0]
  expect(rotated.a.x).toBeCloseTo(-10)
  expect(rotated.a.y).toBeCloseTo(20)
  await page.getByRole('button', { name: '镜像', exact: true }).click()
  await point(page, 0, 0)
  await point(page, 100, 0)
  expect((await jsonDownload(page)).entities[0].a.y).toBeCloseTo(-20)
})
test('折线、三点圆弧和文字可绘制并更新属性', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '折线', exact: true }).click()
  await point(page, 0, 0)
  await point(page, 30, 0)
  await point(page, 30, 20)
  await page.getByRole('button', { name: '完成折线 · Enter', exact: true }).click()
  await expect(page.locator('[data-type="polyline"]')).toHaveCount(1)
  await page.getByRole('button', { name: '三点圆弧', exact: true }).click()
  await point(page, 100, 0)
  await point(page, 50, 50)
  await point(page, 0, 0)
  await expect(page.locator('[data-type="arc"]')).toHaveCount(1)
  await page.getByRole('button', { name: '文字', exact: true }).click()
  await page.getByLabel('插入文字', { exact: true }).fill('测试文字')
  await point(page, 50, -40)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.locator('[data-type="text"]').click()
  await page.getByLabel('文字内容', { exact: true }).fill('已修改')
  await page.getByLabel('文字内容', { exact: true }).press('Tab')
  await expect(page.locator('[data-type="text"]')).toContainText('已修改')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.locator('[data-type="text"]').click()
  await expect(page.getByLabel('文字内容', { exact: true })).toHaveValue(
    '测试文字',
  )
})
for (const target of ['开发服务', '标准构建', '单 HTML 离线']) {
  test(`文字属性回车立即同步画布且一次撤销恢复 ${target}`, async ({ page, context }) => {
    if (target === '单 HTML 离线')
      await context.setOffline(true)
    await page.goto(target === '开发服务'
      ? '/'
      : target === '标准构建'
        ? 'http://127.0.0.1:4174/repository/'
        : pathToFileURL(resolve('dist/single/index.html')).href)
    await ready(page)
    await page.getByRole('button', { name: '文字', exact: true }).click()
    await page.getByLabel('插入文字', { exact: true }).fill('页头')
    await point(page, 0, 0)
    await page.getByRole('button', { name: '选择', exact: true }).click()
    const shape = page.locator('[data-type="text"]')
    const rendered = shape.locator('text').first()
    await shape.click()
    const content = page.getByLabel('文字内容', { exact: true })
    await content.fill('页头123')
    await expect(rendered).toHaveText('页头')
    await content.press('Enter')
    await expect(rendered).toHaveText('页头123')

    // 未修改的失焦不应追加历史，撤销应直接恢复编辑前的文字。
    await content.focus()
    await content.press('Tab')
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(rendered).toHaveText('页头')
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(rendered).toHaveText('页头123')
    await ready(page)
    await page.reload()
    await ready(page)
    await expect(rendered).toHaveText('页头123')
  })
}

test('文字属性空白输入回退，失焦保存仍可一次撤销', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '文字', exact: true }).click()
  await page.getByLabel('插入文字', { exact: true }).fill('页头')
  await point(page, 0, 0)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  const shape = page.locator('[data-type="text"]')
  const rendered = shape.locator('text').first()
  await shape.click()
  const content = page.getByLabel('文字内容', { exact: true })
  await content.fill('失焦修改')
  await content.press('Tab')
  await expect(rendered).toHaveText('失焦修改')
  for (const key of ['Enter', 'Tab']) {
    await content.fill('   ')
    await content.press(key)
    await expect(content).toHaveValue('失焦修改')
    await expect(rendered).toHaveText('失焦修改')
  }
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rendered).toHaveText('页头')
})

for (const ime of [
  { isComposing: true, keyCode: 13 },
  { isComposing: false, keyCode: 229 },
]) {
  test(`属性输入法选词回车不提交 ${JSON.stringify(ime)}`, async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: '文字', exact: true }).click()
    await page.getByLabel('插入文字', { exact: true }).fill('页头')
    await point(page, 0, 0)
    await page.getByRole('button', { name: '选择', exact: true }).click()
    const shape = page.locator('[data-type="text"]')
    const rendered = shape.locator('text').first()
    await shape.click()
    const content = page.getByLabel('文字内容', { exact: true })
    await content.fill('中文选词')
    // 模拟组合输入及 Safari 候选确认的 keyCode 229。
    await content.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ...ime })
    await expect(content).toBeFocused()
    await expect(rendered).toHaveText('页头')
    await content.press('Enter')
    await expect(rendered).toHaveText('中文选词')

    const size = page.getByLabel('文字高度', { exact: true })
    await size.fill('16')
    await size.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ...ime })
    await expect(size).toBeFocused()
    await expect(rendered).toHaveAttribute('font-size', '8')
    await size.press('Enter')
    await expect(rendered).toHaveAttribute('font-size', '16')
  })
}

test('数值属性回车立即更新，非法值与未修改失焦不追加历史', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  const rendered = page.locator('[data-entity] > line').first()
  const x = page.getByLabel('终点 X', { exact: true })
  await x.fill('120')
  await expect(rendered).toHaveAttribute('x2', '100')
  await x.press('Enter')
  await expect(rendered).toHaveAttribute('x2', '120')
  await x.focus()
  await x.press('Tab')
  const width = page.getByLabel('线宽', { exact: true })
  const original = await width.inputValue()
  for (const value of ['', '-1', '101']) {
    await width.fill(value)
    await width.press('Enter')
    await expect(width).toHaveValue(original)
  }
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rendered).toHaveAttribute('x2', '100')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(rendered).toHaveAttribute('x2', '120')
})

test('圆修剪为圆弧，完整操作一次撤销', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: '圆', exact: true }).click()
  await point(page, 0, 0)
  await point(page, 50, 0)
  await page.getByRole('button', { name: '直线', exact: true }).click()
  await point(page, 0, -100)
  await point(page, 0, 100)
  await page.getByRole('button', { name: '修剪', exact: true }).click()
  const box = await page.getByTestId('cad-canvas').boundingBox()
  await page.mouse.click(
    box!.x + box!.width / 2 + 100,
    box!.y + box!.height / 2,
  )
  await expect(page.locator('[data-type="circle"]')).toHaveCount(0)
  await expect(page.locator('[data-type="arc"]')).toHaveCount(1)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('[data-type="circle"]')).toHaveCount(1)
  await expect(page.locator('[data-type="arc"]')).toHaveCount(0)
})
test('复制项目、批量备份导入和最近项目刷新恢复', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  await page.getByRole('button', { name: '我的图纸' }).click()
  await page.getByRole('button', { name: '复制当前图纸' }).click()
  await expect(page.getByLabel('项目名称')).toHaveValue(/副本/)
  await ready(page)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /全部图纸备份/ }).click()
  const backup = await readFile((await (await pending).path())!, 'utf8')
  expect(JSON.parse(backup).projects).toHaveLength(2)
  await page.getByTestId('import-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  })
  await expect(page.getByLabel('项目名称')).toHaveValue(/导入/)
  await ready(page)
  const imported = await jsonDownload(page)
  await page.reload()
  await ready(page)
  expect((await jsonDownload(page)).id).toBe(imported.id)
  await page.getByRole('button', { name: '我的图纸' }).click()
  await expect(page.locator('.project-row')).toHaveCount(4)
})
test('IndexedDB 不可用时显示临时模式，依然可导出', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new Error('不可用')
      },
    })
  })
  await page.goto('/')
  await expect(page.getByTestId('save-status')).toContainText('临时编辑')
  await expect(page.getByRole('alert')).toContainText('IndexedDB 不可用')
  await line(page)
  expect((await jsonDownload(page)).entities).toHaveLength(1)
})
test('保存失败明确提示，导出和重试仍可使用', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    window.addEventListener(
      'restore-storage',
      () => {
        IDBObjectStore.prototype.put = original
      },
      { once: true },
    )
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('测试额度不足', 'QuotaExceededError')
    }
  })
  await line(page)
  await expect(page.getByTestId('save-status')).toContainText('保存失败')
  await expect(page.getByRole('alert')).toContainText('本地保存失败')
  expect((await jsonDownload(page)).entities).toHaveLength(1)
  await page.evaluate(() => window.dispatchEvent(new Event('restore-storage')))
  await page.getByTestId('save-status').click()
  await ready(page)
  await page.reload()
  await ready(page)
  await expect(page.locator('[data-entity]')).toHaveCount(1)
})
test('普通构建在仓库子路径可加载', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:4174/repository/')
  await ready(page)
  await checkBrandIcon(page)
  await line(page)
  await expect(page.locator('[data-entity]')).toHaveCount(1)
  expect(errors).toEqual([])
})
test('单 HTML 仅有一个文件，file:// 离线绘图、保存与导入导出', async ({
  page,
  context,
}) => {
  expect(await readdir(resolve('dist/single'))).toEqual(['index.html'])
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()))
      requests.push(r.url())
  })
  page.on('pageerror', e => errors.push(e.message))
  await context.setOffline(true)
  await page.goto(pathToFileURL(resolve('dist/single/index.html')).href)
  await expect(page.getByTestId('cad-canvas')).toBeVisible()
  await expect(
    page.locator('script[src], link[rel="stylesheet"][href]'),
  ).toHaveCount(0)
  await ready(page)
  await checkBrandIcon(page, true)
  await line(page)
  const doc = await jsonDownload(page)
  expect(doc.entities).toHaveLength(1)
  await ready(page)
  await page.reload()
  await ready(page)
  await expect(page.locator('[data-entity]')).toHaveCount(1)
  await page.getByTestId('import-file').setInputFiles({
    name: 'offline.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.getByLabel('项目名称')).toHaveValue(/导入/)
  await expect(page.locator('[data-entity]')).toHaveCount(1)
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})

for (const offline of [false, true]) {
  test(`DWG 风险确认、检查取消与真实往返 ${offline ? '单 HTML 离线' : '标准构建'}`, async ({ page, context }) => {
    const requests: string[] = []
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    if (offline) {
      await context.setOffline(true)
      page.on('request', r => /^https?:/.test(r.url()) && requests.push(r.url()))
    }
    await page.goto(offline
      ? pathToFileURL(resolve('dist/single/index.html')).href
      : 'http://127.0.0.1:4174/repository/')
    await ready(page)
    await line(page)
    const original = await jsonDownload(page)
    const bytes = await dwgDownload(page)
    await checkDwg(page, bytes)
    await expect(page.getByTestId('cad-import-summary')).toContainText('可导入 1 个')
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    expect((await jsonDownload(page)).id).toBe(original.id)
    await checkDwg(page, bytes)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '确认导入为新项目', exact: true }).click()
    await expect(page.getByLabel('项目名称')).toHaveValue(/导入/)
    await ready(page)
    const imported = await jsonDownload(page)
    expect(imported.id).not.toBe(original.id)
    expect(imported.entities).toHaveLength(1)
    expect(imported.entities[0]).toMatchObject({
      type: 'line',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 60 },
    })
    expect(imported.view).toMatchObject({ x: 50, y: 30 })
    await page.getByRole('button', { name: '我的图纸', exact: true }).click()
    await expect(page.locator('.project-row')).toHaveCount(2)
    await page.getByRole('button', { name: '关闭对话框', exact: true }).click()
    await page.getByRole('button', { name: '使用指南', exact: true }).click()
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 DWG 桥接源码与重建说明', exact: true }).click()
    expect(await readFile((await (await pending).path())!, 'utf8')).toContain('pub extern "C" fn run')
    expect(requests).toEqual([])
    expect(errors).toEqual([])
  })
}

test('真实 DWG 部分导入列出跳过项，取消前后均不创建项目', async ({ page }) => {
  const doc = createDrawing('部分图纸')
  doc.entities = [
    {
      id: 'line',
      layerId: doc.layers[0].id,
      strokeWidth: 0.25,
      type: 'line',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 60 },
    },
  ]
  const end = '0\nENDSEC\n0\nEOF\n'
  const dxf = exportDxf(doc).content.replace(end, `0\nCIRCLE\n8\n${doc.layers[0].name}\n10\n5\n20\n5\n30\n10\n40\n3\n${end}`)
  const wasm = new Uint8Array(await readFile(resolve('src/io/dwg/webcad-dwg.wasm')))
  const bytes = Buffer.from(await convertBytes(wasm, new TextEncoder().encode(dxf), 1))
  await page.goto('/')
  await ready(page)
  const original = await jsonDownload(page)
  await page.getByTestId('import-file').setInputFiles({ name: '部分.dwg', mimeType: 'application/acad', buffer: bytes })
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  expect((await jsonDownload(page)).id).toBe(original.id)
  await checkDwg(page, bytes)
  await expect(page.getByTestId('cad-import-summary')).toContainText('可导入 1 个，已识别跳过 1 个')
  await expect(page.getByLabel('DWG 跳过内容', { exact: true })).toContainText('CIRCLE（非 XY 平面或有厚度）')
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  expect((await jsonDownload(page)).id).toBe(original.id)
  await page.getByRole('button', { name: '我的图纸', exact: true }).click()
  await expect(page.locator('.project-row')).toHaveCount(1)
})

test('损坏 DWG 提示失败且不改变当前图纸', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await line(page)
  const original = await jsonDownload(page)
  await page.getByTestId('import-file').setInputFiles({
    name: '坏图.dwg',
    mimeType: 'application/acad',
    buffer: Buffer.from('AC1027坏文件'),
  })
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: '开始检查 DWG', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('DWG 转换失败')
  expect((await jsonDownload(page)).id).toBe(original.id)
  await expect(page.locator('[data-entity]')).toHaveCount(1)
})

test('DWG 后台转换可取消，超时释放 Worker 且不下载', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      postMessage() {}
      terminate() {
        super.terminate()
        document.documentElement.dataset.terminated = String(Number(document.documentElement.dataset.terminated ?? 0) + 1)
      }
    }
  })
  await page.goto('/')
  await ready(page)
  await line(page)
  const downloads: string[] = []
  page.on('download', d => downloads.push(d.suggestedFilename()))
  const start = async () => {
    await page.getByRole('button', { name: '导出', exact: true }).click()
    await page.getByRole('button', { name: /DWG · 试用版/ }).click()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '确认导出 DWG', exact: true }).click()
    await expect(page.getByRole('button', { name: '取消 DWG 转换', exact: true })).toBeEnabled()
  }
  await start()
  await page.getByRole('button', { name: '取消 DWG 转换', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-terminated', '1')
  // 模拟切换标签页触发自动保存，取消提示必须在保存完成后仍然可见。
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    if (descriptor)
      Object.defineProperty(document, 'visibilityState', descriptor)
    else Reflect.deleteProperty(document, 'visibilityState')
  })
  await ready(page)
  await expect(page.getByRole('alert')).toContainText('已取消')
  await page.clock.install()
  await start()
  await page.clock.fastForward(30001)
  await expect(page.getByRole('alert')).toContainText('超过 30 秒')
  await expect(page.locator('html')).toHaveAttribute('data-terminated', '2')
  await expect(page.locator('[data-entity]')).toHaveCount(1)
  expect(downloads).toEqual([])
})
