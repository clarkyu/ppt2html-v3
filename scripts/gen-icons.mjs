// Rasterize the SVG design source into the PNG icons the manifest references.
// Run with: npm run icons
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'design/icon-source.svg')
const outDir = resolve(root, 'public/icons')

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'maskable-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

await mkdir(outDir, { recursive: true })
const svg = await readFile(src)

for (const { name, size } of targets) {
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer()
  await writeFile(resolve(outDir, name), png)
  console.log(`✓ ${name} (${size}×${size})`)
}
console.log('Icons generated.')
