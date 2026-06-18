const db     = require('../config/db')
const bcrypt = require('bcryptjs')

const listar = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY created_at DESC'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener usuarios' })
  }
}

const crear = async (req, res) => {
  try {
    const { nombre, email, password, rol = 'editor', activo = 1 } = req.body
    if (!nombre || !email || !password)
      return res.status(400).json({ message: 'Nombre, email y contraseña son requeridos' })
    if (password.length < 6)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' })

    const [exist] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email])
    if (exist.length) return res.status(400).json({ message: 'Ya existe un usuario con ese email' })

    const hash = await bcrypt.hash(password, 10)
    const [r]  = await db.query(
      'INSERT INTO usuarios (nombre, email, password, rol, activo) VALUES (?,?,?,?,?)',
      [nombre, email, hash, rol, activo]
    )
    const [nuevo] = await db.query(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?', [r.insertId]
    )
    res.status(201).json(nuevo[0])
  } catch (e) {
    res.status(500).json({ message: 'Error al crear usuario' })
  }
}

const actualizar = async (req, res) => {
  try {
    const { id } = req.params
    const [exist] = await db.query('SELECT * FROM usuarios WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Usuario no encontrado' })

    const { nombre, email, password, rol, activo } = req.body
    const u = exist[0]

    let hash = u.password
    if (password) {
      if (password.length < 6)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' })
      hash = await bcrypt.hash(password, 10)
    }

    // Verificar email duplicado
    if (email && email !== u.email) {
      const [dup] = await db.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, id])
      if (dup.length) return res.status(400).json({ message: 'Ya existe un usuario con ese email' })
    }

    await db.query(
      'UPDATE usuarios SET nombre=?, email=?, password=?, rol=?, activo=? WHERE id=?',
      [nombre ?? u.nombre, email ?? u.email, hash, rol ?? u.rol, activo ?? u.activo, id]
    )
    const [updated] = await db.query(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?', [id]
    )
    res.json(updated[0])
  } catch (e) {
    res.status(500).json({ message: 'Error al actualizar usuario' })
  }
}

const eliminar = async (req, res) => {
  try {
    const { id } = req.params
    if (Number(id) === req.user.id)
      return res.status(400).json({ message: 'No puedes eliminar tu propio usuario' })

    const [exist] = await db.query('SELECT id FROM usuarios WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Usuario no encontrado' })

    await db.query('DELETE FROM usuarios WHERE id = ?', [id])
    res.json({ message: 'Usuario eliminado correctamente' })
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar usuario' })
  }
}

module.exports = { listar, crear, actualizar, eliminar }
