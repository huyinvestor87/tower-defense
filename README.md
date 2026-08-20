# Aegis Grid

A responsive, touch-first tower defense game built with the Canvas API and no runtime dependencies.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`. Landscape orientation is recommended on phones and tablets.

## Deployment

The repository includes a GitHub Pages workflow at
`.github/workflows/deploy-pages.yml`. It publishes the static site after every
push to `work` or `main`, and it can also be started manually from the Actions
tab. In the repository's **Settings → Pages**, select **GitHub Actions** as the
source before the first deployment.

No build step, secrets, or environment variables are required. The site uses
relative URLs so it works from both a user Pages domain and a repository
subpath.

## Mobile support

The interface uses Pointer Events, dynamic viewport units, safe-area insets, capped device-pixel-ratio canvas rendering, feature-detected fullscreen and AudioContext APIs, and lifecycle-aware saving/pausing. The layout switches from a persistent tablet arsenal to a compact phone bottom sheet.
