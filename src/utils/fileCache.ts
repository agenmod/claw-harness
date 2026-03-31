import { createHash } from 'crypto'
import { readFile, stat } from 'fs/promises'

interface CacheEntry {
  hash: string
  content: string
  mtime: number
  size: number
  accessCount: number
  lastAccess: number
}

/**
 * File state cache — remembers recently read files to:
 * 1. Avoid re-reading unchanged files (save tokens)
 * 2. Detect external modifications before editing (conflict detection)
 */
export class FileCache {
  private cache = new Map<string, CacheEntry>()
  private maxEntries: number

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries
  }

  /** Record a file's content after reading */
  set(path: string, content: string, mtime: number) {
    this.evictIfNeeded()
    this.cache.set(path, {
      hash: this.hash(content),
      content,
      mtime,
      size: content.length,
      accessCount: 1,
      lastAccess: Date.now(),
    })
  }

  /** Get cached content if file hasn't changed (by mtime) */
  async getIfFresh(path: string): Promise<string | null> {
    const entry = this.cache.get(path)
    if (!entry) return null

    try {
      const s = await stat(path)
      if (s.mtimeMs === entry.mtime) {
        entry.accessCount++
        entry.lastAccess = Date.now()
        return entry.content
      }
    } catch {}

    // File changed or gone, invalidate
    this.cache.delete(path)
    return null
  }

  /**
   * Check if a file was modified externally since we last read it.
   * Returns true if the file on disk differs from our cached version.
   */
  async hasExternalChanges(path: string): Promise<boolean> {
    const entry = this.cache.get(path)
    if (!entry) return false // never read → no conflict

    try {
      const current = await readFile(path, 'utf-8')
      return this.hash(current) !== entry.hash
    } catch {
      return true // file gone = definitely changed
    }
  }

  /** Get the hash of cached content (for edit conflict detection) */
  getCachedHash(path: string): string | null {
    return this.cache.get(path)?.hash ?? null
  }

  invalidate(path: string) {
    this.cache.delete(path)
  }

  clear() {
    this.cache.clear()
  }

  private hash(content: string): string {
    return createHash('md5').update(content).digest('hex')
  }

  private evictIfNeeded() {
    if (this.cache.size < this.maxEntries) return
    // Evict least recently accessed
    let oldest: string | null = null
    let oldestTime = Infinity
    for (const [path, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldest = path
        oldestTime = entry.lastAccess
      }
    }
    if (oldest) this.cache.delete(oldest)
  }
}
