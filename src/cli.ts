#!/usr/bin/env node
import { chmod, lstat, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { format } from "./api.js";
import { ConfigError, findConfig, loadConfig } from "./config.js";

function parseArguments(args: string[]): {
  files: string[];
  write: boolean;
  check: boolean;
  declarationAlignment?: "types" | "columns" | "off";
  configPath?: string;
  useConfig: boolean;
} {
  let write = false;
  let check = false;
  let declarationAlignment: "types" | "columns" | "off" | undefined;
  let configPath: string | undefined;
  let useConfig = true;
  const files: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--write" || argument === "-w") write = true;
    else if (argument === "--check") check = true;
    else if (argument === "--no-config") useConfig = false;
    else if (argument === "--config") {
      const value = args[++index];
      if (!value) throw new Error("--config needs a path");
      configPath = value;
    } else if (argument.startsWith("--config=")) {
      configPath = argument.slice("--config=".length);
      if (!configPath) throw new Error("--config needs a path");
    }
    else if (argument === "--declaration-alignment") {
      const value = args[++index];
      if (value !== "types" && value !== "columns" && value !== "off") throw new Error("--declaration-alignment must be types, columns, or off");
      declarationAlignment = value;
    } else if (argument.startsWith("--declaration-alignment=")) {
      const value = argument.slice("--declaration-alignment=".length);
      if (value !== "types" && value !== "columns" && value !== "off") throw new Error("--declaration-alignment must be types, columns, or off");
      declarationAlignment = value;
    } else if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    else files.push(argument);
  }
  return { files, write, check, declarationAlignment, configPath, useConfig };
}

async function main(): Promise<void> {
  let parsedArguments: ReturnType<typeof parseArguments>;
  try {
    parsedArguments = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`quintfmt: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }
  const { files, write, check, declarationAlignment, configPath, useConfig } = parsedArguments;
  let options;
  try {
    const discovered = useConfig ? await findConfig() : null;
    const config = await loadConfig(configPath ?? discovered);
    options = { ...config, ...(declarationAlignment ? { declarationAlignment } : {}) };
  } catch (error) {
    console.error(`quintfmt: ${error instanceof ConfigError ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  if (write && check) {
    console.error("quintfmt: --write and --check cannot be combined");
    process.exitCode = 2;
  } else if (!files.length) {
    process.stdin.setEncoding("utf8");
    let source = "";
    for await (const chunk of process.stdin) source += chunk;
    const result = format(source, options);
    if (!result.ok) {
      for (const diagnostic of result.diagnostics) console.error(`${diagnostic.line}:${diagnostic.column}: ${diagnostic.code}: ${diagnostic.message}`);
      process.exitCode = 2;
    } else {
      process.stdout.write(result.formatted);
    }
  } else {
    let changed = false;
    const prepared: Array<{ file: string; source: string; formatted: string }> = [];
    for (const file of files) {
      if (write && (await lstat(file)).isSymbolicLink()) {
        console.error(`${file}: QFMT_SYMLINK: refusing to replace a symbolic link`);
        process.exitCode = 2;
        continue;
      }
      const source = await readFile(file, "utf8");
      const result = format(source, options);
      if (!result.ok) {
        for (const diagnostic of result.diagnostics) console.error(`${file}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.code}: ${diagnostic.message}`);
        process.exitCode = 2;
        continue;
      }
      if (result.formatted !== source) changed = true;
      prepared.push({ file, source, formatted: result.formatted });
    }
    if (process.exitCode === 2) return;
    if (write) {
      for (const item of prepared) if (item.formatted !== item.source) await writeAtomically(item.file, item.formatted);
    } else if (!check) {
      for (const item of prepared) process.stdout.write(item.formatted);
    } else if (changed) {
      process.exitCode = 1;
    }
  }
}

async function writeAtomically(file: string, content: string): Promise<void> {
  const temporary = `${file}.quintfmt-${process.pid}-${Math.random().toString(16).slice(2)}`;
  const original = await stat(file);
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: original.mode });
    await chmod(temporary, original.mode);
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

void main();
