import express from 'express';
import prisma from '../db.js';
import playoutEngine from '../playout/engine.js';
import { authenticateJWT, requireRole } from './auth.js';
import logger from '../logger.js';

const router = express.Router();

// List all carts
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const carts = await prisma.cart.findMany({
      include: { tracks: { orderBy: { position: 'asc' }, include: { track: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json(carts);
  } catch (err) {
    logger.error('Failed to list carts: %O', err);
    res.status(500).json({ error: 'Failed to fetch carts' });
  }
});

// Create a cart
router.post('/', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  const { name, type = 'JINGLE', description } = req.body;
  const validTypes = ['SWEEPER', 'STATION_ID', 'DROP', 'JINGLE', 'OTHER'];
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  try {
    const cart = await prisma.cart.create({ data: { name, type, description } });
    res.status(201).json(cart);
  } catch (err) {
    logger.error('Failed to create cart: %O', err);
    res.status(500).json({ error: 'Failed to create cart' });
  }
});

// Get single cart
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { tracks: { orderBy: { position: 'asc' }, include: { track: true } } }
    });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// Update cart
router.put('/:id', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  const { name, type, description } = req.body;
  const validTypes = ['SWEEPER', 'STATION_ID', 'DROP', 'JINGLE', 'OTHER'];
  if (type && !validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  try {
    const cart = await prisma.cart.update({
      where: { id: parseInt(req.params.id) },
      data: { ...(name && { name }), ...(type && { type }), ...(description !== undefined && { description }) }
    });
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

// Delete cart
router.delete('/:id', authenticateJWT, requireRole(['ADMIN']), async (req, res) => {
  try {
    await prisma.cart.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Cart deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete cart' });
  }
});

// Add track to cart
router.post('/:id/tracks', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  const cartId = parseInt(req.params.id);
  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({ error: 'trackId is required' });
  try {
    const cart = await prisma.cart.findUnique({ where: { id: cartId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    const track = await prisma.track.findUnique({ where: { id: parseInt(trackId) } });
    if (!track || track.isDeleted) return res.status(404).json({ error: 'Track not found' });
    const maxPos = await prisma.cartTrack.aggregate({ where: { cartId }, _max: { position: true } });
    const position = (maxPos._max.position ?? -1) + 1;
    const cartTrack = await prisma.cartTrack.create({
      data: { cartId, trackId: parseInt(trackId), position },
      include: { track: true }
    });
    res.status(201).json(cartTrack);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Track already in this cart' });
    logger.error('Failed to add track to cart: %O', err);
    res.status(500).json({ error: 'Failed to add track' });
  }
});

// Remove track from cart
router.delete('/:id/tracks/:trackId', authenticateJWT, requireRole(['ADMIN', 'PRODUCER']), async (req, res) => {
  try {
    await prisma.cartTrack.deleteMany({ where: { cartId: parseInt(req.params.id), trackId: parseInt(req.params.trackId) } });
    res.json({ message: 'Track removed from cart' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove track' });
  }
});

// Trigger cart — picks a random track from the cart
router.post('/:id/trigger', authenticateJWT, requireRole(['ADMIN', 'PRODUCER', 'DJ']), async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { tracks: { include: { track: true } } }
    });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    const available = cart.tracks.filter(ct => ct.track && !ct.track.isDeleted);
    if (available.length === 0) return res.status(400).json({ error: 'Cart has no tracks assigned' });
    const picked = available[Math.floor(Math.random() * available.length)];
    await playoutEngine.playCart(picked.track);
    res.json({ message: `Triggered cart "${cart.name}": "${picked.track.title}"`, trackId: picked.track.id });
  } catch (err) {
    logger.error('Failed to trigger cart: %O', err);
    res.status(500).json({ error: 'Failed to trigger cart' });
  }
});

export default router;
