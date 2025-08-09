// State
let gameData = null;
let targetWord = null;
let targetEmbedding = null;
let topHints = null;
let isProcessing = false;
let currentRequestId = null;

// Configuration
const CONFIG = {
    MAX_HINTS: 200,          // Maximum number of hints to keep
    CHUNK_SIZE: 100,        // Words to process per chunk
    YIELD_DELAY: 0,         // Delay between chunks (ms)
    MIN_SIMILARITY: 0.3     // Minimum similarity to consider
};

// TopHints class - maintains best word suggestions
class TopHints {
    constructor(maxSize = 50) {
        this.hints = [];
        this.maxSize = maxSize;
        this.worstScore = 0;
    }

    add(word, similarity, index) {
        // Skip if worse than our worst kept hint
        if (this.hints.length >= this.maxSize && similarity <= this.worstScore) {
            return false;
        }

        // Add new hint
        this.hints.push({word, similarity, index});

        // Sort by similarity
        this.hints.sort((a, b) => b.similarity - a.similarity);

        // Keep only top N
        if (this.hints.length > this.maxSize) {
            this.hints = this.hints.slice(0, this.maxSize);
        }

        // Update worst score
        this.worstScore = this.hints.length > 0 ?
            this.hints[this.hints.length - 1].similarity : 0;

        return true;
    }

    getBetterThan(similarity) {
        // Find a hint better than the given similarity
        for (const hint of this.hints) {
            if (hint.word !== targetWord && hint.similarity > similarity) {
                return hint;
            }
        }
        return null;
    }

    getGradualHint(currentBestSimilarity) {
        // Filter out target word and hints worse than current best
        const availableHints = this.hints.filter(h =>
            h.word !== targetWord && h.similarity > currentBestSimilarity
        );

        if (availableHints.length === 0) return null;

        // Strategy: Give incremental hints based on current progress
        let targetImprovement;
        if (currentBestSimilarity < 0.4) {
            targetImprovement = 0.05 + Math.random() * 0.03;
        } else if (currentBestSimilarity < 0.7) {
            targetImprovement = 0.03 + Math.random() * 0.02;
        } else {
            targetImprovement = 0.02 + Math.random() * 0.01;
        }

        const targetSimilarity = currentBestSimilarity + targetImprovement;

        // Find hints closest to our target similarity
        let bestHint = null;
        let bestDiff = Infinity;

        for (const hint of availableHints) {
            const diff = Math.abs(hint.similarity - targetSimilarity);

            if (hint.similarity > targetSimilarity && hint.similarity < targetSimilarity + 0.1) {
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestHint = hint;
                }
            }
        }

        // If no hint near target, pick from bottom 30% of available hints
        if (!bestHint && availableHints.length > 0) {
            availableHints.sort((a, b) => a.similarity - b.similarity);
            const maxIndex = Math.max(1, Math.floor(availableHints.length * 0.3));
            const index = Math.floor(Math.random() * maxIndex);
            bestHint = availableHints[index];
        }

        return bestHint;
    }

    clear() {
        this.hints = [];
        this.worstScore = 0;
    }
}

// Decode quantized embedding
function decodeEmbedding(wordIndex) {
    if (!gameData) return null;

    try {
        const base64Data = gameData.embeddings_q8;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const embeddingSize = gameData.shape[1];
        const startIdx = wordIndex * embeddingSize;
        const quantizedEmbedding = bytes.slice(startIdx, startIdx + embeddingSize);

        const {emb_min, emb_scale} = gameData;
        const embedding = new Float32Array(embeddingSize);

        for (let i = 0; i < embeddingSize; i++) {
            embedding[i] = (quantizedEmbedding[i] / emb_scale) + emb_min;
        }

        return embedding;
    } catch (error) {
        console.error('Failed to decode embedding:', error);
        return null;
    }
}

// Calculate cosine similarity
function calculateSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2) return 0;

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

// Process a chunk of words
async function processChunk(startIndex, requestId, minSimilarity = CONFIG.MIN_SIMILARITY) {
    // Check if this request is still current
    if (requestId !== currentRequestId || !isProcessing) {
        return;
    }

    const endIndex = Math.min(startIndex + CONFIG.CHUNK_SIZE, gameData.words.length);

    for (let i = startIndex; i < endIndex; i++) {
        // Skip target word
        if (gameData.words[i] === targetWord) continue;

        const embedding = decodeEmbedding(i);
        if (!embedding) continue;

        const similarity = calculateSimilarity(embedding, targetEmbedding);

        // Only keep if above minimum threshold
        if (similarity > minSimilarity) {
            topHints.add(gameData.words[i], similarity, i);
        }
    }
    
    // Yield control to prevent blocking
    await new Promise(resolve => setTimeout(resolve, CONFIG.YIELD_DELAY));

    // Continue with next chunk if still processing
    if (endIndex < gameData.words.length && isProcessing && requestId === currentRequestId) {
        processChunk(endIndex, requestId, minSimilarity);
    } else if (endIndex >= gameData.words.length) {
        // Processing complete
        isProcessing = false;
        postMessage({
            type: 'CALCULATION_COMPLETE',
            requestId: requestId
        });
    }
}

// Start processing words for hints
function startProcessing(requestId, bestGuessSimilarity = 0) {
    if (isProcessing) {
        console.log('Already processing');
        return;
    }

    isProcessing = true;
    currentRequestId = requestId;

    // Use best guess similarity as minimum threshold
    const minSimilarity = Math.max(CONFIG.MIN_SIMILARITY, bestGuessSimilarity * 0.9);

    // Start processing from beginning
    processChunk(0, requestId, minSimilarity);
}

// Handle messages from main thread
self.onmessage = function (e) {
    const {type, data, requestId, targetWord: newTargetWord, bestGuess} = e.data;

    switch (type) {
        case 'INIT':
            // Initialize with game data
            gameData = data;
            topHints = new TopHints(CONFIG.MAX_HINTS);
            console.log('Hint worker initialized with', gameData.words.length, 'words');

            postMessage({type: 'INIT_COMPLETE'});
            break;

        case 'NEW_GAME':
            // Reset for new game
            targetWord = newTargetWord;
            const targetIndex = gameData.words.indexOf(targetWord);
            targetEmbedding = decodeEmbedding(targetIndex);

            // Clear previous hints
            topHints.clear();
            isProcessing = false;
            currentRequestId = null;

            console.log('New game started with target:', targetWord);
            break;

        case 'CALCULATE_HINT':
            // Calculate hints based on best guess
            if (!targetWord || !targetEmbedding) {
                postMessage({
                    type: 'ERROR',
                    requestId: requestId,
                    data: 'Target word not set'
                });
                return;
            }

            const bestSimilarity = bestGuess ? bestGuess.similarity : 0;

            // Check if we already have a good hint
            const existingHint = topHints.getGradualHint(bestSimilarity);

            if (existingHint) {
                // Send existing hint immediately
                postMessage({
                    type: 'HINT_READY',
                    requestId: requestId,
                    data: existingHint
                });
            } else {
                // Start calculating new hints
                startProcessing(requestId, bestSimilarity);

                // Check periodically for new hints
                const checkInterval = setInterval(() => {
                    if (requestId !== currentRequestId) {
                        clearInterval(checkInterval);
                        return;
                    }

                    const hint = topHints.getGradualHint(bestSimilarity);
                    if (hint) {
                        postMessage({
                            type: 'HINT_READY',
                            requestId: requestId,
                            data: hint
                        });
                        clearInterval(checkInterval);
                    }

                    // Stop checking if processing is done
                    if (!isProcessing) {
                        clearInterval(checkInterval);
                    }
                }, 500);
            }
            break;

        default:
            console.warn('Unknown message type:', type);
    }
};