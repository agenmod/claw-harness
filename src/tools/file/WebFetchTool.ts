import type { Tool, ToolResult } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'

/**
 * WebFetch — fetches URL content with:
 * - HTML readability extraction (strips nav/ads/scripts)
 * - JSON pretty printing
 * - Redirect following
 * - Timeout handling
 * - Content type validation
 */
export const WebFetchTool: Tool = {
  name: 'WebFetch',
  description: 'Fetch a URL and return its text content. Strips HTML for readability. Use for docs, APIs, web pages.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'WebFetch',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch (must start with http/https)' },
          selector: { type: 'string', description: 'CSS-like hint: "main", "article", "code" to focus extraction (optional)' },
          raw: { type: 'boolean', description: 'Return raw HTML without stripping (default: false)' },
        },
        required: ['url'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input): Promise<ToolResult> {
    const url = String(input.url ?? '')
    const raw = Boolean(input.raw)
    const selector = String(input.selector ?? '')

    if (!url.startsWith('http')) return { output: 'Error: URL must start with http(s)://', isError: true }

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CodeHarness/0.1)',
          'Accept': 'text/html,application/json,text/plain,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      })

      if (!resp.ok) return { output: `HTTP ${resp.status} ${resp.statusText}`, isError: true }

      const ct = resp.headers.get('content-type') ?? ''

      // Binary content
      if (ct.includes('image') || ct.includes('audio') || ct.includes('video') || ct.includes('octet-stream') || ct.includes('pdf')) {
        return { output: `Non-text content: ${ct}. Use Bash "curl -O" to download.`, isError: true }
      }

      let text = await resp.text()

      // JSON → pretty print
      if (ct.includes('json') || url.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text)
          text = JSON.stringify(parsed, null, 2)
          if (text.length > 50_000) text = text.slice(0, 50_000) + '\n... (truncated)'
          return { output: text, isError: false }
        } catch {}
      }

      // HTML → extract readable text
      if (ct.includes('html') && !raw) {
        text = extractReadableText(text, selector)
      }

      if (text.length > 50_000) text = text.slice(0, 50_000) + '\n... (truncated)'
      if (!text.trim()) return { output: '(empty response)', isError: false }

      return { output: text, isError: false }
    } catch (e: any) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        return { output: 'Request timed out (15s)', isError: true }
      }
      return { output: `Fetch error: ${e.message}`, isError: true }
    }
  },
}

function extractReadableText(html: string, hint?: string): string {
  // Remove non-content elements
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Try to extract main content area
  if (hint) {
    const tagMatch = text.match(new RegExp(`<${hint}[^>]*>([\\s\\S]*?)<\\/${hint}>`, 'i'))
    if (tagMatch) text = tagMatch[1]!
  } else {
    // Try common content containers
    for (const tag of ['main', 'article', '[role="main"]']) {
      const m = text.match(new RegExp(`<(?:div|section|main)[^>]*(?:class|id|role)="[^"]*${tag}[^"]*"[^>]*>([\\s\\S]*?)(?:<\\/(?:div|section|main)>)`, 'i'))
      if (m && m[1]!.length > 200) { text = m[1]!; break }
    }
  }

  // Strip remaining tags, normalize whitespace
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<(?:li|tr)>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return text
}
