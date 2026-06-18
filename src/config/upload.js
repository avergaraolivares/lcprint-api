const multer  = require('multer')
const path    = require('path')
const sharp   = require('sharp')
const fs      = require('fs')
const { v4: uuidv4 } = require('uuid')

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads'

// Asegurar que existan las carpetas
;['products', 'company'].forEach(dir => {
  const full = path.join(UPLOAD_PATH, dir)
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true })
})

const storage = multer.memoryStorage()

// ── Filtro para imágenes ──────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg','image/jpg','image/png','image/webp']
  if (allowed.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Solo se permiten imágenes JPG, PNG o WebP'), false)
  }
}

// ── Filtro para Excel ─────────────────────────────────────────
const excelFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
    'application/zip',
  ]
  const isExcel = file.originalname.match(/\.(xlsx|xls)$/i)
  if (allowedMimes.includes(file.mimetype) || isExcel) {
    cb(null, true)
  } else {
    cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false)
  }
}

// ── Multer para imágenes ──────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
})

// ── Multer para Excel ─────────────────────────────────────────
const uploadExcel = multer({
  storage,
  fileFilter: excelFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
})

// ── Procesar y guardar imagen con sharp ───────────────────────
const processImage = async (buffer, folder, width = 800) => {
  const filename = `${uuidv4()}.webp`
  const dest     = path.join(UPLOAD_PATH, folder, filename)

  await sharp(buffer)
    .resize(width, null, { withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(dest)

  return `/uploads/${folder}/${filename}`
}

const deleteImage = (url) => {
  if (!url) return
  const filepath = path.join(UPLOAD_PATH, url.replace('/uploads/', ''))
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath)
}

module.exports = { upload, uploadExcel, processImage, deleteImage }