const db = require('../config/db')
const { processImageFull, deleteImage } = require('../config/upload')

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
    const { nombre, descripcion, orden = 0, parent_id = null } = req.body
    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' })

    if (parent_id) {
      const [padre] = await db.query('SELECT id FROM categorias WHERE id = ?', [parent_id])
      if (!padre.length) return res.status(400).json({ message: 'La categoría padre seleccionada no existe' })
    }

    const slug = slugify(nombre)
    const [exist] = await db.query('SELECT id FROM categorias WHERE slug = ?', [slug])
    if (exist.length) return res.status(400).json({ message: 'Ya existe una categoría con ese nombre' })

    const [r] = await db.query(
      'INSERT INTO categorias (nombre, slug, descripcion, orden, parent_id) VALUES (?,?,?,?,?)',
      [nombre, slug, descripcion || null, orden, parent_id || null]
    )
    const [nueva] = await db.query('SELECT * FROM categorias WHERE id = ?', [r.insertId])
    res.status(201).json(nueva[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al crear categoría' })
  }
}

const actualizar = async (req, res) => {
  try {
    const { nombre, descripcion, orden, activo, parent_id } = req.body
    const { id } = req.params

    const [exist] = await db.query('SELECT * FROM categorias WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Categoría no encontrada' })

    let nuevoParentId = exist[0].parent_id
    if (parent_id !== undefined) {
      if (parent_id && Number(parent_id) === Number(id))
        return res.status(400).json({ message: 'Una categoría no puede ser su propia categoría padre' })
      if (parent_id) {
        const [padre] = await db.query('SELECT id, parent_id FROM categorias WHERE id = ?', [parent_id])
        if (!padre.length) return res.status(400).json({ message: 'La categoría padre no existe' })
        if (padre[0].parent_id === Number(id))
          return res.status(400).json({ message: 'No puedes asignar como padre a una subcategoría de esta categoría' })
      }
      nuevoParentId = parent_id || null
    }

    // imagen_card — se sube por separado en la ruta /imagen-card
    const slug = nombre ? slugify(nombre) : exist[0].slug
    await db.query(
      'UPDATE categorias SET nombre=?, slug=?, descripcion=?, orden=?, activo=?, parent_id=? WHERE id=?',
      [nombre || exist[0].nombre, slug, descripcion ?? exist[0].descripcion,
       orden ?? exist[0].orden, activo ?? exist[0].activo, nuevoParentId, id]
    )
    const [updated] = await db.query('SELECT * FROM categorias WHERE id = ?', [id])
    res.json(updated[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al actualizar categoría' })
  }
}

const actualizarImagenCard = async (req, res) => {
  try {
    const { id } = req.params
    const [exist] = await db.query('SELECT * FROM categorias WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Categoría no encontrada' })
    if (!req.file) return res.status(400).json({ message: 'Imagen requerida' })

    if (exist[0].imagen_card) deleteImage(exist[0].imagen_card)
    const url = await processImageFull(req.file.buffer, 'categorias')
    await db.query('UPDATE categorias SET imagen_card = ? WHERE id = ?', [url, id])
    const [updated] = await db.query('SELECT * FROM categorias WHERE id = ?', [id])
    res.json(updated[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al actualizar imagen' })
  }
}

const eliminar = async (req, res) => {
  try {
    const [prods] = await db.query(
      'SELECT COUNT(*) as total FROM productos WHERE categoria_id = ?', [req.params.id]
    )
    if (prods[0].total > 0)
      return res.status(400).json({ message: 'No puedes eliminar una categoría con productos' })

    const [hijas] = await db.query(
      'SELECT COUNT(*) as total FROM categorias WHERE parent_id = ?', [req.params.id]
    )
    if (hijas[0].total > 0)
      return res.status(400).json({ message: 'No puedes eliminar una categoría que tiene subcategorías' })

    await db.query('DELETE FROM categorias WHERE id = ?', [req.params.id])
    res.json({ message: 'Categoría eliminada correctamente' })
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar categoría' })
  }
}

const eliminarImagenCard = async (req, res) => {
  try {
    const { id } = req.params
    const [exist] = await db.query('SELECT imagen_card FROM categorias WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Categoría no encontrada' })
    if (exist[0].imagen_card) deleteImage(exist[0].imagen_card)
    await db.query('UPDATE categorias SET imagen_card = NULL WHERE id = ?', [id])
    res.json({ message: 'Imagen eliminada' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al eliminar imagen' })
  }
}

module.exports = { listar, obtener, crear, actualizar, actualizarImagenCard, eliminarImagenCard, eliminar }