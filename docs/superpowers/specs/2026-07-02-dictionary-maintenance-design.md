# 离线词典持续更新设计

- 日期：2026-07-02
- 状态：已确认，待实施

## 目标

为语境生词本建立可重复、可审核的离线词典更新流程：

- 开发者可用一条本地命令同步 ECDICT、合并自定义词条并生成分片。
- GitHub Actions 每月检查一次上游变化，有变化时自动创建 PR。
- 自动化不直接合并、不直接发布扩展。
- 扩展运行时继续完全离线，不增加用户权限和操作。

## 总体架构

词典更新分为四层：

1. **上游同步**：解析 ECDICT 最新 commit，并下载该 commit 对应的固定 CSV。
2. **本地合并**：应用筛选规则、自定义覆盖和 blocklist。
3. **质量验证**：验证格式、数量、分片、可重复性和运行时查询。
4. **审核发布**：GitHub Actions 创建更新 PR，由维护者审核后决定是否合并和发布扩展。

运行时只读取打包进扩展的 JSON 分片，不访问 ECDICT、GitHub 或其他词典服务器。

## 文件职责

### 更新与构建脚本

- `scripts/update-dictionary.mjs`
  - 获取 ECDICT 最新 commit。
  - 从固定 commit URL 下载 `ecdict.mini.csv`。
  - 计算 SHA-256。
  - 保存忽略提交的原始 CSV 和来源元数据。
  - 调用构建与检查流程。

- `scripts/build-dictionary.mjs`
  - 解析 ECDICT CSV。
  - 应用现有 Oxford、课程词和前 50,000 频率筛选规则。
  - 解析自定义词条与 blocklist。
  - 按确定性顺序合并并生成 `a-z` 分片。
  - 生成词典索引和来源 manifest。

- `scripts/check-dictionary.mjs`
  - 验证所有分片结构和词条。
  - 比较前后统计信息。
  - 检查自定义词条覆盖结果。
  - 验证相同输入能够产生完全相同的输出。

### 数据文件

- `data/source/ecdict.csv`
  - 从 ECDICT 固定 commit 下载。
  - 保持在 `.gitignore` 中，不提交到仓库。

- `data/source/ecdict-source.json`
  - 保存本次下载使用的 commit、commit 时间、URL 和 SHA-256。
  - 与原始 CSV 一样保持忽略。

- `data/custom-words.csv`
  - 提交到仓库。
  - 用于补充新词、行业词或修正 ECDICT 数据。

- `data/dictionary-blocklist.txt`
  - 提交到仓库。
  - 每行一个规范化单词，用于排除错误或不适合收录的词。

- `public/dictionary/manifest.json`
  - 提交到仓库并随扩展打包。
  - 记录 ECDICT commit、commit 时间、CSV SHA-256、上游词条数、自定义词条数、blocklist 数量和最终词条数。

manifest 不记录实际构建时钟时间。来源时间使用 ECDICT commit 时间，确保相同输入生成完全相同的提交文件。

## 自定义词条格式

`data/custom-words.csv` 字段：

```text
word,phonetic,part_of_speech,definitions_zh,source,note
```

规则：

- `word`：必填，只允许英文单词、连字符和撇号。
- `phonetic`：可选。
- `part_of_speech`：可选，多个词性使用 `|` 分隔。
- `definitions_zh`：必填，多条中文释义使用 `|` 分隔。
- `source`：必填，记录人工、用户反馈或其他许可来源。
- `note`：可选，不进入运行时词典，仅供维护审核。

CSV 内含逗号或引号的字段必须使用标准 CSV 转义。

## 规范化与合并规则

所有来源先执行同一套规范化：

- 去除首尾空白。
- 转为英文小写。
- 弯引号转为普通撇号。
- 拒绝不符合 `^[a-z][a-z'-]*$` 的单词。
- 去除空释义和重复释义。
- 每个词最多保留 6 条中文释义。

合并优先级从高到低：

1. blocklist：命中后不进入最终词典。
2. 自定义词条：覆盖同名单词的 ECDICT 内容。
3. ECDICT：提供基础数据。

自定义词条自身出现重复规范化键时构建失败，不允许依赖文件顺序决定覆盖结果。

## 本地命令

新增 package scripts：

```text
pnpm dict:update
pnpm dict:build
pnpm dict:check
```

职责：

- `dict:update`：联网同步上游、构建、检查并输出差异报告。
- `dict:build`：使用本地已有输入重新生成分片，不联网。
- `dict:check`：只检查当前生成结果，不写入词典文件。

常规本地更新流程：

```bash
pnpm dict:update
pnpm test
pnpm typecheck
pnpm build
```

## 差异报告

每次更新输出机器可读 JSON 和终端摘要，至少包含：

- 上一个和新的 ECDICT commit。
- 新增、删除、修改词条数。
- 上游、自定义、blocklist 和最终词条数。
- 各分片词条数及文件大小变化。
- 最终词典总体积变化。
- 被自定义词条覆盖的单词列表。
- 被 blocklist 删除的单词列表。

差异报告用于本地审核，也会写入自动更新 PR 正文。

## GitHub Actions

新增 `.github/workflows/update-dictionary.yml`：

- 触发方式：
  - 每月 1 日定时运行。
  - 支持 `workflow_dispatch` 手动运行。
- 权限：
  - 只授予创建更新分支和 Pull Request 所需的仓库权限。
  - 仓库需开启“Allow GitHub Actions to create and approve pull requests”；未开启时工作流明确失败并提示维护者配置。
- 流程：
  1. 检出仓库。
  2. 安装固定 lockfile 依赖。
  3. 执行 `pnpm dict:update`。
  4. 执行 `pnpm test`、`pnpm typecheck` 和 `pnpm build`。
  5. 没有生成差异时正常结束。
  6. 有差异时更新固定分支 `automation/dictionary-update`。
  7. 创建或更新同一个词典更新 PR。

PR 标题包含 ECDICT commit 短哈希，正文包含差异报告和验证结果。自动化不直接合并 PR，也不创建扩展 Release。

## 质量门槛

更新必须同时满足：

- 生成 `a-z` 共 26 个分片。
- 最终词条数不少于 50,000。
- 相对上一个已提交版本，最终词条总数变化不超过 10%。
- 所有分片键与词条 lemma 一致且按确定性顺序输出。
- 不存在空释义、非法单词或重复键。
- 所有非 blocklist 自定义词条都出现在最终结果中。
- `index.json` 与 `manifest.json` 的词条数和分片信息一致。
- 相同输入连续构建两次，生成文件的字节内容一致。
- 词典查询测试覆盖普通词、复数、过去式、进行时和自定义覆盖词。
- 生产构建中包含索引、manifest、许可证和所有分片。

首次引入 manifest 时，以当前 `index.json` 的 57,833 个词条作为变化基线。

## 错误处理

- 上游请求失败：保留旧词典，命令失败，不写入部分结果。
- CSV SHA-256 或来源元数据缺失：命令失败。
- ECDICT 列结构发生变化：报告缺失字段并失败。
- 自定义 CSV 非法：报告文件、行号和字段后失败。
- blocklist 含非法词：报告行号后失败。
- 词条数或体积超过质量阈值：失败并要求人工调查。
- 单个分片生成失败：在临时目录中止，不覆盖已提交词典。
- GitHub PR 已存在：更新固定分支和原 PR，不重复创建。

生成过程先写临时目录，全部检查通过后再替换 `public/dictionary/`，避免失败时留下混合版本。

## 测试策略

### 单元测试

- ECDICT 行解析和现有筛选规则。
- 自定义 CSV 字段解析与行号错误。
- 自定义词条覆盖 ECDICT。
- blocklist 删除上游和自定义词。
- 重复自定义键失败。
- manifest 统计与 SHA-256。
- 10% 变化阈值。
- 确定性排序和重复构建。

### 集成测试

- 固定小型 ECDICT fixture + 自定义 fixture + blocklist 完整生成 26 个分片。
- 生成后使用 `DictionaryEngine` 查询基础词、词形变化和自定义词。
- 失败构建不覆盖现有输出目录。

### CI 验证

- 完整 Vitest 套件。
- TypeScript 类型检查。
- 生产扩展构建。
- 检查构建产物中的词典文件。

## 维护文档

新增 `docs/dictionary-maintenance.md`，包含：

- 手动运行词典更新。
- 添加或修正自定义词条。
- 使用 blocklist。
- 阅读差异报告。
- 审核自动更新 PR。
- 更新第三方声明与许可证的条件。
- 合并后重新打包扩展。

README 只保留简短入口并链接该维护文档，避免普通用户被维护细节干扰。

## 非目标

- 不在扩展运行时下载词典。
- 不新增远程服务器、用户账号或遥测。
- 不自动合并词典 PR。
- 不自动发布扩展。
- 不从未审核的用户输入直接生成公共词典。
- 不改变当前悬停、保存或周报行为。

## 验收标准

- 一条本地命令完成同步、构建、检查和差异报告。
- 无网络时仍可使用已下载输入执行确定性构建。
- GitHub Actions 无变化时不创建 PR，有变化时只创建或更新一个可审核 PR。
- 自定义词条和 blocklist 具有稳定、可测试的合并行为。
- 任何失败都不会覆盖当前可用词典。
- 扩展用户侧保持完全离线，无新增权限和操作。
