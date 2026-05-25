# 爆款结构迁移引擎

从样例视频中拆解脚本结构、节奏结构、素材槽位和原子技巧，再结合一段长视频素材与提示词，重构生成新的短视频方案和低保真成片 demo。

## 当前实现

- React / TypeScript Web 工作台
- Node.js API
- 结构知识库与营销类种子原子
- 样例结构抽取 mock/规则链路
- 长视频候选片段粗切 mock/规则链路
- 槽位匹配、素材缺口识别、补全策略
- Composition Plan、脚本、分镜、时间线生成
- 低保真 HTML 成片预览，后续可替换为 Remotion MP4 渲染
- 无 API key 时可完整跑通 demo

## 本地运行

```bash
npm install
npm run dev
```

打开：

- Web: http://localhost:5173
- API: http://localhost:8787/api/health

## 验证

```bash
npm run test
npm run typecheck
node scripts/verify-ui.mjs
```

`scripts/verify-ui.mjs` 会打开本地页面，点击生成按钮，并把截图保存到 `data/tmp/ui-verification.png`。

## 目录

```text
apps/web          React 工作台
apps/api          Node API
packages/shared   共享类型
packages/core     结构抽取、槽位匹配、补全、生成
packages/knowledge 结构知识库和种子原子
packages/adapters 工具协议和 FFmpeg/Remotion 适配层
docs/PRD.md       产品需求
docs/UI_GUIDELINES.md UI 规范
docs/ARCHITECTURE.md AI 架构、工具协议、安全边界
docs/AI_USAGE.md  AI 辅助工具使用说明
```

## 环境变量

复制 `env.example` 为 `.env`，替换自己的 key。仓库不会提交真实密钥。

