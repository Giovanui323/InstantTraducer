import path from 'node:path'
import { execFileSync } from 'node:child_process'

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

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function filterElectronBuilderOutput(text) {
  const raw = String(text || '')
  const lines = raw.split(/\r?\n/)
  const filtered = lines.filter(
    (line) => !line.toLowerCase().includes('cannot find path for dependency')
  )
  return filtered.join('\n')
}

function runCapturingFiltered(command, args) {
  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe']
    })
    if (stdout) process.stdout.write(filterElectronBuilderOutput(stdout) + '\n')
    return { ok: true }
  } catch (e) {
    const stdout = e?.stdout ? filterElectronBuilderOutput(String(e.stdout)) : ''
    const stderr = e?.stderr ? filterElectronBuilderOutput(String(e.stderr)) : ''
    if (stdout) process.stdout.write(stdout + '\n')
    if (stderr) process.stderr.write(stderr + '\n')
    const message = [String(e?.message || e || ''), stdout, stderr]
      .filter(Boolean)
      .join('\n')
    return { ok: false, message }
  }
}

function isSandboxDmgError(message) {
  const m = String(message).toLowerCase()
  return (
    m.includes('not allow operate files') ||
    m.includes('/dev/rdisk') ||
    m.includes('hdiutil: create failed') ||
    m.includes('operazione non consentita') ||
    m.includes('operation not permitted')
  )
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2))
  const projectRoot = process.cwd()

  const arch = positional[0] ?? flags.arch ?? 'arm64'
  const tempOut =
    positional[1] ?? flags.tempOut ?? '/tmp/gemini-pdf-translator-release'
  const finalOut = positional[2] ?? flags.out ?? path.join(projectRoot, 'release')
  const buildDmg =
    flags.dmg === true ||
    flags.dmg === 'true' ||
    process.env.BUILD_DMG === '1' ||
    process.env.BUILD_DMG === 'true'

  run('npm', ['run', 'build'])
  run('npm', ['run', 'generate:icons'])

  const zipResult = runCapturingFiltered('npx', [
    'electron-builder',
    '--mac',
    'zip',
    `--${arch}`,
    `-c.directories.output=${tempOut}`
  ])
  if (!zipResult.ok) throw new Error(zipResult.message)
  run('node', [
    'scripts/copy-mac-artifacts.mjs',
    tempOut,
    finalOut,
    arch
  ])

  if (!buildDmg) return

  const dmgResult = runCapturingFiltered('npx', [
    'electron-builder',
    '--mac',
    'dmg',
    `--${arch}`,
    `-c.directories.output=${tempOut}`
  ])

  if (dmgResult.ok) {
    run('node', [
      'scripts/copy-mac-artifacts.mjs',
      tempOut,
      finalOut,
      arch
    ])
    return
  }

  if (isSandboxDmgError(dmgResult.message)) {
    process.stdout.write(
      'DMG non generabile in questo ambiente (sandbox/permessi su /dev/rdisk). Artefatto ZIP generato correttamente.\n'
    )
    return
  }

  throw new Error(dmgResult.message)
}

await main()
