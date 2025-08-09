#!/bin/bash

# Directory Content Aggregator
# Usage: ./script.sh [directory_path] [output_file]
# If no directory specified, uses current directory
# If no output file specified, outputs to stdout

# Set the target directory (default to current directory)
TARGET_DIR="${1:-.}"

# Set output file (if provided)
OUTPUT_FILE="$2"

# Function to process files
process_directory() {
    local dir="$1"

    # Find all files (not directories) recursively
    find "$dir" -type f | sort | while IFS= read -r file; do
        # Skip hidden files and common build/dependency directories
        if [[ "$file" == *"/.git/"* ]] || \
           [[ "$file" == *"/node_modules/"* ]] || \
           [[ "$file" == *"/.next/"* ]] || \
           [[ "$file" == *"/dist/"* ]] || \
           [[ "$file" == *"/build/"* ]] || \
           [[ "$file" == *"/__pycache__/"* ]] || \
           [[ "$file" == */.*/* ]] || \
           [[ "$(basename "$file")" == .* ]]; then
            continue
        fi

        # Remove the target directory prefix for cleaner paths
        relative_path="${file#$TARGET_DIR/}"

        # Output the file header
        echo "---- ----"
        echo "---- CURRENT FILE:  $relative_path ----"
        echo "----  ----"

        # Output the file content
        if [[ -r "$file" ]]; then
            cat "$file"
        else
            echo "<FILE NOT READABLE>"
        fi

        # Add a blank line for separation
        echo
    done
}

# Main execution
if [[ ! -d "$TARGET_DIR" ]]; then
    echo "Error: Directory '$TARGET_DIR' does not exist" >&2
    exit 1
fi

echo "Processing directory: $TARGET_DIR"
echo "==========================================="
echo

if [[ -n "$OUTPUT_FILE" ]]; then
    process_directory "$TARGET_DIR" > "$OUTPUT_FILE"
    echo "Output written to: $OUTPUT_FILE"
else
    process_directory "$TARGET_DIR"
fi