#!/usr/bin/env node
import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { build, check, type RunOptions, type RunResult } from "./index.js";
import { formatHuman, formatJson } from "./report.js";

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatesDir = path.join(packageRoot, "templates");

interface Flags {
  config?: string;
  json: boolean;
  dryRun: boolean;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = { json: false, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config") {
      flags.config = args[++i];
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    } else {
      console.error(pc.red(`unknown option: ${arg}`));
      process.exitCode = 2;
      process.exit(2);
    }
  }
  return flags;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyIfMissing(src: string, dest: string): Promise<boolean> {
  if (await pathExists(dest)) return false;
  await copyFile(src, dest);
  return true;
}

async function runInit(): Promise<number> {
  try {
    const results: { label: string; created: boolean }[] = [];

    const configDest = path.join(process.cwd(), "zenn-syndicate.config.mjs");
    results.push({
      label: "zenn-syndicate.config.mjs",
      created: await copyIfMissing(path.join(templatesDir, "config.mjs"), configDest),
    });

    const workflowDestDir = path.join(process.cwd(), ".github", "workflows");
    await mkdir(workflowDestDir, { recursive: true });
    const workflowDest = path.join(workflowDestDir, "sync-zenn.yml");
    results.push({
      label: ".github/workflows/sync-zenn.yml",
      created: await copyIfMissing(path.join(templatesDir, "sync-zenn.yml"), workflowDest),
    });

    for (const r of results) {
      if (r.created) {
        console.log(`${pc.green("created")}  ${r.label}`);
      } else {
        console.log(`${pc.yellow("skip")}     ${r.label} (already exists)`);
      }
    }

    return 0;
  } catch (err) {
    console.error(pc.red(`init failed: ${(err as Error).message}`));
    return 2;
  }
}

async function runBuildOrCheck(mode: "build" | "check", flags: Flags): Promise<number> {
  const options: RunOptions = { configPath: flags.config, dryRun: flags.dryRun };
  const result: RunResult = mode === "build" ? await build(options) : await check(options);
  console.log(flags.json ? formatJson(result.report) : formatHuman(result.report));
  return result.exitCode;
}

function printUsage(): void {
  console.log(
    [
      "Usage: zenn-syndicate <command> [options]",
      "",
      "Commands:",
      "  init     Create zenn-syndicate.config.mjs and a sample GitHub Actions workflow",
      "  build    Convert source articles and write them into output.dir",
      "  check    Validate source articles without writing anything",
      "",
      "Options:",
      "  --config <path>   Path to the config file (default: zenn-syndicate.config.mjs)",
      "  --json            Print the report as JSON",
      "  --dry-run         (build only) validate and report, but write nothing",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === undefined || command === "--help" || command === "-h") {
    printUsage();
    process.exit(command === undefined ? 1 : 0);
  }

  const flags = parseFlags(rest);
  let exitCode: number;

  switch (command) {
    case "init":
      exitCode = await runInit();
      break;
    case "build":
      exitCode = await runBuildOrCheck("build", flags);
      break;
    case "check":
      exitCode = await runBuildOrCheck("check", flags);
      break;
    default:
      console.error(pc.red(`unknown command: ${command}`));
      printUsage();
      exitCode = 2;
  }

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(pc.red(message));
  process.exit(2);
});
