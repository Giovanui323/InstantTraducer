import { execFileSync } from 'node:child_process'

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

async function main() {
  if (process.platform !== 'darwin') {
    run('npm', ['run', 'build'])
    run('npm', ['run', 'generate:icons'])
    run('npx', ['electron-builder'])
    return
  }

  const args = ['scripts/package-mac.mjs', `--arch=${process.arch}`]
  if (process.env.BUILD_DMG === '1' || process.env.BUILD_DMG === 'true') {
    args.push('--dmg')
  }
  run('node', args)
}

await main()
