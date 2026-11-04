# agent-loop-community

The shared library of loops and roles for [agent-loop-studio](https://github.com/justforyou16007/agent-loop-studio) projects: what one project made, ready for the next.

- `library/loops/<side>/<loop>.md` and `.js`: a loop's natural-language definition and the workflow script generated from it, stamped with the definition's digest.
- `library/roles/<side>/<role>.md`: a role, with the Evaluation section its optimizer reads.

A `<side>` is a kind of project or machine, such as a research package's `worker`, whose projects receive its loops and roles. `framework` here holds those any project can use: new ones, and projects' versions of agent-loop-studio's own base loops and roles, which take the framework's place in the projects that carry this library.

## Using it

A project package adds this repository as a git submodule (at `agent-loop-community/`), at the version it chooses, and names the sides it uses in its `project.json`; the installer seeds this library's `framework` loops and roles and those of the package's sides into a project, and from then on they are the project's own. For projects made in the Studio straight from an agent-loop-studio checkout, clone this repository into that checkout as `agent-loop-community/` instead. The Studio shows this library's loops beside a project's own.

## Contributing

Every contribution comes here. What a project improves, its roles fixed from their trajectories above all, stays in the project until its owner decides to contribute; then its `library-contribution` loop lists the project's loops and roles that are new or changed since it was installed, the owner chooses which go, and exactly those come here: a changed one merged three ways with what this library holds of it. It blocks keys, tokens and hidden data, warns about paths of the contributing machine, runs the project's own check when it has one, and opens a pull request only once the owner has reviewed exactly what leaves. Maintainers review and merge.

What may come here:

- Loops and roles any project of their side can use: nothing names one project's machines, paths, datasets or results.
- Written in agent-loop-studio's formats, passing its checks with the framework's loops and roles laid underneath: `node tools/check.mjs --studio <a built agent-loop-studio checkout>`.
- `framework` loops and roles depend only on agent-loop-studio and this library. A side's may also use the roles, loops, helpers and hook actions that side's package provides; this library cannot check those, so such a loop was checked whole in the project that contributed it and is only noted here.

## Check

```bash
git clone https://github.com/justforyou16007/agent-loop-studio.git
(cd agent-loop-studio && npm ci && npm run build)
node tools/check.mjs --studio agent-loop-studio
```

MIT licensed.

---

# agent-loop-community（中文）

[agent-loop-studio](https://github.com/justforyou16007/agent-loop-studio) 项目共享的流程和角色库：一个项目做出来的东西，留给下一个项目用。

- `library/loops/<端>/<流程>.md` 和 `.js`：流程的自然语言定义，以及据此生成、记有定义摘要的脚本。
- `library/roles/<端>/<角色>.md`：角色文件，带优化器要读的 Evaluation 一节。

`<端>` 是一类项目或机器，比如研究项目包的 `worker`，这类项目会收到该端的流程和角色。这里的 `framework` 放任何项目都能用的流程和角色：新写的，以及各项目改进过的 agent-loop-studio 基础流程和角色——在引用本库的项目里，改进版会替代框架原版。

**使用**：项目包把本仓库作为 git 子模块引用（放在 `agent-loop-community/`，版本由项目自己固定），并在 `project.json` 里写明用哪几端；安装器把本库 `framework` 下的流程和角色以及项目包所用各端的放进项目，此后归项目所有。直接从 agent-loop-studio 仓库在 Studio 里建的项目，则把本仓库克隆进那个框架仓库、放在 `agent-loop-community/` 下。Studio 会把本库的流程和项目自己的放在一起给你选。

**贡献**：所有贡献都到这里。项目做的改进（主要是根据轨迹修好的角色）留在项目里，直到它的 owner 决定贡献；这时项目的 `library-contribution` 流程列出项目安装以来新写和改过的流程与角色，由 owner 选择哪些上传，选中的就送到这里：改过的会和本库已有的版本做三方合并。它拦下密钥、token 和隐藏数据，提醒其中出现的本机路径，项目有自查时先自查，并且只在 owner 审过要发出的确切内容后才开 PR；由维护者审核合并。

这里只收：任何同端项目都能用的流程和角色，不点名某个项目的机器、路径、数据集或结果；按 agent-loop-studio 的格式写、在垫上框架自带流程和角色后能通过它的检查。`framework` 下的只依赖 agent-loop-studio 和本库；某一端的还可以用该端项目包提供的角色、流程、helper 和 hook 动作，本库检查不了这些，所以这类流程在贡献它的项目里已经整体检查过，这里只做记录。
