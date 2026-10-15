(function () {
  var form = document.getElementById("compose-form");
  if (!form || !window.PM) return;
  var PM = window.PM;
  var fields = {
    author: document.getElementById("author"),
    title: document.getElementById("title"),
    category: document.getElementById("category"),
    newCategory: document.getElementById("new-category"),
    tags: document.getElementById("tags"),
    description: document.getElementById("description"),
    prompt: document.getElementById("prompt-text")
  };
  var newWrap = document.getElementById("new-category-wrap");
  var preview = document.getElementById("preview");
  var errors = document.getElementById("form-errors");
  var result = document.getElementById("compose-result");
  var resultPath = document.getElementById("result-path");
  var githubLink = document.getElementById("github-link");
  var urlWarning = document.getElementById("url-warning");
  var details = document.getElementById("markdown-details");
  var markdownPre = document.getElementById("markdown-output");
  var filenameHint = document.getElementById("filename-hint");
  var submitted = false;
  var FIELD_IDS = ["author", "title", "category", "new-category", "tags", "description", "prompt-text"];

  function existingPaths() {
    var node = document.getElementById("existing-files");
    if (!node) return [];
    try {
      var parsed = JSON.parse(node.textContent);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function parseTags(value) {
    var seen = {};
    var tags = [];
    String(value || "").split(",").forEach(function (part) {
      var tag = part.trim().replace(/\s+/g, " ");
      if (!tag) return;
      var key = tag.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      tags.push(tag);
    });
    return tags;
  }

  function selectedCategory() {
    if (fields.category.value === "__new") return fields.newCategory.value.trim().replace(/\s+/g, " ");
    return fields.category.value.trim();
  }

  function canonicalCategory(name) {
    var options = fields.category.options;
    for (var i = 0; i < options.length; i += 1) {
      var value = options[i].value;
      if (value && value !== "__new" && value.toLowerCase() === name.toLowerCase()) return value;
    }
    return name;
  }

  function slugify(title) {
    var slug = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72).replace(/-+$/g, "");
    return slug || "prompt";
  }

  function today() {
    var now = new Date();
    var month = String(now.getUTCMonth() + 1);
    var day = String(now.getUTCDate());
    if (month.length < 2) month = "0" + month;
    if (day.length < 2) day = "0" + day;
    return now.getUTCFullYear() + "-" + month + "-" + day;
  }

  function uniqueSlug(date, base) {
    var paths = existingPaths();
    var slug = base;
    var n = 2;
    function name(value) { return "_prompts/" + date + "-" + value + ".md"; }
    while (paths.indexOf(name(slug)) !== -1) {
      slug = base.slice(0, 60).replace(/-+$/g, "") + "-" + n;
      n += 1;
    }
    return slug;
  }

  function yamlQuote(value) {
    return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ").replace(/\t/g, " ") + '"';
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function liquidSafe(snippet) {
    var re = /\{%-?\s*endraw\s*-?%\}/g;
    var parts = [];
    var last = 0;
    var match;
    while ((match = re.exec(snippet))) {
      parts.push(snippet.slice(last, match.index));
      last = match.index + match[0].length;
    }
    parts.push(snippet.slice(last));
    var literal = "{% raw %}{% {% endraw %}endraw %}";
    return parts.map(function (part) {
      return "{% raw %}" + part + "{% endraw %}";
    }).join(literal);
  }

  function draft() {
    var title = fields.title.value.trim();
    var author = fields.author.value.trim();
    var category = canonicalCategory(selectedCategory());
    var description = fields.description.value.trim().replace(/\s+/g, " ");
    var tags = parseTags(fields.tags.value);
    var prompt = fields.prompt.value.replace(/\r\n/g, "\n");
    return {
      title: title,
      author: author,
      category: category,
      description: description,
      tags: tags,
      prompt: prompt
    };
  }

  function buildMarkdown(data) {
    var date = today();
    var slug = uniqueSlug(date, slugify(data.title));
    var filename = "_prompts/" + date + "-" + slug + ".md";
    var lines = [
      "---",
      "layout: prompt",
      "title: " + yamlQuote(data.title),
      "category: " + yamlQuote(data.category),
      data.tags.length ? "tags:" : "tags: []"
    ];
    data.tags.forEach(function (tag) { lines.push("  - " + yamlQuote(tag)); });
    lines.push("author: " + yamlQuote(data.author));
    lines.push("date: " + date);
    if (data.description) lines.push("description: " + yamlQuote(data.description));
    lines.push("---");
    lines.push(liquidSafe('<pre class="prompt-source">' + escapeHtml(data.prompt) + "</pre>"));
    lines.push("");
    return { markdown: lines.join("\n"), filename: filename, date: date, slug: slug };
  }

  function githubUrl(filename, markdown) {
    return "https://github.com/" + PM.repo + "/new/" + PM.branch + "?filename=" + encodeURIComponent(filename) + "&value=" + encodeURIComponent(markdown);
  }

  function validate(data) {
    var problems = [];
    function add(id, message) { problems.push({ id: id, message: message }); }
    if (!data.author) add("author", "Enter the author name.");
    else if (data.author.length > 80) add("author", "Author must be 80 characters or fewer.");
    if (!data.title) add("title", "Enter a title.");
    else if (data.title.length > 140) add("title", "Title must be 140 characters or fewer.");
    if (!fields.category.value) add("category", "Choose a category.");
    else if (fields.category.value === "__new") {
      if (!data.category) add("new-category", "Enter a name for the new category.");
      else if (data.category.length > 40) add("new-category", "Category must be 40 characters or fewer.");
      else if (/[<>]/.test(data.category)) add("new-category", "Category cannot include < or >.");
    }
    if (data.tags.length > 8) add("tags", "Use at most 8 tags.");
    else if (data.tags.some(function (tag) { return tag.length > 30; })) add("tags", "Each tag must be 30 characters or fewer.");
    if (data.description.length > 240) add("description", "Description must be 240 characters or fewer.");
    if (!data.prompt.trim()) add("prompt-text", "Enter the prompt text.");
    else if (data.prompt.length > 20000) add("prompt-text", "Prompt must be 20,000 characters or fewer.");
    return problems;
  }

  function showErrors(problems) {
    FIELD_IDS.forEach(function (id) {
      var field = document.getElementById(id);
      if (!field) return;
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-describedby");
    });
    Array.prototype.forEach.call(document.querySelectorAll(".field-error"), function (node) { node.remove(); });
    errors.textContent = "";
    if (!problems.length) {
      errors.hidden = true;
      return;
    }
    errors.hidden = false;
    var intro = document.createElement("p");
    intro.textContent = problems.length === 1 ? "Fix the highlighted field before continuing." : "Fix the highlighted fields before continuing.";
    var list = document.createElement("ul");
    problems.forEach(function (problem) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#" + problem.id;
      link.textContent = problem.message;
      li.appendChild(link);
      list.appendChild(li);
      var field = document.getElementById(problem.id);
      if (!field) return;
      field.setAttribute("aria-invalid", "true");
      var message = document.createElement("p");
      message.className = "field-error";
      message.id = problem.id + "-error";
      message.textContent = problem.message;
      field.insertAdjacentElement("afterend", message);
      field.setAttribute("aria-describedby", message.id);
    });
    errors.appendChild(intro);
    errors.appendChild(list);
  }

  function showResult(built, url) {
    var tooLong = url.length > 7500;
    result.hidden = false;
    resultPath.textContent = built.filename;
    githubLink.href = tooLong ? "https://github.com/" + PM.repo : url;
    githubLink.textContent = tooLong ? "Open the repository on GitHub" : "Open the GitHub new-file page";
    urlWarning.hidden = !tooLong;
    details.hidden = false;
    markdownPre.textContent = built.markdown;
  }

  function updatePreview() {
    var data = draft();
    var date = today();
    var card = PM.createPostCard({
      id: "preview",
      title: data.title || "Prompt title",
      category: data.category || "Category",
      tags: data.tags,
      author: data.author || "Your name",
      date: date,
      description: data.description,
      text: data.prompt.trim() ? data.prompt : "The prompt text will appear here.",
      url: ""
    }, { interactive: false });
    if (!data.title) card.querySelector(".post-title").classList.add("is-placeholder");
    if (!data.author) card.querySelector(".author").classList.add("is-placeholder");
    if (!data.category) card.querySelector(".chip").classList.add("is-placeholder");
    if (!data.prompt.trim()) card.querySelector(".prompt-body").classList.add("is-placeholder");
    preview.textContent = "";
    preview.appendChild(card);
    PM.paintAvatars(preview);
    window.requestAnimationFrame(function () { PM.refreshClamps(preview); });
    if (filenameHint) {
      var slug = slugify(data.title || "prompt");
      filenameHint.textContent = "File name: _prompts/" + date + "-" + slug + ".md";
    }
  }

  function collect(openGitHub) {
    submitted = true;
    var data = draft();
    var problems = validate(data);
    showErrors(problems);
    if (problems.length) {
      var field = document.getElementById(problems[0].id);
      if (field) field.focus();
      else errors.focus();
      return null;
    }
    var built = buildMarkdown(data);
    var url = githubUrl(built.filename, built.markdown);
    showResult(built, url);
    if (openGitHub) {
      if (url.length > 7500) {
        PM.announce("This prompt is too long for the GitHub link. Copy the Markdown or download the file instead.");
      } else {
        window.open(url, "_blank", "noopener");
        PM.announce("Opened GitHub so you can commit this prompt. It goes live after the pull request is merged.");
      }
    }
    return { built: built, url: url };
  }

  fields.category.addEventListener("change", function () {
    var isNew = fields.category.value === "__new";
    newWrap.hidden = !isNew;
    if (isNew) fields.newCategory.focus();
    updatePreview();
    if (submitted) showErrors(validate(draft()));
  });

  form.addEventListener("input", function () {
    updatePreview();
    if (submitted) showErrors(validate(draft()));
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    collect(true);
  });

  document.getElementById("copy-markdown").addEventListener("click", function () {
    var packed = collect(false);
    if (!packed) return;
    var button = document.getElementById("copy-markdown");
    PM.copyText(packed.built.markdown).then(function () {
      button.textContent = "Copied";
      PM.announce("Markdown copied");
      window.setTimeout(function () { button.textContent = "Copy Markdown"; }, 1600);
    }).catch(function () {
      PM.announce("Could not copy the Markdown");
    });
  });

  document.getElementById("download-markdown").addEventListener("click", function () {
    var packed = collect(false);
    if (!packed) return;
    var blob = new Blob([packed.built.markdown], { type: "text/markdown;charset=utf-8" });
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = packed.built.filename.split("/").pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    PM.announce("Markdown file downloaded");
  });

  updatePreview();
})();
