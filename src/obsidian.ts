import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, parse as parsePath } from "node:path";

const DEFAULT_VAULT = process.env.OBSIDIAN_VAULT ?? "";

export function obsidian(
  command: string,
  args: string[] = [],
  vault?: string,
): string {
  const targetVault = vault ?? DEFAULT_VAULT;
  const fullArgs = targetVault
    ? [`vault=${targetVault}`, command, ...args]
    : [command, ...args];

  try {
    return execFileSync("obsidian", fullArgs, {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Unknown error running obsidian CLI";
    throw new Error(`obsidian ${command} failed: ${msg}`);
  }
}

export function getVaultPath(vault?: string): string {
  return obsidian("vault", ["info=path"], vault);
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export function writeAttachment(
  name: string,
  base64Data: string,
  folder: string = "attachments",
  vault?: string,
): string {
  const vaultPath = getVaultPath(vault);
  const folderPath = join(vaultPath, folder);

  // Ensure target folder exists
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
  }

  // Decode and validate size
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachment too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max 10 MB)`,
    );
  }

  // Avoid overwriting — append timestamp if file exists
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
