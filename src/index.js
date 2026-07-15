require('dotenv').config()
const express   = require('express')
const cors      = require('cors')
const path      = require('path')
const fs        = require('fs')
const helmet    = require('helmet')
const rateLimit = require('express-rate-limit')

const app    = express()
const PORT   = process.env.PORT || 4000
const routes = require('./routes')

// ── Crear carpetas de uploads si no existen ───────────────────
const uploadPath = process.env.UPLOAD_PATH || './uploads'
;['products','company'].forEach(dir => {
  const p = path.join(uploadPath, dir)
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
})

// ── Seguridad — Helmet (cabeceras HTTP) ───────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // necesario para imágenes Cloudinary
  contentSecurityPolicy: false, // el frontend es React separado, no SSR
}))
app.use(helmet.hsts({ maxAge: 63072000, includeSubDomains: true, preload: true }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options',    'nosniff')
  res.setHeader('X-Frame-Options',           'DENY')
  res.setHeader('Referrer-Policy',           'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy',        'camera=(), microphone=(), geolocation=()')
  next()
})

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

// ── Rate limiting ─────────────────────────────────────────────
// Login: máximo 10 intentos cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Demasiados intentos de inicio de sesión. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Contacto: máximo 5 mensajes cada 10 minutos por IP
const contactoLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { message: 'Demasiados mensajes enviados. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// API general: 1000 req/15min — el límite anterior (200) era demasiado
// bajo: una sola carga de la página de Inicio dispara ~12-15 llamadas
// simultáneas (categorías, banners, configuración, diseño, spotlight,
// productos, contenido, clientes, logos-confianza, visita), así que se
// agotaba con apenas 15-16 recargas en 15 minutos — algo normal durante
// desarrollo o para un visitante navegando varias páginas del sitio.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/admin'), // admin no tiene límite general
})

app.use('/api/auth/login', loginLimiter)
app.use('/api/contacto',   contactoLimiter)
app.use('/api',            apiLimiter)

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── Archivos estáticos ────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(uploadPath)))

// ── Rutas API ─────────────────────────────────────────────────
app.use('/api', routes)

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' })) // sin exponer timestamp

// ── Ocultar fingerprinting de Express ─────────────────────────
app.disable('x-powered-by')

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack)
  // En producción no exponer detalles del error
  const isProd = process.env.NODE_ENV === 'production'
  res.status(500).json({
    message: isProd ? 'Error interno del servidor' : err.message
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Backend LC Print corriendo en http://localhost:${PORT}`)
  console.log(`✅ MySQL conectado correctamente`)
})