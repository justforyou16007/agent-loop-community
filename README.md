# agent-loop-community

The shared library of loops and roles for [agent-loop-studio](https://github.com/justforyou16007/agent-loop-studio) projects: what one project learned, ready for the next.

- `library/loops/<side>/<loop>.md` and `.js`: a loop's natural-language definition and the workflow script generated from it, stamped with the definition's digest.
- `library/roles/<side>/<role>.md`: a role, with the Evaluation section its optimizer reads.

A `<side>` is a kind of project or machine, such as `research-worker`; `framework` is reserved for agent-loop-studio's own base roles and loops, which live there, not here.

## Using it

A project package adds this repository as a git submodule, at the version it chooses, and names the sides it uses in its `project.json`; the installer seeds those loops and roles into a project, and from then on they are the project's own.

## Contributing

Projects contribute with their `library-contribution` loop: it plans what the project added or changed since it was installed, merges it three ways with what changed here meanwhile, blocks keys, tokens, machine paths and hidden data, and opens a pull request only once the owner has reviewed exactly what leaves. Maintainers review and merge.

What may come here:

- Loops and roles any project of a side can use: nothing names one project's machines, paths, datasets or results.
- Written in agent-loop-studio's formats, passing its checks: `node tools/check.mjs --studio <a built agent-loop-studio checkout>`.
- Depending only on agent-loop-studio and this library: a role here never calls a project's own helper, and a loop declares only the framework's hook actions (`record-trajectory`, `guard-owner-answers`). A role that needs a project's helper stays in that project.

## Check

```bash
git clone https://github.com/justforyou16007/agent-loop-studio.git
(cd agent-loop-studio && npm ci && npm run build)
node tools/check.mjs --studio agent-loop-studio
```

MIT licensed.

---

# agent-loop-community（中文）

[agent-loop-studio](https://github.com/justforyou16007/agent-loop-studio) 项目共享的流程和角色库：一个项目学到的东西，留给下一个项目用。

- `library/loops/<端>/<流程>.md` 和 `.js`：流程的自然语言定义，以及据此生成、记有定义摘要的脚本。
- `library/roles/<端>/<角色>.md`：角色文件，带优化器要读的 Evaluation 一节。

`<端>` 是一类项目或机器，比如 `research-worker`；`framework` 留给 agent-loop-studio 自己的基础角色和流程，它们放在框架仓库里，不在这里。

**使用**：项目包把本仓库作为 git 子模块引用（版本由项目自己固定），并在 `project.json` 里写明用哪几端；安装器把这些流程和角色放进项目，此后归项目所有。

**贡献**：项目用自己的 `library-contribution` 流程贡献。它整理出项目安装以来新增和改动的内容，与这里的变化做三方合并，拦下密钥、token、本机路径和隐藏数据，并且只在 owner 审过要发出的确切内容后才开 PR；由维护者审核合并。这里只收：任何同类项目都能用的流程和角色；按 agent-loop-studio 的格式写、能通过它的检查；只依赖 agent-loop-studio 和本库——角色不调用任何项目自己的 helper，流程只声明框架自带的 hook 动作。需要项目自己 helper 的角色留在那个项目里。
