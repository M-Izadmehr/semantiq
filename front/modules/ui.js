// modules/ui.js - UI management and DOM manipulation
import { Embeddings } from './embeddings.js';

export const UI = {
    // Cached DOM elements
    elements: {},

    // UI state
    latestGuessNumber: -1,
    notificationTimeout: null,

    // Initialize UI and cache elements
    init() {
        this.elements = {
            // Input controls
            guessInput: document.getElementById('guess-input'),
            guessBtn: document.getElementById('guess-btn'),
            hintBtn: document.getElementById('hint-btn'),

            // Map
            semanticMap: document.getElementById('semantic-map'),

            // Stats
            guessCount: document.getElementById('guess-count'),
            bestScore: document.getElementById('best-score'),
            targetWord: document.getElementById('target-word'),
            currentRank: document.getElementById('current-rank'),

            // History
            guessHistory: document.getElementById('guess-history'),

            // Sort controls
            mobileSortBtn: document.getElementById('sort-btn-mobile'),
            sortButtons: {
                'similarity-desc': document.getElementById('sort-similarity-desc'),
                'similarity-asc': document.getElementById('sort-similarity-asc'),
                'order-desc': document.getElementById('sort-order-desc'),
                'order-asc': document.getElementById('sort-order-asc')
            },

            // Victory modal
            victoryModal: document.getElementById('victory-modal'),
            victoryWord: document.getElementById('victory-word'),
            victoryGuesses: document.getElementById('victory-guesses'),
            newGameBtn: document.getElementById('btn-new-game'),

            // Daily header controls
            dailyTitle: document.getElementById('daily-title'),
            dailyDate: document.getElementById('daily-date'),
            prevDayBtn: document.getElementById('btn-prev-day'),
            nextDayBtn: document.getElementById('btn-next-day')
        };
    },

    // Reset UI for the current game
    reset() {
        this.elements.semanticMap.innerHTML = '';
        this.elements.guessHistory.innerHTML = `
            <div style="text-align: center; opacity: 0.6; padding: 20px;">
                No guesses yet. Start exploring!
            </div>
        `;
        this.elements.targetWord.textContent = '???';
        this.elements.victoryModal.classList.add('hidden');
        this.elements.guessInput.value = '';
        this.elements.guessInput.focus();

        // Reset sort to default
        this.updateSortButtons('similarity-desc');
        this.updateMobileSortButton('similarity-desc');

        // Remove any hint areas
        const hintArea = document.getElementById('hint-area');
        if (hintArea) hintArea.remove();

        // Clear notifications
        this.clearNotifications();
    },

    // Update statistics display
    updateStats(stats) {
        this.elements.guessCount.textContent = stats.guessCount;
        this.elements.bestScore.textContent = (stats.bestScore * 100).toFixed(1);
        this.elements.currentRank.textContent = stats.bestRank || '-';
        this.elements.targetWord.textContent = stats.targetWord;
    },

    // Add a word to the semantic map
    addWordToMap(guess) {
        const map = this.elements.semanticMap;
        const mapWidth = map.offsetWidth;
        const mapHeight = map.offsetHeight;

        // Get position from UMAP coordinates or fallback
        const position = this._getWordPosition(guess, mapWidth, mapHeight);

        // Create and style the dot
        const dot = this._createWordDot(guess, position);

        map.appendChild(dot);
    },

    // Get word position on map
    _getWordPosition(guess, mapWidth, mapHeight) {
        const padding = 40;
        let x, y;

        // Try to use UMAP coordinates
        const coords = Embeddings.decodeCoordinates(guess.index);

        if (coords) {
            // Map normalized coordinates to screen space
            x = coords.x * (mapWidth - 2 * padding) + padding;
            y = coords.y * (mapHeight - 2 * padding) + padding;
        } else {
            // Fallback: position based on similarity
            const angle = Math.random() * 2 * Math.PI;
            const distance = (1 - guess.similarity) * Math.min(mapWidth, mapHeight) * 0.3 + 50;

            x = mapWidth / 2 + Math.cos(angle) * distance;
            y = mapHeight / 2 + Math.sin(angle) * distance;
        }

        // Ensure within bounds
        x = Math.max(padding, Math.min(mapWidth - padding, x));
        y = Math.max(padding, Math.min(mapHeight - padding, y));

        return { x, y };
    },

    // Create a word dot element
    _createWordDot(guess, position) {
        const dotSize = Math.max(30, 30 + guess.similarity * 30);

        const dot = document.createElement('div');
        dot.className = `word-dot ${this._getSimilarityClass(guess.similarity)}`;
        dot.style.left = `${position.x - dotSize / 2}px`;
        dot.style.top = `${position.y - dotSize / 2}px`;
        dot.style.width = `${dotSize}px`;
        dot.style.height = `${dotSize}px`;
        dot.style.fontSize = `${Math.max(10, 8 + guess.similarity * 6)}px`;
        dot.textContent = guess.word;
        dot.title = `${guess.word}: ${(guess.similarity * 100).toFixed(1)}% similarity`;

        return dot;
    },

    // Get CSS class for similarity level
    _getSimilarityClass(similarity) {
        if (similarity >= 0.8) return 'dot-burning';
        if (similarity >= 0.6) return 'dot-hot';
        if (similarity >= 0.4) return 'dot-warm';
        if (similarity >= 0.2) return 'dot-cool';
        return 'dot-cold';
    },

    // Get similarity label
    _getSimilarityLabel(similarity) {
        if (similarity >= 0.8) return 'BURNING';
        if (similarity >= 0.6) return 'HOT';
        if (similarity >= 0.4) return 'WARM';
        if (similarity >= 0.2) return 'COOL';
        return 'COLD';
    },

    // Update guess history display
    updateGuessHistory(guesses, sortType) {
        if (guesses.length === 0) {
            this.elements.guessHistory.innerHTML = `
                <div style="text-align: center; opacity: 0.6; padding: 20px;">
                    No guesses yet. Start exploring!
                </div>
            `;
            return;
        }

        let html = '';

        // Always show most recent guess at top
        const mostRecent = guesses[guesses.length - 1];
        const isLatest = mostRecent.guessNumber === guesses.length;

        html += this._formatGuessItem(mostRecent, isLatest ? 'latest' : 'recent');

        // Add separator if there are other guesses
        if (guesses.length > 1) {
            html += '<div class="guess-separator"></div>';
        }

        // Sort and show other guesses
        if (guesses.length > 1) {
            const otherGuesses = guesses.slice(0, -1);
            const sorted = this._sortGuesses(otherGuesses, sortType);

            sorted.forEach(guess => {
                html += this._formatGuessItem(guess);
            });
        }

        this.elements.guessHistory.innerHTML = html;
    },

    // Format a single guess item
    _formatGuessItem(guess, extraClass = '') {
        if (guess.similarity == null) {
            return `
      <div class="guess-item ${extraClass}">
        <span>${guess.guessNumber} - ${guess.word}</span>
        <span class="similarity-score">⏳ scoring…</span>
      </div>
    `;
        }
        const similarityClass = this._getSimilarityClass(guess.similarity);
        const label = this._getSimilarityLabel(guess.similarity);

        return `
            <div class="guess-item ${extraClass}">
                <span>${guess.guessNumber} - ${guess.word}</span>
                <span class="similarity-score ${similarityClass}">
                    ${(guess.similarity * 100).toFixed(1)}% - ${label}
                </span>
            </div>
        `;
    },

    // Sort guesses array
    _sortGuesses(guesses, sortType) {
        const sorted = [...guesses];

        switch (sortType) {
            case 'similarity-desc':
                return sorted.sort((a, b) => b.similarity - a.similarity);
            case 'similarity-asc':
                return sorted.sort((a, b) => a.similarity - b.similarity);
            case 'order-desc':
                return sorted.sort((a, b) => b.guessNumber - a.guessNumber);
            case 'order-asc':
                return sorted.sort((a, b) => a.guessNumber - b.guessNumber);
            default:
                return sorted;
        }
    },

    // Update sort button states
    updateSortButtons(activeSort) {
        Object.entries(this.elements.sortButtons).forEach(([key, btn]) => {
            if (key === activeSort) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    // Update mobile sort button text
    updateMobileSortButton(sortType) {
        const labels = {
            'similarity-desc': '🔥 Best First',
            'similarity-asc': '❄️ Worst First',
            'order-desc': '🕒 Latest First',
            'order-asc': '📅 Oldest First'
        };

        this.elements.mobileSortBtn.textContent = `Sort: ${labels[sortType]}`;
    },

    // Show target area hint on map
    showTargetArea(targetWord, gameData) {
        const map = this.elements.semanticMap;
        const mapWidth = map.offsetWidth;
        const mapHeight = map.offsetHeight;

        // Get target position
        const targetIndex = gameData.words.indexOf(targetWord);
        const coords = Embeddings.decodeCoordinates(targetIndex);

        let targetX, targetY;
        const padding = 40;

        if (coords) {
            targetX = coords.x * (mapWidth - 2 * padding) + padding;
            targetY = coords.y * (mapHeight - 2 * padding) + padding;
        } else {
            // Fallback to center
            targetX = mapWidth / 2;
            targetY = mapHeight / 2;
        }

        // Create hint area circle
        const hintArea = document.createElement('div');
        hintArea.className = 'hint-area';
        hintArea.id = 'hint-area';

        const radius = Math.min(mapWidth, mapHeight) * 0.15;
        hintArea.style.left = `${targetX - radius}px`;
        hintArea.style.top = `${targetY - radius}px`;
        hintArea.style.width = `${radius * 2}px`;
        hintArea.style.height = `${radius * 2}px`;

        map.appendChild(hintArea);
    },

    // Show notification message
    showNotification(message) {
        // Clear existing timeout
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        // Remove existing notification
        const existing = document.getElementById('hint-notification');
        if (existing) existing.remove();

        // Create new notification
        const notification = document.createElement('div');
        notification.id = 'hint-notification';
        notification.className = 'hint-notification';
        notification.textContent = message;

        document.body.appendChild(notification);

        // Auto-remove after 4 seconds
        this.notificationTimeout = setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 4000);
    },

    // Clear all notifications
    clearNotifications() {
        const notification = document.getElementById('hint-notification');
        if (notification) notification.remove();

        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
            this.notificationTimeout = null;
        }
    },

    // Show victory modal
    showVictory(targetWord, guessCount) {
        this.elements.victoryWord.textContent = targetWord;
        this.elements.victoryGuesses.textContent = guessCount;
        this.elements.victoryModal.classList.remove('hidden');
    },

    // Update target word display
    updateTargetWord(word) {
        this.elements.targetWord.textContent = word;
    },

    // Update hint button state
    updateHintButton(state) {
        const btn = this.elements.hintBtn;

        switch (state) {
            case 'loading':
                // btn.classList.add('loading');
                // btn.textContent = '💡 Calculating...';
                // btn.disabled = false;
                break;
            case 'ready':
                btn.classList.remove('loading');
                btn.textContent = '💡 Hint';
                btn.disabled = false;
                break;
            case 'disabled':
                btn.classList.remove('loading');
                btn.textContent = '💡 Hint';
                btn.disabled = true;
                break;
            default:
                btn.classList.remove('loading');
                btn.textContent = '💡 Hint';
                btn.disabled = false;
        }
    },

    // === Daily header helpers ===
    updateDailyHeader({ dateStr, dailyNumber }) {
        this.elements.dailyTitle.textContent = `Daily #${dailyNumber}`;
        this.elements.dailyDate.textContent = dateStr;
    },

    setNextDisabled(isToday) {
        this.elements.nextDayBtn.disabled = !!isToday;
        this.elements.nextDayBtn.style.opacity = isToday ? 0.5 : 1;
        this.elements.nextDayBtn.style.cursor = isToday ? 'not-allowed' : 'pointer';
    },
    addPendingGuess(word) {
        // Fake a minimal guess object for rendering
        const guess = {
            word,
            similarity: null, // key: null means “pending”
            index: -1,
            guessNumber: (document.querySelectorAll('#guess-history .guess-item').length || 0) + 1
        };

        // Put a neutral dot near center so the map feels alive
        const map = this.elements.semanticMap;
        const w = map.offsetWidth, h = map.offsetHeight;
        const x = w / 2 + (Math.random() - 0.5) * Math.min(w, h) * 0.1;
        const y = h / 2 + (Math.random() - 0.5) * Math.min(w, h) * 0.1;

        const dot = document.createElement('div');
        dot.className = 'word-dot dot-cool'; // neutral color
        const size = 30;
        dot.style.left = `${x - size/2}px`;
        dot.style.top = `${y - size/2}px`;
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        dot.style.fontSize = `12px`;
        dot.textContent = word;
        dot.title = `${word}: scoring...`;

        map.appendChild(dot);

        // Update history: add a single line at top saying “scoring…”
        const history = this.elements.guessHistory;
        const pendingRow = document.createElement('div');
        pendingRow.className = 'guess-item latest';
        pendingRow.innerHTML = `
    <span>${guess.guessNumber} - ${word}</span>
    <span class="similarity-score">⏳ scoring…</span>
  `;
        history.prepend(pendingRow);
    }

};
