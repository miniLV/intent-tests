<h1 align="center">intent-tests</h1>

<p align="center">
  <strong>Stop coding agents from writing tests that just echo their own code.</strong>
</p>

<p align="center">
  <strong>别让 coding agent 写只会复读自己实现的测试。</strong>
</p>

<p align="center">
  你写意图，agent 写实现，再在你自己的仓库上跑一组配对 A/B，看 agent 自己写测试到底值不值那些 token。
</p>

<p align="center">
  <a href="./skills/intent-first/SKILL.md">Skill</a> ·
  <a href="./examples/tasks">Examples</a> ·
  <strong>简体中文</strong> · <a href="./README.en.md">English</a>
</p>

<p align="center">
  <code>npx -y -p github:miniLV/intent-tests intent-check --base main</code>
</p>

<p align="center">
  Codex · Claude Code · Node.js 20+ · 零依赖 · MIT
</p>

## 状态

**早期原型（v0.1）。** 工具能用、有测试覆盖，但还没有任何基准测试结果，也不宣称能省多少时间或 token。请在你自己的仓库上跑 A/B，用你自己的数据做判断。

## 快速开始

```sh
git clone https://github.com/miniLV/intent-tests && cd intent-tests
npm test                                         # 20 个测试，不联网
node bin/intent-ab.js examples/tasks/tasks.json  # 用 Codex 在 vercel/ms 上跑真实 A/B（共 6 次 agent 运行）
```

最后一条命令会把 [`vercel/ms`](https://github.com/vercel/ms) clone 到固定的 commit，会消耗真实的 Codex 额度。不想调用 agent、只看流程的话，运行 `node bin/intent-ab.js examples/dry-run/tasks.json --dry-run`。

## 它是什么

| 组件 | 作用 |
| --- | --- |
| `skills/intent-first` | Codex 和 Claude Code 通用的 agent skill。人写 `INTENT.md`，agent 按它实现，不新增没被要求的测试文件，最后逐条验收标准报告 PASS / FAIL / NOT VERIFIED。 |
| `intent-check` | 命令行工具。读取 `INTENT.md`，对比 `git diff`（相对某个基准 ref）：标出 `INTENT.md` 不允许的新增或修改的测试文件、标出 `## Scope` 之外的改动、执行命令型验收项。输出可读报告或 `--json`，有违规时退出码为 1。可以挂在 pre-commit 或 CI 上，不依赖 IDE hook。 |
| `intent-ab` | 配对 A/B 实验脚本。每个任务在两个独立的 git worktree 里各跑一次（A 组 `tests-allowed` 允许写测试，B 组 `intent-first` 禁止新增测试），再执行你的留出验收命令。记录是否通过、耗时、token（从 Codex / Claude Code 的 JSON 输出解析）以及每组碰了哪些测试文件。 |

## 它不是什么

- 不是“测试没用”的主张。你明确要的测试（`## Allowed tests`）和仓库现有的测试都照常保留。
- 不是测试生成器，也不能代替代码审查。
- 不是基准测试。几个任务只能给出关于*你这个仓库*的方向性信号，不是统计显著的结论。

## 示例：vercel/ms 上的三个任务

[`examples/tasks/`](examples/tasks) 的目标仓库是 [`vercel/ms`](https://github.com/vercel/ms)（MIT），一个很小的毫秒换算库，固定在 tag `2.1.3`（`1c6264b795492e8fdecbc82cb8802fcfbfc08d26`）。它只有一个 `index.js`，没有运行时依赖，所以所有验收脚本用纯 Node 就能跑，不需要联网。

| 任务 | 功能 | 留出验收 |
| --- | --- | --- |
| `month-unit` | 解析月份：`ms('1mo') === 2629800000`，`m` 仍然表示分钟 | [`verify/month-unit.cjs`](examples/tasks/verify/month-unit.cjs) |
| `compound-durations` | 解析 `"1h 30m"`、`"1h30m"`、`"2 days 3 hours"`；任何一段无效就返回 `undefined` | [`verify/compound-durations.cjs`](examples/tasks/verify/compound-durations.cjs) |
| `strict-option` | `ms('soon', { strict: true })` 抛出包含输入内容的 `Error`；默认行为仍返回 `undefined` | [`verify/strict-option.cjs`](examples/tasks/verify/strict-option.cjs) |

每个任务都有一份[意图文件](examples/tasks/intents)，两组都能看到。验收脚本放在被 clone 的仓库之外，两组 agent 都看不到、改不了。每个验收脚本还会复查 `ms@2.1.3` 的原有行为。三个脚本在固定 commit 上都会失败，正确实现后都会通过；发布前已用参考实现验证过。

## INTENT.md

```markdown
# Intent: parse months

## Goal
`ms()` should understand months when parsing strings. One month is one twelfth
of the library's year (`365.25 / 12` days, i.e. `2629800000` ms).

## Acceptance checks
- [ ] `node -e "process.exit(require('./index.js')('1mo') === 2629800000 ? 0 : 1)"` exits 0
- [ ] `mo`, `month` and `months` are accepted, case-insensitive, with or without a space
- [ ] `m` still means minutes (`ms('1m') === 60000`) and every existing unit parses as before

## Scope
- `index.js`
- `readme.md`

## Out of scope
- Formatting numbers as months

## Allowed tests
- none

## Examples
- `ms('2 months')` → `5259600000`
```

解析规则：

- `## Acceptance checks`：列表项。`` `cmd` passes ``、`` `cmd` exits 0 ``、`` `cmd` succeeds `` 或单独一个 `` `cmd` `` 是命令型验收，`intent-check` 会执行它（退出码 0 即通过）；其余是人工验收项，agent 必须给出证据。
- `## Scope`（可选）：glob 列表（如 `src/**`、`*.md`）。写了就会检查，范围外的改动算违规。`INTENT.md` 本身永远允许修改。
- `## Allowed tests`：允许 agent 新增或修改的测试文件 glob，或写 `none`（默认）。
- 测试文件识别规则：`**/*.test.*`、`**/*.spec.*`、`**/*_test.*`、`**/test_*.py`、`**/test/**`、`**/tests/**`、`**/__tests__/**`、`**/spec/**`，可用 `--test-pattern` 覆盖。

## 安装 skill

**Codex**：复制到仓库里（或复制到 `~/.agents/skills/`，对所有仓库生效）：

```sh
mkdir -p .agents/skills && cp -r /path/to/intent-tests/skills/intent-first .agents/skills/
```

也可以把 [`examples/AGENTS.snippet.md`](examples/AGENTS.snippet.md) 贴进 `AGENTS.md`，这样即使 skill 没被触发，规则也生效。

**Claude Code**：复制到项目里（或复制到 `~/.claude/skills/`）：

```sh
mkdir -p .claude/skills && cp -r /path/to/intent-tests/skills/intent-first .claude/skills/
```

## intent-check

```sh
# agent 改完之后，在你的仓库里执行
npx -y -p github:miniLV/intent-tests intent-check --base main
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

任务文件（JSON），参考 [`examples/tasks/tasks.json`](examples/tasks/tasks.json)：

```json
{
  "repo": { "url": "https://github.com/vercel/ms.git", "commit": "1c6264b795492e8fdecbc82cb8802fcfbfc08d26" },
  "tasks": [
    {
      "id": "month-unit",
      "prompt": "In this repo (the `ms` package, index.js), add a month unit to the string parser.",
      "intent": "intents/month-unit.md",
      "verify": "node {taskdir}/verify/month-unit.cjs"
    }
  ]
}
```

- `repo`（可选）：把这个 URL clone 到指定 commit，所有组都从它开始跑。不写 `repo` 时，目标就是你运行 `intent-ab` 所在的 git 仓库，起点是 `base`（默认 `HEAD`）。
- `verify`：你自己的留出验收。`{taskdir}` 会替换成任务文件所在目录，所以验收脚本可以放在目标仓库之外。
- `intent`（可选）：一个 INTENT 格式的文件，内容会同时加进两组的提示词。
- `setup`（可选，顶层或单个任务）：在每个新 worktree 里、agent 开跑前执行，比如 `npm ci`，不计时。

```sh
intent-ab tasks.json                                   # 默认用 Codex
intent-ab tasks.json --agent 'claude -p {prompt} --output-format json --permission-mode acceptEdits'
intent-ab tasks.json --repeats 2 --keep-worktrees
```

- 默认 agent 命令：`codex exec --json --sandbox workspace-write {prompt}`。占位符：`{prompt}`（已做 shell 转义）、`{prompt_file}`、`{arm}`、`{task}`；同时设置环境变量 `INTENT_AB_ARM`、`INTENT_AB_TASK`、`INTENT_AB_PROMPT_FILE`。
- 两组拿到相同的提示词、验收项和意图，B 组额外多一条约束：不新增或修改测试文件，按验收项汇报。
- 任务之间轮换两组的执行顺序。
- token 从 Codex 的 `turn.completed` 事件或 Claude Code 的 `result` 对象累加；都没有时记为 `unknown`。
- 输出：`results/<时间戳>.json` 和 `results/<时间戳>.md`。建议把 `results/` 加进 `.gitignore`。
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
