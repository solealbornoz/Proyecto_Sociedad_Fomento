const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const port = Number(process.env.PORT) || 3000;
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'talleres.sqlite'));
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, comentario TEXT NOT NULL, rating INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), taller TEXT NOT NULL, fecha TEXT NOT NULL, horario TEXT NOT NULL, UNIQUE(user_id, taller, fecha, horario));
CREATE TABLE IF NOT EXISTS cart (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), taller TEXT NOT NULL, fecha TEXT NOT NULL, horario TEXT NOT NULL, UNIQUE(user_id, taller, fecha, horario));`);
if (!db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n) {
  const insert = db.prepare('INSERT INTO reviews (nombre, comentario, rating) VALUES (?, ?, ?)');
  insert.run('María González', 'Excelente taller de fotografía, aprendí muchísimo!', 5);
  insert.run('Carlos López', 'La cerámica es mágica, muy buenos profesores.', 5);
  insert.run('Ana Martínez', 'Las velas aromáticas son hermosas, recomiendo 100%', 4);
}
const actividades = require('./actividades');
const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const catalogo = {};
for (const actividad of actividades) {
  actividad.categorias = actividad.categorias.map(([categoria, dia, horario], index) => {
    const id = `${actividad.id}-${index + 1}`;
    catalogo[id] = {nombre: actividad.nombre, icono: actividad.icono, categoria, dia, horario, precio: actividad.precio};
    return {id, categoria, dia, diaNombre: dias[dia], horario};
  });
}
// Las inscripciones anteriores siguen visibles y pueden cancelarse o quitarse.
Object.assign(catalogo, {
  fotografia: {nombre:'Fotografía Creativa (anterior)', categoria:'Taller anterior', precio:15000, legado:true},
  ceramica: {nombre:'Cerámica Artesanal (anterior)', categoria:'Taller anterior', precio:18000, legado:true},
  velas: {nombre:'Velas Aromáticas (anterior)', categoria:'Taller anterior', precio:12000, legado:true}
});
function fechaBarrio() {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Argentina/Buenos_Aires', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
}
function turnoValido(d) {
  const item = catalogo[d.taller];
  const date = typeof d.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? new Date(d.fecha + 'T12:00:00Z') : null;
  if (!item || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== d.fecha) return false;
  const today = new Date(fechaBarrio() + 'T12:00:00Z');
  const diff = (date - today) / 86400000;
  if (diff < 0 || diff >= 7) return false;
  return item.legado ? ['10:00','14:00','17:00'].includes(d.horario) : date.getUTCDay() === item.dia && d.horario === item.horario;
}
function detalle(item) { return {...item, ...(catalogo[item.taller] || {nombre:'Actividad anterior', categoria:'', precio:0, legado:true})}; }
function obtenerCarrito(userId) {
  return db.prepare('SELECT id, taller, fecha, horario FROM cart WHERE user_id = ? ORDER BY id').all(userId).map(detalle);
}
function send(res, status, body) { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body)); }
function session(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('session='))?.slice(8);
  return token && db.prepare('SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ? AND expires > ?').get(token, Date.now());
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10000) throw new Error('Datos demasiado extensos'); }
  return JSON.parse(raw || '{}');
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const user = session(req);
      if (url.pathname === '/api/actividades' && req.method === 'GET') return send(res, 200, {actividades, hoy:fechaBarrio()});
      if (url.pathname === '/api/session' && req.method === 'GET') return send(res, 200, { user: user || null });
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('session='))?.slice(8);
        if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return send(res, 200, {ok:true});
      }
      if (['/api/register', '/api/login'].includes(url.pathname) && req.method === 'POST') {
        const data = await body(req); const email = String(data.email || '').trim().toLowerCase(); const password = String(data.password || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) return send(res, 400, {error:'Ingresá un email válido y una contraseña de entre 8 y 128 caracteres.'});
        let account = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (url.pathname === '/api/register') {
          if (account) return send(res, 409, {error:'Ya existe una cuenta con ese email.'});
          const salt = crypto.randomBytes(16).toString('hex'); const hash = crypto.scryptSync(password, salt, 64).toString('hex');
          db.prepare('INSERT INTO users (email, salt, hash) VALUES (?, ?, ?)').run(email, salt, hash);
          account = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        } else if (!account || !crypto.timingSafeEqual(Buffer.from(account.hash, 'hex'), crypto.scryptSync(password, account.salt, 64))) return send(res, 401, {error:'Email o contraseña incorrectos.'});
        const token = crypto.randomBytes(32).toString('hex'); const age = data.recordar ? 30 * 86400 : 86400;
        db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(token, account.id, Date.now() + age * 1000);
        res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
        return send(res, 200, {user:{email:account.email}});
      }
      if (url.pathname === '/api/reviews' && req.method === 'GET') return send(res, 200, db.prepare('SELECT * FROM reviews ORDER BY id DESC').all());
      if (url.pathname === '/api/reviews' && req.method === 'POST') {
        const d = await body(req); const nombre = String(d.nombre || '').trim(); const comentario = String(d.comentario || '').trim(); const rating = Number(d.rating);
        if (!nombre || nombre.length > 80 || !comentario || comentario.length > 500 || !Number.isInteger(rating) || rating < 1 || rating > 5) return send(res, 400, {error:'Revisá el nombre, comentario y calificación.'});
        db.prepare('INSERT INTO reviews (nombre, comentario, rating) VALUES (?, ?, ?)').run(nombre, comentario, rating); return send(res, 201, {ok:true});
      }
      if ((url.pathname === '/api/cart' || url.pathname.startsWith('/api/cart/')) && !user) return send(res, 401, {error:'Iniciá sesión para usar el carrito.'});
      if (url.pathname === '/api/cart' && req.method === 'GET') {
        const items = obtenerCarrito(user.id);
        return send(res, 200, {items, total: items.reduce((total, item) => total + item.precio, 0)});
      }
      if (url.pathname === '/api/cart' && req.method === 'POST') {
        const d = await body(req);
        if (!turnoValido(d)) return send(res, 400, {error:'Seleccioná un turno disponible.'});
        if (db.prepare('SELECT id FROM bookings WHERE user_id = ? AND taller = ? AND fecha = ? AND horario = ?').get(user.id, d.taller, d.fecha, d.horario)) return send(res, 409, {error:'Ya tenés reservado ese turno.'});
        try { db.prepare('INSERT INTO cart (user_id, taller, fecha, horario) VALUES (?, ?, ?, ?)').run(user.id, d.taller, d.fecha, d.horario); }
        catch (e) { if (e.message.includes('UNIQUE constraint')) return send(res, 409, {error:'Ese turno ya está en tu carrito.'}); throw e; }
        return send(res, 201, {ok:true});
      }
      if (/^\/api\/cart\/\d+$/.test(url.pathname) && req.method === 'DELETE') {
        const result = db.prepare('DELETE FROM cart WHERE id = ? AND user_id = ?').run(Number(url.pathname.split('/').pop()), user.id);
        return send(res, result.changes ? 200 : 404, result.changes ? {ok:true} : {error:'Elemento no encontrado.'});
      }
      if (url.pathname === '/api/cart/checkout' && req.method === 'POST') {
        const items = obtenerCarrito(user.id);
        if (!items.length) return send(res, 400, {error:'Tu carrito está vacío.'});
        if (items.some(item => !turnoValido(item))) return send(res, 400, {error:'Hay turnos vencidos en el carrito. Eliminalos antes de confirmar.'});
        try {
          db.exec('BEGIN');
          const insert = db.prepare('INSERT INTO bookings (user_id, taller, fecha, horario) VALUES (?, ?, ?, ?)');
          for (const item of items) insert.run(user.id, item.taller, item.fecha, item.horario);
          db.prepare('DELETE FROM cart WHERE user_id = ?').run(user.id);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          if (e.message.includes('UNIQUE constraint')) return send(res, 409, {error:'Uno de los turnos ya está reservado. Eliminalo del carrito para continuar.'});
          throw e;
        }
        return send(res, 200, {ok:true, cantidad:items.length, total:items.reduce((total, item) => total + item.precio, 0)});
      }
      if (url.pathname === '/api/bookings' && !user) return send(res, 401, {error:'Iniciá sesión para gestionar tus turnos.'});
      if (url.pathname === '/api/bookings' && req.method === 'GET') return send(res, 200, db.prepare('SELECT id, taller, fecha, horario FROM bookings WHERE user_id = ? ORDER BY fecha, horario').all(user.id).map(detalle));
      if (url.pathname === '/api/bookings' && req.method === 'POST') {
        const d = await body(req);
        if (!turnoValido(d)) return send(res, 400, {error:'Seleccioná una actividad disponible.'});
        try { db.prepare('INSERT INTO bookings (user_id, taller, fecha, horario) VALUES (?, ?, ?, ?)').run(user.id, d.taller, d.fecha, d.horario); } catch (e) { if (e.code?.startsWith('SQLITE_CONSTRAINT') || e.message.includes('UNIQUE constraint')) return send(res, 409, {error:'Ya agendaste ese turno.'}); throw e; }
        return send(res, 201, {ok:true});
      }
      if (/^\/api\/bookings\/\d+$/.test(url.pathname) && req.method === 'DELETE') {
        if (!user) return send(res, 401, {error:'Iniciá sesión.'});
        const result = db.prepare('DELETE FROM bookings WHERE id = ? AND user_id = ?').run(Number(url.pathname.split('/').pop()), user.id);
        return send(res, result.changes ? 200 : 404, result.changes ? {ok:true} : {error:'Turno no encontrado.'});
      }
      return send(res, 404, {error:'Recurso no encontrado.'});
    }
    const files = {'/':'index.html','/index.html':'index.html','/login.html':'login.html','/dashboard.html':'dashboard.html','/styles.css':'styles.css','/barrio.css':'barrio.css','/script.js':'script.js'};
    const file = files[url.pathname]; if (!file || req.method !== 'GET') { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, {'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'}); fs.createReadStream(path.join(__dirname, file)).pipe(res);
  } catch (error) { console.error(error); send(res, 400, {error:'No se pudo procesar la solicitud.'}); }
});
server.listen(port, '0.0.0.0', () => console.log(`Sociedad de Fomento disponible en http://localhost:${port}`));
