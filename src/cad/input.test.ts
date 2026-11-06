import { describe, expect, it } from 'vitest'
import { parsePointInput, parseScalar } from './input'

const base = { x: 13, y: -7 }
describe('命令精确输入', () => {
  it('绝对和相对坐标支持负数、小数及科学计数法', () => {
    expect(parsePointInput(' 1e2, -0.5 ', base)).toEqual({ x: 100, y: -0.5 })
    expect(parsePointInput('@-3,2', base)).toEqual({ x: 10, y: -5 })
    expect(parsePointInput('.5,+.25')).toEqual({ x: 0.5, y: 0.25 })
  })
  it('极坐标按世界 X 正轴逆时针计算，不依赖鼠标方向', () => {
    const relative = parsePointInput('@20<90', base)
    expect(relative.x).toBeCloseTo(13)
    expect(relative.y).toBeCloseTo(13)
    const absolute = parsePointInput('10<-90', base)
    expect(absolute.x).toBeCloseTo(0)
    expect(absolute.y).toBeCloseTo(-10)
  })
  it('直接距离沿鼠标方向保持输入长度', () => {
    const p = parsePointInput('50', base, { x: 16, y: -3 })
    expect(p).toEqual({ x: 43, y: 33 })
    expect(parsePointInput('20', base, { x: 30, y: -7 })).toEqual({ x: 33, y: -7 })
  })
  it.each([
    '',
    'NaN',
    'Infinity',
    '0x10',
    '10mm',
    '1/2',
    '1e99',
    '1,2,3',
    '@1',
    '1<-',
    '@-1<30',
    '1 0,2',
    '@1 0,2',
    '@10<9 0',
    '3 7',
  ])('拒绝无效或超范围输入 %s', (text) => {
    expect(() => parsePointInput(text, base, { x: 20, y: -7 })).toThrow()
  })
  it('无基点或方向时不猜测距离和相对坐标', () => {
    expect(() => parsePointInput('@2,3')).toThrow('基点')
    expect(() => parsePointInput('@20<45')).toThrow('基点')
    expect(() => parsePointInput('20')).toThrow('方向')
    expect(() => parsePointInput('20', base, base)).toThrow('方向')
    expect(() => parsePointInput('@1e9,0', base)).toThrow('范围')
    expect(() => parsePointInput('-1', base, { x: 20, y: -7 })).toThrow('大于零')
  })
  it('角度参数使用严格数值解析', () => {
    expect(parseScalar('-90')).toBe(-90)
    expect(() => parseScalar('90°')).toThrow()
  })
})
