// Free chat — browser half.
//
// A one-click entry that opens a blank Session in a dedicated Workspace, plus
// the settings that name it. The entry is a real Client slot occupant:
// `sidebar.footer.action` (a row above Settings) plus a chip in the New Session
// row, both registered through ctx.slots — no DOM is read or written.
//
// Why a Workspace at all: the shipped Conversation disables the composer for a
// blank Session that belongs to no Workspace (`inert = blank && no workspace`
// in ConversationContent), so a "no workspace" Session can be created but never
// typed into. The dedicated Workspace is therefore the working shape of "just
// ask something": an ordinary Session in a directory that carries no project
// instructions.
//
// Settings live in the Host half (/api/free-chat/*): the page origin carries a
// random port on every Desktop launch, so browser storage would not survive a
// restart.

window.__ModuleLoader__.load({
  id: 'dsh-free-chat',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const NS = 'free-chat'
    const STATE_URL = '/api/free-chat/state'
    const SAVE_URL = '/api/free-chat/save'
    const PREPARE_URL = '/api/free-chat/prepare'
    const NOTICE_TIMEOUT_MS = 9000
    const RAIL_MAX_WIDTH = 120

    const DICTS = {
      zh: {
        'page.title': '自由会话',
        'page.desc': '点一下就在专用工作区里开一个空白会话。模型、工具、输入框和普通会话完全一样，只是这个工作区专门用来随手问问题。',
        'page.name.label': '工作区名称',
        'page.name.placeholder': '自由会话',
        'page.path.label': '聊天目录',
        'page.path.hint': '会话的 cwd 指向这里。空目录、且不在任何 git 仓库里时，就不会带进项目级 AGENTS.md 或项目 skills；用户级的 ~/.dsh/AGENTS.md 仍然生效。',
        'page.path.missing': '目录还不存在，第一次开自由会话时会自动创建。',
        'page.note': '为什么要一个工作区：DSH 的空会话只有在属于某个工作区时输入框才可用，没有工作区的空白会话是被锁住的。所以这里固定用一个专用工作区，而不是「未分组」。',
        'page.save': '保存',
        'page.saving': '保存中…',
        'page.saved': '已保存',
        'page.try': '现在开一个',
        'page.loading': '正在读取设置…',
        'launcher.label': '自由会话',
        'launcher.title': '自由会话：随手问一句',
        'launcher.failed': '自由会话启动失败：',
        'notice.close': '关闭',
      },
      en: {
        'page.title': 'Free chat',
        'page.desc': 'One click opens a blank Session in a dedicated workspace. The model, the tools and the composer are ordinary ones — the workspace simply exists for casual questions.',
        'page.name.label': 'Workspace name',
        'page.name.placeholder': 'Free chat',
        'page.path.label': 'Chat directory',
        'page.path.hint': 'The session cwd points here. While it stays empty and outside any git repository, no project AGENTS.md or project skills are loaded; the user-level ~/.dsh/AGENTS.md still applies.',
        'page.path.missing': 'This directory does not exist yet; it is created on the first free chat.',
        'page.note': 'Why a workspace: DSH keeps the composer disabled for a blank Session that belongs to no workspace. A dedicated workspace is therefore the working shape of "just ask something" — not "Ungrouped".',
        'page.save': 'Save',
        'page.saving': 'Saving…',
        'page.saved': 'Saved',
        'page.try': 'Start one now',
        'page.loading': 'Reading settings…',
        'launcher.label': 'Free chat',
        'launcher.title': 'Free chat: ask something quickly',
        'launcher.failed': 'Free chat could not start: ',
        'notice.close': 'Dismiss',
      },
    }

    const CSS = [
      '.fc-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:999px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;',
      'transition:background .15s,color .15s}',
      '.fc-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.fc-chip:disabled{opacity:.55;cursor:default}',
      '.fc-chip__icon{display:inline-flex;color:var(--dsw-alias-brand-primary)}',
      '.fc-icon{position:relative;flex:none;align-self:center;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;',
      'margin:0 0 0 auto;padding:0;box-sizing:border-box;border:none;border-radius:8px;background:transparent;',
      'color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.fc-icon:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.fc-icon:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      '.fc-icon:disabled{opacity:.55;cursor:default}',
      // Icon-only mode has no visible text: the accessible name doubles as the
      // hover hint, drawn here instead of a native `title` so it follows the
      // theme and appears immediately.
      // Anchored to the button's right edge so the bubble grows leftwards: the
      // entry sits at the far right of the column, and a centered bubble would
      // be clipped by the sidebar's edge.
      '.fc-icon::after{content:attr(aria-label);position:absolute;right:0;bottom:calc(100% + 6px);',
      'padding:4px 8px;border-radius:6px;font-size:12px;line-height:16px;',
      'white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;',
      'opacity:0;transition:opacity .12s ease;z-index:80;',
      'background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);',
      'border:1px solid var(--dsw-alias-border-l1);box-shadow:0 6px 16px rgba(0,0,0,.18)}',
      '.fc-icon:hover::after,.fc-icon:focus-visible::after{opacity:1}',
      '.fc-icon--wide:only-child::after{display:none}',
      '.fc-icon__label{display:none}',
      // Alone in the row there is nothing to share it with: the button becomes a
      // full-width row like the other sidebar entries instead of a lone icon.
      '.fc-icon--wide:only-child{width:100%;height:42px;margin:0;justify-content:flex-start;gap:var(--dsh-sidebar-label-gap,6px);',
      'padding:0 calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,3px));',
      'border-radius:var(--dsw-radius-md,12px);color:var(--dsw-alias-label-primary)}',
      '.fc-icon--wide:only-child .fc-icon__label{display:block;flex:1 1 auto;min-width:0;overflow:hidden;',
      'white-space:nowrap;text-overflow:ellipsis;font-size:14px;line-height:22px;text-align:left}',
      '.fc-page{display:flex;flex-direction:column;gap:18px;padding:4px 2px 24px;color:var(--dsw-alias-label-primary);font-size:14px}',
      '.fc-page__title{margin:0;font-size:18px;font-weight:600;line-height:26px}',
      '.fc-page__desc{margin:0;color:var(--dsw-alias-label-secondary);line-height:22px;max-width:640px}',
      '.fc-card{display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:12px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);max-width:640px}',
      '.fc-field{display:flex;flex-direction:column;gap:6px}',
      '.fc-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.fc-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.fc-input{height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);',
      'background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;outline:none}',
      '.fc-input:focus{border-color:var(--dsw-focus-ring-color)}',
      '.fc-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.fc-btn{height:32px;padding:0 14px;border-radius:8px;font-size:13px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.fc-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.fc-btn--primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary)}',
      '.fc-btn--primary:hover{background:var(--dsw-alias-button-primary-hover)}',
      '.fc-btn:disabled{opacity:.55;cursor:default}',
      '.fc-note{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.fc-note--ok{color:var(--dsw-alias-state-success-primary)}',
      '.fc-note--bad{color:var(--dsw-alias-state-error-primary)}',
      '.fc-callout{margin:0;padding:10px 12px;border-radius:10px;font-size:12px;line-height:18px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.fc-notice{pointer-events:auto;position:fixed;left:50%;bottom:104px;transform:translateX(-50%);z-index:60;display:flex;gap:10px;',
      'align-items:center;max-width:560px;padding:10px 14px;border-radius:10px;font-size:13px;',
      'border:1px solid var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-overlay);',
      'color:var(--dsw-alias-label-primary);box-shadow:0 8px 24px rgba(0,0,0,.18)}',
      '.fc-notice button{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:12px}',
    ].join('')

    /* ------------------------------------------------------------- plumbing */

    function describe(error) {
      if (error === null || error === undefined) return 'unknown error'
      if (typeof error === 'string') return error
      return error.message ? String(error.message) : String(error)
    }

    async function readState() {
      const response = await fetch(STATE_URL, { headers: { accept: 'application/json' }, cache: 'no-store' })
      if (!response.ok) throw new Error('settings request failed (' + response.status + ')')
      return response.json()
    }

    async function postJson(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body === undefined ? {} : body),
      })
      const payload = await response.json().catch(function fallback() { return {} })
      if (!response.ok || payload.ok === false) {
        throw new Error(payload && payload.error ? payload.error : 'request failed (' + response.status + ')')
      }
      return payload
    }

    function samePath(left, right) {
      const trim = function trim(value) {
        return String(value === undefined ? '' : value).replace(/[\\/]+$/, '')
      }
      return trim(left) === trim(right)
    }

    /* ----------------------------------------------------------------- label */

    // The entry is named after the configured workspace, so the name lives in a
    // tiny store: the Host owns it, the settings page writes it, every seat reads
    // it. Empty until the first /state answer lands, which falls back to the
    // localized default.
    const titleStore = { value: '', listeners: new Set() }

    function setWorkspaceTitle(title) {
      const next = typeof title === 'string' ? title.trim() : ''
      if (next === titleStore.value) return
      titleStore.value = next
      titleStore.listeners.forEach(function notify(listener) { listener() })
    }

    function useWorkspaceTitle() {
      const [value, setValue] = useState(titleStore.value)
      useEffect(function subscribe() {
        const listener = function sync() { setValue(titleStore.value) }
        titleStore.listeners.add(listener)
        return function unsubscribe() { titleStore.listeners.delete(listener) }
      }, [])
      return value
    }

    /* ---------------------------------------------------------------- notice */

    const notice = { message: '', timer: 0, listeners: new Set() }

    function setNotice(message) {
      notice.message = message
      notice.listeners.forEach(function notify(listener) { listener() })
      if (notice.timer !== 0) clearTimeout(notice.timer)
      notice.timer = setTimeout(function expire() {
        notice.timer = 0
        notice.message = ''
        notice.listeners.forEach(function notify(listener) { listener() })
      }, NOTICE_TIMEOUT_MS)
    }

    function useNotice() {
      const [message, setLocal] = useState(notice.message)
      useEffect(function subscribe() {
        const listener = function sync() { setLocal(notice.message) }
        notice.listeners.add(listener)
        return function unsubscribe() { notice.listeners.delete(listener) }
      }, [])
      return message
    }

    /* ------------------------------------------------------------------ icon */

    function ChatIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 16
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', {
        d: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2v-7z',
        stroke: 'currentColor', strokeWidth: '1.3', strokeLinejoin: 'round',
      }),
      h('path', { d: 'M5.5 6.5h5M5.5 8.5h3', stroke: 'currentColor', strokeWidth: '1.1', strokeLinecap: 'round' }))
    }

    /* ------------------------------------------------------------- the plugin */

    return {
      inject: ['slots', 'sessions', 'uiWorkspace', 'workspaces', 'locale'],

      apply(ctx) {
        const sessions = ctx.sessions
        const uiWorkspace = ctx.uiWorkspace
        const workspaces = ctx.workspaces
        const locale = ctx.locale

        let translate = function fallback(key) { return DICTS.zh[key] || key }
        if (locale && typeof locale.register === 'function') {
          try {
            locale.register(NS, 'zh', DICTS.zh)
            locale.register(NS, 'en', DICTS.en)
          } catch (error) {
            /* a namespace that is already registered keeps its dictionary */
          }
        }
        if (locale && typeof locale.bind === 'function') {
          try {
            translate = locale.bind(NS)
          } catch (error) {
            /* fall back to the built-in Chinese dictionary */
          }
        }

        function t(key, values) {
          let text = ''
          try {
            text = translate(key)
          } catch (error) {
            text = ''
          }
          if (typeof text !== 'string' || text === '' || text === key) text = DICTS.zh[key] || key
          if (values) {
            Object.keys(values).forEach(function replace(token) {
              text = text.split('{' + token + '}').join(String(values[token]))
            })
          }
          return text
        }

        let launching = false

        /** Resolve the dedicated Workspace, creating and naming it on first use. */
        async function openChatWorkspace(path, title) {
          const snapshot = workspaces.list.getSnapshot()
          let workspace = snapshot.items.find(function find(item) {
            return samePath(item.path, path)
          })
          if (workspace === undefined) workspace = await workspaces.create({ path })
          if (title !== '' && workspace.title !== title) {
            try {
              workspace = await workspaces.rename(workspace.workspaceId, title)
            } catch (error) {
              /* a rename is cosmetic: the chat still opens in the right place */
            }
          }
          await uiWorkspace.openWorkspace(workspace.workspaceId)
        }

        async function startFreeChat() {
          if (launching) return
          launching = true
          try {
            const state = await readState()
            const prepared = await postJson(PREPARE_URL, { path: state.path })
            const path = typeof prepared.path === 'string' && prepared.path !== '' ? prepared.path : state.path
            const settings = state.settings || {}
            const title = typeof settings.workspaceTitle === 'string' ? settings.workspaceTitle : ''
            setWorkspaceTitle(title)
            await openChatWorkspace(path, title)
          } catch (error) {
            setNotice(t('launcher.failed') + describe(error))
          } finally {
            launching = false
          }
        }

        let disposed = false
        readState().then(function loaded(state) {
          if (disposed) return
          setWorkspaceTitle(state && state.settings ? state.settings.workspaceTitle : '')
        }).catch(function ignored() {
          /* the localized default stays until the Host answers */
        })

        /** The entry's name: the configured workspace title, or the default. */
        function entryLabel(title) {
          return title === '' ? t('launcher.label') : title
        }

        /* ------------------------------------------------------- components */

        // The footer row is a horizontal flex line shared with other plugins'
        // actions (a recent-sessions entry occupies it on most profiles), so the
        // entry is a compact icon button. When it is the row's only occupant the
        // CSS `:only-child` rule widens it into a normal sidebar row and the
        // label below starts rendering — no measurement, no DOM reads.
        function FooterEntry(props) {
          const [pending, setPending] = useState(false)
          const wide = props === undefined || props.wide !== false
          const name = entryLabel(useWorkspaceTitle())
          return h('button', {
            type: 'button',
            className: wide ? 'fc-icon fc-icon--wide' : 'fc-icon',
            'aria-label': name,
            // The rail is 56px wide: no bubble fits there, so the rail keeps the
            // native tooltip and the styled bubble serves the expanded column.
            title: wide ? undefined : name,
            disabled: pending,
            onClick: function click() {
              setPending(true)
              void startFreeChat().finally(function done() { setPending(false) })
            },
          },
          h(ChatIcon, { size: 16 }),
          wide ? h('span', { className: 'fc-icon__label' }, name) : null)
        }

        function LauncherChip() {
          const [pending, setPending] = useState(false)
          const name = entryLabel(useWorkspaceTitle())
          return h('button', {
            type: 'button',
            className: 'fc-chip',
            title: name,
            disabled: pending,
            onClick: function click(event) {
              event.preventDefault()
              event.stopPropagation()
              setPending(true)
              void startFreeChat().finally(function done() { setPending(false) })
            },
          },
          h('span', { className: 'fc-chip__icon' }, h(ChatIcon, { size: 14 })),
          h('span', null, name))
        }

        function NoticeView() {
          const message = useNotice()
          if (message === '') return null
          return h('div', { className: 'fc-notice', role: 'status' },
            h('span', null, message),
            h('button', { type: 'button', onClick: function dismiss() { setNotice('') } }, t('notice.close')))
        }

        function SettingsPage() {
          const [phase, setPhase] = useState('loading')
          const [draft, setDraft] = useState(null)
          const [saved, setSaved] = useState(null)
          const [busy, setBusy] = useState(false)
          const [note, setNote] = useState('')
          const [noteKind, setNoteKind] = useState('plain')
          const [currentPath, setCurrentPath] = useState('')
          const [exists, setExists] = useState(true)

          const load = useCallback(function load() {
            setPhase('loading')
            readState().then(function ready(state) {
              setDraft(state.settings)
              setSaved(state.settings)
              setCurrentPath(state.path || '')
              setExists(state.exists !== false)
              setPhase('ready')
            }).catch(function failed(error) {
              setNote(describe(error))
              setNoteKind('bad')
              setPhase('error')
            })
          }, [])

          useEffect(function mount() { load() }, [load])

          const update = function update(patch) {
            setDraft(function apply(previous) { return { ...previous, ...patch } })
            setNote('')
            setNoteKind('plain')
          }

          const save = function save() {
            setBusy(true)
            setNote('')
            postJson(SAVE_URL, { ...draft, mode: 'workspace' }).then(function saved(result) {
              setDraft(result.settings)
              setSaved(result.settings)
              setCurrentPath(result.path || '')
              setExists(result.exists !== false)
              setWorkspaceTitle(result.settings ? result.settings.workspaceTitle : '')
              setNote(t('page.saved'))
              setNoteKind('ok')
            }).catch(function failed(error) {
              setNote(describe(error))
              setNoteKind('bad')
            }).finally(function done() { setBusy(false) })
          }

          if (phase === 'loading') {
            return h('div', { className: 'fc-page' }, h('p', { className: 'fc-hint' }, t('page.loading')))
          }
          if (draft === null) {
            return h('div', { className: 'fc-page' },
              h('h2', { className: 'fc-page__title' }, t('page.title')),
              h('p', { className: noteKind === 'bad' ? 'fc-note fc-note--bad' : 'fc-note' }, note))
          }

          const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(draft)

          return h('div', { className: 'fc-page' },
            h('h2', { className: 'fc-page__title' }, t('page.title')),
            h('p', { className: 'fc-page__desc' }, t('page.desc')),
            h('div', { className: 'fc-card' },
              h('div', { className: 'fc-field' },
                h('label', { className: 'fc-label', htmlFor: 'fc-name' }, t('page.name.label')),
                h('input', {
                  id: 'fc-name', className: 'fc-input', type: 'text',
                  value: draft.workspaceTitle === undefined ? '' : draft.workspaceTitle,
                  placeholder: t('page.name.placeholder'),
                  onChange: function change(event) { update({ workspaceTitle: event.target.value }) },
                })),
              h('div', { className: 'fc-field' },
                h('label', { className: 'fc-label', htmlFor: 'fc-path' }, t('page.path.label')),
                h('input', {
                  id: 'fc-path', className: 'fc-input', type: 'text',
                  value: draft.chatPath === undefined ? '' : draft.chatPath,
                  onChange: function change(event) { update({ chatPath: event.target.value }) },
                }),
                h('p', { className: 'fc-hint' }, t('page.path.hint')),
                currentPath === '' ? null : h('p', { className: 'fc-hint' },
                  h('code', null, currentPath),
                  exists ? '' : ' — ' + t('page.path.missing')))),
            h('p', { className: 'fc-callout' }, t('page.note')),
            h('div', { className: 'fc-actions' },
              h('button', {
                type: 'button', className: 'fc-btn fc-btn--primary',
                disabled: busy || !dirty, onClick: save,
              }, busy ? t('page.saving') : t('page.save')),
              h('button', {
                type: 'button', className: 'fc-btn',
                onClick: function tryNow() { void startFreeChat() },
              }, t('page.try')),
              note === '' ? null : h('span', {
                className: noteKind === 'bad' ? 'fc-note fc-note--bad' : noteKind === 'ok' ? 'fc-note fc-note--ok' : 'fc-note',
              }, note)))
        }

        /** One stylesheet for every seat this bundle occupies; removed on dispose. */
        ctx.effect(function insertStyles() {
          const existing = document.getElementById('dsh-free-chat-styles')
          const style = existing || document.createElement('style')
          style.id = 'dsh-free-chat-styles'
          style.setAttribute('data-plugin', 'dsh-free-chat')
          style.textContent = CSS
          if (!existing) document.head.appendChild(style)
          return function removeStyles() { style.remove() }
        }, 'free-chat: styles')

        ctx.effect(function labelLifetime() {
          return function dispose() { disposed = true }
        }, 'free-chat: label')

        /* ------------------------------------------------------- registrations */

        ctx.slots.inject('sidebar.footer.action', function () {
          return ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'free-chat',
            order: 10,
            label: function footerLabel() { return entryLabel(titleStore.value) },
          }, FooterEntry)
        })

        ctx.slots.inject('conversation.hero.options', function () {
          return ctx.slots.register({
            name: 'conversation.hero.options',
            id: 'free-chat',
            order: 10,
            label: function heroLabel() { return entryLabel(titleStore.value) },
          }, LauncherChip)
        })

        ctx.slots.inject('settings.section', function () {
          return ctx.slots.register({
            name: 'settings.section',
            id: 'free-chat',
            order: 48,
            label: function sectionLabel() { return t('page.title') },
          }, SettingsPage)
        })

        ctx.slots.inject('settings.section.icon', function () {
          return ctx.slots.register({
            name: 'settings.section.icon',
            id: 'free-chat',
            order: 48,
          }, function NavIcon() { return h(ChatIcon, { size: 16 }) })
        })

        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'free-chat-notice',
            order: 900,
          }, NoticeView)
        })
      },
    }
  },
})
