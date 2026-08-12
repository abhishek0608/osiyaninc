import { pathToFileURL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

type VercelRequest = IncomingMessage & {
  body?: unknown
  query?: Record<string, string>
}

type VercelResponse = ServerResponse & {
  status: (statusCode: number) => VercelResponse
  json: (payload: unknown) => VercelResponse
}

const API_ROUTE = /^\/api\/([a-z0-9-]+)\/?$/i

function installLocalApiMiddleware(
  middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void },
) {
  middlewares.use(async (incomingReq, outgoingRes, next) => {
    const requestUrl = new URL(incomingReq.url || '/', 'http://localhost')
    const match = requestUrl.pathname.match(API_ROUTE)
    if (!match) return next()

    const moduleUrl = pathToFileURL(new URL(`./api/${match[1]}.js`, import.meta.url).pathname).href
    const req = incomingReq as VercelRequest
    const res = outgoingRes as VercelResponse

    req.query = Object.fromEntries(requestUrl.searchParams.entries())
    res.status = (statusCode) => {
      res.statusCode = statusCode
      return res
    }
    res.json = (payload) => {
      if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(payload))
      return res
    }

    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        const rawBody = Buffer.concat(chunks).toString('utf8')
        const contentType = String(req.headers['content-type'] || '')
        req.body = contentType.includes('application/json') && rawBody ? JSON.parse(rawBody) : rawBody
      }

      const apiModule = await import(moduleUrl)
      if (typeof apiModule.default !== 'function') throw new Error(`No API handler for ${requestUrl.pathname}`)
      await apiModule.default(req, res)
    } catch (error) {
      console.error(`Local API failed for ${requestUrl.pathname}:`, error)
      if (!res.headersSent) res.status(500).json({ message: 'Local API request failed.' })
      else if (!res.writableEnded) res.end()
    }
  })
}

function localApiPlugin(enabled: boolean): Plugin {
  return {
    name: 'osiyan-local-api',
    configureServer(server) {
      if (enabled) installLocalApiMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      if (enabled) installLocalApiMiddleware(server.middlewares)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL

  // API modules are imported into Vite's Node process during local development,
  // so copy server-only values loaded from .env into process.env. Vite still only
  // exposes VITE_* values to browser code.
  Object.assign(process.env, env)

  return {
    plugins: [vue(), localApiPlugin(!proxyTarget)],
    server: {
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
              secure: true,
            },
          }
        : undefined,
    },
  }
})
