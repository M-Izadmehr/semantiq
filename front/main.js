// main.js - Main game initialization and coordination
import { Game } from './modules/game.js';
import { UI } from './modules/ui.js';
import { HintSystem } from './modules/hints.js';
import { Embeddings } from './modules/embeddings.js';

// Configuration
const CONFIG = {
    DATA_URL: 'http://localhost:8000/embeddings_quantized.json.br',
    MAX_WORD_SAMPLE: 0.1, // Use 10% of words for target selection
};

// Initialize the game
async function initGame() {
    try {
        console.log('Loading game data...');

        // Load game data
        const response = await fetch(CONFIG.DATA_URL);
        if (!response.ok) {
            throw new Error(`Failed to load game data: ${response.status}`);
        }

        const gameData = await response.json();
        console.log(`Game data loaded: ${gameData.words.length} words`);

        // Initialize modules
        Game.init(gameData, CONFIG.MAX_WORD_SAMPLE);
        Embeddings.init(gameData);
        UI.init();
        await HintSystem.init(gameData);

        // Start new game
        startNewGame();

        // Setup event listeners
        setupEventListeners();

        // Hide loading screen
        document.getElementById('loading').classList.add('hidden');

    } catch (error) {
        console.error('Failed to initialize game:', error);
        showLoadingError(error);
    }
}

// Show loading error
function showLoadingError(error) {
    document.getElementById('loading').innerHTML = `
        <div style="color: white; text-align: center;">
            <h2>Error Loading Game</h2>
            <p>${error.message}</p>
            <p>Make sure embeddings_quantized.json.br is available.</p>
        </div>
    `;
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

    // New game button
    UI.elements.newGameBtn.addEventListener('click', startNewGame);

    // Focus input
    UI.elements.guessInput.focus();
}

// Handle guess submission
function handleGuess(wordOverride = null) {
    if (Game.isWon) return;

    const word = wordOverride || UI.elements.guessInput.value.trim().toLowerCase();
    if (!word) return;

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
    const guess = Game.addGuess(word, similarity, wordIndex);

    // Update UI
    UI.addWordToMap(guess);
    UI.updateGuessHistory(Game.guesses, Game.currentSort);
    UI.updateStats(Game.getStats());

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
        UI.showNotification('💡 Target area revealed!');
        return;
    }

    // Subsequent hints give word suggestions
    const hint = await HintSystem.getHint();

    if (!hint) {
        UI.showNotification('💡 No hint available. Make more guesses!');
        return;
    }

    // Use the hint as a guess
    UI.showNotification(`💡 Try: ${hint.word}`);
    handleGuess(hint.word);
    Game.hintsUsed++;
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
}

// Start a new game
function startNewGame() {
    // Reset game state
    Game.reset();

    // Reset UI
    UI.reset();
    UI.updateStats(Game.getStats());

    // Notify hint system of new game
    HintSystem.reset(Game.targetWord);

    // Start calculating first hint in background
    HintSystem.requestHint(null);

    console.log('New game started. Target:', Game.targetWord);
}

// Start the game when page loads
window.addEventListener('load', initGame);