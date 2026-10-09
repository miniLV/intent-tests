# intent-tests

**别让 coding agent 写只会复读自己实现的测试。** 你写意图，agent 写实现，再在你自己的仓库上跑一组配对 A/B，看 agent 自己写测试到底值不值那些 token。

[English](README.md)

> **状态：早期原型（v0.1）。** 工具能用、有测试覆盖，但还没有任何基准测试结果，也不宣称能省多少时间或 token。请在你自己的仓库上跑 A/B，用你自己的数据做判断。

## 快速开始

```sh
git clone https://github.com/miniLV/intent-tests && cd intent-tests
npm test                                                     # 17 个测试，Node 20+，零依赖
node bin/intent-ab.js examples/dry-run/tasks.json --dry-run  # 用假 agent 跑一遍 A/B 流程
```

## 它是什么

三个小工具，可以单独用，也可以组合用：

| 组件 | 作用 |
| --- | --- |
| `skills/intent-first` | Codex 和 Claude Code 通用的 agent skill。人写 `INTENT.md`，agent 按它实现，不新增没被要求的测试文件，最后逐条验收标准报告 PASS / FAIL / NOT VERIFIED。 |
| `intent-check` | 命令行工具。读取 `INTENT.md`，对比 `git diff`（相对某个基准 ref）：标出 `INTENT.md` 不允许的新增或修改的测试文件、标出 `## Scope` 之外的改动、执行命令型验收项。输出可读报告或 `--json`，有违规时退出码为 1。可以挂在 pre-commit 或 CI 上，不依赖 IDE hook。 |
| `intent-ab` | 配对 A/B 实验脚本。每个任务在两个独立的 git worktree 里各跑一次（A 组 `tests-allowed` 允许写测试，B 组 `intent-first` 禁止新增测试），再执行你的验收命令。记录是否通过、耗时、token（从 Codex / Claude Code 的 JSON 输出解析）以及每组碰了哪些测试文件。 |

## 它不是什么

- 不是“测试没用”的主张。你明确要的测试（`## Allowed tests`）和仓库现有的测试都照常保留。
- 不是测试生成器，也不能代替代码审查。
- 不是基准测试。几个任务只能给出关于*你这个仓库*的方向性信号，不是统计显著的结论。

## INTENT.md

```markdown
# Intent: slugify() handles accents and repeated separators

## Goal
`slugify(title)` in `src/slugify.js` turns any article title into a URL slug.

## Acceptance checks
- [ ] `npm test` passes
- [ ] Leading and trailing separators are removed (`"  Hello "` → `hello`)
- [ ] Public API is unchanged: still a single named export `slugify`

## Scope
- `src/slugify.js`

## Out of scope
- Transliterating non-Latin scripts

## Allowed tests
- none

## Examples
- `"Crème  Brûlée!"` → `creme-brulee`
```

解析规则：

- `## Acceptance checks`：列表项。**以行内代码开头**的项是命令型验收，`intent-check` 会执行它（退出码 0 即通过）；其余是人工验收项，agent 必须给出证据。
- `## Scope`（可选）：glob 列表（如 `src/**`、`*.md`）。写了就会检查，范围外的改动算违规。`INTENT.md` 本身永远允许修改。
- `## Allowed tests`：允许 agent 新增或修改的测试文件 glob，或写 `none`（默认）。
- 测试文件识别规则：`**/*.test.*`、`**/*.spec.*`、`**/*_test.*`、`**/test_*.py`、`**/test/**`、`**/tests/**`、`**/__tests__/**`、`**/spec/**`，可用 `--test-pattern` 覆盖。

完整示例见 [`examples/INTENT.md`](examples/INTENT.md)。

## 安装 skill

**Codex**：复制到仓库里（或复制到 `~/.agents/skills/`，对所有仓库生效）：

```sh
mkdir -p .agents/skills && cp -r /path/to/intent-tests/skills/intent-first .agents/skills/
```

也可以把 [`examples/AGENTS.snippet.md`](examples/AGENTS.snippet.md) 贴进 `AGENTS.md`，这样即使 skill 没被触发，规则也生效。

**Claude Code**：复制到项目里（或 `~/.claude/skills/`）：

```sh
mkdir -p .claude/skills && cp -r /path/to/intent-tests/skills/intent-first .claude/skills/
```

## intent-check

```sh
# agent 改完之后，在你的仓库里执行
npx --yes -p github:miniLV/intent-tests intent-check --base main
# 或者用本地 clone
node /path/to/intent-tests/bin/intent-check.js --base main --json
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--base <ref>` | `HEAD` | 用工作区（含未跟踪文件）对比这个 ref |
| `--intent <path>` | `INTENT.md` | 意图文件路径，相对仓库根目录 |
| `--no-run` | | 不执行命令型验收 |
| `--test-pattern <glob>` | 内置列表 | 可重复，替换默认规则 |
| `--json` | | 输出 JSON |

退出码：`0` 通过，`1` 有违规或命令验收失败，`2` 配置错误（比如没有 `INTENT.md`）。

## intent-ab

先写一个任务文件（JSON）：

```json
{
  "setup": "npm ci",
  "tasks": [
    {
      "id": "slugify-accents",
      "prompt": "Make slugify() in src/slugify.js strip accents and collapse repeated separators.",
      "acceptance": ["slugify('Crème  Brûlée!') returns 'creme-brulee'"],
      "verify": "node {taskdir}/verify/slugify-accents.mjs"
    }
  ]
}
```

- `verify` 是你自己的留出验收。`{taskdir}` 会替换成任务文件所在目录，所以验收脚本可以放在被测仓库之外，两组 agent 都看不到、改不了。
- `intent`（可选）：一个 INTENT 格式的文件路径，内容会同时加进两组的提示词。
- `setup`（可选，顶层或单个任务）：在每个新 worktree 里、agent 开跑前执行，不计时。

在要测试的仓库里运行：

```sh
intent-ab tasks.json                                   # 默认用 Codex
intent-ab tasks.json --agent 'claude -p {prompt} --output-format json --permission-mode acceptEdits'
intent-ab tasks.json --repeats 2 --keep-worktrees
```

- 默认 agent 命令：`codex exec --json --sandbox workspace-write {prompt}`。占位符：`{prompt}`（已做 shell 转义）、`{prompt_file}`、`{arm}`、`{task}`；同时设置环境变量 `INTENT_AB_ARM`、`INTENT_AB_TASK`、`INTENT_AB_PROMPT_FILE`。
- 两组拿到相同的提示词、验收项和意图，B 组额外多一条约束：不新增或修改测试文件，按验收项汇报。
- 任务之间轮换两组的执行顺序。
- token 从 Codex 的 `turn.completed` 事件或 Claude Code 的 `result` 对象累加；都没有时记为 `unknown`。
- 输出：`results/<时间戳>.json` 和 `results/<时间戳>.md`（建议把 `results/` 加进 `.gitignore`）。
- 3 到 5 个任务得到的是**方向性信号，不是统计显著的结论**。下结论前请加 `--repeats` 和更多任务。真实运行会消耗 agent 额度，建议从少量任务开始。

## 开发

```sh
npm test   # node --test；使用临时 git 仓库和假 agent，不联网
```

纯 Node.js ESM，零依赖。在 Linux 和 macOS shell 下测试过，暂不支持 Windows。

## 致谢

灵感来自 [Kun Chen 关于 agent 自写测试的帖子](https://x.com/kunchenguid/status/2108030810691629403)。

## 许可证

MIT © 2026 miniLV
