import { beforeEach, describe, expect, it } from 'vitest'
import { add, transform } from '../../cad/geometry'
import { createDrawing, uid } from '../../cad/model'
import { useEditor } from './store'

beforeEach(() => {
  useEditor.setState(useEditor.getInitialState(), true)
  useEditor.getState().load(createDrawing())
})
function drawLine() {
  useEditor.getState().setTool('line')
  useEditor.getState().place({ x: 0, y: 0 })
  useEditor.getState().place({ x: 20, y: 10 })
}
describe('画布背景', () => {
  it('默认保留网格背景', () => {
    expect(useEditor.getState().background).toBe('grid')
  })
  it.each(['grid', 'white', 'black'] as const)('切换到 %s 不改变图纸、历史或吸附设置', (background) => {
    drawLine()
    const before = useEditor.getState()
    useEditor.setState({ background })
    const after = useEditor.getState()
    expect(after.background).toBe(background)
    expect(after.doc).toBe(before.doc)
    expect(after.history).toBe(before.history)
    expect(after.future).toBe(before.future)
    expect(after.revision).toBe(before.revision)
    expect(after.grid).toBe(before.grid)
    expect(after.objects).toBe(before.objects)
    expect(after.ortho).toBe(before.ortho)
    expect(after.gridStep).toBe(before.gridStep)
    after.undo()
    expect(useEditor.getState().background).toBe(background)
    expect(useEditor.getState().doc!.entities).toHaveLength(0)
    after.load(createDrawing())
    expect(useEditor.getState().background).toBe(background)
  })
})

describe('夹点编辑状态', () => {
  function prepare() {
    drawLine()
    const s = useEditor.getState()
    s.setTool('select')
    const id = s.doc!.entities[0].id
    useEditor.setState({
      selected: [id],
    })
    return id
  }
  it('多次预览不改变文档、历史、重做或保存版本，松开仅提交一次', () => {
    const id = prepare()
    const before = useEditor.getState()
    expect(before.beginGrip(id, 0)).toBe(true)
    before.previewGrip({ x: -10, y: 5 })
    before.previewGrip({ x: -20, y: 15 })
    const preview = useEditor.getState()
    expect(preview.gripEdit!.preview).toMatchObject({
      a: { x: -20, y: 15 },
      b: { x: 20, y: 10 },
    })
    expect(preview.doc).toBe(before.doc)
    expect(preview.history).toBe(before.history)
    expect(preview.future).toBe(before.future)
    expect(preview.revision).toBe(before.revision)
    preview.finishGrip()
    const after = useEditor.getState()
    expect(after.gripEdit).toBeNull()
    expect(after.history).toHaveLength(before.history.length + 1)
    expect(after.revision).toBe(before.revision + 1)
    expect(after.doc!.entities[0]).toMatchObject({
      a: { x: -20, y: 15 },
    })
    after.undo()
    expect(useEditor.getState().doc!.entities).toEqual(before.doc!.entities)
    after.redo()
    expect(useEditor.getState().doc!.entities).toEqual(after.doc!.entities)
  })
  it('取消、单击或拖回原处均不增加历史，保留重做栈', () => {
    const id = prepare()
    useEditor.getState().commit(d => ({ ...d, name: '重命名' }))
    useEditor.getState().undo()
    useEditor.setState({
      selected: [id],
    })
    const before = useEditor.getState()
    before.beginGrip(id, 0)
    before.previewGrip({ x: -20, y: 10 })
    useEditor.setState({ snapOverride: 'endpoint' })
    before.cancelGrip()
    expect(useEditor.getState().snapOverride).toBeNull()
    before.finishGrip()
    before.beginGrip(id, 0)
    before.finishGrip()
    before.beginGrip(id, 0)
    before.previewGrip({ x: -20, y: 10 })
    before.previewGrip({ x: 0, y: 0 })
    before.finishGrip()
    expect(useEditor.getState().doc).toBe(before.doc)
    expect(useEditor.getState().history).toBe(before.history)
    expect(useEditor.getState().future).toBe(before.future)
  })
  it.each([
    'locked',
    'hidden',
    'unselected',
    'wrong-tool',
    'invalid-index',
  ] as const)('拒绝不允许的夹点编辑：%s', (reason) => {
    const id = prepare()
    if (reason === 'locked' || reason === 'hidden') {
      useEditor.getState().commit(d => ({
        ...d,
        layers: d.layers.map(l => ({ ...l, locked: reason === 'locked', visible: reason !== 'hidden' })),
      }))
    }
    if (reason === 'unselected')
      useEditor.setState({ selected: [] })
    if (reason === 'wrong-tool')
      useEditor.getState().setTool('line')
    const before = useEditor.getState()
    expect(before.beginGrip(id, reason === 'invalid-index'
      ? 99
      : 0)).toBe(false)
    before.previewGrip({ x: -20, y: 10 })
    before.finishGrip()
    expect(useEditor.getState().doc).toBe(before.doc)
    expect(useEditor.getState().history).toBe(before.history)
  })
  it.each([
    { x: Number.NaN, y: 0 },
    { x: 1e10, y: 0 },
    { x: 20, y: 10 },
  ])('无效或退化位置不进入预览或历史：%o', (point) => {
    const id = prepare()
    const before = useEditor.getState()
    before.beginGrip(id, 0)
    before.previewGrip({ x: -10, y: 0 })
    before.previewGrip(point)
    expect(useEditor.getState().gripEdit!.preview).toBe(before.doc!.entities[0])
    expect(useEditor.getState().message).toContain('无效')
    before.finishGrip()
    expect(useEditor.getState().doc).toBe(before.doc)
    expect(useEditor.getState().history).toBe(before.history)
  })
  it.each([
    'load',
    'tool',
    'commit',
    'undo',
    'redo',
  ] as const)('其他命令取消预览，后续松开不会覆盖操作：%s', (command) => {
    const id = prepare()
    const s = useEditor.getState()
    s.beginGrip(id, 0)
    s.previewGrip({ x: -20, y: 10 })
    if (command === 'load') {
      s.load(createDrawing())
    }
    else if (command === 'tool') {
      s.setTool('circle')
    }
    else if (command === 'commit') {
      s.commit(d => ({
        ...d,
        layers: d.layers.map(l => ({ ...l, locked: true })),
      }))
    }
    else if (command === 'undo') {
      s.undo()
    }
    else {
      s.redo()
    }
    const before = useEditor.getState()
    expect(before.gripEdit).toBeNull()
    s.previewGrip({ x: -40, y: 10 })
    s.finishGrip()
    expect(useEditor.getState().doc).toBe(before.doc)
    expect(useEditor.getState().history).toBe(before.history)
  })
})
describe('编辑命令', () => {
  it('完整绘图仅生成一次历史，撤销重做恢复', () => {
    drawLine()
    expect(useEditor.getState().history).toHaveLength(1)
    useEditor.getState().undo()
    expect(useEditor.getState().doc!.entities).toHaveLength(0)
    useEditor.getState().redo()
    expect(useEditor.getState().doc!.entities).toHaveLength(1)
  })
  it('移动、复制与删除都是可撤销命令', () => {
    drawLine()
    const id = useEditor.getState().doc!.entities[0].id
    useEditor.setState({
      selected: [id],
    })
    useEditor
      .getState()
      .transformSelection(
        e => transform(e, p => add(p, { x: 10, y: 0 })),
        true,
      )
    expect(useEditor.getState().doc!.entities).toHaveLength(2)
    expect(useEditor.getState().doc!.entities[1].id).not.toBe(id)
    useEditor.getState().remove()
    expect(useEditor.getState().doc!.entities).toHaveLength(1)
    useEditor.getState().undo()
    expect(useEditor.getState().doc!.entities).toHaveLength(2)
  })
  it('图层锁定后不可新建、删除或变换', () => {
    drawLine()
    const s = useEditor.getState()
    const id = s.doc!.entities[0].id
    s.commit(d => ({
      ...d,
      layers: d.layers.map(l => ({ ...l, locked: true })),
    }))
    useEditor.setState({
      selected: [id],
    })
    s.remove()
    expect(useEditor.getState().doc!.entities).toHaveLength(1)
    drawLine()
    expect(useEditor.getState().doc!.entities).toHaveLength(1)
  })
  it('撤销图层创建后当前图层仍有效', () => {
    const s = useEditor.getState()
    const id = uid()
    s.commit(d => ({
      ...d,
      layers: [
        ...d.layers,
        {
          id,
          name: '新图层',
          visible: true,
          locked: false,
          color: '#ffffff',
        },
      ],
    }))
    useEditor.setState({ activeLayer: id })
    s.undo()
    expect(
      useEditor
        .getState()
        .doc!.layers.some(l => l.id === useEditor.getState().activeLayer),
    ).toBe(true)
  })
  it('拒绝非法数值及悬空图层引用', () => {
    const s = useEditor.getState()
    s.commit(d => ({
      ...d,
      entities: [
        {
          id: 'bad',
          type: 'circle',
          layerId: 'missing',
          strokeWidth: 1,
          center: { x: 0, y: 0 },
          radius: -1,
        },
      ],
    }))
    expect(useEditor.getState().doc!.entities).toHaveLength(0)
    expect(useEditor.getState().history).toHaveLength(0)
  })
})

describe('精确连续命令', () => {
  it('三点直线生成相连两段，U 只退回当前段并允许继续，Close 闭合', () => {
    const s = useEditor.getState()
    s.setTool('line')
    s.submitInput('13,7')
    s.submitInput('@100,0')
    s.submitInput('@0,60')
    expect(useEditor.getState().doc!.entities).toHaveLength(2)
    expect(useEditor.getState().doc!.entities[1]).toMatchObject({
      a: { x: 113, y: 7 },
      b: { x: 113, y: 67 },
    })
    s.undoStep()
    expect(useEditor.getState().doc!.entities).toHaveLength(1)
    expect(useEditor.getState().points.at(-1)).toEqual({ x: 113, y: 7 })
    expect(useEditor.getState().future).toHaveLength(0)
    s.submitInput('@0,80')
    s.closePath()
    expect(useEditor.getState().tool).toBe('select')
    expect(useEditor.getState().doc!.entities[2]).toMatchObject({
      a: { x: 113, y: 87 },
      b: { x: 13, y: 7 },
    })
    s.undo()
    expect(useEditor.getState().doc!.entities).toHaveLength(2)
    s.redo()
    expect(useEditor.getState().doc!.entities).toHaveLength(3)
  })
  it('未提交的折线点和 U 不写历史，闭合一次提交，取消不保留草图', () => {
    const s = useEditor.getState()
    s.setTool('polyline')
    s.submitInput('0,0')
    s.submitInput('@10,0')
    s.submitInput('@0,10')
    s.undoStep()
    expect(useEditor.getState().history).toHaveLength(0)
    s.submitInput('@0,20')
    s.submitInput('Close')
    expect(useEditor.getState().history).toHaveLength(1)
    expect(useEditor.getState().doc!.entities[0]).toMatchObject({ type: 'polyline', closed: true })
    s.setTool('polyline')
    s.submitInput('50,50')
    s.submitInput('@10,0')
    s.cancel()
    expect(useEditor.getState().doc!.entities).toHaveLength(1)
    expect(useEditor.getState().points).toHaveLength(0)
  })
  it('命令内撤销最多保留一百步，不越过历史边界或撤销其他修改', () => {
    const s = useEditor.getState()
    s.setTool('line')
    s.place({ x: 0, y: 0 })
    for (let i = 1; i <= 105; i++)
      s.place({ x: i, y: 0 })
    expect(useEditor.getState().lineSteps).toHaveLength(100)
    for (let i = 0; i < 100; i++)
      s.undoStep()
    const before = useEditor.getState()
    s.undoStep()
    expect(useEditor.getState().doc).toBe(before.doc)
    expect(useEditor.getState().points).toBe(before.points)
    s.setTool('line')
    s.place({ x: 20, y: 0 })
    s.place({ x: 30, y: 0 })
    s.commit(d => ({ ...d, name: '其他修改' }))
    const changed = useEditor.getState().doc
    s.undoStep()
    expect(useEditor.getState().doc).toBe(changed)
    expect(useEditor.getState().message).toContain('其他操作')
  })
  it.each(['move', 'copy', 'rotate', 'mirror'] as const)('%s 支持命令内选择，选择确认之前不收集坐标', (tool) => {
    drawLine()
    const s = useEditor.getState()
    s.setTool(tool)
    expect(useEditor.getState().phase).toBe('selection')
    s.place({ x: 0, y: 0 })
    expect(useEditor.getState().points).toHaveLength(0)
    s.finish()
    expect(useEditor.getState().phase).toBe('selection')
    const id = s.doc!.entities[0].id
    s.select([id], 'add')
    s.finish()
    expect(useEditor.getState().phase).toBe('point')
    s.place({ x: 0, y: 0 })
    expect(useEditor.getState().points).toHaveLength(1)
    expect(useEditor.getState().doc).toBe(s.doc)
  })
  it('预选直接进入取点，旋转中心和角度预览不写文档，独立确认一次提交', () => {
    drawLine()
    const s = useEditor.getState()
    s.setTool('select')
    s.select([s.doc!.entities[0].id], 'replace')
    s.setTool('rotate')
    expect(useEditor.getState().phase).toBe('point')
    s.place({ x: 0, y: 0 })
    expect(useEditor.getState().phase).toBe('angle')
    useEditor.setState({ rotation: 90 })
    expect(useEditor.getState().doc).toBe(s.doc)
    expect(useEditor.getState().revision).toBe(s.revision)
    s.confirmRotation()
    const after = useEditor.getState()
    expect(after.tool).toBe('select')
    expect(after.history).toHaveLength(2)
    const entity = after.doc!.entities[0]
    expect(entity.type).toBe('line')
    if (entity.type === 'line') {
      expect(entity.b.x).toBeCloseTo(-10)
      expect(entity.b.y).toBeCloseTo(20)
    }
    s.undo()
    expect(useEditor.getState().doc!.entities).toEqual(s.doc!.entities)
  })
  it('取消旋转及无效角度不改文档；零角度不制造历史', () => {
    drawLine()
    const s = useEditor.getState()
    s.setTool('select')
    s.select([s.doc!.entities[0].id], 'replace')
    s.setTool('rotate')
    s.place({ x: 0, y: 0 })
    s.confirmRotation(Number.NaN)
    expect(useEditor.getState().phase).toBe('angle')
    expect(useEditor.getState().doc).toBe(s.doc)
    s.cancel()
    expect(useEditor.getState().points).toHaveLength(0)
    s.select([s.doc!.entities[0].id], 'replace')
    s.setTool('rotate')
    s.place({ x: 0, y: 0 })
    s.confirmRotation(360)
    expect(useEditor.getState().history).toBe(s.history)
  })
  it('零位移移动结束命令但不增加历史，零位移复制仍创建副本', () => {
    drawLine()
    const s = useEditor.getState()
    s.setTool('select')
    s.select([s.doc!.entities[0].id], 'replace')
    s.setTool('move')
    s.submitInput('0,0')
    s.submitInput('@0,0')
    expect(useEditor.getState().tool).toBe('select')
    expect(useEditor.getState().doc).toBe(s.doc)
    expect(useEditor.getState().history).toBe(s.history)
    expect(useEditor.getState().revision).toBe(s.revision)
    s.setTool('copy')
    s.submitInput('0,0')
    s.submitInput('@0,0')
    expect(useEditor.getState().doc!.entities).toHaveLength(2)
    expect(useEditor.getState().history).toHaveLength(s.history.length + 1)
  })
  it('锁定/隐藏对象不能加入选择，已有选择锁定后仍不能修改', () => {
    drawLine()
    const s = useEditor.getState()
    const id = s.doc!.entities[0].id
    s.commit(d => ({
      ...d,
      layers: d.layers.map(l => ({ ...l, locked: true })),
    }))
    s.setTool('move')
    s.select([id, 'missing'], 'replace')
    s.finish()
    expect(useEditor.getState().selected).toHaveLength(0)
    expect(useEditor.getState().phase).toBe('selection')
  })
  it('输入不受网格改写，临时捕捉在成功取点后恢复；失败不消耗草图', () => {
    const s = useEditor.getState()
    s.setTool('line')
    useEditor.setState({ snapOverride: 'endpoint' })
    expect(s.submitInput('13,7')).toBe(true)
    expect(useEditor.getState().snapOverride).toBeNull()
    const before = useEditor.getState()
    expect(s.submitInput('NaN,0')).toBe(false)
    expect(useEditor.getState().points).toBe(before.points)
    expect(useEditor.getState().doc).toBe(before.doc)
    s.submitInput('@10,0')
    expect(useEditor.getState().doc!.entities[0]).toMatchObject({
      a: { x: 13, y: 7 },
      b: { x: 23, y: 7 },
    })
    s.undo()
    expect(useEditor.getState().tool).toBe('select')
    expect(useEditor.getState().points).toHaveLength(0)
  })
  it('圆命令的标量是半径，不能输入负半径', () => {
    const s = useEditor.getState()
    s.setTool('circle')
    s.submitInput('13,7')
    expect(s.submitInput('-20')).toBe(false)
    expect(s.submitInput('20')).toBe(true)
    expect(useEditor.getState().doc!.entities[0]).toMatchObject({
      type: 'circle',
      center: { x: 13, y: 7 },
      radius: 20,
    })
  })
  it('结束后 Enter 重复最近工具，切换项目清除未完成命令', () => {
    const s = useEditor.getState()
    s.setTool('line')
    s.place({ x: 0, y: 0 })
    s.finish()
    expect(useEditor.getState().tool).toBe('select')
    s.finish()
    expect(useEditor.getState().tool).toBe('line')
    s.load(createDrawing())
    expect(useEditor.getState()).toMatchObject({
      tool: 'select',
      phase: 'idle',
      points: [],
      lineSteps: [],
      selected: [],
    })
  })
})
