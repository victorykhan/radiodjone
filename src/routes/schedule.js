import express from 'express';
import prisma from '../db.js';
import { authenticateJWT, requireRole } from './auth.js';
import logger from '../logger.js';

const router = express.Router();

const MAX_ADVANCE_DAYS = 92; // ~3 months

// List schedule blocks (optional ?start=&end= ISO date filters)
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start) where.startTime = { gte: new Date(start) };
    if (end) where.endTime = { ...where.endTime, lte: new Date(end) };
    const blocks = await prisma.scheduleBlock.findMany({ where, orderBy: { startTime: 'asc' } });
    res.json(blocks);
  } catch (err) {
    logger.error('Failed to list schedule: %O', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Get currently active block
router.get('/current', async (req, res) => {
  try {
    const now = new Date();
    const block = await prisma.scheduleBlock.findFirst({
      where: { startTime: { lte: now }, endTime: { gte: now } },
      orderBy: { startTime: 'desc' }
    });
    res.json(block || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch current block' });
  }
});

// Create a schedule block
router.post('/', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  const { name, contentType, contentId, startTime, endTime, isRecurring = false, recurrenceDays, color } = req.body;
  const validTypes = ['PLAYLIST', 'CART'];
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!validTypes.includes(contentType)) return res.status(400).json({ error: `contentType must be one of: ${validTypes.join(', ')}` });
  if (!startTime || !endTime) return res.status(400).json({ error: 'startTime and endTime are required' });

  const start = new Date(startTime);
  const end = new Date(endTime);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + MAX_ADVANCE_DAYS);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid date format' });
  if (end <= start) return res.status(400).json({ error: 'endTime must be after startTime' });
  if (start > maxDate) return res.status(400).json({ error: `Cannot schedule more than ${MAX_ADVANCE_DAYS} days in advance` });

  try {
    const block = await prisma.scheduleBlock.create({
      data: {
        name,
        contentType,
        contentId: contentId ? parseInt(contentId) : null,
        startTime: start,
        endTime: end,
        isRecurring,
        recurrenceDays: recurrenceDays || null,
        color: color || '#00f0ff'
      }
    });
    res.status(201).json(block);
  } catch (err) {
    logger.error('Failed to create schedule block: %O', err);
    res.status(500).json({ error: 'Failed to create schedule block' });
  }
});

// Get single block
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const block = await prisma.scheduleBlock.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!block) return res.status(404).json({ error: 'Schedule block not found' });
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch block' });
  }
});

// Update block
router.put('/:id', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  const { name, contentType, contentId, startTime, endTime, isRecurring, recurrenceDays, color } = req.body;
  const validTypes = ['PLAYLIST', 'CART'];
  if (contentType && !validTypes.includes(contentType)) return res.status(400).json({ error: 'Invalid contentType' });

  const data = {};
  if (name) data.name = name;
  if (contentType) data.contentType = contentType;
  if (contentId !== undefined) data.contentId = contentId ? parseInt(contentId) : null;
  if (isRecurring !== undefined) data.isRecurring = isRecurring;
  if (recurrenceDays !== undefined) data.recurrenceDays = recurrenceDays;
  if (color) data.color = color;

  if (startTime) {
    const s = new Date(startTime);
    if (isNaN(s.getTime())) return res.status(400).json({ error: 'Invalid startTime' });
    data.startTime = s;
  }
  if (endTime) {
    const e = new Date(endTime);
    if (isNaN(e.getTime())) return res.status(400).json({ error: 'Invalid endTime' });
    data.endTime = e;
  }

  try {
    const block = await prisma.scheduleBlock.update({ where: { id: parseInt(req.params.id) }, data });
    res.json(block);
  } catch (err) {
    logger.error('Failed to update schedule block: %O', err);
    res.status(500).json({ error: 'Failed to update block' });
  }
});

// Delete block
router.delete('/:id', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  try {
    await prisma.scheduleBlock.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Schedule block deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete block' });
  }
});

export default router;
