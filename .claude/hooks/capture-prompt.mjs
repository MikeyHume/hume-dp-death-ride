#!/usr/bin/env node
/**
 * capture-prompt.mjs — UserPromptSubmit hook
 *
 * Captures Mikey's prompts to .slack-responder-live.md so the spawned
 * Claude auto-responder knows what was just discussed in VS Code.
 *
 * Keeps only the last 10 messages (rolling window).
 * Reads JSON from stdin, writes to live-state file, exits 0.
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LIVE_FILE = path.join(PROJECT_DIR, '.slack-responder-live.md');
const MAX_ENTRIES = 10;

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const prompt = input.prompt;
    if (!prompt || typeof prompt !== 'string') {
      process.exit(0);
      return;
    }

    // Skip empty or very short prompts (likely accidental)
    const trimmed = prompt.trim();
    if (trimmed.length < 2) {
      process.exit(0);
      return;
    }

    // Truncate long prompts to first 500 chars for the live file
    const preview = trimmed.length > 500
      ? trimmed.substring(0, 497) + '...'
      : trimmed;

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const entry = `[${timestamp}] ${preview}`;

    // Read existing entries
    let entries = [];
    try {
      const existing = fs.readFileSync(LIVE_FILE, 'utf8');
      const lines = existing.split('\n');
      // Find entries (lines starting with [)
      entries = lines.filter(l => l.startsWith('['));
    } catch { /* file doesn't exist yet */ }

    // Add new entry, keep last MAX_ENTRIES
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(entries.length - MAX_ENTRIES);
    }

    // Write the file
    const content = [
      '# PClaude Live State',
      `> Auto-updated by UserPromptSubmit hook. Last ${MAX_ENTRIES} messages from Mikey.`,
      '> The spawned Claude reads this to know what was just discussed in VS Code.',
      `> Last updated: ${timestamp}`,
      '',
      '## Recent Messages (newest last)',
      ...entries,
      '',
    ].join('\n');

    fs.writeFileSync(LIVE_FILE, content);
  } catch {
    // Never block — just silently fail
  }

  process.exit(0);
});

// Failsafe: if stdin doesn't close within 2s, exit anyway
setTimeout(() => process.exit(0), 2000);
