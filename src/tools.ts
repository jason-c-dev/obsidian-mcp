import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  vaultList,
  vaultRead,
  vaultDailyRead,
  vaultSearch,
  vaultFiles,
  vaultTags,
  vaultTasks,
  vaultLinks,
  vaultBacklinks,
  vaultProperties,
  vaultCreate,
  vaultAppend,
  vaultDailyAppend,
  vaultPropertySet,
  vaultMove,
  writeAttachment,
} from "./obsidian.js";

const Vault = z
  .string()
  .optional()
  .describe("Target vault name. Omit to use the default vault.");

export function registerTools(server: McpServer) {
  // ── Vault Management ──────────────────────────────────────────────

  server.tool("vault_list", "List all known Obsidian vaults", {}, async () => {
    const result = vaultList();
    return { content: [{ type: "text", text: result }] };
  });

  // ── Read Operations ───────────────────────────────────────────────

  server.tool(
    "vault_read",
    "Read the contents of a note. Provide either file (wikilink name) or path (exact path from vault root).",
    {
      file: z
        .string()
        .optional()
        .describe("Note name (resolved like a wikilink)"),
      path: z
        .string()
        .optional()
        .describe("Exact path from vault root (e.g. folder/note.md)"),
      vault: Vault,
    },
    async ({ file, path }) => {
      const result = vaultRead(file, path);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_daily_read",
    "Read today's daily note",
    { vault: Vault },
    async () => {
      const result = vaultDailyRead();
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_search",
    "Search the vault for text. Returns matching files and context.",
    {
      query: z.string().describe("Search query text"),
      context: z
        .boolean()
        .optional()
        .describe("Include matching line context (uses search:context)"),
      limit: z.number().optional().describe("Max number of files to return"),
      vault: Vault,
    },
    async ({ query, context, limit }) => {
      const result = vaultSearch(query, context, limit);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_files",
    "List files in the vault, optionally filtered by folder",
    {
      folder: z
        .string()
        .optional()
        .describe("Filter to a specific folder path"),
      vault: Vault,
    },
    async ({ folder }) => {
      const result = vaultFiles(folder);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_tags",
    "List tags in the vault sorted by count, or get info about a specific tag",
    {
      name: z
        .string()
        .optional()
        .describe("Specific tag name to look up (without #)"),
      vault: Vault,
    },
    async ({ name }) => {
      const result = vaultTags(name);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_tasks",
    "List tasks in the vault. Filter by status and/or daily note.",
    {
      status: z
        .enum(["todo", "done"])
        .optional()
        .describe("Filter: 'todo' for incomplete, 'done' for completed"),
      daily: z
        .boolean()
        .optional()
        .describe("Only show tasks from today's daily note"),
      vault: Vault,
    },
    async ({ status, daily }) => {
      const result = vaultTasks(status, daily);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_links",
    "List outgoing links from a note",
    {
      file: z.string().describe("Note name to get outgoing links for"),
      vault: Vault,
    },
    async ({ file }) => {
      const result = vaultLinks(file);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_backlinks",
    "List notes that link to the specified note",
    {
      file: z.string().describe("Note name to get backlinks for"),
      vault: Vault,
    },
    async ({ file }) => {
      const result = vaultBacklinks(file);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_properties",
    "Get YAML frontmatter properties for a note, or a specific property",
    {
      file: z.string().describe("Note name"),
      name: z
        .string()
        .optional()
        .describe("Specific property name to read"),
      vault: Vault,
    },
    async ({ file, name }) => {
      const result = vaultProperties(file, name);
      return { content: [{ type: "text", text: result }] };
    },
  );

  // ── Write Operations ──────────────────────────────────────────────

  server.tool(
    "vault_create",
    "Create a new note in the vault",
    {
      name: z.string().describe("Note title (becomes the filename)"),
      content: z
        .string()
        .optional()
        .describe(
          "Initial note content (supports markdown, \\n for newlines)",
        ),
      template: z
        .string()
        .optional()
        .describe("Template name to use instead of content"),
      overwrite: z
        .boolean()
        .optional()
        .describe("Overwrite if the note already exists"),
      vault: Vault,
    },
    async ({ name, content, template, overwrite }) => {
      const result = vaultCreate(name, content, template, overwrite);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_append",
    "Append content to an existing note",
    {
      file: z.string().describe("Note name to append to"),
      content: z
        .string()
        .describe(
          "Content to append (supports markdown, \\n for newlines)",
        ),
      vault: Vault,
    },
    async ({ file, content }) => {
      const result = vaultAppend(file, content);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_daily_append",
    "Append content to today's daily note",
    {
      content: z
        .string()
        .describe(
          "Content to append (supports markdown, \\n for newlines)",
        ),
      vault: Vault,
    },
    async ({ content }) => {
      const result = vaultDailyAppend(content);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_property_set",
    "Set a YAML frontmatter property on a note",
    {
      file: z.string().describe("Note name"),
      name: z.string().describe("Property name"),
      value: z.string().describe("Property value"),
      type: z
        .enum(["text", "list", "number", "checkbox", "date", "datetime"])
        .optional()
        .describe("Property type"),
      vault: Vault,
    },
    async ({ file, name, value, type }) => {
      const result = vaultPropertySet(file, name, value, type);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_move",
    "Move or rename a note",
    {
      file: z.string().describe("Note name to move"),
      to: z.string().describe("Destination folder or full path"),
      vault: Vault,
    },
    async ({ file, to }) => {
      const result = vaultMove(file, to);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_attachment",
    "Write a binary file (image, PDF, etc.) into the vault as an attachment. Returns the filename for use in note embeds with ![[filename]].",
    {
      name: z
        .string()
        .describe("Filename with extension (e.g. receipt-2026-03-02.png)"),
      data: z.string().describe("Base64-encoded file contents"),
      folder: z
        .string()
        .optional()
        .describe("Subfolder within vault to store in (default: attachments)"),
      vault: Vault,
    },
    async ({ name, data, folder }) => {
      const finalName = writeAttachment(name, data, folder);
      return {
        content: [
          {
            type: "text",
            text: `Saved attachment: ${finalName}\nEmbed in notes with: ![[${finalName}]]`,
          },
        ],
      };
    },
  );
}
