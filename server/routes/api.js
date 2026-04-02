/**
 * ============================================
 * API ROUTES - Routes de l'API REST
 * Smart Parking v3.0
 * CORRIGÉ : réservation vérifie les conflits
 *           d'horaire au lieu de bloquer la place
 *           définitivement
 * ============================================
 */

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db/database');
const { generateToken, authenticateToken, requireAdmin } = require('../middleware/auth');

// ============================================
// AUTHENTIFICATION
// ============================================

router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
        if (await db.getUserByEmail(email))
            return res.status(409).json({ success: false, message: 'Cet email est déjà utilisé' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.createUser(name, email, phone, hashedPassword, 'client');
        const user   = await db.getUserById(result.id);
        const token  = generateToken(user);
        res.status(201).json({
            success: true, message: 'Compte créé avec succès', token,
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
        });
    } catch (err) {
        console.error('❌ Erreur register:', err.message);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
        const user = await db.getUserByEmail(email);
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        const token = generateToken(user);
        res.json({
            success: true, message: 'Connexion réussie', token,
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
        });
    } catch (err) {
        console.error('❌ Erreur login:', err.message);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ============================================
// UTILISATEURS
// ============================================

router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json({ success: true, count: users.length, data: users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.deleteUser(req.params.id);
        res.json({ success: true, message: 'Utilisateur supprimé' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ============================================
// PLACES
// ============================================

router.get('/spots', authenticateToken, async (req, res) => {
    try {
        const spots = await db.getAllSpots();
        res.json({ success: true, count: spots.length, data: spots });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.put('/spots/:id/status', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['free', 'occupied', 'reserved'].includes(status))
            return res.status(400).json({ success: false, message: 'Statut invalide' });
        await db.updateSpotStatus(req.params.id, status);
        await db.addHistory('Mise à jour place', `Place ${req.params.id} -> ${status}`, req.user.id);
        res.json({ success: true, message: 'Statut mis à jour' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.post('/spots/init', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const spotCount = Math.min(Math.max(parseInt(req.body.count) || 10, 5), 50);
        await db.deleteAllSpots();
        for (let i = 1; i <= spotCount; i++) {
            await db.createSpot(i, `SENSOR_${String(i).padStart(3, '0')}`, 'free');
        }
        await db.addHistory('Réinitialisation places', `${spotCount} places créées`, req.user.id);
        res.json({ success: true, message: `${spotCount} places créées` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ============================================
// RÉSERVATIONS
// ============================================

router.get('/reservations', authenticateToken, async (req, res) => {
    try {
        const reservations = await db.getReservationsByUser(req.user.id);
        res.json({ success: true, count: reservations.length, data: reservations });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.get('/reservations/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reservations = await db.getAllReservations();
        res.json({ success: true, count: reservations.length, data: reservations });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

/**
 * POST /api/reservations
 *
 * CORRIGÉ : on ne bloque plus la place entière définitivement.
 * On vérifie uniquement s'il y a un CONFLIT d'horaire sur
 * la même date et le même créneau.
 *
 * Exemple de ce qui est maintenant possible :
 *   Place 2 — 10h-11h aujourd'hui    ✅
 *   Place 2 — 14h-15h aujourd'hui    ✅ (pas de conflit)
 *   Place 2 — 10h-11h demain         ✅ (pas de conflit)
 *   Place 2 — 10h30-11h30 aujourd'hui ❌ (conflit !)
 */
router.post('/reservations', authenticateToken, async (req, res) => {
    try {
        const { spotId, date, startTime, endTime, duration, vehicle, price } = req.body;

        if (!spotId || !date || !startTime || !endTime || !duration || !price)
            return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });

        const spot = await db.getSpotById(spotId);
        if (!spot)
            return res.status(404).json({ success: false, message: 'Place introuvable' });

        // CORRIGÉ : bloquer uniquement si une voiture est physiquement là
        if (spot.status === 'occupied')
            return res.status(409).json({ success: false, message: "Une voiture est déjà sur cette place" });

        // CORRIGÉ : vérifier les conflits d'horaire au lieu du statut global
        const conflict = await db.checkReservationConflict(spotId, date, startTime, endTime);
        if (conflict)
            return res.status(409).json({
                success: false,
                message: `Cette place est déjà réservée sur ce créneau. Choisissez un autre horaire ou une autre date.`
            });

        const paymentCode = 'PARK' + Date.now().toString().slice(-8);
        const result = await db.createReservation(
            req.user.id, spotId, date, startTime, endTime, duration, vehicle, price, paymentCode
        );

        // On ne change le statut de la place QUE si la réservation est pour aujourd'hui
        // et que l'heure de début est maintenant ou dans moins de 30 minutes
        const now      = new Date();
        const today    = now.toISOString().split('T')[0];
        const resStart = new Date(`${date}T${startTime}`);
        const diffMin  = (resStart - now) / 60000;

        if (date === today && diffMin <= 30) {
            await db.updateSpotStatus(spotId, 'reserved');
        }
        // Pour une réservation future, le statut de la place reste inchangé
        // Le timer d'expiration (server.js) le mettra à jour au bon moment

        await db.addHistory(
            'Nouvelle réservation',
            `Place ${spot.number} réservée le ${date} de ${startTime} à ${endTime} — ${price}EUR`,
            req.user.id
        );

        res.status(201).json({
            success: true,
            message: 'Réservation créée',
            data: { id: result.id, paymentCode }
        });
    } catch (err) {
        console.error('❌ Erreur create reservation:', err.message);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

/**
 * PUT /api/reservations/:id/cancel
 */
router.put('/reservations/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const reservation = await db.getReservationById(req.params.id);
        if (!reservation)
            return res.status(404).json({ success: false, message: 'Réservation introuvable' });
        if (reservation.user_id !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Accès refusé' });

        await db.updateReservationStatus(req.params.id, 'cancelled');
        await db.updateSpotStatus(reservation.spot_id, 'free');
        await db.addHistory(
            'Annulation réservation',
            `Réservation #${req.params.id} annulée — place ${reservation.spot_number} libérée`,
            req.user.id
        );
        res.json({ success: true, message: 'Réservation annulée' });
    } catch (err) {
        console.error('❌ Erreur cancel reservation:', err.message);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

/**
 * PUT /api/reservations/:id/complete (admin)
 */
router.put('/reservations/:id/complete', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reservation = await db.getReservationById(req.params.id);
        if (!reservation)
            return res.status(404).json({ success: false, message: 'Réservation introuvable' });

        await db.updateReservationStatus(req.params.id, 'completed');
        await db.updateSpotStatus(reservation.spot_id, 'free');
        await db.addHistory(
            'Réservation terminée',
            `Réservation #${req.params.id} terminée — place ${reservation.spot_number} libérée`,
            req.user.id
        );
        res.json({ success: true, message: 'Réservation terminée' });
    } catch (err) {
        console.error('❌ Erreur complete reservation:', err.message);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ============================================
// STATISTIQUES
// ============================================

router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const spots        = await db.getAllSpots();
        const total        = spots.length;
        const free         = spots.filter(s => s.status === 'free').length;
        const occupied     = spots.filter(s => s.status === 'occupied').length;
        const reserved     = spots.filter(s => s.status === 'reserved').length;
        const occupancyRate = total > 0 ? Math.round(((occupied + reserved) / total) * 100) : 0;
        res.json({ success: true, data: { total, free, occupied, reserved, occupancyRate } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.get('/history', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit   = parseInt(req.query.limit) || 50;
        const history = await db.getHistory(limit);
        res.json({ success: true, count: history.length, data: history });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.get('/status', (_req, res) => {
    res.json({ success: true, message: 'Smart Parking API opérationnelle', version: '3.0.0', timestamp: new Date().toISOString() });
});

module.exports = router;