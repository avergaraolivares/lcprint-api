const db          = require('../config/db')
const nodemailer  = require('nodemailer')
const PDFDocument = require('pdfkit')

// ── Contacto ──────────────────────────────────────────────────
const enviarContacto = async (req, res) => {
  try {
    const { nombre, email, telefono, mensaje } = req.body
    if (!nombre || !email || !mensaje)
      return res.status(400).json({ message: 'Nombre, email y mensaje son requeridos' })

    await db.query(
      'INSERT INTO contactos (nombre, email, telefono, mensaje) VALUES (?,?,?,?)',
      [nombre, email, telefono || null, mensaje]
    )

    // Responder inmediatamente — el email se envía en segundo plano sin bloquear
    res.json({ message: 'Mensaje enviado correctamente' })

    if (process.env.MAIL_USER && process.env.MAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.MAIL_HOST || 'smtp.gmail.com',
          port: Number(process.env.MAIL_PORT) || 587,
          secure: false,
          auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
        })
        await transporter.sendMail({
          from:    process.env.MAIL_FROM,
          to:      process.env.MAIL_TO,
          subject: `Nuevo contacto de ${nombre} — LC Print`,
          html: `
            <h2>Nuevo mensaje de contacto</h2>
            <p><strong>Nombre:</strong> ${nombre}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Teléfono:</strong> ${telefono || 'No indicado'}</p>
            <p><strong>Mensaje:</strong></p>
            <p>${mensaje}</p>
          `
        })
      } catch (mailErr) {
        console.error('Error enviando email de notificación:', mailErr.message)
      }
    }
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al enviar mensaje' })
  }
}

const listarContactos = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM contactos ORDER BY created_at DESC')
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener contactos' })
  }
}

const marcarLeido = async (req, res) => {
  try {
    await db.query('UPDATE contactos SET leido = 1 WHERE id = ?', [req.params.id])
    res.json({ message: 'Marcado como leído' })
  } catch (e) {
    res.status(500).json({ message: 'Error' })
  }
}

// ── Helpers de imágenes ──────────────────────────────────────
// Descarga un buffer crudo desde una URL (sin transformar)
const fetchRaw = async (url) => {
  if (!url) return null
  try {
    const https = require('https')
    const http  = require('http')
    return await new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http
      const r = protocol.get(url, { timeout: 10000 }, (res) => {
        const bufs = []
        res.on('data', c => bufs.push(c))
        res.on('end', () => resolve(Buffer.concat(bufs)))
      })
      r.on('error', (e) => { console.error('fetchRaw error:', url, e.message); resolve(null) })
      r.on('timeout', () => { console.error('fetchRaw timeout:', url); r.destroy(); resolve(null) })
    })
  } catch(e) { console.error('fetchRaw catch:', e.message); return null }
}

// Para imágenes de productos: fuerza JPEG vía Cloudinary (pdfkit no soporta webp)
const toJpgUrl = (url) => {
  if (!url || !url.includes('/upload/')) return url
  return url.replace('/upload/', '/upload/f_jpg,q_auto/')
}
const fetchProductImage = async (url) => fetchRaw(toJpgUrl(url))

// ── Generador PDF ─────────────────────────────────────────────
const BANNER_URL = 'https://res.cloudinary.com/db3hrbj6s/image/upload/v1781800861/lcprint/catalogo/lyu2fot10bdbapwwrkk8.png'
const LOGO_URL   = 'https://res.cloudinary.com/db3hrbj6s/image/upload/v1781800706/lcprint/catalogo/cilpzmdcljidzlukeppn.png'

const generarCatalogoPDF = async (req, res) => {
  try {
    const { tipo = 'completo', categoria_id, productos_ids } = req.body

    const [empresa] = await db.query('SELECT * FROM configuracion_empresa WHERE id = 1')
    const config = empresa[0] || {}

    let queryProds = `
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      JOIN categorias c ON p.categoria_id = c.id
      WHERE p.activo = 1`
    const params = []

    if (tipo === 'categoria' && categoria_id) {
      queryProds += ' AND p.categoria_id = ?'
      params.push(categoria_id)
    } else if (tipo === 'personalizado' && productos_ids?.length) {
      queryProds += ` AND p.id IN (${productos_ids.map(() => '?').join(',')})`
      params.push(...productos_ids)
    }
    queryProds += ' ORDER BY c.nombre, p.nombre'

    const [productos] = await db.query(queryProds, params)

    console.log('Descargando banner y logo (PNG original)...')
    const [bannerBuf, logoBuf] = await Promise.all([
      fetchRaw(BANNER_URL),
      fetchRaw(LOGO_URL),
    ])
    console.log('Banner:', bannerBuf ? bannerBuf.length + ' bytes' : 'NULL')
    console.log('Logo:', logoBuf ? logoBuf.length + ' bytes' : 'NULL')

    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="catalogo-lcprint-${Date.now()}.pdf"`)
      res.send(pdfBuffer)
    })

    const W        = 595.28
    const H        = 841.89
    const MARGIN   = 20
    const AMARILLO = '#F5C300'
    const AZUL     = '#00AEEF'
    const NEGRO    = '#1A1A1A'
    const GRIS     = '#555555'
    const HEADER_H = 140
    const LOGO_W   = 110

    const drawHeader = () => {
      // Clip estricto para que el banner nunca se salga del área del header
      doc.save()
      doc.rect(0, 0, W, HEADER_H).clip()

      if (bannerBuf) {
        try {
          doc.image(bannerBuf, 0, 0, {
            width: W,
            height: HEADER_H,
            cover: [W, HEADER_H],
            align: 'center',
            valign: 'center'
          })
        } catch(e) {
          console.error('Banner draw error:', e.message)
          doc.rect(0, 0, W, HEADER_H).fill('#003566')
        }
      } else {
        doc.rect(0, 0, W, HEADER_H).fill('#003566')
      }
      doc.restore()

      // Panel amarillo izquierdo con el logo, por ENCIMA del banner
      doc.rect(0, 0, LOGO_W, HEADER_H).fill(AMARILLO)
      if (logoBuf) {
        try {
          doc.image(logoBuf, 8, 8, { width: LOGO_W - 16, height: HEADER_H - 16, fit: [LOGO_W - 16, HEADER_H - 16], align: 'center', valign: 'center' })
        } catch(e) { console.error('Logo draw error:', e.message) }
      }

      // Overlay oscuro semitransparente solo detrás del texto, a la derecha del logo
      doc.save()
      doc.fillOpacity(0.55)
      doc.rect(LOGO_W, 0, W - LOGO_W, HEADER_H).fill('#001F3F')
      doc.restore()

      doc.font('Helvetica-Bold').fontSize(22).fillColor('white')
         .text('Catálogo de Productos', LOGO_W + 12, 45, { width: W - LOGO_W - 24 })
      doc.font('Helvetica').fontSize(10).fillColor('white')
         .text(`${config.nombre || 'LC Print SpA'} · ${new Date().toLocaleDateString('es-CL')}`, LOGO_W + 12, 78, { width: W - LOGO_W - 24 })

      // Franja gris de separación clara entre header y la grilla de productos
      doc.rect(0, HEADER_H, W, 8).fill('#F0F0F0')
    }

    const drawFooter = () => {
      doc.rect(0, H - 45, W, 45).fill(AMARILLO)

      if (logoBuf) {
        try {
          doc.image(logoBuf, MARGIN, H - 43, { height: 38, fit: [50, 38] })
        } catch(e) {}
      }

      const fx = 80
      const fy = H - 38
      doc.font('Helvetica-Bold').fontSize(8).fillColor(NEGRO)
         .text(
           config.direccion
             ? `${config.direccion}${config.ciudad ? ' - ' + config.ciudad : ''}`
             : 'Puente Alto, Santiago',
           fx, fy, { width: W - fx - MARGIN }
         )
      doc.font('Helvetica').fontSize(8).fillColor(NEGRO)
         .text(
           [config.telefono, config.email].filter(Boolean).join('   '),
           fx, fy + 13, { width: W - fx - MARGIN }
         )
    }

    const COLS      = 4
    const ROWS      = 2
    const PER_PAGE  = COLS * ROWS
    const FOOTER_H  = 45
    const GAP       = 10
    const SEP_H     = 8
    const CONTENT_H = H - HEADER_H - SEP_H - FOOTER_H - GAP * 3
    const CARD_W    = (W - MARGIN * 2 - (COLS - 1) * GAP) / COLS
    const CARD_H    = (CONTENT_H - GAP * (ROWS - 1)) / ROWS
    const IMG_H     = CARD_H * 0.56

    for (let i = 0; i < productos.length; i += PER_PAGE) {
      const grupo = productos.slice(i, i + PER_PAGE)
      doc.addPage()

      drawHeader()

      for (let j = 0; j < grupo.length; j++) {
        const prod = grupo[j]
        const col  = j % COLS
        const row  = Math.floor(j / COLS)
        const x    = MARGIN + col * (CARD_W + GAP)
        const y    = HEADER_H + SEP_H + GAP + row * (CARD_H + GAP)

        doc.rect(x, y, CARD_W, CARD_H).fill('white')

        const imgUrl = prod.imagen_thumb || prod.imagen_medium || prod.imagen_principal
        if (imgUrl) {
          const imgBuf = await fetchProductImage(imgUrl)
          if (imgBuf) {
            try {
              doc.image(imgBuf, x + 2, y + 2, {
                width: CARD_W - 4,
                height: IMG_H - 4,
                fit: [CARD_W - 4, IMG_H - 4],
                align: 'center',
                valign: 'center'
              })
            } catch(e) { console.error('Product img error:', prod.codigo, e.message) }
          } else {
            console.log('No image buffer for:', prod.codigo, imgUrl)
          }
        }

        doc.moveTo(x, y + IMG_H).lineTo(x + CARD_W, y + IMG_H)
           .strokeColor('#DDDDDD').lineWidth(0.5).stroke()

        const tY = y + IMG_H + 4
        const tW = CARD_W - 6

        doc.font('Helvetica-Bold').fontSize(7).fillColor(NEGRO)
           .text(prod.nombre.toUpperCase(), x + 3, tY, { width: tW, height: 22, ellipsis: true })

        doc.font('Helvetica').fontSize(6.5).fillColor(GRIS)
           .text(`SKU: ${prod.codigo}`, x + 3, tY + 24, { width: tW })

        const precio = prod.precio || 'Consultar'
        doc.font('Helvetica-Bold').fontSize(8).fillColor(AZUL)
           .text(`PRECIO: ${precio}`, x + 3, tY + 34, { width: tW })
      }

      drawFooter()
    }

    doc.end()
  } catch (e) {
    console.error('PDF generation error:', e)
    res.status(500).json({ message: 'Error al generar PDF' })
  }
}

module.exports = { enviarContacto, listarContactos, marcarLeido, generarCatalogoPDF }