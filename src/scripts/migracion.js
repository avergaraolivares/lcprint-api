// Script de migración — ejecutar una sola vez
// node src/scripts/migracion.js

require('dotenv').config()
const db   = require('../config/db')
const path = require('path')
const fs   = require('fs')
const sharp = require('sharp')
const { v4: uuidv4 } = require('uuid')

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads'

const processToCanvas = async (buffer, size) => {
  const meta  = await sharp(buffer).metadata()
  const scale = Math.min(size / meta.width, size / meta.height)
  const newW  = Math.round(meta.width  * scale)
  const newH  = Math.round(meta.height * scale)
  const offX  = Math.round((size - newW) / 2)
  const offY  = Math.round((size - newH) / 2)

  const resized = await sharp(buffer)
    .resize(newW, newH, { fit: 'inside' })
    .toBuffer()

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r:255, g:255, b:255, alpha:1 } }
  })
  .composite([{ input: resized, left: offX, top: offY }])
  .webp({ quality: 85 })
  .toBuffer()
}

async function migrar() {
  console.log('🔄 Iniciando migración de imágenes...')

  const [productos] = await db.query(
    'SELECT id, imagen_principal FROM productos WHERE imagen_principal IS NOT NULL AND imagen_thumb IS NULL'
  )

  console.log(`📦 ${productos.length} productos para migrar`)
  let ok = 0, err = 0

  for (const prod of productos) {
    try {
      const filepath = path.join(UPLOAD_PATH, prod.imagen_principal.replace('/uploads/', ''))
      if (!fs.existsSync(filepath)) { console.log(`⚠️  No existe: ${filepath}`); err++; continue }

      const buffer   = fs.readFileSync(filepath)
      const now      = new Date()
      const year     = now.getFullYear()
      const month    = String(now.getMonth() + 1).padStart(2, '0')
      const dir      = path.join(UPLOAD_PATH, 'productos', String(year), month)
      const relative = `/uploads/productos/${year}/${month}`
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      const uid = uuidv4()
      const [origBuf, medBuf, thumbBuf] = await Promise.all([
        processToCanvas(buffer, 1200),
        processToCanvas(buffer, 600),
        processToCanvas(buffer, 300),
      ])

      const origFile  = `${uid}_original.webp`
      const medFile   = `${uid}_medium.webp`
      const thumbFile = `${uid}_thumb.webp`

      fs.writeFileSync(path.join(dir, origFile),  origBuf)
      fs.writeFileSync(path.join(dir, medFile),   medBuf)
      fs.writeFileSync(path.join(dir, thumbFile), thumbBuf)

      await db.query(
        `UPDATE productos SET
           imagen_original = ?,
           imagen_medium   = ?,
           imagen_thumb    = ?,
           imagen_principal = ?
         WHERE id = ?`,
        [
          `${relative}/${origFile}`,
          `${relative}/${medFile}`,
          `${relative}/${thumbFile}`,
          `${relative}/${origFile}`,
          prod.id
        ]
      )

      console.log(`✅ Migrado producto ${prod.id}`)
      ok++
    } catch (e) {
      console.error(`❌ Error producto ${prod.id}:`, e.message)
      err++
    }
  }

  console.log(`\n✅ Migración completa: ${ok} ok, ${err} errores`)
  process.exit(0)
}

migrar()
