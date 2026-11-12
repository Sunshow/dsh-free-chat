# dsh-free-chat

One-click "just ask something" sessions for DeepSeek Harness: open a blank session in a dedicated workspace (an empty directory outside any git repo, so no project `AGENTS.md` or project skills leak in). The workspace name and the chat directory are configurable, and every entry is a Client slot occupant — no DOM is read or rewritten.

中文说明见下。

随手问一句就开一个会话。入口在左栏底部、设置按钮上方（一个图标钮，和新会话页工作区行里的 chip 二选一都能开）。入口的名字跟着设置里的工作区名走——你把它改成「闲聊区」，图标 hover 的提示和独占一行时的文字都会跟着变。

## 它做什么

点一下 → 在专用工作区里开一个空白会话，直接就能输入。

- 工作区名可配置（默认「自由会话」），第一次点的时候自动创建并命名。
- 聊天目录可配置（默认 `~/.dsh/free-chat`），第一次点的时候自动 `mkdir -p`。
- 同一个工作区里已经有一个空白会话时直接复用，不会堆一串空会话。

## 为什么还是要一个工作区

DSH 的空会话只有在属于某个工作区时输入框才可用。`ConversationContent` 里这条判断：

```ts
const inert = sessionId === undefined || (hero && chipTitle === undefined)
```

`hero` 是「空白会话」，`chipTitle` 是会话所属工作区的标题。所以一个用 `sessions.create({ cwd })` 建出来、但没有 attach 到任何工作区的空白会话，输入框是禁用状态，占位符是「选择工作区」——会话能建出来，却打不出第一个字。

换句话说：「不建工作区」在当前的 DSH 里不是一个能用的形态，只有已有消息的会话才能在没有工作区时正常输入。所以这个插件固定用**一个专用工作区**，把它当作「随手问」的家。

## 它不带工作区记忆

工作区记录（`dsh-workspace`）对模型完全不可见，零 token。真正会进上下文的是：

| 来源 | 决定方式 |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | 用户级 `~/.dsh/AGENTS.md`、`~/.agents/AGENTS.md`；项目级从最近的 `.git` 根到 cwd 逐级加载 |
| 项目 skills | `<projectRoot>/.dsh/skills`、`.agents/skills`，`projectRoot` = 最近的 `.git` 祖先，否则 cwd |

默认目录 `~/.dsh/free-chat` 是空目录、也不在任何 git 仓库里，所以项目链为空；用户级的 `~/.dsh/AGENTS.md` 仍然生效。

## 实现

- `index.js`（Host）：`/api/free-chat/{state,save,prepare}`，负责设置持久化与 `mkdir -p`。设置写在 `$DSH_HOME/free-chat.settings.json`（默认 `~/.dsh/free-chat.settings.json`）——页面 origin 的端口每次启动都会变，浏览器存储不是可靠的家。
- `client.js`（Browser）：全部走 Client 插槽注册，不读也不改 DOM。
  - `sidebar.footer.action`：设置按钮上方的入口。这个槽是**横排容器**，会和其它插件（例如最近会话）并排，所以入口做成 32px 图标钮，不抢整行、不挤别人；鼠标悬停有主题化的提示气泡（收起成 rail 时退化为原生 `title`），独占一行时自动变成带文字的整行；
  - `conversation.hero.options`：新会话页工作区行右侧的 chip；
  - `settings.section` / `settings.section.icon`：设置页与导航图标；
  - `shell.overlay`：失败提示；
  - 会话创建走客户端服务 `workspaces` / `uiWorkspace`。

## 安装

```bash
git clone https://github.com/Sunshow/dsh-free-chat.git
```

然后在 DSH 会话里把目录装进当前 profile：

```
plugin_manager action=install_bundle target=/absolute/path/to/dsh-free-chat
```

也可以走 Settings → Plugins 的 Local bundle 页，指向同一个目录。目录安装是**软链**：`git pull` 之后代码就更新，不用重装。

装完刷新页面一次（Client 半边在启动时加载）。

## 已知限制

- 系统的「新会话」旁边没有插槽，所以入口只能落在 `sidebar.footer.action`（设置按钮上方）。那个槽是横排容器，会和其它插件（最近会话等）并排，因此入口是 32px 图标钮；只有它独占一行时才会展开成带文字的整行。
- 「专用工作区」不是绕路：DSH 的空会话必须属于一个工作区才能输入，详见上文「为什么还是要一个工作区」。
