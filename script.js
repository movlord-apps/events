// Конфигурация GitHub Gist
const GITHUB_TOKEN = ''; // Вставьте ваш токен
const GIST_ID = '';      // Вставьте ID вашего Gist
const GIST_FILENAME = 'events.json';

// Состояние приложения
let state = {
    events: []
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    document.getElementById('add-event-btn').addEventListener('click', addEvent);
    document.getElementById('sync-btn').addEventListener('click', saveToGist);
});

/**
 * Загрузка данных: сначала из localStorage, затем попытка из Gist
 */
async function loadData() {
    const localData = localStorage.getItem('event_reminders');
    if (localData) {
        state = JSON.parse(localData);
        render();
    }

    if (GITHUB_TOKEN && GIST_ID) {
        await loadFromGist();
    }
}

/**
 * Сохранение в localStorage
 */
function saveLocal() {
    localStorage.setItem('event_reminders', JSON.stringify(state));
    document.getElementById('sync-status').innerText = 'Сохранено локально: ' + new Date().toLocaleTimeString();
}

/**
 * API: Загрузка из GitHub Gist
 */
async function loadFromGist() {
    try {
        const response = await fetch(`https://api.github.com/gists/${GIST_ID}`);
        const gist = await response.json();
        const content = gist.files[GIST_FILENAME].content;
        if (content) {
            state = JSON.parse(content);
            render();
            document.getElementById('sync-status').innerText = 'Синхронизировано с Gist';
        }
    } catch (err) {
        console.error('Ошибка загрузки Gist:', err);
    }
}

/**
 * API: Сохранение в GitHub Gist
 */
async function saveToGist() {
    if (!GITHUB_TOKEN || !GIST_ID) {
        alert('Настройте GITHUB_TOKEN и GIST_ID в коде!');
        return;
    }

    const statusEl = document.getElementById('sync-status');
    statusEl.innerText = 'Синхронизация...';

    try {
        const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    [GIST_FILENAME]: {
                        content: JSON.stringify(state, null, 2)
                    }
                }
            })
        });

        if (response.ok) {
            statusEl.innerText = 'Успешно сохранено в Gist';
        } else {
            throw new Error('Ошибка API');
        }
    } catch (err) {
        statusEl.innerText = 'Ошибка синхронизации';
        console.error(err);
    }
}

// --- Логика UI ---

function addEvent() {
    const newEvent = {
        id: Date.now(),
        name: '',
        reminders: []
    };
    state.events.push(newEvent);
    render();
    saveLocal();
}

function deleteEvent(id) {
    state.events = state.events.filter(e => e.id !== id);
    render();
    saveLocal();
}

function addReminder(eventId) {
    const event = state.events.find(e => e.id === eventId);
    event.reminders.push({
        id: Date.now(),
        date: '',
        description: ''
    });
    render();
    saveLocal();
}

function deleteReminder(eventId, reminderId) {
    const event = state.events.find(e => e.id === eventId);
    event.reminders = event.reminders.filter(r => r.id !== reminderId);
    render();
    saveLocal();
}

/**
 * Отрисовка интерфейса
 */
function render() {
    const listContainer = document.getElementById('events-list');
    listContainer.innerHTML = '';

    state.events.forEach(event => {
        const eventEl = document.createElement('div');
        eventEl.className = 'event-row';

        eventEl.innerHTML = `
            <div class="event-header">
                <input type="text" class="event-name-input" placeholder="Название события" value="${event.name}">
                <button class="btn btn-primary btn-small add-date-btn">＋ Дата</button>
                <button class="btn btn-danger btn-small del-event-btn">Удалить</button>
            </div>
            <div class="reminders-container"></div>
        `;

        // Обработчики для события
        const nameInput = eventEl.querySelector('.event-name-input');
        nameInput.oninput = (e) => { event.name = e.target.value; saveLocal(); };

        eventEl.querySelector('.del-event-btn').onclick = () => deleteEvent(event.id);
        eventEl.querySelector('.add-date-btn').onclick = () => addReminder(event.id);

        // Рендер напоминаний
        const remindersContainer = eventEl.querySelector('.reminders-container');
        event.reminders.forEach(rem => {
            const remEl = document.createElement('div');
            remEl.className = 'reminder-row';
            remEl.innerHTML = `
                <input type="datetime-local" value="${rem.date}">
                <input type="text" class="reminder-desc-input" placeholder="Описание" value="${rem.description}">
                <button class="btn btn-danger btn-small del-rem-btn">✕</button>
            `;

            const dateInput = remEl.querySelector('input[type="datetime-local"]');
            dateInput.onchange = (e) => { rem.date = e.target.value; saveLocal(); };

            const descInput = remEl.querySelector('.reminder-desc-input');
            descInput.oninput = (e) => { rem.description = e.target.value; saveLocal(); };

            remEl.querySelector('.del-rem-btn').onclick = () => deleteReminder(event.id, rem.id);

            remindersContainer.appendChild(remEl);
        });

        listContainer.appendChild(eventEl);
    });
}