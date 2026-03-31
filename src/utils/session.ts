import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import type { Message } from '../core/types.js'

const SESSION_DIR = join(homedir(), '.clawharness', 'sessions')

function ensureDir() {
  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true })
}

export interface Session {
  id: string
  cwd: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export function saveSession(cwd: string, messages: Message[], id?: string): string {
  ensureDir()
  const sid = id ?? randomUUID().slice(0, 8)
  const session: Session = {
    id: sid,
    cwd,
    messages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  writeFileSync(join(SESSION_DIR, `${sid}.json`), JSON.stringify(session, null, 2), 'utf-8')
  return sid
}

export function loadSession(id: string): Session | null {
  const p = join(SESSION_DIR, `${id}.json`)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

export function getLastSession(cwd: string): Session | null {
  ensureDir()
  const { readdirSync, statSync } = require('fs')
  const files: string[] = readdirSync(SESSION_DIR).filter((f: string) => f.endsWith('.json'))
  let latest: Session | null = null
  let latestTime = 0

  for (const f of files) {
    try {
      const s: Session = JSON.parse(readFileSync(join(SESSION_DIR, f), 'utf-8'))
      if (s.cwd === cwd) {
        const t = new Date(s.updatedAt).getTime()
        if (t > latestTime) { latest = s; latestTime = t }
      }
    } catch {}
  }

  return latest
}
