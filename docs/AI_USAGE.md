# AI Usage Disclosure

## 使用了哪些 AI 工具

- Codex: 需求拆解、PRD 整理、代码实现、测试和文档生成。
- skills 工具:
  - `mattpocock/skills`: grill、PRD、架构拆解方法。
  - `anthropics/skills`: frontend-design、webapp-testing、theme-factory 等 UI 和验证指导。

## 分别用于哪些环节

- 需求澄清：根据题面、FAQ 和会议纪要整理 P0/P1 边界。
- 产品设计：形成 PRD、UI 工作台布局、评测适配策略。
- 工程实现：搭建 monorepo、React 工作台、Node API、core/knowledge/adapters 模块。
- 验证：运行单元测试、类型检查、浏览器自动化截图。

## 自主设计与实现部分

- “结构 = 脚本结构 + 节奏结构 + 素材槽位结构”的项目定义。
- `TechniqueAtom` 原子技巧模型。
- `KnowledgeEntry` 结构知识库模型。
- `CompositionPlan` 组合计划。
- 槽位匹配、素材缺口识别、补全策略。
- Web 工作台的信息架构和可视化方式。

## 不依赖现成产品直接生成结果

当前实现没有调用剪映、CapCut、Runway 或现成视频生成产品直接产出结果。Remotion/FFmpeg 被设计为基础渲染和处理框架，核心迁移逻辑由本项目的结构定义、知识库、槽位匹配和生成模块完成。

