/**
 * Auto Memory — automatically extracts key learnings from conversations
 * and persists them for future sessions.
 *
 * After each session (or on /save), analyzes the conversation to extract:
 * - Project-specific patterns ("this project uses pnpm not npm")
 * - User preferences ("user prefers functional style")
 * - Common errors and fixes
 * - File structure insights
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Message } from '../../core/types.js'
import type { ModelProvider, ChatRequest } from '../../providers/ModelProvider.js'

const MEMORY_DIR = join(homedir(), '.clawharness', 'memory')
const GLOBAL_MEMORY_FILE = join(MEMORY_DIR, 'global.md')

export interface MemoryEntry {
  content: string
  source: 'auto' | 'manual'
  project?: string
  timestamp: number
}

/**
 * Extract learnings from a conversation and append to memory.
 */
export async function extractAndSaveMemories(
  messages: Message[],
  provider: ModelProvider,
  projectName?: string,
): Promise<string[]> {
  if (messages.length < 4) return []

  // Build conversation summary for extraction
  const conversationText = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `[${m.role}]: ${m.content.slice(0, 300)}`)
    .slice(-20) // last 20 messages
    .join('\n')

  let extracted = ''
  const req: ChatRequest = {
    systemPrompt: [
      'You extract reusable learnings from coding conversations.',
      'Output a bullet list of things worth remembering for future sessions.',
      'Focus on: project patterns, user preferences, common errors, important file paths.',
      'Be specific and actionable. Skip trivial observations.',
      'If nothing worth remembering, output "NONE".',
      'Output only the bullet list, no preamble.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: `Extract learnings from this session:\n\n${conversationText}`,
    }],
    maxTokens: 512,
  }

  try {
    for await (const chunk of provider.chat(req)) {
      if (chunk.type === 'text') extracted += chunk.text
    }
  } catch {
    return []
  }

  if (!extracted.trim() || extracted.includes('NONE')) return []

  // Parse bullet points
  const learnings = extracted
    .split('\n')
    .map(l => l.replace(/^[-*•]\s*/, '').trim())
    .filter(l => l.length > 10)

  if (learnings.length === 0) return []

  // Save to memory file
  saveMemories(learnings, projectName)

  return learnings
}

function saveMemories(learnings: string[], projectName?: string) {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true })

  const targetFile = projectName
    ? join(MEMORY_DIR, `${sanitizeFilename(projectName)}.md`)
    : GLOBAL_MEMORY_FILE

  let existing = ''
  if (existsSync(targetFile)) {
    existing = readFileSync(targetFile, 'utf-8')
  }

  const newEntries = learnings.map(l => `- ${l}`).join('\n')
  const timestamp = new Date().toISOString().split('T')[0]
  const section = `\n\n## ${timestamp}\n${newEntries}`

  writeFileSync(targetFile, existing + section, 'utf-8')
}

/**
 * Load all relevant memories for the current context.
 */
export function loadMemories(projectName?: string): string {
  const memories: string[] = []

  // Global memories
  if (existsSync(GLOBAL_MEMORY_FILE)) {
    memories.push(readFileSync(GLOBAL_MEMORY_FILE, 'utf-8'))
  }

  // Project-specific memories
  if (projectName) {
    const projectFile = join(MEMORY_DIR, `${sanitizeFilename(projectName)}.md`)
    if (existsSync(projectFile)) {
      memories.push(readFileSync(projectFile, 'utf-8'))
    }
  }

  return memories.join('\n\n---\n\n')
}

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 50)
}
