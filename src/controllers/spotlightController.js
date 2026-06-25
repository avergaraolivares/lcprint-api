const db = require('../config/db')

const getSpotlightProductos = async (req, res) => {
  try {
    const num = Number(req.query.num) || 1
    const [rows] = await db.query(`
      SELECT p.id, p.nombre, p.codigo, p.precio,
             p.imagen_thumb, p.imagen_principal,
             c.nombre as categoria_nombre
      FROM spotlight_productos sp
      JOIN productos p ON sp.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      WHERE p.activo = 1 AND sp.spotlight_num = ?
      ORDER BY sp.orden ASC
    `, [num])
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al obtener productos spotlight' })
  }
}

const setSpotlightProductos = async (req, res) => {
  try {
    const { producto_ids, spotlight_num = 1 } = req.body
    if (!Array.isArray(producto_ids))
      return res.status(400).json({ message: 'producto_ids debe ser un array' })

    await db.query('DELETE FROM spotlight_productos WHERE spotlight_num = ?', [spotlight_num])

    if (producto_ids.length > 0) {
      const values = producto_ids.slice(0, 3).map((id, i) => [id, i, spotlight_num])
      await db.query(
        'INSERT INTO spotlight_productos (producto_id, orden, spotlight_num) VALUES ?',
        [values]
      )
    }

    const [rows] = await db.query(`
      SELECT p.id, p.nombre, p.codigo, p.precio,
             p.imagen_thumb, p.imagen_principal,
             c.nombre as categoria_nombre
      FROM spotlight_productos sp
      JOIN productos p ON sp.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      WHERE sp.spotlight_num = ?
      ORDER BY sp.orden ASC
    `, [spotlight_num])
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al guardar productos spotlight' })
  }
}

module.exports = { getSpotlightProductos, setSpotlightProductos }
