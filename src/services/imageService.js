const sharp  = require('sharp')
const { v4: uuidv4 } = require('uuid')
const cloudinary = require('../config/cloudinary')

// Procesar imagen a lienzo 1:1 con fondo blanco
const processToCanvas = async (buffer, size) => {
  const meta = await sharp(buffer).metadata()
  const { width, height } = meta
  const scale   = Math.min(size / width, size / height)
  const newW    = Math.round(width  * scale)
  const newH    = Math.round(height * scale)
  const offsetX = Math.round((size - newW) / 2)
  const offsetY = Math.round((size - newH) / 2)
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

// Subir buffer a Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'lcprint', resource_type: 'image' },
      (error, result) => {
        if (error) reject(error)
        else resolve(result.secure_url)
      }
    )
    stream.end(buffer)
  })
}

// Procesar imagen completa — genera original, medium y thumb → sube a Cloudinary
const processProductImage = async (buffer) => {
  const [origBuf, medBuf, thumbBuf] = await Promise.all([
    processToCanvas(buffer, 1200),
    processToCanvas(buffer, 600),
    processToCanvas(buffer, 300),
  ])
  const [origUrl, medUrl, thumbUrl] = await Promise.all([
    uploadToCloudinary(origBuf),
    uploadToCloudinary(medBuf),
    uploadToCloudinary(thumbBuf),
  ])
  return {
    imagen_original:  origUrl,
    imagen_medium:    medUrl,
    imagen_thumb:     thumbUrl,
    imagen_principal: origUrl,
  }
}

// Eliminar imágenes de Cloudinary
const deleteProductImages = async (producto) => {
  const fields = ['imagen_original', 'imagen_medium', 'imagen_thumb']
  const urls = [...new Set(fields.map(f => producto[f]).filter(Boolean))]
  for (const url of urls) {
    try {
      const publicId = url.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '')
      await cloudinary.uploader.destroy(publicId)
    } catch {}
  }
}

module.exports = { processProductImage, deleteProductImages }