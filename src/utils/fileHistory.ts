import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import { homedir } from 'os'

const HISTORY_DIR = join(homedir(), '.clawharness', 'file-history')

interface HistoryEntry {
  path: string
  timestamp: number
  snapshotFile: string
}

const history: HistoryEntry[] = []

/**
 * Take a snapshot of a file before modifying it.
 * Enables undo if the model makes a mistake.
 */
export function snapshotBefore(filePath: string): boolean {
  if (!existsSync(filePath)) return false

  try {
    if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true })

    const ts = Date.now()
    const name = `${basename(filePath)}.${ts}.bak`
    const dest = join(HISTORY_DIR, name)

    copyFileSync(filePath, dest)
    history.push({ path: filePath, timestamp: ts, snapshotFile: dest })

    // Keep max 50 snapshots
    while (history.length > 50) {
      const old = history.shift()
      try { if (old) require('fs').unlinkSync(old.snapshotFile) } catch {}
    }

    return true
  } catch {
    return false
  }
}

/**
 * Restore the most recent snapshot of a file.
 */
export function undoFile(filePath: string): { restored: boolean; from?: string } {
  const entry = [...history].reverse().find(e => e.path === filePath)
  if (!entry || !existsSync(entry.snapshotFile)) {
    return { restored: false }
  }

  try {
    copyFileSync(entry.snapshotFile, filePath)
    return { restored: true, from: new Date(entry.timestamp).toISOString() }
  } catch {
    return { restored: false }
  }
}

/**
 * List snapshots for a file.
 */
export function getFileHistory(filePath: string): Array<{ timestamp: number; snapshotFile: string }> {
  return history
    .filter(e => e.path === filePath)
    .map(e => ({ timestamp: e.timestamp, snapshotFile: e.snapshotFile }))
}
