import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { obsidian, writeAttachment } from "./obsidian.js";

const Vault = z.string().optional().describe("Target vault name. Omit to use the default vault.");

export function registerTools(server: McpServer) {
  // ── Vault Management ──────────────────────────────────────────────

  server.tool(
    "vault_list",
    "List all known Obsidian vaults",
    {},
    async () => {
      const result = obsidian("vaults", ["verbose"]);
      return { content: [{ type: "text", text: result }] };
    },
  );

  // ── Read Operations ───────────────────────────────────────────────

  server.tool(
    "vault_read",
    "Read the contents of a note. Provide either file (wikilink name) or path (exact path from vault root).",
    {
      file: z.string().optional().describe("Note name (resolved like a wikilink)"),
      path: z.string().optional().describe("Exact path from vault root (e.g. folder/note.md)"),
      vault: Vault,
    },
    async ({ file, path, vault }) => {
      const args: string[] = [];
      if (file) args.push(`file=${file}`);
      if (path) args.push(`path=${path}`);
      const result = obsidian("read", args, vault);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_daily_read",
    "Read today's daily note",
    {
      vault: Vault,
    },
    async ({ vault }) => {
      const result = obsidian("daily:read", [], vault);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_search",
    "Search the vault for text. Returns matching files and context.",
    {
      query: z.string().describe("Search query text"),
      context: z.boolean().optional().describe("Include matching line context (uses search:context)"),
      limit: z.number().optional().describe("Max number of files to return"),
      vault: Vault,
    },
    async ({ query, context, limit, vault }) => {
      const command = context ? "search:context" : "search";
      const args = [`query=${query}`, "format=json"];
      if (limit) args.push(`limit=${limit}`);
      const result = obsidian(command, args, vault);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_files",
    "List files in the vault, optionally filtered by folder",
    {
      folder: z.string().optional().describe("Filter to a specific folder path"),
      vault: Vault,
    },
    async ({ folder, vault }) => {
      const args = ["format=json"];
      if (folder) args.push(`folder=${folder}`);
      const result = obsidian("files", args, vault);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_tags",
    "List tags in the vault sorted by count, or get info about a specific tag",
    {
      name: z.string().optional().describe("Specific tag name to look up (without #)"),
      vault: Vault,
    },
    async ({ name, vault }) => {
      if (name) {
        const result = obsidian("tag", [`name=${name}`, "verbose"], vault);
        return { content: [{ type: "text", text: result }] };
      }
      const result = obsidian("tags", ["sort=count", "counts"], vault);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_tasks",
    "List tasks in the vault. Filter by status and/or daily note.",
    {
      status: z.enum(["todo", "done"]).optional().describe("Filter: 'todo' for incomplete, 'done' for completed"),
      daily: z.boolean().optional().describe("Only show tasks from today's daily note"),
      vault: Vault,
    },
    async ({ status, daily, vault }) => {
      const args = ["format=json"];
      if (status) args.push(status);
      if (daily) args.push("daily");
      const result = obsidian("tasks", args, vault);
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
    async ({ file, vault }) => {
      const result = obsidian("links", [`file=${file}`], vault);
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
    async ({ file, vault }) => {
      const result = obsidian("backlinks", [`file=${file}`, "format=json"], vault);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.tool(
    "vault_properties",
    "Get YAML frontmatter properties for a note, or a specific property",
    {
      file: z.string().describe("Note name"),
      name: z.string().optional().describe("Specific property name to read"),
      vault: Vault,
    },
    async ({ file, name, vault }) => {
      if (name) {
        const result = obsidian("property:read", [`file=${file}`, `name=${name}`], vault);
        return { content: [{ type: "text", text: result }] };
      }
      const result = obsidian("properties", [`file=${file}`, "format=json"], vault);
      return { content: [{ type: "text", text: result }] };
    },
  );

  // ── Write Operations ──────────────────────────────────────────────

  server.tool(
    "vault_create",
    "Create a new note in the vault",
    {
      name: z.string().describe("Note title (becomes the filename)"),
      content: z.string().optional().describe("Initial note content (supports markdown, \\n for newlines)"),
      template: z.string().optional().describe("Template name to use instead of content"),
      overwrite: z.boolean().optional().describe("Overwrite if the note already exists"),
      vault: Vault,
    },
    async ({ name, content, template, overwrite, vault }) => {
      const args = [`name=${name}`, "silent"];
      if (content) args.push(`content=${content}`);
      if (template) args.push(`template=${template}`);
      if (overwrite) args.push("overwrite");
      const result = obsidian("create", args, vault);
      return { content: [{ type: "text", text: result || `Created note: ${name}` }] };
    },
  );

  server.tool(
    "vault_append",
    "Append content to an existing note",
    {
      file: z.string().describe("Note name to append to"),
      content: z.string().describe("Content to append (supports markdown, \\n for newlines)"),
      vault: Vault,
    },
    async ({ file, content, vault }) => {
      const result = obsidian("append", [`file=${file}`, `content=${content}`], vault);
      return { content: [{ type: "text", text: result || `Appended to: ${file}` }] };
    },
  );

  server.tool(
    "vault_daily_append",
    "Append content to today's daily note",
    {
      content: z.string().describe("Content to append (supports markdown, \\n for newlines)"),
      vault: Vault,
    },
    async ({ content, vault }) => {
      const result = obsidian("daily:append", [`content=${content}`], vault);
      return { content: [{ type: "text", text: result || "Appended to daily note" }] };
    },
  );

  server.tool(
    "vault_property_set",
    "Set a YAML frontmatter property on a note",
    {
      file: z.string().describe("Note name"),
      name: z.string().describe("Property name"),
      value: z.string().describe("Property value"),
      type: z.enum(["text", "list", "number", "checkbox", "date", "datetime"]).optional().describe("Property type"),
      vault: Vault,
    },
    async ({ file, name, value, type, vault }) => {
      const args = [`file=${file}`, `name=${name}`, `value=${value}`];
      if (type) args.push(`type=${type}`);
      const result = obsidian("property:set", args, vault);
      return { content: [{ type: "text", text: result || `Set ${name}=${value} on ${file}` }] };
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
    async ({ file, to, vault }) => {
      const result = obsidian("move", [`file=${file}`, `to=${to}`], vault);
      return { content: [{ type: "text", text: result || `Moved ${file} to ${to}` }] };
    },
  );

  server.tool(
    "vault_attachment",
    "Write a binary file (image, PDF, etc.) into the vault as an attachment. Returns the filename for use in note embeds with ![[filename]].",
    {
      name: z.string().describe("Filename with extension (e.g. receipt-2026-03-02.png)"),
      data: z.string().describe("Base64-encoded file contents"),
      folder: z.string().optional().describe("Subfolder within vault to store in (default: attachments)"),
      vault: Vault,
    },
    async ({ name, data, folder, vault }) => {
      const finalName = writeAttachment(name, data, folder, vault);
      return {
        content: [{ type: "text", text: `Saved attachment: ${finalName}\nEmbed in notes with: ![[${finalName}]]` }],
      };
    },
  );
}
