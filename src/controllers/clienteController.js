const db                            = require('../config/db')
const { processImage, deleteImage } = require('../config/upload')

const listar = async (req, res) => {
  try {
    const soloActivos = req.query.todos !== 'true'
    const where = soloActivos ? 'WHERE activo = 1' : ''
    const [rows] = await db.query(
      `SELECT * FROM clientes_destacados ${where} ORDER BY orden, nombre`
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener clientes' })
  }
}

const crear = async (req, res) => {
  try {
    const { nombre, orden = 0 } = req.body
    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' })

    let logo = null
    if (req.file) logo = await processImage(req.file.buffer, 'company', 400)

    const [r] = await db.query(
      'INSERT INTO clientes_destacados (nombre, logo, orden) VALUES (?,?,?)',
      [nombre, logo, orden]
    )
    const [nuevo] = await db.query('SELECT * FROM clientes_destacados WHERE id = ?', [r.insertId])
    res.status(201).json(nuevo[0])
  } catch (e) {
    res.status(500).json({ message: 'Error al crear cliente' })
  }
}

const actualizar = async (req, res) => {
  try {
    const { id } = req.params
    const [exist] = await db.query('SELECT * FROM clientes_destacados WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Cliente no encontrado' })

    const c = exist[0]
    const { nombre, orden, activo } = req.body

    let logo = c.logo
    if (req.file) {
      if (c.logo) deleteImage(c.logo)
      logo = await processImage(req.file.buffer, 'company', 400)
    }

    await db.query(
      'UPDATE clientes_destacados SET nombre=?, logo=?, orden=?, activo=? WHERE id=?',
      [nombre ?? c.nombre, logo, orden ?? c.orden, activo ?? c.activo, id]
    )
    const [updated] = await db.query('SELECT * FROM clientes_destacados WHERE id = ?', [id])
    res.json(updated[0])
  } catch (e) {
    res.status(500).json({ message: 'Error al actualizar cliente' })
  }
}

const eliminar = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clientes_destacados WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: 'Cliente no encontrado' })
    if (rows[0].logo) deleteImage(rows[0].logo)
    await db.query('DELETE FROM clientes_destacados WHERE id = ?', [req.params.id])
    res.json({ message: 'Cliente eliminado' })
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar cliente' })
  }
}

module.exports = { listar, crear, actualizar, eliminar }
