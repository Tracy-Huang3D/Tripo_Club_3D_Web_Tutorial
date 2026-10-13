# Tripo Club 3D Web Tutorial

一个基于真实 Case 02 源码的沉浸式 3D 活动网站示例与中文教程项目。项目使用 React、Vite、Three.js 和 React Three Fiber，展示持续 WebGL 场景、液态背景、3D 活动轮播、滚动空间转场和 GLB 3D Hero 标题。

## 已实现功能

- 持续存在的 React Three Fiber WebGL Canvas
- 自定义 GLSL 液态背景、网格、霓虹环境与鼠标扰动
- Hero → Event Space → Club Experience 滚动空间转场
- CREATE / PLAY / CONNECT / EXPLORE 四个程序化活动视觉身份
- 活动轮播、滚动吸附、点击全屏详情、Esc/关闭返回
- 磁吸按钮、自定义指针、Hover Tilt 与空间导航
- `public/assets/neon-text-3d-model.glb` 驱动的 3D Hero 标题
- 响应式布局与 reduced-motion 分支
- `Tripo_Club_Tutorial/` 中的中文教程、项目审计和资源清单

## 技术栈

- Vite 5
- React 18
- Three.js
- React Three Fiber
- 自定义 GLSL Shader
- 原生滚动进度与 `requestAnimationFrame`

## 安装、启动和构建

需要 Node.js 与 npm。项目使用 `package-lock.json` 锁定依赖版本。

```bash
npm install
npm run dev
npm run build
npm run preview
```

开发服务器启动后，按终端显示的本地地址访问。生产构建输出到 `dist/`；`dist/` 是生成目录，不纳入 Git。

## 主要目录与资源

```text
src/
  components/       WebGL 场景、环境、活动详情与空间交互
  data/             活动数据
  styles/           全局样式
public/assets/      运行时静态资源，包括 3D GLB 模型
public/licenses/    第三方字体许可说明
Tripo_Club_Tutorial/ 中文教程、审计与资源清单
```

主要模型资源为 `public/assets/neon-text-3d-model.glb`。它约 63.5 MiB，作为运行所需的静态资源保留在仓库中。当前仓库未使用 Git LFS；该文件低于 GitHub 单文件 100 MiB 限制。

## 环境变量

当前项目不需要环境变量。`.env.example` 仅用于明确记录这一点。不要提交真实 `.env` 文件或任何密钥。

## 已知限制

- GLB 资源较大，尚未接入 Draco、Meshopt、KTX2 或 LOD 优化；移动设备加载性能仍需进一步验证。
- GLB 加载失败时目前没有可见的标题回退或 Error Boundary。
- 活动详情仍是演示内容，不代表真实节目数据。
- 不建议直接通过 `file://` 打开构建后的 HTML；请使用 `npm run preview` 或其他静态 HTTP 服务器。
- 本项目没有部署地址或截图；本仓库仅用于代码、资源和教程交付。

## 教程资料

从 `Tripo_Club_Tutorial/Tripo_Club_3D_Web_Tutorial.md` 开始阅读；项目审计见 `PROJECT_AUDIT.md`，待录制素材清单见 `ASSET_CHECKLIST.md`。
