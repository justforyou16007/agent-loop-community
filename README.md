# agent-loop-community

The shared library of loops and roles for [agent-loop-studio](https://github.com/justforyou16007/agent-loop-studio) projects: what one project made, ready for the next.

- `library/loops/<side>/<loop>.md` and `.js`: a loop's natural-language definition and the workflow script generated from it, stamped with the definition's digest.
- `library/roles/<side>/<role>.md`: a role, with the Evaluation section its optimizer reads.

A `<side>` is a kind of project or machine, such as a research package's `worker`, whose projects receive its loops and roles. `framework` here holds those any project can use; agent-loop-studio keeps its own base loops and roles under its `framework`, and a name here never repeats one of them.

## Using it

A project package adds this repository as a git submodule (at `agent-loop-community/`), at the version it chooses, and names the sides it uses in its `project.json`; the installer seeds this library's `framework` loops and roles and those of the package's sides into a project, and from then on they are the project's own. For projects made in the Studio straight from an agent-loop-studio checkout, clone this repository into that checkout as `agent-loop-community/` instead. The Studio shows this library's loops beside a project's own.

## Contributing

Every contribution comes here. A project contributes when its owner decides to, with its `library-contribution` loop: it plans the loops and roles the project made (the ones no library gave it), blocks keys, tokens and hidden data, warns about paths of the contributing machine, runs the project's own check when it has one, and opens a pull request only once the owner has reviewed exactly what leaves. Maintainers review and merge.

Improvements are not contributions. When a project improves a loop or role a library gave it (its roles fixed from their trajectories, above all), its `upstream-optimization` loop sends the improvement back where the loop or role came from: to agent-loop-studio for the framework's base ones, to the package for a package's own, and here for this library's.

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

`<端>` 是一类项目或机器，比如研究项目包的 `worker`，这类项目会收到该端的流程和角色。这里的 `framework` 放任何项目都能用的流程和角色；agent-loop-studio 自己的基础流程和角色放在框架仓库的 `framework` 下，这里的名字不与它们重复。

**使用**：项目包把本仓库作为 git 子模块引用（放在 `agent-loop-community/`，版本由项目自己固定），并在 `project.json` 里写明用哪几端；安装器把本库 `framework` 下的流程和角色以及项目包所用各端的放进项目，此后归项目所有。直接从 agent-loop-studio 仓库在 Studio 里建的项目，则把本仓库克隆进那个框架仓库、放在 `agent-loop-community/` 下。Studio 会把本库的流程和项目自己的放在一起给你选。

**贡献**：所有贡献都到这里。是否贡献由项目的 owner 决定，用项目的 `library-contribution` 流程：它整理出项目自己写的流程和角色（不是从哪个库拿到的），拦下密钥、token 和隐藏数据，提醒其中出现的本机路径，项目有自查时先自查，并且只在 owner 审过要发出的确切内容后才开 PR；由维护者审核合并。

**优化不是贡献**：项目改进了从某个库拿到的流程或角色（主要是根据轨迹修好的角色），由它的 `upstream-optimization` 流程把改进送回来源：框架的基础流程和角色回 agent-loop-studio，项目包自己的回项目包，本库的回到这里。

这里只收：任何同端项目都能用的流程和角色，不点名某个项目的机器、路径、数据集或结果；按 agent-loop-studio 的格式写、在垫上框架自带流程和角色后能通过它的检查。`framework` 下的只依赖 agent-loop-studio 和本库；某一端的还可以用该端项目包提供的角色、流程、helper 和 hook 动作，本库检查不了这些，所以这类流程在贡献它的项目里已经整体检查过，这里只做记录。
