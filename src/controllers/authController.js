const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')
const db     = require('../config/db')

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

module.exports = { login, me, cambiarPassword }
