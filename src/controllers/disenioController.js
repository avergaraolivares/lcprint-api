const db = require('../config/db')

const getDisenio = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM configuracion_diseno WHERE id = 1')
    res.json(rows[0] || {})
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener configuración de diseño' })
  }
}

const updateDisenio = async (req, res) => {
  try {
    const {
      color_primario, color_secundario, color_acento, color_texto, color_fondo,
      fuente_principal, fuente_titulos, fuente_subtitulos,
      tamano_base, tamano_titulo, tamano_subtitulo, tamano_parrafo,
      radio_bordes
    } = req.body

    await db.query(
      `UPDATE configuracion_diseno SET
        color_primario=?, color_secundario=?, color_acento=?, color_texto=?, color_fondo=?,
        fuente_principal=?, fuente_titulos=?, fuente_subtitulos=?,
        tamano_base=?, tamano_titulo=?, tamano_subtitulo=?, tamano_parrafo=?,
        radio_bordes=?
       WHERE id=1`,
      [color_primario, color_secundario, color_acento, color_texto, color_fondo,
       fuente_principal, fuente_titulos, fuente_subtitulos,
       tamano_base, tamano_titulo, tamano_subtitulo, tamano_parrafo,
       radio_bordes]
    )

    const [updated] = await db.query('SELECT * FROM configuracion_diseno WHERE id = 1')
    res.json(updated[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al actualizar diseño' })
  }
}

module.exports = { getDisenio, updateDisenio }