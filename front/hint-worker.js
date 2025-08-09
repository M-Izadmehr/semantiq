let embeddings = null;
let gameData = null;
let targetWord = null;
let bestGuessSimilarity = -1;
let sortedWords = []
console.log('=== hint worker ===')

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

async function sortWords() {
    const wordCount = gameData?.words?.length
    if (!wordCount) {
        console.error('No words found in gameData');
        return;
    }


    const targetWordIndex = gameData.words.indexOf(targetWord);
    const targetEmbedding = decodeQuantizedEmbedding(targetWordIndex);
    if (!targetEmbedding) {
        console.error('Target embedding not found for word:', targetWord);
        return;
    }
    const chunkSize = Math.min(50, wordCount);


    for (let wordIndex = 0; wordIndex < wordCount; wordIndex += chunkSize) {
        sortedWords = sortedWords.filter(item => item.similarity >= bestGuessSimilarity);

        // Process chunk
        const currentWordIndices = new Array(chunkSize).fill(0).map((_, i) => wordIndex + i);
        const currentWords = gameData.words.slice(wordIndex, wordIndex + chunkSize);
        const currentEmbeddings = currentWordIndices.map(decodeQuantizedEmbedding);
        const currentSimilarities = currentEmbeddings.map(embedding => {
            return calculateSimilarity(embedding, targetEmbedding);
        });

        currentWords.forEach((word, index) => {
            const similarity = currentSimilarities[index];
            const position = sortedWords.findIndex(item => item.similarity < similarity);
            if(similarity< bestGuessSimilarity){
                return;
            }
            if (position === -1) {
                sortedWords.push({word, similarity, index: wordIndex + index});
            } else {
                sortedWords.splice(position, 0, {word, similarity, index: wordIndex + index});
            }
        });

        // Yield control back
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}


async function calculateHint(data, calculationId){
    const bestGuess = data.bestGuess;
    const bestGuessIndex = data.bestGuessIndex
    const bestGuessEmbedding = decodeQuantizedEmbedding(bestGuessIndex);
    const targetWordIndex = gameData.words.indexOf(targetWord);
    const targetEmbedding = decodeQuantizedEmbedding(targetWordIndex);
    bestGuessSimilarity = calculateSimilarity(bestGuessEmbedding, targetEmbedding);

    const bestHintWordIndex = sortedWords
        .findIndex(item => item.similarity > bestGuessSimilarity && item.word !== bestGuess);



    const hintWordObj = sortedWords.find((item,index) => item.word !== targetWord && index===Math.floor(Math.random() * sortedWords.length));

    if (hintWordObj && hintWordObj.word !== targetWord) {
        self.postMessage({type: 'HINT_READY', data: hintWordObj, calculationId});
    }

    // get rid of bad hints
    sortedWords = sortedWords.filter(item => item.similarity >= bestGuessSimilarity || item.word === bestGuess);

    // Yield control back
    await new Promise(resolve => setTimeout(resolve, 100));
}


self.onmessage = function (e) {
    const {type, data, calculationId} = e.data;

    if (type === 'INIT') {
        gameData = data;
        targetWord = e.data.targetWord
        sortedWords = []
        bestGuessSimilarity = -1;
        self.postMessage({type: 'INIT_COMPLETE'});





        sortWords()
    }
    if (type === 'NEW_GAME') {
        targetWord = data.targetWord;
        bestGuessSimilarity = -1;
        sortedWords = []

        sortWords()

    } else if (type === 'CALCULATE_HINT') {
      calculateHint(data, calculationId)

    }
};
