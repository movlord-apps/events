let GITHUB_TOKEN = localStorage.getItem('gh_token') || '';
let GIST_ID = localStorage.getItem('gh_gist_id') || '';

function getToken() { return GITHUB_TOKEN; }

function setToken(token) {
    GITHUB_TOKEN = token;
    localStorage.setItem('gh_token', token);
}

const GIST_FILENAME = 'events.json';

let state = { events: [], labels: [], updatedAt: null };

// --- Трекинг flatpickr-инстанций ---
const flatpickrInstances = new Map();

function destroyAllFlatpickr() {
    flatpickrInstances.forEach(instance => {
        try { instance.destroy(); } catch { }
    });
    flatpickrInstances.clear();
}

// --- Фабрики данных ---
function createEvent() {
    return { id: Date.now(), name: '', dates: [], labelId: null };
}

// isDraft — явный флаг вместо магического префикса 'draft-' в ID
function createDraftDate(eventId) {
    return { id: `date-${eventId}-${Date.now()}`, val: '', desc: '', isDraft: true };
}

function promoteDraft(dateObj) {
    dateObj.isDraft = false;
}

// --- Логика состояния (каждая функция делает одно) ---

function trimEventName(event) {
    event.name = event.name.trim();
}

function removeEmptyEvents() {
    state.events = state.events.filter(event => {
        const hasName = event.name.trim() !== '';
        const hasRealDate = event.dates.some(d => !d.isDraft && (d.val.trim() !== '' || d.desc.trim() !== ''));
        return hasName || hasRealDate;
    });
}

function syncDraftDate(event) {
    const realDates = event.dates.filter(d => !d.isDraft);
    if (event.name.trim().length > 0) {
        // Проверяем, нет ли уже черновика в памяти
        if (!event.dates.some(d => d.isDraft)) {
            event.dates.push(createDraftDate(event.id));
        }
    } else {
        event.dates = realDates;
    }
}

function removeEmptyDates(event) {
    event.dates = event.dates.filter(d => d.isDraft || d.val.trim() !== '' || d.desc.trim() !== '');
}

// --- onblur-обработчики (каждый — одна задача) ---

function onEventNameBlur(event) {
    trimEventName(event);
    removeEmptyEvents();
    state.events.forEach(syncDraftDate);
    render();
    saveLocal();
}

function onDateDescBlur(event, dateObj) {
    dateObj.desc = dateObj.desc.trim();
    removeEmptyDates(event);
    syncDraftDate(event);
    removeEmptyEvents();
    render();
    saveLocal();
}

// --- DOM: точечное добавление чернового блока ---

function appendDraftDate(event, datesList) {
    const draft = event.dates.find(d => d.isDraft);
    if (!draft) return;
    if (datesList.querySelector(`[data-desc-id="${draft.id}"]`)) return;

    const { dateItem } = buildDateItem(event, draft, datesList);
    datesList.appendChild(dateItem);
}

// --- Построение одного блока даты ---

function buildDateItem(event, dateObj, datesList) {
    const dateItem = document.createElement('div');
    dateItem.className = 'date-item';

    const topRow = document.createElement('div');
    topRow.className = 'date-top-row';

    const dInput = document.createElement('input');
    dInput.type = 'text';
    dInput.placeholder = 'Дата...';
    dInput.value = dateObj.val;
    topRow.appendChild(dInput);

    const isFilled = dateObj.val.trim() !== '' || dateObj.desc.trim() !== '';
    if (isFilled) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger btn-small';
        delBtn.innerText = '✕';
        delBtn.onclick = () => {
            event.dates = event.dates.filter(d => d.id !== dateObj.id);
            syncDraftDate(event);
            render();
            saveLocal();
        };
        topRow.appendChild(delBtn);
    }

    const descInput = document.createElement('input');
    descInput.className = 'date-desc-input';
    descInput.placeholder = 'Описание...';
    descInput.value = dateObj.desc;
    descInput.dataset.descId = dateObj.id;

    descInput.oninput = (e) => {
        dateObj.desc = e.target.value;
        if (dateObj.isDraft && dateObj.desc.trim() !== '') {
            promoteDraft(dateObj);
            syncDraftDate(event);
            appendDraftDate(event, datesList);
            dateItem.style.borderStyle = 'solid';
            dateItem.style.opacity = '1';
        }
        saveLocal();
    };

    descInput.onblur = () => onDateDescBlur(event, dateObj);

    dateItem.appendChild(topRow);
    dateItem.appendChild(descInput);

    const fpInstance = flatpickr(dInput, {
        locale: 'ru',
        dateFormat: 'd.m.Y',
        defaultDate: dateObj.val || null,
        onChange: (_, dateStr) => {
            dateObj.val = dateStr;
            if (dateObj.isDraft) promoteDraft(dateObj);
            syncDraftDate(event);
            render();
            saveLocal();
        }
    });
    flatpickrInstances.set(dateObj.id, fpInstance);

    return { dateItem, descInput };
}


// --- Метки ---

const DEFAULT_LABEL_COLOR = '#252525'; // --input-bg

function createLabel(name) {
    return { id: `label-${Date.now()}`, name, color: DEFAULT_LABEL_COLOR };
}

// Закрыть все открытые дропдауны меток
function closeAllLabelDropdowns() {
    document.querySelectorAll('.label-dropdown').forEach(d => d.remove());
}

// Pill-бейджи выбранных меток на строке события
function buildLabelBadges(event) {
    const wrap = document.createElement('div');
    wrap.className = 'label-badges';

    // Берем только первую метку из массива (теперь это категория)
    const labelId = (event.labelIds || [])[0];
    const label = state.labels.find(l => l.id === labelId);

    if (label) {
        const badge = document.createElement('span');
        badge.className = 'label-badge';
        badge.textContent = label.name;
        badge.style.background = label.color;
        badge.style.color = '#ccc';
        badge.title = label.name; // Подсказка при наведении, если текст обрезан
        wrap.appendChild(badge);
    }

    return wrap;
}

// Кнопка + выпадающее меню меток (только выбор существующих)
function buildLabelButton(event, row) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-small label-btn';
    btn.title = 'Метки';
    btn.textContent = '🏷️';

    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        const existing = row.querySelector('.label-dropdown');
        closeAllLabelDropdowns();
        if (existing) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'label-dropdown';

        // Если меток вообще нет, можно вывести подсказку
        if (state.labels.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'label-dropdown-item';
            emptyMsg.style.color = '#666';
            emptyMsg.textContent = 'Нет созданных меток';
            dropdown.appendChild(emptyMsg);
        }

        // Только существующие метки
        state.labels.forEach(label => {
            const item = document.createElement('div');
            item.className = 'label-dropdown-item';

            const checked = (event.labelIds || []).includes(label.id);
            if (checked) item.classList.add('label-dropdown-item--checked');

            const dot = document.createElement('span');
            dot.className = 'label-dot';
            dot.style.background = label.color;

            const name = document.createElement('span');
            name.textContent = label.name;

            item.appendChild(dot);
            item.appendChild(name);

            item.addEventListener('click', (e) => {
                e.stopPropagation();

                if (!event.labelIds) event.labelIds = [];

                if (checked) {
                    // Если кликнули по уже выбранной — снимаем выделение
                    event.labelIds = [];
                } else {
                    // Если кликнули по новой — заменяем старую (эксклюзивный выбор)
                    event.labelIds = [label.id];
                }

                closeAllLabelDropdowns();

                // Обновляем бейджи в строке
                const badges = row.querySelector('.label-badges');
                const newBadges = buildLabelBadges(event);
                row.replaceChild(newBadges, badges);
                saveLocal();
            });

            dropdown.appendChild(item);
        });

        btn.parentElement.style.position = 'relative';
        btn.parentElement.appendChild(dropdown);
    });

    return btn;
}

// --- Основной рендер ---

function render(focusId = null) {
    destroyAllFlatpickr();

    const list = document.getElementById('events-list');
    list.innerHTML = '';

    state.events.forEach(event => {
        const row = document.createElement('div');
        row.className = 'event-row';

        // --- 1. Контейнер и поле названия ---
        const nameContainer = document.createElement('div');
        nameContainer.className = 'name-container';

        const nameInput = document.createElement('input');
        nameInput.className = 'event-name-input';
        nameInput.value = event.name;
        nameInput.placeholder = 'Название события...';
        nameInput.dataset.eventId = event.id;

        if (focusId === event.id) {
            setTimeout(() => nameInput.focus(), 0);
        }
        const countdownEl = document.createElement('div');
        countdownEl.className = 'event-countdown';
        countdownEl.textContent = getCountdownText(event);

        nameContainer.appendChild(nameInput);
        nameContainer.appendChild(countdownEl);

        // --- 2. Ячейка категории (метки) ---
        const labelCell = renderLabelCell(event, row);

        // --- 3. Список дат ---
        const datesList = document.createElement('div');
        datesList.className = 'dates-list';

        nameInput.oninput = (e) => {
            event.name = e.target.value;
            // Если ввели первый символ и еще нет черновика — создаем его
            if (event.name.length === 1 && !event.dates.some(d => d.isDraft)) {
                syncDraftDate(event);
                appendDraftDate(event, datesList);
            }
            saveLocal();
        };

        nameInput.onblur = () => onEventNameBlur(event);

        // Отрисовка существующих дат
        event.dates.forEach(dateObj => {
            const { dateItem, descInput } = buildDateItem(event, dateObj, datesList);
            if (focusId === dateObj.id) {
                setTimeout(() => descInput.focus(), 0);
            }
            datesList.appendChild(dateItem);
        });

        // --- 4. Кнопки управления (Удалить событие) ---
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

        // --- Сборка строки ---
        row.appendChild(nameContainer);
        row.appendChild(labelCell);
        row.appendChild(datesList);
        row.appendChild(controls);

        list.appendChild(row);
    });
}

// --- Действия ---

function addEvent() {
    const event = createEvent();
    state.events.push(event);
    render(event.id);
    saveLocal();
}

function stateForStorage() {
    return {
        ...state,
        events: state.events.map(event => ({
            ...event,
            dates: event.dates
                .filter(d => !d.isDraft)
                .map(({ isDraft, ...rest }) => rest)
        }))
    };
}

function saveLocal() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem('event_app_data', JSON.stringify(stateForStorage()));
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
        if (!content) return;

        const remote = JSON.parse(content);
        const remoteTs = remote.updatedAt ? new Date(remote.updatedAt) : null;
        const localTs = state.updatedAt ? new Date(state.updatedAt) : null;

        if (remoteTs && localTs && remoteTs <= localTs) {
            // Локальные данные новее или совпадают — не перезаписываем
            document.getElementById('sync-status').innerText =
                'Gist актуален, локальные данные новее';
            return;
        }

        state = remote;
        if (!state.labels) state.labels = [];
        state.events.forEach(event => {
            if (!event.labelIds) event.labelIds = [];
            syncDraftDate(event);
        });
        render();
        document.getElementById('sync-status').innerText =
            'Данные загружены из Gist (' + new Date(remoteTs).toLocaleTimeString() + ')';
    } catch (e) {
        console.error('Ошибка загрузки Gist:', e);
    }
}

async function saveToGist() {
    const token = getToken();
    if (!token || !GIST_ID) { openSettings(); return; }

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
                files: { [GIST_FILENAME]: { content: JSON.stringify(stateForStorage(), null, 2) } }
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

// --- Настройки ---

function toggleModal(show) {
    document.getElementById('settings-modal').style.display = show ? 'flex' : 'none';
}

function openSettings() {
    const input = document.getElementById('settings-input');
    // Показываем только Gist ID, токен не восстанавливаем
    input.value = GIST_ID ? `${GITHUB_TOKEN}\n${GIST_ID}` : '';
    toggleModal(true);
}

function saveSettings() {
    const lines = document.getElementById('settings-input').value
        .split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length < 2) { alert('Введите две строки: Токен и Gist ID'); return; }

    setToken(lines[0]);
    GIST_ID = lines[1];
    localStorage.setItem('gh_gist_id', GIST_ID);
    toggleModal(false);

    if (getToken() && GIST_ID) loadFromGist();
}

// --- Инициализация ---

document.addEventListener('DOMContentLoaded', () => {
    const local = localStorage.getItem('event_app_data');
    if (local) {
        state = JSON.parse(local);
        if (!state.labels) state.labels = [];
        state.events.forEach(event => {
            if (!event.labelIds) event.labelIds = [];
            syncDraftDate(event);
        });
        render();
    }

    if (getToken() && GIST_ID) loadFromGist();

    document.getElementById('add-event-btn').onclick = addEvent;
    document.getElementById('sort-btn').addEventListener('click', (e) => { e.preventDefault(); sortAll(); });
    document.getElementById('sync-btn').onclick = saveToGist;
    document.getElementById('settings-btn').onclick = openSettings;
    document.getElementById('settings-save').onclick = saveSettings;
    document.getElementById('settings-cancel').onclick = () => toggleModal(false);

    document.addEventListener('click', () => closeAllLabelDropdowns());

    const labelsBtn = document.getElementById('labels-mgmt-btn');
    if (labelsBtn) {
        labelsBtn.onclick = toggleLabelsMenu;
    }

    // Закрытие меню при клике вне его
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('labels-mgmt-dropdown');
        const btn = document.getElementById('labels-mgmt-btn');

        // Закрываем, только если клик НЕ по кнопке открытия И НЕ внутри самого меню
        if (dropdown && dropdown.style.display === 'flex') {
            if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        }
    });

    // Обработка горячих клавиш
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.code === 'KeyS') {
            e.preventDefault();
            saveToGist();
        }
    });
});

// --- Сортировка ---

// Парсит дату вида "dd.mm.yyyy" в объект Date. Возвращает null если пусто.
function parseDate(str) {
    if (!str || str.trim() === '') return null;
    const [d, m, y] = str.trim().split('.').map(Number);
    return new Date(y, m - 1, d);
}

// Возвращает минимальную реальную дату события или null если дат нет.
function firstRealDate(event) {
    const dates = event.dates
        .filter(d => !d.isDraft && d.val.trim() !== '')
        .map(d => parseDate(d.val))
        .filter(Boolean);
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates));
}

function sortAll() {
    // 1. Сортируем даты внутри каждого события
    state.events.forEach(event => {
        const real = event.dates
            .filter(d => !d.isDraft)
            .sort((a, b) => {
                const da = parseDate(a.val);
                const db = parseDate(b.val);
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return da - db;
            });
        const draft = event.dates.filter(d => d.isDraft);
        event.dates = [...real, ...draft];
    });

    // 2. Сортируем события по первой дате; события без дат — в конец
    state.events.sort((a, b) => {
        const da = firstRealDate(a);
        const db = firstRealDate(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
    });

    render();
    saveLocal();
}

// --- Логика управления метками ---

function toggleLabelsMenu(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('labels-mgmt-dropdown');
    const isVisible = dropdown.style.display === 'flex';

    if (!isVisible) {
        dropdown.style.display = 'flex';
        renderLabelsMgmt();
    } else {
        dropdown.style.display = 'none';
    }
}

function renderLabelsMgmt() {
    const container = document.getElementById('labels-mgmt-dropdown');
    // Не меняем display здесь, только контент
    container.innerHTML = '';

    // 1. Список существующих меток
    state.labels.forEach(label => {
        const row = document.createElement('div');
        row.className = 'label-mgmt-item';

        // Цвет
        const colorInp = document.createElement('input');
        colorInp.type = 'color';
        colorInp.className = 'label-color-picker';
        colorInp.value = label.color || '#252525';
        colorInp.onchange = (e) => {
            label.color = e.target.value;
            saveLocal();
            render();
        };

        // Название
        const nameInp = document.createElement('input');
        nameInp.className = 'label-mgmt-name';
        nameInp.value = label.name;
        nameInp.onblur = (e) => {
            label.name = e.target.value.trim() || 'Без названия';
            saveLocal();
            render();
        };

        // Кнопка удаления
        const actions = document.createElement('div');
        actions.className = 'label-mgmt-actions';

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-icon';
        delBtn.innerHTML = '🗑️';
        delBtn.onclick = (e) => {
            e.stopPropagation(); // Важно: не закрывать меню
            state.labels = state.labels.filter(l => l.id !== label.id);
            state.events.forEach(ev => {
                if (ev.labelIds) ev.labelIds = ev.labelIds.filter(id => id !== label.id);
            });
            saveLocal();
            renderLabelsMgmt(); // Перерисовываем только содержимое
            render(); // Обновляем основной список
        };

        actions.appendChild(delBtn);
        row.appendChild(colorInp);
        row.appendChild(nameInp);
        row.appendChild(actions);
        container.appendChild(row);
    });

    // 2. Строка создания новой метки
    const newRow = document.createElement('div');
    newRow.className = 'new-label-row';

    const newInp = document.createElement('input');
    newInp.type = 'text';
    newInp.id = 'new-label-name';
    newInp.className = 'label-mgmt-name';
    newInp.placeholder = 'Новая метка...';
    newInp.style.background = '#111';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-small';
    addBtn.innerText = 'OK';

    addBtn.onclick = (e) => {
        e.stopPropagation(); // Важно: не закрывать меню
        const name = newInp.value.trim();
        if (name) {
            state.labels.push({ id: 'label-' + Date.now(), name, color: '#0078d4' });
            saveLocal();
            renderLabelsMgmt(); // Перерисовываем содержимое, меню остается открытым
            render();
            // Опционально: вернуть фокус в поле ввода новой метки
            document.getElementById('new-label-name').focus();
        }
    };

    // Поддержка Enter в поле ввода
    newInp.onkeydown = (e) => {
        if (e.key === 'Enter') addBtn.click();
    };

    newRow.appendChild(newInp);
    newRow.appendChild(addBtn);
    container.appendChild(newRow);
}

function renderLabelCell(event, row) {
    const cell = document.createElement('div');
    cell.className = 'label-cell';

    // Прямое обращение к свойству labelId
    const currentLabelId = event.labelId;
    const label = state.labels.find(l => l.id === currentLabelId);

    if (label) {
        const badge = document.createElement('span');
        badge.className = 'label-badge';
        badge.textContent = label.name;
        badge.style.background = label.color;
        badge.style.color = '#eee';
        badge.title = label.name;
        cell.appendChild(badge);
    } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'label-placeholder';
        placeholder.textContent = '🏷️';
        cell.appendChild(placeholder);
    }

    cell.onclick = (e) => {
        e.stopPropagation();

        const existing = document.querySelector('.label-dropdown');
        if (existing) {
            const parent = existing.parentElement;
            existing.remove();
            if (parent === cell) return;
        }

        const dropdown = document.createElement('div');
        dropdown.className = 'label-dropdown';

        state.labels.forEach(l => {
            const item = document.createElement('div');
            item.className = 'label-dropdown-item';
            if (l.id === currentLabelId) item.classList.add('label-dropdown-item--checked');

            item.innerHTML = `
                <span class="label-dot" style="background:${l.color}"></span>
                <span>${l.name}</span>
            `;

            item.onclick = (e) => {
                e.stopPropagation();

                // Логика переключения: если нажали на ту же — сбрасываем в null, иначе записываем ID
                event.labelId = (l.id === currentLabelId) ? null : l.id;

                dropdown.remove();
                const newCell = renderLabelCell(event, row);
                row.replaceChild(newCell, cell);
                saveLocal();
            };

            dropdown.appendChild(item);
        });

        cell.appendChild(dropdown);
    };

    return cell;
}

function processLoadedData(data) {
    state = data;
    if (!state.labels) state.labels = [];

    state.events.forEach(event => {
        if (!event.labelId) event.labelId = null; // Переход на одиночное поле

        // Помечаем все загруженные даты как реальные
        event.dates.forEach(d => {
            d.isDraft = false;
        });

        // Добавляем пустой черновик в конец (только в ОЗУ)
        syncDraftDate(event);
    });
    render();
}

function getCountdownText(event) {
    const firstDate = firstRealDate(event);
    if (!firstDate) return "-";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(firstDate);
    target.setHours(0, 0, 0, 0);

    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "наступило";
    if (diffDays === 0) return "сегодня"; // Добавим для точности
    if (diffDays > 365) return "> 1 года";
    if (diffDays > 30) {
        const months = Math.floor(diffDays / 30);
        return `> ${months} мес.`;
    }
    return `${diffDays} дн.`;
}