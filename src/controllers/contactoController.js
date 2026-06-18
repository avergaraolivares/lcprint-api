const db         = require('../config/db')
const nodemailer = require('nodemailer')
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

    // Enviar email si está configurado
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

    // Obtener productos según tipo
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

    // Generar PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks = []

    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="catalogo-lcprint-${Date.now()}.pdf"`)
      res.send(pdfBuffer)
    })

    // ── Portada ────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#00AEEF')
    doc.fillColor('white')
       .fontSize(36).font('Helvetica-Bold')
       .text(config.nombre || 'LC Print SpA', 40, 200, { align: 'center' })
    doc.fontSize(18).font('Helvetica')
       .text('Catálogo de Productos', 40, 260, { align: 'center' })
    doc.fontSize(12)
       .text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, 40, 300, { align: 'center' })
    doc.fontSize(11)
       .text(config.email || 'ventas@lcprint.cl', 40, 340, { align: 'center' })
       .text(config.telefono || '', 40, 360, { align: 'center' })

    // ── Páginas de productos ───────────────────────────────────
    let categoriaActual = ''
    productos.forEach((prod, i) => {
      doc.addPage()
      doc.fillColor('#1A1A1A')

      // Encabezado categoría
      if (prod.categoria_nombre !== categoriaActual) {
        categoriaActual = prod.categoria_nombre
        doc.rect(40, 40, doc.page.width - 80, 30).fill('#00AEEF')
        doc.fillColor('white').fontSize(13).font('Helvetica-Bold')
           .text(categoriaActual, 50, 48)
        doc.fillColor('#1A1A1A')
      }

      const y = prod.categoria_nombre !== categoriaActual ? 80 : 80

      // Código y nombre
      doc.fontSize(10).font('Helvetica').fillColor('#888')
         .text(`Código: ${prod.codigo}`, 40, 90)
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1A1A1A')
         .text(prod.nombre, 40, 108)

      // Línea divisoria
      doc.moveTo(40, 132).lineTo(doc.page.width - 40, 132).strokeColor('#E5E5E5').stroke()

      // Descripción
      if (prod.descripcion_corta) {
        doc.fontSize(11).font('Helvetica').fillColor('#444')
           .text(prod.descripcion_corta, 40, 145, { width: doc.page.width - 80 })
      }

      // Características
      if (prod.caracteristicas) {
        try {
          const caract = typeof prod.caracteristicas === 'string'
            ? JSON.parse(prod.caracteristicas) : prod.caracteristicas
          const yCaract = doc.y + 15
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#00AEEF')
             .text('Características técnicas', 40, yCaract)
          const entries = Object.entries(caract)
          entries.forEach(([k, v], idx) => {
            const yRow = doc.y + 5
            if (idx % 2 === 0) doc.rect(40, yRow, doc.page.width - 80, 20).fill('#F5F5F5')
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#333')
               .text(k + ':', 50, yRow + 4, { width: 180, continued: true })
            doc.font('Helvetica').fillColor('#555').text(' ' + v)
          })
        } catch {}
      }

      // Pie de página
      doc.fontSize(9).fillColor('#AAA').font('Helvetica')
         .text(
           `${config.nombre || 'LC Print SpA'} · ${config.email || ''} · ${config.telefono || ''} — Pág. ${i + 1}`,
           40, doc.page.height - 40, { align: 'center', width: doc.page.width - 80 }
         )
    })

    doc.end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al generar PDF' })
  }
}

module.exports = { enviarContacto, listarContactos, marcarLeido, generarCatalogoPDF }
