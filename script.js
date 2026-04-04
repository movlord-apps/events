let GITHUB_TOKEN = localStorage.getItem('gh_token') || '';
let GIST_ID = localStorage.getItem('gh_gist_id') || '';

function getToken() { return GITHUB_TOKEN; }

function setToken(token) {
    GITHUB_TOKEN = token;
    localStorage.setItem('gh_token', token);
}
const GIST_FILENAME = 'events.json';

let state = {
    events: []
};

// --- Трекинг flatpickr-инстанций ---
// Ключ: уникальный id даты → значение: инстанция flatpickr.
// Перед каждым render() все старые инстанции уничтожаются.
const flatpickrInstances = new Map();

function destroyAllFlatpickr() {
    flatpickrInstances.forEach(instance => {
        try { instance.destroy(); } catch { }
    });
    flatpickrInstances.clear();
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    document.getElementById('add-event-btn').onclick = addEvent;
    document.getElementById('sync-btn').onclick = saveToGist;
    document.getElementById('settings-btn').onclick = openSettings;
    document.getElementById('settings-save').onclick = saveSettings;
    document.getElementById('settings-cancel').onclick = () => toggleModal(false);
});

async function init() {
    const local = localStorage.getItem('event_app_data');
    if (local) {
        state = JSON.parse(local);
        render();
    }

    if (getToken() && GIST_ID) {
        await loadFromGist();
    }
}

function toggleModal(show) {
    document.getElementById('settings-modal').style.display = show ? 'flex' : 'none';
}

function openSettings() {
    const tokenInput = document.getElementById('settings-token');
    const gistInput = document.getElementById('settings-gist');
    tokenInput.value = ''; // Никогда не показываем токен обратно
    gistInput.value = GIST_ID;
    toggleModal(true);
}

function saveSettings() {
    const tokenInput = document.getElementById('settings-token').value.trim();
    const gistInput = document.getElementById('settings-gist').value.trim();

    if (!gistInput) {
        alert('Введите Gist ID');
        return;
    }

    // Если токен не введён — оставляем старый (пользователь мог менять только Gist ID)
    if (tokenInput) {
        setToken(tokenInput);
    }

    GIST_ID = gistInput;
    localStorage.setItem('gh_gist_id', GIST_ID);

    toggleModal(false);

    if (getToken() && GIST_ID) {
        loadFromGist();
    }
}

function render(focusId = null) {
    // Уничтожаем все старые инстанции flatpickr перед перерисовкой
    destroyAllFlatpickr();

    const list = document.getElementById('events-list');
    list.innerHTML = '';

    state.events.forEach(event => {
        const row = document.createElement('div');
        row.className = 'event-row';

        const nameInput = document.createElement('input');
        nameInput.className = 'event-name-input';
        nameInput.value = event.name;
        nameInput.placeholder = "Название события...";
        nameInput.dataset.eventId = event.id;

        if (focusId === event.id) {
            setTimeout(() => nameInput.focus(), 0);
        }

        nameInput.oninput = (e) => {
            event.name = e.target.value;
            manageDates(event);
            if (event.name.length === 1 && event.dates.length === 1) {
                render(event.id);
            }
            saveLocal();
        };

        nameInput.onblur = () => {
            event.name = event.name.trim();
            manageEvents();
            state.events.forEach(manageDates);
            render();
            saveLocal();
        };

        const datesList = document.createElement('div');
        datesList.className = 'dates-list';

        event.dates.forEach((dateObj) => {
            const dateItem = document.createElement('div');
            dateItem.className = 'date-item';

            const topRow = document.createElement('div');
            topRow.className = 'date-top-row';

            const dInput = document.createElement('input');
            dInput.type = 'text';
            dInput.placeholder = "Дата...";
            dInput.value = dateObj.val;

            topRow.appendChild(dInput);

            const isDraft = String(dateObj.id).startsWith('draft');
            const isFilled = dateObj.val.trim() !== '' || dateObj.desc.trim() !== '';

            if (isFilled) {
                const delDateBtn = document.createElement('button');
                delDateBtn.className = 'btn btn-danger btn-small';
                delDateBtn.innerText = '✕';
                delDateBtn.onclick = () => {
                    event.dates = event.dates.filter(d => d.id !== dateObj.id);
                    manageDates(event);
                    render();
                    saveLocal();
                };
                topRow.appendChild(delDateBtn);
            }

            const descInput = document.createElement('input');
            descInput.className = 'date-desc-input';
            descInput.placeholder = "Описание...";
            descInput.value = dateObj.desc;
            descInput.dataset.descId = dateObj.id;

            if (focusId === dateObj.id) {
                setTimeout(() => descInput.focus(), 0);
            }

            descInput.oninput = (e) => {
                dateObj.desc = e.target.value;
                if (isDraft && dateObj.desc.trim() !== '') {
                    dateObj.id = Date.now();
                    manageDates(event);
                    render(dateObj.id);
                }
                saveLocal();
            };

            descInput.onblur = () => {
                dateObj.desc = dateObj.desc.trim();
                manageDates(event);
                manageEvents();
                render();
                saveLocal();
            };

            dateItem.appendChild(topRow);
            dateItem.appendChild(descInput);
            datesList.appendChild(dateItem);

            // Создаём инстанцию и сразу регистрируем её в Map
            const fpInstance = flatpickr(dInput, {
                locale: "ru",
                dateFormat: "d.m.Y",
                defaultDate: dateObj.val,
                onChange: (selectedDates, dateStr) => {
                    dateObj.val = dateStr;
                    if (isDraft) dateObj.id = Date.now();
                    manageDates(event);
                    render();
                    saveLocal();
                }
            });

            // Ключ — строковый ID даты, гарантированно уникальный в рамках рендера
            flatpickrInstances.set(String(dateObj.id), fpInstance);
        });

        const controls = document.createElement('div');
        controls.className = 'row-controls';
        const delEventBtn = document.createElement('button');
        delEventBtn.className = 'btn btn-danger btn-small';
        delEventBtn.innerText = 'Удалить';
        delEventBtn.onclick = () => {
            state.events = state.events.filter(e => e.id !== event.id);
            render();
            saveLocal();
        };
        controls.appendChild(delEventBtn);

        row.appendChild(nameInput);
        row.appendChild(datesList);
        row.appendChild(controls);
        list.appendChild(row);
    });
}

function addEvent() {
    const newId = Date.now();
    state.events.push({ id: newId, name: '', dates: [] });
    render(newId);
    saveLocal();
}

function saveLocal() {
    localStorage.setItem('event_app_data', JSON.stringify(state));
    document.getElementById('sync-status').innerText =
        'Локально сохранено: ' + new Date().toLocaleTimeString();
}

async function loadFromGist() {
    const token = getToken();
    if (!token || !GIST_ID) return;

    try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const content = data.files[GIST_FILENAME]?.content;
        if (content) {
            state = JSON.parse(content);
            render();
            document.getElementById('sync-status').innerText = 'Данные загружены из Gist';
        }
    } catch (e) {
        console.error('Ошибка загрузки Gist:', e);
    }
}

async function saveToGist() {
    const token = getToken();
    if (!token || !GIST_ID) {
        openSettings();
        return;
    }

    const status = document.getElementById('sync-status');
    status.innerText = 'Синхронизация...';

    try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: { [GIST_FILENAME]: { content: JSON.stringify(state, null, 2) } }
            })
        });

        if (res.ok) {
            status.innerText = 'Синхронизировано с Gist: ' + new Date().toLocaleTimeString();
        } else {
            const err = await res.json();
            status.innerText = 'Ошибка Gist: ' + (err.message || 'API Error');
        }
    } catch (e) {
        status.innerText = 'Ошибка сети';
    }
}

function manageEvents() {
    state.events = state.events.filter(e => {
        const hasName = e.name.trim() !== '';
        const hasRealDates = e.dates.some(d =>
            (d.val.trim() !== '' || d.desc.trim() !== '') && !String(d.id).startsWith('draft')
        );
        return hasName || hasRealDates;
    });
}

function manageDates(event) {
    const filledDates = event.dates.filter(d => d.val.trim() !== '' || d.desc.trim() !== '');
    if (event.name.length > 0) {
        event.dates = [...filledDates, { id: 'draft-' + event.id, val: '', desc: '' }];
    } else {
        event.dates = filledDates;
    }
}