import { execFileSync } from "node:child_process";

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
