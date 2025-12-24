// ===== TELEGRAM WEBAPP INITIALIZATION =====
(function() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try {
      tg.expand();
      tg.ready();
    } catch (e) {
      // Handle initialization errors silently
    }
  }
})();

// ===== CONSTANTS =====
const SETS = {
  'cyr-upper': "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ".split(""),
  'cyr-lower': "абвгдеёжзийклмнопрстуфхцчшщъыьэюя".split(""),
  'lat-upper': "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  'lat-lower': "abcdefghijklmnopqrstuvwxyz".split(""),
  'digits': "0123456789.,:;!?–—()[]{}".split("")
};

const PREVIEW_TEXT = {
  'cyr-upper': 'СЪЕШЬ ЕЩЁ ЭТИХ МЯГКИХ ФРАНЦУЗСКИХ БУЛОК, ДА ВЫПЕЙ ЧАЮ',
  'cyr-lower': 'съешь ещё этих мягких французских булок, да выпей чаю',
  'lat-upper': 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
  'lat-lower': 'the quick brown fox jumps over the lazy dog',
  'digits': '0123456789 !?.,:;–—()[]{}'
};

const STORAGE_KEY = 'emojiFontGlyphs';
const API_BASE_URL = 'https://jsonplaceholder.typicode.com';

// ===== GLOBAL STATE =====
let currentSetKey = 'cyr-upper';
let letters = [...SETS[currentSetKey]];
let curIndex = 0;
const glyphs = new Map();
let isDirty = false;
let currentMode = 'alphabet'; 
let customPhrase = '';

// ===== DOM ELEMENTS =====
const selectEl = document.getElementById('alphabetSelect');
const chipRow = document.getElementById('chipRow');
const saveBtn = document.getElementById('save');
const curLetterLabel = document.getElementById('curLetterLabel');
const toastEl = document.getElementById('toast');

// New elements for segmented control
const alphabetModeBtn = document.getElementById('alphabetMode');
const customModeBtn = document.getElementById('customMode');
const alphabetBox = document.getElementById('alphabetBox');
const phraseBox = document.getElementById('phraseBox');
const customPhraseInput = document.getElementById('customPhrase');

const board = document.getElementById('board');
const pad = document.getElementById('pad');
const guide = document.getElementById('guide');
const ctx = pad.getContext('2d');
const gtx = guide.getContext('2d');
const brush = document.getElementById('brush');
const clearBtn = document.getElementById('clear');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');

// New elements for tool segmented control
const brushModeBtn = document.getElementById('brushMode');
const eraserModeBtn = document.getElementById('eraserMode');

// Download archive button
const downloadArchiveBtn = document.getElementById('downloadArchive');

// ===== DRAWING STATE =====
let drawing = false;
let last = null;
let undoStack = [];
let redoStack = [];
let currentTool = 'brush'; // 'brush' or 'eraser'

// ===== CANVAS MANAGEMENT =====
function resizeCanvases() {
  const rect = board.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  
  [pad, guide].forEach(c => {
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    c.style.width = c.style.height = `${size}px`;
  });
  
  drawGuide();
  pushUndo();
}

// ===== TOAST NOTIFICATIONS =====
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hide');
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add('hide'), 1600);
}

// ===== UNDO/REDO SYSTEM =====
function updateUndoRedo() {
  undoBtn.disabled = undoStack.length <= 1;
  redoBtn.disabled = redoStack.length === 0;
}

function pushUndo() {
  try {
    undoStack.push(pad.toDataURL());
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
    updateUndoRedo();
  } catch (e) {
    // Handle canvas data URL errors
  }
}

function restoreFromDataURL(data) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, pad.width, pad.height);
    ctx.drawImage(img, 0, 0, pad.width, pad.height);
    updateUndoRedo();
  };
  img.src = data;
}

// ===== CHARACTER MANAGEMENT =====
function extractUniqueChars(text) {
  const chars = [];
  const seen = new Set();
  
  for (const char of text) {
    if (!seen.has(char) && char.trim() !== '') {
      chars.push(char);
      seen.add(char);
    }
  }
  
  return chars;
}

function updateLetters() {
  if (currentMode === 'alphabet') {
    letters = [...SETS[currentSetKey]];
  } else {
    if (customPhrase.trim() === '') {
      // If no custom phrase, show space as placeholder
      letters = [' '];
    } else {
      letters = extractUniqueChars(customPhrase);
    }
  }
  
  // Reset to first character if current index is out of bounds
  if (curIndex >= letters.length) {
    curIndex = 0;
  }
}

function renderChips() {
  chipRow.innerHTML = '';
  letters.forEach((ch, i) => {
    const div = document.createElement('div');
    let cls = 'chip';
    if (glyphs.has(ch)) cls += ' done';
    if (i === curIndex) cls += ' active';
    div.className = cls;
    div.textContent = ch;
    div.onclick = () => {
      saveIfDirty();
      switchTo(i);
    };
    chipRow.appendChild(div);
  });
  chipRow.children[curIndex]?.scrollIntoView({
    inline: 'center',
    block: 'nearest',
    behavior: 'smooth'
  });
}

function setPrevNextLabels() {
  const prev = letters[(curIndex - 1 + letters.length) % letters.length];
  const next = letters[(curIndex + 1) % letters.length];
  
  // Handle space character display
  const prevDisplay = prev === ' ' ? '‹   ' : `‹ ${prev}`;
  const nextDisplay = next === ' ' ? '   ›' : `${next} ›`;
  
  document.getElementById('prev').textContent = prevDisplay;
  document.getElementById('next').textContent = nextDisplay;
}

function setLetterLabel() {
  const currentChar = letters[curIndex];
  curLetterLabel.textContent = currentChar === ' ' ? '   ' : currentChar;
  setPrevNextLabels();
}

function switchTo(i) {
  saveIfDirty();
  curIndex = (i + letters.length) % letters.length;
  setLetterLabel();
  resetPad(glyphs.get(letters[curIndex]));
  renderChips();
}

function hasAnySaved() {
  return [...glyphs.keys()].some(ch => letters.includes(ch));
}

// ===== CANVAS UTILITIES =====
function isCanvasEmpty() {
  const imageData = ctx.getImageData(0, 0, pad.width, pad.height);
  const data = imageData.data;
  // Проверяем альфа-канал каждого пикселя
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return false; // Найден непрозрачный пиксель
  }
  return true; // Все пиксели прозрачные
}

// ===== LOCALSTORAGE PERSISTENCE =====
function saveGlyphsToStorage() {
  try {
    // Конвертируем Map в объект для сохранения
    const glyphsObject = Object.fromEntries(glyphs);
    const dataToSave = JSON.stringify(glyphsObject);
    
    localStorage.setItem(STORAGE_KEY, dataToSave);
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      showToast('Недостаточно места для сохранения');
      console.error('LocalStorage переполнен:', error);
    } else {
      console.error('Ошибка сохранения в localStorage:', error);
    }
    return false;
  }
}

function loadGlyphsFromStorage() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (!savedData) return false;
    
    const glyphsObject = JSON.parse(savedData);
    
    // Очищаем текущие глифы и загружаем сохраненные
    glyphs.clear();
    for (const [char, dataURL] of Object.entries(glyphsObject)) {
      glyphs.set(char, dataURL);
    }
    
    return true;
  } catch (error) {
    console.error('Ошибка загрузки из localStorage:', error);
    // При ошибке очищаем поврежденные данные
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Игнорируем ошибки при удалении
    }
    return false;
  }
}

// ===== API INTEGRATION =====
async function saveGlyphToAPI(char, dataURL) {
  try {
    const response = await fetch(`${API_BASE_URL}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        char: char,
        dataURL: dataURL,
        userId: 1
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    console.log('Symbol saved to API:', char, result);
  } catch (error) {
    console.error('Error saving symbol to API:', error);
    // Не прерываем работу приложения при ошибках API
  }
}

async function deleteGlyphFromAPI(char) {
  try {
    const response = await fetch(`${API_BASE_URL}/posts/1`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log('Symbol deleted from API:', char);
  } catch (error) {
    console.error('Error deleting symbol from API:', error);
    // Не прерываем работу приложения при ошибках API
  }
}

async function getStickerPackLink() {
  try {
    const response = await fetch(`${API_BASE_URL}/posts/1`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    // Используем данные из API для формирования ссылки
    // В реальном API здесь была бы ссылка на стикерпак
    // Для демонстрации используем статическую ссылку
    return "https://t.me/addstickers/mytype_demo";
  } catch (error) {
    console.error('Error getting sticker pack link from API:', error);
    // Fallback на статическую ссылку при ошибке
    return "https://t.me/addstickers/mytype_demo";
  }
}

function saveIfDirty() {
  if (!isDirty) return;
  
  const currentChar = letters[curIndex];
  const isEmpty = isCanvasEmpty();
  
  if (isEmpty && currentChar !== ' ') {
    // Удаляем пустой символ (кроме пробела)
    glyphs.delete(currentChar);
    // Отправляем DELETE запрос в API
    deleteGlyphFromAPI(currentChar);
  } else {
    // Сохраняем/перезаписываем символ
    const dataURL = pad.toDataURL('image/png');
    glyphs.set(currentChar, dataURL);
    // Отправляем POST запрос в API
    saveGlyphToAPI(currentChar, dataURL);
  }
  
  isDirty = false;
  renderChips();
  updateDownloadButtonState();
  // Сохраняем изменения в localStorage
  saveGlyphsToStorage();
}

// ===== DOWNLOAD ARCHIVE FUNCTIONALITY =====
function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Маппинг названий специальных символов
const SPECIAL_CHAR_NAMES = {
  ' ': 'пробел',
  '.': 'точка',
  ',': 'запятая',
  ':': 'двоеточие',
  ';': 'точка с запятой',
  '!': 'восклицательный знак',
  '?': 'вопросительный знак',
  '–': 'короткое тире',
  '—': 'длинное тире',
  '(': 'открывающая скобка',
  ')': 'закрывающая скобка',
  '[': 'открывающая квадратная скобка',
  ']': 'закрывающая квадратная скобка',
  '{': 'открывающая фигурная скобка',
  '}': 'закрывающая фигурная скобка'
};

function getCharSetType(char) {
  // Определяем, к какому набору относится символ
  if (SETS['cyr-upper'].includes(char)) return 'cyr';
  if (SETS['cyr-lower'].includes(char)) return 'cyr';
  if (SETS['lat-upper'].includes(char)) return 'lat';
  if (SETS['lat-lower'].includes(char)) return 'lat';
  return null;
}

function sanitizeFileName(char) {
  // Для пробела и специальных символов используем их названия
  if (SPECIAL_CHAR_NAMES[char]) {
    return SPECIAL_CHAR_NAMES[char];
  }
  
  // Для букв добавляем указание алфавита
  const setType = getCharSetType(char);
  if (setType) {
    return `${char} ${setType}`;
  }
  
  // Для цифр и других символов используем как есть (или код, если нужно)
  if (/^[0-9]$/.test(char)) {
    return char;
  }
  
  // Для неизвестных символов используем Unicode код
  const code = char.charCodeAt(0);
  return `char_${code}`;
}

async function downloadGlyphsArchive() {
  // Проверка наличия сохраненных глифов
  if (glyphs.size === 0) {
    showToast('Нет сохраненных символов для скачивания');
    return;
  }

  // Проверка поддержки File System Access API
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      
      let savedCount = 0;
      for (const [char, dataURL] of glyphs) {
        try {
          const blob = dataURLtoBlob(dataURL);
          const fileName = `${sanitizeFileName(char)}.png`;
          const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          savedCount++;
        } catch (error) {
          console.error(`Ошибка при сохранении файла ${char}.png:`, error);
        }
      }
      
      if (savedCount > 0) {
        showToast(`Сохранено ${savedCount} файл(ов)`);
      } else {
        showToast('Не удалось сохранить файлы');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        // Пользователь отменил выбор папки
        return;
      }
      console.error('Ошибка File System Access API:', error);
      // Fallback на множественное скачивание
      downloadGlyphsFallback();
    }
  } else {
    // Fallback для браузеров без поддержки File System Access API
    downloadGlyphsFallback();
  }
}

function downloadGlyphsFallback() {
  if (glyphs.size === 0) {
    showToast('Нет сохраненных символов для скачивания');
    return;
  }

  let downloadCount = 0;
  const entries = Array.from(glyphs.entries());
  
  // Функция для скачивания одного файла с задержкой
  function downloadNext(index) {
    if (index >= entries.length) {
      if (downloadCount > 0) {
        showToast(`Скачано ${downloadCount} файл(ов)`);
      }
      return;
    }

    const [char, dataURL] = entries[index];
    try {
      const blob = dataURLtoBlob(dataURL);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFileName(char)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      downloadCount++;
    } catch (error) {
      console.error(`Ошибка при скачивании файла ${char}.png:`, error);
    }
    
    // Небольшая задержка между скачиваниями для избежания блокировки браузера
    setTimeout(() => downloadNext(index + 1), 100);
  }
  
  downloadNext(0);
}

function updateDownloadButtonState() {
  if (downloadArchiveBtn) {
    downloadArchiveBtn.disabled = glyphs.size === 0;
  }
}

// ===== DRAWING FUNCTIONS =====
function drawGuide() {
  const sizePx = pad.width;
  gtx.clearRect(0, 0, guide.width, guide.height);
  gtx.globalAlpha = 0.14;
  gtx.fillStyle = '#000';
  gtx.textAlign = 'center';
  gtx.textBaseline = 'middle';
  const fontPx = sizePx * 0.72;
  gtx.font = `bold ${fontPx}px system-ui, sans-serif`;
  gtx.fillText(letters[curIndex], sizePx / 2, sizePx / 2);
  gtx.globalAlpha = 1;
}

function resetPad(fromDataURL) {
  ctx.clearRect(0, 0, pad.width, pad.height);
  drawGuide();
  if (fromDataURL) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, pad.width, pad.height);
    img.src = fromDataURL;
  }
  pushUndo();
  isDirty = false;
}

// ===== DRAWING EVENT HANDLERS =====
function pointer(e) {
  const r = pad.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  return { x: x * dpr, y: y * dpr };
}

function start(e) {
  e.preventDefault();
  drawing = true;
  last = pointer(e);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = +brush.value * dpr;
  const isEraser = currentTool === 'eraser';
  ctx.strokeStyle = isEraser ? '#ffffff' : '#111827';
  ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
}

function move(e) {
  if (!drawing) return;
  const p = pointer(e);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
  isDirty = true;
}

function end() {
  if (!drawing) return;
  drawing = false;
  pushUndo();
}

// ===== PREVIEW FUNCTIONALITY =====
const modalPreview = document.getElementById('modalPreview');
const openPreview = document.getElementById('openPreview');
const closePreview = document.getElementById('closePreview');
const previewInput = document.getElementById('previewInput');
const previewArea = document.getElementById('previewArea');

function getPreviewPlaceholder() {
  if (currentMode === 'custom' && customPhrase.trim()) {
    return customPhrase;
  }
  return PREVIEW_TEXT[currentSetKey] || PREVIEW_TEXT['cyr-upper'];
}

function renderPreview(text) {
  previewArea.innerHTML = '';
  if (!text) text = getPreviewPlaceholder();
  
  for (const ch of text) {
    const key = letters.includes(ch) ? ch : 
                letters.includes(ch.toUpperCase()) ? ch.toUpperCase() : ch;
    
    if (glyphs.has(key)) {
      const img = document.createElement('img');
      img.className = 'tiny-glyph';
      img.src = glyphs.get(key);
      previewArea.appendChild(img);
    } else {
      const span = document.createElement('span');
      span.textContent = ch;
      span.style.fontWeight = '600';
      previewArea.appendChild(span);
    }
  }
}

// ===== PACK CREATION =====
const modalSuccess = document.getElementById('modalSuccess');
const closeSuccess = document.getElementById('closeSuccess');
const packLinkEl = document.getElementById('packLink');
const copyLinkBtn = document.getElementById('copyLink');
const createBtn = document.getElementById('create');

function setCreateLoading(on) {
  const icon = createBtn.querySelector('.btn-icon');
  const text = createBtn.querySelector('.btn-text');
  
  if (on) {
    createBtn.classList.add('loading');
    icon.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
    text.textContent = 'Создаём…';
  } else {
    createBtn.classList.remove('loading');
    icon.innerHTML = '<img src="assets/upload-icon.svg" alt="Создать пак" class="icon-28">';
    text.textContent = 'Создать пак';
  }
}

// ===== MODE SWITCHING =====
function switchMode(mode) {
  currentMode = mode;
  
  // Update segmented control
  alphabetModeBtn.classList.toggle('active', mode === 'alphabet');
  customModeBtn.classList.toggle('active', mode === 'custom');
  
  // Show/hide appropriate controls
  alphabetBox.style.display = mode === 'alphabet' ? 'block' : 'none';
  phraseBox.style.display = mode === 'custom' ? 'block' : 'none';
  
  // Update letters and reset state
  saveIfDirty();
  updateLetters();
  curIndex = 0;
  renderChips();
  setLetterLabel();
  resetPad(glyphs.get(letters[curIndex]));
}

// ===== TOOL SWITCHING =====
function switchTool(tool) {
  currentTool = tool;
  
  // Update tool segmented control
  brushModeBtn.classList.toggle('active', tool === 'brush');
  eraserModeBtn.classList.toggle('active', tool === 'eraser');
}

function handleCustomPhraseChange() {
  customPhrase = customPhraseInput.value;
  if (currentMode === 'custom') {
    saveIfDirty();
    updateLetters();
    curIndex = 0;
    renderChips();
    setLetterLabel();
    resetPad(glyphs.get(letters[curIndex]));
  }
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
  // Canvas resize observer
  new ResizeObserver(resizeCanvases).observe(board);
  
  // Drawing events
  pad.addEventListener('pointerdown', start);
  pad.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  pad.addEventListener('touchstart', start, { passive: false });
  pad.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);
  
  // Tool segmented control
  brushModeBtn.onclick = () => switchTool('brush');
  eraserModeBtn.onclick = () => switchTool('eraser');
  
  undoBtn.onclick = () => {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    restoreFromDataURL(undoStack.at(-1));
  };
  
  redoBtn.onclick = () => {
    if (!redoStack.length) return;
    const data = redoStack.pop();
    undoStack.push(data);
    restoreFromDataURL(data);
  };
  
  clearBtn.onclick = () => {
    ctx.clearRect(0, 0, pad.width, pad.height);
    pushUndo();
    isDirty = false;
  };
  
  // Navigation
  document.getElementById('prev').addEventListener('click', (e) => {
    e.preventDefault();
    switchTo(curIndex - 1);
  });
  
  document.getElementById('next').addEventListener('click', (e) => {
    e.preventDefault();
    switchTo(curIndex + 1);
  });
  
  // Preview modal
  openPreview.onclick = () => {
    previewInput.value = getPreviewPlaceholder();
    renderPreview(previewInput.value);
    modalPreview.classList.add('show');
  };
  
  closePreview.onclick = () => modalPreview.classList.remove('show');
  
  modalPreview.addEventListener('click', e => {
    if (e.target === modalPreview) modalPreview.classList.remove('show');
  });
  
  previewInput.addEventListener('input', () => renderPreview(previewInput.value));
  
  // Pack creation
  createBtn.onclick = async () => {
    if (!hasAnySaved()) {
      showToast('Сохраните хотя бы один символ для создания пака');
      return;
    }
    
    setCreateLoading(true);
    
    // Получаем ссылку через GET запрос к API
    const url = await getStickerPackLink();
    packLinkEl.href = url;
    packLinkEl.textContent = url;
    
    setCreateLoading(false);
    modalSuccess.classList.add('show');
  };
  
  closeSuccess.onclick = () => modalSuccess.classList.remove('show');
  
  modalSuccess.addEventListener('click', e => {
    if (e.target === modalSuccess) modalSuccess.classList.remove('show');
  });
  
  copyLinkBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(packLinkEl.href);
      copyLinkBtn.innerHTML = '<img src="assets/check-icon.svg" alt="Скопировано" class="icon-btn">';
      setTimeout(() => {
        copyLinkBtn.innerHTML = '<img src="assets/copy-icon.svg" alt="Скопировать" class="icon-btn">';
      }, 1200);
    } catch (e) {
      showToast('Не удалось скопировать ссылку');
    }
  };
  
  // Save button functionality
  saveBtn.onclick = () => {
    if (isDirty) {
      saveIfDirty();
      showToast('Символ сохранён');
    } else {
      showToast('Нет изменений для сохранения');
    }
  };
  
  // Mode switching
  alphabetModeBtn.onclick = () => switchMode('alphabet');
  customModeBtn.onclick = () => switchMode('custom');
  
  // Custom phrase input
  customPhraseInput.addEventListener('input', handleCustomPhraseChange);
  
  // Alphabet selection
  selectEl.onchange = () => {
    if (currentMode === 'alphabet') {
      saveIfDirty();
      currentSetKey = selectEl.value;
      updateLetters();
      curIndex = 0;
      renderChips();
      setLetterLabel();
      resetPad(glyphs.get(letters[curIndex]));
    }
  };
  
  // Download archive button
  if (downloadArchiveBtn) {
    downloadArchiveBtn.onclick = () => {
      downloadGlyphsArchive();
    };
  }
}

// ===== INITIALIZATION =====
function init() {
  // Загружаем сохраненные глифы из localStorage ПЕРЕД рендерингом
  loadGlyphsFromStorage();
  
  renderChips();
  setLetterLabel();
  resizeCanvases();
  initializeEventListeners();
  updateDownloadButtonState();
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}