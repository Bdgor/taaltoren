const express = require('express');
const connection = require('../../db');
const jwt = require('jsonwebtoken');

function isAdmin(req){
  try {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
      if (payload && payload.role === 'admin') return true;
    }
  } catch {}
  // fallback через заголовок x-admin-token
  if (process.env.ADMIN_PASSWORD && req.headers['x-admin-token'] === process.env.ADMIN_PASSWORD) return true;
  if (process.env.ADMIN_TOKEN && req.headers['x-admin-token'] === process.env.ADMIN_TOKEN) return true;
  return false;
}

function sentencesRouter() {
  const router = express.Router();

  // /api/sentences/random?level=A1
  router.get('/random', async (req, res) => {
    try {
      const level = req.query.level || 'A1';
      const [rows] = await connection.query(
        "SELECT id, text, level FROM sentences WHERE level=? ORDER BY RAND() LIMIT 1",
        [level]
      );
      if (!rows.length) return res.status(404).json({ ok:false, msg:'No sentences for level '+level });
      res.json({ ok:true, sentence: rows[0] });
    } catch (e) {
      console.error("sentences/random error", e);
      res.status(500).json({ ok:false, msg:'DB error' });
    }
  });

  // адмін: список
  router.get('/', async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ ok:false, msg:'forbidden' });
      const [rows] = await connection.query(
        "SELECT id, text, level, created_at FROM sentences ORDER BY id DESC"
      );
      res.json({ ok:true, items: rows });
    } catch (e) {
      console.error("sentences list error", e);
      res.status(500).json({ ok:false, msg:'DB error' });
    }
  });

  // адмін: створити
  router.post('/', async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ ok:false, msg:'forbidden' });
      const { text, level='A1' } = req.body || {};
      if (!text) return res.status(400).json({ ok:false, msg:'text required' });
      const [r] = await connection.query(
        "INSERT INTO sentences(text, level) VALUES (?,?)",
        [text, level]
      );
      res.json({ ok:true, id:r.insertId });
    } catch (e) {
      console.error("sentences create error", e);
      res.status(500).json({ ok:false, msg:'DB error' });
    }
  });

  // адмін: видалити
  router.delete('/:id', async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ ok:false, msg:'forbidden' });
      const id = Number(req.params.id);
      await connection.query("DELETE FROM sentences WHERE id=?", [id]);
      res.json({ ok:true });
    } catch (e) {
      console.error("sentences delete error", e);
      res.status(500).json({ ok:false, msg:'DB error' });
    }
  });

  return router;
}

module.exports = { sentencesRouter };
