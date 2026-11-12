/**
 * Host half of the free-chat bundle.
 *
 * Two jobs, both small:
 *   1. keep the settings the browser page needs (mode / workspace title / chat
 *      directory) in one JSON file beside the profile. The page origin carries
 *      a random port on every Desktop launch, so browser storage is not a
 *      durable home for a preference;
 *   2. create the chat directory on demand, with `mkdir -p` semantics.
 *
 * The browser half (client.js) owns the entry points, the session creation and
 * the settings page. Nothing here touches the Session log or the Workspace
 * registry: whether a chat joins a Workspace is decided in the page, through
 * the ordinary Client services.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

const STATE_PATH = '/api/free-chat/state'
const SAVE_PATH = '/api/free-chat/save'
const PREPARE_PATH = '/api/free-chat/prepare'

const MAX_BODY_BYTES = 16 * 1024
const MAX_TITLE_LENGTH = 60
const MAX_PATH_LENGTH = 400

/** The settings shape the page reads; every value is a plain string. */
const DEFAULTS = {
  mode: 'ungrouped',
  workspaceTitle: '自由会话',
  chatPath: '~/.dsh/free-chat',
}

export const inject = ['webServer']

/**
 * Register the three routes the browser half calls.
 * @param ctx - Host context carrying the web server.
 */
export function apply(ctx) {
  const file = settingsFile()
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: STATE_PATH, handler: stateHandler(ctx, file) }),
    'free-chat state route',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: SAVE_PATH, handler: saveHandler(ctx, file) }),
    'free-chat save route',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: PREPARE_PATH, handler: prepareHandler(ctx) }),
    'free-chat prepare route',
  )
}

/* ------------------------------------------------------------------ routes */

function stateHandler(ctx, file) {
  return async (req, res) => {
    if (!admitted(ctx, req, res, 'GET')) return
    const settings = await readSettings(file)
    const path = expandPath(settings.chatPath)
    sendJson(res, 200, { settings, path, exists: await isDirectory(path) })
  }
}

function saveHandler(ctx, file) {
  return async (req, res) => {
    if (!admitted(ctx, req, res, 'POST')) return
    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      sendJson(res, 400, { ok: false, error: '请求内容不是合法的 JSON：' + describe(error) })
      return
    }
    const settings = normalizeSettings(body)
    const path = expandPath(settings.chatPath)
    if (!isAbsolute(path)) {
      sendJson(res, 400, { ok: false, error: '聊天目录必须是绝对路径（可以用 ~/ 开头）。' })
      return
    }
    try {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(settings, null, 2) + '\n', 'utf8')
    } catch (error) {
      sendJson(res, 500, { ok: false, error: '无法保存设置：' + describe(error) })
      return
    }
    sendJson(res, 200, { ok: true, settings, path, exists: await isDirectory(path) })
  }
}

function prepareHandler(ctx) {
  return async (req, res) => {
    if (!admitted(ctx, req, res, 'POST')) return
    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      sendJson(res, 400, { ok: false, error: '请求内容不是合法的 JSON：' + describe(error) })
      return
    }
    const path = typeof body.path === 'string' && body.path.trim() !== ''
      ? expandPath(body.path)
      : expandPath(DEFAULTS.chatPath)
    if (!isAbsolute(path)) {
      sendJson(res, 400, { ok: false, error: '聊天目录必须是绝对路径。' })
      return
    }
    try {
      await mkdir(path, { recursive: true })
    } catch (error) {
      sendJson(res, 500, { ok: false, error: '无法创建聊天目录：' + describe(error) })
      return
    }
    sendJson(res, 200, { ok: true, path })
  }
}

/* ------------------------------------------------------------------ files */

/** One settings file under the DSH home, whatever profile the Host was launched with. */
function settingsFile() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'free-chat.settings.json')
}

async function readSettings(file) {
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? normalizeSettings(parsed) : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Coerce whatever the page (or a hand-edited file) sent into the accepted shape. */
function normalizeSettings(input) {
  const mode = input.mode === 'workspace' ? 'workspace' : 'ungrouped'
  const title = typeof input.workspaceTitle === 'string' ? input.workspaceTitle.trim() : ''
  const chatPath = typeof input.chatPath === 'string' ? input.chatPath.trim() : ''
  return {
    mode,
    workspaceTitle: (title === '' ? DEFAULTS.workspaceTitle : title).slice(0, MAX_TITLE_LENGTH),
    chatPath: (chatPath === '' ? DEFAULTS.chatPath : chatPath).slice(0, MAX_PATH_LENGTH),
  }
}

function expandPath(value) {
  const trimmed = value.trim()
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return join(homedir(), trimmed.slice(2))
  return trimmed
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/* ---------------------------------------------------------------- plumbing */

function admitted(ctx, req, res, method) {
  if (req.method !== method) {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return false
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    const expected = readWebOrigin(ctx)
    if (expected !== null && origin !== expected) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' })
      return false
    }
  }
  return true
}

function readWebOrigin(ctx) {
  const webServer = ctx.webServer
  if (webServer === undefined || typeof webServer.getOrigin !== 'function') return null
  try {
    return webServer.getOrigin()
  } catch {
    return null
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return parsed !== null && typeof parsed === 'object' ? parsed : {}
}

function describe(error) {
  return error && error.message ? error.message : String(error)
}
