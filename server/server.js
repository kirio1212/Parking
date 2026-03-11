const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const db = require('./db/database');
const apiRoutes = require('./routes/api');

const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..')));

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'pages', 'dashboard.html'));
});

async function startServer() {
  try {
    await db.initDatabase();
    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════╗
║   🅿️  SMART PARKING SERVER - PRÊT POUR DOCKER    ║
╠══════════════════════════════════════════════════╣
║  🌐 Port : ${PORT}
║  🗄️  Base : MariaDB (${process.env.DB_HOST})
║  🔐 JWT sécurisé
╚══════════════════════════════════════════════════╝
      `);
    });

    setInterval(async () => {
      try {
        const spots = await db.getAllSpots();
        const total = spots.length;
        const free = spots.filter(s => s.status === 'free').length;
        const occupied = spots.filter(s => s.status === 'occupied').length;
        const reserved = spots.filter(s => s.status === 'reserved').length;
        await db.recordStats(total, free, occupied, reserved);
      } catch (err) {
        console.error('❌ Erreur stats:', err.message);
      }
    }, 5 * 60 * 1000);

  } catch (err) {
    console.error('❌ Erreur au démarrage :', err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Arrêt du serveur...');
  await db.closeDatabase();
  process.exit(0);
});

startServer();