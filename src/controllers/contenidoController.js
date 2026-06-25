const db                            = require('../config/db')
const { processImage, processImageFull, deleteImage } = require('../config/upload')
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

// Logos de confianza usan el mismo helper de subida a Cloudinary que el resto
// de imágenes del sitio (processImage ya sube a Cloudinary, no a disco local).
const processLogoPago = async (buffer, folder) => processImage(buffer, folder, 400)

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

// ── Logos de confianza (Webpay Plus + Garantía) ─────────────────
// Se reciben hasta 2 archivos en una sola petición multipart con
// field names: logo_pago, logo_garantia
const getLogosConfianza = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT logo_pago, logo_garantia FROM configuracion_empresa WHERE id = 1`
    )
    res.json(rows[0] || {})
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener logos' })
  }
}

const updateLogosConfianza = async (req, res) => {
  try {
    const [curr] = await db.query(
      `SELECT logo_pago, logo_garantia FROM configuracion_empresa WHERE id = 1`
    )
    const actuales = curr[0] || {}
    const campos = ['logo_pago', 'logo_garantia']

    const sets    = []
    const valores = []

    for (const campo of campos) {
      const file = req.files?.find(f => f.fieldname === campo)
      if (file) {
        if (actuales[campo]) deleteImage(actuales[campo])
        const nuevaUrl = await processLogoPago(file.buffer, 'sellos')
        sets.push(`${campo} = ?`)
        valores.push(nuevaUrl)
      }
    }

    // Permite eliminar uno específico vía body.eliminar = 'logo_pago' | 'logo_garantia'
    if (req.body.eliminar && campos.includes(req.body.eliminar)) {
      const campo = req.body.eliminar
      if (actuales[campo]) deleteImage(actuales[campo])
      sets.push(`${campo} = NULL`)
    }

    if (sets.length === 0) return res.json(actuales)

    await db.query(`UPDATE configuracion_empresa SET ${sets.join(', ')} WHERE id = 1`, valores)
    const [updated] = await db.query(
      `SELECT logo_pago, logo_garantia FROM configuracion_empresa WHERE id = 1`
    )
    res.json(updated[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al actualizar logos' })
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
      'spotlight_categoria_id', 'spotlight_titulo', 'spotlight_desc',
      'spotlight2_categoria_id', 'spotlight2_titulo', 'spotlight2_desc',
    ]

    const sets    = campos.map(c => `${c} = ?`).join(', ')
    const valores = campos.map(c => req.body[c] ?? null)

    // req.files puede ser un objeto (fields) o undefined (single)
    const getFile = (name) => {
      if (!req.files) return req.file || null
      if (Array.isArray(req.files)) return req.files.find(f => f.fieldname === name) || null
      return req.files[name]?.[0] || null
    }

    const [curr] = await db.query(
      'SELECT banner_imagen, banner_imagen_medium, banner_imagen_thumb, spotlight_imagen, spotlight_banner, spotlight2_imagen, spotlight2_banner FROM contenido_inicio WHERE id = 1'
    )

    let extraSet  = ''
    let extraVals = []

    // Banner principal
    const bannerFile = getFile('banner')
    if (bannerFile) {
      ;[curr[0]?.banner_imagen, curr[0]?.banner_imagen_medium, curr[0]?.banner_imagen_thumb]
        .filter(Boolean).forEach(url => deleteImage(url))
      const urls = await processBanner(bannerFile.buffer, 'company')
      extraSet  += ', banner_imagen = ?, banner_imagen_medium = ?, banner_imagen_thumb = ?'
      extraVals.push(urls.original, urls.medium, urls.thumb)
    }

    // Imagen col 1 del spotlight (imagen categoría)
    const spImgFile = getFile('spotlight_imagen')
    if (spImgFile) {
      if (curr[0]?.spotlight_imagen) deleteImage(curr[0].spotlight_imagen)
      const url = await processImageFull(spImgFile.buffer, 'spotlight')
      extraSet  += ', spotlight_imagen = ?'
      extraVals.push(url)
    }

    // Banner col 2 del spotlight
    const spBannerFile = getFile('spotlight_banner')
    if (spBannerFile) {
      if (curr[0]?.spotlight_banner) deleteImage(curr[0].spotlight_banner)
      const url = await processImageFull(spBannerFile.buffer, 'spotlight')
      extraSet  += ', spotlight_banner = ?'
      extraVals.push(url)
    }

    // Spotlight 2 — imagen categoría
    const sp2ImgFile = getFile('spotlight2_imagen')
    if (sp2ImgFile) {
      if (curr[0]?.spotlight2_imagen) deleteImage(curr[0].spotlight2_imagen)
      const url = await processImageFull(sp2ImgFile.buffer, 'spotlight')
      extraSet  += ', spotlight2_imagen = ?'
      extraVals.push(url)
    }

    // Spotlight 2 — banner
    const sp2BannerFile = getFile('spotlight2_banner')
    if (sp2BannerFile) {
      if (curr[0]?.spotlight2_banner) deleteImage(curr[0].spotlight2_banner)
      const url = await processImageFull(sp2BannerFile.buffer, 'spotlight')
      extraSet  += ', spotlight2_banner = ?'
      extraVals.push(url)
    }

    await db.query(
      `UPDATE contenido_inicio SET ${sets}${extraSet} WHERE id = ?`,
      [...valores, ...extraVals, 1]
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


// ── Spotlight de categoría (soporta num=1 y num=2) ────────────
const getSpotlight = async (req, res) => {
  const num = Number(req.query.num) || 1

  try {
    let catId, titulo, desc, imagen, banner

    if (num === 2) {
      const [rows] = await db.query(
        'SELECT spotlight2_categoria_id, spotlight2_titulo, spotlight2_desc, spotlight2_imagen, spotlight2_banner FROM contenido_inicio WHERE id = 1'
      )
      const r = rows[0] || {}
      catId  = r.spotlight2_categoria_id
      titulo = r.spotlight2_titulo
      desc   = r.spotlight2_desc
      imagen = r.spotlight2_imagen
      banner = r.spotlight2_banner
    } else {
      const [rows] = await db.query(
        'SELECT spotlight_categoria_id, spotlight_titulo, spotlight_desc, spotlight_imagen, spotlight_banner FROM contenido_inicio WHERE id = 1'
      )
      const r = rows[0] || {}
      catId  = r.spotlight_categoria_id
      titulo = r.spotlight_titulo
      desc   = r.spotlight_desc
      imagen = r.spotlight_imagen
      banner = r.spotlight_banner
    }

    if (!catId) return res.json(null)

    const [catRows] = await db.query('SELECT * FROM categorias WHERE id = ?', [catId])
    if (!catRows.length) return res.json(null)
    const categoria = catRows[0]

    const [subcats] = await db.query(
      'SELECT * FROM categorias WHERE parent_id = ? AND activo = 1 ORDER BY orden, nombre',
      [categoria.id]
    )

    const [spProds] = await db.query(`
      SELECT p.id, p.nombre, p.codigo, p.precio,
             p.imagen_thumb, p.imagen_principal,
             c.nombre as categoria_nombre
      FROM spotlight_productos sp
      JOIN productos p ON sp.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      WHERE p.activo = 1 AND sp.spotlight_num = ?
      ORDER BY sp.orden ASC
    `, [num])

    let productos = spProds
    if (!productos.length) {
      const [fallback] = await db.query(
        `SELECT p.id, p.nombre, p.codigo, p.precio,
                p.imagen_thumb, p.imagen_principal,
                c.nombre as categoria_nombre
         FROM productos p
         JOIN categorias c ON p.categoria_id = c.id
         WHERE p.activo = 1 AND (c.id = ? OR c.parent_id = ?)
         ORDER BY p.nombre ASC LIMIT 3`,
        [categoria.id, categoria.id]
      )
      productos = fallback
    }

    res.json({
      categoria,
      titulo:  titulo  || categoria.nombre,
      desc:    desc    || categoria.descripcion || '',
      imagen:  imagen  || null,
      banner:  banner  || null,
      subcats, productos,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al obtener spotlight' })
  }
}

module.exports = {
  getConfig, updateConfig,
  getLogosConfianza, updateLogosConfianza,
  getInicio, updateInicio,
  getNosotros, updateNosotros,
  getSpotlight,
}