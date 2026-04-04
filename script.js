// Настройки (заполните при необходимости)
const GITHUB_TOKEN = '';
const GIST_ID = '';
const GIST_FILENAME = 'events_data.json';

let state = {
    events: []
};

document.addEventListener('DOMContentLoaded', () => {
    init();
    document.getElementById('add-event-btn').onclick = addEvent;
    document.getElementById('sync-btn').onclick = saveToGist;
});

async function init() {
    // 1. Загрузка из LocalStorage
    const local = localStorage.getItem('event_app_data');
    if (local) {
        state = JSON.parse(local);
        render();
    }

    // 2. Попытка загрузки из Gist
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

        // 1. Название события
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'event-name-input';
        nameInput.value = event.name;
        nameInput.placeholder = 'Название события...';
        nameInput.oninput = (e) => { event.name = e.target.value; saveLocal(); };

        // 2. Контейнер дат
        const datesList = document.createElement('div');
        datesList.className = 'dates-list';

        event.dates.forEach(dateObj => {
            const dateItem = document.createElement('div');
            dateItem.className = 'date-item';

            const dInput = document.createElement('input');
            dInput.type = 'date';
            dInput.value = dateObj.val;
            dInput.onchange = (e) => { dateObj.val = e.target.value; saveLocal(); };

            const delDateBtn = document.createElement('button');
            delDateBtn.className = 'btn btn-danger btn-small';
            delDateBtn.innerText = '✕';
            delDateBtn.onclick = () => {
                event.dates = event.dates.filter(d => d.id !== dateObj.id);
                render();
                saveLocal();
            };

            dateItem.appendChild(dInput);
            dateItem.appendChild(delDateBtn);
            datesList.appendChild(dateItem);
        });

        // 3. Кнопки управления (справа от всех дат)
        const controls = document.createElement('div');
        controls.className = 'row-controls';

        const addDateBtn = document.createElement('button');
        addDateBtn.className = 'btn btn-primary btn-small';
        addDateBtn.innerText = '+ Дата';
        addDateBtn.onclick = () => {
            event.dates.push({ id: Date.now(), val: '' });
            render();
            saveLocal();
        };

        const delEventBtn = document.createElement('button');
        delEventBtn.className = 'btn btn-danger btn-small';
        delEventBtn.innerText = 'Удалить событие';
        delEventBtn.onclick = () => {
            state.events = state.events.filter(e => e.id !== event.id);
            render();
            saveLocal();
        };

        controls.appendChild(addDateBtn);
        controls.appendChild(delEventBtn);

        // Сборка строки
        row.appendChild(nameInput);
        row.appendChild(datesList);
        row.appendChild(controls);

        list.appendChild(row);
    });
}

// --- Функции данных ---

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
    localStorage.setItem('event_app_data', JSON.stringify(state));
    document.getElementById('sync-status').innerText = 'Локально сохранено: ' + new Date().toLocaleTimeString();
}

async function loadFromGist() {
    try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`);
        if (!res.ok) return;
        const data = await res.json();
        const content = data.files[GIST_FILENAME].content;
        state = JSON.parse(content);
        render();
        document.getElementById('sync-status').innerText = 'Данные синхронизированы с Gist';
    } catch (e) {
        console.error('Ошибка Gist:', e);
    }
}

async function saveToGist() {
    if (!GITHUB_TOKEN || !GIST_ID) {
        alert('Заполните GITHUB_TOKEN и GIST_ID в script.js');
        return;
    }

    const status = document.getElementById('sync-status');
    status.innerText = 'Синхронизация...';

    try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: { [GIST_FILENAME]: { content: JSON.stringify(state, null, 2) } }
            })
        });
        if (res.ok) {
            status.innerText = 'Успешно сохранено в Gist';
        } else {
            status.innerText = 'Ошибка API';
        }
    } catch (e) {
        status.innerText = 'Ошибка сети';
    }
}