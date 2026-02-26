export class UIController {
    constructor(audioManager, windowManager) {
        this.audioManager = audioManager;
        this.windowManager = windowManager;
        this.urlInput = document.getElementById('urlInput');
        this.streamBtn = document.getElementById('streamBtn');
        this.audioPlayer = document.getElementById('audioPlayer');
        this.trackTitle = document.getElementById('trackTitle');
        this.statusMessage = document.getElementById('statusMessage');
        this.playerSection = document.getElementById('playerSection');
        this.searchResults = document.getElementById('searchResults');
        this.historyList = document.getElementById('historyList');

        this.searchTimeout = null;
        this.foundMetadata = null;
        this.playHistory = JSON.parse(localStorage.getItem('playHistory') || '[]');
        this.playlistQueue = [];
        this.currentIndex = -1;
    }

    init() {
        this.renderHistory();
        this.renderQueue();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.urlInput.addEventListener('input', () => this.handleSearchInput());
        this.streamBtn.addEventListener('click', () => this.handleStreamClick());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.streamBtn.click();
        });

        document.getElementById('playBtn')?.addEventListener('click', () => this.audioManager.play());
        document.getElementById('pauseBtn')?.addEventListener('click', () => this.audioManager.pause());
        document.getElementById('stopBtn')?.addEventListener('click', () => this.audioManager.stop());

        document.getElementById('volumeControl')?.addEventListener('input', (e) => {
            this.audioManager.setVolume(e.target.value);
        });

        this.audioPlayer.addEventListener('ended', () => {
            if (this.currentIndex < this.playlistQueue.length - 1) {
                this.playFromQueue(this.currentIndex + 1);
            }
        });

        document.querySelectorAll('.eq-band .vertical-slider').forEach(slider => {
            const freq = slider.dataset.freq;
            if (!freq) return;

            slider.addEventListener('input', () => {
                if (freq === 'preamp') {
                    this.audioManager.setPreamp(parseFloat(slider.value));
                } else {
                    this.audioManager.setFilterGain(freq, parseFloat(slider.value));
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!this.urlInput.contains(e.target) && !this.searchResults.contains(e.target) && e.target !== this.streamBtn) {
                this.searchResults.classList.remove('active');
            }
        });
    }

    handleSearchInput() {
        clearTimeout(this.searchTimeout);
        const query = this.urlInput.value.trim();

        if (query.length < 3) {
            this.searchResults.classList.remove('active');
            return;
        }

        if (this.isUrl(query)) {
            this.searchResults.classList.remove('active');
            return;
        }

        this.searchTimeout = setTimeout(async () => {
            try {
                console.log(`Starting YouTube search for: "${query}"`);
                const result = await window.electronAPI.searchYoutube(query);
                if (result.success) {
                    console.log(`Search returned ${result.results.length} results.`);
                    this.renderResults(result.results.slice(0, 3));
                } else {
                    console.warn(`Search API returned failure: ${result.error}`);
                }
            } catch (err) {
                console.error('Search error exception:', err);
            }
        }, 500);
    }

    async handleStreamClick() {
        const input = this.urlInput.value.trim();
        if (!input) {
            this.showStatus('Please enter a search query or URL');
            return;
        }

        if (this.isUrl(input)) {
            try {
                this.showStatus('Analyzing URL...');
                const info = await window.electronAPI.getUrlInfo(input);
                if (info.success) {
                    if (info.type === 'playlist') {
                        this.showStatus(`Loading playlist: ${info.title} (${info.entries.length} videos)`);
                        this.playlistQueue = info.entries;
                        this.renderQueue();
                        this.playFromQueue(0);
                    } else {
                        this.addToQueue(info.entry);
                        this.playFromQueue(this.playlistQueue.length - 1);
                    }
                } else {
                    this.showStatus(`Error: ${info.error}`);
                }
            } catch (err) {
                this.showStatus(`URL error: ${err.message}`);
            }
            return;
        }

        try {
            this.showStatus('Searching...');
            console.log(`Explicit search triggered for: "${input}"`);
            const searchResult = await window.electronAPI.searchYoutube(input);
            if (searchResult.success && searchResult.results.length > 0) {
                console.log(`Found ${searchResult.results.length} results for explicit search.`);
                this.renderResults(searchResult.results.slice(0, 3));
                this.showStatus('Select a result to play');
            } else {
                console.warn('Explicit search returned no results.');
                this.showStatus('No results found for your search.');
            }
        } catch (err) {
            this.showStatus(`Search failed: ${err.message}`);
        }
    }

    isUrl(str) {
        return str.startsWith('http') || str.includes('youtube.com') || str.includes('youtu.be');
    }

    renderResults(results) {
        this.searchResults.innerHTML = '';
        if (results.length === 0) {
            this.searchResults.classList.remove('active');
            return;
        }

        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `
                <div class="result-info">
                    <div class="result-title">${item.title}</div>
                    <div class="result-meta">${item.duration}</div>
                </div>
            `;
            div.addEventListener('click', () => {
                this.foundMetadata = item;
                this.urlInput.value = item.url;
                this.searchResults.classList.remove('active');
                this.addToQueue(item);
                this.playFromQueue(this.playlistQueue.length - 1);
            });
            this.searchResults.appendChild(div);
        });
        this.searchResults.classList.add('active');
        const searchWin = this.searchResults.closest('.vibeamp-window');
        if (searchWin) this.windowManager.bringToFront(searchWin);
    }

    async startStream(url, title, metadata = null) {
        try {
            this.streamBtn.disabled = true;
            this.streamBtn.textContent = '...';
            this.showStatus('Connecting to YouTube...');
            this.searchResults.classList.remove('active');
            console.log(`Requesting stream URL for: ${url}`);

            const result = await window.electronAPI.getStreamUrl(url);

            if (result.success) {
                console.log('Stream URL received successfully.');
                this.audioPlayer.src = result.url;
                this.audioPlayer.play();
                this.trackTitle.textContent = title || 'Streaming Audio';
                this.playerSection.classList.add('active');
                this.showStatus('Successfully connected!');

                const kbpsValue = document.getElementById('kbpsValue');
                const khzValue = document.getElementById('khzValue');
                if (kbpsValue && result.kbps) kbpsValue.textContent = result.kbps;
                if (khzValue && result.khz) khzValue.textContent = result.khz;

                const albumArtImg = document.getElementById('albumArt');
                const noArtText = document.getElementById('noArtText');
                const thumb = metadata?.thumbnail || this.foundMetadata?.thumbnail;

                if (thumb) {
                    albumArtImg.src = thumb;
                    albumArtImg.style.display = 'block';
                    if (noArtText) noArtText.style.display = 'none';
                } else {
                    albumArtImg.style.display = 'none';
                    if (noArtText) noArtText.style.display = 'block';
                }

                if (metadata) {
                    this.addToHistory(metadata);
                } else if (this.foundMetadata) {
                    this.addToHistory(this.foundMetadata);
                    this.foundMetadata = null;
                }
                this.updateQueueUI();
            } else {
                this.showStatus(`Error: ${result.error}`);
            }
        } catch (err) {
            this.showStatus(`Unexpected error: ${err.message}`);
        } finally {
            this.streamBtn.disabled = false;
            this.streamBtn.textContent = 'Stream';
        }
    }

    addToQueue(item) {
        this.playlistQueue.push(item);
        this.renderQueue();
    }

    playFromQueue(index) {
        if (index >= 0 && index < this.playlistQueue.length) {
            this.currentIndex = index;
            const item = this.playlistQueue[this.currentIndex];
            this.startStream(item.url, item.title, item);
        }
    }

    renderQueue() {
        if (!this.historyList) return;
        this.historyList.innerHTML = '';
        this.playlistQueue.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `history-item ${index === this.currentIndex ? 'active-track' : ''}`;
            div.innerHTML = `
                <div class="history-info">
                    <div class="history-title">${item.title}</div>
                </div>
            `;
            div.addEventListener('click', () => {
                this.playFromQueue(index);
            });
            this.historyList.appendChild(div);
        });
    }

    updateQueueUI() {
        const items = document.querySelectorAll('.history-item');
        items.forEach((item, index) => {
            if (index === this.currentIndex) {
                item.classList.add('active-track');
            } else {
                item.classList.remove('active-track');
            }
        });
    }

    addToHistory(item) {
        this.playHistory = this.playHistory.filter(h => h.id !== item.id);
        this.playHistory.unshift(item);
        this.playHistory = this.playHistory.slice(0, 10);
        localStorage.setItem('playHistory', JSON.stringify(this.playHistory));
        this.renderHistory();
    }

    renderHistory() {
        // Implementation for library feature if needed
    }

    showStatus(msg) {
        this.statusMessage.textContent = msg;
    }
}
