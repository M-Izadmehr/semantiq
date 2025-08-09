export const Embeddings = {
    // Game data reference
    data: null,

    // Cache for decoded embeddings (limit size to prevent memory issues)
    cache: new Map(),
    maxCacheSize: 100,

    // Initialize with game data
    init(gameData) {
        this.data = gameData;
        this.cache.clear();
    },

    // Decode a quantized embedding for a word index
    decode(wordIndex) {
        // Check cache first
        if (this.cache.has(wordIndex)) {
            return this.cache.get(wordIndex);
        }

        try {
            const embedding = this._decodeFromQuantized(wordIndex);

            // Add to cache (with size limit)
            this._addToCache(wordIndex, embedding);

            return embedding;
        } catch (error) {
            console.error(`Failed to decode embedding for index ${wordIndex}:`, error);
            return null;
        }
    },

    // Internal: decode from quantized format
    _decodeFromQuantized(wordIndex) {
        if (!this.data) {
            throw new Error('Embeddings not initialized');
        }

        // Decode base64 quantized embedding
        const base64Data = this.data.embeddings_q8;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Extract embedding for specific word
        const embeddingSize = this.data.shape[1]; // 384 dimensions
        const startIdx = wordIndex * embeddingSize;

        if (startIdx + embeddingSize > bytes.length) {
            throw new Error(`Invalid word index: ${wordIndex}`);
        }

        const quantizedEmbedding = bytes.slice(startIdx, startIdx + embeddingSize);

        // Dequantize back to float
        const { emb_min, emb_max, emb_scale } = this.data;
        const embedding = new Float32Array(embeddingSize);

        for (let i = 0; i < embeddingSize; i++) {
            embedding[i] = (quantizedEmbedding[i] / emb_scale) + emb_min;
        }

        return embedding;
    },

    // Add to cache with size management
    _addToCache(wordIndex, embedding) {
        // Remove oldest entry if cache is full
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(wordIndex, embedding);
    },

    // Calculate cosine similarity between two embeddings
    similarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2) {
            console.error('Invalid embeddings for similarity calculation');
            return 0;
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }

        const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);

        // Avoid division by zero
        if (denominator === 0) {
            return 0;
        }

        return dotProduct / denominator;
    },

    // Decode UMAP coordinates for visualization
    decodeCoordinates(wordIndex) {
        if (!this.data.coordinates_q8) {
            return null;
        }

        try {
            const coordsData = atob(this.data.coordinates_q8);
            const coordsBytes = new Uint8Array(coordsData.length);

            for (let i = 0; i < coordsData.length; i++) {
                coordsBytes[i] = coordsData.charCodeAt(i);
            }

            const coordIndex = wordIndex * 2; // 2D coordinates

            if (coordIndex + 1 >= coordsBytes.length) {
                throw new Error(`Invalid coordinate index for word ${wordIndex}`);
            }

            const quantX = coordsBytes[coordIndex];
            const quantY = coordsBytes[coordIndex + 1];

            // Dequantize coordinates
            const { coord_min, coord_max, coord_scale } = this.data;
            const x = (quantX / coord_scale) + coord_min;
            const y = (quantY / coord_scale) + coord_min;

            // Return normalized coordinates (0-1 range)
            return {
                x: (x - coord_min) / (coord_max - coord_min),
                y: (y - coord_min) / (coord_max - coord_min)
            };

        } catch (error) {
            console.error(`Failed to decode coordinates for index ${wordIndex}:`, error);
            return null;
        }
    },

    // Clear the cache
    clearCache() {
        this.cache.clear();
    }
};