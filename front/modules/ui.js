import {Embeddings} from './embeddings.js';

export const UI = {
    // Cached DOM elements
    elements: {},

    // UI state
    latestGuessNumber: -1, notificationTimeout: null, targetPosition: null, // Cache target position for calculations

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

        // Reset cached target position
        this.targetPosition = null;

        // Reset sort to default
        this.updateSortButtons('similarity-desc');
        this.updateMobileSortButton('similarity-desc');

        // Remove any hint areas
        const hintArea = document.getElementById('hint-area');
        if (hintArea) hintArea.remove();

        // Clear notifications
        this.clearNotifications();
    },

    // Cache target position for position calculations
    _cacheTargetPosition(targetWord, gameData) {
        if (this.targetPosition) return;

        const targetIndex = gameData.words.indexOf(targetWord);
        const coords = Embeddings.decodeCoordinates(targetIndex);

        if (coords) {
            const map = this.elements.semanticMap;
            const mapWidth = map.offsetWidth;
            const mapHeight = map.offsetHeight;
            const padding = 40;

            this.targetPosition = {
                x: coords.x * (mapWidth - 2 * padding) + padding,
                y: coords.y * (mapHeight - 2 * padding) + padding,
                coords: coords // Keep normalized coords for calculations
            };
        }
    },

    // Enhanced positioning that prioritizes similarity over UMAP
    _getWordPosition(guess, mapWidth, mapHeight) {
        const padding = 50;
        const centerX = mapWidth / 2;
        const centerY = mapHeight / 2;

        // Distance from center based purely on similarity
        const maxRadius = Math.min(mapWidth, mapHeight) * 0.4;
        const distance = (1 - guess.similarity) * maxRadius + 20;

        // Smart angle selection to avoid overlaps
        const angle = this._findOptimalAngle(guess, distance, centerX, centerY);

        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;

        return {
            x: Math.max(padding, Math.min(mapWidth - padding, x)),
            y: Math.max(padding, Math.min(mapHeight - padding, y)),
            distance: distance,
            angle: angle
        };
    },

    // Find angle that minimizes overlaps with existing words
    _findOptimalAngle(guess, distance, centerX, centerY) {
        const existingDots = Array.from(this.elements.semanticMap.querySelectorAll('.word-dot'));

        // If no existing dots, use a deterministic but scattered pattern
        if (existingDots.length === 0) {
            return (guess.index * 0.618034) * 2 * Math.PI; // Golden ratio for nice spacing
        }

        let bestAngle = 0;
        let minPenalty = Infinity;

        // Try multiple angles
        const angleSteps = 32; // More steps for better placement
        for (let i = 0; i < angleSteps; i++) {
            const angle = (i / angleSteps) * 2 * Math.PI;
            const testX = centerX + Math.cos(angle) * distance;
            const testY = centerY + Math.sin(angle) * distance;

            let penalty = 0;

            // Calculate overlap penalty with existing dots
            existingDots.forEach(dot => {
                const dotRect = dot.getBoundingClientRect();
                const mapRect = this.elements.semanticMap.getBoundingClientRect();

                const dotX = dotRect.left - mapRect.left + dotRect.width / 2;
                const dotY = dotRect.top - mapRect.top + dotRect.height / 2;

                const dist = Math.sqrt((testX - dotX) ** 2 + (testY - dotY) ** 2);
                const minDistance = 50; // Minimum distance between dots

                if (dist < minDistance) {
                    penalty += Math.pow(minDistance - dist, 2); // Quadratic penalty for severe overlaps
                }
            });

            // Slight preference for cardinal/diagonal directions (looks cleaner)
            const cardinalAngles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];
            const nearestCardinal = cardinalAngles.reduce((prev, curr) =>
                Math.abs(curr - angle) < Math.abs(prev - angle) ? curr : prev
            );
            const cardinalPenalty = Math.abs(angle - nearestCardinal) * 2;
            penalty += cardinalPenalty;

            if (penalty < minPenalty) {
                minPenalty = penalty;
                bestAngle = angle;
            }
        }

        return bestAngle;
    },

    // Enhanced target area that matches the similarity circles
    showTargetArea(targetWord, gameData) {
        const map = this.elements.semanticMap;
        const mapWidth = map.offsetWidth;
        const mapHeight = map.offsetHeight;

        // Target is always at center in similarity-based layout
        const targetX = mapWidth / 2;
        const targetY = mapHeight / 2;

        // Store target info for other methods
        this.targetWord = targetWord;
        this.targetPosition = {x: targetX, y: targetY};

        // Create multiple concentric circles showing similarity ranges
        this._createSimilarityRings(targetX, targetY, mapWidth, mapHeight);

        // Main target indicator at exact center
        const hintArea = document.createElement('div');
        hintArea.className = 'hint-area target-center';
        hintArea.id = 'hint-area';

        const radius = 20; // Small central target
        hintArea.style.left = `${targetX - radius}px`;
        hintArea.style.top = `${targetY - radius}px`;
        hintArea.style.width = `${radius * 2}px`;
        hintArea.style.height = `${radius * 2}px`;
        hintArea.style.background = 'radial-gradient(circle, rgba(255,215,0,0.4), rgba(255,215,0,0.1))';
        hintArea.style.border = '3px solid #ffd700';
        hintArea.style.borderRadius = '50%';

        map.appendChild(hintArea);
    },

    // Create visual similarity rings for better UX
    _createSimilarityRings(centerX, centerY, mapWidth, mapHeight) {
        const maxRadius = Math.min(mapWidth, mapHeight) * 0.4;
        const similarities = [0.8, 0.6, 0.4, 0.2]; // Hot, warm, cool, cold thresholds
        const colors = ['#ffd700', '#ff9800', '#42a5f5', '#66bb6a'];
        const labels = ['BURNING', 'HOT', 'WARM', 'COOL'];

        similarities.forEach((sim, index) => {
            const radius = (1 - sim) * maxRadius + 20;

            const ring = document.createElement('div');
            ring.className = 'similarity-ring';
            ring.style.cssText = `
            position: absolute;
            left: ${centerX - radius}px;
            top: ${centerY - radius}px;
            width: ${radius * 2}px;
            height: ${radius * 2}px;
            border: 2px dashed ${colors[index]};
            border-radius: 50%;
            opacity: 0.3;
            pointer-events: none;
            z-index: 1;
        `;

            // Add label
            const label = document.createElement('div');
            label.style.cssText = `
            position: absolute;
            top: -25px;
            left: 50%;
            transform: translateX(-50%);
            color: ${colors[index]};
            font-size: 12px;
            font-weight: bold;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            pointer-events: none;
        `;
            label.textContent = labels[index];
            ring.appendChild(label);

            this.elements.semanticMap.appendChild(ring);
        });
    },

    // Fallback positioning when UMAP coordinates unavailable
    _getFallbackPosition(guess, mapWidth, mapHeight) {
        const padding = 40;
        const centerX = mapWidth / 2;
        const centerY = mapHeight / 2;

        // Distance from center based on similarity
        const maxRadius = Math.min(mapWidth, mapHeight) * 0.35;
        const distance = (1 - guess.similarity) * maxRadius + 30;

        // Random angle with some spread to avoid overlaps
        const angle = (Math.random() + guess.index * 0.618034) * 2 * Math.PI;

        return {
            x: Math.max(padding, Math.min(mapWidth - padding, centerX + Math.cos(angle) * distance)),
            y: Math.max(padding, Math.min(mapHeight - padding, centerY + Math.sin(angle) * distance)),
            wasAdjusted: false
        };
    },

    // Add this method to your UI class for special target word styling
    _createWordDot(guess, position) {
        const dotSize = position.isTarget ? 50 : Math.max(30, 30 + guess.similarity * 30);

        const dot = document.createElement('div');

        // Special styling for the target word
        if (position.isTarget) {
            dot.className = 'word-dot dot-target';
            dot.style.background = 'radial-gradient(circle, #ffd700, #ffb300)';
            dot.style.border = '4px solid #fff';
            dot.style.boxShadow = '0 0 40px rgba(255, 215, 0, 1), 0 0 80px rgba(255, 215, 0, 0.6)';
            dot.style.zIndex = '20';
            dot.style.animation = 'targetFound 2s ease-out infinite';
        } else {
            dot.className = `word-dot ${this._getSimilarityClass(guess.similarity)}`;

            // Add position adjustment indicator if needed
            if (position.wasAdjusted) {
                dot.classList.add('position-adjusted');
            }
        }

        dot.style.left = `${position.x - dotSize / 2}px`;
        dot.style.top = `${position.y - dotSize / 2}px`;
        dot.style.width = `${dotSize}px`;
        dot.style.height = `${dotSize}px`;
        dot.style.fontSize = `${Math.max(10, 8 + (guess.similarity || 1) * 8)}px`;
        dot.textContent = guess.word;
        dot.title = position.isTarget
            ? `🎯 TARGET FOUND: ${guess.word}!`
            : `${guess.word}: ${(guess.similarity * 100).toFixed(1)}% similarity`;

        return dot;
    },

    // Add connection line for high similarity words that appear distant
    _addConnectionLine(fromPos, toPos, similarity) {
        const line = document.createElement('div');
        line.className = 'similarity-connection';

        // Calculate line geometry
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        // Style the connection line
        Object.assign(line.style, {
            position: 'absolute',
            width: `${length}px`,
            height: '3px',
            left: `${fromPos.x}px`,
            top: `${fromPos.y - 1.5}px`,
            transformOrigin: '0 50%',
            transform: `rotate(${angle}rad)`,
            background: `linear-gradient(to right, 
                rgba(255, 215, 0, 0.1), 
                rgba(255, 215, 0, ${similarity * 0.6})
            )`,
            borderRadius: '2px',
            pointerEvents: 'none',
            zIndex: '1',
            animation: 'connectionPulse 3s ease-in-out infinite'
        });

        return line;
    },

    // Update statistics display
    updateStats(stats) {
        this.elements.guessCount.textContent = stats.guessCount;
        this.elements.bestScore.textContent = (stats.bestScore * 100).toFixed(1);
        this.elements.currentRank.textContent = stats.bestRank || '-';
        this.elements.targetWord.textContent = stats.targetWord;
    },

    // Add a word to the semantic map
    addWordToMap(guess, isHint = false) {
        const map = this.elements.semanticMap;
        const mapWidth = map.offsetWidth;
        const mapHeight = map.offsetHeight;

        // Get enhanced position
        const position = this._getWordPosition(guess, mapWidth, mapHeight);

        // Create the word dot
        const dot = this._createWordDot(guess, position);
        map.appendChild(dot);

        // Add connection line if high similarity but visually distant
        if (guess.similarity > 0.65 && this.targetPosition) {
            const distance = Math.sqrt(Math.pow(position.x - this.targetPosition.x, 2) + Math.pow(position.y - this.targetPosition.y, 2));

            // If visually far but semantically close, add connection
            const expectedMaxDistance = (1 - guess.similarity) * 200 + 50;
            if (distance > expectedMaxDistance * 1.5) {
                const connectionLine = this._addConnectionLine(position, this.targetPosition, guess.similarity);
                map.appendChild(connectionLine);
            }
        }
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
                    <span>${guess.isHint ? '💡 ' : ''}${guess.guessNumber} - ${guess.word}</span>
                    <span class="similarity-score">⏳ scoring…</span>
                </div>
            `;
        }
        const similarityClass = this._getSimilarityClass(guess.similarity);
        const label = this._getSimilarityLabel(guess.similarity);

        return `
            <div class="guess-item ${extraClass}">
                <span>${guess.isHint ? '💡 ' : ''}${guess.guessNumber} - ${guess.word}</span>
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

    // Daily header helpers
    updateDailyHeader({dateStr, dailyNumber}) {
        this.elements.dailyTitle.textContent = `Daily #${dailyNumber}`;
        this.elements.dailyDate.textContent = dateStr;
    },

    setNextDisabled(isToday) {
        this.elements.nextDayBtn.disabled = !!isToday;
        this.elements.nextDayBtn.style.opacity = isToday ? 0.5 : 1;
        this.elements.nextDayBtn.style.cursor = isToday ? 'not-allowed' : 'pointer';
    },

    addPendingGuess(word, isHint) {
        // Fake a minimal guess object for rendering
        const guess = {
            word, similarity: null, // key: null means "pending"
            index: -1, guessNumber: (document.querySelectorAll('#guess-history .guess-item').length || 0) + 1
        };

        // Put a neutral dot near center so the map feels alive
        const map = this.elements.semanticMap;
        const w = map.offsetWidth, h = map.offsetHeight;
        const x = w / 2 + (Math.random() - 0.5) * Math.min(w, h) * 0.1;
        const y = h / 2 + (Math.random() - 0.5) * Math.min(w, h) * 0.1;

        const dot = document.createElement('div');
        dot.className = 'word-dot dot-cool'; // neutral color
        const size = 30;
        dot.style.left = `${x - size / 2}px`;
        dot.style.top = `${y - size / 2}px`;
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        dot.style.fontSize = `12px`;
        dot.textContent = word;
        dot.title = `${word}: scoring...`;

        map.appendChild(dot);

        // Update history: add a single line at top saying "scoring…"
        const history = this.elements.guessHistory;
        const pendingRow = document.createElement('div');
        pendingRow.className = 'guess-item latest';
        pendingRow.innerHTML = `
            <span>${isHint ? '💡 ' : ''}${guess.guessNumber} - ${word}</span>
            <span class="similarity-score">⏳ scoring…</span>
        `;
        history.prepend(pendingRow);
    }
};