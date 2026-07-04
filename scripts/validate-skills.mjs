#!/usr/bin/env node
// Validates every skill under skills/: a SKILL.md with `name` and `description`
// frontmatter, the name matching the directory, and SKILL.md within the size budget.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter.mjs'

const SKILLS_DIR = 'skills'
const MAX_LINES = 500

let failures = 0
const fail = message => {
  console.error(`FAIL ${message}`)
  failures += 1
}

for (const name of readdirSync(SKILLS_DIR).sort()) {
  const dir = join(SKILLS_DIR, name)
  if (!statSync(dir).isDirectory()) continue

  const skillPath = join(dir, 'SKILL.md')
  let content
  try {
    content = readFileSync(skillPath, 'utf8')
  } catch {
    fail(`${name}: missing SKILL.md`)
    continue
  }

  const fm = parseFrontmatter(content)
  if (!fm.name) fail(`${name}: frontmatter is missing 'name'`)
  else if (fm.name !== name) fail(`${name}: frontmatter name '${fm.name}' does not match directory '${name}'`)
  if (!fm.description) fail(`${name}: frontmatter is missing 'description'`)
  else if (fm.description.length < 40) fail(`${name}: description is too short to trigger reliably (${fm.description.length} chars)`)

  const lines = content.split('\n').length
  if (lines > MAX_LINES) fail(`${name}: SKILL.md is ${lines} lines (keep it under ${MAX_LINES}; move detail to references/)`)

  if (fm.name === name && fm.description && lines <= MAX_LINES) console.log(`ok   ${name} (${lines} lines)`)
}

if (failures > 0) {
  console.error(`\n${failures} skill validation error(s).`)
  process.exit(1)
}
console.log('\nAll skills valid.')
