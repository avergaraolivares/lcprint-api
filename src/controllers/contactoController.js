const db          = require('../config/db')
const nodemailer  = require('nodemailer')
const PDFDocument = require('pdfkit')

// ── Contacto ──────────────────────────────────────────────────
const enviarContacto = async (req, res) => {
  try {
    const { nombre, email, telefono, mensaje, recaptchaToken } = req.body
    if (!nombre || !email || !mensaje)
      return res.status(400).json({ message: 'Nombre, email y mensaje son requeridos' })

    // Verificar reCAPTCHA v3
    if (process.env.RECAPTCHA_SECRET) {
      if (!recaptchaToken)
        return res.status(400).json({ message: 'Verificación de seguridad requerida' })

      const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET}&response=${recaptchaToken}`
      const https = require('https')
      const captchaResult = await new Promise((resolve) => {
        https.get(verifyUrl, (r) => {
          let data = ''
          r.on('data', c => data += c)
          r.on('end', () => resolve(JSON.parse(data)))
        }).on('error', () => resolve({ success: false, score: 0 }))
      })

      // Score menor a 0.5 = probable bot
      if (!captchaResult.success || captchaResult.score < 0.5) {
        console.warn('reCAPTCHA rechazado:', captchaResult)
        return res.status(400).json({ message: 'Verificación de seguridad fallida. Intenta nuevamente.' })
      }
    }

    await db.query(
      'INSERT INTO contactos (nombre, email, telefono, mensaje) VALUES (?,?,?,?)',
      [nombre, email, telefono || null, mensaje]
    )

    // Responder inmediatamente — el email se envía en segundo plano sin bloquear
    res.json({ message: 'Mensaje enviado correctamente' })

    // [DIAGNÓSTICO TEMPORAL] — confirma en el log si las variables MAIL_*
    // llegan como se espera al proceso, antes de intentar el envío.
    console.error('[DEBUG contacto] MAIL_USER presente:', !!process.env.MAIL_USER, '| MAIL_PASS presente:', !!process.env.MAIL_PASS, '| MAIL_HOST:', process.env.MAIL_HOST, '| MAIL_PORT:', process.env.MAIL_PORT)

    if (process.env.MAIL_USER && process.env.MAIL_PASS) {
      try {
        console.error('[DEBUG contacto] Intentando conectar a SMTP...')
        const transporter = nodemailer.createTransport({
          host: process.env.MAIL_HOST || 'smtp.gmail.com',
          port: Number(process.env.MAIL_PORT) || 587,
          // El puerto 465 requiere SSL implícito (secure: true); el 587
          // usa STARTTLS (secure: false) — se determina según el puerto.
          secure: Number(process.env.MAIL_PORT) === 465,
          auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
        })
        await transporter.sendMail({
          from:    process.env.MAIL_FROM,
          to:      process.env.MAIL_TO,
          subject: `Nuevo contacto de ${nombre} — LC Print`,
          html: `
            <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; background:#f4f5f7; padding: 24px 16px;">
              <div style="background:#ffffff; border-radius: 12px; overflow: hidden;">

                <div style="background:#0a1628; padding: 28px 32px; text-align:center;">
                  <div style="color:#ffffff; font-size: 20px; font-weight: 700;">
                    LC<span style="color:#00AEEF;">Print</span>
                  </div>
                  <div style="color:#8ca3c7; font-size: 12px; margin-top: 4px;">Nuevo mensaje de contacto</div>
                </div>

                <div style="padding: 28px 32px;">
                  <p style="font-size: 14px; color:#4b5563; margin: 0 0 20px;">
                    Recibiste un nuevo mensaje a través del formulario de contacto de <strong>lcprint.cl</strong>.
                  </p>

                  <table role="presentation" width="100%" style="border-collapse: collapse; margin-bottom: 20px;">
                    <tr>
                      <td style="padding: 10px 0; border-bottom: 1px solid #eef0f3; width: 90px; vertical-align: top;">
                        <span style="font-size: 12px; color:#9ca3af; text-transform: uppercase; letter-spacing: 0.03em;">Nombre</span>
                      </td>
                      <td style="padding: 10px 0; border-bottom: 1px solid #eef0f3;">
                        <span style="font-size: 14px; color:#111827; font-weight: 600;">${nombre}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; border-bottom: 1px solid #eef0f3; vertical-align: top;">
                        <span style="font-size: 12px; color:#9ca3af; text-transform: uppercase; letter-spacing: 0.03em;">Email</span>
                      </td>
                      <td style="padding: 10px 0; border-bottom: 1px solid #eef0f3;">
                        <a href="mailto:${email}" style="font-size: 14px; color:#0a1628; font-weight: 600; text-decoration:none;">${email}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; border-bottom: 1px solid #eef0f3; vertical-align: top;">
                        <span style="font-size: 12px; color:#9ca3af; text-transform: uppercase; letter-spacing: 0.03em;">Teléfono</span>
                      </td>
                      <td style="padding: 10px 0; border-bottom: 1px solid #eef0f3;">
                        <span style="font-size: 14px; color:#111827;">${telefono || 'No indicado'}</span>
                      </td>
                    </tr>
                  </table>

                  <div style="background:#f9fafb; border: 1px solid #eef0f3; border-radius: 8px; padding: 16px 18px; margin-bottom: 24px;">
                    <div style="font-size: 12px; color:#9ca3af; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 6px;">Mensaje</div>
                    <div style="font-size: 14px; color:#374151; line-height: 1.6; white-space: pre-wrap;">${mensaje}</div>
                  </div>

                  <div style="text-align:center;">
                    <a href="mailto:${email}?subject=Re: Consulta a LC Print"
                       style="display:inline-block; padding: 12px 28px; background:#0a1628; color:#ffffff; font-size: 14px; font-weight: 600; text-decoration:none; border-radius: 8px;">
                      Responder a ${nombre}
                    </a>
                  </div>
                </div>

                <div style="padding: 16px 32px; background:#f9fafb; border-top: 1px solid #eef0f3; text-align:center;">
                  <div style="font-size: 11px; color:#9ca3af;">Este mensaje fue enviado desde el formulario de contacto de lcprint.cl</div>
                </div>

              </div>
            </div>
          `
        })
        console.error('[DEBUG contacto] Correo enviado exitosamente')
      } catch (mailErr) {
        console.error('[DEBUG contacto] Error enviando email de notificación:', mailErr)
      }
    } else {
      console.error('[DEBUG contacto] Bloque de envío OMITIDO — falta MAIL_USER o MAIL_PASS')
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
  return url.replace('/upload/', '/upload/f_jpg,q_auto,w_300,c_limit/')
}
const fetchProductImage = async (url) => fetchRaw(toJpgUrl(url))

// Descarga en paralelo con limite de concurrencia (evita saturar red/Cloudinary)
const fetchAllImages = async (urls, concurrencia = 10) => {
  const resultados = new Map()
  let idx = 0
  const worker = async () => {
    while (idx < urls.length) {
      const i = idx++
      const url = urls[i]
      if (url && !resultados.has(url)) {
        resultados.set(url, await fetchProductImage(url))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, urls.length) }, worker))
  return resultados
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

    console.log('Descargando banner y logo (PNG original)...')
    const [bannerBuf, logoBuf] = await Promise.all([
      fetchRaw(BANNER_URL),
      fetchRaw(LOGO_URL),
    ])

    // Pre-descargar TODAS las imagenes de productos en paralelo (10 a la vez)
    console.time('descarga imagenes')
    const urlsImgs = productos.map(p => p.imagen_thumb || p.imagen_medium || p.imagen_principal).filter(Boolean)
    const imagenes = await fetchAllImages(urlsImgs, 10)
    console.timeEnd('descarga imagenes')
    console.log(`Imagenes descargadas: ${[...imagenes.values()].filter(Boolean).length}/${urlsImgs.length}`)
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
          const imgBuf = imagenes.get(imgUrl)
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

const eliminarContacto = async (req, res) => {
  try {
    await db.query('DELETE FROM contactos WHERE id = ?', [req.params.id])
    res.json({ message: 'Mensaje eliminado' })
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar' })
  }
}

module.exports = { enviarContacto, listarContactos, marcarLeido, eliminarContacto, generarCatalogoPDF }