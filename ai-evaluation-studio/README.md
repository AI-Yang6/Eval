# AI Evaluation Studio

AI Evaluation Studio 是一个面向 Prompt 和模型效果评估的本地优先工具。它支持维护测试集、管理 Prompt 版本、配置多家模型 Provider、运行 LLM-as-Judge 评估、查看报告，并将结果导出为 CSV / Markdown / JSON。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript 5
- Tailwind CSS 4
- Dexie 4 / IndexedDB
- Vercel AI SDK 6
- Recharts 3
- Vitest 4
- npm / package-lock.json

## 本地运行

```bash
npm install
npm run dev
```

默认访问地址是 http://localhost:3000。如果端口被占用，Next.js 会提示可用端口。

## 常用脚本

```bash
npm run lint
npm run test
npm run build
npm run check
```

`npm run check` 会依次执行 lint、单元测试和生产构建，适合作为提交前的本地检查。

## 数据与密钥

应用数据保存在浏览器 IndexedDB 中，包含测试集、Prompt、模型配置、评估记录、知识库和备份数据。API Key 由用户在浏览器中输入，并在调用 `/api/generate`、`/api/embed`、`/api/test-connection` 时发送到本地 Next.js API route。

当前设计适合个人本地使用或可信环境内运行。若部署到公网，需要重新评估：

- API Key 的存储、传输和日志暴露风险
- API route 的鉴权与访问控制
- IndexedDB 数据丢失风险和备份恢复策略
- 多用户隔离和服务端持久化需求

## 公开部署建议

公开演示时建议至少启用访问保护，例如 Vercel Password Protection 或等价的反向代理鉴权。当前版本采用 BYOK（Bring Your Own Key）模式：用户自填 API Key，应用仅在模型调用时转发给对应 Provider。

应用也内置了轻量访问码门禁。在 Vercel 项目里配置环境变量即可启用：

```text
DEMO_ACCESS_CODE=your-access-code
```

不要使用 `NEXT_PUBLIC_` 前缀。未配置 `DEMO_ACCESS_CODE` 时，门禁默认关闭，方便本地开发。

上线前检查：

```bash
npm run check
npm audit --omit=dev
```

已内置的公开演示加固：

- 访问码页 + httpOnly cookie 门禁
- 模型 API route 默认 `no-store`
- 请求体大小限制和长 Prompt 拦截
- Provider 错误信息脱敏
- 基础内存限流
- 基础安全响应头
- `/privacy` 隐私与数据说明页

## 核心目录

```text
src/app/(main)              主应用页面
src/app/api                 模型调用与 Embedding 代理
src/components              页面组件与基础 UI
src/lib/db                  Dexie 数据访问层
src/lib/eval                评估、Judge、回归检测与导出逻辑
src/lib/model-adapters      Provider 与模型预设
src/lib/utils               导入解析、diff、格式化工具
src/lib/types               全局类型
```

## 当前限制

- 评估任务由前端会话触发，刷新页面会影响内存中的取消状态。
- 数据默认只存在当前浏览器，清缓存或更换浏览器前应先导出备份。
- 模型价格、可用模型和 Provider API 兼容性会变化，预设仅用于估算和快速配置。
