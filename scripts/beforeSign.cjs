const { execFileSync } = require('node:child_process')

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return

  const targetPath = context.appOutDir || context.appPath
  if (!targetPath) return

  execFileSync('xattr', ['-cr', targetPath], { stdio: 'inherit' })
}

