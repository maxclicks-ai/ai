// Minimal YAML frontmatter reader for SKILL.md: handles `key: value` and block
// scalars (`>-`, `>`, `|`). Enough for `name` and `description`.
export function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const lines = match[1].split(/\r?\n/)
  const out = {}
  for (let index = 0; index < lines.length; index += 1) {
    const keyValue = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!keyValue) continue
    const key = keyValue[1]
    let value = keyValue[2]
    if (value === '>-' || value === '>' || value === '|' || value === '|-') {
      const block = []
      while (index + 1 < lines.length && (lines[index + 1].startsWith('  ') || lines[index + 1].trim() === '')) {
        index += 1
        block.push(lines[index].trim())
      }
      value = block.join(' ').replace(/\s+/g, ' ').trim()
    } else {
      value = value.replace(/^["']|["']$/g, '').trim()
    }
    out[key] = value
  }
  return out
}
