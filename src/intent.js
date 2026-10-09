// Parse an INTENT.md file into a structured object.
//
// Recognised sections (H2, case-insensitive):
//   ## Goal               free text
//   ## Acceptance checks  list items; an item that starts with `cmd` is a command check
//   ## Scope              globs the change may touch (optional; omitted = no scope check)
//   ## Out of scope       free text list (informational)
//   ## Allowed tests      globs of test files the agent may add/modify, or "none" (default: none)
//   ## Examples           free text (input -> expected behaviour), informational

const SECTION_ALIASES = {
  goal: 'goal',
  acceptance: 'acceptance',
  'acceptance checks': 'acceptance',
  'acceptance criteria': 'acceptance',
  scope: 'scope',
  'in scope': 'scope',
  'out of scope': 'outOfScope',
  'non-goals': 'outOfScope',
  'allowed tests': 'allowedTests',
  tests: 'allowedTests',
  examples: 'examples',
};

function stripCode(s) {
  const m = s.match(/^`([^`]+)`$/);
  return m ? m[1] : s;
}

function listItems(lines) {
  const items = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (m) items.push(m[1].trim());
    else if (items.length && /^\s{2,}\S/.test(line)) items[items.length - 1] += ' ' + line.trim();
  }
  return items;
}

export function parseIntent(markdown) {
  const sections = {};
  let title = null;
  let current = null;
  let inFence = false;
  for (const raw of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) inFence = !inFence;
    if (!inFence) {
      const h1 = raw.match(/^#\s+(.+?)\s*#*\s*$/);
      if (h1 && title === null) { title = h1[1]; continue; }
      const h2 = raw.match(/^##\s+(.+?)\s*#*\s*$/);
      if (h2) {
        const key = SECTION_ALIASES[h2[1].toLowerCase().replace(/[:：]$/, '').trim()];
        current = key || null;
        if (key && !sections[key]) sections[key] = [];
        continue;
      }
    }
    if (current) sections[current].push(raw);
  }

  const acceptance = listItems(sections.acceptance || []).map((item, index) => {
    const box = item.match(/^\[( |x|X)\]\s*(.*)$/);
    const text = box ? box[2].trim() : item;
    const cmd = text.match(/^`([^`]+)`/);
    return {
      id: index + 1,
      text,
      checked: box ? box[1].toLowerCase() === 'x' : false,
      command: cmd ? cmd[1].trim() : null,
    };
  });

  const scopeItems = listItems(sections.scope || []).map(stripCode);
  const allowedRaw = listItems(sections.allowedTests || []).map(stripCode);
  const allowedText = (sections.allowedTests || []).join(' ').trim().toLowerCase();
  const testsNone = allowedRaw.length === 0 || allowedRaw.every((s) => /^none\b/i.test(s)) || /^none\b/.test(allowedText);

  return {
    title,
    goal: (sections.goal || []).join('\n').trim(),
    acceptance,
    scope: scopeItems.length ? scopeItems : null,
    outOfScope: listItems(sections.outOfScope || []),
    allowedTests: testsNone ? [] : allowedRaw.filter((s) => !/^none\b/i.test(s)),
    examples: (sections.examples || []).join('\n').trim(),
  };
}

export function validateIntent(intent) {
  const problems = [];
  if (!intent.goal) problems.push('INTENT.md has no "## Goal" section (or it is empty).');
  if (!intent.acceptance.length) problems.push('INTENT.md has no "## Acceptance checks" items.');
  return problems;
}
