# pixelart-helper

A browser-based GUI helper for the `pixelart` CLI command. No install required — just open `index.html`.

Visually generate the color palette and pixel map that `pixelart` expects, then copy the output directly into your workflow.

## Usage

Open `index.html` in any modern browser. No server needed.

[https://agtkh.github.io/pixelart-helper/](https://agtkh.github.io/pixelart-helper/)

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
