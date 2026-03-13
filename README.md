# dance, unleashed

## Play locally
1. Run `python3 -m http.server 4173`
2. Open `http://127.0.0.1:4173/`

The playable build is in `src/`.

## Publish to GitHub Pages
1. Create a GitHub repository and push this project.
2. Push to the `main` branch.
3. In GitHub, open `Settings > Pages`.
4. Set `Source` to `GitHub Actions`.

The workflow in [pages.yml](/Users/shown/Development/dance-game/.github/workflows/pages.yml) publishes the repository root, and [index.html](/Users/shown/Development/dance-game/index.html) redirects to [src/index.html](/Users/shown/Development/dance-game/src/index.html).
