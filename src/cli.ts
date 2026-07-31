#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { chmod, lstat, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "./api.js";
import { ConfigError, findConfig, loadConfig } from "./config.js";

function parseArguments(args: string[]): {
  files: string[];
  write: boolean;
  stdout: boolean;
  check: boolean;
  help: boolean;
  version: boolean;
  maxLineLength?: number;
  declarationAlignment?: "types" | "columns" | "off";
  definitionSpacing?: "nontrivial" | "compact";
  recordAlignment?: "local" | "off";
  recordMaxAlignmentPadding?: number | "unlimited";
  clauseAlignment?: "off" | "operator" | "full";
  blankLinePolicy?: "preserve" | "single";
  lineEnding?: "preserve" | "lf" | "crlf";
  configPath?: string;
  useConfig: boolean;
} {
  let write = false;
  let stdout = false;
  let check = false;
  let help = false;
  let version = false;
  let maxLineLength: number | undefined;
  let declarationAlignment: "types" | "columns" | "off" | undefined;
  let definitionSpacing: "nontrivial" | "compact" | undefined;
  let recordAlignment: "local" | "off" | undefined;
  let recordMaxAlignmentPadding: number | "unlimited" | undefined;
  let clauseAlignment: "off" | "operator" | "full" | undefined;
  let blankLinePolicy: "preserve" | "single" | undefined;
  let lineEnding: "preserve" | "lf" | "crlf" | undefined;
  let configPath: string | undefined;
  let useConfig = true;
  const files: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--help" || argument === "-h") help = true;
    else if (argument === "--version" || argument === "-v") version = true;
    else if (argument === "--write" || argument === "-w") write = true;
    else if (argument === "--stdout") stdout = true;
    else if (argument === "--check") check = true;
    else if (argument === "--no-config") useConfig = false;
    else if (argument === "--max-line-length") {
      const value = args[++index];
      if (!value || !/^\d+$/.test(value) || Number(value) <= 0) throw new Error("--max-line-length must be a positive integer");
      maxLineLength = Number(value);
    } else if (argument.startsWith("--max-line-length=")) {
      const value = argument.slice("--max-line-length=".length);
      if (!/^\d+$/.test(value) || Number(value) <= 0) throw new Error("--max-line-length must be a positive integer");
      maxLineLength = Number(value);
    }
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
    } else if (argument === "--definition-spacing") {
      const value = args[++index];
      if (value !== "nontrivial" && value !== "compact") throw new Error("--definition-spacing must be nontrivial or compact");
      definitionSpacing = value;
    } else if (argument.startsWith("--definition-spacing=")) {
      const value = argument.slice("--definition-spacing=".length);
      if (value !== "nontrivial" && value !== "compact") throw new Error("--definition-spacing must be nontrivial or compact");
      definitionSpacing = value;
    } else if (argument === "--record-alignment") {
      const value = args[++index];
      if (value !== "local" && value !== "off") throw new Error("--record-alignment must be local or off");
      recordAlignment = value;
    } else if (argument.startsWith("--record-alignment=")) {
      const value = argument.slice("--record-alignment=".length);
      if (value !== "local" && value !== "off") throw new Error("--record-alignment must be local or off");
      recordAlignment = value;
    } else if (argument === "--record-max-padding") {
      const value = args[++index];
      if (value === "unlimited") recordMaxAlignmentPadding = value;
      else if (value && /^\d+$/.test(value) && Number(value) > 0) recordMaxAlignmentPadding = Number(value);
      else throw new Error("--record-max-padding must be a positive integer or unlimited");
    } else if (argument.startsWith("--record-max-padding=")) {
      const value = argument.slice("--record-max-padding=".length);
      if (value === "unlimited") recordMaxAlignmentPadding = value;
      else if (/^\d+$/.test(value) && Number(value) > 0) recordMaxAlignmentPadding = Number(value);
      else throw new Error("--record-max-padding must be a positive integer or unlimited");
    } else if (argument === "--clause-alignment") {
      const value = args[++index];
      if (value !== "off" && value !== "operator" && value !== "full") throw new Error("--clause-alignment must be off, operator, or full");
      clauseAlignment = value;
    } else if (argument.startsWith("--clause-alignment=")) {
      const value = argument.slice("--clause-alignment=".length);
      if (value !== "off" && value !== "operator" && value !== "full") throw new Error("--clause-alignment must be off, operator, or full");
      clauseAlignment = value;
    } else if (argument === "--blank-lines") {
      const value = args[++index];
      if (value !== "preserve" && value !== "single") throw new Error("--blank-lines must be preserve or single");
      blankLinePolicy = value;
    } else if (argument.startsWith("--blank-lines=")) {
      const value = argument.slice("--blank-lines=".length);
      if (value !== "preserve" && value !== "single") throw new Error("--blank-lines must be preserve or single");
      blankLinePolicy = value;
    } else if (argument === "--line-ending") {
      const value = args[++index];
      if (value !== "preserve" && value !== "lf" && value !== "crlf") throw new Error("--line-ending must be preserve, lf, or crlf");
      lineEnding = value;
    } else if (argument.startsWith("--line-ending=")) {
      const value = argument.slice("--line-ending=".length);
      if (value !== "preserve" && value !== "lf" && value !== "crlf") throw new Error("--line-ending must be preserve, lf, or crlf");
      lineEnding = value;
    } else if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    else files.push(argument);
  }
  return { files, write, stdout, check, help, version, maxLineLength, declarationAlignment, definitionSpacing, recordAlignment, recordMaxAlignmentPadding, clauseAlignment, blankLinePolicy, lineEnding, configPath, useConfig };
}

const helpText = `Usage: quintfmt [options] [files...]\n\nNamed files are formatted in place by default. With no files, source is read from stdin and written to stdout.\n\nOptions:\n  -h, --help                         Show this help\n  -v, --version                      Show the installed version\n  -w, --write                        Explicit alias for in-place formatting\n      --stdout                       Print formatted named files to stdout\n      --check                        Exit 1 when named files need formatting\n      --config <path>                Use a .quintfmt.conf file\n      --no-config                    Ignore configuration discovery\n      --declaration-alignment <mode> types, columns, or off\n      --definition-spacing <mode>    nontrivial or compact\n      --record-alignment <mode>      local or off\n      --record-max-padding <value>   positive integer or unlimited\n      --clause-alignment <mode>      off, operator, or full\n      --blank-lines <mode>           preserve or single\n      --line-ending <mode>           preserve, lf, or crlf\n`;

function packageVersion(): string {
  return (JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as { version: string }).version;
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
  const { files, write, stdout, check, help, version, maxLineLength, declarationAlignment, definitionSpacing, recordAlignment, recordMaxAlignmentPadding, clauseAlignment, blankLinePolicy, lineEnding, configPath, useConfig } = parsedArguments;
  if (help) {
    process.stdout.write(helpText.replace(
      "      --no-config                    Ignore configuration discovery",
      "      --no-config                    Ignore configuration discovery\n      --max-line-length <columns>    Wrap supported long definition headers",
    ));
    return;
  }
  if (version) {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }
  let options;
  try {
    const discovered = useConfig ? await findConfig() : null;
    const config = await loadConfig(configPath ?? discovered);
    options = {
      ...config,
      ...(maxLineLength ? { maxLineLength } : {}),
      ...(declarationAlignment ? { declarationAlignment } : {}),
      ...(definitionSpacing ? { definitionSpacing } : {}),
      ...(recordAlignment ? { recordAlignment } : {}),
      ...(recordMaxAlignmentPadding ? { recordMaxAlignmentPadding } : {}),
      ...(clauseAlignment ? { clauseAlignment } : {}),
      ...(blankLinePolicy ? { blankLinePolicy } : {}),
      ...(lineEnding ? { lineEnding } : {}),
    };
  } catch (error) {
    console.error(`quintfmt: ${error instanceof ConfigError ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  if ((write && check) || (stdout && (write || check))) {
    console.error("quintfmt: --stdout, --write, and --check cannot be combined");
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
    const writeInPlace = !stdout && !check;
    let changed = false;
    const prepared: Array<{ file: string; source: string; formatted: string }> = [];
    for (const file of files) {
      let source: string;
      try {
        if (writeInPlace && (await lstat(file)).isSymbolicLink()) {
          console.error(`${file}: QFMT_SYMLINK: refusing to replace a symbolic link`);
          process.exitCode = 2;
          continue;
        }
        source = await readFile(file, "utf8");
      } catch (error) {
        console.error(`${file}: QFMT_IO: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 2;
        continue;
      }
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
    if (writeInPlace) {
      for (const item of prepared) if (item.formatted !== item.source) await writeAtomically(item.file, item.formatted);
    } else if (stdout) {
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
