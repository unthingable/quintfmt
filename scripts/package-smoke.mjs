import { execFile as execFileCallback } from "node:child_process"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const staging = await mkdtemp(join(tmpdir(), "quintfmt-package-"))

try {
  const { stdout } = await execFile("npm", ["pack", "--json", "--pack-destination", staging], { cwd: root })
  const manifest = stdout.slice(stdout.lastIndexOf("\n[") + 1)
  const [{ filename }] = JSON.parse(manifest)
  const install = join(staging, "install")
  await mkdir(install)
  await execFile("npm", ["install", "--ignore-scripts", join(staging, filename)], { cwd: install })

  const specimen = join(install, "Spec.qnt")
  await writeFile(specimen, "module Demo {\nvar owner:str\n}\n")
  const cli = join(install, "node_modules", ".bin", "quintfmt")
  const preview = await execFile(cli, ["--stdout", specimen], { cwd: install })
  if (!/var owner: str/.test(preview.stdout)) throw new Error("packed CLI did not format source")
  await execFile(cli, ["--help"], { cwd: install })
  await execFile(cli, ["--version"], { cwd: install })
  await execFile(process.execPath, ["-e", "const { format } = require('quintfmt'); if (!format('module M {}').ok) process.exit(1)"], { cwd: install })
  await execFile(process.execPath, ["--input-type=module", "-e", "import { format } from 'quintfmt'; if (!format('module M {}').ok) process.exit(1)"], { cwd: install })
} finally {
  await rm(staging, { recursive: true, force: true })
}
