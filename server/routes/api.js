/**
 * ============================================
 * API ROUTES - Routes de l'API REST
 * Smart Parking - BTS CIEL IR
 * ============================================
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { generateToken, authenticateToken, requireAdmin } = require('../middleware/auth');

// ============================================
// AUTHENTIFICATION
// ============================================

/**
 * POST /api/register
 * Inscription d'un nouvel utilisateur
 */
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Tous les champs sont requis'
            });
        }

        // Vérifier si l'email existe déjà
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Cet email est déjà utilisé'
            });
        }

        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Créer l'utilisateur
        const result = await db.createUser(name, email, phone, hashedPassword, 'client');

        // Générer le token
        const user = await db.getUserById(result.id);
        const token = generateToken(user);

        res.status(201).json({
            success: true,
            message: 'Compte créé avec succès',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (err) {
        console.error('❌ Erreur register:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

/**
 * POST /api/login
 * Connexion
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email et mot de passe requis'
            });
        }

        // Récupérer l'utilisateur
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect'
            });
        }

        // Vérifier le mot de passe
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect'
            });
        }

        // Générer le token
        const token = generateToken(user);

        res.json({
            success: true,
            message: 'Connexion réussie',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (err) {
        console.error('❌ Erreur login:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// ============================================
// UTILISATEURS
// ============================================

/**
 * GET /api/users
 * Liste tous les utilisateurs (admin uniquement)
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (err) {
        console.error('❌ Erreur get users:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

/**
 * DELETE /api/users/:id
 * Supprime un utilisateur (admin uniquement)
 */
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.deleteUser(req.params.id);
        res.json({
            success: true,
            message: 'Utilisateur supprimé'
        });
    } catch (err) {
        console.error('❌ Erreur delete user:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// ============================================
// PLACES
// ============================================

/**
 * GET /api/spots
 * Liste toutes les places
 */
router.get('/spots', authenticateToken, async (req, res) => {
    try {
        const spots = await db.getAllSpots();
        res.json({
            success: true,
            count: spots.length,
            data: spots
        });
    } catch (err) {
        console.error('❌ Erreur get spots:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

/**
 * PUT /api/spots/:id/status
 * Met à jour le statut d'une place
 */
router.put('/spots/:id/status', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['free', 'occupied', 'reserved'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Statut invalide'
            });
        }

        await db.updateSpotStatus(req.params.id, status);
        
        // Ajouter à l'historique
        await db.addHistory('Mise à jour place', `Place ${req.params.id} - ${status}`, req.user.id);

        res.json({
            success: true,
            message: 'Statut mis à jour'
        });
    } catch (err) {
        console.error('❌ Erreur update spot:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

/**
 * POST /api/spots/init
 * Réinitialise les places (admin uniquement)
 */
router.post('/spots/init', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { count } = req.body;
        const spotCount = count || 10;

        // Supprimer les places existantes
        await db.deleteAllSpots();

        // Créer les nouvelles places
        for (let i = 1; i <= spotCount; i++) {
            let status = 'free';
            const rand = Math.random();
            if (rand > 0.85) status = 'reserved';
            else if (rand > 0.60) status = 'occupied';
            
            await db.createSpot(i, `SENSOR_${String(i).padStart(3, '0')}`, status);
        }

        await db.addHistory('Réinitialisation places', `${spotCount} places créées`, req.user.id);

        res.json({
            success: true,
            message: `${spotCount} places créées`
        });
    } catch (err) {
        console.error('❌ Erreur init spots:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// ============================================
// RÉSERVATIONS
// ============================================

/**
 * GET /api/reservations
 * Liste les réservations de l'utilisateur connecté
 */
router.get('/reservations', authenticateToken, async (req, res) => {
    try {
        const reservations = await db.getReservationsByUser(req.user.id);
        res.json({
            success: true,
            count: reservations.length,
            data: reservations
        });
    } catch (err) {
        console.error('❌ Erreur get reservations:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

/**
 * GET /api/reservations/all
 * Liste toutes les réservations (admin uniquement)
 */
router.get('/reservations/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reservations = await db.getAllReservations();
        res.json({
            success: true,
            count: reservations.length,
            data: reservations
        });
    } catch (err) {
        console.error('❌ Erreur get all reservations:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

/**
 * POST /api/reservations
 * Crée une nouvelle réservation
 */
router.post('/reservations', authenticateToken, async (req, res) => {
    try {
        const { spotId, date, startTime, endTime, duration, vehicle, price } = req.body;

        if (!spotId || !date || !startTime || !endTime || !duration || !price) {
            return res.status(400).json({
                success: false,
                message: 'Tous les champs sont requis'
            });
        }

        // Vérifier que la place est libre
        const spot = await db.getSpotById(spotId);
        if (!spot || spot.status !== 'free') {
            return res.status(409).json({
                success: false,
                message: 'Cette place n\'est plus disponible'
            });
        }

        // Générer un code de paiement
        const paymentCode = 'PARK' + Date.now().toString().slice(-8);

        // Créer la réservation
        const result = await db.createReservation(
            req.user.id,
            spotId,
            date,
            startTime,
            endTime,
            duration,
            vehicle,
            price,
            paymentCode
        );

        // Mettre à jour le statut de la place
        await db.updateSpotStatus(spotId, 'reserved');

        // Ajouter à l'historique
        await db.addHistory('Nouvelle réservation', `Place ${spot.number} - ${price}€`, req.user.id);

        res.status(201).json({
            success: true,
            message: 'Réservation créée',
            data: {
                id: result.id,
                paymentCode
            }
        });
    } catch (err) {
        console.error('❌ Erreur create reservation:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

/**
 * PUT /api/reservations/:id/cancel
 * Annule une réservation
 */
router.put('/reservations/:id/cancel', authenticateToken, async (req, res) => {
    try {
        await db.updateReservationStatus(req.params.id, 'cancelled');
        
        // TODO: Libérer la place associée
        
        res.json({
            success: true,
            message: 'Réservation annulée'
        });
    } catch (err) {
        console.error('❌ Erreur cancel reservation:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// ============================================
// STATISTIQUES
// ============================================

/**
 * GET /api/stats
 * Récupère les statistiques
 */
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const spots = await db.getAllSpots();
        const total = spots.length;
        const free = spots.filter(s => s.status === 'free').length;
        const occupied = spots.filter(s => s.status === 'occupied').length;
        const reserved = spots.filter(s => s.status === 'reserved').length;
        const occupancyRate = total > 0 ? Math.round(((occupied + reserved) / total) * 100) : 0;

        res.json({
            success: true,
            data: {
                total,
                free,
                occupied,
                reserved,
                occupancyRate
            }
        });
    } catch (err) {
        console.error('❌ Erreur get stats:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// ============================================
// HISTORIQUE
// ============================================

/**
 * GET /api/history
 * Récupère l'historique
 */
router.get('/history', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const history = await db.getHistory(limit);
        res.json({
            success: true,
            count: history.length,
            data: history
        });
    } catch (err) {
        console.error('❌ Erreur get history:', err.message);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// ============================================
// STATUS
// ============================================

/**
 * GET /api/status
 * Vérifie le statut du serveur
 */
router.get('/status', (req, res) => {
    res.json({
        success: true,
        message: 'Smart Parking API opérationnelle',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
