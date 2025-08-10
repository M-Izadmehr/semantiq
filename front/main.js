import {Game} from './modules/game.js';
import {UI} from './modules/ui.js';
import {HintSystem} from './modules/hints.js';
import {Embeddings} from './modules/embeddings.js';

// Configuration
const CONFIG = {
    EMBEDDINGS_VERSION: 'v1.0.0', // I can use this line to invalidate the cache later
    DATA_URL: 'embeddings_quantized.json',
    MAX_WORD_SAMPLE: 1.0, // daily should use full vocab by default
    TIMEZONE: 'America/Toronto', // daily is anchored to this tz, just so everyone gets their puzzles switched at same time
    LAUNCH_DATE: '2025-07-01'
};

// Global current date string (YYYY-MM-DD, in TZ)
let currentDateStr = null;

// Initialize the game
async function initGame() {
    try {
        // Init UI immediately
        UI.init();

        // If you use daily mode, set header right away (optional):
        // Game may need timezone/launch config first, so call a light init.
        Game.init({}, 1.0); // temp; we’ll set real data after fetch

        // Wire listeners now (so user can type immediately)
        setupEventListeners();

        // Kick off data load in background
        console.time('fetch-start');
        const response = await fetch(CONFIG.DATA_URL);
        console.timeEnd('fetch-start');
        if (!response.ok) throw new Error(`Failed to load game data: ${response.status}`);

        console.time('json-parse-start');
        const gameData = await response.json();
        console.timeEnd('json-parse-start');

        console.log('gameData: ', gameData)
        // Finish init once data arrives
        Game.data = gameData;
        Game.dataLoaded = true;

        Embeddings.init(gameData);
        await HintSystem.init(gameData); // OK to await now; UI is live already
        currentDateStr = Game.getTodayDateStr();
        loadDaily(currentDateStr);
        // Process any early guesses the player entered
        Game.drainPendingGuesses((word) => handleGuess(word?.toLowerCase()?.trim?.()));

    } catch (err) {
        console.error('Init error:', err);
        // No overlay. Just a toast:
        UI.showNotification('Having trouble loading data. Keep guessing—we’ll score as soon as it connects.');
    }
}

// Setup all event listeners
function setupEventListeners() {
    // Main game controls
    UI.elements.guessBtn.addEventListener('click', handleGuess);
    UI.elements.hintBtn.addEventListener('click', handleHint);
    UI.elements.guessInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !Game.isWon) {
            handleGuess();
        }
    });

    // Sort controls
    UI.elements.mobileSortBtn.addEventListener('click', handleMobileSort);

    // Desktop sort buttons
    Object.entries(UI.elements.sortButtons).forEach(([key, btn]) => {
        btn.addEventListener('click', () => handleSort(key));
    });

    // Daily navigation
    UI.elements.prevDayBtn.addEventListener('click', () => {
        const prev = Game.offsetDate(currentDateStr, -1);
        changeDay(prev);
    });
    UI.elements.nextDayBtn.addEventListener('click', () => {
        const next = Game.offsetDate(currentDateStr, 1);
        if (Game.isFutureDate(next)) return; // guard
        changeDay(next);
    });

    // New game button (victory modal) -> reload same day (archive replay)
    UI.elements.newGameBtn.addEventListener('click', () => {
        // Start this day's puzzle fresh (clears progress)
        Game.clearProgressForDate(currentDateStr);
        loadDaily(currentDateStr);
    });

    // Focus input
    UI.elements.guessInput.focus();
}

// Change to another day and load (autosave current first)
function changeDay(dateStr) {
    Game.saveProgress(currentDateStr); // ensure we save
    currentDateStr = dateStr;
    loadDaily(currentDateStr);
}

// Handle guess submission
function handleGuess(wordOverride = null, isHint = false) {
    if (Game.isWon) return;

    const word = (wordOverride?.trim?.()?.toLowerCase() || UI.elements.guessInput.value?.trim?.()?.toLowerCase());
    if (!word) return;

    if (!Game.dataLoaded) {
        // Accept any lowercase guess while loading
        if (!/^[a-z]+$/.test(word)) {
            UI.showNotification('Only single words allowed');
            return;
        }

        // Show a placeholder item in history/map
        UI.addPendingGuess(word, isHint);
        Game.enqueuePendingGuess(word, isHint);

        UI.showNotification('Scoring in a moment—keep guessing!');
        UI.elements.guessInput.value = '';
        UI.elements.guessInput.focus();
        return;
    }

    // Validate word
    const validation = Game.validateWord(word);
    if (!validation.valid) {
        UI.showNotification(validation.reason);
        return;
    }

    // Check if already guessed
    if (Game.hasGuessed(word)) {
        UI.showNotification('Already guessed!');
        return;
    }

    // Calculate similarity
    const wordIndex = Game.data.words.indexOf(word);
    const embedding = Embeddings.decode(wordIndex);
    const similarity = Embeddings.similarity(embedding, Game.targetEmbedding);

    // Add guess to game state
    const guess = Game.addGuess(word, similarity, wordIndex, isHint);

    // Update UI
    UI.addWordToMap(guess, isHint);
    UI.updateGuessHistory(Game.guesses, Game.currentSort);
    UI.updateStats(Game.getStats());
    Game.saveProgress(currentDateStr); // autosave

    // Check for victory
    if (word === Game.targetWord) {
        handleVictory();
    } else {
        // Request new hint calculation for next guess
        HintSystem.requestHint(Game.getBestGuess());
    }

    // Clear input
    UI.elements.guessInput.value = '';
    UI.elements.guessInput.focus();
}

// Handle hint button click
async function handleHint() {
    if (Game.isWon) return;

    // First hint shows area on map
    if (Game.hintsUsed === 0) {
        UI.showTargetArea(Game.targetWord, Game.data);
        Game.hintsUsed++;
        UI.updateStats(Game.getStats());
        Game.saveProgress(currentDateStr); // autosave
        UI.showNotification('💡 Target area revealed!');
        return;
    }

    // Subsequent hints give word suggestions
    const hint = await HintSystem.getHint();

    if (!hint) {
        UI.updateHintButton('loading');
        UI.showNotification('No hints available right now. Keep guessing!');
        return;
    }

    // Use the hint as a guess
    UI.showNotification(`💡 Try: ${hint.word}`);
    handleGuess(hint.word?.toLowerCase()?.trim?.(), true);
    Game.hintsUsed++;
    UI.updateStats(Game.getStats());
    Game.saveProgress(currentDateStr);
}

// Handle sort change
function handleSort(sortType) {
    Game.currentSort = sortType;
    UI.updateSortButtons(sortType);
    UI.updateGuessHistory(Game.guesses, sortType);
}

// Handle mobile sort cycling
function handleMobileSort() {
    const sorts = ['similarity-desc', 'similarity-asc', 'order-desc', 'order-asc'];
    const currentIndex = sorts.indexOf(Game.currentSort);
    const nextSort = sorts[(currentIndex + 1) % sorts.length];

    Game.currentSort = nextSort;
    UI.updateMobileSortButton(nextSort);
    UI.updateSortButtons(nextSort);
    UI.updateGuessHistory(Game.guesses, nextSort);
}

// Handle victory
function handleVictory() {
    Game.isWon = true;
    UI.showVictory(Game.targetWord, Game.guesses.length);
    UI.updateTargetWord(Game.targetWord);
    Game.saveProgress(currentDateStr); // save win
}

// Load a specific day’s puzzle (restore if exists, else fresh)
function loadDaily(dateStr) {
    // Reset game for specific date (sets target deterministically)
    Game.resetForDate(dateStr);

    // Update daily header and nav button disabled state
    UI.updateDailyHeader({
        dateStr,
        dailyNumber: Game.getDailyNumber(dateStr)
    });
    UI.setNextDisabled(Game.isToday(dateStr));

    // Try to restore progress
    const restored = Game.restoreProgress(dateStr);
    UI.reset(); // clear UI visuals

    // Apply restored guesses if any
    if (restored && Game.guesses.length) {
        Game.guesses.forEach(g => UI.addWordToMap(g));
        UI.updateGuessHistory(Game.guesses, Game.currentSort);
        if (Game.hintsUsed > 0) {
            UI.showTargetArea(Game.targetWord, Game.data);
        }
        if (Game.isWon) {
            UI.showVictory(Game.targetWord, Game.guesses.length);
            UI.updateTargetWord(Game.targetWord);
        }

        HintSystem.reset(Game.targetWord);
        HintSystem.requestHint(Game.getBestGuess());


    } else {
        // brand new day: kick off worker to compute background hints
        HintSystem.reset(Game.targetWord);
        HintSystem.requestHint(null);
    }

    // Always keep stats in sync
    UI.updateStats(Game.getStats());
    UI.elements.guessInput.focus();
}


// Service Worker registration with version support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('SW registered:', registration.scope);

                // Listen for messages from SW
                navigator.serviceWorker.addEventListener('message', handleSWMessage);
            })
            .catch(error => {
                console.log('SW registration failed:', error);
            });
    });
}

// Handle messages from service worker
function handleSWMessage(event) {
    const {action} = event.data || {};

    if (action === 'GET_EMBEDDINGS_VERSION') {
        // Send current version to SW
        event.ports[0]?.postMessage({
            version: CONFIG.EMBEDDINGS_VERSION
        });
    }
}

// Utility functions for cache management
const CacheManager = {
    // Force clear all embeddings caches
    async clearCache() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            const messageChannel = new MessageChannel();

            return new Promise((resolve) => {
                messageChannel.port1.onmessage = (event) => {
                    resolve(event.data.success);
                };

                navigator.serviceWorker.controller.postMessage(
                    {action: 'CLEAR_EMBEDDINGS_CACHE'},
                    [messageChannel.port2]
                );
            });
        }
        return false;
    },

    // Invalidate specific version
    async invalidateVersion(version) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            const messageChannel = new MessageChannel();

            return new Promise((resolve) => {
                messageChannel.port1.onmessage = (event) => {
                    resolve(event.data.success);
                };

                navigator.serviceWorker.controller.postMessage(
                    {action: 'INVALIDATE_VERSION', version},
                    [messageChannel.port2]
                );
            });
        }
        return false;
    }
};

// Optional: Add to window for debugging
window.CacheManager = CacheManager;

// Start the game when page loads
window.addEventListener('load', initGame);
