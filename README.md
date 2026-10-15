# Prompt Marketplace

A Jekyll site for GitHub Pages: a public feed of reusable prompts. People browse, filter, copy, and like prompts in the browser. Adding a prompt opens GitHub so the contributor can commit a Markdown file or open a pull request. Nothing is posted until that pull request is merged.

The live site is intended to be served at [https://rajeshradhakrishnanmvk.github.io/prompt-marketplace/](https://rajeshradhakrishnanmvk.github.io/prompt-marketplace/). `baseurl` in `_config.yml` is `/prompt-marketplace`, which matches a project site for this repository.

The site is vanilla HTML, CSS, and JavaScript. It does not use npm packages, CDNs, frameworks, icon fonts, or Jekyll plugins.

## Enable GitHub Pages

1. Open the repository on GitHub and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose the `main` branch and the `/ (root)` folder.
4. Save. GitHub Pages builds the site with its default Jekyll. The first build can take a minute.
5. When the build finishes, the site is at `https://rajeshradhakrishnanmvk.github.io/prompt-marketplace/`.

Do not add a `.nojekyll` file. Pages needs Jekyll in order to build the collection and the prompt index. This repo has no `Gemfile` on purpose, so Pages uses its own Jekyll and the plugins it enables by default. The templates do not require any plugin.

If the repository is renamed, change `baseurl` in `_config.yml` to `/<repository-name>` and update `url` if the GitHub account changes.

## Add a prompt from the site

1. Open **Add prompt**.
2. Fill in author, title, category, optional tags, an optional short description, and the prompt text.
3. Check the live preview.
4. Choose **Commit on GitHub**. The page opens GitHub’s new-file form with the path and file contents filled in:

   `https://github.com/rajeshradhakrishnanmvk/prompt-marketplace/new/main?filename=_prompts/YYYY-MM-DD-slug.md&value=...`

5. On GitHub, commit to `main` if you have access, or open a pull request.
6. After the pull request is merged, GitHub Pages rebuilds and the prompt shows up in the feed.

**Copy Markdown** and **Download .md** do the same generation without opening GitHub. Use them if the prompt is too long for a URL or the new tab is blocked.

Likes are stored in `localStorage` on this browser only. They are not part of the file you commit.

## Add a prompt by hand

Create `_prompts/YYYY-MM-DD-slug.md`. The date in the filename is `YYYY-MM-DD`. The slug is lowercase words separated by hyphens, taken from the title.

Jekyll runs Liquid and Markdown on the file. The body below keeps the prompt text exact, including `{{placeholders}}`, `<`, `>`, and `&`.

```markdown
---
layout: prompt
title: "Brief a skeptical expert"
category: "Writing"
tags:
  - "audience"
  - "editing"
author: "Lena Ortiz"
date: 2026-03-02
description: "Optional one-sentence summary."
---
{% raw %}
<pre class="prompt-source">Prompt text goes here.
Use {{draft}} for values the reader will paste in.
Write &amp; for an ampersand and &lt; for a less-than sign.</pre>
{% endraw %}
```

Inside `<pre class="prompt-source">`, write `&amp;` for `&`, `&lt;` for `<`, and `&gt;` for `>`. The Add prompt form does this for you. Wrap the pre block in `{% raw %}` … `{% endraw %}` so Liquid does not treat `{{placeholders}}` as template variables.

## Front matter

| Field | Required | Notes |
| --- | --- | --- |
| `layout` | yes | Always `prompt`. |
| `title` | yes | Short name shown on the card. |
| `category` | yes | One category, for example Writing, Coding, Marketing, Data, Image, or Productivity. A new category is allowed. |
| `tags` | no | YAML list of short labels. Use `tags: []` when there are none. |
| `author` | yes | Display name. The avatar is the initials. |
| `date` | yes | `YYYY-MM-DD`. Should match the date in the filename. |
| `description` | no | One sentence. Shown under the title and included in search. |

The body is the prompt. The feed copies that text, not the front matter.

## How the feed works

`_includes/prompt-index.liquid` builds a JSON array of every prompt. The home page embeds that array, and `/prompts.json` publishes the same index. The browser filters by category, tag, and search, and sorts by newest or by likes saved in `localStorage`. The query string holds the filter (`?category=Writing&tag=editing&q=draft&sort=liked`), so a filtered view can be shared.

Each prompt also has a permalink at `/prompts/<slug>/`.

## Run it locally

Install Ruby, then Jekyll and the server it uses on Ruby 3:

```bash
gem install jekyll webrick
jekyll serve
```

Open [http://127.0.0.1:4000/prompt-marketplace/](http://127.0.0.1:4000/prompt-marketplace/). `baseurl` is already set, so asset and prompt URLs match production.

A local `Gemfile` is optional. If you add one, the only dependency that belongs there is the `github-pages` gem, so the local build stays aligned with GitHub Pages. Do not commit other plugins.

## Layout

```
_config.yml
_prompts/                  one Markdown file per prompt
_includes/prompt-index.liquid
_layouts/
assets/css/site.css
assets/js/                 feed, prompt page, add form
index.html                 the feed
add.html                   the composer
prompts.json               generated JSON index
```
