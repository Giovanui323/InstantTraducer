import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const projectRoot = process.cwd()
const buildDir = path.join(projectRoot, 'build')
const iconsetDir = path.join(buildDir, 'icon.iconset')
const sourcePath = path.join(buildDir, 'icon-source.png')

const iconsetEntries = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 }
]

async function ensureEmptyDir(dir) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

async function renderPng(size) {
  const innerSize = Math.round(size * 0.9)
  return sharp(sourcePath)
    .trim() // Remove potential solid background borders
    .resize(innerSize, innerSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .resize(size, size, { // Scale to target size with transparent padding
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
}

async function generateMacIcns() {
  await ensureEmptyDir(iconsetDir)

  await Promise.all(
    iconsetEntries.map(async ({ name, size }) => {
      const outPath = path.join(iconsetDir, name)
      const png = await renderPng(size)
      await png.toFile(outPath)
    })
  )

  const icnsPath = path.join(buildDir, 'icon.icns')
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath], {
    stdio: 'inherit'
  })
}

async function generateBasePng() {
  await fs.mkdir(buildDir, { recursive: true })
  const outPath = path.join(buildDir, 'icon.png')
  const png = await renderPng(1024)
  await png.toFile(outPath)
}

async function generateWinIco() {
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map(async (size) => {
      const png = await renderPng(size)
      return png.toBuffer()
    })
  )
  const icoBuffer = await pngToIco(pngBuffers)
  await fs.writeFile(path.join(buildDir, 'icon.ico'), icoBuffer)
}

async function main() {
  try {
    await fs.access(sourcePath)
  } catch {
    console.error(`Source icon not found at ${sourcePath}`)
    process.exit(1)
  }
  await fs.mkdir(buildDir, { recursive: true })
  await generateBasePng()
  await generateWinIco()
  await generateMacIcns()
}

await main()
