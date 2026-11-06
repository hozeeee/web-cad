import attribution from '../../engine/dwg/licenses/acadrust-NOTICES.txt?raw'
import dependencyLicenses from '../../engine/dwg/licenses/dependencies.txt?raw'
import mplLicense from '../../engine/dwg/licenses/MPL-2.0.txt?raw'
import engineSource from '../../engine/dwg/source.txt?raw'
import { download } from '../io/files'
import { Modal } from './Modal'

const shortcuts = [
  ['滚轮', '围绕鼠标缩放'],
  ['空格 + 拖动 / 中键', '平移画布'],
  ['Shift + 点击 / 框选', '切换点选 / 添加框选'],
  ['Alt + 点击 / 框选', '从选择中移除'],
  ['左 → 右 / 右 → 左框选', '完全包含 / 包含或穿过几何'],
  ['U / 命令栏 Close', '退回一点 / 闭合轮廓'],
  ['⌘ / Ctrl + Z', '撤销'],
  ['⌘ / Ctrl + Shift + Z', '重做'],
  ['⌘ / Ctrl + A', '全选可编辑图形'],
  ['Enter / Escape', '确认、结束或重复 / 取消（输入法候选除外）'],
  ['Delete / Backspace', '删除所选图形'],
]
export function HelpDialog({ close }: { close: () => void }) {
  return (
    <Modal title="从一条线开始" onClose={close}>
      <div className="help-content">
        <p>
          webCAD 是一个本地优先的二维 CAD
          工作空间。选择左侧工具，按底部提示逐点绘制；右侧面板可以输入精确坐标和调整属性。
        </p>
        <h3>工作空间快捷键</h3>
        <div className="shortcut-list">
          {shortcuts.map(([key, text]) => (
            <div key={key}>
              <kbd>{key}</kbd>
              <span>{text}</span>
            </div>
          ))}
        </div>
        <h3>精确编辑</h3>
        <p>
          支持先选图形，也可进入移动、复制、旋转或镜像后选择，再按 Enter。旋转先取中心，再预览角度并确认；镜像轴通过两点确定并替换原对象。修剪支持直线、圆和圆弧，以其他可见图形作为边界；标注为独立坐标，不关联原图形。文字镜像保持可读。
        </p>
        <p>
          关闭侧栏仍可使用底部命令输入：x,y 为绝对坐标，@dx,dy 为相对位移，@距离&lt;角度为相对极坐标（角度以度为单位，从 X 正轴逆时针计算）。取基点后，鼠标指定方向并输入距离；圆的单个数值表示半径。精确坐标不会再被吸附改写。直线连续绘制，Close 闭合，U 退回一点；全局撤销会结束当前命令。捕捉设置可分别开关类型，也可指定下一点临时捕捉。
        </p>
        <h3>关于你的数据</h3>
        <p>
          IndexedDB
          数据仅保存在当前浏览器和站点来源，不会上传。关闭前确认底部显示「已保存到本地」，定期导出项目
          JSON 或全部图纸备份。SVG 适合交换图形，JSON 用于完整继续编辑。DWG 读写为基础二维试用功能，不支持无损编辑、三维模型或直接 DXF 文件交换。
        </p>
        <p>
          单 HTML 不依赖外网；本地 file://
          的持久化能力因浏览器而异，数据库不可用时会明确显示临时模式。Pages
          与本地 HTML 之间请通过 JSON 迁移数据。DWG 的 Worker 和 WASM 均内嵌于单 HTML，断网仍可转换，浏览器须允许 Blob Worker 与 WebAssembly。
        </p>
        <h3>DWG 兼容性与许可</h3>
        <p>
          导入仅保留 XY 平面的基础线、圆、圆弧、普通折线、简单文字和图层。块、填充、样条、原生标注、布局、三维与自定义业务数据可能丢失；请在检查报告中确认跳过内容。
          导出为 AutoCAD 2013 DWG，矩形变为闭合折线，标注变为普通线条和文字。务必保留原 DWG 与 JSON 备份，并用目标 CAD 软件核对尺寸；未经核验不可用于生产交付。
        </p>
        <p>
          引擎采用
          {' '}
          <a href="https://crates.io/crates/acadrust/0.6.8" target="_blank" rel="noreferrer">acadrust 0.6.8</a>
          （MPL-2.0），含 ACadSharp 的 MIT 归属声明。桥接与时钟适配源码位于项目 engine/dwg，构建步骤见 README。分发时应保留许可与对应源码获取方式。
        </p>
        <div className="cad-exchange-actions">
          <button onClick={() => download(`${mplLicense}\n${attribution}\n${dependencyLicenses}`, 'webCAD-DWG-licenses.txt', 'text/plain;charset=utf-8')}>下载 DWG 引擎许可与归属声明</button>
          <button onClick={() => download(engineSource, 'webCAD-DWG-source.txt', 'text/plain;charset=utf-8')}>下载 DWG 桥接源码与重建说明</button>
        </div>
      </div>
    </Modal>
  )
}
