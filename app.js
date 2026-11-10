/**
 * iTunes Search API 音楽検索＆プレビュー・ダウンロードプレイヤー
 */

const API_BASE = 'https://itunes.apple.com/search';
const CACHE_DURATION = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 12;
const MAX_HISTORY_SIZE = 8;
const RATE_LIMIT_MAX = 18;
const RATE_LIMIT_WINDOW = 60 * 1000;

let searchCache = new Map();
let requestTimestamps = [];
let currentResults = [];
let currentPlayingTrackId = null;

// DOM要素
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const clearInputBtn = document.getElementById('clearInputBtn');
const rateLimitWarning = document.getElementById('rateLimitWarning');
const historySection = document.getElementById('historySection');
const historyChips = document.getElementById('historyChips');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const controlsSection = document.getElementById('controlsSection');
const genreFilter = document.getElementById('genreFilter');
const sortSelect = document.getElementById('sortSelect');
const statusMessage = document.getElementById('statusMessage');
const resultsList = document.getElementById('resultsList');

// プレイヤー要素
const playerFooter = document.getElementById('playerFooter');
const audioElement = document.getElementById('audioElement');
const playPauseBtn = document.getElementById('playPauseBtn');
const skipBackwardBtn = document.getElementById('skipBackwardBtn');
const skipForwardBtn = document.getElementById('skipForwardBtn');
const seekBar = document.getElementById('seekBar');
const volumeBar = document.getElementById('volumeBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const playerArt = document.getElementById('playerArt');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');
const playerDownloadBtn = document.getElementById('playerDownloadBtn');

document.addEventListener('DOMContentLoaded', () => {
    loadSearchHistory();
    setupEventListeners();
});

function setupEventListeners() {
    searchBtn.addEventListener('click', () => performSearch());
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
        if (e.key === 'Escape') clearInput();
    });

    clearInputBtn.addEventListener('click', clearInput);

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });

    clearHistoryBtn.addEventListener('click', clearHistory);
    genreFilter.addEventListener('change', renderResults);
    sortSelect.addEventListener('change', renderResults);

    playPauseBtn.addEventListener('click', togglePlayPause);
    skipBackwardBtn.addEventListener('click', () => skipTime(-10));
    skipForwardBtn.addEventListener('click', () => skipTime(10));
    
    audioElement.addEventListener('timeupdate', updateProgressBar);
    audioElement.addEventListener('ended', onAudioEnded);
    audioElement.addEventListener('play', () => updatePlayPauseButtonUI(true));
    audioElement.addEventListener('pause', () => updatePlayPauseButtonUI(false));

    seekBar.addEventListener('input', (e) => {
        if (audioElement.duration) {
            audioElement.currentTime = (e.target.value / 100) * audioElement.duration;
        }
    });

    volumeBar.addEventListener('input', (e) => {
        audioElement.volume = e.target.value;
    });

    playerDownloadBtn.addEventListener('click', () => {
        if (currentPlayingTrackId) {
            downloadTrack(currentPlayingTrackId);
        }
    });
}

function clearInput() {
    searchInput.value = '';
    searchInput.focus();
}

function checkRateLimit() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (requestTimestamps.length >= RATE_LIMIT_MAX) {
        rateLimitWarning.textContent = `API利用制限（1分間に${RATE_LIMIT_MAX}回）に近づいています。しばらくお待ちください。`;
        rateLimitWarning.style.display = 'block';
        return false;
    } else {
        rateLimitWarning.style.display = 'none';
        return true;
    }
}

async function performSearch(termOverride = null) {
    const term = termOverride !== null ? termOverride : searchInput.value.trim();
    if (!term) return;

    if (termOverride !== null) {
        searchInput.value = term;
    }

    const cached = searchCache.get(term);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        currentResults = cached.data;
        onSearchSuccess(term, currentResults, true);
        return;
    }

    if (!checkRateLimit()) {
        statusMessage.textContent = 'リクエスト頻度が制限を超えました。少し時間を置いてください。';
        return;
    }

    requestTimestamps.push(Date.now());
    statusMessage.textContent = '検索中...';
    resultsList.innerHTML = '';

    const url = `${API_BASE}?term=${encodeURIComponent(term)}&country=JP&media=music&limit=10`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('ネットワークエラーが発生しました');
        const data = await response.json();
        
        currentResults = data.results || [];
        
        if (searchCache.size >= MAX_CACHE_SIZE) {
            const firstKey = searchCache.keys().next().value;
            searchCache.delete(firstKey);
        }
        searchCache.set(term, { timestamp: Date.now(), data: currentResults });

        onSearchSuccess(term, currentResults, false);
    } catch (error) {
        console.error(error);
        statusMessage.textContent = 'データの取得に失敗しました。接続を確認してください。';
    }
}

function onSearchSuccess(term, results, fromCache) {
    saveSearchHistory(term);
    
    if (results.length === 0) {
        statusMessage.textContent = '該当する曲が見つかりませんでした。';
        controlsSection.style.display = 'none';
        return;
    }

    statusMessage.textContent = `${results.length}件ヒットしました${fromCache ? ' （キャッシュから表示）' : ''}`;
    controlsSection.style.display = 'flex';
    
    populateGenreFilter(results);
    renderResults();
}

function populateGenreFilter(results) {
    const genres = [...new Set(results.map(item => item.primaryGenreName).filter(Boolean))];
    const currentSelected = genreFilter.value;
    
    genreFilter.innerHTML = '<option value="all">すべて</option>';
    genres.forEach(genre => {
        const opt = document.createElement('option');
        opt.value = genre;
        opt.textContent = genre;
        genreFilter.appendChild(opt);
    });

    if (genres.includes(currentSelected)) {
        genreFilter.value = currentSelected;
    } else {
        genreFilter.value = 'all';
    }
}

function renderResults() {
    let filtered = [...currentResults];
    
    const selectedGenre = genreFilter.value;
    if (selectedGenre !== 'all') {
        filtered = filtered.filter(item => item.primaryGenreName === selectedGenre);
    }

    const sortVal = sortSelect.value;
    if (sortVal === 'track-asc') {
        filtered.sort((a, b) => (a.trackName || '').localeCompare(b.trackName || ''));
    } else if (sortVal === 'track-desc') {
        filtered.sort((a, b) => (b.trackName || '').localeCompare(a.trackName || ''));
    } else if (sortVal === 'artist-asc') {
        filtered.sort((a, b) => (a.artistName || '').localeCompare(b.artistName || ''));
    } else if (sortVal === 'date-desc') {
        filtered.sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0));
    } else if (sortVal === 'date-asc') {
        filtered.sort((a, b) => new Date(a.releaseDate || 0) - new Date(b.releaseDate || 0));
    }

    resultsList.innerHTML = '';

    if (filtered.length === 0) {
        resultsList.innerHTML = '<div class="status-msg">条件に一致する曲はありません。</div>';
        return;
    }

    filtered.forEach(track => {
        const card = document.createElement('div');
        card.className = `track-card ${currentPlayingTrackId === track.trackId ? 'playing' : ''}`;
        card.id = `track-card-${track.trackId}`;

        const artworkUrl = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb.jpg', '200x200bb.jpg') : '';
        const durationFormatted = formatTimeMs(track.trackTimeMillis);

        card.innerHTML = `
            <img src="${artworkUrl}" alt="Artwork" class="track-artwork" loading="lazy">
            <div class="track-info">
                <div class="track-name" title="${escapeHtml(track.trackName)}">${escapeHtml(track.trackName)}</div>
                <div class="track-artist" title="${escapeHtml(track.artistName)}">${escapeHtml(track.artistName)}</div>
                <div class="track-meta">
                    <span>${escapeHtml(track.collectionName || 'アルバム未登録')}</span>
                    <span>${escapeHtml(track.primaryGenreName || '-')}</span>
                    <span>${durationFormatted}</span>
                </div>
            </div>
            <div class="track-actions">
                <div class="action-buttons">
                    <button class="preview-btn" ${track.previewUrl ? '' : 'disabled'} onclick="playTrack('${track.trackId}')">
                        ${track.previewUrl ? '試聴する' : '試聴不可'}
                    </button>
                    <button class="download-btn" ${track.previewUrl ? '' : 'disabled'} onclick="downloadTrack('${track.trackId}')">
                        保存
                    </button>
                </div>
            </div>
        `;
        resultsList.appendChild(card);
    });
}

window.playTrack = function(trackId) {
    const track = currentResults.find(t => String(t.trackId) === String(trackId));
    if (!track || !track.previewUrl) return;

    document.querySelectorAll('.track-card').forEach(el => el.classList.remove('playing'));
    const card = document.getElementById(`track-card-${trackId}`);
    if (card) card.classList.add('playing');

    currentPlayingTrackId = track.trackId;

    playerArt.src = track.artworkUrl100 || '';
    playerTitle.textContent = track.trackName || '';
    playerArtist.textContent = track.artistName || '';
    playerFooter.style.display = 'flex';

    audioElement.src = track.previewUrl;
    audioElement.play().catch(err => console.error("再生エラー:", err));
};

// 楽曲ダウンロード処理 (Blob変換により確実にローカル保存)
window.downloadTrack = async function(trackId) {
    const track = currentResults.find(t => String(t.trackId) === String(trackId));
    if (!track || !track.previewUrl) return;

    try {
        const response = await fetch(track.previewUrl);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${track.artistName} - ${track.trackName}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    } catch (err) {
        console.warn("CORS制限により通常リンクでのダウンロードを試みます:", err);
        const a = document.createElement('a');
        a.href = track.previewUrl;
        a.download = `${track.artistName} - ${track.trackName}.mp3`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
};

function togglePlayPause() {
    if (!audioElement.src) return;
    if (audioElement.paused) {
        audioElement.play();
    } else {
        audioElement.pause();
    }
}

function updatePlayPauseButtonUI(isPlaying) {
    playPauseBtn.textContent = isPlaying ? 'Ⅱ' : '▶';
}

function skipTime(seconds) {
    if (!audioElement.src) return;
    audioElement.currentTime = Math.min(Math.max(audioElement.currentTime + seconds, 0), audioElement.duration || 30);
}

function updateProgressBar() {
    if (audioElement.duration) {
        const percent = (audioElement.currentTime / audioElement.duration) * 100;
        seekBar.value = percent;
        currentTimeEl.textContent = formatSeconds(audioElement.currentTime);
        durationEl.textContent = formatSeconds(audioElement.duration);
    }
}

function onAudioEnded() {
    playPauseBtn.textContent = '▶';
    seekBar.value = 0;
}

function saveSearchHistory(term) {
    let history = getSearchHistory();
    history = history.filter(item => item !== term);
    history.unshift(term);
    if (history.length > MAX_HISTORY_SIZE) {
        history.pop();
    }
    localStorage.setItem('itunes_search_history', JSON.stringify(history));
    loadSearchHistory();
}

function getSearchHistory() {
    try {
        const stored = localStorage.getItem('itunes_search_history');
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function loadSearchHistory() {
    const history = getSearchHistory();
    if (history.length === 0) {
        historySection.style.display = 'none';
        return;
    }

    historySection.style.display = 'block';
    historyChips.innerHTML = '';
    history.forEach(term => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = term;
        chip.addEventListener('click', () => {
            searchInput.value = term;
            performSearch(term);
        });
        historyChips.appendChild(chip);
    });
}

function clearHistory() {
    localStorage.removeItem('itunes_search_history');
    historySection.style.display = 'none';
}

function formatTimeMs(ms) {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function formatSeconds(sec) {
    if (isNaN(sec)) return '0:00';
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}
