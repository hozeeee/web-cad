# webCAD

一个本地优先的浏览器端二维 CAD 工作空间，使用 React、TypeScript 和 Vite 构建。图纸以毫米为单位，使用 SVG 渲染；无需后端服务，图纸数据保存在当前浏览器中，不会上传到服务器。

支持标准静态站点部署，也可构建为不依赖外网的单个 HTML 文件。

## 功能

- 绘图：直线、折线、矩形、圆、三点圆弧、文字，以及水平、垂直和对齐尺寸标注。
- 编辑：单选、多选、框选、移动、复制、旋转、镜像、修剪、删除、撤销与重做。
- 精确操作：坐标和属性输入、网格、对象吸附、正交模式、画布缩放与平移。
- 图层管理：创建图层、调整名称与颜色、切换可见性和锁定状态。
- 项目管理：新建、打开、复制、删除图纸，自动保存与恢复最近项目。
- 文件交换：项目 JSON 导入导出、全部图纸 JSON 备份、矢量 SVG 导出、基础二维 DWG 本地导入导出（试用版）。

## 快速开始

### 环境要求

- Node.js：满足 `^22.22.2 || >=24.15.0`，推荐使用 22.x 系列的 22.22.2 或更新版本。
- npm：使用仓库内的 `package-lock.json` 安装依赖。
- 现代浏览器：支持 SVG、Pointer Events 和 IndexedDB；推荐使用最新版 Chrome、Edge、Firefox 或 Safari。

在项目根目录运行：

```bash
npm ci
npm run dev
```

打开终端提示的地址，默认是 `http://localhost:5173`。无需配置数据库服务、账号或环境变量。

选择左侧绘图工具，按底部提示逐点绘制；右侧面板可输入精确坐标和修改属性。也可点击「示例图纸」体验编辑功能，点击「我的图纸」管理项目。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run lint:fix` | 自动修复可修复的 ESLint 问题 |
| `npm run typecheck` | TypeScript 类型检查，不生成文件 |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run test:e2e` | 运行 Playwright 端到端测试 |
| `npm run build` | 先检查类型，再构建标准版和单文件版 |
| `npm run build:standard` | 构建标准静态站点至 `dist/standard/` |
| `npm run build:single` | 构建单文件 HTML 至 `dist/single/index.html` |
| `npm run preview` | 本地预览标准构建产物 |
| `npm run preview:single` | 本地预览单文件构建产物 |

### 测试

```bash
npm run lint
npm run typecheck
npm test
```

端到端测试需要先生成两种构建产物，并安装 Playwright 使用的 Chromium：

```bash
npm run build
npx playwright install chromium
npm run test:e2e
```

Linux / CI 环境可使用 `npx playwright install --with-deps chromium` 安装浏览器及系统依赖。Playwright 会自动启动开发服务器和构建产物静态服务器，请确保端口 `5186`、`4174` 未被占用。

## 构建与部署

### 标准静态站点

```bash
npm run build:standard
npm run preview
```

将 `dist/standard/` 的全部内容部署到静态服务器即可。构建使用相对资源路径 `base: './'`，支持部署在站点子目录。

### 单文件 HTML

```bash
npm run build:single
npm run preview:single
```

产物为 `dist/single/index.html`，JavaScript、样式、DWG Worker 和 WASM 引擎全部内嵌，可直接分发、离线打开或静态托管。无需 CDN、后端或额外 `.wasm` 文件，但 DWG 引擎会增加 HTML 体积。浏览器须允许 Blob Worker 与 WebAssembly；严格的安全策略可能阻止转换。通过 `file://` 打开时，本地持久化能力因浏览器而异，详见下方数据说明。

### GitHub Actions

仓库提供三条工作流：

- [检查与测试](.github/workflows/ci.yml)：向 `main` / `master` 推送、提交 PR 或手动触发时，执行代码检查、类型检查、单元测试、双构建和端到端测试。
- [GitHub Pages](.github/workflows/pages.yml)：向 `main` / `master` 推送或手动触发时，构建并部署 `dist/standard/`。使用前需在仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
- [Release](.github/workflows/release.yml)：推送匹配 `v*` 的标签时，生成 GitHub Release，附带标准版压缩包 `webCAD-standard.zip` 和单文件 `index.html`。

## 操作与快捷键

| 操作 | 功能 |
| --- | --- |
| 滚轮 | 围绕鼠标位置缩放 |
| 空格 + 拖动 / 鼠标中键拖动 | 平移画布 |
| Shift + 点击 | 多选图形 |
| 选择工具下在空白处拖动 | 框选完全包含的图形 |
| ⌘ / Ctrl + Z | 撤销 |
| ⌘ / Ctrl + Shift + Z | 重做 |
| ⌘ / Ctrl + A | 全选可编辑图形 |
| Enter | 完成折线 |
| Escape | 取消绘制 |
| Delete / Backspace | 删除所选图形 |

移动、复制、旋转和镜像前，请先选中未锁定的图形。旋转角度在右侧面板输入，镜像轴通过两点确定。

## 数据与限制

- 图纸自动保存到 IndexedDB。关闭页面前，请确认底部显示「已保存到本地」。
- 数据仅属于当前浏览器和站点来源，不会跨浏览器、设备或站点自动同步。清理站点数据前，请导出备份。
- IndexedDB 不可用时会显示临时模式，数据仅保存在内存中；刷新或关闭页面前务必导出 JSON。
- GitHub Pages、本地开发服务器和 `file://` HTML 之间不共享图纸，请通过 JSON 导入导出迁移。
- 项目 JSON 保留完整可编辑数据；「全部图纸备份」可一次导出所有本地项目。导入会创建新的项目副本，不覆盖原项目。
- SVG 导出仅包含可见图层中的图形，适合打印或交换矢量图形；不支持 SVG 导入。
- JSON 导入文件上限为 20 MB，数据会经过 Zod 校验。
- 修剪目标支持直线、圆和圆弧，以其他可见图形作为边界。
- 尺寸标注使用独立坐标，不随原图形自动关联更新；文字镜像后保持可读。
- DWG 为基础二维兼容性试用功能，不是无损编辑器；当前不支持直接 DXF 文件交换或三维模型。

### DWG 试用功能与风险

点击「导入」选择 `.dwg`，先确认风险，再检查转换结果；确认检查报告后才会创建新项目，不覆盖原图纸。点击「导出 → DWG · 试用版」，确认风险后下载真正的 AutoCAD 2013 DWG（AC1027），也可先备份项目 JSON。

- 尝试读取 AC1009–AC1032 文件头，不保证所有 DWG 版本、变体或复杂文件兼容；更改文件后缀不会转换格式。
- 仅映射模型空间、XY 平面的 LINE、CIRCLE、ARC、无弧段与宽度的普通折线、简单 TEXT 和图层。块、填充、样条、原生标注、复杂文字、布局、三维及业务扩展数据可能跳过；报告只能列出已识别的损失。
- 导出时矩形变为闭合折线，尺寸标注变为普通线与文字，失去原生标注语义。字体、线型、颜色、线宽与单位可能变化；未知单位按毫米处理并提示。隐藏图层的实体也会导出，保留图层隐藏状态。
- 全部解析和编码在本地 Worker 中进行，不上传图纸。输入上限 20 MB、实体上限 20000、图层上限 100；转换超时 30 秒，可主动取消。失败或取消不会创建项目或下载 DWG。
- 务必保留原 DWG 和项目 JSON。重新导出无法恢复未导入的内容；在目标 CAD 软件中核对尺寸与外观，未经核验不用于施工、制造或生产交付。
- 自动化验证覆盖基础实体往返及独立 LibreDWG 读取，但不等同于 AutoCAD 兼容性认证；请先用真实小图纸试用。

### DWG 引擎重建与许可

运行时采用 [acadrust 0.6.8](https://crates.io/crates/acadrust/0.6.8)（MPL-2.0），含 ACadSharp 的 MIT 归属声明。自有 Rust 桥接与时钟适配位于 `engine/dwg/`，采用 MPL-2.0；依赖许可位于 `engine/dwg/licenses/`。LibreDWG 仅为开发测试依赖，不打包进应用运行时。

普通 `npm run build` 使用仓库中的预编译 WASM，无需 Rust。更改引擎时安装 Rust 1.90.0 及 WASM target，在项目根目录执行：

```bash
rustup target add wasm32-unknown-unknown
npm run build:dwg
npm run build
```

重建脚本使用 Cargo.lock，生成 WASM、依赖许可、源码 SHA-256 清单 `engine/dwg/build.json` 及源码文本 `engine/dwg/source.txt`。单 HTML 的「使用指南」可离线下载桥接源码、重建说明和完整许可；依赖源代码按 Cargo.lock 固定版本和校验和从 crates.io 获取。分发二进制或修改相关 MPL 文件时，请保留许可、归属及对应源码获取方式。

## 技术栈与目录

- 界面与构建：React、TypeScript、Vite、原生 CSS、Lucide 图标。
- 编辑器：Zustand 状态管理、SVG 渲染、Pointer Events 交互。
- 数据：IndexedDB（idb 封装）、Zod 校验、JSON / SVG / 基础二维 DWG 文件交换。
- DWG：Rust acadrust、WebAssembly、内嵌 Worker；DXF 仅为内部中间格式。
- 质量保障：ESLint、Vitest、Playwright、GitHub Actions。
- 单文件构建：`vite-plugin-singlefile`。

```text
src/
├── app/                 应用外壳与全局样式
├── cad/                 数据模型、几何计算、绘图工具与修剪算法
├── components/          共享 UI 组件与图形渲染
├── features/
│   ├── editor/          编辑器状态、画布、图层与属性面板
│   └── projects/        项目管理与自动保存
├── io/                  JSON / SVG 导入导出与数据校验
├── storage/             IndexedDB 持久化
└── main.tsx             应用入口
tests/                   Playwright 测试与静态测试服务器
.github/workflows/       检查、Pages 部署与 Release 发布
```

单元测试与对应源码放在一起（`src/**/*.test.ts`、`src/**/*.test.tsx`），端到端测试位于 `tests/`。
