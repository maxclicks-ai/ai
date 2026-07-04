#!/usr/bin/env node
// Generates .well-known/skills/index.json from the skills/ directory, in the
// format the `npx skills add <url>` installer reads. Pass --check to verify the
// committed index is up to date (used in CI) instead of writing it.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseFrontmatter } from './frontmatter.mjs'

const SKILLS_DIR = 'skills'
const OUT_DIR = join('.well-known', 'skills')
const OUT_FILE = join(OUT_DIR, 'index.json')

function listFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...listFiles(full))
    else files.push(full)
  }
  return files
}

const skills = []
for (const name of readdirSync(SKILLS_DIR).sort()) {
  const dir = join(SKILLS_DIR, name)
  if (!statSync(dir).isDirectory()) continue
  const skillPath = join(dir, 'SKILL.md')
  if (!existsSync(skillPath)) continue

  const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'))
  const files = listFiles(dir)
    .map(file => relative(dir, file))
    .sort((a, b) => (a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b)))

  skills.push({ name: fm.name || name, description: fm.description || '', files })
}

const output = JSON.stringify({ skills }, null, 2) + '\n'

if (process.argv.includes('--check')) {
  const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : ''
  if (current !== output) {
    console.error('.well-known/skills/index.json is out of date. Run `npm run build:index`.')
    process.exit(1)
  }
  console.log('.well-known/skills/index.json is up to date.')
} else {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_FILE, output)
  console.log(`Wrote ${OUT_FILE} (${skills.length} skills).`)
}
