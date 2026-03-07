# Obsidian MCP Server

An MCP (Model Context Protocol) server that exposes your Obsidian vault as tools for Claude. This lets any Claude session — Claude Code, Claude Desktop, `claude -p` scripts — read, write, search, and manage your vault.

It operates directly on vault files via Node.js `fs` — no Obsidian app, CLI, or plugins required. An Obsidian vault is just a folder of markdown files, and this server works with that directly.

## Prerequisites

- Node.js 18+
- An Obsidian-compatible vault (any folder of markdown files)

## Install

```bash
git clone <this-repo>
cd obsidian-mcp-server
npm install
npm run build
```

This compiles TypeScript from `src/` into `build/`.

## Configure

### Claude Code

Register the server globally so every Claude Code session has vault access:

```bash
claude mcp add --transport stdio -s user obsidian \
  -e OBSIDIAN_VAULT="/path/to/your/vault" \
  -- node /path/to/obsidian-mcp-server/build/index.js
```

This writes to `~/.claude.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/obsidian-mcp-server/build/index.js"],
      "env": {
        "OBSIDIAN_VAULT": "/path/to/your/vault"
      }
    }
  }
}
```

- **`OBSIDIAN_VAULT`** — path to your vault folder. If not set, the server looks for vaults in Obsidian's config (`~/.config/obsidian/obsidian.json` on Linux, `~/Library/Application Support/obsidian/obsidian.json` on macOS).

To verify it's working, start Claude Code in any project and look for the obsidian tools (they'll appear as MCP tools like `vault_read`, `vault_search`, etc.).

To remove:

```bash
claude mcp remove -s user obsidian
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/path/to/obsidian-mcp-server/build/index.js"],
      "env": {
        "OBSIDIAN_VAULT": "/path/to/your/vault"
      }
    }
  }
}
```

Create the file if it doesn't exist. Restart Claude Desktop after editing.

## Tools

16 tools are available. All accept an optional `vault` parameter for multi-vault setups. If omitted, the default vault is used (set via `OBSIDIAN_VAULT` env var).

### Read

| Tool | Description |
|------|-------------|
| `vault_read` | Read a note by name (`file`) or exact path (`path`) |
| `vault_daily_read` | Read today's daily note |
| `vault_search` | Full-text search across the vault. Set `context: true` for matching line context |
| `vault_files` | List all files, optionally filtered by `folder` |
| `vault_tags` | List all tags (sorted by count), or look up a specific tag by `name` |
| `vault_tasks` | List tasks. Filter by `status` (todo/done) and `daily` (today only) |
| `vault_links` | List outgoing links from a note |
| `vault_backlinks` | List notes that link to a given note |
| `vault_properties` | Read YAML frontmatter properties, or a specific property by `name` |

### Write

| Tool | Description |
|------|-------------|
| `vault_create` | Create a new note. Supports `content`, `template`, and `overwrite` |
| `vault_append` | Append content to an existing note |
| `vault_daily_append` | Append content to today's daily note |
| `vault_property_set` | Set a YAML frontmatter property. Supports `type` (text, list, number, etc.) |
| `vault_move` | Move or rename a note |
| `vault_attachment` | Write a binary file (image, PDF, etc.) into the vault. Returns embed syntax `![[filename]]` |

### Vault

| Tool | Description |
|------|-------------|
| `vault_list` | List all known Obsidian vaults |

## Skills

The MCP server gives Claude the raw tools, but tools alone don't tell Claude *when* to use them, what vault conventions to follow, or how to structure notes. **Skills** provide that context.

### MCP Skills (`skills/`) — portable, for any project

These skills are written to use the MCP tools (`vault_read`, `vault_create`, etc.). Copy them into any project where you want Claude to interact with your vault.

| Skill | Command | What it does |
|-------|---------|-------------|
| `capture` | `/capture <thought>` | Quick-capture a thought to today's daily note with timestamp |
| `log` | `/log <text>` | Append a minimal timestamped entry to the daily note |
| `note` | `/note <title>` | Create a new structured note with frontmatter and tags |
| `today` | `/today` | Overview of the day — daily note, tasks, recent activity |
| `find` | `/find <query>` | Deep search — text, tags, links, backlinks, synthesis |
| `review` | `/review [day\|week\|month]` | Review accomplishments and outstanding items |
| `standup` | `/standup` | Yesterday / Today / Blockers standup format |
| `tidy` | `/tidy <note>` | Clean up a raw or voice-transcribed note |

### How to add skills to a project

Copy the skills you want from this repo's `skills/` directory into the target project's `.claude/skills/`:

```bash
# Copy all vault skills to another project
cp -r /path/to/obsidian-mcp-server/skills/* /path/to/myproject/.claude/skills/

# Or copy only specific skills
mkdir -p /path/to/myproject/.claude/skills/capture
cp /path/to/obsidian-mcp-server/skills/capture/SKILL.md /path/to/myproject/.claude/skills/capture/

mkdir -p /path/to/myproject/.claude/skills/today
cp /path/to/obsidian-mcp-server/skills/today/SKILL.md /path/to/myproject/.claude/skills/today/
```

After copying, start Claude Code in that project and the skills will appear as `/capture`, `/today`, etc.

### Choosing what to copy

You don't need all skills in every project. Pick what's relevant:

- **Minimal** — just `capture` and `today` for quick vault interaction
- **Standard** — add `note`, `find`, `log` for full read/write
- **Full** — all 8 skills for complete vault management from any project

## Attachments

The `vault_attachment` tool handles binary files (images, PDFs, receipts, etc.) by writing them directly to the vault's filesystem. Obsidian's file watcher picks them up automatically.

**Parameters:**
- `name` — filename with extension (e.g. `receipt-2026-03-02.png`)
- `data` — base64-encoded file contents
- `folder` — subfolder within vault (default: `attachments`)

**Example workflow** (e.g. from a Telegram bot):
1. User sends a photo of a receipt with "Add this to expenses"
2. Claude calls `vault_attachment` with the base64-encoded image → returns `receipt.png`
3. Claude calls `vault_append` on an Expenses note with `![[receipt.png]]` to embed it

If a file with the same name already exists, a timestamp is appended to avoid overwriting. Max file size is 10 MB.

## Multi-Vault

The server defaults to the vault specified by `OBSIDIAN_VAULT` env var. If unset, it reads Obsidian's config file to discover known vaults. To target a different vault per-call, pass the `vault` parameter:

```
vault_read(file="My Note", vault="Work Vault")
```

## Development

```bash
npm run dev     # Watch mode — recompiles on save
npm run build   # One-time build
```

The server uses stdio transport (JSON-RPC over stdin/stdout). `console.error()` is used for logging — never `console.log()`, which would corrupt the protocol.

## Project Structure

```
├── src/
│   ├── index.ts              # Server entry point — McpServer + stdio transport
│   ├── tools.ts              # 15 MCP tool definitions with Zod schemas
│   └── obsidian.ts           # Vault engine — direct filesystem operations
├── build/                    # Compiled JS (generated by npm run build)
├── skills/                   # MCP skills — copy these into other projects
│   ├── capture/SKILL.md
│   ├── find/SKILL.md
│   ├── log/SKILL.md
│   ├── note/SKILL.md
│   ├── review/SKILL.md
│   ├── standup/SKILL.md
│   ├── tidy/SKILL.md
│   └── today/SKILL.md
├── package.json
└── tsconfig.json
```

## Troubleshooting

**Tools not appearing in Claude Code**: Run `claude mcp list` to verify the server is registered. Check that the build path is correct.

**Skills not appearing**: Make sure the SKILL.md files are in the project's `.claude/skills/<name>/SKILL.md` directory structure. Claude Code auto-discovers skills from `.claude/skills/`.

**"Vault not found" or "ENOENT" errors**: Check that `OBSIDIAN_VAULT` points to a valid directory. The value should be the vault's folder path (e.g. `/Users/you/Documents/My Vault`). Verify with `ls "$OBSIDIAN_VAULT"`.

**File permission errors**: The server needs read/write access to the vault directory. Check ownership and permissions on the vault folder.

**Changes not appearing in Obsidian**: The server writes directly to the filesystem. Obsidian's file watcher typically picks up changes within 1-2 seconds. If not, try switching to another note and back, or restarting Obsidian.

**Rebuild after changes**: If you edit source files, run `npm run build`. Claude Code loads the compiled JS from `build/`.
