import {Embeddings} from './embeddings.js';

export const Game = {
    dataLoaded: false,
    pendingGuesses: [], // stores {word, timestamp}
    // Core game data
    data: null,
    maxWordSample: 1.0,
    timezone: 'America/Toronto',
    launchDateStr: '2025-08-01',

    // Current game state
    targetWord: '',
    targetEmbedding: null,
    targetIndex: -1,
    guesses: [],
    isWon: false,
    hintsUsed: 0,
    currentSort: 'similarity-desc',
    currentDateStr: null,

    // Storage keys
    STORAGE_KEY: 'semantiquest.v1.daily.progress',

    // Initialize with game data
    init(gameData, maxWordSample = 1.0, timezone = 'America/Toronto', launchDateStr = '2025-08-01') {
        this.data = gameData;
        this.maxWordSample = maxWordSample;
        this.timezone = timezone;
        this.launchDateStr = launchDateStr;
    },

    // Reset for a specific day (deterministic target)
    resetForDate(dateStr) {
        this.guesses = [];
        this.isWon = false;
        this.hintsUsed = 0;
        this.currentSort = 'similarity-desc';
        this.currentDateStr = dateStr;
        this.pickTargetForDate(dateStr);
    },
    enqueuePendingGuess(word, isHint = false) {
        this.pendingGuesses.push({word, timestamp: Date.now()});
    },

    drainPendingGuesses(processFn) {
        // processFn(word) -> should run the normal handleGuess flow
        const items = [...this.pendingGuesses];
        this.pendingGuesses = [];
        items.forEach(g => processFn(g.word));
    },


    // Deterministic target by date
    pickTargetForDate(dateStr) {
        const N = Math.floor(this.data.words.length * this.maxWordSample);
        const index = this._pickIndexDeterministic(dateStr, N);
        this.targetIndex = index;
        this.targetWord = this.data.words[this.targetIndex];
        this.targetEmbedding = Embeddings.decode(this.targetIndex);
    },

    // Validate a word guess
    validateWord(word) {
        if (!word) {
            return {valid: false, reason: 'Please enter a word'};
        }

        if (word.length > 50) {
            return {valid: false, reason: 'Word too long'};
        }

        if (!/^[a-z]+$/.test(word)) {
            return {valid: false, reason: 'Only lowercase letters allowed'};
        }

        const wordIndex = this.data.words.indexOf(word);
        if (wordIndex === -1) {
            return {valid: false, reason: 'Word not in vocabulary'};
        }

        return {valid: true, index: wordIndex};
    },

    // Check if word was already guessed
    hasGuessed(word) {
        return this.guesses.some(g => g.word === word);
    },

    // Add a new guess
    addGuess(word, similarity, index, isHint = false) {
        const guess = {
            word,
            similarity,
            index,
            timestamp: Date.now(),
            guessNumber: this.guesses.length + 1,
            rank: this.calculateRank(similarity),
            isHint: isHint,
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
    },

    // === Daily helpers ===
    getTodayDateStr() {
        // Format YYYY-MM-DD in configured timezone
        // en-CA yields YYYY-MM-DD
        return new Intl.DateTimeFormat('en-CA', {timeZone: this.timezone}).format(new Date());
    },

    isToday(dateStr) {
        return dateStr === this.getTodayDateStr();
    },

    isFutureDate(dateStr) {
        return this._cmpDate(dateStr, this.getTodayDateStr()) > 0;
    },

    offsetDate(dateStr, deltaDays) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setUTCDate(d.getUTCDate() + deltaDays);
        // Keep output in YYYY-MM-DD
        return d.toISOString().slice(0, 10);
    },

    getDailyNumber(dateStr) {
        const start = new Date(this.launchDateStr + 'T00:00:00Z');
        const day = new Date(dateStr + 'T00:00:00Z');
        const diff = Math.floor((day - start) / (1000 * 60 * 60 * 24));
        return diff + 1; // Daily #1 on launch day
    },

    // === Persistence ===
    _loadStore() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    },

    _saveStore(store) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(store));
    },

    saveProgress(dateStr) {
        const store = this._loadStore();
        store[dateStr] = {
            targetWord: this.targetWord,
            targetIndex: this.targetIndex,
            isWon: this.isWon,
            hintsUsed: this.hintsUsed,
            guesses: this.guesses
        };
        this._saveStore(store);
    },

    restoreProgress(dateStr) {
        const store = this._loadStore();
        const entry = store[dateStr];
        if (!entry) return false;

        // Safety: ensure target matches deterministic pick for this date
        const expectedIndex = this._pickIndexDeterministic(dateStr, Math.floor(this.data.words.length * this.maxWordSample));
        const expectedWord = this.data.words[expectedIndex];
        if (entry.targetWord !== expectedWord) {
            // Data version changed; discard incompatible save
            return false;
        }

        this.targetIndex = entry.targetIndex;
        this.targetWord = entry.targetWord;
        this.targetEmbedding = Embeddings.decode(this.targetIndex);
        this.guesses = entry.guesses || [];
        this.isWon = !!entry.isWon;
        this.hintsUsed = entry.hintsUsed || 0;

        return true;
    },

    clearProgressForDate(dateStr) {
        const store = this._loadStore();
        delete store[dateStr];
        this._saveStore(store);
    },

    // === Deterministic index picker ===
    _pickIndexDeterministic(dateStr, N) {
        // Hash the date + a small salt so reorders don't accidentally correlate
        const seed = this._xmur3(dateStr + '|semantiquest')();
        const rng = this._mulberry32(seed);
        return Math.floor(rng() * N);
    },

    // === Small utilities ===
    _cmpDate(a, b) {
        // compare YYYY-MM-DD strings lexicographically (safe)
        if (a === b) return 0;
        return a < b ? -1 : 1;
    },

    // xmur3 string hash -> 32-bit seed
    _xmur3(str) {
        let h = 1779033703 ^ str.length;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return function () {
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            h ^= h >>> 16;
            return h >>> 0;
        };
    },

    // mulberry32 PRNG from 32-bit seed
    _mulberry32(a) {
        return function () {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
};
