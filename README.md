# Aegis Grid

A responsive, touch-first tower defense game built with the Canvas API and no runtime dependencies.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`. Landscape orientation is recommended on phones and tablets.

## Mobile support

The interface uses Pointer Events, dynamic viewport units, safe-area insets, capped device-pixel-ratio canvas rendering, feature-detected fullscreen and AudioContext APIs, and lifecycle-aware saving/pausing. The layout switches from a persistent tablet arsenal to a compact phone bottom sheet.
