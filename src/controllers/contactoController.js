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

// ── Generador PDF ─────────────────────────────────────────────
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

    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="catalogo-lcprint-${Date.now()}.pdf"`)
      res.send(pdfBuffer)
    })

    const W = 595.28
    const H = 841.89
    const MARGIN = 40
    const AZUL = '#00AEEF'
    const TEXTO = '#1A1A1A'
    const SUBTEXTO = '#666666'

    // ── PORTADA ────────────────────────────────────────────────
    doc.addPage()
    doc.rect(0, 0, W, H * 0.55).fill(AZUL)
    doc.rect(0, H * 0.55, W, H * 0.45).fill('#FFFFFF')
    doc.rect(0, H * 0.52, W, 8).fill('#0077B6')

    doc.fillColor('white').font('Helvetica-Bold').fontSize(42)
       .text(config.nombre || 'LC Print SpA', MARGIN, 180, { align: 'center', width: W - MARGIN * 2 })
    doc.font('Helvetica').fontSize(18).fillColor('white')
       .text('Catálogo de Productos', MARGIN, 240, { align: 'center', width: W - MARGIN * 2 })
    doc.moveTo(W / 2 - 60, 275).lineTo(W / 2 + 60, 275).strokeColor('white').lineWidth(1).stroke()
    doc.font('Helvetica').fontSize(11).fillColor('white')
       .text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, MARGIN, 285, { align: 'center', width: W - MARGIN * 2 })

    const infoY = H * 0.60
    doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL)
       .text(config.nombre || 'LC Print SpA', MARGIN, infoY, { align: 'center', width: W - MARGIN * 2 })
    if (config.direccion) {
      doc.font('Helvetica').fontSize(11).fillColor(SUBTEXTO)
         .text(config.direccion + (config.ciudad ? ', ' + config.ciudad : ''), MARGIN, infoY + 25, { align: 'center', width: W - MARGIN * 2 })
    }
    if (config.email) {
      doc.font('Helvetica').fontSize(11).fillColor(SUBTEXTO)
         .text(config.email, MARGIN, infoY + 45, { align: 'center', width: W - MARGIN * 2 })
    }
    if (config.telefono) {
      doc.font('Helvetica').fontSize(11).fillColor(SUBTEXTO)
         .text(config.telefono, MARGIN, infoY + 65, { align: 'center', width: W - MARGIN * 2 })
    }
    doc.rect(W / 2 - 70, H * 0.82, 140, 36).fill(AZUL)
    doc.font('Helvetica-Bold').fontSize(12).fillColor('white')
       .text(`${productos.length} productos`, W / 2 - 70, H * 0.82 + 11, { align: 'center', width: 140 })

    // ── PÁGINAS DE PRODUCTOS ───────────────────────────────────
    const COLS = 2
    const PER_PAGE = COLS * 3
    const CARD_W = (W - MARGIN * 2 - 15) / 2
    const CARD_H = (H - 120 - 60) / 3
    const IMG_H = CARD_H * 0.48

    const fetchImage = async (url) => {
      if (!url) return null
      try {
        const https = require('https')
        const http  = require('http')
        return await new Promise((resolve) => {
          const protocol = url.startsWith('https') ? https : http
          const r = protocol.get(url, { timeout: 5000 }, (res) => {
            const bufs = []
            res.on('data', c => bufs.push(c))
            res.on('end', () => resolve(Buffer.concat(bufs)))
          })
          r.on('error', () => resolve(null))
          r.on('timeout', () => { r.destroy(); resolve(null) })
        })
      } catch { return null }
    }

    let pageNum = 0

    for (let i = 0; i < productos.length; i += PER_PAGE) {
      const grupo = productos.slice(i, i + PER_PAGE)
      pageNum++
      doc.addPage()

      // Header
      doc.rect(0, 0, W, 50).fill(AZUL)
      doc.font('Helvetica-Bold').fontSize(13).fillColor('white')
         .text(config.nombre || 'LC Print SpA', MARGIN, 17, { width: W / 2 - MARGIN })
      doc.font('Helvetica').fontSize(10).fillColor('white')
         .text('Catálogo de Productos', W / 2, 19, { width: W / 2 - MARGIN, align: 'right' })

      // Categoría
      const catNombre = grupo[0].categoria_nombre
      doc.rect(MARGIN, 58, W - MARGIN * 2, 24).fill('#EEF7FD')
      doc.font('Helvetica-Bold').fontSize(10).fillColor(AZUL)
         .text(catNombre.toUpperCase(), MARGIN + 10, 65)

      // Grilla
      for (let j = 0; j < grupo.length; j++) {
        const prod = grupo[j]
        const col  = j % COLS
        const row  = Math.floor(j / COLS)
        const x    = MARGIN + col * (CARD_W + 15)
        const y    = 90 + row * (CARD_H + 12)

        doc.rect(x, y, CARD_W, CARD_H).fill('white').stroke('#E8E8E8')

        const imgUrl = prod.imagen_medium || prod.imagen_principal
        if (imgUrl) {
          const imgBuffer = await fetchImage(imgUrl)
          if (imgBuffer) {
            try {
              doc.image(imgBuffer, x + 2, y + 2, {
                width: CARD_W - 4, height: IMG_H - 4,
                fit: [CARD_W - 4, IMG_H - 4],
                align: 'center', valign: 'center'
              })
            } catch {}
          }
        }

        doc.moveTo(x, y + IMG_H).lineTo(x + CARD_W, y + IMG_H).strokeColor('#E8E8E8').lineWidth(0.5).stroke()

        const textY = y + IMG_H + 8
        const textW = CARD_W - 16

        doc.rect(x + 8, textY, textW * 0.6, 14).fill('#EEF7FD')
        doc.font('Helvetica').fontSize(7).fillColor(AZUL)
           .text(prod.categoria_nombre, x + 10, textY + 3, { width: textW * 0.6 - 4 })

        doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXTO)
           .text(prod.nombre, x + 8, textY + 20, { width: textW, height: 28, ellipsis: true })

        doc.font('Helvetica').fontSize(8).fillColor(SUBTEXTO)
           .text(`Cód: ${prod.codigo}`, x + 8, textY + 52, { width: textW })

        if (prod.precio) {
          const precioColor = prod.precio === 'Consultar' ? SUBTEXTO : AZUL
          doc.font('Helvetica-Bold').fontSize(11).fillColor(precioColor)
             .text(prod.precio, x + 8, textY + 66, { width: textW })
        }
      }

      // Pie
      doc.rect(0, H - 30, W, 30).fill('#F0F0F0')
      doc.font('Helvetica').fontSize(8).fillColor(SUBTEXTO)
         .text(
           `${config.nombre || 'LC Print SpA'} · ${config.email || ''} · Página ${pageNum}`,
           MARGIN, H - 20, { align: 'center', width: W - MARGIN * 2 }
         )
    }

    doc.end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al generar PDF' })
  }
}

module.exports = { enviarContacto, listarContactos, marcarLeido, generarCatalogoPDF }