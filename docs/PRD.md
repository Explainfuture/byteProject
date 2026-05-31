# PRD: 爆款结构迁移引擎

## Problem Statement

短视频创作者能感知哪些视频更容易出效果，但很难把这种经验拆解成可复用结构，也很难在新商品、新主题或素材不足时稳定复现类似的表达效果。评审需要看到系统如何从样例中抽取结构、如何映射到新内容、如何识别素材缺口、如何补全并生成可验证的视频结果。

本项目要做的是一个 AI 创作平台，围绕“单视频理解 -> 关键帧抽取 -> 结构抽取 -> 知识沉淀 -> 结果生成”的闭环，让用户上传一个优质样例视频后，系统从视频帧中拆解可迁移的创作方法，并结合新的主题、商品信息或卖点生成可解释、可调整、可展示、可播放的短视频方案。

## Confirmed Scope

- P0 主验证结果为：脚本、分镜、时间线可视化、10 个本地 Remotion/HyperFrames 风格赛道预览 demo。demo 必须可播放或可交互预览，但 P0 不承诺服务端导出 MP4。
- P0 视频结构定义锁定为三层：脚本结构、节奏结构、素材槽位结构。
- P0 包装结构不做深度识别，但输出基础包装建议，并在浏览器预览/时间线中表达包装意图；真实透明包装层资源生成和叠加放 P1。
- P0 输入主路径为“一个视频 + 提示词/商品信息”。这一个视频既是结构学习来源，也是可用画面支撑度评估来源。
- P0 输出视频默认控制在 10-20 秒，允许扩展到 60 秒内；所有预览赛道必须小于等于 1 分钟。
- P0 缺口补全不依赖视频生成模型，先做文案/字幕补全、包装卡片补全、现有素材重组复用。
- AIGC 封面、背景、配音、补充画面只做接口预留，作为 P1/加分项；P0 不宣传真实 AIGC 补全能力。
- 自动化是主路径，人工校正只作为兜底和演示可控性。
- 单视频适配做关键帧抽取、片段候选、轻量分类和槽位推荐，不追求复杂逐帧视觉理解。
- P0 采用“单视频双用模式”：用户上传一条视频，该视频同时作为样例结构学习来源和可用素材支撑度评估来源。多条样例视频、独立素材视频上传和样例库批量学习放到 P1/增强项。
- 多版本并列生成放 P1；P0 支持策略化单版本生成，用户可选择高点击、高转化、高节奏、高质感等策略，但每次只生成一个主方案。
- 自然语言精确改片放 P1，P0 支持参数控件调整，并可提供轻量对话式重新生成作为演示增强。
- 技术架构采用单仓库模块化：前端工作台 + Node API + core 深模块 + adapters + knowledge。
- 低保真生成预览 demo 使用 Remotion Player、HyperFrames 风格描述或 HTML timeline preview 为主；服务端 Remotion/FFmpeg MP4 合成放到 P1/增强项。
- 模型接入采用真实模型 + mock 降级双路线，所有模型调用走 Model Adapter。
- Model Adapter 需要保持 provider 可替换，不把 P0 能力绑定到某一个模型。当前可使用 Ark/Doubao-compatible 接口，后续可替换为其他多模态/语言模型，只要遵守同一输入输出协议和安全边界。
- P0 视频理解承诺为关键帧级轻量理解：上传视频后抽取少量关键帧，模型可用时用多模态接口增强结构分析，模型不可用时使用视频元数据、关键帧数量、Brief 和本地规则降级。P0 不承诺完整 ASR、逐镜头精准切分或逐帧视觉理解。
- P0 素材缺口识别承诺为结构槽位支撑度诊断：判断当前视频候选片段是否足以支撑目标结构槽位，并解释弱匹配/缺失原因。真实商品、人物、场景等视觉语义检测放到 P1。
- P0 结构知识库为会话级知识库：内置种子原子 + 当前运行会话内新增的样例拆解结果。跨重启持久化、数据库/文件存储和知识库导入导出放到 P1/增强项。
- UI 只展示脱敏后的模型状态、关键帧数量、降级原因和产品化错误；API 对外错误不得返回 provider 原始响应、堆栈、密钥、上传路径或本地绝对路径。
- P0 承诺 Agent 化工具编排体验，不承诺完全自主 Agent。系统有固定工具路径、trace 展示和确定性 fallback；模型可用时可参与工具调用和创意增强，模型不可用时由 workflow 跑通主链路。
- 系统 P0 输出和比赛交付物分开定义：系统 P0 输出为浏览器生成预览 demo + 结构化结果；最终提交的视频产物 case 可以通过录屏、手动导出预览或后续增强脚本生成，不要求 P0 在线生成 MP4 文件。
- 样例视频只用于结构分析，禁止直接复用样例画面、音频、人物、品牌、字幕和原文案。
- P0 主案例锁定营销类商品短视频，后续可扩展口播、vlog、剪辑卡点、MG。
- 评测时可能使用评委提供的视频，不只看我们提交时绑定的 case；系统必须能处理外部替换输入。
- P0 不做账号系统、复杂项目管理和历史记录，只保留导出能力。

## FAQ And Meeting Optimizations

- 官方更关注系统完整性、最终视频产物效果、脚本和结构规划合理性，以及过程中沉淀的剪辑技巧/知识库信息。
- 最终产物应是可观看/可交互的生成预览，不只是脚本描述或 JSON 结构；MP4 视频文件作为交付 case 或增强项处理。
- 官方不提供视频生成模型 token，提供的 Doubao-Seed-2.0-lite 不能直接生成视频；因此 P0 不依赖视频生成模型。
- Doubao-Seed-2.0-lite / Ark 作为 OpenAI-compatible LLM/视觉理解链路接入，用于分析抽帧、增强脚本、生成 Remotion/HyperFrames 渲染提示；密钥和 endpoint 只能通过环境变量配置，不进入仓库、UI 或导出结果。
- 抽帧预算采用中等策略：默认最少 4 张、最多 16 张，约每 4 秒一帧；避免上传视频越长就无限抽帧。
- Remotion、HyperFrames 属于基础框架，允许深度集成；自主价值体现在结构协议、原子模块、知识库检索、补全策略和最终编排效果。
- 样例结构不能作为完整模板写死；需要拆成更细的原子化剪辑技巧、节奏模式、包装模块和素材槽位协议，再按新需求重新组合。
- 评测输入通常是视频，而不是已经切好的多分镜素材。
- 评委会用自己的素材试用系统，所以不能只做固定 demo 数据；必须保留 mock 演示，但主流程要能接受新视频输入。
- 生成速度和延迟不是核心评分点；可以采用异步任务和进度状态，重点保证最终结构和视频效果。
- 可以针对某一垂类专项开发，不会因覆盖类型少而扣分；需要在文档中说明方向，评测会尽量使用对应类型的视频素材。
- 不要求部署上线，能本地拉起并跑通主干流程即可；但仍建议提供可视化 Web 界面。
- 不要求真实平台投放数据，“爆款”重点体现在结构学习、知识沉淀和产物观感，而不是实际跑量。
- 自动化主流程最低形态应达到：上传视频 -> 自动解析结构 -> 输入诉求/主题 -> 基于知识库生成新视频。
- 知识库既可以来自赛前拆解的多个爆款样例，也可以来自用户现场上传视频的现学现用；系统会随着拆解样例增多而产出更好。

## Solution

系统提供一个 React / TypeScript / Node.js 产品原型。用户上传一个视频用于结构学习和关键帧拆解，再输入新主题、商品信息、卖点和目标人群。系统使用 FFmpeg、ASR、LLM、多模态理解接口和规则引擎生成结构画像，抽取脚本段落、节奏特征、字幕样式、画面包装、转场和 BGM 卡点，并把这些经验原子化沉淀到结构知识库。随后系统检索适用的结构原子，把样例结构和知识库经验迁移到新的创作 Brief 上，生成脚本、分镜、时间线草案、包装建议和 Remotion/HyperFrames 渲染提示，并用 Remotion Player 或 HTML timeline preview 生成 10 个风格赛道预览 demo。

MVP 不追求完整替代剪辑软件，也不把服务端 MP4 导出作为 P0 硬承诺，而是优先做出评审能看懂的核心闭环：结构抽取可视化、知识库引用、槽位映射、素材缺口提示、补全策略、时间线结果和可播放/可交互预览 demo。预览 demo 以用户上传的视频信息、生成时间线和预览级包装表达为基础，通过抽帧说明、局部放大建议、重复利用建议、字幕卡片、卖点卡片和简单转场表达成片意图，保证可运行、可解释，并能适应评委替换输入视频。

## User Stories

1. As a 创作者, I want to upload one video, so that the system can learn reusable creative structures from extracted frames.
2. As a 创作者, I want to see video duration, resolution, cover frame, shot count and transcript overview, so that I can verify analysis quality.
3. As a 创作者, I want the uploaded video structure to be decomposed into script, rhythm and slot layers, so that I can understand what will be transferred.
4. As a 创作者, I want extracted techniques to enter a reusable knowledge base, so that later generations can benefit from accumulated editing patterns.
5. As a 创作者, I want to provide a new prompt and product information, so that the system can migrate the learned method to a new short-video plan.
6. As a 创作者, I want the system to classify extracted frames/segments and recommend slots, so that I can know which visual sections are useful.
7. As a 创作者, I want missing slots to be highlighted, so that I can understand what素材 is insufficient.
8. As a 创作者, I want automatic copy/subtitle, packaging-card and reuse suggestions, so that limited素材 can still support the target structure.
9. As a 创作者, I want generated scripts, storyboard, timeline and video demo, so that I can review both reasoning and final output.
10. As a 创作者, I want to adjust hook style, selling point order, rhythm, CTA or packaging style, so that I can keep creative control.
11. As a 评审, I want to replace the demo video with my own video, so that I can verify the system is not hardcoded to one case.
12. As a 评审, I want a visual comparison between sample structure, knowledge atoms and generated result, so that I can verify structure migration.
13. As a 评审, I want the system to complete the main flow automatically, so that I can evaluate AI automation rather than manual editing skill.
14. As a 开发者, I want all model keys in env variables, so that secrets are not committed.
15. As a 开发者, I want tool boundaries documented, so that risky file and model operations are auditable.

## Functional Requirements

### P0: 基础闭环

1. 样例视频输入与解析
   - P0 支持上传 1 条视频，并以单视频双用模式完成样例拆解和素材支撑度评估。
   - 多条样例视频、样例集合管理和独立素材视频上传作为 P1/增强项，不作为 P0 成功条件。
   - 展示时长、分辨率、比例、关键帧/封面候选、镜头数估计、字幕/语音概览或模型/规则推断概览。
   - 自动分析包括 FFmpeg 元数据、关键帧抽取、粗粒度镜头数估计、可选 ASR/字幕概览、初步结构判断。
   - 系统需要在结果中标注当前分析来自在线视觉模型增强还是本地规则降级。
   - 自动分析是主路径；支持人工校正 hook、段落、槽位、节奏标签，但人工校正不是主流程必需步骤。
   - 无模型 key 或分析失败时，允许使用 mock 分析结果或手动填写，保证 demo 不断链。

2. 结构拆解
   - 脚本结构：识别 hook、展开、证明/卖点、offer、CTA。
   - 节奏结构：识别镜头切换频率、段落时长、高潮位置、快慢变化。
   - 素材槽位结构：抽取每个结构段落需要的素材类型、画面意图、时长和重要性。
   - 原子化拆解：把完整样例拆成 hook 手法、节奏段、字幕/标题条模块、卖点推进方式、转场/卡点方式、缺口补全方式。
   - P0 不做复杂包装识别，但输出基础字幕、标题条、卖点卡片、转场和封面建议，并在时间线/浏览器预览中表达包装意图。

3. 结构知识库
   - P0 维护一个轻量会话级结构知识库，记录已抽取的脚本结构、节奏结构、素材槽位、包装建议、原子技巧和适用场景。
   - 知识库由内置营销类种子原子和用户上传样例共同构成。
   - P0 至少内置若干营销类原子技巧，例如痛点 hook、商品亮相、卖点三连、对比证明、强 CTA、节奏加速、卖点卡片补位。
   - 生成时需要展示引用了哪些结构经验，例如 hook 类型、卖点推进方式、节奏模式、缺口补全策略。
   - 知识库不要求预先学习大量视频；P0 只承诺当前运行会话内可新增和引用样例拆解结果，不承诺跨重启持久化。

4. 新内容输入与单视频支撑度评估
   - 支持输入营销类商品短视频的主题、商品名、卖点、目标人群、语气风格。
   - P0 主路径支持上传一条视频，并结合提示词/商品信息重构生成新短视频方案。
   - 该视频同时用于结构学习和可用画面评估；系统需要支持关键帧抽取、粗粒度片段候选、封面候选和可用画面推荐。
   - 文案拆成卖点、痛点、使用场景、CTA。
   - 每个候选帧/片段给出可匹配的结构槽位和置信度。

5. 结构迁移与结果生成
   - P0 固定输出脚本、分镜、时间线可视化、渲染提示和 10 个本地风格赛道预览 demo。
   - P0 支持策略化单版本生成：同一内容可选择不同生成策略重新生成，但一次只产出一个主方案。
   - 输出视频默认目标时长为 10-20 秒，允许用户调整到 60 秒内。
   - 时间线草案包含时间码、槽位、素材引用、字幕、包装、转场、BGM/节奏说明。
   - 预览赛道至少覆盖电商爆品、测评对比、B 端营销、口播知识、生活 Vlog、MG 信息流、活动促销、教程步骤、品牌质感、剪辑卡点 10 类。
   - 生成逻辑必须体现“基于结构原子和知识库重构”，不是按样例模板机械拼接素材。
   - 系统先检索适用原子，再组合成新的 Composition Plan，最后生成 timeline 和 video demo。
   - 输出必须包含可观看/可交互预览 demo；脚本、分镜和 JSON 是解释与调试材料，不可替代最终展示结果。

### P0: 素材缺口处理

6. 素材缺口识别
   - P0 的缺口识别以结构槽位支撑度诊断为准，不承诺真实视觉语义级缺失检测。
   - 对每个结构槽位输出匹配状态：已满足、弱匹配、缺失。
   - 缺口包含槽位名称、支撑度不足原因、影响程度、置信度和推荐补全方式。
   - 展示层至少覆盖 5 类常见缺口名称：开头吸引镜头、商品特写、使用过程、对比镜头、结尾 CTA 镜头；这些名称来自槽位协议和候选片段类型推断。

7. 素材缺口补全
   - 文案/字幕补全：用字幕、旁白、卖点卡片补足表达。
   - 包装卡片补全：生成标题条、卖点卡片、强调贴纸、转场建议等方案文本，并在预览中表达其使用位置。
   - 现有素材重组复用：建议裁切、局部放大、重复利用、镜头重排。
   - 结构重排：当缺失高成本镜头时，调整段落顺序或降低对应槽位依赖。
   - AIGC 补全只预留接口，不作为 P0 成功条件，也不在当前能力中宣传为真实可用补全；如果后续配置可用，可生成静态封面、背景或配音作为增强素材。

### P0: 可展示结果

8. 迁移过程可视化
   - 展示抽取出的结构层级。
   - 展示结构知识库引用和原子技巧组合。
   - 展示结构槽位和单视频候选画面的映射。
   - 展示素材缺口和补全策略。
   - 展示最终脚本、分镜、时间线和 demo。

9. 结果可验证
   - 提供样例结构 vs 新结果结构的对比展示。
   - 提供时间线可视化结果。
   - 使用 Remotion Player、HyperFrames 风格描述或 HTML timeline preview 渲染低保真生成预览 demo。
   - 服务端 Remotion 生成透明 Alpha 包装层、MG 片段或字幕卡，并由 FFmpeg 与素材视频叠加/拼接，作为 P1/增强项。
   - 准备两个演示 case：素材充足 case 和素材不足 case。
   - 支持替换为新的评测视频素材后重新分析和生成，避免只依赖固定样例。

### P0: 人工可调

10. 参数化调整
   - P0 至少支持 hook 方式、卖点顺序、视频节奏、结尾 CTA、包装风格中的 2 项。
   - 调整后重新生成脚本、分镜和时间线。
   - P0 可支持“轻量对话式重新生成”：把用户一句话追加到下一轮 Brief 中重新生成整体方案，但不承诺精确局部剪辑、不承诺只修改单个镜头、不承诺保留所有 timeline id。
   - 自然语言精确改片不进入 P0。

### P1: 进阶能力

11. 真实画面包装生成：生成字幕样式、标题条、卖点卡片、转场、封面文案、贴纸/强调元素等可复用包装资源，并能叠加到视频或导出为透明包装层。
12. 多样例/独立素材输入：支持多条样例视频学习、独立上传新素材视频，并在样例结构和新素材之间做更明确的跨视频迁移。
13. 持久化结构知识库：支持将样例拆解结果保存到 JSON/SQLite/文件系统，跨重启复用，并支持导入导出。
14. 多版本并列生成：同一输入一次性产出高点击版、高转化版、高节奏版、高质感版等多个完整方案，并能对比脚本、分镜、时间线和预览差异。
15. 真实素材增强理解：更细粒度镜头分类、高光筛选、商品/人物/场景识别。
16. 自然语言精确编辑：把“开头更抓人”“减少字幕”“商品信息提前”等指令解析为结构参数变更，并尽量局部更新既有脚本、分镜、时间线和预览。

## Implementation Decisions

- 采用单仓库模块化架构。
- `apps/web`：React + TypeScript 前端工作台，包含单视频输入区、结构区、新内容区、缺口区、结果区。
- `apps/api`：Node.js API，负责上传、分析任务、生成任务、导出任务。
- `packages/core`：结构抽取、槽位匹配、缺口补全、composition plan、时间线生成等纯逻辑。
- `packages/adapters`：FFmpeg、ASR、LLM、AIGC、Remotion 渲染器等工具适配层。
- `packages/knowledge`：会话级结构知识库，负责管理内置垂类模板、原子技巧和当前运行会话内新增的可复用剪辑经验。
- `packages/shared`：共享类型和 schema。
- Video Analyzer：通过 FFmpeg 获取元数据、关键帧、粗粒度片段候选和可选镜头数估计。
- Speech Adapter：可选 ASR 或 mock transcript；P0 不要求完整真实 ASR。
- Model Adapter：支持 Ark/Doubao-compatible 或其他可替换模型 provider，所有密钥来自环境变量，模型输入输出协议保持稳定。
- Structure Extractor：输入样例元数据、镜头、字幕、用户补充说明，输出规范化结构 JSON 和 technique atoms。
- Frame / Segment Evaluator：输入上传视频的关键帧和候选片段，输出封面候选、可用画面、粗粒度槽位推荐。
- Asset Classifier：输入单视频候选画面或规则片段，输出画面类型、可用槽位、置信度和备注；P0 可由模型增强或规则降级完成。
- Knowledge Retriever：输入垂类、目标、样例结构和用户提示词，输出可引用的结构原子和经验。
- Slot Matcher：输入结构槽位和候选片段分类，输出槽位支撑度、匹配状态、缺口和影响。
- Gap Planner：输入缺口和业务目标，P0 输出文案、包装、重排或复用补全方案；AIGC 补全仅保留接口和策略枚举。
- Creative Composer：输入结构原子、画面支撑度和补全策略，输出脚本、分镜、composition plan、timeline、包装建议。
- Remotion Preview Renderer：把 timeline 渲染为浏览器可播放/可交互的低保真 demo，并生成 10 个本地风格赛道预览，表达字幕卡、标题条、卖点卡片、转场等包装意图；服务端 Remotion/FFmpeg 合成包装层和 MP4 放到 P1/增强项。
- Web UI 遵循 `docs/UI_GUIDELINES.md`：首屏是创作结构控制台，不做 landing page；重点展示结构抽取、知识库引用、槽位映射、缺口补全和时间线结果。
- 长耗时分析和渲染采用异步任务、进度状态和失败重试；生成速度不是核心目标，但不能让用户误以为任务卡死。
- 当前主链路已对模型状态做脱敏展示；通用 API 500 错误仍需在实现中改为产品化错误响应，避免把原始异常消息透出给评审或用户。
- Agent 编排采用“固定工具路径 + 可选模型工具调用 + deterministic fallback”。UI 展示工具步骤和降级状态，避免让用户误以为每一步都由模型自主规划。
- P0 不做账号、权限、复杂项目管理和历史记录，只保留分析 JSON、脚本 Markdown、时间线 JSON、浏览器预览 demo 等导出能力；MP4 视频产物 case 可通过录屏、手动导出或后续增强脚本准备。

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

P0 UI 只发送 1 个 `sampleVideoIds[0]`，且默认 `materialVideoId = sampleVideoIds[0]`。数组字段保留用于 P1 多样例和独立素材扩展。

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
- Knowledge Adapter：会话级结构知识库读写和检索；跨重启持久化作为 P1/增强项。
- Remotion Adapter：P0 负责低保真浏览器预览、10 个风格赛道预览和预览级包装表达；透明包装层、MG 片段、字幕卡服务端渲染和 MP4 合成放到 P1/增强项。
- AIGC Completion Adapter：仅预留，不作为 P0 必需，也不作为当前可演示主能力宣传。

## Safety Boundaries

- 样例视频只用于结构分析和经验沉淀。
- 禁止把样例视频画面、音频、人物、品牌、原字幕、原文案直接放入新结果。
- 生成结果只能复用结构描述、原子技巧和包装方法。
- 模型提示词必须明确要求不得改写、搬运或模仿样例的具体表达。
- 用户上传视频只在配置的数据目录内处理。
- 密钥只从环境变量读取，不进入仓库。
- 默认禁止远程 URL 上传，避免服务端主动拉取未知资源。
- 模型日志默认不记录 prompt 和 response，避免泄露用户素材和商业信息。
- UI 和 API 响应只允许展示产品化错误、脱敏模型状态和降级原因。禁止向用户暴露 provider 原始错误、HTTP 原始响应体、堆栈、本地绝对路径、上传临时路径、API key 或 endpoint id。
- 外部生成内容需要在结果中标记来源和补全策略。
- 评测素材和用户素材不得被默认写入公开仓库；导出结果需要区分原始素材、衍生素材和 AI 补全素材。

## Testing Decisions

- 测试外部行为，不测试内部提示词细节。
- Structure Extractor 测试输出是否包含脚本结构、节奏结构、素材槽位和 technique atoms，并能标注模型增强或规则降级状态。
- Long Video Segmenter 测试一段长视频是否能产出粗粒度候选片段、封面候选和槽位推荐。
- Knowledge Retriever 测试是否能根据垂类和提示词返回合适的结构经验。
- Slot Matcher 使用人工构造的槽位和候选片段分类测试槽位支撑度诊断。
- Gap Planner 测试不同缺口是否产生可执行补全策略。
- Creative Composer 测试生成结果是否覆盖脚本、分镜、composition plan、timeline 和包装建议。
- Remotion Adapter 测试给定 timeline 是否能生成浏览器可播放/可交互预览 demo。
- API 测试覆盖上传、分析任务状态、生成任务状态和失败降级。
- API 测试需要覆盖错误脱敏：模型鉴权失败、网络失败、上传缺失和内部异常都应返回产品化错误，不返回 provider 原文、堆栈、密钥或本地路径。
- 前端测试覆盖核心工作流：上传单个视频、输入新内容、查看知识库引用、查看映射、查看缺口、生成结果。
- E2E 评测适配测试使用替换视频，验证系统不依赖固定 demo case。

## Acceptance Criteria

- 用户能完成从单条视频上传到生成预览 demo 的完整流程。
- 系统能展示样例基础信息、脚本结构、节奏结构、素材槽位结构和原子技巧。
- 系统能输入营销类商品信息、一条视频和提示词，并判断该视频候选画面是否支撑结构槽位。
- 系统能在替换评测视频后重新完成关键帧级分析、匹配、缺口识别和生成。
- 系统能在当前运行会话内新增并展示至少一个结构知识库条目，说明生成时引用了哪些剪辑技巧或结构经验。
- 系统能展示至少 5 类常见槽位缺口名称：开头吸引镜头、商品特写、使用过程、对比镜头、结尾 CTA，并给出支撑度、原因和补全策略。
- 系统支持文案/字幕补全、包装卡片补全、现有素材重组复用中的至少一种；P0 目标为三种都支持基础版本。
- 系统固定输出脚本、分镜、时间线可视化和低保真生成预览 demo。
- 默认生成视频目标时长为 10-20 秒，可扩展到 60 秒内，时间线和 demo 时长一致。
- 系统能展示 10 个本地预览赛道，每个赛道标明 Remotion/HyperFrames 渲染路径、目标时长和抽帧预算。
- UI 能展示抽取结构、知识库引用、映射关系、缺口、补全策略和最终结果。
- UI 能展示 Agent 化工具步骤、关键观察结果和 fallback 状态，说明分析来自在线模型增强还是确定性工作流。
- P0 至少支持 2 个参数化调整项并能重新生成结果。
- 无真实 API key 时，demo 仍可通过 mock 模式演示核心链路。
- 替换模型 provider 时，不应改变核心结构协议、槽位匹配协议、缺口补全协议和前端展示数据结构。
- 说明文档包含整体 AI 架构、工具协议、安全边界、AI 工具使用说明。

## Out of Scope

- P0 不做账号系统、权限系统、复杂项目管理和历史记录。
- P0 不承诺生成商业级高质量成片。
- P0 不承诺精准识别所有字幕、贴纸和复杂转场，也不承诺生成可直接叠加到视频的真实包装资源。
- P0 不承诺完整复刻剪映工程文件。
- P0 不承诺自动发布到平台。
- P0 不要求真实视频平台投放、跑量或效果数据。
- P0 不把生成速度和模型延迟作为核心优化目标，但需要清晰展示任务进度。
- P0 不使用样例视频中的人物、品牌、原文案或受版权保护素材生成新结果。
- P0 不做复杂多人协作、计费系统和素材版权管理系统。
- P0 不把多样例/独立素材输入、持久化知识库、自然语言精确改片、多版本并列生成、深度包装识别作为成功条件。

## Delivery Plan

1. 基础工程：单仓库、web/api/core/adapters/knowledge/shared、env.example、mock 数据。
2. 核心结构模型：StructureSlot、TechniqueAtom、KnowledgeEntry、SlotMatch、CompositionPlan、TimelineItem。
3. 样例解析：上传、FFmpeg 元数据、封面帧、mock/ASR transcript、人工校正。
4. 结构抽取：脚本结构、节奏结构、素材槽位结构、原子技巧。
5. 结构知识库：内置营销类种子原子，在当前运行会话内记录样例拆解结果，支持检索引用。
6. 单视频关键帧适配：抽帧、粗切、片段候选、槽位推荐。
7. 缺口引擎：槽位匹配、缺口识别、影响说明。
8. 补全引擎：文案/字幕、包装卡片、素材重组复用。
9. 结果生成：脚本、分镜、composition plan、60 秒内时间线、包装建议、渲染提示。
10. 可视化工作台：样例结构、知识库引用、映射、缺口、结果对比。
11. Remotion/HyperFrames/HTML preview demo：根据 timeline 渲染 10 个低保真风格赛道预览；服务端透明包装层和 FFmpeg 叠加作为增强项。
12. 替换视频测试：使用非固定 demo 视频跑通主流程。
13. 导出：分析 JSON、知识库 JSON、脚本 Markdown、时间线 JSON、demo 视频。
14. 说明文档：整体 AI 架构、工具协议、安全边界、AI 工具使用说明。

## Further Notes

- 项目优先级按评分项最大化推进：先闭环，再知识库和缺口，再可展示，再 P1 加分。
- 主演示案例为营销类商品短视频，剪辑类和 Motion Graph 类作为后续扩展方向。
- FAQ 和会议纪要都表明“支持种类多”不是核心，最终观感和结构规划质量更重要；因此 P0 不扩散垂类。
- 官方测试素材以视频为主，通常是一段长视频；演示素材可以自选，但系统必须能适配替换输入。
- 竞赛交付应包含代码仓库、演示视频、视频产物 case、项目说明文档。视频产物 case 是交付材料，不等同于 P0 系统必须在线导出的 MP4；可通过录屏、手动导出预览或后续增强脚本生成。
- 项目说明文档需要单独列出 AI 辅助工具使用情况：使用了哪些工具、用于哪些环节、哪些部分自主设计与实现。
