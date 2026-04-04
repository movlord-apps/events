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
    return { id: Date.now(), name: '', dates: [], labelIds: [] };
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
    // Гарантирует ровно один черновик в конце, если у события есть имя
    const realDates = event.dates.filter(d => !d.isDraft);
    if (event.name.trim().length > 0) {
        event.dates = [...realDates, createDraftDate(event.id)];
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

    const labels = (event.labelIds || [])
        .map(id => state.labels.find(l => l.id === id))
        .filter(Boolean);

    labels.forEach(label => {
        const badge = document.createElement('span');
        badge.className = 'label-badge';
        badge.textContent = label.name;
        badge.style.background = label.color;
        // Светлый текст на тёмном фоне (всегда тёмный фон по умолчанию)
        badge.style.color = '#ccc';
        wrap.appendChild(badge);
    });

    return wrap;
}

// Кнопка + выпадающее меню меток
function buildLabelButton(event, row) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-small label-btn';
    btn.title = 'Метки';
    btn.textContent = '🏷';

    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        // Если уже открыт — закрыть
        const existing = row.querySelector('.label-dropdown');
        closeAllLabelDropdowns();
        if (existing) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'label-dropdown';

        // Существующие метки
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
                    event.labelIds = event.labelIds.filter(id => id !== label.id);
                } else {
                    event.labelIds.push(label.id);
                }
                closeAllLabelDropdowns();
                // Перерисовать только бейджи без полного render()
                const badges = row.querySelector('.label-badges');
                const newBadges = buildLabelBadges(event);
                row.replaceChild(newBadges, badges);
                saveLocal();
            });

            dropdown.appendChild(item);
        });

        // Разделитель (только если есть метки)
        if (state.labels.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'label-dropdown-sep';
            dropdown.appendChild(sep);
        }

        // Пункт "Новая метка"
        const newItem = document.createElement('div');
        newItem.className = 'label-dropdown-item label-dropdown-new';

        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.placeholder = 'Название метки...';
        newInput.className = 'label-new-input';

        newInput.addEventListener('click', e => e.stopPropagation());

        newInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmNewLabel();
            if (e.key === 'Escape') closeAllLabelDropdowns();
        });

        newInput.addEventListener('blur', () => {
            // Небольшая задержка чтобы не закрыться раньше клика по кнопке
            setTimeout(confirmNewLabel, 150);
        });

        function confirmNewLabel() {
            const name = newInput.value.trim();
            if (!name) { closeAllLabelDropdowns(); return; }
            const label = createLabel(name);
            state.labels.push(label);
            if (!event.labelIds) event.labelIds = [];
            event.labelIds.push(label.id);
            closeAllLabelDropdowns();
            const badges = row.querySelector('.label-badges');
            const newBadges = buildLabelBadges(event);
            row.replaceChild(newBadges, badges);
            saveLocal();
        }

        newItem.appendChild(newInput);
        dropdown.appendChild(newItem);

        // Позиционируем под кнопкой
        btn.parentElement.style.position = 'relative';
        btn.parentElement.appendChild(dropdown);

        setTimeout(() => newInput.focus(), 0);
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

        const nameInput = document.createElement('input');
        nameInput.className = 'event-name-input';
        nameInput.value = event.name;
        nameInput.placeholder = 'Название события...';
        nameInput.dataset.eventId = event.id;

        if (focusId === event.id) {
            setTimeout(() => nameInput.focus(), 0);
        }

        const labelBadges = buildLabelBadges(event);

        const labelBtnWrap = document.createElement('div');
        labelBtnWrap.className = 'label-btn-wrap';
        labelBtnWrap.appendChild(buildLabelButton(event, row));

        const datesList = document.createElement('div');
        datesList.className = 'dates-list';

        nameInput.oninput = (e) => {
            event.name = e.target.value;
            if (event.name.length === 1 && !event.dates.some(d => d.isDraft)) {
                syncDraftDate(event);
                appendDraftDate(event, datesList);
            }
            saveLocal();
        };

        nameInput.onblur = () => onEventNameBlur(event);

        event.dates.forEach(dateObj => {
            const { dateItem, descInput } = buildDateItem(event, dateObj, datesList);
            if (focusId === dateObj.id) {
                setTimeout(() => descInput.focus(), 0);
            }
            datesList.appendChild(dateItem);
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
        row.appendChild(labelBadges);
        row.appendChild(labelBtnWrap);
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
    // Черновики — UI-состояние, в JSON не сохраняем
    return {
        ...state,
        events: state.events.map(event => ({
            ...event,
            dates: event.dates.filter(d => !d.isDraft)
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