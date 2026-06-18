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

    if (process.env.MAIL_USER && process.env.MAIL_PASS) {
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
    }

    res.json({ message: 'Mensaje enviado correctamente' })
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

// ── Helpers ───────────────────────────────────────────────────
const fetchImageBuffer = async (url) => {
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
      r.on('error', (e) => { console.error('fetchImage error:', url, e.message); resolve(null) })
      r.on('timeout', () => { console.error('fetchImage timeout:', url); r.destroy(); resolve(null) })
    })
  } catch(e) { console.error('fetchImage catch:', e.message); return null }
}

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

    console.log('Descargando banner y logo...')
    const [bannerBuf, logoBuf] = await Promise.all([
      fetchImageBuffer(BANNER_URL),
      fetchImageBuffer(LOGO_URL),
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
    const HEADER_H = 120

    const drawHeader = () => {
      // Fondo amarillo para zona del logo
      doc.rect(0, 0, 110, HEADER_H).fill(AMARILLO)

      // Logo en zona amarilla
      if (logoBuf) {
        try {
          doc.image(logoBuf, 5, 10, { width: 100, height: 100, fit: [100, 100] })
        } catch(e) { console.error('Logo draw error:', e.message) }
      }

      // Banner ocupa el resto del header
      if (bannerBuf) {
        try {
          doc.image(bannerBuf, 110, 0, {
            width: W - 110,
            height: HEADER_H,
            cover: [W - 110, HEADER_H]
          })
        } catch(e) { console.error('Banner draw error:', e.message) }
      } else {
        doc.rect(110, 0, W - 110, HEADER_H).fill('#003566')
      }

      // Texto sobre el banner
      doc.font('Helvetica-Bold').fontSize(24).fillColor('white')
         .text('Catálogo de Productos', 120, 35, { width: W - 140 })
      doc.font('Helvetica').fontSize(11).fillColor('white')
         .text(`${config.nombre || 'LC Print SpA'} · ${new Date().toLocaleDateString('es-CL')}`, 120, 68, { width: W - 140 })
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
    const PER_PAGE  = COLS * 2
    const FOOTER_H  = 45
    const GAP       = 5
    const CONTENT_H = H - HEADER_H - FOOTER_H - GAP * 3
    const CARD_W    = (W - MARGIN * 2 - (COLS - 1) * GAP) / COLS
    const CARD_H    = (CONTENT_H - GAP) / 2
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
        const y    = HEADER_H + GAP + row * (CARD_H + GAP)

        // Fondo tarjeta
        doc.rect(x, y, CARD_W, CARD_H).fill('white')

        // Imagen producto
        const imgUrl = prod.imagen_thumb || prod.imagen_medium || prod.imagen_principal
        if (imgUrl) {
          const imgBuf = await fetchImageBuffer(imgUrl)
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

        // Separador
        doc.moveTo(x, y + IMG_H).lineTo(x + CARD_W, y + IMG_H)
           .strokeColor('#DDDDDD').lineWidth(0.5).stroke()

        const tY = y + IMG_H + 4
        const tW = CARD_W - 6

        // Nombre
        doc.font('Helvetica-Bold').fontSize(7).fillColor(NEGRO)
           .text(prod.nombre.toUpperCase(), x + 3, tY, { width: tW, height: 22, ellipsis: true })

        // SKU
        doc.font('Helvetica').fontSize(6.5).fillColor(GRIS)
           .text(`SKU: ${prod.codigo}`, x + 3, tY + 24, { width: tW })

        // Precio
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