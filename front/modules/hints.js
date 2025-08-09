// modules/hints.js - Hint system with web worker management

export const HintSystem = {
    // Worker instance
    worker: null,

    // State
    isCalculating: false,
    lastRequestId: 0,
    cachedHint: null,
    targetWord: null,

    // Initialize the hint system
    async init(gameData) {
        return new Promise((resolve, reject) => {
            try {
                this.worker = new Worker('./hint-worker.js');

                // Setup message handler
                this.worker.onmessage = (e) => this._handleWorkerMessage(e);

                // Setup error handler
                this.worker.onerror = (error) => {
                    console.error('Hint worker error:', error);
                    reject(error);
                };

                // Initialize worker with game data
                this.worker.postMessage({
                    type: 'INIT',
                    data: gameData
                });

                // Wait for initialization complete
                this.worker.addEventListener('message', function initHandler(e) {
                    if (e.data.type === 'INIT_COMPLETE') {
                        this.removeEventListener('message', initHandler);
                        console.log('Hint system initialized');
                        resolve();
                    }
                });

            } catch (error) {
                console.error('Failed to initialize hint system:', error);
                reject(error);
            }
        });
    },

    // Reset for new game
    reset(targetWord) {
        this.targetWord = targetWord;
        this.cachedHint = null;
        this.isCalculating = false;
        this.lastRequestId = 0;

        // Notify worker of new game
        if (this.worker) {
            this.worker.postMessage({
                type: 'NEW_GAME',
                targetWord: targetWord
            });
        }
    },

    // Request a new hint calculation
    requestHint(bestGuess) {
        // Don't start new calculation if one is in progress
        // if (this.isCalculating) {
        //     console.log('Hint calculation already in progress');
        //     return;
        // }

        // Check if cached hint is still better than best guess
        if (this.cachedHint && bestGuess) {
            if (this.cachedHint.similarity > bestGuess.similarity) {
                console.log('Cached hint still valid');
                return;
            }
        }
        console.log('cachedHint: ', this.cachedHint)

        this.isCalculating = true;
        this.lastRequestId++;

        console.log('=== requestHint ===')
        console.log('bestGuess: ', bestGuess)
        // Send request to worker
        this.worker.postMessage({
            type: 'CALCULATE_HINT',
            requestId: this.lastRequestId,
            bestGuess: bestGuess ? {
                word: bestGuess.word,
                similarity: bestGuess.similarity,
                index: bestGuess.index
            } : null
        });
    },

    // Get current hint if available
    async getHint() {
        // If we have a cached hint, return it
        if (this.cachedHint) {
            const hint = this.cachedHint;
            this.cachedHint = null; // Clear after use
            return hint;
        }

        // If calculation is in progress, wait a bit
        if (this.isCalculating) {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(this.cachedHint);
                }, 1000);
            });
        }

        return null;
    },

    // Handle messages from worker
    _handleWorkerMessage(e) {
        const { type, requestId, data } = e.data;

        switch (type) {
            case 'INIT_COMPLETE':
                console.log('Hint worker initialized');
                break;

            case 'HINT_READY':
                // Ignore outdated responses
                if (requestId !== this.lastRequestId) {
                    console.log('Ignoring outdated hint response');
                    return;
                }

                this.cachedHint = data;
                this.isCalculating = false;
                console.log('Hint ready:', data?.word || 'none');
                console.log('Hint ready:', data?.similarity || 'none');
                break;

            case 'CALCULATION_COMPLETE':
                if (requestId === this.lastRequestId) {
                    this.isCalculating = false;
                }
                break;

            case 'ERROR':
                console.error('Hint worker error:', data);
                this.isCalculating = false;
                break;
        }
    },

    // Cleanup
    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
};