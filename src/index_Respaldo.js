require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const path    = require('path')
const fs      = require('fs')

const app    = express()
const PORT   = process.env.PORT || 4000
const routes = require('./routes')

// ── Crear carpetas de uploads si no existen ───────────────────
const uploadPath = process.env.UPLOAD_PATH || './uploads'
;['products','company'].forEach(dir => {
  const p = path.join(uploadPath, dir)
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
})

// ── Middlewares ───────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── Archivos estáticos ────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(uploadPath)))

// ── Rutas API ─────────────────────────────────────────────────
app.use('/api', routes)

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }))

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ message: err.message || 'Error interno del servidor' })
})

app.listen(PORT, () => {
  console.log(`🚀 Backend LC Print corriendo en http://localhost:${PORT}`)
})
