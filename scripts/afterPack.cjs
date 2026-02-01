const { execFileSync } = require('node:child_process')

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return
  if (!context.appOutDir) return

  execFileSync('xattr', ['-cr', context.appOutDir], { stdio: 'inherit' })
}

