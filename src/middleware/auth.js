const jwt = require('jsonwebtoken')

const auth = (req, res, next) => {
  const header = req.headers['authorization']
  if (!header) return res.status(401).json({ message: 'Token requerido' })

  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado' })
  }
}

const soloAdmin = (req, res, next) => {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ message: 'Acceso solo para administradores' })
  }
  next()
}

module.exports = { auth, soloAdmin }
