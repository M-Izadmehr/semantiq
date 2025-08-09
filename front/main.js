// Game state
let gameData = null;
let targetWord = '';
let targetEmbedding = null;
let guesses = [];
let gameWon = false;
let hintsUsed = 0;
let hintAreaVisible = false;
let currentSort = 'similarity-desc'; // Default sort
let latestGuessIndex = -1; // Track latest guess for highlighting

// Web Worker for hint calculations
let hintWorker = null;
let hintCache = {
    cachedHint: null,
    cachedHintIndex: -1,
    cachedHintSimilarity: -1,
    bestGuess: null,
    bestGuessIndex: -1,
    bestGuessSimilarity: -1
};

// Sort options for mobile cycling
const sortOptions = [
    {key: 'similarity-desc', label: '🔥 Best First'},
    {key: 'similarity-asc', label: '❄️ Worst First'},
    {key: 'order-desc', label: '🕒 Latest First'},
    {key: 'order-asc', label: '📅 Oldest First'}
];
let currentSortIndex = 0;

// Initialize game
async function initGame() {
    try {
        console.log('Loading game data...');


        // Replace with your actual file path
        const response = await fetch('http://localhost:8000/embeddings_quantized.json.br');
        if (!response.ok) {
            throw new Error(`Failed to load game data: ${response.status}`);
        }

        gameData = await response.json();
        console.log('Game data loaded:', gameData.words.length, 'words');

        // Pick random target word
        const randomIndex = Math.floor(Math.random() * gameData.words.length / 10);
        targetWord = gameData.words[randomIndex];

        // Decode target embedding
        targetEmbedding = decodeQuantizedEmbedding(randomIndex);

        // Initialize Web Worker for hints
        initHintWorker();

        console.log('Target word:', targetWord);

        // Hide loading screen
        document.getElementById('loading').classList.add('hidden');

        // Setup event listeners
        setupEventListeners();


    } catch (error) {
        console.error('Failed to initialize game:', error);
        document.getElementById('loading').innerHTML =
            '<div style="color: white; text-align: center;"><h2>Error Loading Game</h2><p>' +
            error.message + '</p><p>Make sure embeddings_quantized.json.br is in the same folder.</p></div>';
    }
}

function initHintWorker() {
    hintWorker = new Worker('./hint-worker.js');

    hintWorker.onmessage = function (e) {
        const data = e.data;
        const {type, word, similarity, message, error, calculationId} = e.data;


        if (type === 'INIT_COMPLETE') {
            // Start calculating first hint immediately
            calculateHintInBackground();
        } else if (type === 'HINT_READY') {
            hintCache.cachedHint = data?.data?.word
            hintCache.cachedHintIndex = data?.data?.index
            hintCache.cachedHintSimilarity = data?.data?.similarity

            // Update hint button to show it's ready
            updateHintButtonState();

            console.log(`Hint ready: ${word || 'no suggestion'} (for ${hintCache.lastCalculatedForGuessCount} guesses)`);
        } else if (type === 'ERROR') {
            console.error('Hint worker error:', error);
        }
    };

    // Send initial data to worker
    hintWorker.postMessage({type: 'INIT', data: gameData, targetWord,});
}

function calculateHintInBackground() {
    const bestGuess = guesses?.sort((a, b) => b.similarity - a.similarity)[0];

    // if cachedHint is better than bestGuess, skip calculation
    if (hintCache?.cachedHintSimilarity > bestGuess?.similarity) {
        console.log('Cached hint is still valid, skipping calculation');
        return;
    }


    // Reset cache state
    hintCache.cachedHint = null;
    hintCache.cachedHintIndex = -1;
    hintCache.cachedHintSimilarity = -1;
    hintCache.bestGuess = bestGuess?.word;
    hintCache.bestGuessIndex = bestGuess?.index;
    hintCache.bestGuessSimilarity = bestGuess?.similarity;
    hintCache.calculationId++;

    hintWorker.postMessage({
        type: 'CALCULATE_HINT',
        calculationId: hintCache.calculationId,
        data: {
            bestGuess: bestGuess?.word,
            bestGuessIndex: bestGuess?.index,
        }
    });

    updateHintButtonState();
}

function decodeQuantizedEmbedding(wordIndex) {
    // Decode base64 quantized embedding
    const base64Data = gameData.embeddings_q8;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Extract embedding for specific word
    const embeddingSize = gameData.shape[1]; // 384 dimensions
    const startIdx = wordIndex * embeddingSize;
    const quantizedEmbedding = bytes.slice(startIdx, startIdx + embeddingSize);

    // Dequantize back to float
    const {emb_min, emb_max, emb_scale} = gameData;
    const embedding = new Float32Array(embeddingSize);

    for (let i = 0; i < embeddingSize; i++) {
        embedding[i] = (quantizedEmbedding[i] / emb_scale) + emb_min;
    }

    return embedding;
}

function calculateSimilarity(embedding1, embedding2) {
    // Cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

function setupEventListeners() {
    const input = document.getElementById('guess-input');
    const button = document.getElementById('guess-btn');
    const hintButton = document.getElementById('hint-btn');
    const mobileSortBtn = document.getElementById('sort-btn-mobile');
    const newGameBtn = document.getElementById('btn-new-game');

    // Sort buttons (desktop)
    const sortBtns = {
        'similarity-desc': document.getElementById('sort-similarity-desc'),
        'similarity-asc': document.getElementById('sort-similarity-asc'),
        'order-desc': document.getElementById('sort-order-desc'),
        'order-asc': document.getElementById('sort-order-asc')
    };

    button.addEventListener('click', () => makeGuess());
    hintButton.addEventListener('click', useHint);
    mobileSortBtn.addEventListener('click', cycleSortMobile);
    newGameBtn.addEventListener('click', startNewGame);


    // Add sort button listeners (desktop)
    Object.keys(sortBtns).forEach(sortType => {
        sortBtns[sortType].addEventListener('click', () => {
            currentSort = sortType;
            currentSortIndex = sortOptions.findIndex(opt => opt.key === sortType);
            updateSortButtons();
            updateGuessHistory();
        });
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !gameWon) {
            makeGuess();
        }
    });

    input.focus();


}

function cycleSortMobile() {
    currentSortIndex = (currentSortIndex + 1) % sortOptions.length;
    const newSort = sortOptions[currentSortIndex];
    currentSort = newSort.key;

    // Update mobile button text
    document.getElementById('sort-btn-mobile').textContent = `Sort: ${newSort.label}`;

    // Update desktop buttons
    updateSortButtons();
    updateGuessHistory();
}

function updateSortButtons() {
    const buttons = document.querySelectorAll('.sort-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    document.getElementById(`sort-${currentSort}`).classList.add('active');
}

function makeGuess(hint = null) {
    if (gameWon) return;

    const input = document.getElementById('guess-input');
    const word = hint || input.value.trim().toLowerCase();

    if (!word) return;

    // Check if word exists in our vocabulary
    const wordIndex = gameData.words.indexOf(word);
    if (wordIndex === -1) {
        alert('Word not found in vocabulary. Try a different word.');
        return;
    }

    // Check if already guessed
    if (guesses.find(g => g.word === word)) {
        return;
    }

    // Calculate similarity
    const wordEmbedding = decodeQuantizedEmbedding(wordIndex);
    const similarity = calculateSimilarity(wordEmbedding, targetEmbedding);

    // Add to guesses
    const guess = {
        word: word,
        similarity: similarity,
        rank: calculateRank(similarity),
        index: wordIndex,
        guessIndex: guesses.length + 1,
        timestamp: Date.now()
    };

    guesses.push(guess);
    latestGuessIndex = guess.guessIndex;

    const bestGuess = guesses.sort((a, b) => b.similarity - a.similarity)[0];
    hintCache.bestGuess = bestGuess.word;
    hintCache.bestGuessSimilarity = bestGuess.similarity;
    hintCache.bestGuessIndex = bestGuess.index;

    // Check for victory BEFORE updating UI
    if (word === targetWord) {
        document.getElementById('target-word').textContent = targetWord;
        winGame();
    }

    // Update UI
    updateStats();
    updateGuessHistory();
    addWordToMap(guess);

    // Start calculating next hint in background
    calculateHintInBackground();

    // Clear input
    input.value = '';
}

function calculateRank(similarity) {
    // Estimate rank based on similarity (rough approximation)
    if (similarity >= 0.9) return Math.floor(1 + (1 - similarity) * 100);
    if (similarity >= 0.8) return Math.floor(100 + (0.9 - similarity) * 1000);
    if (similarity >= 0.6) return Math.floor(1100 + (0.8 - similarity) * 2000);
    return Math.floor(5100 + (0.6 - similarity) * 10000);
}

function getSimilarityColor(similarity) {
    if (similarity >= 0.8) return 'dot-burning';
    if (similarity >= 0.6) return 'dot-hot';
    if (similarity >= 0.4) return 'dot-warm';
    if (similarity >= 0.2) return 'dot-cool';
    return 'dot-cold';
}

function getSimilarityLabel(similarity) {
    if (similarity >= 0.8) return 'BURNING';
    if (similarity >= 0.6) return 'HOT';
    if (similarity >= 0.4) return 'WARM';
    if (similarity >= 0.2) return 'COOL';
    return 'COLD';
}

function updateStats() {
    document.getElementById('guess-count').textContent = guesses.length;

    const bestScore = guesses.length > 0 ?
        Math.max(...guesses.map(g => g.similarity)).toFixed(3) : '0.000';
    document.getElementById('best-score').textContent = bestScore;

    const bestGuess = guesses.find(g => g.similarity === Math.max(...guesses.map(gg => gg.similarity)));
    document.getElementById('current-rank').textContent = bestGuess ? bestGuess.rank : '-';
}

function getSortedGuesses() {
    let sortedGuesses = [...guesses];

    switch (currentSort) {
        case 'similarity-desc':
            sortedGuesses.sort((a, b) => b.similarity - a.similarity);
            break;
        case 'similarity-asc':
            sortedGuesses.sort((a, b) => a.similarity - b.similarity);
            break;
        case 'order-desc':
            sortedGuesses.sort((a, b) => b.guessIndex - a.guessIndex);
            break;
        case 'order-asc':
            sortedGuesses.sort((a, b) => a.guessIndex - b.guessIndex);
            break;
    }

    return sortedGuesses;
}

function updateGuessHistory() {
    const historyDiv = document.getElementById('guess-history');

    if (guesses.length === 0) {
        historyDiv.innerHTML = '<div style="text-align: center; opacity: 0.6; padding: 20px;">No guesses yet. Start exploring!</div>';
        return;
    }

    let html = '';

    // Always show most recent guess at top
    if (guesses.length > 0) {
        const mostRecent = guesses[guesses.length - 1];
        const isLatest = mostRecent.guessIndex === latestGuessIndex;

        html += `
                <div class="guess-item ${isLatest ? 'latest' : 'recent'}">
                    <span>${mostRecent.guessIndex} - ${mostRecent.word}</span>
                    <span class="similarity-score ${getSimilarityColor(mostRecent.similarity)}">
                        ${(mostRecent.similarity * 100).toFixed(1)}% - ${getSimilarityLabel(mostRecent.similarity)}
                    </span>
                </div>
            `;

        // Add separator if there are other guesses
        if (guesses.length > 1) {
            html += '<div class="guess-separator"></div>';
        }
    }

    // Show sorted list of other guesses (excluding most recent)
    if (guesses.length > 1) {
        const otherGuesses = guesses.slice(0, -1);
        let sortedOthers = [...otherGuesses];

        switch (currentSort) {
            case 'similarity-desc':
                sortedOthers.sort((a, b) => b.similarity - a.similarity);
                break;
            case 'similarity-asc':
                sortedOthers.sort((a, b) => a.similarity - b.similarity);
                break;
            case 'order-desc':
                sortedOthers.sort((a, b) => b.guessIndex - a.guessIndex);
                break;
            case 'order-asc':
                sortedOthers.sort((a, b) => a.guessIndex - b.guessIndex);
                break;
        }

        html += sortedOthers.map((guess) => {
            return `
                    <div class="guess-item">
                        <span>${guess.guessIndex} - ${guess.word}</span>
                        <span class="similarity-score ${getSimilarityColor(guess.similarity)}">
                            ${(guess.similarity * 100).toFixed(1)}% - ${getSimilarityLabel(guess.similarity)}
                        </span>
                    </div>
                `;
        }).join('');
    }

    historyDiv.innerHTML = html;

    // Reset latest guess tracking after animation
    if (latestGuessIndex !== -1) {
        setTimeout(() => {
            latestGuessIndex = -1;
            document.querySelectorAll('.guess-item.latest').forEach(item => {
                item.classList.remove('latest');
            });
        }, 2000);
    }
}

function addWordToMap(guess) {
    const map = document.getElementById('semantic-map');
    const mapWidth = map.offsetWidth;
    const mapHeight = map.offsetHeight;

    // Use UMAP coordinates if available
    let x, y;

    const wordIndex = guess.index;
    if (gameData.coordinates_q8 && wordIndex !== -1) {
        try {
            // Decode UMAP coordinates
            const coordsData = atob(gameData.coordinates_q8);
            const coordsBytes = new Uint8Array(coordsData.length);
            for (let i = 0; i < coordsData.length; i++) {
                coordsBytes[i] = coordsData.charCodeAt(i);
            }

            const coordIndex = wordIndex * 2; // 2D coordinates
            if (coordIndex + 1 < coordsBytes.length) {
                const quantX = coordsBytes[coordIndex];
                const quantY = coordsBytes[coordIndex + 1];

                // Dequantize coordinates
                const {coord_min, coord_max, coord_scale} = gameData;
                const rawX = (quantX / coord_scale) + coord_min;
                const rawY = (quantY / coord_scale) + coord_min;

                // Normalize to map dimensions with padding
                const padding = 40;
                x = (rawX - coord_min) / (coord_max - coord_min) * (mapWidth - 2 * padding) + padding;
                y = (rawY - coord_min) / (coord_max - coord_min) * (mapHeight - 2 * padding) + padding;

                // Ensure coordinates are within bounds
                x = Math.max(padding, Math.min(mapWidth - padding, x));
                y = Math.max(padding, Math.min(mapHeight - padding, y));
            } else {
                throw new Error('Invalid coordinate index');
            }
        } catch (error) {
            console.warn('Failed to decode UMAP coordinates, using fallback positioning:', error);
            // Fallback positioning
            const similarity = guess.similarity;
            const angle = Math.random() * 2 * Math.PI;
            const distance = (1 - similarity) * Math.min(mapWidth, mapHeight) * 0.3 + 50;

            x = mapWidth / 2 + Math.cos(angle) * distance;
            y = mapHeight / 2 + Math.sin(angle) * distance;
        }
    } else {
        // Fallback: position based on similarity
        const similarity = guess.similarity;
        const angle = Math.random() * 2 * Math.PI;
        const distance = (1 - similarity) * Math.min(mapWidth, mapHeight) * 0.3 + 50;

        x = mapWidth / 2 + Math.cos(angle) * distance;
        y = mapHeight / 2 + Math.sin(angle) * distance;
    }

    const dotSize = Math.max(30, 30 + guess.similarity * 30);
    const dot = document.createElement('div');
    dot.className = `word-dot ${getSimilarityColor(guess.similarity)}`;
    dot.style.left = `${x - dotSize / 2}px`;
    dot.style.top = `${y - dotSize / 2}px`;
    dot.style.width = `${dotSize}px`;
    dot.style.height = `${dotSize}px`;
    dot.style.fontSize = `${Math.max(10, 8 + guess.similarity * 6)}px`;
    dot.textContent = guess.word;
    dot.title = `${guess.word}: ${(guess.similarity * 100).toFixed(1)}% similarity`;

    map.appendChild(dot);
}

function useHint() {
    if (gameWon) return;

    if (hintsUsed === 0) {
        // First hint: Show vicinity area on map
        showTargetVicinity();
        hintsUsed = 1;
        updateHintButtonState();
        showHintNotification("💡 Hint!");
        return
    }

    if (!hintCache.bestGuess) {
        showHintNotification("💡 No guesses made yet. Please make a guess first.");
        return;
    }

    if (!hintCache.cachedHint || hintCache.cachedHintSimilarity <= hintCache.bestGuessSimilarity) {
        showHintNotification("💡 No hints available at the moment. Please make more guesses ...");
        calculateHintInBackground()

        return;
    }

    showHintNotification(hintCache.cachedHint);

    if (hintCache.cachedHint) {
        makeGuess(hintCache.cachedHint);
    }

    // Mark hint as used and start calculating next one
    hintCache.isReady = false;
    hintCache.cachedHint = null;
    hintCache.cachedHintSimilarity = -1;
    hintCache.cachedHintIndex = -1;

    hintsUsed++;
    updateHintButtonState();

    // Start calculating next hint immediately for future use
    calculateHintInBackground()


}

function updateHintButtonState() {
    const hintBtn = document.getElementById('hint-btn');

    if (gameWon) {
        hintBtn.textContent = '🎉 Game Won!';
        hintBtn.disabled = true;
        hintBtn.classList.remove('loading');
        return;
    }

    hintBtn.textContent = '💡 Hint';
    hintBtn.disabled = false;
    hintBtn.classList.remove('loading');


}

function showTargetVicinity() {
    const map = document.getElementById('semantic-map');
    const mapWidth = map.offsetWidth;
    const mapHeight = map.offsetHeight;

    // Calculate target position using same logic as addWordToMap
    let targetX, targetY;
    const targetIndex = gameData.words.indexOf(targetWord);

    if (gameData.coordinates_q8 && targetIndex !== -1) {
        try {
            const coordsData = atob(gameData.coordinates_q8);
            const coordsBytes = new Uint8Array(coordsData.length);
            for (let i = 0; i < coordsData.length; i++) {
                coordsBytes[i] = coordsData.charCodeAt(i);
            }

            const coordIndex = targetIndex * 2;
            if (coordIndex + 1 < coordsBytes.length) {
                const quantX = coordsBytes[coordIndex];
                const quantY = coordsBytes[coordIndex + 1];

                const {coord_min, coord_max, coord_scale} = gameData;
                const rawX = (quantX / coord_scale) + coord_min;
                const rawY = (quantY / coord_scale) + coord_min;

                const padding = 40;
                targetX = (rawX - coord_min) / (coord_max - coord_min) * (mapWidth - 2 * padding) + padding;
                targetY = (rawY - coord_min) / (coord_max - coord_min) * (mapHeight - 2 * padding) + padding;

                targetX = Math.max(padding, Math.min(mapWidth - padding, targetX));
                targetY = Math.max(padding, Math.min(mapHeight - padding, targetY));
            } else {
                throw new Error('Invalid coordinate index');
            }
        } catch (error) {
            targetX = mapWidth / 2;
            targetY = mapHeight / 2;
        }
    } else {
        targetX = mapWidth / 2;
        targetY = mapHeight / 2;
    }

    // Create hint area
    const hintArea = document.createElement('div');
    hintArea.className = 'hint-area';
    hintArea.id = 'hint-area';

    const radius = Math.min(mapWidth, mapHeight) * 0.15; // 15% of map size
    hintArea.style.left = `${targetX - radius}px`;
    hintArea.style.top = `${targetY - radius}px`;
    hintArea.style.width = `${radius * 2}px`;
    hintArea.style.height = `${radius * 2}px`;

    map.appendChild(hintArea);
    hintAreaVisible = true;
}

function showHintNotification(message) {
    // Remove existing notification
    const existing = document.getElementById('hint-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'hint-notification';
    notification.className = 'hint-notification';
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 4000);
}

function winGame() {
    gameWon = true;
    document.getElementById('victory-word').textContent = targetWord;
    document.getElementById('victory-guesses').textContent = guesses.length;
    document.getElementById('victory-modal').classList.remove('hidden');
}

function startNewGame() {
    // Reset game state
    guesses = [];
    gameWon = false;
    hintsUsed = 0;
    hintAreaVisible = false;
    latestGuessIndex = -1;
    currentSort = 'similarity-desc';
    currentSortIndex = 0;

    // Reset hint cache
    hintCache = {
        cachedHint: null,
        calculationId: 0,
        lastCalculatedForGuessCount: -1
    };

    // Pick new target
    const randomIndex = Math.floor(Math.random() * gameData.words.length);
    targetWord = gameData.words[randomIndex];
    targetEmbedding = decodeQuantizedEmbedding(randomIndex);

    console.log('New target word:', targetWord);

    // Reset UI
    document.getElementById('semantic-map').innerHTML = '';
    document.getElementById('guess-history').innerHTML =
        '<div style="text-align: center; opacity: 0.6; padding: 20px;">No guesses yet. Start exploring!</div>';
    document.getElementById('target-word').textContent = '???';
    document.getElementById('victory-modal').classList.add('hidden');

    // Reset hint button
    updateHintButtonState();

    // Reset sort buttons
    updateSortButtons();
    document.getElementById('sort-btn-mobile').textContent = 'Sort: 🔥 Best First';

    // Remove any existing hint notifications
    const existing = document.getElementById('hint-notification');
    if (existing) existing.remove();

    updateStats();
    document.getElementById('guess-input').focus();

    // Start calculating first hint in background immediately
    hintWorker.postMessage({
        type: 'NEW_GAME',
        calculationId: hintCache.calculationId,
        data: {
            targetWord: targetWord,
        }
    });
    setTimeout(() => calculateHintInBackground(), 10);
}

// Start the game when page loads
window.addEventListener('load', initGame);