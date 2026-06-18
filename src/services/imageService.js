const sharp  = require('sharp')
const path   = require('path')
const fs     = require('fs')
const { v4: uuidv4 } = require('uuid')

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads'

// Generar ruta organizada por año/mes
const getUploadPath = () => {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const dir   = path.join(UPLOAD_PATH, 'productos', String(year), month)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return { dir, relative: `/uploads/productos/${year}/${month}` }
}

// Procesar imagen a lienzo 1:1 con fondo blanco
const processToCanvas = async (buffer, size) => {
  const meta   = await sharp(buffer).metadata()
  const { width, height } = meta

  // Calcular escala manteniendo proporciones
  const scale    = Math.min(size / width, size / height)
  const newW     = Math.round(width  * scale)
  const newH     = Math.round(height * scale)
  const offsetX  = Math.round((size - newW) / 2)
  const offsetY  = Math.round((size - newH) / 2)

  return sharp(buffer)
    .resize(newW, newH, { fit: 'inside', withoutEnlargement: false })
    .toBuffer()
    .then(resized =>
      sharp({
        create: {
          width:      size,
          height:     size,
          channels:   4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .composite([{ input: resized, left: offsetX, top: offsetY }])
      .webp({ quality: 85 })
      .toBuffer()
    )
}

// Procesar imagen completa — genera original, medium y thumb
const processProductImage = async (buffer) => {
  const { dir, relative } = getUploadPath()
  const uid = uuidv4()

  const [origBuf, medBuf, thumbBuf] = await Promise.all([
    processToCanvas(buffer, 1200),
    processToCanvas(buffer, 600),
    processToCanvas(buffer, 300),
  ])

  const origFile  = `${uid}_original.webp`
  const medFile   = `${uid}_medium.webp`
  const thumbFile = `${uid}_thumb.webp`

  await Promise.all([
    fs.promises.writeFile(path.join(dir, origFile),  origBuf),
    fs.promises.writeFile(path.join(dir, medFile),   medBuf),
    fs.promises.writeFile(path.join(dir, thumbFile), thumbBuf),
  ])

  return {
    imagen_original: `${relative}/${origFile}`,
    imagen_medium:   `${relative}/${medFile}`,
    imagen_thumb:    `${relative}/${thumbFile}`,
    imagen_principal:`${relative}/${origFile}`, // compatibilidad
  }
}

// Eliminar todas las versiones de una imagen
const deleteProductImages = (producto) => {
  const fields = ['imagen_original','imagen_medium','imagen_thumb','imagen_principal']
  const deleted = new Set()
  fields.forEach(f => {
    const url = producto[f]
    if (!url || deleted.has(url)) return
    deleted.add(url)
    const filepath = path.join(UPLOAD_PATH, url.replace('/uploads/', ''))
    if (fs.existsSync(filepath)) {
      try { fs.unlinkSync(filepath) } catch {}
    }
  })
}

module.exports = { processProductImage, deleteProductImages }
