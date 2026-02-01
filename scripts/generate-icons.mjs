import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const projectRoot = process.cwd()
const buildDir = path.join(projectRoot, 'build')
const iconsetDir = path.join(buildDir, 'icon.iconset')

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e3a8a"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0b1220" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>

  <g filter="url(#shadow)">
    <rect x="240" y="230" width="544" height="564" rx="80" fill="#ffffff"/>
    <path d="M690 230h-120c0 56 46 102 102 102h120V312c0-45-37-82-82-82z" fill="#e5e7eb"/>
    <path d="M570 230l214 214" stroke="#d1d5db" stroke-width="18"/>
  </g>

  <g>
    <rect x="300" y="404" width="424" height="78" rx="39" fill="#0ea5e9" opacity="0.12"/>
    <text x="335" y="458" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="64" font-weight="800" fill="#0f172a">A</text>
    <text x="610" y="458" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="58" font-weight="800" fill="#0f172a">文</text>

    <path d="M448 526c0-18 14-32 32-32h156l-24-24c-12-12-12-31 0-43s31-12 43 0l78 78c12 12 12 31 0 43l-78 78c-12 12-31 12-43 0s-12-31 0-43l24-24H480c-18 0-32-14-32-32z" fill="#0f172a"/>

    <path d="M338 666c0-18 14-32 32-32h284c18 0 32 14 32 32s-14 32-32 32H370c-18 0-32-14-32-32z" fill="#0ea5e9" opacity="0.22"/>
    <path d="M338 738c0-18 14-32 32-32h236c18 0 32 14 32 32s-14 32-32 32H370c-18 0-32-14-32-32z" fill="#0ea5e9" opacity="0.16"/>
  </g>
</svg>`

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
  return sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
}

async function generateMacIcns() {
  await ensureEmptyDir(iconsetDir)

  await Promise.all(
    iconsetEntries.map(async ({ name, size }) => {
      const outPath = path.join(iconsetDir, name)
      await (await renderPng(size)).toFile(outPath)
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
  await (await renderPng(1024)).toFile(outPath)
}

async function generateWinIco() {
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map(async (size) => (await renderPng(size)).toBuffer())
  )
  const icoBuffer = await pngToIco(pngBuffers)
  await fs.writeFile(path.join(buildDir, 'icon.ico'), icoBuffer)
}

async function main() {
  await fs.mkdir(buildDir, { recursive: true })
  await generateBasePng()
  await generateWinIco()
  await generateMacIcns()
}

await main()
