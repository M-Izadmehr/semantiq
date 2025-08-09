
let embeddings = null;
let gameData = null;

function decodeQuantizedEmbedding(wordIndex) {
    if (!gameData) return null;

    const base64Data = gameData.embeddings_q8;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const embeddingSize = gameData.shape[1];
    const startIdx = wordIndex * embeddingSize;
    const quantizedEmbedding = bytes.slice(startIdx, startIdx + embeddingSize);

    const {emb_min, emb_max, emb_scale} = gameData;
    const embedding = new Float32Array(embeddingSize);

    for (let i = 0; i < embeddingSize; i++) {
        embedding[i] = (quantizedEmbedding[i] / emb_scale) + emb_min;
    }

    return embedding;
}

function calculateSimilarity(embedding1, embedding2) {
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

self.onmessage = function(e) {
    const { type, data, calculationId } = e.data;

    if (type === 'INIT') {
        gameData = data;
        self.postMessage({ type: 'INIT_COMPLETE' });
    }
    else if (type === 'CALCULATE_HINT') {
        const { targetWord, guessedWords, bestSimilarity, guessCount } = data;

        try {
            const targetIndex = gameData.words.indexOf(targetWord);
            if (targetIndex === -1) {
                self.postMessage({
                    type: 'ERROR',
                    error: 'Target word not found',
                    calculationId: calculationId
                });
                return;
            }

            const targetEmbedding = decodeQuantizedEmbedding(targetIndex);
            const candidates = [];

            // Adaptive sampling: more samples as game progresses
            let sampleSize = 500; // Start fast
            if (guessCount > 5) sampleSize = 1000;
            if (guessCount > 10) sampleSize = 1500;
            if (guessCount > 15) sampleSize = 2000;

            sampleSize = Math.min(sampleSize, gameData.words.length);

            // Sample words for hint calculation
            for (let i = 0; i < sampleSize; i++) {
                const randomIndex = Math.floor(Math.random() * gameData.words.length);
                const word = gameData.words[randomIndex];

                // Skip if already guessed or is the target
                if (guessedWords.includes(word) || word === targetWord) continue;

                const embedding = decodeQuantizedEmbedding(randomIndex);
                const similarity = calculateSimilarity(embedding, targetEmbedding);

                // Adaptive threshold: lower standards early game, higher later
                let threshold = bestSimilarity + 0.05;
                if (guessCount < 5) threshold = bestSimilarity + 0.02; // More forgiving early
                if (guessCount > 10) threshold = bestSimilarity + 0.08; // Higher standards later

                if (similarity > threshold) {
                    candidates.push({ word, similarity });
                }
            }

            if (candidates.length > 0) {
                // Sort by similarity and pick strategically
                candidates.sort((a, b) => b.similarity - a.similarity);

                // Pick hint based on game progress
                let hintIndex;
                if (guessCount < 3) {
                    hintIndex = Math.floor(candidates.length * 0.4); // Moderate hint early
                } else if (guessCount < 8) {
                    hintIndex = Math.floor(candidates.length * 0.2); // Better hint mid-game
                } else {
                    hintIndex = Math.floor(candidates.length * 0.1); // Great hint late game
                }

                hintIndex = Math.min(hintIndex, candidates.length - 1);
                const hintWord = candidates[hintIndex];

                self.postMessage({
                    type: 'HINT_READY',
                    word: hintWord.word,
                    similarity: hintWord.similarity,
                    calculationId: calculationId
                });
            } else {
                self.postMessage({
                    type: 'HINT_READY',
                    word: null,
                    message: "You're doing great! Keep exploring the warm areas.",
                    calculationId: calculationId
                });
            }
        } catch (error) {
            self.postMessage({
                type: 'ERROR',
                error: error.message,
                calculationId: calculationId
            });
        }
    }
};
        