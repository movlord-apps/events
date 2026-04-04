let GITHUB_TOKEN = localStorage.getItem('gh_token') || '';
let GIST_ID = localStorage.getItem('gh_gist_id') || '';
const GIST_FILENAME = 'events.json';

let state = {
    events: []
};

document.addEventListener('DOMContentLoaded', () => {
    init();
    document.getElementById('add-event-btn').onclick = addEvent;
    document.getElementById('sync-btn').onclick = saveToGist;
    document.getElementById('settings-btn').onclick = openSettings;
    document.getElementById('settings-save').onclick = saveSettings;
    document.getElementById('settings-cancel').onclick = () => toggleModal(false);
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

function toggleModal(show) {
    document.getElementById('settings-modal').style.display = show ? 'flex' : 'none';
}

function openSettings() {
    const input = document.getElementById('settings-input');
    // Заполняем текущими данными из памяти
    input.value = GITHUB_TOKEN && GIST_ID ? `${GITHUB_TOKEN}\n${GIST_ID}` : '';
    toggleModal(true);
}

function saveSettings() {
    const input = document.getElementById('settings-input').value.trim();
    const lines = input.split('\n').map(l => l.trim());

    if (lines.length >= 2) {
        GITHUB_TOKEN = lines[0];
        GIST_ID = lines[1];

        localStorage.setItem('gh_token', GITHUB_TOKEN);
        localStorage.setItem('gh_gist_id', GIST_ID);

        alert('Настройки сохранены');
        toggleModal(false);
        // Пробуем сразу загрузить данные, если ключи обновились
        loadFromGist();
    } else {
        alert('Введите две строки: Токен и ID');
    }
}

function render(focusId = null) {
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
            // Рендерим только если это первый символ (чтобы появился блок даты)
            if (event.name.length === 1 && event.dates.length === 1) {
                render(event.id);
            }
            saveLocal();
        };

        nameInput.onblur = () => {
            event.name = event.name.trim(); // Обрезаем пробелы
            manageEvents(); // Удаляем, если пустое
            state.events.forEach(manageDates); // Обновляем черновики дат
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
                // Если начали писать в черновике — превращаем его в реальный блок
                if (isDraft && dateObj.desc.trim() !== '') {
                    dateObj.id = Date.now();
                    manageDates(event);
                    render(dateObj.id);
                }
                saveLocal();
            };

            descInput.onblur = () => {
                dateObj.desc = dateObj.desc.trim(); // Обрезаем пробелы
                manageDates(event);
                manageEvents(); // Проверяем, не стало ли всё событие пустым
                render();
                saveLocal();
            };

            dateItem.appendChild(topRow);
            dateItem.appendChild(descInput);
            datesList.appendChild(dateItem);

            flatpickr(dInput, {
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
// --- Функции данных ---
function addEvent() {
    const newId = Date.now(); // Генерируем уникальный ID
    state.events.push({
        id: newId,
        name: '',
        dates: []
    });

    render(newId); // Передаем ID в render для установки фокуса
    saveLocal();
}
function saveLocal() {
    localStorage.setItem('event_app_data', JSON.stringify(state));
    document.getElementById('sync-status').innerText = 'Локально сохранено: ' + new Date().toLocaleTimeString();
}

async function loadFromGist() {
    if (!GITHUB_TOKEN || !GIST_ID) return;

    try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const content = data.files[GIST_FILENAME].content;
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
    if (!GITHUB_TOKEN || !GIST_ID) {
        openSettings(); // Если ключей нет, открываем настройки
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
        // Проверяем, есть ли хоть одна заполненная дата (игнорируя черновики)
        const hasRealDates = e.dates.some(d =>
            (d.val.trim() !== '' || d.desc.trim() !== '') && !String(d.id).startsWith('draft')
        );
        return hasName || hasRealDates;
    });
}

/**
 * Логика авто-добавления и удаления пустых блоков
 */
function manageDates(event) {
    // 1. Оставляем только заполненные даты
    const filledDates = event.dates.filter(d => d.val.trim() !== '' || d.desc.trim() !== '');

    // 2. Если у события есть название (даже не обрезанное пока), добавляем один пустой черновик
    if (event.name.length > 0) {
        event.dates = [...filledDates, { id: 'draft-' + event.id, val: '', desc: '' }];
    } else {
        event.dates = filledDates;
    }
}