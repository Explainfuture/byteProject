# PRD: 爆款结构迁移引擎

## Problem Statement

短视频创作者能感知哪些视频更容易出效果，但很难把这种经验拆解成可复用结构，也很难在新商品、新主题或素材不足时稳定复现类似的表达效果。评审需要看到系统如何从样例中抽取结构、如何映射到新内容、如何识别素材缺口、如何补全并生成可验证的视频结果。

本项目要做的是一个 AI 创作平台，围绕“样例理解 -> 结构抽取 -> 知识沉淀 -> 素材适配 -> 结果生成”的闭环，让用户上传样例视频和新内容素材后，得到可解释、可调整、可展示、可播放的短视频产物。

## Confirmed Scope

- P0 主验证结果为：脚本、分镜、时间线可视化、低保真成片 demo。
- P0 视频结构定义锁定为三层：脚本结构、节奏结构、素材槽位结构。
- P0 包装结构不做深度识别，但输出基础包装建议；完整包装生成放 P1。
- P0 新素材输入主路径为“一段长视频素材 + 提示词/商品信息”，图片和文案作为辅助输入。
- P0 输出视频建议控制在 10-20 秒，允许更长，但以短视频重构效果为优先。
- P0 缺口补全不依赖视频生成模型，先做文案/字幕补全、包装卡片补全、现有素材重组复用。
- AIGC 封面、背景、配音、补充画面只做接口预留，作为加分项。
- 自动化是主路径，人工校正只作为兜底和演示可控性。
- 真实素材适配做长视频粗切、片段候选、轻量分类和槽位推荐，不追求复杂逐帧视觉理解。
- 多版本生成放 P1，P0 只保留生成策略字段，默认生成一个主版本。
- 自然语言改片放 P1，P0 先做参数控件调整。
- 技术架构采用单仓库模块化：前端工作台 + Node API + core 深模块 + adapters + knowledge。
- 低保真成片 demo 使用 Remotion 渲染为主，FFmpeg 辅助处理。
- 模型接入采用真实模型 + mock 降级双路线，所有模型调用走 Model Adapter。
- 样例视频只用于结构分析，禁止直接复用样例画面、音频、人物、品牌、字幕和原文案。
- P0 主案例锁定营销类商品短视频，后续可扩展口播、vlog、剪辑卡点、MG。
- 评测时可能使用评委提供的视频素材，不只看我们提交时绑定的 case；系统必须能处理外部替换输入。
- P0 不做账号系统、复杂项目管理和历史记录，只保留导出能力。

## FAQ And Meeting Optimizations

- 官方更关注系统完整性、最终视频产物效果、脚本和结构规划合理性，以及过程中沉淀的剪辑技巧/知识库信息。
- 最终产物应是可观看的视频，不只是脚本描述或 JSON 结构。
- 官方不提供视频生成模型 token，提供的 Doubao-Seed-2.0-lite 不能直接生成视频；因此 P0 不依赖视频生成模型。
- Remotion、HyperFrames 属于基础框架，允许深度集成；自主价值体现在结构协议、原子模块、知识库检索、补全策略和最终编排效果。
- 样例结构不能作为完整模板写死；需要拆成更细的原子化剪辑技巧、节奏模式、包装模块和素材槽位协议，再按新需求重新组合。
- 评测素材通常是视频，且更可能是一段长视频素材，而不是已经切好的多分镜素材。
- 评委会用自己的素材试用系统，所以不能只做固定 demo 数据；必须保留 mock 演示，但主流程要能接受新视频输入。
- 生成速度和延迟不是核心评分点；可以采用异步任务和进度状态，重点保证最终结构和视频效果。
- 可以针对某一垂类专项开发，不会因覆盖类型少而扣分；需要在文档中说明方向，评测会尽量使用对应类型的视频素材。
- 不要求部署上线，能本地拉起并跑通主干流程即可；但仍建议提供可视化 Web 界面。
- 不要求真实平台投放数据，“爆款”重点体现在结构学习、知识沉淀和产物观感，而不是实际跑量。
- 自动化主流程最低形态应达到：上传视频 -> 自动解析结构 -> 输入诉求/主题 -> 基于知识库生成新视频。
- 知识库既可以来自赛前拆解的多个爆款样例，也可以来自用户现场上传视频的现学现用；系统会随着拆解样例增多而产出更好。

## Solution

系统提供一个 React / TypeScript / Node.js 产品原型。用户上传一条或多条样例视频用于结构学习，再输入一段待重构的长视频素材和提示词/商品信息。系统使用 FFmpeg、ASR、LLM、多模态理解接口和规则引擎生成结构画像，抽取脚本段落、节奏特征和素材槽位，并把这些经验原子化沉淀到结构知识库。随后系统检索适用的结构原子，把样例结构和知识库经验迁移到新视频素材上，生成脚本、分镜、时间线草案、包装建议，并用 Remotion + FFmpeg 生成 10-20 秒左右的低保真成片 demo。

MVP 不追求完整替代剪辑软件，而是优先做出评审能看懂的核心闭环：结构抽取可视化、知识库引用、槽位映射、素材缺口提示、补全策略、时间线结果和可播放 demo。视频 demo 以用户提供的长视频为主要素材来源，通过裁切、抽帧、局部放大、重复利用、字幕卡片、卖点卡片、透明包装层和简单转场合成，保证可运行、可解释，并能适应评委替换输入素材。

## User Stories

1. As a 创作者, I want to upload one or more sample videos, so that the system can learn reusable creative structures.
2. As a 创作者, I want to see sample duration, resolution, cover frame, shot count and transcript overview, so that I can verify analysis quality.
3. As a 创作者, I want sample structures to be decomposed into script, rhythm and slot layers, so that I can understand what will be transferred.
4. As a 创作者, I want extracted techniques to enter a reusable knowledge base, so that later generations can benefit from accumulated editing patterns.
5. As a 创作者, I want to upload one long material video plus a prompt, so that the system can reconstruct a short video from real素材.
6. As a 创作者, I want the system to classify material segments and recommend slots, so that I can know which shots are useful.
7. As a 创作者, I want missing slots to be highlighted, so that I can understand what素材 is insufficient.
8. As a 创作者, I want automatic copy/subtitle, packaging-card and reuse suggestions, so that limited素材 can still support the target structure.
9. As a 创作者, I want generated scripts, storyboard, timeline and video demo, so that I can review both reasoning and final output.
10. As a 创作者, I want to adjust hook style, selling point order, rhythm, CTA or packaging style, so that I can keep creative control.
11. As a 评审, I want to replace demo素材 with my own video, so that I can verify the system is not hardcoded to one case.
12. As a 评审, I want a visual comparison between sample structure, knowledge atoms and generated result, so that I can verify structure migration.
13. As a 评审, I want the system to complete the main flow automatically, so that I can evaluate AI automation rather than manual editing skill.
14. As a 开发者, I want all model keys in env variables, so that secrets are not committed.
15. As a 开发者, I want tool boundaries documented, so that risky file and model operations are auditable.

## Functional Requirements

### P0: 基础闭环

1. 样例视频输入与解析
   - 支持上传 1 条或多条样例视频。
   - 展示时长、分辨率、比例、封面帧、镜头数估计、字幕/语音概览。
   - 自动分析包括 FFmpeg 元数据、封面抽帧、镜头切分估计、ASR/字幕概览、初步结构判断。
   - 自动分析是主路径；支持人工校正 hook、段落、槽位、节奏标签，但人工校正不是主流程必需步骤。
   - 无模型 key 或分析失败时，允许使用 mock 分析结果或手动填写，保证 demo 不断链。

2. 结构拆解
   - 脚本结构：识别 hook、展开、证明/卖点、offer、CTA。
   - 节奏结构：识别镜头切换频率、段落时长、高潮位置、快慢变化。
   - 素材槽位结构：抽取每个结构段落需要的素材类型、画面意图、时长和重要性。
   - 原子化拆解：把完整样例拆成 hook 手法、节奏段、字幕/标题条模块、卖点推进方式、转场/卡点方式、缺口补全方式。
   - P0 不做复杂包装识别，但输出基础字幕、标题条、卖点卡片、转场和封面建议。

3. 结构知识库
   - P0 维护一个轻量结构知识库，存储已抽取的脚本结构、节奏结构、素材槽位、包装建议、原子技巧和适用场景。
   - 知识库由内置营销类种子原子和用户上传样例共同构成。
   - P0 至少内置若干营销类原子技巧，例如痛点 hook、商品亮相、卖点三连、对比证明、强 CTA、节奏加速、卖点卡片补位。
   - 生成时需要展示引用了哪些结构经验，例如 hook 类型、卖点推进方式、节奏模式、缺口补全策略。
   - 知识库不要求预先学习大量视频，但需要能沉淀当前项目中的样例拆解结果。

4. 新内容与素材输入
   - 支持输入营销类商品短视频的主题、商品名、卖点、目标人群、语气风格。
   - P0 主路径支持上传一段长视频素材，并结合提示词/商品信息重构生成新短视频。
   - 支持上传图片或文案作为辅助素材，但评测适配优先保障视频素材输入。
   - 长视频需要支持抽帧、粗切、片段候选、封面候选和可用镜头推荐。
   - 文案拆成卖点、痛点、使用场景、CTA。
   - 每个素材给出可匹配的结构槽位和置信度。

5. 结构迁移与结果生成
   - P0 固定输出脚本、分镜、时间线可视化和低保真成片 demo。
   - 输出视频默认目标时长为 10-20 秒，允许用户调整。
   - 时间线草案包含时间码、槽位、素材引用、字幕、包装、转场、BGM/节奏说明。
   - 生成逻辑必须体现“基于结构原子和知识库重构”，不是按样例模板机械拼接素材。
   - 系统先检索适用原子，再组合成新的 Composition Plan，最后生成 timeline 和 video demo。
   - 输出必须包含可观看视频 demo；脚本、分镜和 JSON 是解释与调试材料，不可替代最终视频产物。

### P0: 素材缺口处理

6. 素材缺口识别
   - 对每个结构槽位输出匹配状态：已满足、弱匹配、缺失。
   - 缺口包含槽位名称、缺失原因、影响程度和推荐补全方式。
   - 至少覆盖 5 类常见缺口：开头吸引镜头、商品特写、使用过程、对比镜头、结尾 CTA 镜头。

7. 素材缺口补全
   - 文案/字幕补全：用字幕、旁白、卖点卡片补足表达。
   - 包装卡片补全：生成标题条、卖点卡片、强调贴纸、转场建议。
   - 现有素材重组复用：建议裁切、局部放大、重复利用、镜头重排。
   - 结构重排：当缺失高成本镜头时，调整段落顺序或降低对应槽位依赖。
   - AIGC 补全只预留接口，不作为 P0 成功条件；如果配置可用，可生成静态封面、背景或配音作为增强素材。

### P0: 可展示结果

8. 迁移过程可视化
   - 展示抽取出的结构层级。
   - 展示结构知识库引用和原子技巧组合。
   - 展示结构槽位和新素材的映射。
   - 展示素材缺口和补全策略。
   - 展示最终脚本、分镜、时间线和 demo。

9. 结果可验证
   - 提供样例结构 vs 新结果结构的对比展示。
   - 提供时间线可视化结果。
   - 使用 Remotion 渲染低保真成片 demo。
   - 支持 Remotion 生成透明 Alpha 包装层、MG 片段或字幕卡，再由 FFmpeg 与素材视频叠加/拼接。
   - 准备两个演示 case：素材充足 case 和素材不足 case。
   - 支持替换为新的评测视频素材后重新分析和生成，避免只依赖固定样例。

### P0: 人工可调

10. 参数化调整
   - P0 至少支持 hook 方式、卖点顺序、视频节奏、结尾 CTA、包装风格中的 2 项。
   - 调整后重新生成脚本、分镜和时间线。
   - 自然语言改片不进入 P0。

### P1: 进阶能力

11. 画面包装生成：字幕样式、标题条、卖点卡片、转场、封面文案、贴纸/强调元素。
12. 多版本生成：高点击版、高转化版、高节奏版、高质感版。
13. 真实素材增强理解：更细粒度镜头分类、高光筛选、商品/人物/场景识别。
14. 自然语言编辑：把“开头更抓人”“减少字幕”“商品信息提前”等指令解析为结构参数变更。

## Implementation Decisions

- 采用单仓库模块化架构。
- `apps/web`：React + TypeScript 前端工作台，包含样例区、结构区、新内容区、缺口区、结果区。
- `apps/api`：Node.js API，负责上传、分析任务、生成任务、导出任务。
- `packages/core`：结构抽取、槽位匹配、缺口补全、composition plan、时间线生成等纯逻辑。
- `packages/adapters`：FFmpeg、ASR、LLM、AIGC、Remotion 渲染器等工具适配层。
- `packages/knowledge`：结构知识库，负责沉淀样例拆解结果、内置垂类模板、原子技巧和可复用剪辑经验。
- `packages/shared`：共享类型和 schema。
- Video Analyzer：通过 FFmpeg 获取元数据、封面帧、抽帧、粗切和可选镜头切分。
- Speech Adapter：ASR 或 mock transcript。
- Model Adapter：支持火山方舟 Doubao/OpenAI-compatible API，所有密钥来自环境变量。
- Structure Extractor：输入样例元数据、镜头、字幕、用户补充说明，输出规范化结构 JSON 和 technique atoms。
- Long Video Segmenter：输入长视频，输出候选片段、封面帧、可用镜头、粗粒度槽位推荐。
- Asset Classifier：输入用户素材，输出素材类型、可用槽位、置信度和备注。
- Knowledge Retriever：输入垂类、目标、样例结构和用户提示词，输出可引用的结构原子和经验。
- Slot Matcher：输入结构槽位和素材分类，输出匹配状态、缺口和影响。
- Gap Planner：输入缺口和业务目标，输出文案、包装、重排、复用或 AIGC 补全方案。
- Creative Composer：输入结构原子、素材匹配和补全策略，输出脚本、分镜、composition plan、timeline、包装建议。
- Remotion Renderer：把 timeline 渲染为低保真 demo，可生成透明包装层；FFmpeg 负责元数据、抽帧、素材预处理、叠加、拼接、压缩。
- Web UI 遵循 `docs/UI_GUIDELINES.md`：首屏是创作结构控制台，不做 landing page；重点展示结构抽取、知识库引用、槽位映射、缺口补全和时间线结果。
- 长耗时分析和渲染采用异步任务、进度状态和失败重试；生成速度不是核心目标，但不能让用户误以为任务卡死。
- P0 不做账号、权限、复杂项目管理和历史记录，只保留分析 JSON、脚本 Markdown、时间线 JSON、demo 视频等导出能力。

## Suggested Data Shapes

```ts
type CreativeStrategy = "balanced" | "high_click" | "high_conversion" | "high_rhythm" | "premium";

type SourceInput = {
  sampleVideoIds: string[];
  materialVideoId: string;
  prompt: string;
  targetDurationSec: number;
  auxiliaryAssetIds: string[];
};

type StructureSlot = {
  id: string;
  segment: "hook" | "body" | "proof" | "offer" | "cta";
  intent: string;
  requiredAssetTypes: Array<"product_closeup" | "usage" | "comparison" | "person" | "scene" | "text_card" | "cover">;
  durationSec: number;
  importance: "high" | "medium" | "low";
  rhythmHint: "fast" | "medium" | "slow";
  packagingHints: string[];
};

type TechniqueAtom = {
  id: string;
  kind: "hook" | "rhythm" | "slot" | "packaging" | "transition" | "cta" | "gap_fill";
  name: string;
  intent: string;
  applicableWhen: string[];
  constraints: string[];
  outputHint: string;
};

type KnowledgeEntry = {
  id: string;
  source: "seed" | "sample_video" | "material_video";
  vertical: "marketing" | "vlog" | "talking_head" | "cutting" | "motion_graph";
  atoms: TechniqueAtom[];
  structureSlots: StructureSlot[];
  rhythmPattern: string;
  packagingPattern: string[];
  applicableWhen: string[];
};

type SlotMatch = {
  slotId: string;
  status: "matched" | "weak_match" | "missing";
  assetIds: string[];
  confidence: number;
  reason: string;
  gapPlan?: {
    strategy: "copy" | "packaging" | "reorder" | "reuse" | "aigc";
    output: string;
  };
};

type CompositionPlan = {
  id: string;
  strategy: CreativeStrategy;
  selectedAtomIds: string[];
  slotMatches: SlotMatch[];
  rationale: string[];
};

type TimelineItem = {
  id: string;
  startSec: number;
  endSec: number;
  slotId: string;
  assetIds: string[];
  caption: string;
  packaging: string[];
  transition?: string;
  beatHint?: string;
};
```

## Tool Protocol

每个外部工具以 Adapter 形式接入，并声明：

- `name`：工具名称。
- `inputSchema`：结构化输入。
- `outputSchema`：结构化输出。
- `requiredEnv`：所需环境变量。
- `filePermissions`：允许读取和写入的目录。
- `timeoutMs`：超时时间。
- `fallback`：失败后的降级策略。

P0 工具包括：

- FFmpeg Adapter：元数据、抽帧、长视频粗切、叠加、拼接、压缩。
- Speech Adapter：ASR 或 mock transcript。
- Model Adapter：结构总结、原子技巧抽取、文案生成、缺口补全、包装建议。
- Knowledge Adapter：本地结构知识库读写和检索。
- Remotion Adapter：低保真 demo、透明包装层、MG 片段和字幕卡渲染。
- AIGC Completion Adapter：仅预留，不作为 P0 必需。

## Safety Boundaries

- 样例视频只用于结构分析和经验沉淀。
- 禁止把样例视频画面、音频、人物、品牌、原字幕、原文案直接放入新结果。
- 生成结果只能复用结构描述、原子技巧和包装方法。
- 模型提示词必须明确要求不得改写、搬运或模仿样例的具体表达。
- 用户上传素材只在配置的数据目录内处理。
- 密钥只从环境变量读取，不进入仓库。
- 默认禁止远程 URL 上传，避免服务端主动拉取未知资源。
- 模型日志默认不记录 prompt 和 response，避免泄露用户素材和商业信息。
- 外部生成内容需要在结果中标记来源和补全策略。
- 评测素材和用户素材不得被默认写入公开仓库；导出结果需要区分原始素材、衍生素材和 AI 补全素材。

## Testing Decisions

- 测试外部行为，不测试内部提示词细节。
- Structure Extractor 测试输出是否包含脚本结构、节奏结构、素材槽位和 technique atoms。
- Long Video Segmenter 测试一段长视频是否能产出候选片段、封面帧和槽位推荐。
- Knowledge Retriever 测试是否能根据垂类和提示词返回合适的结构经验。
- Slot Matcher 使用人工构造的槽位和素材分类测试缺口识别。
- Gap Planner 测试不同缺口是否产生可执行补全策略。
- Creative Composer 测试生成结果是否覆盖脚本、分镜、composition plan、timeline 和包装建议。
- Remotion Adapter 测试给定 timeline 是否能生成可播放 demo。
- API 测试覆盖上传、分析任务状态、生成任务状态和失败降级。
- 前端测试覆盖核心工作流：上传样例、输入新内容、查看知识库引用、查看映射、查看缺口、生成结果。
- E2E 评测适配测试使用替换视频素材，验证系统不依赖固定 demo case。

## Acceptance Criteria

- 用户能完成从样例上传到生成视频 demo 的完整流程。
- 系统能展示样例基础信息、脚本结构、节奏结构、素材槽位结构和原子技巧。
- 系统能输入营销类商品信息、一段长视频素材和提示词，并判断素材是否支撑结构槽位。
- 系统能在替换评测视频素材后重新完成分析、匹配、缺口识别和生成。
- 系统能沉淀并展示至少一个结构知识库条目，说明生成时引用了哪些剪辑技巧或结构经验。
- 系统能识别至少 5 类常见缺口：开头吸引镜头、商品特写、使用过程、对比镜头、结尾 CTA。
- 系统支持文案/字幕补全、包装卡片补全、现有素材重组复用中的至少一种；P0 目标为三种都支持基础版本。
- 系统固定输出脚本、分镜、时间线可视化和低保真成片 demo。
- 默认生成视频目标时长为 10-20 秒，时间线和 demo 时长一致。
- UI 能展示抽取结构、知识库引用、映射关系、缺口、补全策略和最终结果。
- P0 至少支持 2 个参数化调整项并能重新生成结果。
- 无真实 API key 时，demo 仍可通过 mock 模式演示核心链路。
- 说明文档包含整体 AI 架构、工具协议、安全边界、AI 工具使用说明。

## Out of Scope

- P0 不做账号系统、权限系统、复杂项目管理和历史记录。
- P0 不承诺生成商业级高质量成片。
- P0 不承诺精准识别所有字幕、贴纸和复杂转场。
- P0 不承诺完整复刻剪映工程文件。
- P0 不承诺自动发布到平台。
- P0 不要求真实视频平台投放、跑量或效果数据。
- P0 不把生成速度和模型延迟作为核心优化目标，但需要清晰展示任务进度。
- P0 不使用样例视频中的人物、品牌、原文案或受版权保护素材生成新结果。
- P0 不做复杂多人协作、计费系统和素材版权管理系统。
- P0 不把自然语言改片、多版本生成、深度包装识别作为成功条件。

## Delivery Plan

1. 基础工程：单仓库、web/api/core/adapters/knowledge/shared、env.example、mock 数据。
2. 核心结构模型：StructureSlot、TechniqueAtom、KnowledgeEntry、SlotMatch、CompositionPlan、TimelineItem。
3. 样例解析：上传、FFmpeg 元数据、封面帧、mock/ASR transcript、人工校正。
4. 结构抽取：脚本结构、节奏结构、素材槽位结构、原子技巧。
5. 结构知识库：内置营销类种子原子，存储样例拆解结果，支持检索引用。
6. 长视频素材适配：抽帧、粗切、片段候选、槽位推荐。
7. 缺口引擎：槽位匹配、缺口识别、影响说明。
8. 补全引擎：文案/字幕、包装卡片、素材重组复用。
9. 结果生成：脚本、分镜、composition plan、10-20 秒时间线、包装建议。
10. 可视化工作台：样例结构、知识库引用、映射、缺口、结果对比。
11. Remotion demo：根据 timeline 渲染低保真成片，必要时生成透明包装层并用 FFmpeg 叠加。
12. 替换素材测试：使用非固定 demo 视频跑通主流程。
13. 导出：分析 JSON、知识库 JSON、脚本 Markdown、时间线 JSON、demo 视频。
14. 说明文档：整体 AI 架构、工具协议、安全边界、AI 工具使用说明。

## Further Notes

- 项目优先级按评分项最大化推进：先闭环，再知识库和缺口，再可展示，再 P1 加分。
- 主演示案例为营销类商品短视频，剪辑类和 Motion Graph 类作为后续扩展方向。
- FAQ 和会议纪要都表明“支持种类多”不是核心，最终观感和结构规划质量更重要；因此 P0 不扩散垂类。
- 官方测试素材以视频为主，通常是一段长视频；演示素材可以自选，但系统必须能适配替换输入。
- 竞赛交付应包含代码仓库、演示视频、视频产物 case、项目说明文档。
- 项目说明文档需要单独列出 AI 辅助工具使用情况：使用了哪些工具、用于哪些环节、哪些部分自主设计与实现。
