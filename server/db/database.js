/**
 * ============================================
 * DATABASE.JS - Gestion MariaDB
 * Smart Parking v2.0
 * AJOUTÉ : expireReservations() — libère auto les places
 * ============================================
 */

const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    port:               process.env.DB_PORT     || 3306,
    user:               process.env.DB_USER     || 'smartparking_user',
    password:           process.env.DB_PASSWORD || 'smartparking_pass',
    database:           process.env.DB_NAME     || 'smartparking',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0
});

// ============================================
// INITIALISATION
// ============================================

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                name       VARCHAR(255) NOT NULL,
                email      VARCHAR(255) UNIQUE NOT NULL,
                phone      VARCHAR(50),
                password   VARCHAR(255) NOT NULL,
                role       ENUM('admin','client') DEFAULT 'client',
                status     ENUM('active','inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS spots (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                number      INT UNIQUE NOT NULL,
                status      ENUM('free','occupied','reserved') DEFAULT 'free',
                sensor_id   VARCHAR(100),
                last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                user_id      INT NOT NULL,
                spot_id      INT NOT NULL,
                date         DATE NOT NULL,
                start_time   TIME NOT NULL,
                end_time     TIME NOT NULL,
                duration     INT NOT NULL,
                vehicle      VARCHAR(20),
                price        DECIMAL(10,2) NOT NULL,
                status       ENUM('pending','active','completed','cancelled') DEFAULT 'pending',
                payment_code VARCHAR(50),
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (spot_id) REFERENCES spots(id)  ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS history (
                id        INT AUTO_INCREMENT PRIMARY KEY,
                action    VARCHAR(255) NOT NULL,
                details   TEXT,
                user_id   INT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                total_spots    INT,
                free_spots     INT,
                occupied_spots INT,
                reserved_spots INT,
                occupancy_rate DECIMAL(5,2),
                recorded_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS mqtt_events (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                topic       VARCHAR(255) NOT NULL,
                message     TEXT,
                received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Tables vérifiées/créées');

        // Admin par défaut
        const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', ['admin@smartparking.fr']);
        if (rows.length === 0) {
            const hashed = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
                ['Administrateur', 'admin@smartparking.fr', '01 23 45 67 89', hashed, 'admin']
            );
            console.log('✅ Admin par défaut créé');
        }

        // 10 places par défaut
        const [spots] = await pool.query('SELECT COUNT(*) AS count FROM spots');
        if (spots[0].count === 0) {
            for (let i = 1; i <= 10; i++) {
                await pool.query(
                    'INSERT INTO spots (number, sensor_id, status) VALUES (?, ?, ?)',
                    [i, `SENSOR_${String(i).padStart(3, '0')}`, 'free']
                );
            }
            console.log('✅ 10 places créées (toutes libres)');
        }

    } catch (err) {
        console.error("❌ Erreur init base :", err.message);
        throw err;
    }
}

// ============================================
// UTILISATEURS
// ============================================

async function createUser(name, email, phone, hashedPassword, role = 'client') {
    const [result] = await pool.query(
        'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
        [name, email, phone, hashedPassword, role]
    );
    return { id: result.insertId };
}

async function getUserByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0];
}

async function getUserById(id) {
    const [rows] = await pool.query(
        'SELECT id, name, email, phone, role, status, created_at FROM users WHERE id = ?',
        [id]
    );
    return rows[0];
}

async function getAllUsers() {
    const [rows] = await pool.query(
        'SELECT id, name, email, phone, role, status, created_at FROM users ORDER BY name'
    );
    return rows;
}

async function updateUser(id, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const [result] = await pool.query(
        `UPDATE users SET ${fields} WHERE id = ?`,
        [...Object.values(updates), id]
    );
    return { changed: result.affectedRows };
}

async function deleteUser(id) {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return { deleted: result.affectedRows };
}

// ============================================
// PLACES
// ============================================

async function createSpot(number, sensorId, status = 'free') {
    const [result] = await pool.query(
        'INSERT INTO spots (number, sensor_id, status) VALUES (?, ?, ?)',
        [number, sensorId, status]
    );
    return { id: result.insertId };
}

async function getAllSpots() {
    const [rows] = await pool.query('SELECT * FROM spots ORDER BY number');
    return rows;
}

async function getSpotById(id) {
    const [rows] = await pool.query('SELECT * FROM spots WHERE id = ?', [id]);
    return rows[0];
}

async function updateSpotStatus(id, status) {
    const [result] = await pool.query(
        'UPDATE spots SET status = ?, last_update = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id]
    );
    return { changed: result.affectedRows };
}

async function deleteAllSpots() {
    const [result] = await pool.query('DELETE FROM spots');
    return { deleted: result.affectedRows };
}

// ============================================
// RÉSERVATIONS
// ============================================

async function createReservation(userId, spotId, date, startTime, endTime, duration, vehicle, price, paymentCode) {
    const [result] = await pool.query(
        `INSERT INTO reservations
         (user_id, spot_id, date, start_time, end_time, duration, vehicle, price, payment_code, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [userId, spotId, date, startTime, endTime, duration, vehicle, price, paymentCode]
    );
    return { id: result.insertId };
}

async function getReservationById(id) {
    const [rows] = await pool.query(
        `SELECT r.*, s.number AS spot_number
         FROM reservations r
         JOIN spots s ON r.spot_id = s.id
         WHERE r.id = ?`,
        [id]
    );
    return rows[0];
}

async function getReservationsByUser(userId) {
    const [rows] = await pool.query(
        `SELECT r.*, s.number AS spot_number
         FROM reservations r
         JOIN spots s ON r.spot_id = s.id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC`,
        [userId]
    );
    return rows;
}

async function getAllReservations() {
    const [rows] = await pool.query(
        `SELECT r.*, s.number AS spot_number, u.name AS user_name
         FROM reservations r
         JOIN spots s ON r.spot_id = s.id
         JOIN users u ON r.user_id = u.id
         ORDER BY r.created_at DESC`
    );
    return rows;
}

async function updateReservationStatus(id, status) {
    const [result] = await pool.query(
        'UPDATE reservations SET status = ? WHERE id = ?',
        [status, id]
    );
    return { changed: result.affectedRows };
}

/**
 * ⭐ NOUVELLE FONCTION — Expiration automatique des réservations
 *
 * Cherche toutes les réservations actives dont la date+heure de fin
 * est déjà dépassée, les passe en "completed" et libère les places.
 *
 * Appelée toutes les 60 secondes par server.js.
 * Cela résout le problème des places qui restent "réservées" indéfiniment.
 */
async function expireReservations() {
    // Trouver les réservations actives dont l'heure de fin est passée
    const [expiredRows] = await pool.query(`
        SELECT r.id, r.spot_id, r.user_id, s.number AS spot_number
        FROM reservations r
        JOIN spots s ON r.spot_id = s.id
        WHERE r.status = 'active'
          AND TIMESTAMP(r.date, r.end_time) < NOW()
    `);

    for (const res of expiredRows) {
        // Passer la réservation en "completed"
        await pool.query(
            "UPDATE reservations SET status = 'completed' WHERE id = ?",
            [res.id]
        );

        // Libérer la place (la passer en "free")
        // (le capteur Arduino prendra le relais ensuite si une voiture est encore là)
        await pool.query(
            "UPDATE spots SET status = 'free', last_update = NOW() WHERE id = ?",
            [res.spot_id]
        );

        // Ajouter à l'historique
        await pool.query(
            'INSERT INTO history (action, details, user_id) VALUES (?, ?, ?)',
            [
                'Expiration réservation',
                `Réservation #${res.id} expirée — place ${res.spot_number} libérée automatiquement`,
                res.user_id
            ]
        );
    }

    return expiredRows.length;
}

// ============================================
// HISTORIQUE
// ============================================

async function addHistory(action, details, userId = null) {
    const [result] = await pool.query(
        'INSERT INTO history (action, details, user_id) VALUES (?, ?, ?)',
        [action, details, userId]
    );
    return { id: result.insertId };
}

async function getHistory(limit = 50) {
    const [rows] = await pool.query(
        `SELECT h.*, u.name AS user_name
         FROM history h
         LEFT JOIN users u ON h.user_id = u.id
         ORDER BY h.timestamp DESC
         LIMIT ?`,
        [limit]
    );
    return rows;
}

// ============================================
// STATISTIQUES
// ============================================

async function recordStats(total, free, occupied, reserved) {
    const rate = total > 0 ? Math.round(((occupied + reserved) / total) * 100) : 0;
    const [result] = await pool.query(
        'INSERT INTO stats (total_spots, free_spots, occupied_spots, reserved_spots, occupancy_rate) VALUES (?, ?, ?, ?, ?)',
        [total, free, occupied, reserved, rate]
    );
    return { id: result.insertId };
}

async function getStats(days = 7) {
    const [rows] = await pool.query(
        `SELECT * FROM stats
         WHERE recorded_at > DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY recorded_at DESC`,
        [days]
    );
    return rows;
}

// ============================================
// MQTT EVENTS
// ============================================

async function recordMqttEvent(topic, message) {
    const [result] = await pool.query(
        'INSERT INTO mqtt_events (topic, message) VALUES (?, ?)',
        [topic, message]
    );
    return { id: result.insertId };
}

// ============================================
// FERMETURE
// ============================================

async function closeDatabase() {
    await pool.end();
    console.log('🔌 Connexions base fermées');
}

module.exports = {
    pool,
    initDatabase,
    closeDatabase,
    // Utilisateurs
    createUser, getUserByEmail, getUserById, getAllUsers, updateUser, deleteUser,
    // Places
    createSpot, getAllSpots, getSpotById, updateSpotStatus, deleteAllSpots,
    // Réservations
    createReservation, getReservationById, getReservationsByUser,
    getAllReservations, updateReservationStatus,
    expireReservations,   // ← NOUVEAU
    // Historique
    addHistory, getHistory,
    // Stats
    recordStats, getStats,
    // MQTT
    recordMqttEvent
};