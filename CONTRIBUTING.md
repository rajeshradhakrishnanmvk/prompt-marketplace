# Contributing

Prompt Marketplace is a static Jekyll site. Contributions are pull requests that add a prompt file or improve the HTML, CSS, and JavaScript already in the repo.

## Add a prompt

Use **Add prompt** on the site, or add the file yourself as described in the README.

- One prompt per file, named `_prompts/YYYY-MM-DD-slug.md`.
- Fill in `title`, `category`, `author`, and `date`. Add `tags` and `description` when they help someone decide whether to open the prompt.
- The body is the prompt a person will copy. Keep it reusable: mark the parts they should replace with placeholders such as `{{notes}}`.
- Wrap the body so Jekyll does not treat those placeholders as Liquid, and escape `&`, `<`, and `>` inside the `<pre>`. The form on the site does both.
- Do not put secrets, access tokens, private customer data, or someone else's copyrighted text in a prompt.
- Do not invent testimonials, metrics, or quotes inside a sample prompt and present them as facts.

Open a pull request against `main`. The prompt is not live when you open the PR. It shows up in the feed after the pull request is merged and GitHub Pages finishes rebuilding.

## Change the site

- Keep the site on vanilla HTML, CSS, and JavaScript. Do not add npm packages, CDNs, frameworks, icon fonts, or Jekyll plugins.
- `baseurl` stays `/prompt-marketplace` unless the repository name changes.
- New pages need a skip target (`id="main"`), labels on form fields, visible focus, and keyboard access for anything clickable.
- Likes stay in `localStorage`. Do not add a backend to store them.

## Checks

From a machine with Ruby and Jekyll installed:

```bash
jekyll build
```

The build should finish without errors. Then serve the site and try the feed filters, a permalink, and the add form.
