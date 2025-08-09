# 🎯 SemantiQuest

A daily word puzzle game that explores the fascinating world of semantic embeddings. Find the hidden word by navigating through high-dimensional meaning space!

## What is this?

SemantiQuest is a game where you guess words and get feedback based on how semantically similar your guess is to a hidden target word. Instead of traditional clues, you explore the actual mathematical relationships between word meanings as learned by language models.

## The Magic of Word Embeddings

### What are word embeddings?

Word embeddings are dense vector representations of words that capture semantic meaning. Each word is represented as a point in a high-dimensional space (typically 300-1000 dimensions) where words with similar meanings cluster together.

For example:
- "king" and "queen" are close together
- "car" and "automobile" nearly overlap
- "happy" is closer to "joyful" than to "table"

These relationships emerge naturally from training on large text corpora, revealing the hidden structure of human language.

### Why embeddings are fascinating

Word embeddings demonstrate that machines can learn surprisingly human-like understanding of meaning, including:

- **Analogical reasoning**: king - man + woman ≈ queen
- **Conceptual clusters**: animals group together, colors group together
- **Semantic gradients**: "hot" → "warm" → "cool" → "cold" forms a natural progression
- **Cultural associations**: words pick up subtle biases and associations from their training data

### UMAP: Making High Dimensions Visible

The game visualizes embeddings using **UMAP (Uniform Manifold Approximation and Projection)**, a dimensionality reduction technique that:

- Compresses 384-dimensional word vectors into 2D coordinates
- Preserves both local neighborhoods and global structure
- Reveals clusters and relationships that would be impossible to see in raw high-dimensional space
- Shows how words naturally organize themselves by meaning

When you see words clustered on the game map, you're literally seeing the shape of semantic space!


### Technical Insights

- **Quantization strategies**: Converting float32 embeddings to uint8 reduces file size by 75% with minimal quality loss
- **Web Workers**: Background processing prevents UI blocking during intensive similarity calculations
- **Efficient similarity search**: Smart caching and chunked processing for real-time hint generation
- **Client-side ML**: Running meaningful ML computations entirely in the browser

### Linguistic Discoveries

- **Polysemy complexity**: Words like "bank" create interesting similarity patterns across multiple meanings
- **Cultural embedding**: Embeddings reflect biases and associations present in training data
- **Semantic density**: Some regions of meaning space are much denser than others
- **Contextual nuance**: Single-word embeddings miss context that humans use naturally

### Design Challenges
- **Embedding Size**: Balancing performance and quality with 384-dimensional vectors
- **Progressive disclosure**: How to give meaningful hints without giving away the answer
- **Difficulty calibration**: Balancing challenge across different word types and difficulty levels
- **Visual metaphors**: Representing abstract mathematical relationships in intuitive spatial terms

## Why Store Embeddings as JSON?

This game deliberately avoids requiring a backend server by embedding all data directly in the repository:

### Philosophical Reasons
- **Democratized AI**: Anyone can fork, modify, and host their own version without infrastructure
- **Transparency**: All data and algorithms are inspectable - no black box APIs
- **Longevity**: The game works as long as browsers exist, independent of external services
- **Educational value**: Students can examine the actual embedding data and experiment

### Technical Benefits
- **Zero latency**: All computations happen locally with no network requests
- **Offline capable**: Works without internet connection after initial load
- **Deterministic**: Same inputs always produce same outputs, enabling daily puzzles
- **Cacheable**: Static files can be aggressively cached by CDNs

### Practical Advantages
- **No hosting costs**: Deploy anywhere static files are served (GitHub Pages, Netlify, etc.)
- **No scaling concerns**: Each user's browser does their own computation
- **No privacy issues**: User guesses never leave their device
- **Simple deployment**: Just commit and push - no databases or API keys

The tradeoff is larger initial download (~2MB compressed), but modern browsers and internet speeds make this quite reasonable for the rich experience it enables.

## Running the Game

1. Serve the files with any static file server (needed for ES6 modules):
   ```bash
   python -m http.server 8000 # for serving embeddings in brotli format
   npm run dev # for development
   ```

2. Visit `http://localhost:3000`

3. Start guessing words and explore semantic space!

## The Data

- **Vocabulary**: ~20,000 common English words (NLTK common words)
- **Embeddings**: 384-dimensional vectors from a sentence transformer model
- **Quantization**: 8-bit quantized for efficiency (float32 → uint8)
- **Visualization**: UMAP projection to 2D coordinates
- **Format**: Single JSON file with base64-encoded binary data

## Educational Applications

This project demonstrates several important concepts:

- **Vector space models** of language
- **Dimensionality reduction** and visualization techniques
- **Quantization** for model compression
- **Client-side machine learning** without servers
- **Progressive web app** design patterns
- **Deterministic random number generation** for daily puzzles

Perfect for students learning about NLP, embeddings, or web-based ML applications!

---

*Built with curiosity about how machines understand meaning. Fork it, break it, improve it!*