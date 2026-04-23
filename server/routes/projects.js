import express from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
export const projectsRouter = express.Router();
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};
projectsRouter.get('/', auth, async (req, res) => {
  const result = await db.query('SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC', [req.user.userId]);
  res.json(result.rows);
});
projectsRouter.post('/', auth, async (req, res) => {
  const { id, name, company, activity, activity_description, currency, fiscal_year_end, status } = req.body;
  const result = await db.query(
    `INSERT INTO projects (id, user_id, name, company, activity, activity_description, currency, fiscal_year_end, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET name=$3,company=$4,activity=$5,activity_description=$6,updated_at=now() RETURNING *`,
    [id, req.user.userId, name, company, activity, activity_description, currency, fiscal_year_end, status||'active']);
  res.json(result.rows[0]);
});
projectsRouter.delete('/:id', auth, async (req, res) => {
  await db.query('DELETE FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
  res.json({ success: true });
});
projectsRouter.get('/:id/entries', auth, async (req, res) => {
  const result = await db.query('SELECT * FROM journal_entries WHERE project_id=$1 ORDER BY date DESC', [req.params.id]);
  res.json(result.rows);
});
projectsRouter.post('/:id/entries', auth, async (req, res) => {
  const entries = req.body;
  if (!Array.isArray(entries) || entries.length === 0) return res.json({ success: true, count: 0 });
  for (const e of entries) {
    await db.query(
      `INSERT INTO journal_entries (id,project_id,date,reference,description,account_code,account_name,debit,credit,is_validated,source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [e.id, req.params.id, e.date, e.reference, e.description, e.accountCode, e.accountName, e.debit||0, e.credit||0, e.isValidated||false, e.source]);
  }
  res.json({ success: true, count: entries.length });
});
projectsRouter.get('/:id/mappings', auth, async (req, res) => {
  const result = await db.query('SELECT * FROM account_mappings WHERE project_id=$1', [req.params.id]);
  res.json(result.rows);
});
projectsRouter.post('/:id/mappings', auth, async (req, res) => {
  const mappings = req.body;
  if (!Array.isArray(mappings)) return res.status(400).json({ error: 'Expected array' });
  for (const m of mappings) {
    await db.query(
      `INSERT INTO account_mappings (id,project_id,account_code,account_name,suggested_category,confirmed_category,is_mapped)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET confirmed_category=$6,is_mapped=$7`,
      [m.id, req.params.id, m.accountCode, m.accountName, m.suggestedCategory||'', m.confirmedCategory||'', m.isMapped||false]);
  }
  res.json({ success: true });
});
