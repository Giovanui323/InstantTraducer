import { execFileSync } from 'node:child_process'

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function detectAppleSiliconHardware() {
  if (process.platform !== 'darwin') return false
  try {
    const out = execFileSync('sysctl', ['-n', 'hw.optional.arm64'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return String(out).trim() === '1'
  } catch {
    return false
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    run('npm', ['run', 'build'])
    run('npm', ['run', 'generate:icons'])
    run('npx', ['electron-builder'])
    return
  }

  const arch = detectAppleSiliconHardware() ? 'arm64' : process.arch
  const args = ['scripts/package-mac.mjs', `--arch=${arch}`]
  if (process.env.BUILD_DMG === '1' || process.env.BUILD_DMG === 'true') {
    args.push('--dmg')
  }
  run('node', args)
}

await main()
