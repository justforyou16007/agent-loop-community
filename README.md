# agent-loop-community

Projects made with [agent-loop-studio](https://github.com/justforyou16007/agent-loop-studio), published whole as examples: what one owner built and ran, for the next to start from.

## What is here

`projects/<name>/` is one published project:

- `reference.json`: its name, a title and a description in Chinese and English, its task loop and that loop's values.
- `loops/<loop>.md` and `.js`: each loop that is its own, the natural-language definition and the workflow script generated from it, stamped with the definition's digest.
- `roles/<role>.md`: each role that is its own, with the Evaluation section its optimizer reads.

A project's own loops and roles are the ones it made, the ones it got from the example it started from, and its versions of agent-loop-studio's base ones. The base ones it left as they were are not here, since every project gets them from the framework; nor are its data, keys, task or run records.

## Using it

In the Studio, press **Fetch the community library** once on the projects page: it clones this library into the Studio's checkout as `agent-loop-community/`, and **Update the community library** brings it up to date later. Its projects then appear beside the framework's examples when you start a project. A project started from one gets its loops and roles, which take the place of the framework's of the same name, and its task loop with its values; from then on they are the project's own, to change in the Studio.

## Publishing

A project is published from the Studio, by its `publish` loop, once one of its tasks has finished and its owner decides to. The owner first reviews exactly what leaves: each loop and role with a judgement of it, what stays out and why, and what an earlier publication had that the project no longer has. Only then does the loop open one pull request here, under `projects/<name>/`; publishing again updates the same folder. It blocks the publishing machine's keys, tokens and hidden data and warns about its paths. Maintainers review and merge.

What may come here:

- Projects another owner can start from: nothing names one project's machines, paths, datasets, clients or results.
- Only `reference.json`, `loops/` and `roles/`, in agent-loop-studio's formats, from which a project starts and passes the framework's checks.

## Check

For each published project, the check starts a project from it the way the Studio does, with the framework's own installer and code, and runs the framework's loop and role checks on it:

```bash
git clone https://github.com/justforyou16007/agent-loop-studio.git
(cd agent-loop-studio && npm ci && npm run build)
node tools/check.mjs --studio agent-loop-studio
```

MIT licensed.

---

# agent-loop-community（中文）

用 [agent-loop-studio](https://github.com/justforyou16007/agent-loop-studio) 做出来的项目，整个发布在这里作为示例：一个人搭好、跑过的项目，下一个人可以直接从它开始。

## 这里有什么

`projects/<名字>/` 是一个已发布的项目：

- `reference.json`：项目名，中英文的标题和说明，主任务流程和它的参数值。
- `loops/<流程>.md` 和 `.js`：项目自己的每个流程，包括自然语言定义和据此生成、记有定义摘要的脚本。
- `roles/<角色>.md`：项目自己的每个角色，带优化器要读的 Evaluation 一节。

"项目自己的"流程和角色指：项目新写的、从它所基于的示例带来的、以及它改过的框架基础流程和角色。原样未动的框架基础流程和角色不放在这里，因为每个项目都会从框架拿到；项目的数据、密钥、任务和运行记录也都不在这里。

## 使用

在 Studio 的项目页点一次"获取社区库"：它把本库克隆到 Studio 所在的框架仓库里，放在 `agent-loop-community/` 下；以后点"更新社区库"拿到最新内容。之后新建项目时，这里的项目会和框架自带的示例一起列出来。从某个项目新建，就会得到它的流程和角色（同名的会替代框架原版），以及它的主任务流程和参数值；从此这些都归新项目所有，可以在 Studio 里继续改。

## 发布

项目在 Studio 里通过它的 `publish` 流程发布，前提是它至少完成过一次任务，并且由 owner 决定发布。发出前 owner 先审核确切要发出的内容：每个流程和角色及对它的判断、哪些不发和原因、上次发布有而现在项目已经没有的文件。审核通过后，流程才在这里开一个 PR，放在 `projects/<名字>/` 下；再次发布会更新同一个文件夹。发布时会拦下发布机器的密钥、token 和隐藏数据，并提醒其中出现的本机路径。由维护者审核合并。

这里只收：

- 别人能直接拿来开始的项目：不点名某个项目的机器、路径、数据集、客户或结果。
- 只有 `reference.json`、`loops/` 和 `roles/`，按 agent-loop-studio 的格式写，从它新建的项目能通过框架的检查。

## 检查

检查会对每个已发布项目，按 Studio 的方式（用框架自己的安装器和代码）从它新建一个项目，再对这个项目跑框架的流程和角色检查：

```bash
git clone https://github.com/justforyou16007/agent-loop-studio.git
(cd agent-loop-studio && npm ci && npm run build)
node tools/check.mjs --studio agent-loop-studio
```

MIT 许可。
