import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, basename, dirname, parse as parsePath } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ── Configuration ───────────────────────────────────────────────────

const VAULT_PATH = process.env.OBSIDIAN_VAULT ?? "";

// ── Internal helpers ────────────────────────────────────────────────

function getVaultPath(): string {
  if (!VAULT_PATH) throw new Error("OBSIDIAN_VAULT env var not set");
  if (!existsSync(VAULT_PATH))
    throw new Error(`Vault path does not exist: ${VAULT_PATH}`);
  return VAULT_PATH;
}

function todayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Recursively collect all .md files, skipping dotfiles/dotfolders. */
function walkMd(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMd(full));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

/** Parse YAML frontmatter from note content. */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown> | null;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontmatter: null, body: content };

  try {
    const fm = parseYaml(match[1]) as Record<string, unknown>;
    const body = content.slice(match[0].length);
    return { frontmatter: fm && typeof fm === "object" ? fm : null, body };
  } catch {
    return { frontmatter: null, body: content };
  }
}

/** Resolve a wikilink-style name to an absolute file path. */
function resolveNote(name: string): string {
  const vault = getVaultPath();

  // Direct path (includes / or .md extension)
  if (name.includes("/") || name.endsWith(".md")) {
    const direct = join(vault, name.endsWith(".md") ? name : name + ".md");
    if (existsSync(direct)) return direct;
  }

  const target = name.toLowerCase().replace(/\.md$/i, "");
  const allFiles = walkMd(vault);

  // Exact basename match (case-insensitive)
  for (const f of allFiles) {
    if (basename(f, ".md").toLowerCase() === target) return f;
  }

  // Check frontmatter aliases
  for (const f of allFiles) {
    try {
      const content = readFileSync(f, "utf-8");
      const { frontmatter } = parseFrontmatter(content);
      if (!frontmatter?.aliases) continue;
      const aliases = Array.isArray(frontmatter.aliases)
        ? frontmatter.aliases
        : [frontmatter.aliases];
      for (const alias of aliases) {
        if (String(alias).toLowerCase() === target) return f;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Note not found: ${name}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Get the daily note path, respecting Obsidian config if present. */
function getDailyNotePath(): string {
  const vault = getVaultPath();
  const today = todayDate();

  // Check Obsidian daily-notes plugin config
  const configPath = join(vault, ".obsidian", "daily-notes.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (config.folder) {
        const configured = join(vault, config.folder, `${today}.md`);
        if (existsSync(configured)) return configured;
        // Even if it doesn't exist yet, this is the configured location
        return configured;
      }
    } catch {
      // Fall through to search
    }
  }

  // Search common locations
  for (const folder of ["", "daily", "Daily Notes"]) {
    const candidate = join(vault, folder, `${today}.md`);
    if (existsSync(candidate)) return candidate;
  }

  // Default to root
  return join(vault, `${today}.md`);
}

// ── Exported API ────────────────────────────────────────────────────

export function vaultList(): string {
  const vault = getVaultPath();
  return JSON.stringify({
    vaults: [{ name: basename(vault), path: vault }],
  });
}

export function vaultRead(file?: string, path?: string): string {
  const vault = getVaultPath();

  if (path) {
    const fullPath = join(vault, path);
    if (!existsSync(fullPath)) throw new Error(`File not found: ${path}`);
    return readFileSync(fullPath, "utf-8");
  }

  if (file) {
    return readFileSync(resolveNote(file), "utf-8");
  }

  throw new Error("Either file or path must be provided");
}

export function vaultDailyRead(): string {
  const dailyPath = getDailyNotePath();
  if (!existsSync(dailyPath))
    throw new Error(`Daily note not found for ${todayDate()}`);
  return readFileSync(dailyPath, "utf-8");
}

export function vaultSearch(
  query: string,
  context?: boolean,
  limit?: number,
): string {
  const vault = getVaultPath();
  const allFiles = walkMd(vault);
  const lowerQuery = query.toLowerCase();
  const results: unknown[] = [];

  for (const f of allFiles) {
    const content = readFileSync(f, "utf-8");
    if (!content.toLowerCase().includes(lowerQuery)) continue;

    const relPath = relative(vault, f);

    if (context) {
      const lines = content.split("\n");
      const matches: { line: number; text: string; context: string[] }[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          matches.push({
            line: i + 1,
            text: lines[i],
            context: lines.slice(start, end),
          });
        }
      }
      results.push({ file: relPath, matches });
    } else {
      results.push({ file: relPath });
    }

    if (limit && results.length >= limit) break;
  }

  return JSON.stringify(results);
}

export function vaultFiles(folder?: string): string {
  const vault = getVaultPath();
  const searchDir = folder ? join(vault, folder) : vault;
  if (!existsSync(searchDir)) return JSON.stringify([]);

  const allFiles = walkMd(searchDir);
  return JSON.stringify(allFiles.map((f) => relative(vault, f)).sort());
}

export function vaultTags(name?: string): string {
  const vault = getVaultPath();
  const allFiles = walkMd(vault);
  const tagCounts = new Map<string, { count: number; files: string[] }>();

  for (const f of allFiles) {
    const content = readFileSync(f, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    const relPath = relative(vault, f);
    const fileTags = new Set<string>();

    // Frontmatter tags
    if (frontmatter?.tags) {
      const fmTags = Array.isArray(frontmatter.tags)
        ? frontmatter.tags
        : [frontmatter.tags];
      for (const t of fmTags) fileTags.add(String(t));
    }

    // Inline #tags (strip code blocks first)
    const bodyNoCode = body
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]+`/g, "");
    const inlineMatches = bodyNoCode.matchAll(/(?:^|\s)#([\w][\w/-]*)/gm);
    for (const m of inlineMatches) fileTags.add(m[1]);

    for (const tag of fileTags) {
      const entry = tagCounts.get(tag) ?? { count: 0, files: [] };
      entry.count++;
      entry.files.push(relPath);
      tagCounts.set(tag, entry);
    }
  }

  if (name) {
    const cleanName = name.replace(/^#/, "");
    const entry = tagCounts.get(cleanName);
    if (!entry) return JSON.stringify({ tag: cleanName, count: 0, files: [] });
    return JSON.stringify({ tag: cleanName, ...entry });
  }

  // Sort by count descending
  const sorted = [...tagCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([tag, { count }]) => `${tag}: ${count}`);
  return sorted.join("\n");
}

export function vaultTasks(
  status?: "todo" | "done",
  daily?: boolean,
): string {
  const vault = getVaultPath();
  let files: string[];

  if (daily) {
    const dailyPath = getDailyNotePath();
    files = existsSync(dailyPath) ? [dailyPath] : [];
  } else {
    files = walkMd(vault);
  }

  const todoRe = /^(\s*)- \[ \] (.+)$/;
  const doneRe = /^(\s*)- \[x\] (.+)$/i;
  const results: { file: string; task: string; done: boolean }[] = [];

  for (const f of files) {
    const content = readFileSync(f, "utf-8");
    const relPath = relative(vault, f);

    for (const line of content.split("\n")) {
      if (status !== "done") {
        const todoMatch = line.match(todoRe);
        if (todoMatch) {
          results.push({ file: relPath, task: todoMatch[2], done: false });
        }
      }
      if (status !== "todo") {
        const doneMatch = line.match(doneRe);
        if (doneMatch) {
          results.push({ file: relPath, task: doneMatch[2], done: true });
        }
      }
    }
  }

  return JSON.stringify(results);
}

export function vaultLinks(file: string): string {
  const content = readFileSync(resolveNote(file), "utf-8");
  const linkRe = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = linkRe.exec(content)) !== null) {
    const target = match[1].trim();
    if (!links.includes(target)) links.push(target);
  }

  return JSON.stringify(links);
}

export function vaultBacklinks(file: string): string {
  const vault = getVaultPath();
  const resolved = resolveNote(file);
  const noteName = basename(resolved, ".md");
  const allFiles = walkMd(vault);

  const backlinkRe = new RegExp(
    `\\[\\[${escapeRegex(noteName)}(?:#[^\\]|]*)?(?:\\|[^\\]]+)?\\]\\]`,
    "gi",
  );
  const results: string[] = [];

  for (const f of allFiles) {
    if (f === resolved) continue;
    const content = readFileSync(f, "utf-8");
    if (backlinkRe.test(content)) {
      results.push(relative(vault, f));
    }
    backlinkRe.lastIndex = 0;
  }

  return JSON.stringify(results);
}

export function vaultProperties(file: string, name?: string): string {
  const content = readFileSync(resolveNote(file), "utf-8");
  const { frontmatter } = parseFrontmatter(content);

  if (!frontmatter) return name ? "" : JSON.stringify({});

  if (name) {
    const value = frontmatter[name];
    if (value === undefined) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }

  return JSON.stringify(frontmatter);
}

export function vaultCreate(
  name: string,
  content?: string,
  template?: string,
  overwrite?: boolean,
): string {
  const vault = getVaultPath();
  const filePath = join(vault, name.endsWith(".md") ? name : `${name}.md`);

  if (existsSync(filePath) && !overwrite) {
    throw new Error(`Note already exists: ${name}. Use overwrite to replace.`);
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let finalContent = content ?? "";

  if (template) {
    const templatePaths = [
      join(vault, "templates", `${template}.md`),
      join(vault, "Templates", `${template}.md`),
      join(vault, `${template}.md`),
    ];

    let templateContent: string | null = null;
    for (const tp of templatePaths) {
      if (existsSync(tp)) {
        templateContent = readFileSync(tp, "utf-8");
        break;
      }
    }

    if (!templateContent) throw new Error(`Template not found: ${template}`);

    const now = new Date();
    finalContent = templateContent
      .replace(/\{\{date\}\}/g, todayDate())
      .replace(/\{\{time\}\}/g, now.toTimeString().slice(0, 5))
      .replace(/\{\{title\}\}/g, name.replace(/\.md$/, ""));
  }

  writeFileSync(filePath, finalContent, "utf-8");
  return `Created note: ${name}`;
}

export function vaultAppend(file: string, content: string): string {
  const resolved = resolveNote(file);
  const existing = readFileSync(resolved, "utf-8");
  const separator = existing.endsWith("\n") ? "" : "\n";
  writeFileSync(resolved, existing + separator + content, "utf-8");
  return `Appended to: ${file}`;
}

export function vaultDailyAppend(content: string): string {
  const dailyPath = getDailyNotePath();

  if (!existsSync(dailyPath)) {
    // Create with minimal frontmatter
    const dir = dirname(dailyPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const today = todayDate();
    writeFileSync(
      dailyPath,
      `---\ndate: ${today}\ntags:\n  - daily\n---\n\n`,
      "utf-8",
    );
  }

  const existing = readFileSync(dailyPath, "utf-8");
  const separator = existing.endsWith("\n") ? "" : "\n";
  writeFileSync(dailyPath, existing + separator + content, "utf-8");
  return "Appended to daily note";
}

export function vaultPropertySet(
  file: string,
  propName: string,
  value: string,
  type?: string,
): string {
  const resolved = resolveNote(file);
  const content = readFileSync(resolved, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);

  // Parse value according to type
  let parsedValue: unknown = value;
  if (type === "number") parsedValue = Number(value);
  else if (type === "checkbox") parsedValue = value === "true";
  else if (type === "list") parsedValue = value.split(",").map((s) => s.trim());

  const fm: Record<string, unknown> = frontmatter ?? {};
  fm[propName] = parsedValue;

  const yaml = stringifyYaml(fm, { lineWidth: 0 }).trimEnd();
  const newContent = `---\n${yaml}\n---\n${body}`;
  writeFileSync(resolved, newContent, "utf-8");
  return `Set ${propName}=${value} on ${file}`;
}

export function vaultMove(file: string, to: string): string {
  const vault = getVaultPath();
  const resolved = resolveNote(file);
  const oldName = basename(resolved, ".md");

  // Determine destination
  let destPath: string;
  const possibleDir = join(vault, to);
  if (existsSync(possibleDir) && statSync(possibleDir).isDirectory()) {
    destPath = join(possibleDir, basename(resolved));
  } else {
    destPath = join(vault, to.endsWith(".md") ? to : `${to}.md`);
  }

  const destDir = dirname(destPath);
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

  const newName = basename(destPath, ".md");

  renameSync(resolved, destPath);

  // Update backlinks across the vault if name changed
  if (oldName.toLowerCase() !== newName.toLowerCase()) {
    const allFiles = walkMd(vault);
    const patterns = [
      {
        re: new RegExp(`\\[\\[${escapeRegex(oldName)}\\]\\]`, "gi"),
        replacement: `[[${newName}]]`,
      },
      {
        re: new RegExp(`\\[\\[${escapeRegex(oldName)}\\|`, "gi"),
        replacement: `[[${newName}|`,
      },
      {
        re: new RegExp(`\\[\\[${escapeRegex(oldName)}#`, "gi"),
        replacement: `[[${newName}#`,
      },
    ];

    for (const f of allFiles) {
      if (f === destPath) continue;
      let fileContent = readFileSync(f, "utf-8");
      let changed = false;

      for (const { re, replacement } of patterns) {
        const updated = fileContent.replace(re, replacement);
        if (updated !== fileContent) {
          fileContent = updated;
          changed = true;
        }
        re.lastIndex = 0;
      }

      if (changed) writeFileSync(f, fileContent, "utf-8");
    }
  }

  return `Moved ${file} to ${to}`;
}

// ── Attachments ─────────────────────────────────────────────────────

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export function writeAttachment(
  name: string,
  base64Data: string,
  folder: string = "attachments",
): string {
  const vault = getVaultPath();
  const folderPath = join(vault, folder);

  if (!existsSync(folderPath)) mkdirSync(folderPath, { recursive: true });

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachment too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max 10 MB)`,
    );
  }

  let finalName = name;
  let targetPath = join(folderPath, finalName);

  if (existsSync(targetPath)) {
    const { name: stem, ext } = parsePath(name);
    finalName = `${stem}-${Date.now()}${ext}`;
    targetPath = join(folderPath, finalName);
  }

  writeFileSync(targetPath, buffer);
  return finalName;
}
