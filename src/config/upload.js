const multer  = require('multer')
const sharp   = require('sharp')
const { v4: uuidv4 } = require('uuid')
const cloudinary = require('cloudinary').v2

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg','image/jpg','image/png','image/webp']
  if (allowed.includes(file.mimetype)) cb(null, true)
  else cb(new Error('Solo se permiten imágenes JPG, PNG o WebP'), false)
}

const excelFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
    'application/zip',
  ]
  const isExcel = file.originalname.match(/\.(xlsx|xls)$/i)
  if (allowedMimes.includes(file.mimetype) || isExcel) cb(null, true)
  else cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false)
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
})

const uploadExcel = multer({
  storage,
  fileFilter: excelFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
})

// ── Procesar y subir imagen a Cloudinary ──────────────────────
// width: ancho máximo en px (sin agrandar si la imagen es más pequeña)
// quality: 92 por defecto para buena nitidez sin peso excesivo
const processImage = async (buffer, folder, width = 1200, quality = 92) => {
  const webpBuffer = await sharp(buffer)
    .resize(width, null, { withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()

  return new Promise((resolve, reject) => {
    const publicId = `lcprint/${folder}/${uuidv4()}`
    cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', format: 'webp' },
      (error, result) => {
        if (error) reject(error)
        else resolve(result.secure_url)
      }
    ).end(webpBuffer)
  })
}

const deleteImage = async (url) => {
  if (!url || !url.includes('cloudinary')) return
  try {
    const parts = url.split('/')
    const filename = parts[parts.length - 1].split('.')[0]
    const folder = parts[parts.length - 2]
    const subfolder = parts[parts.length - 3]
    await cloudinary.uploader.destroy(`${subfolder}/${folder}/${filename}`)
  } catch (e) {
    console.error('Error eliminando imagen de Cloudinary:', e)
  }
}

module.exports = { upload, uploadExcel, processImage, deleteImage }