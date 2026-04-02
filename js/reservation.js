/**
 * ============================================
 * RESERVATION.JS - Système de réservation
 * Smart Parking v3.0
 * CORRIGÉ : ne bloque plus une place pour
 *           toujours — vérifie uniquement si
 *           une voiture est physiquement là
 * ============================================
 */

const PRICING = {
    30: 2,
    60: 3,
    120: 5,
    240: 8,
    480: 15
};

const TIME_SLOTS = [
    '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
    '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
    '22:00'
];

let currentReservation = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('📅 Initialisation du système de réservation...');
    initReservationForm();
    initDatePicker();
    initTimeSlots();
    initPricePreview();
    initConfirmationModal();
});

function initReservationForm() {
    const form = document.getElementById('reservationForm');
    if (!form) return;
    form.addEventListener('submit', handleReservationSubmit);
}

function initDatePicker() {
    const dateInput = document.getElementById('resDate');
    if (!dateInput) return;
    const today = new Date().toISOString().split('T')[0];
    dateInput.min   = today;
    dateInput.value = today;
}

function initTimeSlots() {
    const select = document.getElementById('resStartTime');
    if (!select) return;

    TIME_SLOTS.forEach(time => {
        const option       = document.createElement('option');
        option.value       = time;
        option.textContent = time;
        select.appendChild(option);
    });

    const now          = new Date();
    const currentHour  = now.getHours();
    const currentMins  = now.getMinutes();
    const nextSlot     = TIME_SLOTS.find(t => {
        const [h, m] = t.split(':').map(Number);
        return h > currentHour || (h === currentHour && m > currentMins);
    });
    if (nextSlot) select.value = nextSlot;
}

function initPricePreview() {
    const durationSelect = document.getElementById('resDuration');
    if (!durationSelect) return;
    durationSelect.addEventListener('change', updatePricePreview);
    updatePricePreview();
}

function updatePricePreview() {
    const duration = parseInt(document.getElementById('resDuration').value);
    const price    = PRICING[duration] || 0;
    document.getElementById('previewPrice').textContent = price + '€';
}

/**
 * Gère la soumission du formulaire
 *
 * CORRIGÉ : on n'empêche plus la réservation si la place
 * est "reserved" dans le localStorage. On laisse le serveur
 * vérifier les conflits d'horaire. On bloque uniquement si
 * une voiture est physiquement détectée (status "occupied").
 */
async function handleReservationSubmit(e) {
    e.preventDefault();

    const user = JSON.parse(localStorage.getItem('smart_parking_user') || 'null');
    if (!user) {
        Dashboard.showToast('Veuillez vous connecter', 'error');
        return;
    }

    const spotId    = parseInt(document.getElementById('resSpot').value);
    const date      = document.getElementById('resDate').value;
    const startTime = document.getElementById('resStartTime').value;
    const duration  = parseInt(document.getElementById('resDuration').value);
    const vehicle   = document.getElementById('resVehicle').value;

    if (!spotId || !date || !startTime || !vehicle) {
        Dashboard.showToast('Veuillez remplir tous les champs', 'error');
        return;
    }

    // CORRIGÉ : on bloque uniquement si une voiture est physiquement là
    // Une place "reserved" peut quand même être réservée à un autre horaire
    const spots = JSON.parse(localStorage.getItem('smart_parking_spots') || '[]');
    const spot  = spots.find(s => s.id === spotId);

    if (spot && spot.status === 'occupied') {
        Dashboard.showToast('Une voiture est déjà sur cette place', 'error');
        if (window.ParkingMap) window.ParkingMap.refresh();
        return;
    }

    // Calculer l'heure de fin
    const endDate = new Date(date + 'T' + startTime);
    endDate.setMinutes(endDate.getMinutes() + duration);
    const endTime = endDate.toTimeString().slice(0, 5);

    // Essayer de créer la réservation via l'API
    // Le serveur vérifiera les conflits d'horaire
    const token = localStorage.getItem('smart_parking_token');

    if (token) {
        try {
            const response = await fetch('/api/reservations', {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    spotId, date, startTime, endTime,
                    duration, vehicle: vehicle.toUpperCase(),
                    price: PRICING[duration]
                })
            });

            const data = await response.json();

            if (!data.success) {
                // Le serveur a détecté un conflit ou une erreur
                Dashboard.showToast(data.message, 'error');
                return;
            }

            // Succès via API
            currentReservation = {
                id:         data.data.id,
                userId:     user.id,
                userName:   user.name,
                spotId:     spotId,
                spotNumber: spot ? spot.number : spotId,
                date, startTime, endTime, duration,
                vehicle:    vehicle.toUpperCase(),
                price:      PRICING[duration],
                status:     'active',
                createdAt:  new Date().toISOString()
            };

        } catch (_err) {
            // Mode offline : enregistrement local
            currentReservation = creerReservationLocale(
                user, spotId, spot, date, startTime, endTime, duration, vehicle
            );
        }
    } else {
        // Pas de token : mode offline
        currentReservation = creerReservationLocale(
            user, spotId, spot, date, startTime, endTime, duration, vehicle
        );
    }

    // Sauvegarder dans le localStorage
    let reservations = JSON.parse(localStorage.getItem('smart_parking_reservations') || '[]');
    reservations.push(currentReservation);
    localStorage.setItem('smart_parking_reservations', JSON.stringify(reservations));

    // Mettre à jour la carte seulement si la réservation est pour aujourd'hui
    const today   = new Date().toISOString().split('T')[0];
    const now     = new Date();
    const resStart = new Date(date + 'T' + startTime);
    const diffMin  = (resStart - now) / 60000;

    if (date === today && diffMin <= 30 && window.ParkingMap) {
        window.ParkingMap.setSpotStatus(spotId, 'reserved');
    }

    addToHistory(
        'Réservation',
        `Place ${currentReservation.spotNumber} réservée le ${date} de ${startTime} à ${endTime} — ${PRICING[duration]}€`
    );

    // Réinitialiser le formulaire
    document.getElementById('reservationForm').reset();
    initDatePicker();
    updatePricePreview();

    showConfirmationModal();
}

/**
 * Crée une réservation en mode offline (localStorage)
 */
function creerReservationLocale(user, spotId, spot, date, startTime, endTime, duration, vehicle) {
    return {
        id:         Date.now(),
        userId:     user.id,
        userName:   user.name,
        spotId:     spotId,
        spotNumber: spot ? spot.number : spotId,
        date, startTime, endTime, duration,
        vehicle:    vehicle.toUpperCase(),
        price:      PRICING[duration],
        status:     'active',
        createdAt:  new Date().toISOString()
    };
}

// ============================================
// MODAL DE CONFIRMATION
// ============================================

function initConfirmationModal() {
    document.getElementById('closeConfirmationModal')?.addEventListener('click', hideConfirmationModal);
    document.getElementById('closeConfirmationBtn')?.addEventListener('click', hideConfirmationModal);
}

function showConfirmationModal() {
    if (!currentReservation) return;

    const modal = document.getElementById('confirmationModal');

    document.getElementById('paySpot').textContent     = 'Place ' + currentReservation.spotNumber;
    document.getElementById('payDate').textContent     = formatDate(currentReservation.date);
    document.getElementById('payTime').textContent     = currentReservation.startTime + ' - ' + currentReservation.endTime;
    document.getElementById('payDuration').textContent = formatDuration(currentReservation.duration);
    document.getElementById('payTotal').textContent    = currentReservation.price + '€';

    modal.classList.remove('hidden');
}

function hideConfirmationModal() {
    document.getElementById('confirmationModal').classList.add('hidden');

    if (window.Dashboard) {
        Dashboard.navigateToPage('my-reservations');
        document.querySelector('[data-page="my-reservations"]')?.classList.add('active');
        document.querySelector('[data-page="reservation"]')?.classList.remove('active');
    }

    if (window.Dashboard) Dashboard.refreshStats();
}

// ============================================
// UTILITAIRES
// ============================================

function addToHistory(action, details) {
    let history = JSON.parse(localStorage.getItem('smart_parking_history') || '[]');
    history.unshift({
        id:        Date.now(),
        action,
        details,
        timestamp: new Date().toISOString()
    });
    if (history.length > 100) history = history.slice(0, 100);
    localStorage.setItem('smart_parking_history', JSON.stringify(history));
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function formatDuration(minutes) {
    if (minutes >= 480) return 'Journée (8h)';
    if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}h ${m}min` : `${h}h`;
    }
    return `${minutes} min`;
}

window.Reservation = { PRICING, TIME_SLOTS, formatDuration, addToHistory };