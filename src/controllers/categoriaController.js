const db = require('../config/db')

const slugify = (text) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-')

// Público
const listar = async (req, res) => {
  try {
    const soloActivas = req.query.todas !== 'true'
    const where = soloActivas ? 'WHERE c.activo = 1' : ''
    const [rows] = await db.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id AND p.activo = 1) as total_productos
       FROM categorias c
       ${where}
       ORDER BY c.orden, c.nombre`
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al obtener categorías' })
  }
}

const obtener = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categorias WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: 'Categoría no encontrada' })
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener categoría' })
  }
}

// Admin
const crear = async (req, res) => {
  try {
    const { nombre, descripcion, orden = 0 } = req.body
    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' })

    const slug = slugify(nombre)
    const [exist] = await db.query('SELECT id FROM categorias WHERE slug = ?', [slug])
    if (exist.length) return res.status(400).json({ message: 'Ya existe una categoría con ese nombre' })

    const [r] = await db.query(
      'INSERT INTO categorias (nombre, slug, descripcion, orden) VALUES (?,?,?,?)',
      [nombre, slug, descripcion || null, orden]
    )
    const [nueva] = await db.query('SELECT * FROM categorias WHERE id = ?', [r.insertId])
    res.status(201).json(nueva[0])
  } catch (e) {
    res.status(500).json({ message: 'Error al crear categoría' })
  }
}

const actualizar = async (req, res) => {
  try {
    const { nombre, descripcion, orden, activo } = req.body
    const { id } = req.params

    const [exist] = await db.query('SELECT * FROM categorias WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Categoría no encontrada' })

    const slug = nombre ? slugify(nombre) : exist[0].slug
    await db.query(
      'UPDATE categorias SET nombre=?, slug=?, descripcion=?, orden=?, activo=? WHERE id=?',
      [nombre || exist[0].nombre, slug, descripcion ?? exist[0].descripcion,
       orden ?? exist[0].orden, activo ?? exist[0].activo, id]
    )
    const [updated] = await db.query('SELECT * FROM categorias WHERE id = ?', [id])
    res.json(updated[0])
  } catch (e) {
    res.status(500).json({ message: 'Error al actualizar categoría' })
  }
}

const eliminar = async (req, res) => {
  try {
    const [prods] = await db.query(
      'SELECT COUNT(*) as total FROM productos WHERE categoria_id = ?', [req.params.id]
    )
    if (prods[0].total > 0)
      return res.status(400).json({ message: 'No puedes eliminar una categoría con productos' })

    await db.query('DELETE FROM categorias WHERE id = ?', [req.params.id])
    res.json({ message: 'Categoría eliminada correctamente' })
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar categoría' })
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar }