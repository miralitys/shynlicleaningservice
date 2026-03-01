#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGES_DIR="$ROOT_DIR/images"

if ! command -v cwebp >/dev/null 2>&1; then
  echo "cwebp is required"
  exit 1
fi

if ! command -v avifenc >/dev/null 2>&1; then
  echo "avifenc is required"
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "sips is required"
  exit 1
fi

min_size_bytes=$((120 * 1024))
responsive_min_bytes=$((350 * 1024))
responsive_widths=(640 1024)

created=0
skipped=0

encode_full() {
  local src="$1"
  local stem="${src%.*}"
  local webp="${stem}.webp"
  local avif="${stem}.avif"

  if [[ ! -f "$webp" || "$src" -nt "$webp" ]]; then
    cwebp -quiet -q 74 "$src" -o "$webp"
    created=$((created + 1))
  else
    skipped=$((skipped + 1))
  fi

  if [[ ! -f "$avif" || "$src" -nt "$avif" ]]; then
    avifenc -j all -s 6 -q 45 "$src" "$avif" >/dev/null
    created=$((created + 1))
  else
    skipped=$((skipped + 1))
  fi
}

encode_responsive() {
  local src="$1"
  local stem="${src%.*}"
  local ext="${src##*.}"
  local tmp

  for width in "${responsive_widths[@]}"; do
    local webp="${stem}.w${width}.webp"
    local avif="${stem}.w${width}.avif"

    if [[ ! -f "$webp" || "$src" -nt "$webp" ]]; then
      cwebp -quiet -q 74 -resize "$width" 0 "$src" -o "$webp"
      created=$((created + 1))
    else
      skipped=$((skipped + 1))
    fi

    if [[ ! -f "$avif" || "$src" -nt "$avif" ]]; then
      tmp="$(mktemp "/tmp/shynli-resize-${width}-XXXXXX.${ext}")"
      sips -s format "$ext" -Z "$width" "$src" --out "$tmp" >/dev/null
      avifenc -j all -s 6 -q 45 "$tmp" "$avif" >/dev/null
      rm -f "$tmp"
      created=$((created + 1))
    else
      skipped=$((skipped + 1))
    fi
  done
}

while IFS= read -r -d '' src; do
  size="$(stat -f "%z" "$src")"
  if (( size < min_size_bytes )); then
    continue
  fi

  encode_full "$src"

  if (( size >= responsive_min_bytes )); then
    encode_responsive "$src"
  fi
done < <(find "$IMAGES_DIR" -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) -print0)

echo "Image optimization complete."
echo "Created/updated variants: $created"
echo "Up-to-date variants skipped: $skipped"
