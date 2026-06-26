const db = require('../config/db')
const { processImageFull, deleteImage } = require('../config/upload')

const listar = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM banners WHERE activo = 1 ORDER BY orden ASC, id ASC'
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al obtener banners' })
  }
}

const listarAdmin = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM banners ORDER BY orden ASC, id ASC')
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener banners' })
  }
}

const crear = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'La imagen es requerida' })
    const { titulo, subtitulo, desc_texto, orden = 0 } = req.body
    const imagen = await processImageFull(req.file.buffer, 'banners')
    const [r] = await db.query(
      'INSERT INTO banners (imagen, titulo, subtitulo, desc_texto, orden) VALUES (?,?,?,?,?)',
      [imagen, titulo || null, subtitulo || null, desc_texto || null, orden]
    )
    const [nuevo] = await db.query('SELECT * FROM banners WHERE id = ?', [r.insertId])
    res.status(201).json(nuevo[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al crear banner' })
  }
}

const actualizar = async (req, res) => {
  try {
    const { id } = req.params
    const [exist] = await db.query('SELECT * FROM banners WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Banner no encontrado' })

    const { titulo, subtitulo, desc_texto, orden, activo } = req.body
    let imagen = exist[0].imagen

    if (req.file) {
      deleteImage(exist[0].imagen)
      imagen = await processImageFull(req.file.buffer, 'banners')
    }

    await db.query(
      'UPDATE banners SET imagen=?, titulo=?, subtitulo=?, desc_texto=?, orden=?, activo=? WHERE id=?',
      [imagen, titulo ?? exist[0].titulo, subtitulo ?? exist[0].subtitulo,
       desc_texto ?? exist[0].desc_texto, orden ?? exist[0].orden,
       activo ?? exist[0].activo, id]
    )
    const [updated] = await db.query('SELECT * FROM banners WHERE id = ?', [id])
    res.json(updated[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al actualizar banner' })
  }
}

const eliminar = async (req, res) => {
  try {
    const [exist] = await db.query('SELECT * FROM banners WHERE id = ?', [req.params.id])
    if (!exist.length) return res.status(404).json({ message: 'Banner no encontrado' })
    deleteImage(exist[0].imagen)
    await db.query('DELETE FROM banners WHERE id = ?', [req.params.id])
    res.json({ message: 'Banner eliminado' })
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar banner' })
  }
}

module.exports = { listar, listarAdmin, crear, actualizar, eliminar }
