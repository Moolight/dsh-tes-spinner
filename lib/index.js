// Host half of dsh-tes-spinner.
//
// Zero static imports on purpose: a top-level import of a package that is not
// installed (schemastery was declared but never linked) made this module fail
// at load time, which the loader reports as "started but not running".
//
// This half owns exactly one job: serving the plugin's own public/ assets.
// The DSH '/plugins/' endpoint only serves client bundles and RPC — it does
// NOT serve arbitrary plugin files, so a bare
// '/plugins/dsh-tes-spinner/tes-gyro.png' answers 404 (verified: the panel
// showed a broken image and its audio never played). Official plugins solve
// this the same way: register a prefix route on the host webserver and stream
// the file out (see @linxin666/dsh-pet's /pet/<id>/* asset route).

import { createReadStream, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, normalize, sep } from 'node:path'

export const name = 'dsh-tes-spinner'
export const TES_SPINNER_NS = 'dsh-tes-spinner'

// The webserver service is required to serve public/ assets.
export const inject = ['webServer']

/** Browser-facing base path of this plugin's own assets. */
export const ASSET_PREFIX = '/plugins/dsh-tes-spinner'

// Minimal, dependency-free config defaults (kept in sync with the browser half).
export const DEFAULT_CONFIG = {
  spinDuration: 3000,
  audioVolume: 0.8,
  spinTurns: 4,
  spinDirection: 'random',
  enableSoundEffect: true,
  enableDrag: true,
}

/** MIME table for the asset kinds this plugin ships. */
const MIME = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  // 歌词:LRC 是纯文本。用 text/plain 保证浏览器当文本取,
  // 不设 charset 让客户端按自己的解码策略处理(多为 UTF-8)。
  '.lrc': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/** The plugin's public/ directory, resolved from this module's own location. */
function publicDir() {
  // lib/index.js -> <package root>/public
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
}

/**
 * Handler behind ASSET_PREFIX.
 *
 * Names are resolved inside public/ and rejected when the resolved path
 * escapes it, so a traversal request cannot read anything else.
 */
function assetHandler() {
  const root = publicDir()
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    let pathname
    try {
      pathname = new URL(req.url ?? '/', 'http://tes-spinner.local').pathname
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    let rel
    try {
      rel = decodeURIComponent(pathname.slice(ASSET_PREFIX.length))
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    rel = rel.replace(/^\/+/, '')
    if (rel === '') {
      res.writeHead(404)
      res.end()
      return
    }
    // Containment check: the normalized target must stay under public/.
    const target = normalize(join(root, rel))
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403)
      res.end()
      return
    }
    let stat
    try {
      stat = statSync(target)
      if (!stat.isFile()) throw new Error('not a file')
    } catch {
      res.writeHead(404)
      res.end()
      return
    }
    const ext = target.slice(target.lastIndexOf('.')).toLowerCase()
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': String(stat.size),
      'cache-control': 'no-cache',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(target).pipe(res)
  }
}

/** The prefix route serving public/ at ASSET_PREFIX. */
export function assetRoute() {
  return {
    kind: 'prefix',
    path: ASSET_PREFIX,
    handler: assetHandler(),
  }
}

/**
 * Register the settings namespace when a settings service is present.
 *
 * Resolved through a dynamic import so an unresolvable package can never break
 * this module's own load. Any failure is contained: the panel simply falls back
 * to DEFAULT_CONFIG.
 */
async function attachSettings(ctx, config) {
  let settings = null
  try {
    settings = await import('@deepseek-ai/dsh-settings')
  } catch {
    return // settings package unavailable — nothing to wire
  }
  const install = settings?.installSettingsSection
  const brand = settings?.settingsNamespace
  if (typeof install !== 'function' || typeof brand !== 'function') return

  install(
    ctx,
    brand(TES_SPINNER_NS),
    // schemastery is optional here too: without it the entry config is used
    // as-is, which is all this plugin needs.
    undefined,
    config ?? DEFAULT_CONFIG,
    {
      setSource: () => {},
      onChange: () => {},
    },
  )
}

export function apply(ctx, config) {
  // 1) Serve public/ so the panel's image and audio actually load.
  try {
    ctx.inject(['webServer'], (webCtx) => {
      try {
        const route = assetRoute()
        webCtx.effect(() => {
          const dispose = webCtx.webServer.register(route)
          return () => {
            try {
              dispose()
            } catch {
              /* already gone */
            }
          }
        }, 'tes-spinner: assets')
      } catch {
        /* webServer present but register refused — panel falls back to CSS gyro */
      }
    })
  } catch {
    /* no webserver: the panel still renders, using its CSS fallback gyro */
  }

  // 2) Optional settings namespace.
  try {
    ctx.inject(['settings'], () => {
      attachSettings(ctx, config).catch(() => {})
    })
  } catch {
    /* no settings service: the browser half uses its own defaults */
  }
}

