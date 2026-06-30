const db = require('../config/db')

// Registrar visita
const registrarVisita = async (req, res) => {
  try {
    const { pagina, tipo = 'pagina', referrer = null } = req.body
    if (!pagina) return res.status(400).json({ message: 'Página requerida' })

    const ahora = new Date()
    const fecha = ahora.toISOString().split('T')[0]
    const hora  = ahora.getHours()

    await db.query(
      'INSERT INTO visitas (pagina, tipo, referrer, fecha, hora) VALUES (?,?,?,?,?)',
      [pagina, tipo, referrer || null, fecha, hora]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al registrar visita' })
  }
}

// Estadísticas para el dashboard
const getEstadisticas = async (req, res) => {
  try {
    const hoy     = new Date().toISOString().split('T')[0]
    const hace7   = new Date(Date.now() - 7  * 86400000).toISOString().split('T')[0]
    const hace30  = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

    // Visitas hoy / semana / mes
    const [[{ hoy: visitasHoy }]]    = await db.query('SELECT COUNT(*) as hoy   FROM visitas WHERE fecha = ?',          [hoy])
    const [[{ sem: visitasSem }]]    = await db.query('SELECT COUNT(*) as sem   FROM visitas WHERE fecha >= ?',         [hace7])
    const [[{ mes: visitasMes }]]    = await db.query('SELECT COUNT(*) as mes   FROM visitas WHERE fecha >= ?',         [hace30])

    // Visitas por día (últimos 14 días)
    const [porDia] = await db.query(`
      SELECT fecha, COUNT(*) as visitas
      FROM visitas
      WHERE fecha >= ?
      GROUP BY fecha
      ORDER BY fecha ASC
    `, [new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]])

    // Páginas más visitadas (últimos 30 días)
    const [topPaginas] = await db.query(`
      SELECT pagina, COUNT(*) as visitas
      FROM visitas
      WHERE fecha >= ?
      GROUP BY pagina
      ORDER BY visitas DESC
      LIMIT 8
    `, [hace30])

    // Visitas por hora hoy
    const [porHora] = await db.query(`
      SELECT hora, COUNT(*) as visitas
      FROM visitas
      WHERE fecha = ?
      GROUP BY hora
      ORDER BY hora ASC
    `, [hoy])

    // Contactos
    const [[{ total: contactosTotales }]]   = await db.query('SELECT COUNT(*) as total FROM contactos')
    const [[{ noLeidos }]]                  = await db.query('SELECT COUNT(*) as noLeidos FROM contactos WHERE leido = 0')
    const [[{ hoy: contactosHoy }]]         = await db.query('SELECT COUNT(*) as hoy FROM contactos WHERE DATE(created_at) = ?', [hoy])

    // Productos
    const [[{ total: totalProductos }]]     = await db.query('SELECT COUNT(*) as total FROM productos WHERE activo = 1')
    const [[{ sinImagen }]]                 = await db.query('SELECT COUNT(*) as sinImagen FROM productos WHERE activo = 1 AND imagen_principal IS NULL')
    const [[{ sinDesc }]]                   = await db.query('SELECT COUNT(*) as sinDesc FROM productos WHERE activo = 1 AND (descripcion_corta IS NULL OR descripcion_corta = "")')

    // Últimos contactos
    const [ultimosContactos] = await db.query(`
      SELECT id, nombre, email, mensaje, leido, created_at
      FROM contactos
      ORDER BY created_at DESC
      LIMIT 5
    `)

    res.json({
      visitas: { hoy: visitasHoy, semana: visitasSem, mes: visitasMes },
      porDia,
      topPaginas,
      porHora,
      contactos: { total: contactosTotales, noLeidos, hoy: contactosHoy },
      productos:  { total: totalProductos, sinImagen, sinDesc },
      ultimosContactos,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al obtener estadísticas' })
  }
}

module.exports = { registrarVisita, getEstadisticas }
