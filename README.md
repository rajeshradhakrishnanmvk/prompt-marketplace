# Foldly

Paint a square. Watch it fold.

Foldly is a static origami paint-and-fold site: vanilla HTML, CSS, and JavaScript, built with Jekyll for GitHub Pages. There are no npm dependencies.

```bash
jekyll build
jekyll serve
```

The site is served under the GitHub Pages project path `/prompt-marketplace`.

Model geometry lives in `_data/models/*.json`. `tools/make-models.mjs` regenerates those files; it is not part of the site build.
