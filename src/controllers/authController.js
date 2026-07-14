const bcrypt     = require('bcryptjs')
const jwt        = require('jsonwebtoken')
const crypto     = require('crypto')
const nodemailer = require('nodemailer')
const db         = require('../config/db')

const login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ message: 'Email y contraseña requeridos' })

    const [rows] = await db.query(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email]
    )
    if (!rows.length)
      return res.status(401).json({ message: 'Credenciales incorrectas' })

    const usuario = rows[0]
    const valido  = await bcrypt.compare(password, usuario.password)
    if (!valido)
      return res.status(401).json({ message: 'Credenciales incorrectas' })

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '24h' }
    )

    res.json({
      token,
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error del servidor' })
  }
}

const me = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, email, rol FROM usuarios WHERE id = ?', [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' })
  }
}

const cambiarPassword = async (req, res) => {
  try {
    const { password_actual, password_nuevo } = req.body
    const [rows] = await db.query('SELECT password FROM usuarios WHERE id = ?', [req.user.id])
    if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado' })

    const valido = await bcrypt.compare(password_actual, rows[0].password)
    if (!valido) return res.status(400).json({ message: 'Contraseña actual incorrecta' })

    const hash = await bcrypt.hash(password_nuevo, 10)
    await db.query('UPDATE usuarios SET password = ? WHERE id = ?', [hash, req.user.id])
    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' })
  }
}

// Mismo transporte SMTP que ya usa contactoController.js — reutiliza las
// mismas variables de entorno (MAIL_HOST, MAIL_USER, MAIL_PASS, MAIL_FROM),
// ya configuradas en el .env del servidor.
const crearTransporter = () => nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.MAIL_PORT) || 587,
  // El puerto 465 requiere SSL implícito (secure: true); el 587 usa
  // STARTTLS (secure: false). Se determina automáticamente según el
  // puerto configurado, en vez de dejarlo fijo en false.
  secure: Number(process.env.MAIL_PORT) === 465,
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
})

/**
 * Solicita la recuperación de contraseña: genera un token, lo guarda
 * hasheado en password_resets, y envía un correo con el link.
 *
 * Por seguridad, siempre responde el mismo mensaje exista o no el
 * correo — así no se puede usar este endpoint para averiguar qué
 * correos administrativos existen.
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: 'El correo es requerido' })

    const [rows] = await db.query('SELECT id, nombre FROM usuarios WHERE email = ? AND activo = 1', [email])

    if (rows.length) {
      const usuario = rows[0]
      const tokenPlano = crypto.randomBytes(32).toString('hex')
      const tokenHash   = await bcrypt.hash(tokenPlano, 10)

      // Se reemplaza cualquier token anterior para ese correo, para que
      // solo el último link enviado sea válido.
      await db.query('DELETE FROM password_resets WHERE email = ?', [email])
      await db.query('INSERT INTO password_resets (email, token) VALUES (?, ?)', [email, tokenHash])

      const frontendUrl = (process.env.FRONTEND_URL || 'https://lcprint.cl').replace(/\/$/, '')
      const link = `${frontendUrl}/admin/reset-password?token=${tokenPlano}&email=${encodeURIComponent(email)}`

      if (process.env.MAIL_USER && process.env.MAIL_PASS) {
        try {
          const transporter = crearTransporter()
          await transporter.sendMail({
            from:    process.env.MAIL_FROM,
            to:      email,
            subject: 'Recuperación de contraseña — Panel LC Print',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <div style="background:#0a1628; padding: 24px; text-align:center; border-radius: 12px 12px 0 0;">
                  <h2 style="color:#fff; margin:0;">LC<span style="color:#00AEEF;">Print</span></h2>
                  <p style="color:#8ca3c7; font-size:12px; margin:4px 0 0;">Panel de administración</p>
                </div>
                <div style="padding: 24px; background:#fff; border: 1px solid #eee; border-top: none; border-radius: 0 0 12px 12px;">
                  <h3 style="color:#111827;">Recuperar tu contraseña</h3>
                  <p style="color:#4b5563; font-size:14px; line-height:1.6;">
                    Hola ${usuario.nombre},<br><br>
                    Recibimos una solicitud para restablecer la contraseña de tu cuenta en el panel de administración.
                  </p>
                  <div style="text-align:center; margin: 24px 0;">
                    <a href="${link}" style="background:#0a1628; color:#fff; padding: 12px 28px; border-radius: 8px; text-decoration:none; font-weight:bold; font-size:14px;">
                      Crear nueva contraseña
                    </a>
                  </div>
                  <p style="color:#9ca3af; font-size:12px;">
                    Este enlace es válido por 15 minutos. Si no solicitaste este cambio, puedes ignorar este correo.
                  </p>
                </div>
              </div>
            `
          })
        } catch (mailErr) {
          console.error('Error enviando email de recuperación:', mailErr.message)
        }
      }
    }

    res.json({ message: 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error del servidor' })
  }
}

/**
 * Confirma la recuperación: valida el token (comparándolo con el hash
 * guardado), verifica que no hayan pasado más de 15 minutos, y
 * actualiza la contraseña del usuario.
 */
const resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body
    if (!email || !token || !password)
      return res.status(400).json({ message: 'Todos los campos son requeridos' })
    if (password.length < 6)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' })

    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE email = ? ORDER BY created_at DESC LIMIT 1', [email]
    )
    if (!rows.length)
      return res.status(422).json({ message: 'El enlace de recuperación no es válido. Solicita uno nuevo.' })

    const registro = rows[0]
    const tokenValido = await bcrypt.compare(token, registro.token)
    if (!tokenValido)
      return res.status(422).json({ message: 'El enlace de recuperación no es válido. Solicita uno nuevo.' })

    const creado = new Date(registro.created_at)
    const minutosTranscurridos = (Date.now() - creado.getTime()) / 1000 / 60
    if (minutosTranscurridos > 15) {
      await db.query('DELETE FROM password_resets WHERE email = ?', [email])
      return res.status(422).json({ message: 'El enlace de recuperación expiró (válido por 15 minutos). Solicita uno nuevo.' })
    }

    const [usuarios] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email])
    if (!usuarios.length)
      return res.status(422).json({ message: 'No se encontró una cuenta con ese correo.' })

    const hash = await bcrypt.hash(password, 10)
    await db.query('UPDATE usuarios SET password = ? WHERE id = ?', [hash, usuarios[0].id])

    // El token es de un solo uso — se elimina tras usarlo.
    await db.query('DELETE FROM password_resets WHERE email = ?', [email])

    res.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error del servidor' })
  }
}

module.exports = { login, me, cambiarPassword, forgotPassword, resetPassword }