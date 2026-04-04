// Настройки синхронизации
const GITHUB_TOKEN = '';
const GIST_ID = '';
const GIST_FILENAME = 'events_simple.json';

let state = {
    events: []
};

document.addEventListener('DOMContentLoaded', () => {
    init();
    document.getElementById('add-event-btn').onclick = addEvent;
    document.getElementById('sync-btn').onclick = saveToGist;
});

async function init() {
    // Загрузка из локального хранилища для мгновенного отклика
    const local = localStorage.getItem('events_data');
    if (local) {
        state = JSON.parse(local);
        render();
    }

    // Если есть токены, пробуем обновить из Gist
    if (GITHUB_TOKEN && GIST_ID) {
        await loadFromGist();
    }
}

function render() {
    const list = document.getElementById('events-list');
    list.innerHTML = '';

    state.events.forEach(event => {
        const row = document.createElement('div');
        row.className = 'event-row';

        // Левая часть: Название и управление событием
        const mainInfo = document.createElement('div');
        mainInfo.className = 'event-main';
        mainInfo.innerHTML = `
            <input type="text" class="event-name-input" value="${event.name}" placeholder="Название события...">
            <button class="btn btn-primary btn-small add-date-btn" title="Добавить дату">+</button>
            <button class="btn btn-danger btn-small del-event-btn" title="Удалить событие">✕</button>
        `;

        // Правая часть: Список дат
        const datesCont = document.createElement('div');
        datesCont.className = 'dates-container';

        event.dates.forEach(dateObj => {
            const dateItem = document.createElement('div');
            dateItem.className = 'date-item';
            dateItem.innerHTML = `
                <input type="date" value="${dateObj.val}">
                <button class="btn btn-danger btn-small del-date-btn">✕</button>
            `;

            // Логика изменения даты
            dateItem.querySelector('input').onchange = (e) => {
                dateObj.val = e.target.value;
                saveLocal();
            };

            // Удаление даты
            dateItem.querySelector('.del-date-btn').onclick = () => {
                event.dates = event.dates.filter(d => d.id !== dateObj.id);
                render();
                saveLocal();
            };

            datesCont.appendChild(dateItem);
        });

        // Слушатели для основной части
        mainInfo.querySelector('.event-name-input').oninput = (e) => {
            event.name = e.target.value;
            saveLocal();
        };

        mainInfo.querySelector('.add-date-btn').onclick = () => {
            event.dates.push({ id: Date.now(), val: '' });
            render();
            saveLocal();
        };

        mainInfo.querySelector('.del-event-btn').onclick = () => {
            state.events = state.events.filter(e => e.id !== event.id);
            render();
            saveLocal();
        };

        row.appendChild(mainInfo);
        row.appendChild(datesCont);
        list.appendChild(row);
    });
}

// --- Data Management ---

function addEvent() {
    state.events.push({
        id: Date.now(),
        name: '',
        dates: []
    });
    render();
    saveLocal();
}

function saveLocal() {
    localStorage.setItem('events_data', JSON.stringify(state));
    document.getElementById('sync-status').innerText = 'Локально сохранено: ' + new Date().toLocaleTimeString();
}

async function loadFromGist() {
    try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`);
        const data = await res.json();
        state = JSON.parse(data.files[GIST_FILENAME].content);
        render();
        document.getElementById('sync-status').innerText = 'Данные загружены из Gist';
    } catch (e) {
        console.log('Gist load failed, using local data');
    }
}

async function saveToGist() {
    if (!GITHUB_TOKEN || !GIST_ID) return alert('Укажите GITHUB_TOKEN и GIST_ID');

    const status = document.getElementById('sync-status');
    status.innerText = 'Синхронизация...';

    try {
        await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            method: 'PATCH',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` },
            body: JSON.stringify({
                files: { [GIST_FILENAME]: { content: JSON.stringify(state, null, 2) } }
            })
        });
        status.innerText = 'Синхронизировано с Gist';
    } catch (e) {
        status.innerText = 'Ошибка Gist';
    }
}