/**
 * Music Search — iTunes Search API
 * Preview playback only. Apple preview audio is not downloadable or cacheable.
 */
'use strict';

const API_BASE = 'https://itunes.apple.com/search';
const CACHE_DURATION = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 12;
const MAX_HISTORY_SIZE = 8;
const RATE_LIMIT_MAX = 18;
const RATE_LIMIT_WINDOW = 60 * 1000;
const REQUEST_TIMEOUT = 15000;

const searchCache = new Map();
let requestTimestamps = [];
let currentResults = [];
let currentPlayingTrackId = null;
let activeRequestId = 0;

const $ = (id) => document.getElementById(id);
const searchInput = $('searchInput');
const searchBtn = $('searchBtn');
const clearInputBtn = $('clearInputBtn');
const rateLimitWarning = $('rateLimitWarning');
const historySection = $('historySection');
const historyChips = $('historyChips');
const clearHistoryBtn = $('clearHistoryBtn');
const controlsSection = $('controlsSection');
const genreFilter = $('genreFilter');
const sortSelect = $('sortSelect');
const statusMessage = $('statusMessage');
const resultsList = $('resultsList');
const playerFooter = $('playerFooter');
const audioElement = $('audioElement');
const playPauseBtn = $('playPauseBtn');
const skipBackwardBtn = $('skipBackwardBtn');
const skipForwardBtn = $('skipForwardBtn');
const seekBar = $('seekBar');
const volumeBar = $('volumeBar');
const currentTimeEl = $('currentTime');
const durationEl = $('duration');
const playerArt = $('playerArt');
const playerTitle = $('playerTitle');
const playerArtist = $('playerArtist');

function init() {
    if (!searchInput || !audioElement || !resultsList) {
        console.error('必要な画面要素が見つかりません。index.html と app.js の組み合わせを確認してください。');
        return;
    }
    loadSearchHistory();
    setupEventListeners();
    audioElement.volume = Number(volumeBar?.value ?? 1);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}

function setupEventListeners() {
    searchBtn?.addEventListener('click', () => performSearch());
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') performSearch();
        if (event.key === 'Escape') clearInput();
    });
    clearInputBtn?.addEventListener('click', clearInput);

    document.addEventListener('keydown', (event) => {
        const target = event.target;
        const isTyping = target instanceof HTMLElement &&
            (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
        if (event.key === '/' && !isTyping) {
            event.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });

    clearHistoryBtn?.addEventListener('click', clearHistory);
    genreFilter?.addEventListener('change', renderResults);
    sortSelect?.addEventListener('change', renderResults);
    playPauseBtn?.addEventListener('click', togglePlayPause);
    skipBackwardBtn?.addEventListener('click', () => skipTime(-10));
    skipForwardBtn?.addEventListener('click', () => skipTime(10));

    audioElement.addEventListener('timeupdate', updateProgressBar);
    audioElement.addEventListener('loadedmetadata', updateProgressBar);
    audioElement.addEventListener('ended', onAudioEnded);
    audioElement.addEventListener('play', () => updatePlayPauseButtonUI(true));
    audioElement.addEventListener('pause', () => updatePlayPauseButtonUI(false));
    audioElement.addEventListener('error', () => {
        statusMessage.textContent = 'プレビューを再生できませんでした。別の曲をお試しください。';
        updatePlayPauseButtonUI(false);
    });

    seekBar?.addEventListener('input', (event) => {
        if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
            audioElement.currentTime = (Number(event.target.value) / 100) * audioElement.duration;
        }
    });
    volumeBar?.addEventListener('input', (event) => {
        audioElement.volume = Math.min(1, Math.max(0, Number(event.target.value)));
    });

    resultsList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="play"]');
        if (!button || button.disabled) return;
        playTrack(button.dataset.trackId);
    });
}

function clearInput() {
    searchInput.value = '';
    searchInput.focus();
}

function checkRateLimit() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW);
    if (requestTimestamps.length >= RATE_LIMIT_MAX) {
        rateLimitWarning.textContent = `API利用制限（1分間に${RATE_LIMIT_MAX}回）に達しました。少し時間を置いてください。`;
        rateLimitWarning.style.display = 'block';
        return false;
    }
    rateLimitWarning.style.display = 'none';
    return true;
}

async function performSearch(termOverride = null) {
    const term = String(termOverride ?? searchInput.value).trim();
    if (!term) {
        statusMessage.textContent = '検索キーワードを入力してください。';
        searchInput.focus();
        return;
    }
    searchInput.value = term;

    const requestId = ++activeRequestId;
    const cached = searchCache.get(term);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        if (searchBtn) { searchBtn.disabled = false; searchBtn.textContent = '検索'; }
        currentResults = cached.data;
        onSearchSuccess(term, currentResults, true);
        return;
    }
    if (!checkRateLimit()) {
        statusMessage.textContent = 'リクエスト頻度が上限に達しました。少し時間を置いてください。';
        return;
    }

    requestTimestamps.push(Date.now());
    currentResults = [];
    controlsSection.style.display = 'none';
    searchBtn && (searchBtn.disabled = true);
    if (searchBtn) searchBtn.textContent = '検索中';
    statusMessage.textContent = '検索中...';
    resultsList.replaceChildren();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const url = `${API_BASE}?term=${encodeURIComponent(term)}&country=JP&media=music&limit=10`;

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (requestId !== activeRequestId) return;

        currentResults = Array.isArray(data.results) ? data.results : [];
        if (searchCache.size >= MAX_CACHE_SIZE) {
            searchCache.delete(searchCache.keys().next().value);
        }
        searchCache.set(term, { timestamp: Date.now(), data: currentResults });
        onSearchSuccess(term, currentResults, false);
    } catch (error) {
        if (requestId !== activeRequestId) return;
        console.error('検索エラー:', error);
        statusMessage.textContent = error.name === 'AbortError'
            ? '検索がタイムアウトしました。もう一度お試しください。'
            : '検索結果を取得できませんでした。通信状態を確認してください。';
    } finally {
        clearTimeout(timeout);
        if (requestId === activeRequestId) {
            if (searchBtn) {
                searchBtn.disabled = false;
                searchBtn.textContent = '検索';
            }
        }
    }
}

function onSearchSuccess(term, results, fromCache) {
    saveSearchHistory(term);
    if (results.length === 0) {
        statusMessage.textContent = '該当する曲が見つかりませんでした。';
        controlsSection.style.display = 'none';
        return;
    }
    statusMessage.textContent = `${results.length}件ヒットしました${fromCache ? '（キャッシュ）' : ''}`;
    controlsSection.style.display = 'flex';
    populateGenreFilter(results);
    renderResults();
}

function populateGenreFilter(results) {
    const genres = [...new Set(results.map((item) => item.primaryGenreName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    const previous = genreFilter.value;
    genreFilter.replaceChildren(new Option('すべて', 'all'));
    genres.forEach((genre) => genreFilter.add(new Option(genre, genre)));
    genreFilter.value = genres.includes(previous) ? previous : 'all';
}

function renderResults() {
    let filtered = [...currentResults];
    if (genreFilter.value !== 'all') {
        filtered = filtered.filter((item) => item.primaryGenreName === genreFilter.value);
    }
    const sort = sortSelect.value;
    const compare = (a, b, key) => String(a[key] || '').localeCompare(String(b[key] || ''), 'ja');
    if (sort === 'track-asc') filtered.sort((a, b) => compare(a, b, 'trackName'));
    if (sort === 'track-desc') filtered.sort((a, b) => compare(b, a, 'trackName'));
    if (sort === 'artist-asc') filtered.sort((a, b) => compare(a, b, 'artistName'));
    if (sort === 'date-desc') filtered.sort((a, b) => Date.parse(b.releaseDate || '') - Date.parse(a.releaseDate || ''));
    if (sort === 'date-asc') filtered.sort((a, b) => Date.parse(a.releaseDate || '') - Date.parse(b.releaseDate || ''));

    resultsList.replaceChildren();
    if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'status-msg';
        empty.textContent = '条件に一致する曲はありません。';
        resultsList.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((track) => {
        const card = document.createElement('article');
        card.className = `track-card${String(currentPlayingTrackId) === String(track.trackId) ? ' playing' : ''}`;
        card.id = `track-card-${track.trackId}`;

        const artwork = document.createElement('img');
        artwork.className = 'track-artwork';
        artwork.alt = 'アルバムアートワーク';
        artwork.loading = 'lazy';
        artwork.src = (track.artworkUrl100 || '').replace('100x100bb', '200x200bb');

        const info = document.createElement('div');
        info.className = 'track-info';
        const title = document.createElement('div');
        title.className = 'track-name';
        title.textContent = track.trackName || '曲名不明';
        title.title = title.textContent;
        const artist = document.createElement('div');
        artist.className = 'track-artist';
        artist.textContent = track.artistName || 'アーティスト不明';
        artist.title = artist.textContent;
        const meta = document.createElement('div');
        meta.className = 'track-meta';
        [track.collectionName || 'アルバム未登録', track.primaryGenreName || 'ジャンル未設定', formatTimeMs(track.trackTimeMillis)].forEach((value) => {
            const span = document.createElement('span');
            span.textContent = value;
            meta.appendChild(span);
        });
        info.append(title, artist, meta);

        const actions = document.createElement('div');
        actions.className = 'track-actions';
        const buttons = document.createElement('div');
        buttons.className = 'action-buttons';
        const play = document.createElement('button');
        play.className = 'preview-btn';
        play.dataset.action = 'play';
        play.dataset.trackId = String(track.trackId);
        play.disabled = !track.previewUrl;
        play.textContent = track.previewUrl ? '試聴する' : '試聴不可';
        buttons.appendChild(play);
        actions.appendChild(buttons);
        card.append(artwork, info, actions);
        fragment.appendChild(card);
    });
    resultsList.appendChild(fragment);
}

async function playTrack(trackId) {
    const track = currentResults.find((item) => String(item.trackId) === String(trackId));
    if (!track?.previewUrl) return;

    currentPlayingTrackId = track.trackId;
    document.querySelectorAll('.track-card').forEach((card) => card.classList.remove('playing'));
    $(`track-card-${track.trackId}`)?.classList.add('playing');

    playerArt.src = track.artworkUrl100 || '';
    playerTitle.textContent = track.trackName || '';
    playerArtist.textContent = track.artistName || '';
    playerFooter.style.display = 'flex';
    statusMessage.textContent = '';

    if (audioElement.src !== track.previewUrl) {
        audioElement.pause();
        audioElement.src = track.previewUrl;
        audioElement.load();
    } else if (audioElement.ended || (Number.isFinite(audioElement.duration) && audioElement.currentTime >= audioElement.duration)) {
        audioElement.currentTime = 0;
    }
    try {
        await audioElement.play();
    } catch (error) {
        console.error('再生エラー:', error);
        statusMessage.textContent = '再生を開始できませんでした。もう一度お試しください。';
    }
}

function togglePlayPause() {
    if (!audioElement.src) return;
    if (audioElement.paused) {
        audioElement.play().catch((error) => {
            console.error('再生エラー:', error);
            statusMessage.textContent = '再生を再開できませんでした。';
        });
    } else {
        audioElement.pause();
    }
}

function updatePlayPauseButtonUI(isPlaying) {
    playPauseBtn.textContent = isPlaying ? 'Ⅱ' : '▶';
    playPauseBtn.setAttribute('aria-label', isPlaying ? '一時停止' : '再生');
}

function skipTime(seconds) {
    if (!Number.isFinite(audioElement.duration) || audioElement.duration <= 0) return;
    audioElement.currentTime = Math.min(Math.max(audioElement.currentTime + seconds, 0), audioElement.duration);
}

function updateProgressBar() {
    if (!Number.isFinite(audioElement.duration) || audioElement.duration <= 0) return;
    seekBar.value = String((audioElement.currentTime / audioElement.duration) * 100);
    currentTimeEl.textContent = formatSeconds(audioElement.currentTime);
    durationEl.textContent = formatSeconds(audioElement.duration);
}

function onAudioEnded() {
    updatePlayPauseButtonUI(false);
    audioElement.currentTime = 0;
    seekBar.value = '0';
    currentTimeEl.textContent = '0:00';
}

function getSearchHistory() {
    try {
        const value = JSON.parse(localStorage.getItem('itunes_search_history') || '[]');
        return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, MAX_HISTORY_SIZE) : [];
    } catch {
        return [];
    }
}

function saveSearchHistory(term) {
    const history = getSearchHistory().filter((item) => item !== term);
    history.unshift(term);
    try {
        localStorage.setItem('itunes_search_history', JSON.stringify(history.slice(0, MAX_HISTORY_SIZE)));
    } catch (error) {
        console.warn('検索履歴を保存できません:', error);
    }
    loadSearchHistory();
}

function loadSearchHistory() {
    const history = getSearchHistory();
    historySection.style.display = history.length ? 'block' : 'none';
    historyChips.replaceChildren();
    history.forEach((term) => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.type = 'button';
        chip.textContent = term;
        chip.addEventListener('click', () => performSearch(term));
        historyChips.appendChild(chip);
    });
}

function clearHistory() {
    try {
        localStorage.removeItem('itunes_search_history');
    } catch (error) {
        console.warn('検索履歴を削除できません:', error);
    }
    loadSearchHistory();
}

function formatTimeMs(ms) {
    const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatSeconds(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
