(() => {
  "use strict";

  const API_URL = "https://itunes.apple.com/search";
  const form = document.querySelector("#search-form");
  const input = document.querySelector("#search-input");
  const searchButton = document.querySelector("#search-button");
  const resultsElement = document.querySelector("#results");
  const statusElement = document.querySelector("#status");
  const countElement = document.querySelector("#result-count");

  let activeController = null;
  let latestRequest = 0;

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

  function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "";
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
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
    if (track.artworkUrl100) {
      artwork.src = track.artworkUrl100;
    } else {
      artwork.alt = "ジャケット画像はありません";
    }
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
    main.append(artwork, info);

    const durationText = formatDuration(track.trackTimeMillis);
    if (durationText) {
      const duration = document.createElement("p");
      duration.className = "track-duration";
      duration.textContent = `曲の長さ：${durationText}`;
      info.append(duration);
    }

    const actions = document.createElement("div");
    actions.className = "track-actions";

    if (track.previewUrl) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "none";
      audio.src = track.previewUrl;
      audio.setAttribute("aria-label", `${track.trackName || "この曲"} の試聴`);
      actions.append(audio);
    } else {
      const noPreview = document.createElement("span");
      noPreview.className = "no-preview";
      noPreview.textContent = "この曲は試聴できません";
      actions.append(noPreview);
    }

    const bottom = document.createElement("div");
    bottom.className = "track-actions-bottom";

    const storeLink = document.createElement("a");
    storeLink.className = "apple-link";
    storeLink.textContent = "Apple Musicで見る ↗";
    storeLink.href = track.trackViewUrl || "https://music.apple.com/jp/browse";
    storeLink.target = "_blank";
    storeLink.rel = "noopener noreferrer";
    bottom.append(storeLink);

    actions.append(bottom);
    card.append(main, actions);
    return card;
  }

  function renderResults(tracks) {
    const fragment = document.createDocumentFragment();
    for (const track of tracks) {
      fragment.append(createTrackCard(track));
    }
    resultsElement.replaceChildren(fragment);
    statusElement.hidden = true;
    countElement.textContent = `${tracks.length} 件`;
  }

  async function searchMusic(keyword) {
    const requestId = ++latestRequest;
    if (activeController) activeController.abort();

    const controller = new AbortController();
    activeController = controller;

    const params = new URLSearchParams({
      term: keyword,
      country: "JP",
      media: "music",
      entity: "song",
      limit: "30",
      lang: "ja_jp"
    });

    resultsElement.replaceChildren();
    countElement.textContent = "";
    setStatus("検索しています…", "iTunesのカタログから楽曲を探しています。", "♫", true);
    searchButton.disabled = true;
    searchButton.querySelector("span:first-child").textContent = "検索中";

    try {
      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`APIからエラーが返されました（HTTP ${response.status}）。`);
      }

      const data = await response.json();
      if (requestId !== latestRequest) return;

      const tracks = Array.isArray(data.results) ? data.results : [];
      if (tracks.length === 0) {
        countElement.textContent = "0 件";
        setStatus("曲が見つかりませんでした", "別の曲名やアーティスト名でもう一度検索してみてください。", "⌕");
        return;
      }

      renderResults(tracks);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (requestId !== latestRequest) return;

      console.error("Music search failed:", error);
      setStatus(
        "検索できませんでした",
        "通信環境を確認して、少し時間をおいてからもう一度お試しください。",
        "!"
      );
    } finally {
      if (requestId === latestRequest) {
        searchButton.disabled = false;
        searchButton.querySelector("span:first-child").textContent = "検索";
        activeController = null;
      }
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = input.value.trim();
    if (!keyword) {
      input.focus();
      setStatus("検索キーワードを入力してください", "曲名またはアーティスト名を入力すると検索できます。", "⌕");
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
})();