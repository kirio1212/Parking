/**
 * ============================================
 * SERVER.JS - Serveur principal Smart Parking
 * VERSION 2.0 - MQTT Arduino + Expiration réservations
 * ============================================
 */

const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const mqtt       = require('mqtt');
require('dotenv').config();

const db        = require('./db/database');
const apiRoutes = require('./routes/api');

const PORT = process.env.PORT || 3000;
const app  = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..')));
app.use('/api', apiRoutes);

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, '..', 'pages', 'dashboard.html')));

// ============================================
// CONNEXION MQTT (Mosquitto sur le Raspberry Pi)
// ============================================

/**
 * Topics attendus depuis l'Arduino :
 *
 *   smartparking/sensor/1   →  "1" = voiture détectée (occupée)
 *   smartparking/sensor/1   →  "0" = place libre
 *
 * L'Arduino publie sur ce topic via le shield Ethernet/WiFi.
 * Le numéro à la fin correspond au numéro de place (1 à N).
 *
 * Pour tester sans Arduino (ligne de commande sur le Pi) :
 *   mosquitto_pub -h localhost -t "smartparking/sensor/1" -m "1"
 *   mosquitto_pub -h localhost -t "smartparking/sensor/1" -m "0"
 */

const MQTT_HOST    = process.env.MQTT_HOST    || 'localhost';
const MQTT_PORT    = process.env.MQTT_PORT    || 1883;
const MQTT_TOPIC   = 'smartparking/sensor/#';  // # = wildcard, reçoit tous les capteurs

let mqttClient = null;

function connectMQTT() {
    const brokerUrl = `mqtt://${MQTT_HOST}:${MQTT_PORT}`;
    console.log(`🔌 Connexion au broker MQTT : ${brokerUrl}`);

    mqttClient = mqtt.connect(brokerUrl, {
        clientId:      'smartparking-server-' + Math.random().toString(16).slice(3),
        keepalive:     60,
        reconnectPeriod: 5000,   // Reconnexion automatique toutes les 5s si coupure
        connectTimeout: 10000
    });

    mqttClient.on('connect', () => {
        console.log('✅ MQTT connecté au broker Mosquitto');
        mqttClient.subscribe(MQTT_TOPIC, (err) => {
            if (err) {
                console.error('❌ Erreur abonnement MQTT :', err.message);
            } else {
                console.log(`📡 Abonné au topic : ${MQTT_TOPIC}`);
            }
        });
    });

    // Message reçu depuis un capteur Arduino
    mqttClient.on('message', async (topic, messageBuffer) => {
        const message    = messageBuffer.toString().trim();
        const topicParts = topic.split('/');           // ['smartparking', 'sensor', '1']
        const spotNumber = parseInt(topicParts[2]);    // numéro de place

        if (isNaN(spotNumber)) {
            console.warn(`⚠️  Topic MQTT invalide : ${topic}`);
            return;
        }

        console.log(`📩 MQTT reçu → topic: ${topic} | valeur: ${message}`);

        // "1" = voiture présente → occupée | "0" = libre
        const newStatus = message === '1' ? 'occupied' : 'free';

        try {
            // Récupérer la place par son numéro
            const spots = await db.getAllSpots();
            const spot  = spots.find(s => s.number === spotNumber);

            if (!spot) {
                console.warn(`⚠️  Place numéro ${spotNumber} introuvable en base`);
                return;
            }

            // Ne pas écraser une place RÉSERVÉE avec un simple signal capteur
            // (la réservation prime sur le capteur physique)
            if (spot.status === 'reserved' && newStatus === 'occupied') {
                console.log(`ℹ️  Place ${spotNumber} déjà réservée — capteur ignoré`);
                await db.recordMqttEvent(topic, message);
                return;
            }

            // Mettre à jour en base
            await db.updateSpotStatus(spot.id, newStatus);
            await db.recordMqttEvent(topic, message);

            console.log(`✅ Place ${spotNumber} mise à jour → ${newStatus}`);
        } catch (err) {
            console.error('❌ Erreur traitement message MQTT :', err.message);
        }
    });

    mqttClient.on('error', (err) => {
        console.error('❌ Erreur MQTT :', err.message);
    });

    mqttClient.on('reconnect', () => {
        console.log('🔄 Reconnexion MQTT en cours...');
    });

    mqttClient.on('offline', () => {
        console.warn('⚠️  Client MQTT hors-ligne');
    });
}

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

async function startServer() {
    try {
        // 1. Initialiser la base de données
        await db.initDatabase();

        // 2. Démarrer le serveur HTTP
        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════╗
║   🅿️  SMART PARKING SERVER v2.0 - PRÊT               ║
╠══════════════════════════════════════════════════════╣
║  🌐 Port HTTP  : ${PORT}
║  🗄️  Base      : MariaDB (${process.env.DB_HOST || 'localhost'})
║  📡 MQTT       : ${MQTT_HOST}:${MQTT_PORT}
║  🔐 JWT sécurisé
╚══════════════════════════════════════════════════════╝
            `);
        });

        // 3. Connecter le client MQTT (broker Mosquitto)
        connectMQTT();

        // 4. Enregistrer les statistiques toutes les 5 minutes
        setInterval(async () => {
            try {
                const spots    = await db.getAllSpots();
                const total    = spots.length;
                const free     = spots.filter(s => s.status === 'free').length;
                const occupied = spots.filter(s => s.status === 'occupied').length;
                const reserved = spots.filter(s => s.status === 'reserved').length;
                await db.recordStats(total, free, occupied, reserved);
            } catch (err) {
                console.error('❌ Erreur stats :', err.message);
            }
        }, 5 * 60 * 1000);

        // 5. ⭐ EXPIRATION AUTOMATIQUE DES RÉSERVATIONS toutes les minutes
        //    Libère les places dont l'heure de fin est dépassée
        setInterval(async () => {
            try {
                const count = await db.expireReservations();
                if (count > 0) {
                    console.log(`⏰ ${count} réservation(s) expirée(s) — places libérées`);
                }
            } catch (err) {
                console.error('❌ Erreur expiration réservations :', err.message);
            }
        }, 60 * 1000);  // toutes les 60 secondes

    } catch (err) {
        console.error('❌ Erreur au démarrage :', err);
        process.exit(1);
    }
}

// Arrêt propre
process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt du serveur...');
    if (mqttClient) mqttClient.end();
    await db.closeDatabase();
    process.exit(0);
});

startServer();