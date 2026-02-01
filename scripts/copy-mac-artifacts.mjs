import fs from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const positional = []
  const flags = {}

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const [key, rawValue] = arg.slice(2).split('=')
    flags[key] = rawValue ?? true
  }

  return { positional, flags }
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function readBuildInfo(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))

  const productName = pkg?.build?.productName ?? pkg?.productName
  const version = pkg?.version

  if (!productName || !version) {
    throw new Error('Impossibile leggere productName/version da package.json')
  }

  return { productName, version }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function copyFileSafe(src, dest) {
  await ensureDir(path.dirname(dest))
  await fs.copyFile(src, dest)
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2))
  const projectRoot = process.cwd()

  const inputDir =
    positional[0] ?? flags.input ?? '/tmp/gemini-pdf-translator-release'
  const outputDir = positional[1] ?? flags.output ?? path.join(projectRoot, 'release')
  const arch = positional[2] ?? flags.arch ?? 'arm64'

  const { productName, version } = await readBuildInfo(projectRoot)

  const escapedProductName = escapeRegExp(productName)
  const escapedVersion = escapeRegExp(version)
  const escapedArch = escapeRegExp(arch)

  const artifactRe = new RegExp(
    `^${escapedProductName}-${escapedVersion}-${escapedArch}\\.(dmg|zip)(\\.blockmap)?$`
  )

  const entries = await fs.readdir(inputDir, { withFileTypes: true })
  const artifactNames = entries
    .filter((e) => e.isFile() && artifactRe.test(e.name))
    .map((e) => e.name)

  if (artifactNames.length === 0) {
    throw new Error(
      `Nessun artefatto trovato in ${inputDir} per ${productName} ${version} (${arch})`
    )
  }

  await ensureDir(outputDir)

  await Promise.all(
    artifactNames.map(async (name) => {
      const src = path.join(inputDir, name)
      const dest = path.join(outputDir, name)
      await copyFileSafe(src, dest)
    })
  )

  process.stdout.write(
    `Copiati ${artifactNames.length} artefatti in ${outputDir}\n`
  )
}

await main()
