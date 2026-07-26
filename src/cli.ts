#!/usr/bin/env node
import { chmod, lstat, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { format } from "./api.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--write") || args.includes("-w");
  const check = args.includes("--check");
  const files = args.filter((arg) => !arg.startsWith("-"));

  if (write && check) {
    console.error("quintfmt: --write and --check cannot be combined");
    process.exitCode = 2;
  } else if (!files.length) {
    process.stdin.setEncoding("utf8");
    let source = "";
    for await (const chunk of process.stdin) source += chunk;
    const result = format(source);
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
      const result = format(source);
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
