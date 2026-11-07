(() => {
  "use strict";

  const API_URL = "https://itunes.apple.com/search";
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const MAX_API_CALLS_PER_MINUTE = 18;
  const MAX_CACHE_ENTRIES = 12;
  const SEARCH_RESULT_LIMIT = 10;
  const MAX_HISTORY_ITEMS = 8;
  const HISTORY_KEY = "music-search-history-v1";
  const ITUNES_BADGE_URL = "https://marketing.services.apple/api/storage/images/64e3de01fe821600071349d4/en-us-large%401x.png";

  const form = document.querySelector("#search-form");
  const input = document.querySelector("#search-input");
  const searchButton = document.querySelector("#search-button");
  const clearSearchButton = document.querySelector("#clear-search");
  const resultsElement = document.querySelector("#results");
  const statusElement = document.querySelector("#status");
  const countElement = document.querySelector("#result-count");
  const historyArea = document.querySelector("#history-area");
  const historyList = document.querySelector("#history-list");
  const clearHistoryButton = document.querySelector("#clear-history");
  const sortSelect = document.querySelector("#sort-select");
  const genreFilter = document.querySelector("#genre-filter");

  const searchCache = new Map();
  const apiCallTimes = [];
  let activeController = null;
  let latestRequest = 0;
  let currentTracks = [];
  let activeAudio = null;
  let playbackIntent = 0;

  function setStatus(title, message, icon = "♫", loading = false) {
    statusElement.hidden = false;
    statusElement.classList.toggle("is-loading", loading);
    statusElement.replaceChildren();

    const iconElement = document.createElement("span");
    iconElement.className = "status-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.textContent = icon;

    const titleElement = document.createElement("strong");
    titleElement.textContent = title;

    const messageElement = document.createElement("span");
    messageElement.textContent = message;

    statusElement.append(iconElement, titleElement, messageElement);
  }

  function setSearching(isSearching) {
    searchButton.disabled = isSearching;
    searchButton.querySelector("span:first-child").textContent =
      isSearching ? "検索中" : "検索";
  }

  function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "";
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function formatPlayerTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const remaining = String(total % 60).padStart(2, "0");
    return `${minutes}:${remaining}`;
  }

  function getPreviewUrl(track) {
    if (!track.previewUrl) return "";

    try {
      const previewUrl = new URL(track.previewUrl);
      if (previewUrl.protocol === "http:") previewUrl.protocol = "https:";
      if (previewUrl.protocol !== "https:" ||
          !previewUrl.hostname.toLowerCase().endsWith("apple.com")) {
        return "";
      }
      return previewUrl.href;
    } catch {
      return "";
    }
  }

  function createCustomPlayer(track) {
    const previewUrl = getPreviewUrl(track);
    if (!previewUrl) {
      const unavailable = document.createElement("span");
      unavailable.className = "no-preview";
      unavailable.textContent = "この曲は試聴できません";
      return unavailable;
    }

    const player = document.createElement("div");
    player.className = "custom-player";

    const audio = document.createElement("audio");
    audio.preload = "none";
    audio.src = previewUrl;
    audio.setAttribute("aria-hidden", "true");
    audio.tabIndex = -1;
    audio.setAttribute("controlslist", "nodownload noplaybackrate");
    audio.disableRemotePlayback = true;
    audio.hidden = true;

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "player-play";
    playButton.textContent = "▶";
    playButton.setAttribute("aria-label", `${track.trackName || "この曲"}を再生`);

    const seekBack = document.createElement("button");
    seekBack.type = "button";
    seekBack.className = "player-skip";
    seekBack.textContent = "−10";
    seekBack.setAttribute("aria-label", "10秒戻る");

    const seekForward = document.createElement("button");
    seekForward.type = "button";
    seekForward.className = "player-skip";
    seekForward.textContent = "+10";
    seekForward.setAttribute("aria-label", "10秒進む");

    const timeline = document.createElement("input");
    timeline.type = "range";
    timeline.className = "player-progress";
    timeline.min = "0";
    timeline.max = "1000";
    timeline.step = "1";
    timeline.value = "0";
    timeline.disabled = true;
    timeline.setAttribute("aria-label", `${track.trackName || "この曲"}の再生位置`);

    const timeRow = document.createElement("div");
    timeRow.className = "player-time-row";

    const elapsed = document.createElement("span");
    elapsed.className = "player-elapsed";
    elapsed.textContent = "0:00";

    const total = document.createElement("span");
    total.className = "player-total";
    total.textContent = "--:--";

    const volume = document.createElement("input");
    volume.type = "range";
    volume.className = "player-volume";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.value = "1";
    volume.setAttribute("aria-label", "音量");

    const volumeLabel = document.createElement("span");
    volumeLabel.className = "player-volume-label";
    volumeLabel.textContent = "音量";

    const topRow = document.createElement("div");
    topRow.className = "player-top-row";
    topRow.append(playButton, seekBack, seekForward, timeline);

    const bottomRow = document.createElement("div");
    bottomRow.className = "player-bottom-row";
    timeRow.append(elapsed, total);
    bottomRow.append(timeRow, volumeLabel, volume);

    const message = document.createElement("p");
    message.className = "player-message";
    message.setAttribute("role", "status");
    message.textContent = "Apple提供のプレビュー音源";

    function updatePlayer() {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      timeline.disabled = duration <= 0;
      timeline.value = duration > 0
        ? String(Math.round(Math.min(1, position / duration) * 1000))
        : "0";
      elapsed.textContent = formatPlayerTime(position);
      total.textContent = duration > 0 ? formatPlayerTime(duration) : "--:--";
      playButton.textContent = audio.paused ? "▶" : "Ⅱ";
      playButton.setAttribute(
        "aria-label",
        `${track.trackName || "この曲"}を${audio.paused ? "再生" : "一時停止"}`
      );
      player.classList.toggle("is-playing", !audio.paused);
    }

    audio._updateCustomPlayer = updatePlayer;

    playButton.addEventListener("click", async () => {
      message.textContent = "";
      if (audio.paused) {
        const intent = ++playbackIntent;
        if (activeAudio && activeAudio !== audio) {
          activeAudio.pause();
          activeAudio._updateCustomPlayer?.();
        }
        activeAudio = audio;
        try {
          await audio.play();
          if (intent !== playbackIntent) {
            audio.pause();
            updatePlayer();
          }
        } catch (error) {
          if (activeAudio === audio) activeAudio = null;
          if (intent === playbackIntent) {
            message.textContent = "再生できませんでした。時間をおいて再度お試しください。";
          }
          updatePlayer();
          console.warn("Preview playback failed:", error);
        }
      } else {
        playbackIntent += 1;
        audio.pause();
      }
    });

    seekBack.addEventListener("click", () => {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
      }
    });

    seekForward.addEventListener("click", () => {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
      }
    });

    timeline.addEventListener("input", () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      elapsed.textContent = formatPlayerTime(
        (Number(timeline.value) / 1000) * audio.duration
      );
    });

    timeline.addEventListener("change", () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audio.currentTime = (Number(timeline.value) / 1000) * audio.duration;
    });

    volume.addEventListener("input", () => {
      audio.volume = Number(volume.value);
    });

    audio.addEventListener("play", () => {
      if (activeAudio && activeAudio !== audio) {
        audio.pause();
        updatePlayer();
        return;
      }
      activeAudio = audio;
      updatePlayer();
    });

    audio.addEventListener("pause", () => {
      if (activeAudio === audio) activeAudio = null;
      updatePlayer();
    });

    audio.addEventListener("timeupdate", updatePlayer);
    audio.addEventListener("loadedmetadata", updatePlayer);
    audio.addEventListener("durationchange", updatePlayer);
    audio.addEventListener("ended", () => {
      if (activeAudio === audio) activeAudio = null;
      updatePlayer();
    });

    audio.addEventListener("error", () => {
      message.textContent = "プレビュー音源を読み込めませんでした。";
      playButton.disabled = true;
      timeline.disabled = true;
      updatePlayer();
    });

    player.append(audio, topRow, bottomRow, message);
    return player;
  }

  function getArtworkSource(track) {
    if (!track.artworkUrl100) return "";

    try {
      const artworkUrl = new URL(track.artworkUrl100);
      if (artworkUrl.protocol === "http:") artworkUrl.protocol = "https:";
      if (artworkUrl.protocol !== "https:") return "";

      // Use Apple's larger artwork variant when the returned URL exposes a size segment.
      artworkUrl.pathname = artworkUrl.pathname.replace(
        /\/\d+x\d+(?=bb|[-_.])/i,
        "/600x600"
      );
      return artworkUrl.href;
    } catch {
      return "";
    }
  }

  function getStoreUrl(track) {
    const fallback = "https://music.apple.com/jp/browse";
    const rawUrl = track.trackViewUrl || track.collectionViewUrl;
    if (!rawUrl) return fallback;

    try {
      const storeUrl = new URL(rawUrl);
      if (storeUrl.protocol === "http:") storeUrl.protocol = "https:";
      if (storeUrl.protocol !== "https:" || !storeUrl.hostname.toLowerCase().endsWith("apple.com")) {
        return fallback;
      }
      return storeUrl.href;
    } catch {
      return fallback;
    }
  }

  function getSearchCacheKey(keyword) {
    return keyword.trim().toLocaleLowerCase("ja-JP");
  }

  function getCachedResults(keyword) {
    const key = getSearchCacheKey(keyword);
    const entry = searchCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
      searchCache.delete(key);
      return null;
    }

    // Cache only the API response metadata in memory; preview audio is never fetched or stored here.
    return entry.results;
  }

  function cacheResults(keyword, results) {
    const key = getSearchCacheKey(keyword);
    searchCache.delete(key);
    searchCache.set(key, { savedAt: Date.now(), results });

    while (searchCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }
  }

  function reserveApiCall() {
    const now = Date.now();
    while (apiCallTimes.length && now - apiCallTimes[0] >= 60_000) {
      apiCallTimes.shift();
    }

    if (apiCallTimes.length >= MAX_API_CALLS_PER_MINUTE) {
      const waitMs = Math.max(1000, 60_000 - (now - apiCallTimes[0]));
      return { allowed: false, waitSeconds: Math.ceil(waitMs / 1000) };
    }

    apiCallTimes.push(now);
    return { allowed: true, waitSeconds: 0 };
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .slice(0, MAX_HISTORY_ITEMS);
    } catch {
      return [];
    }
  }

  function renderHistory() {
    const history = readHistory();
    historyList.replaceChildren();
    historyArea.hidden = history.length === 0;

    for (const keyword of history) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-chip";
      button.textContent = keyword;
      button.title = `「${keyword}」をもう一度検索`;
      button.addEventListener("click", () => {
        input.value = keyword;
        form.requestSubmit();
      });
      historyList.append(button);
    }
  }

  function saveHistory(keyword) {
    const history = readHistory().filter(
      (item) => item.toLocaleLowerCase("ja-JP") !== keyword.toLocaleLowerCase("ja-JP")
    );
    history.unshift(keyword);

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)));
    } catch {
      // Search still works when browser storage is unavailable or full.
    }
    renderHistory();
  }

  function populateGenreFilter(tracks) {
    const genres = [...new Set(
      tracks
        .map((track) => track.primaryGenreName)
        .filter((genre) => typeof genre === "string" && genre.trim())
    )].sort((a, b) => a.localeCompare(b, "ja"));

    genreFilter.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "すべて";
    genreFilter.append(allOption);

    for (const genre of genres) {
      const option = document.createElement("option");
      option.value = genre;
      option.textContent = genre;
      genreFilter.append(option);
    }

    genreFilter.disabled = genres.length === 0;
    genreFilter.value = "all";
  }

  function createTrackCard(track) {
    const card = document.createElement("article");
    card.className = "track-card";

    const main = document.createElement("div");
    main.className = "track-main";

    const artwork = document.createElement("img");
    artwork.className = "track-artwork";
    artwork.alt = track.trackName ? `${track.trackName} のジャケット` : "アルバムジャケット";
    artwork.loading = "lazy";
    artwork.decoding = "async";
    artwork.src = getArtworkSource(track);
    if (!artwork.src) artwork.hidden = true;
    artwork.addEventListener("error", () => {
      artwork.hidden = true;
    }, { once: true });

    const info = document.createElement("div");
    info.className = "track-info";

    const title = document.createElement("h3");
    title.className = "track-title";
    title.textContent = track.trackName || "タイトル不明";

    const artist = document.createElement("p");
    artist.className = "track-artist";
    artist.textContent = track.artistName || "アーティスト不明";

    const album = document.createElement("p");
    album.className = "track-album";
    album.textContent = track.collectionName || "アルバム情報なし";

    info.append(title, artist, album);

    if (track.primaryGenreName) {
      const genre = document.createElement("p");
      genre.className = "track-genre";
      genre.textContent = `ジャンル：${track.primaryGenreName}`;
      info.append(genre);
    }

    const durationText = formatDuration(track.trackTimeMillis);
    if (durationText) {
      const duration = document.createElement("p");
      duration.className = "track-duration";
      duration.textContent = `曲の長さ：${durationText}`;
      info.append(duration);
    }

    main.append(artwork, info);

    const actions = document.createElement("div");
    actions.className = "track-actions";

    // Custom controls hide the browser's native audio toolbar. Audio is still streamed from Apple's preview URL.
    const previewPlayer = createCustomPlayer(track);
    actions.append(previewPlayer);

    if (track.previewUrl) {
      const attribution = document.createElement("p");
      attribution.className = "preview-credit";
      attribution.textContent = "Preview provided courtesy of iTunes.";
      actions.append(attribution);
    }

    const bottom = document.createElement("div");
    bottom.className = "track-actions-bottom";

    const storeLink = document.createElement("a");
    storeLink.className = "itunes-badge-link";
    storeLink.href = getStoreUrl(track);
    storeLink.target = "_blank";
    storeLink.rel = "noopener noreferrer";
    storeLink.setAttribute("aria-label", "Get it on iTunes Store");

    const badge = document.createElement("img");
    badge.className = "itunes-badge";
    badge.src = ITUNES_BADGE_URL;
    badge.alt = "Get it on iTunes Store";
    badge.loading = "lazy";
    badge.decoding = "async";
    storeLink.append(badge);
    bottom.append(storeLink);

    actions.append(bottom);
    card.append(main, actions);
    return card;
  }

  function stopActivePreview() {
    playbackIntent += 1;
    if (!activeAudio) return;
    const previousAudio = activeAudio;
    activeAudio = null;
    previousAudio.pause();
    previousAudio.currentTime = 0;
    previousAudio._updateCustomPlayer?.();
  }

  function applyFilters() {
    stopActivePreview();
    const selectedGenre = genreFilter.value;
    const sortMode = sortSelect.value;
    let visibleTracks = currentTracks.filter((track) => {
      return selectedGenre === "all" || track.primaryGenreName === selectedGenre;
    });

    if (sortMode === "title") {
      visibleTracks.sort((a, b) =>
        (a.trackName || "").localeCompare(b.trackName || "", "ja")
      );
    } else if (sortMode === "artist") {
      visibleTracks.sort((a, b) =>
        (a.artistName || "").localeCompare(b.artistName || "", "ja")
      );
    } else if (sortMode === "newest") {
      visibleTracks.sort((a, b) =>
        (Date.parse(b.releaseDate || "") || 0) - (Date.parse(a.releaseDate || "") || 0)
      );
    }

    resultsElement.replaceChildren();
    countElement.textContent = `${visibleTracks.length} / ${currentTracks.length} 件`;

    if (visibleTracks.length === 0) {
      setStatus(
        "この条件に合う曲はありません",
        "ジャンルの選択を変えるか、別の検索キーワードを試してください。",
        "⌕"
      );
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const track of visibleTracks) {
      fragment.append(createTrackCard(track));
    }
    resultsElement.append(fragment);
    statusElement.hidden = true;
  }

  async function searchMusic(keyword) {
    stopActivePreview();
    const requestId = ++latestRequest;
    if (activeController) activeController.abort();
    activeController = null;

    resultsElement.replaceChildren();
    countElement.textContent = "";
    setStatus("検索しています…", "iTunesのカタログから楽曲を探しています。", "♫", true);
    setSearching(true);

    try {
      const cachedResults = getCachedResults(keyword);
      if (cachedResults) {
        if (requestId !== latestRequest) return;
        currentTracks = cachedResults;
        populateGenreFilter(currentTracks);
        sortSelect.value = "relevance";
        saveHistory(keyword);
        applyFilters();
        return;
      }

      const slot = reserveApiCall();
      if (!slot.allowed) {
        setStatus(
          "検索リクエストが多くなっています",
          `APIへの連続アクセスを避けるため、約 ${slot.waitSeconds} 秒後にもう一度検索してください。`,
          "!"
        );
        return;
      }

      const controller = new AbortController();
      activeController = controller;

      const params = new URLSearchParams({
        term: keyword,
        country: "JP",
        media: "music",
        entity: "song",
        limit: String(SEARCH_RESULT_LIMIT),
        lang: "ja_jp"
      });

      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        const error = new Error(`API request failed: HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      if (requestId !== latestRequest) return;

      const tracks = Array.isArray(data.results) ? data.results : [];
      cacheResults(keyword, tracks);
      currentTracks = tracks;
      populateGenreFilter(currentTracks);
      sortSelect.value = "relevance";
      saveHistory(keyword);

      if (tracks.length === 0) {
        countElement.textContent = "0 件";
        setStatus(
          "曲が見つかりませんでした",
          "別の曲名やアーティスト名でもう一度検索してみてください。",
          "⌕"
        );
        return;
      }

      applyFilters();
    } catch (error) {
      if (error.name === "AbortError") return;
      if (requestId !== latestRequest) return;

      console.error("Music search failed:", error);
      if (error.status === 429) {
        setStatus(
          "APIの利用制限に達しました",
          "少し時間をおいてから、もう一度検索してください。",
          "!"
        );
      } else if (error.status === 403) {
        setStatus(
          "APIへのアクセスが一時的に制限されています",
          "しばらく時間をおいてから、もう一度お試しください。",
          "!"
        );
      } else {
        setStatus(
          "検索できませんでした",
          "通信環境を確認して、少し時間をおいてからもう一度お試しください。",
          "!"
        );
      }
    } finally {
      if (requestId === latestRequest) {
        setSearching(false);
        activeController = null;
      }
    }
  }

  function syncClearButton() {
    clearSearchButton.hidden = input.value.length === 0;
  }

  clearSearchButton.addEventListener("click", () => {
    input.value = "";
    syncClearButton();
    input.focus();
  });

  input.addEventListener("input", syncClearButton);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement && (
      target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );

    if (event.key === "/" && !isTyping && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      input.focus();
    }

    if (event.key === "Escape" && document.activeElement === input && input.value) {
      input.value = "";
      syncClearButton();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = input.value.trim();
    if (!keyword) {
      input.focus();
      setStatus(
        "検索キーワードを入力してください",
        "曲名またはアーティスト名を入力すると検索できます。",
        "⌕"
      );
      return;
    }
    searchMusic(keyword);
  });

  document.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.dataset.query || "";
      form.requestSubmit();
    });
  });

  sortSelect.addEventListener("change", applyFilters);
  genreFilter.addEventListener("change", applyFilters);

  clearHistoryButton.addEventListener("click", () => {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Ignore storage errors; the history panel will still be hidden for this page view.
    }
    renderHistory();
  });

  renderHistory();
  syncClearButton();
})();