import type { Tool, ToolResult, ToolContext } from '../Tool.js'
import type { FunctionSchema } from '../../providers/ModelProvider.js'

/**
 * Web search tool — fetches search results via a free API or fallback.
 * Uses DuckDuckGo HTML (no API key needed) or SerpAPI if configured.
 */
export const WebSearchTool: Tool = {
  name: 'WebSearch',
  description: 'Search the web for information. Returns summarized search results. Use for finding docs, solutions, current info.',
  readOnly: true,

  schema(): FunctionSchema {
    return {
      name: 'WebSearch',
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          num_results: { type: 'number', description: 'Max results (default: 5)' },
        },
        required: ['query'],
      },
    }
  },

  needsConfirm() { return false },

  async run(input): Promise<ToolResult> {
    const query = String(input.query ?? '').trim()
    if (!query) return { output: 'Error: empty query', isError: true }
    const num = Math.min(Number(input.num_results) || 5, 10)

    try {
      // Try DuckDuckGo HTML scrape (no API key needed)
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'CodeHarness/0.1' },
        signal: AbortSignal.timeout(10_000),
      })

      if (!resp.ok) return { output: `Search failed: HTTP ${resp.status}`, isError: true }

      const html = await resp.text()

      // Extract results from DDG HTML
      const results: string[] = []
      const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

      const links: Array<{ url: string; title: string }> = []
      let m
      while ((m = linkRegex.exec(html)) !== null) {
        const rawUrl = m[1] ?? ''
        const title = (m[2] ?? '').replace(/<[^>]+>/g, '').trim()
        // DDG wraps URLs in a redirect; extract the actual URL
        const actualUrl = rawUrl.includes('uddg=')
          ? decodeURIComponent(rawUrl.split('uddg=')[1]?.split('&')[0] ?? rawUrl)
          : rawUrl
        if (title && actualUrl.startsWith('http')) {
          links.push({ url: actualUrl, title })
        }
      }

      const snippets: string[] = []
      while ((m = snippetRegex.exec(html)) !== null) {
        snippets.push((m[1] ?? '').replace(/<[^>]+>/g, '').trim())
      }

      for (let i = 0; i < Math.min(links.length, num); i++) {
        const link = links[i]!
        const snippet = snippets[i] ?? ''
        results.push(`${i + 1}. ${link.title}\n   ${link.url}\n   ${snippet}`)
      }

      if (results.length === 0) {
        return { output: `No results found for "${query}"`, isError: false }
      }

      return {
        output: `Search results for "${query}":\n\n${results.join('\n\n')}`,
        isError: false,
      }
    } catch (e: any) {
      return { output: `Search error: ${e.message}`, isError: true }
    }
  },
}
