// 標準音楽プレイヤー & ダウンロード機能付きアプリロジック

const audio = new Audio();
let playlist = [
    {
        title: "サンプル音楽 1 (Demo Track)",
        artist: "Oxngacu Artist",
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
    },
    {
        title: "サンプル音楽 2 (Demo Track)",
        artist: "Oxngacu Artist",
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
    }
];
let currentTrackIndex = 0;

// DOM要素
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const downloadBtn = document.getElementById('downloadBtn');
const trackTitle = document.getElementById('trackTitle');
const artistName = document.getElementById('artistName');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const volumeSlider = document.getElementById('volumeSlider');
const playlistEl = document.getElementById('playlist');
const audioLoader = document.getElementById('audioLoader');
const albumArt = document.getElementById('albumArt');

// 初期化
function initPlayer() {
    renderPlaylist();
    if (playlist.length > 0) {
        loadTrack(currentTrackIndex);
    }
}

function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const track = playlist[index];
    audio.src = track.src;
    trackTitle.textContent = track.title;
    artistName.textContent = track.artist;
    
    updatePlaylistUI();
}

function renderPlaylist() {
    playlistEl.innerHTML = '';
    playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${track.title}`;
        if (index === currentTrackIndex) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => {
            loadTrack(index);
            playAudio();
        });
        playlistEl.appendChild(li);
    });
}

function updatePlaylistUI() {
    const items = playlistEl.querySelectorAll('li');
    items.forEach((item, index) => {
        if (index === currentTrackIndex) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function playAudio() {
    audio.play().then(() => {
        playBtn.textContent = '⏸';
    }).catch(err => {
        console.error("再生エラー:", err);
    });
}

function pauseAudio() {
    audio.pause();
    playBtn.textContent = '▶';
}

playBtn.addEventListener('click', () => {
    if (audio.paused) {
        playAudio();
    } else {
        pauseAudio();
    }
});

prevBtn.addEventListener('click', () => {
    let newIndex = currentTrackIndex - 1;
    if (newIndex < 0) newIndex = playlist.length - 1;
    loadTrack(newIndex);
    playAudio();
});

nextBtn.addEventListener('click', () => {
    let newIndex = currentTrackIndex + 1;
    if (newIndex >= playlist.length) newIndex = 0;
    loadTrack(newIndex);
    playAudio();
});

// ダウンロード機能（Blob変換による確実なファイル保存処理 ＆ フォールバック対応）
downloadBtn.addEventListener('click', async () => {
    const currentTrack = playlist[currentTrackIndex];
    if (!currentTrack || !currentTrack.src) {
        alert("ダウンロード可能な曲がありません。");
        return;
    }

    try {
        downloadBtn.textContent = '⏳ ダウンロード中...';
        const response = await fetch(currentTrack.src);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = (currentTrack.title || "audio") + ".mp3";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    } catch (err) {
        console.warn("CORS制限等の理由によりフォールバック処理を実行します:", err);
        const a = document.createElement('a');
        a.href = currentTrack.src;
        a.download = (currentTrack.title || "audio") + ".mp3";
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } finally {
        downloadBtn.textContent = '⬇️ ダウンロード';
    }
});

// オーディオのイベント
audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
        const progressPercent = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = `${progressPercent}%`;
        currentTimeEl.textContent = formatTime(audio.currentTime);
        durationEl.textContent = formatTime(audio.duration);
    }
});

audio.addEventListener('ended', () => {
    let newIndex = currentTrackIndex + 1;
    if (newIndex >= playlist.length) newIndex = 0;
    loadTrack(newIndex);
    playAudio();
});

progressContainer.addEventListener('click', (e) => {
    const width = progressContainer.clientWidth;
    const clickX = e.offsetX;
    const duration = audio.duration;
    if (duration) {
        audio.currentTime = (clickX / width) * duration;
    }
});

volumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value;
});

// ローカルファイル追加機能
audioLoader.addEventListener('change', (e) => {
    const files = e.target.files;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileURL = URL.createObjectURL(file);
        playlist.push({
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: "ローカルファイル",
            src: fileURL
        });
    }
    renderPlaylist();
    if (audio.paused && playlist.length === files.length) {
        loadTrack(0);
    }
});

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

// 初期化実行
initPlayer();
