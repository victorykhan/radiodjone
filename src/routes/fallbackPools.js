import express from 'express';
import prisma from '../db.js';
import { authenticateJWT, requireRole } from './auth.js';
import logger from '../logger.js';

const router = express.Router();

// List all pools ordered by priority
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const pools = await prisma.fallbackPool.findMany({
      include: { tracks: { orderBy: { position: 'asc' }, include: { track: true } } },
      orderBy: { priority: 'asc' }
    });
    res.json(pools);
  } catch (err) {
    logger.error('Failed to list fallback pools: %O', err);
    res.status(500).json({ error: 'Failed to fetch pools' });
  }
});

// Create a pool
router.post('/', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    // Priority = current max + 1 (appended to bottom of stack)
    const max = await prisma.fallbackPool.aggregate({ _max: { priority: true } });
    const priority = (max._max.priority ?? -1) + 1;
    const pool = await prisma.fallbackPool.create({ data: { name, description, priority } });
    res.status(201).json(pool);
  } catch (err) {
    logger.error('Failed to create pool: %O', err);
    res.status(500).json({ error: 'Failed to create pool' });
  }
});

// Get single pool
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const pool = await prisma.fallbackPool.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { tracks: { orderBy: { position: 'asc' }, include: { track: true } } }
    });
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    res.json(pool);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pool' });
  }
});

// Update pool name/description
router.put('/:id', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  const { name, description } = req.body;
  try {
    const pool = await prisma.fallbackPool.update({
      where: { id: parseInt(req.params.id) },
      data: { ...(name && { name }), ...(description !== undefined && { description }) }
    });
    res.json(pool);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update pool' });
  }
});

// Reorder pools — accepts ordered array of pool IDs, reassigns priority 0,1,2...
router.put('/reorder/priority', authenticateJWT, requireRole(['ADMIN']), async (req, res) => {
  const { orderedIds } = req.body; // [3, 1, 2]
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
  try {
    await Promise.all(orderedIds.map((id, idx) =>
      prisma.fallbackPool.update({ where: { id: parseInt(id) }, data: { priority: idx } })
    ));
    const pools = await prisma.fallbackPool.findMany({ orderBy: { priority: 'asc' } });
    res.json(pools);
  } catch (err) {
    logger.error('Failed to reorder pools: %O', err);
    res.status(500).json({ error: 'Failed to reorder pools' });
  }
});

// Delete pool (only if empty)
router.delete('/:id', authenticateJWT, requireRole(['ADMIN']), async (req, res) => {
  try {
    const count = await prisma.fallbackPoolTrack.count({ where: { poolId: parseInt(req.params.id) } });
    if (count > 0) return res.status(400).json({ error: `Cannot delete pool with ${count} track(s). Remove all tracks first.` });
    await prisma.fallbackPool.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Pool deleted' });
  } catch (err) {
    logger.error('Failed to delete pool: %O', err);
    res.status(500).json({ error: 'Failed to delete pool' });
  }
});

// Add track to pool
router.post('/:id/tracks', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  const poolId = parseInt(req.params.id);
  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({ error: 'trackId is required' });
  try {
    const pool = await prisma.fallbackPool.findUnique({ where: { id: poolId } });
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    const track = await prisma.track.findUnique({ where: { id: parseInt(trackId) } });
    if (!track || track.isDeleted) return res.status(404).json({ error: 'Track not found' });
    const maxPos = await prisma.fallbackPoolTrack.aggregate({ where: { poolId }, _max: { position: true } });
    const position = (maxPos._max.position ?? -1) + 1;
    const pt = await prisma.fallbackPoolTrack.create({
      data: { poolId, trackId: parseInt(trackId), position },
      include: { track: true }
    });
    res.status(201).json(pt);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Track already in this pool' });
    logger.error('Failed to add track to pool: %O', err);
    res.status(500).json({ error: 'Failed to add track' });
  }
});

// Remove track from pool
router.delete('/:id/tracks/:trackId', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  try {
    await prisma.fallbackPoolTrack.deleteMany({ where: { poolId: parseInt(req.params.id), trackId: parseInt(req.params.trackId) } });
    res.json({ message: 'Track removed from pool' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove track' });
  }
});

export default router;
