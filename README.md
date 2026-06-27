# pixelart-helper

A browser-based GUI helper for the `pixelart` CLI command. No install required — just open `index.html`.

Visually generate the color palette and pixel map that `pixelart` expects, then copy the output directly into your workflow.

## Features

- **Drag & drop** image loading (PNG / JPG / WEBP / GIF)
- **Clipboard paste** (⌘V / Ctrl+V)
- **Crop selection** — drag on the source image to pick a region
- **Grid size** — set X / Y pixel counts via slider or direct input
- **Color settings** — tune merge threshold and max color count
- **Transparency editing** — click any palette swatch to toggle it transparent
- **Zoom & pan preview** — mouse wheel, buttons, or drag to navigate
- **PNG export** — saves with transparency (alpha channel preserved)
- **Copy color codes** — output in `pixelart` CLI-compatible format

## Usage

Open `index.html` in any modern browser. No server needed.

```
pixelart-helper/
├── index.html
├── css/
│   └── style.css
└── js/
    └── app.js
```

## Output Format (`pixelart` CLI compatible)

A pixel grid where each character is a hex palette index, and a space represents a transparent pixel.

```
0123...
 230...   ← leading space = transparent pixel
01 2...   ← space in middle = transparent pixel
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ⌘/Ctrl + Enter | Convert |
| Escape | Clear crop selection |
| `+` / `-` | Zoom in / out |
| `0` | Reset zoom |

## License

MIT
