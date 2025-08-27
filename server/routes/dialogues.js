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
  if (process.env.ADMIN_PASSWORD && req.headers['x-admin-token'] === process.env.ADMIN_PASSWORD) return true;
  if (process.env.ADMIN_TOKEN && req.headers['x-admin-token'] === process.env.ADMIN_TOKEN) return true;
  return false;
}

function dialoguesRouter() {
  const router = express.Router();

  // публічний список
  router.get('/list', async (_req, res) => {
    try {
      const [rows] = await connection.query(
        "SELECT id, title, level, created_at FROM dialogues ORDER BY id DESC"
      );
      res.json({ ok:true, items: rows });
    } catch (e) {
      console.error("dialogues list error", e);
      res.status(500).json({ ok:false, msg:'DB error' });
    }
  });

  // отримати діалог
  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await connection.query(
        "SELECT id, title, level, body FROM dialogues WHERE id=?",
        [id]
      );
      if (!rows.length) return res.status(404).json({ ok:false, msg:'Not found' });
      const dlg = rows[0];
      try { dlg.body = JSON.parse(dlg.body); } catch {}
      res.json({ ok:true, dialogue: dlg });
    } catch (e) {
      console.error("dialogues get error", e);
      res.status(500).json({ ok:false, msg:'DB error' });
    }
  });

  // адмін: створити/оновити
  router.post('/', async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ ok:false, msg:'forbidden' });
      const { id, title, level='A1', body } = req.body || {};
      if (!title || !Array.isArray(body)) return res.status(400).json({ ok:false, msg:'title and body[] required' });
      const bodyJson = JSON.stringify(body);
      if (id) {
        await connection.query(
          "UPDATE dialogues SET title=?, level=?, body=? WHERE id=?",
          [title, level, bodyJson, id]
        );
        return res.json({ ok:true, id });
      } else {
        const [r] = await connection.query(
          "INSERT INTO dialogues(title, level, body) VALUES (?,?,?)",
          [title, level, bodyJson]
        );
        return res.json({ ok:true, id:r.insertId });
      }
    } catch (e) {
      console.error("dialogues save error", e);
      res.status(500).json({ ok:false, msg:'DB error' });
    }
  });

  // адмін: видалити
  router.delete('/:id', async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ ok:false, msg:'forbidden' });
      const id = Number(req.params.id);
      await connection.query("DELETE FROM dialogues WHERE id=?", [id]);
      res.json({ ok:true });
    } catch (e) {
      console.error("dialogues delete error", e);
      res.status(500).json({ ok:false, msg:'DB error' });
    }
  });

  return router;
}

module.exports = { dialoguesRouter };
