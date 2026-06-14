# AI Evaluation Studio

> 面向 AI 产品经理与小团队的本地优先 Prompt / 模型 / RAG 评估工作台。
> 把测试集、Prompt 版本、模型配置、LLM-as-Judge、人工校准、成本估算、Bad Case 回归和报告导出打通。

🔗 **在线体验**:[https://yang-eval-studio.vercel.app](https://yang-eval-studio.vercel.app)

## 项目简介

AI Evaluation Studio 解决 AI 产品迭代中常见的低效问题：改一版 Prompt 只跑几个样例凭感觉判断、换模型只看通用 benchmark、bad case 只在群里截图讨论无法沉淀、模型成本上线后才暴露。

它提供一个 **30 秒上手** 的工作台，让 AI PM 在不写脚本的情况下完成：

- 维护业务测试集（输入 / 期望输出 / 标签）
- 管理 Prompt 多版本与 diff 对比
- 配置多家模型 Provider 并做 A/B 对比
- 运行 LLM-as-Judge 自动打分 + 人工校准
- 输出效果 / 速度 / 成本三维报告
- 跟踪 Bad Case 回归与历史趋势

## 仓库结构

```text
.
├── ai-evaluation-studio/          # Next.js 应用（实际代码）
├── 01_产品构思_用户场景与价值.md    # 产品定位、目标用户、场景与价值
├── 02_功能模块拆解.md              # 6 大功能模块拆解
├── 03_PRD_核心功能.md              # P0 功能详细 PRD
├── 04_PRD_技术实现.md              # 技术实现方案
├── 05_视觉设计规范.md              # 设计规范
└── 06_操作手册.md                  # 用户操作手册
```

## 技术栈

- Next.js 16 App Router · React 19 · TypeScript 5
- Tailwind CSS 4 · shadcn/ui · Lucide
- Dexie 4 / IndexedDB（本地优先存储）
- Vercel AI SDK 6（统一模型调用）
- Recharts 3 · Vitest 4

## 快速开始

### 在线体验

直接访问 [https://yang-eval-studio.vercel.app](https://yang-eval-studio.vercel.app) 即可使用。线上版本采用访问码门禁,如需访问请联系作者获取访问码;数据仍保存在你自己的浏览器 IndexedDB 中,API Key 仅在调用时转发到对应 Provider。

### 本地运行

```bash
cd ai-evaluation-studio
npm install
npm run dev
```

默认访问 http://localhost:3000。详细操作请参考 [06_操作手册.md](./06_操作手册.md)。

### 常用脚本

```bash
npm run lint     # 代码检查
npm run test     # 单元测试
npm run build    # 生产构建
npm run check    # 密钥扫描 + lint + test + build（提交前自检）
```

## 核心功能

| 模块 | 能力 |
|---|---|
| 测试集管理 | 手写 / JSON / CSV 导入，按标签筛选，单条编辑 |
| Prompt 版本管理 | 多版本保存、diff 对比、回滚 |
| 模型配置 | OpenAI / Anthropic / DeepSeek / 通义千问 / 智谱 GLM / Kimi / 豆包 / MiniMax / Agnes AI / 自定义 OpenAI 兼容端点 |
| 评估任务引擎 | 浏览器并行执行、断点续跑、LLM-as-Judge 自动打分 |
| 对比报告 | 效果 / 速度 / 成本三维可视化，支持 CSV / Markdown / JSON 导出 |
| 知识库（RAG） | 向量化检索，召回质量评估 |
| 多模态生成 | 图像 / 视频 Provider 调用与历史记录 |
| 历史与回归 | 跨版本趋势对比，Bad Case 回归检测 |

## 数据与隐私

- 应用数据保存在浏览器 **IndexedDB**，包含测试集、Prompt、模型配置、评估记录、知识库等
- API Key 由用户在浏览器输入（**BYOK** 模式），仅在调用 `/api/generate`、`/api/embed`、`/api/test-connection` 时转发到对应 Provider
- 数据备份导出 **不包含** Provider 与 Embedding API Key
- 多模态历史只保存 Provider 返回的 URL，不保存二进制；URL 过期后可能无法继续预览

## 公开部署建议

当前设计适合个人本地使用或可信环境。若部署到公网，建议：

- 启用访问保护（如 Vercel Password Protection 或反向代理鉴权）
- 设置环境变量 `DEMO_ACCESS_CODE=your-access-code` 启用内置访问码门禁（不要使用 `NEXT_PUBLIC_` 前缀）
- 上线前执行 `npm run check && npm audit --omit=dev`

已内置加固：访问码 + httpOnly cookie 门禁、模型 API route 默认 `no-store`、请求体大小限制、Provider 错误信息脱敏、基础内存限流、安全响应头、`/privacy` 数据说明页。

## 目标用户

- **AI 产品经理**（核心）：负责 AI 客服、知识库问答、销售助手等 AI 功能，需要数据化沉淀 Prompt 迭代与模型选型决策
- **算法 / 工程**：快速验证 Prompt、模型与 RAG 策略，无需手写脚本
- **创业者 / 独立开发者**：低成本评估 AI 产品质量与调用费用
- **AI 培训讲师**：演示 Prompt 迭代如何从主观感受走向数据化评估

## 当前限制

- 评估任务由浏览器执行，关闭所有 Eval Studio 标签页时会暂停，下次打开后继续
- 数据默认只存在当前浏览器，清缓存或更换浏览器前需先导出备份
- 模型价格、可用模型与 Provider API 兼容性会变化，预设仅用于估算

## 文档索引

- [产品构思与用户价值](./01_产品构思_用户场景与价值.md)
- [功能模块拆解](./02_功能模块拆解.md)
- [PRD：核心功能](./03_PRD_核心功能.md)
- [PRD：技术实现](./04_PRD_技术实现.md)
- [视觉设计规范](./05_视觉设计规范.md)
- [操作手册](./06_操作手册.md)
- [应用 README](./ai-evaluation-studio/README.md)

## License

本仓库未声明开源协议。如需引用、二次开发或商用，请先与作者联系。
