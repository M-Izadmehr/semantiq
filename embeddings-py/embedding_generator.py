#!/usr/bin/env python3
"""
Semantic Word Game - Embedding Generator
Generates embeddings and UMAP coordinates, tests file sizes
Uses NLTK Brown Corpus for frequency-based word selection
"""

import json
import numpy as np
import pickle
import gzip
import brotli
import struct
import base64
from pathlib import Path
from sentence_transformers import SentenceTransformer
import umap
from sklearn.metrics.pairwise import cosine_similarity
import time
from collections import Counter

# NLTK imports
import nltk
from nltk.corpus import words, brown

# Try to import optional compression libraries
try:
    import blosc2
    HAS_BLOSC = True
except ImportError:
    HAS_BLOSC = False

try:
    import lz4.frame
    HAS_LZ4 = True
except ImportError:
    HAS_LZ4 = False

def get_frequency_sorted_words(n_words=100):
    """Get words sorted by actual usage frequency from Brown Corpus"""

    print("📚 Loading Brown Corpus for frequency analysis...")

    # Download required corpora
    try:
        nltk.download('brown', quiet=True)
        nltk.download('words', quiet=True)
        from nltk.corpus import brown, words as nltk_words
    except Exception as e:
        raise RuntimeError(f"Failed to download NLTK data: {e}")

    # Get word frequencies from Brown corpus (1M+ words of real text)
    print("📊 Analyzing word frequencies from Brown corpus...")
    brown_words = [word.lower() for word in brown.words() if word.isalpha()]
    word_freq = Counter(brown_words)

    print(f"📖 Brown corpus contains {len(brown_words)} total words")
    print(f"📋 Unique vocabulary: {len(word_freq)} words")

    # Get valid English words from NLTK dictionary
    valid_words = set(w.lower() for w in nltk_words.words() if w.isalpha())
    print(f"📚 NLTK dictionary contains {len(valid_words)} valid words")

    # Filter frequent words that are also valid English words
    print("🔍 Filtering for game-appropriate words...")
    frequent_valid_words = []

    # Remove overly common function words that aren't interesting for games
    stop_words = {
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
        'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by',
        'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all',
        'would', 'there', 'their', 'been', 'has', 'had', 'who', 'its', 'now', 'may',
        'does', 'many', 'than', 'then',
        'them', 'these', 'very', 'just', 'into',
        'over', 'also', 'your', 'only', 'still', 'never',
        'each', 'how', 'our', 'out', 'most', 'some', 'her'
    }

    for word, frequency in word_freq.most_common():
        if (word in valid_words and
                word not in stop_words and
                3 <= len(word) <= 12 and
                word.isalpha() and
                frequency >= 3):  # Must appear at least 3 times
            frequent_valid_words.append((word, frequency))

    # Extract just the words (already sorted by frequency)
    words_only = [word for word, freq in frequent_valid_words[:n_words]]

    print(f"✅ Selected {len(words_only)} most frequent words")
    print(f"📈 Frequency range: {frequent_valid_words[0][1]} to {frequent_valid_words[min(len(frequent_valid_words)-1, n_words-1)][1]} occurrences")
    print(f"🔥 Most frequent: {words_only[:15]}")
    print(f"❄️  Sample mid-range: {words_only[len(words_only)//2:len(words_only)//2+10]}")

    return words_only

def format_size(size_bytes):
    """Convert bytes to human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"

def analyze_collisions(embeddings, words, bits=8):
    """Analyze collision rates for quantized embeddings"""
    def quantize_to_uint(arr, n_bits):
        arr_min, arr_max = arr.min(), arr.max()
        scale = (2**n_bits - 1) / (arr_max - arr_min)
        quantized = ((arr - arr_min) * scale).astype(getattr(np, f'uint{n_bits}' if n_bits <= 8 else 'uint16'))
        return quantized

    print(f"\n🔍 COLLISION ANALYSIS ({bits}-bit quantization):")
    print("=" * 50)

    # Quantize embeddings
    quantized = quantize_to_uint(embeddings, bits)

    # Convert to tuples for hashing (to find duplicates)
    embedding_tuples = [tuple(row) for row in quantized]

    # Count unique embeddings
    unique_embeddings = len(set(embedding_tuples))
    total_embeddings = len(embeddings)
    collision_rate = (total_embeddings - unique_embeddings) / total_embeddings

    print(f"Total words: {total_embeddings}")
    print(f"Unique quantized embeddings: {unique_embeddings}")
    print(f"Collision rate: {collision_rate:.1%}")
    print(f"Words sharing embeddings: {total_embeddings - unique_embeddings}")

    # Find actual colliding words
    embedding_counts = Counter(embedding_tuples)
    collisions = {emb: count for emb, count in embedding_counts.items() if count > 1}

    if collisions:
        print(f"\n📋 COLLISION DETAILS:")
        collision_groups = []
        for embedding_tuple, count in list(collisions.items())[:5]:  # Show first 5 collision groups
            # Find words with this embedding
            colliding_words = []
            for i, emb_tuple in enumerate(embedding_tuples):
                if emb_tuple == embedding_tuple:
                    colliding_words.append(words[i])
            collision_groups.append(colliding_words)
            print(f"  {count} words share embedding: {colliding_words}")

        if len(collisions) > 5:
            print(f"  ... and {len(collisions) - 5} more collision groups")

        return collision_rate, collision_groups
    else:
        print("✅ No collisions found!")
        return 0.0, []

def analyze_similarity_collisions(embeddings, words, target_word=None, bits=8):
    """Analyze how many words would have same similarity score to a target"""
    if target_word is None or target_word not in words:
        # Use a common word as target for demo
        common_targets = ['house', 'water', 'time', 'person', 'day']
        target_word = next((w for w in common_targets if w in words), words[len(words) // 2])
        print(f"Using '{target_word}' as example target word")

    target_idx = words.index(target_word)
    target_embedding = embeddings[target_idx]

    # Calculate similarities to target
    similarities = cosine_similarity([target_embedding], embeddings)[0]

    # Quantize similarities
    sim_min, sim_max = similarities.min(), similarities.max()
    scale = (2**bits - 1) / (sim_max - sim_min)
    quantized_sims = ((similarities - sim_min) * scale).astype(np.uint8)

    # Count similarity collisions
    sim_counts = Counter(quantized_sims)
    sim_collisions = {sim: count for sim, count in sim_counts.items() if count > 1}

    print(f"\n🎯 SIMILARITY COLLISION ANALYSIS (target: '{target_word}'):")
    print("=" * 55)
    print(f"Unique similarity scores: {len(sim_counts)}")
    print(f"Words sharing same similarity score: {len(sim_collisions)} groups")

    # Show examples of words with same similarity scores
    if sim_collisions:
        print(f"\n📊 EXAMPLES OF WORDS WITH SAME SIMILARITY SCORE:")
        for quantized_sim, count in list(sim_collisions.items())[:3]:  # Show top 3
            # Find words with this similarity score
            word_indices = np.where(quantized_sims == quantized_sim)[0]
            example_words = [words[i] for i in word_indices[:5]]  # Show up to 5 words
            actual_sim = (quantized_sim / scale) + sim_min

            print(f"  Score {actual_sim:.3f}: {example_words} ({count} total words)")
            if count > 5:
                print(f"    ... and {count - 5} more words")

    total_collision_rate = sum(count - 1 for count in sim_collisions.values()) / len(words)
    return total_collision_rate

class EmbeddingGenerator:
    def __init__(self, model_name='all-MiniLM-L6-v2'):
        print(f"🤖 Loading model: {model_name}")
        self.model = SentenceTransformer(model_name)
        self.embeddings = None
        self.words = None
        self.umap_coords = None

    def generate_embeddings(self, words):
        """Generate embeddings for a list of words"""
        print(f"\n🧠 Generating embeddings for {len(words)} words...")
        start_time = time.time()

        self.words = words
        self.embeddings = self.model.encode(words, show_progress_bar=True)

        elapsed = time.time() - start_time
        print(f"✅ Generated embeddings in {elapsed:.2f} seconds")
        print(f"📊 Embedding shape: {self.embeddings.shape}")
        return self.embeddings

    def generate_umap_coordinates(self, n_components=2, random_state=42):
        """Generate UMAP 2D coordinates from embeddings"""
        if self.embeddings is None:
            raise ValueError("Must generate embeddings first")

        print(f"\n🗺️  Generating UMAP coordinates...")
        start_time = time.time()

        reducer = umap.UMAP(
            n_components=n_components,
            random_state=random_state,
            n_neighbors=15,
            min_dist=0.1,
            metric='cosine'
        )

        self.umap_coords = reducer.fit_transform(self.embeddings)

        elapsed = time.time() - start_time
        print(f"✅ Generated UMAP coordinates in {elapsed:.2f} seconds")
        print(f"📊 UMAP coordinates shape: {self.umap_coords.shape}")
        return self.umap_coords

    def test_similarity(self, word1, word2):
        """Test similarity between two words"""
        if word1 not in self.words or word2 not in self.words:
            return None

        idx1 = self.words.index(word1)
        idx2 = self.words.index(word2)

        sim = cosine_similarity([self.embeddings[idx1]], [self.embeddings[idx2]])[0][0]
        return float(sim)


    def export_data(self, output_dir="output"):
        """Export all data in various formats and test sizes"""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)

        print("\n" + "="*50)
        print("📦 EXPORTING DATA AND TESTING SIZES")
        print("="*50)

        # Prepare data
        data = {
            "words": self.words,
            "embeddings": self.embeddings.tolist(),
            "umap_coordinates": self.umap_coords.tolist(),
            "metadata": {
                "n_words": len(self.words),
                "embedding_dim": self.embeddings.shape[1],
                "model_name": "all-MiniLM-L6-v2",
                "generated_at": time.time(),
                "source": "NLTK Brown Corpus (frequency-sorted)"
            }
        }

        formats = {}

        # === JSON FORMATS ===
        # 1. JSON (raw)
        json_file = output_path / "embeddings.json"
        with open(json_file, 'w') as f:
            json.dump(data, f)
        formats['JSON (raw)'] = json_file.stat().st_size

        # 2. JSON (gzip)
        json_gz_file = output_path / "embeddings.json.gz"
        with gzip.open(json_gz_file, 'wt') as f:
            json.dump(data, f)
        formats['JSON (gzip)'] = json_gz_file.stat().st_size

        # 3. JSON (brotli)
        json_br_file = output_path / "embeddings.json.br"
        json_str = json.dumps(data)
        with open(json_br_file, 'wb') as f:
            f.write(brotli.compress(json_str.encode('utf-8')))
        formats['JSON (brotli)'] = json_br_file.stat().st_size

        # === BINARY FORMATS ===
        # 4. NumPy compressed
        npz_file = output_path / "embeddings.npz"
        np.savez_compressed(npz_file,
                            embeddings=self.embeddings,
                            coordinates=self.umap_coords,
                            words=np.array(self.words, dtype=object))
        formats['NumPy (.npz)'] = npz_file.stat().st_size

        # 5. Float32 binary
        float32_file = output_path / "embeddings_float32.bin.gz"
        embeddings_f32 = self.embeddings.astype(np.float32)
        with gzip.open(float32_file, 'wb') as f:
            f.write(embeddings_f32.tobytes())
        formats['Float32 binary (gzip)'] = float32_file.stat().st_size

        # 6. Float16 binary (lossy)
        float16_file = output_path / "embeddings_float16.bin.gz"
        embeddings_f16 = self.embeddings.astype(np.float16)
        with gzip.open(float16_file, 'wb') as f:
            f.write(embeddings_f16.tobytes())
        formats['Float16 binary (gzip)'] = float16_file.stat().st_size

        # === SPECIALIZED COMPRESSION ===
        if HAS_BLOSC:
            blosc_file = output_path / "embeddings.blosc2"
            embeddings_f32 = self.embeddings.astype(np.float32)
            compressed = blosc2.compress2(embeddings_f32)
            with open(blosc_file, 'wb') as f:
                f.write(compressed)
            formats['Blosc2 (float32)'] = blosc_file.stat().st_size

        if HAS_LZ4:
            lz4_file = output_path / "embeddings.lz4"
            embeddings_f32 = self.embeddings.astype(np.float32)
            compressed = lz4.frame.compress(embeddings_f32.tobytes())
            with open(lz4_file, 'wb') as f:
                f.write(compressed)
            formats['LZ4 (float32)'] = lz4_file.stat().st_size

        # === QUANTIZED FORMATS ===
        # 8. 8-bit quantized preparation
        def quantize_to_uint8(arr):
            arr_min, arr_max = arr.min(), arr.max()
            scale = 255.0 / (arr_max - arr_min)
            quantized = ((arr - arr_min) * scale).astype(np.uint8)
            return quantized, arr_min, arr_max, scale

        quant_embeddings, emb_min, emb_max, emb_scale = quantize_to_uint8(self.embeddings)
        quant_coords, coord_min, coord_max, coord_scale = quantize_to_uint8(self.umap_coords)

        quant_data = {
            "words": self.words,
            "embeddings_q8": base64.b64encode(quant_embeddings.tobytes()).decode('ascii'),
            "coordinates_q8": base64.b64encode(quant_coords.tobytes()).decode('ascii'),
            "emb_min": float(emb_min), "emb_max": float(emb_max), "emb_scale": float(emb_scale),
            "coord_min": float(coord_min), "coord_max": float(coord_max), "coord_scale": float(coord_scale),
            "shape": self.embeddings.shape,
            "coords_shape": self.umap_coords.shape
        }

        # 8a. 8-bit quantized JSON (raw) - NEW!
        quant_json_file = output_path / "embeddings_quantized.json"
        with open(quant_json_file, 'w') as f:
            json.dump(quant_data, f)
        formats['8-bit quantized JSON (raw)'] = quant_json_file.stat().st_size

        # 8b. 8-bit quantized + Brotli (existing)
        quant_file = output_path / "embeddings_quantized.json.br"
        with open(quant_file, 'wb') as f:
            f.write(brotli.compress(json.dumps(quant_data).encode('utf-8')))
        formats['8-bit quantized + Brotli'] = quant_file.stat().st_size

        # 7. Base64 + Brotli (web-friendly)
        b64_file = output_path / "embeddings_b64.json.br"
        embeddings_f32 = self.embeddings.astype(np.float32)
        coords_f32 = self.umap_coords.astype(np.float32)

        web_data = {
            "words": self.words,
            "embeddings_b64": base64.b64encode(embeddings_f32.tobytes()).decode('ascii'),
            "coordinates_b64": base64.b64encode(coords_f32.tobytes()).decode('ascii'),
            "shape": self.embeddings.shape,
            "coords_shape": self.umap_coords.shape,
            "dtype": "float32"
        }

        with open(b64_file, 'wb') as f:
            f.write(brotli.compress(json.dumps(web_data).encode('utf-8')))
        formats['Base64 + Brotli (web)'] = b64_file.stat().st_size

        # Print results
        self._print_results(formats)

        # NEW: Analyze collisions
        analyze_collisions(self.embeddings, self.words, bits=8)
        analyze_similarity_collisions(self.embeddings, self.words, bits=8)

        return formats


    def _print_results(self, formats):
        """Print compression results"""
        print(f"\n🏆 COMPRESSION RESULTS FOR {len(self.words)} WORDS:")
        print("=" * 60)

        original_size = formats['JSON (raw)']
        sorted_formats = sorted(formats.items(), key=lambda x: x[1])

        for format_name, size in sorted_formats:
            ratio = (size / original_size) * 100
            savings = 100 - ratio
            print(f"{format_name:30}: {format_size(size):>10} ({savings:5.1f}% savings)")

        print(f"\n💡 BEST FOR WEB GAME:")
        print(f"🥇 Smallest: {sorted_formats[0][0]} - {format_size(sorted_formats[0][1])}")
        print(f"🥈 Good balance: Base64 + Brotli (web)")

        if not HAS_BLOSC:
            print("\n⚠️  For even better compression: pip install blosc2 lz4")

def main():
    print("🎮 SEMANTIC WORD GAME - EMBEDDING GENERATOR")
    print("=" * 60)
    print("📊 Using Brown Corpus frequency-based word selection")

    # Test with different word counts
    word_counts = [20000]  # Start with 5k, then 20k

    for n_words in word_counts:
        print(f"\n{'='*60}")
        print(f"🎯 TESTING WITH {n_words} WORDS")
        print(f"{'='*60}")

        # Get frequency-sorted words from Brown Corpus
        words = get_frequency_sorted_words(n_words)

        # Generate embeddings
        generator = EmbeddingGenerator()
        generator.generate_embeddings(words)
        generator.generate_umap_coordinates()

        # Test some similarities with real words
        test_pairs = [("house", "home"), ("person", "man"), ("time", "day"), ("water", "sea")]
        print(f"\n🔍 Sample similarities:")
        for word1, word2 in test_pairs:
            if word1 in words and word2 in words:
                sim = generator.test_similarity(word1, word2)
                print(f"  {word1} ↔ {word2}: {sim:.3f}")

        # Export data
        generator.export_data(f"outputs/output_{n_words}")

        print(f"\n✅ Completed {n_words} words!")

    print(f"\n{'='*60}")
    print("🎉 GENERATION COMPLETE")
    print(f"{'='*60}")
    print("✅ Frequency-sorted embeddings generated")
    print("✅ UMAP coordinates calculated")
    print("✅ Multiple compression formats tested")
    print("✅ Collision analysis completed")
    print("\n🚀 Ready to build your semantic word game with real-world word frequencies!")

if __name__ == "__main__":
    main()