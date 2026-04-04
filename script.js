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

function render() {
    const list = document.getElementById('events-list');
    list.innerHTML = '';

    state.events.forEach(event => {
        const row = document.createElement('div');
        row.className = 'event-row';

        // 1. Поле названия (300px)
        const nameInput = document.createElement('input');
        nameInput.className = 'event-name-input';
        nameInput.value = event.name;
        nameInput.placeholder = "Название события...";
        nameInput.dataset.eventId = event.id; // Для поиска элемента после рендера

        if (focusId === event.id) {
            setTimeout(() => {
                nameInput.focus();
                // Если в поле уже есть текст, курсор уйдет в конец
                const val = nameInput.value;
                nameInput.value = '';
                nameInput.value = val;
            }, 0);
        }

        nameInput.oninput = (e) => {
            event.name = e.target.value;
            manageDates(event);
            render(event.id);

            saveLocal();
        };

        nameInput.dataset.eventId = event.id; // Для удержания фокуса

        const datesList = document.createElement('div');
        datesList.className = 'dates-list';

        event.dates.forEach((dateObj, index) => {
            const dateItem = document.createElement('div');
            dateItem.className = 'date-item';

            const topRow = document.createElement('div');
            topRow.className = 'date-top-row';

            const dInput = document.createElement('input');
            dInput.type = 'text';
            dInput.placeholder = "Дата...";
            dInput.value = dateObj.val;

            topRow.appendChild(dInput);

            // УСЛОВИЕ: Кнопка удаления только если блок НЕ пустой
            const isBlockEmpty = !dateObj.val && !dateObj.desc;
            if (!isBlockEmpty) {
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
            descInput.dataset.id = dateObj.id;

            descInput.oninput = (e) => {
                dateObj.desc = e.target.value;
                const oldLen = event.dates.length;
                manageDates(event);
                if (event.dates.length !== oldLen) {
                    render();
                    document.querySelector(`[data-id="${dateObj.id}"]`).focus();
                }
                saveLocal();
            };

            descInput.onblur = () => {
                const oldLen = event.dates.length;
                manageDates(event);
                if (event.dates.length !== oldLen) render();
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
                    manageDates(event);
                    render();
                    saveLocal();
                }
            });
        });

        // 3. Кнопки управления (только удаление события)
        const controls = document.createElement('div');
        controls.className = 'row-controls';
        const delEventBtn = document.createElement('button');
        delEventBtn.className = 'btn btn-danger btn-small';
        delEventBtn.innerText = 'Удалить событие';
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

/**
 * Логика авто-добавления и удаления пустых блоков
 */
function manageDates(event) {
    const hasName = event.name.trim().length > 0;

    // Если имени нет и дат нет — ничего не делаем
    if (!hasName && event.dates.length === 0) return;

    // Если имя ввели впервые (дат еще 0) — создаем первый пустой блок
    if (hasName && event.dates.length === 0) {
        event.dates.push({ id: Date.now(), val: '', desc: '' });
        return;
    }

    // Стандартная очистка: удаляем пустые блоки, кроме последнего
    const lastIndex = event.dates.length - 1;
    event.dates = event.dates.filter((d, index) => {
        const isFilled = d.val || d.desc;
        // Оставляем блок, если он заполнен ИЛИ если он последний в списке
        return isFilled || index === lastIndex;
    });

    // Если последний блок в списке заполнили — добавляем новый пустой "черновик"
    const last = event.dates[event.dates.length - 1];
    if (last && (last.val || last.desc)) {
        event.dates.push({ id: Date.now() + 1, val: '', desc: '' });
    }
}