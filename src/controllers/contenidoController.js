const db                            = require('../config/db')
const { processImage, deleteImage } = require('../config/upload')
const sharp                         = require('sharp')
const path                          = require('path')
const fs                            = require('fs')
const { v4: uuidv4 }               = require('uuid')

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads'

// Procesar banner manteniendo proporciones (no cuadrado)
const processBanner = async (buffer, folder) => {
  const meta   = await sharp(buffer).metadata()
  const { width, height } = meta
  const uid    = uuidv4()
  const dir    = path.join(UPLOAD_PATH, folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const sizes = [
    { suffix: 'original', maxW: 1920 },
    { suffix: 'medium',   maxW: 960  },
    { suffix: 'thumb',    maxW: 480  },
  ]

  const urls = {}
  for (const { suffix, maxW } of sizes) {
    const ratio = Math.min(1, maxW / width)
    const nw    = Math.round(width  * ratio)
    const nh    = Math.round(height * ratio)
    const file  = `${uid}_${suffix}.webp`
    await sharp(buffer)
      .resize(nw, nh, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: suffix === 'original' ? 90 : 85 })
      .toFile(path.join(dir, file))
    urls[suffix] = `/uploads/${folder}/${file}`
  }
  return urls
}

// ── Configuración empresa ─────────────────────────────────────
const getConfig = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM configuracion_empresa WHERE id = 1')
    res.json(rows[0] || {})
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener configuración' })
  }
}

const updateConfig = async (req, res) => {
  try {
    const campos  = ['nombre','rut','email','telefono','whatsapp','direccion','ciudad',
                     'facebook','instagram','banco','tipo_cuenta','numero_cuenta']
    const sets    = campos.map(c => `${c} = ?`).join(', ')
    const valores = campos.map(c => req.body[c] ?? null)

    let logo = null
    if (req.file) {
      const [curr] = await db.query('SELECT logo FROM configuracion_empresa WHERE id = 1')
      if (curr[0]?.logo) deleteImage(curr[0].logo)
      logo = await processImage(req.file.buffer, 'company', 400)
    }

    const logoSet = logo ? ', logo = ?' : ''
    const params  = logo ? [...valores, logo, 1] : [...valores, 1]

    await db.query(`UPDATE configuracion_empresa SET ${sets}${logoSet} WHERE id = ?`, params)
    const [updated] = await db.query('SELECT * FROM configuracion_empresa WHERE id = 1')
    res.json(updated[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al actualizar configuración' })
  }
}

// ── Contenido Inicio ─────────────────────────────────────────
const getInicio = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM contenido_inicio WHERE id = 1')
    res.json(rows[0] || {})
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener contenido' })
  }
}

const updateInicio = async (req, res) => {
  try {
    const campos = [
      'banner_titulo', 'banner_subtitulo', 'banner_desc',
      'stat1_numero', 'stat1_label', 'stat2_numero', 'stat2_label', 'stat3_numero', 'stat3_label',
      'beneficio1_titulo', 'beneficio1_desc', 'beneficio2_titulo', 'beneficio2_desc',
      'beneficio3_titulo', 'beneficio3_desc', 'beneficio4_titulo', 'beneficio4_desc',
      'marcas', 'cta_titulo', 'cta_desc', 'cta_boton',
      'seccion_categorias_titulo', 'seccion_destacados_titulo',
    ]

    const sets    = campos.map(c => `${c} = ?`).join(', ')
    const valores = campos.map(c => req.body[c] ?? null)

    // Procesar banner si se sube
    let bannerSet = ''
    let bannerVals = []
    if (req.file) {
      const [curr] = await db.query(
        'SELECT banner_imagen, banner_imagen_medium, banner_imagen_thumb FROM contenido_inicio WHERE id = 1'
      )
      // Eliminar versiones anteriores
      if (curr[0]) {
        ;[curr[0].banner_imagen, curr[0].banner_imagen_medium, curr[0].banner_imagen_thumb]
          .filter(Boolean).forEach(url => deleteImage(url))
      }

      const urls = await processBanner(req.file.buffer, 'company')
      bannerSet  = ', banner_imagen = ?, banner_imagen_medium = ?, banner_imagen_thumb = ?'
      bannerVals = [urls.original, urls.medium, urls.thumb]
    }

    await db.query(
      `UPDATE contenido_inicio SET ${sets}${bannerSet} WHERE id = ?`,
      [...valores, ...bannerVals, 1]
    )

    const [updated] = await db.query('SELECT * FROM contenido_inicio WHERE id = 1')
    res.json(updated[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al actualizar contenido' })
  }
}

// ── Contenido Nosotros ───────────────────────────────────────
const getNosotros = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM contenido_nosotros WHERE id = 1')
    const data = rows[0] || {}
    if (data.valores && typeof data.valores === 'string') {
      try { data.valores = JSON.parse(data.valores) } catch { data.valores = [] }
    }
    res.json(data)
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener contenido' })
  }
}

const updateNosotros = async (req, res) => {
  try {
    const { historia, mision, vision, valores } = req.body
    let imagen = null

    if (req.file) {
      const [curr] = await db.query('SELECT imagen FROM contenido_nosotros WHERE id = 1')
      if (curr[0]?.imagen) deleteImage(curr[0].imagen)
      imagen = await processImage(req.file.buffer, 'company', 1200)
    }

    const valoresJson = valores
      ? JSON.stringify(typeof valores === 'string' ? JSON.parse(valores) : valores)
      : null

    const imgSet = imagen ? ', imagen = ?' : ''
    const params = imagen
      ? [historia, mision, vision, valoresJson, imagen, 1]
      : [historia, mision, vision, valoresJson, 1]

    await db.query(
      `UPDATE contenido_nosotros SET historia=?, mision=?, vision=?, valores=?${imgSet} WHERE id=?`,
      params
    )
    const [updated] = await db.query('SELECT * FROM contenido_nosotros WHERE id = 1')
    res.json(updated[0])
  } catch (e) {
    res.status(500).json({ message: 'Error al actualizar contenido' })
  }
}

module.exports = { getConfig, updateConfig, getInicio, updateInicio, getNosotros, updateNosotros }