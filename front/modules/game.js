// modules/game.js - Game state management
import { Embeddings } from './embeddings.js';

export const Game = {
    // Core game data
    data: null,
    maxWordSample: 0.1,

    // Current game state
    targetWord: '',
    targetEmbedding: null,
    targetIndex: -1,
    guesses: [],
    isWon: false,
    hintsUsed: 0,
    currentSort: 'similarity-desc',

    // Initialize with game data
    init(gameData, maxWordSample = 0.1) {
        this.data = gameData;
        this.maxWordSample = maxWordSample;
    },

    // Reset for new game
    reset() {
        this.guesses = [];
        this.isWon = false;
        this.hintsUsed = 0;
        this.currentSort = 'similarity-desc';
        this.pickNewTarget();
    },

    // Pick a random target word
    pickNewTarget() {
        const maxIndex = Math.floor(this.data.words.length * this.maxWordSample);
        this.targetIndex = Math.floor(Math.random() * maxIndex);
        this.targetWord = this.data.words[this.targetIndex];
        this.targetEmbedding = Embeddings.decode(this.targetIndex);
    },

    // Validate a word guess
    validateWord(word) {
        if (!word) {
            return { valid: false, reason: 'Please enter a word' };
        }

        if (word.length > 50) {
            return { valid: false, reason: 'Word too long' };
        }

        if (!/^[a-z]+$/.test(word)) {
            return { valid: false, reason: 'Only lowercase letters allowed' };
        }

        const wordIndex = this.data.words.indexOf(word);
        if (wordIndex === -1) {
            return { valid: false, reason: 'Word not in vocabulary' };
        }

        return { valid: true, index: wordIndex };
    },

    // Check if word was already guessed
    hasGuessed(word) {
        return this.guesses.some(g => g.word === word);
    },

    // Add a new guess
    addGuess(word, similarity, index) {
        const guess = {
            word,
            similarity,
            index,
            timestamp: Date.now(),
            guessNumber: this.guesses.length + 1,
            rank: this.calculateRank(similarity)
        };

        this.guesses.push(guess);
        return guess;
    },

    // Calculate estimated rank based on similarity
    calculateRank(similarity) {
        if (similarity >= 0.9) return Math.floor(1 + (1 - similarity) * 100);
        if (similarity >= 0.8) return Math.floor(100 + (0.9 - similarity) * 1000);
        if (similarity >= 0.6) return Math.floor(1100 + (0.8 - similarity) * 2000);
        if (similarity >= 0.4) return Math.floor(5100 + (0.6 - similarity) * 5000);
        return Math.floor(10100 + (0.4 - similarity) * 10000);
    },

    // Get the best guess so far
    getBestGuess() {
        if (!this.guesses.length) return null;

        return this.guesses.reduce((best, guess) =>
            guess.similarity > best.similarity ? guess : best
        );
    },

    // Get sorted guesses based on current sort
    getSortedGuesses(sortType = null) {
        const sort = sortType || this.currentSort;
        const sorted = [...this.guesses];

        switch (sort) {
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

    // Get current game statistics
    getStats() {
        const bestGuess = this.getBestGuess();

        return {
            guessCount: this.guesses.length,
            bestScore: bestGuess ? bestGuess.similarity : 0,
            bestRank: bestGuess ? bestGuess.rank : null,
            targetWord: this.isWon ? this.targetWord : '???',
            hintsUsed: this.hintsUsed
        };
    }
};