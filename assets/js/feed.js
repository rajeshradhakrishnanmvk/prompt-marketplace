(function () {
  var list = document.getElementById("feed-list");
  if (!list || !window.PM) return;

  var PM = window.PM;
  var input = document.getElementById("site-search");
  var sortSelect = document.getElementById("sort");
  var status = document.getElementById("feed-status");
  var heading = document.getElementById("feed-heading");
  var filters = document.getElementById("active-filters");
  var form = document.querySelector("form.search");
  var prompts = [];
  var state = readState();
  var searchTimer = 0;

  function readState() {
    var params = new URLSearchParams(window.location.search);
    return {
      category: params.get("category") || "",
      tag: params.get("tag") || "",
      q: params.get("q") || "",
      sort: params.get("sort") === "liked" ? "liked" : "newest"
    };
  }

  function writeUrl(replace) {
    var params = new URLSearchParams();
    if (state.category) params.set("category", state.category);
    if (state.tag) params.set("tag", state.tag);
    if (state.q) params.set("q", state.q);
    if (state.sort === "liked") params.set("sort", "liked");
    var qs = params.toString();
    var next = window.location.pathname + (qs ? "?" + qs : "");
    var current = window.location.pathname + window.location.search;
    if (next === current) return;
    if (replace) window.history.replaceState({ pm: true }, "", next);
    else window.history.pushState({ pm: true }, "", next);
  }

  function modified(event) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
  }

  function normalize(item) {
    return {
      id: item.slug || "",
      title: item.title || "Untitled prompt",
      category: item.category || "Uncategorized",
      tags: Array.isArray(item.tags) ? item.tags : [],
      author: item.author || "Anonymous",
      date: String(item.date || "").slice(0, 10),
      description: item.description || "",
      text: PM.promptText(item.html || ""),
      url: item.url || PM.home
    };
  }

  function canonicalCategory(name) {
    var found = "";
    prompts.forEach(function (prompt) {
      if (!found && prompt.category.toLowerCase() === String(name).toLowerCase()) found = prompt.category;
    });
    return found || name;
  }

  function canonicalTag(name) {
    var found = "";
    prompts.forEach(function (prompt) {
      prompt.tags.forEach(function (tag) {
        if (!found && tag.toLowerCase() === String(name).toLowerCase()) found = tag;
      });
    });
    return found || name;
  }

  function matches(prompt) {
    if (state.category && prompt.category.toLowerCase() !== state.category.toLowerCase()) return false;
    if (state.tag && !prompt.tags.some(function (tag) { return tag.toLowerCase() === state.tag.toLowerCase(); })) return false;
    if (state.q) {
      var hay = [prompt.title, prompt.description, prompt.author, prompt.category, prompt.tags.join(" "), prompt.text].join("\n").toLowerCase();
      var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i += 1) {
        if (hay.indexOf(terms[i]) === -1) return false;
      }
    }
    return true;
  }

  function compare(a, b) {
    if (state.sort === "liked") {
      var diff = Number(PM.isLiked(b.id)) - Number(PM.isLiked(a.id));
      if (diff) return diff;
    }
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.title.localeCompare(b.title);
  }

  function homeHref(query) {
    var base = PM.home || "/";
    var joiner = base.indexOf("?") === -1 ? "?" : "&";
    return query ? base + joiner + query : base;
  }

  function renderCategories() {
    var nav = document.getElementById("category-nav");
    if (!nav) return;
    var counts = {};
    prompts.forEach(function (prompt) {
      counts[prompt.category] = (counts[prompt.category] || 0) + 1;
    });
    var names = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); });
    nav.textContent = "";
    nav.appendChild(categoryLink("", "All prompts", prompts.length));
    names.forEach(function (name) { nav.appendChild(categoryLink(name, name, counts[name])); });
  }

  function categoryLink(value, label, count) {
    var link = document.createElement("a");
    link.className = "cat-link";
    link.href = value ? homeHref("category=" + encodeURIComponent(value)) : (PM.home || "/");
    link.setAttribute("data-category", value);
    var name = document.createElement("span");
    name.textContent = label;
    var badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = String(count);
    var sr = document.createElement("span");
    sr.className = "visually-hidden";
    sr.textContent = count === 1 ? " prompt" : " prompts";
    link.appendChild(name);
    link.appendChild(document.createTextNode(" "));
    link.appendChild(badge);
    link.appendChild(sr);
    return link;
  }

  function renderTrending() {
    var wrap = document.getElementById("trending-tags");
    if (!wrap) return;
    var counts = {};
    prompts.forEach(function (prompt) {
      prompt.tags.forEach(function (tag) {
        var key = tag.toLowerCase();
        if (!counts[key]) counts[key] = { tag: tag, count: 0 };
        counts[key].count += 1;
      });
    });
    var tags = Object.keys(counts).map(function (key) { return counts[key]; });
    tags.sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
    wrap.textContent = "";
    tags.slice(0, 12).forEach(function (item) {
      var link = document.createElement("a");
      link.className = "tag";
      link.href = homeHref("tag=" + encodeURIComponent(item.tag));
      link.setAttribute("data-tag", item.tag);
      link.setAttribute("aria-label", item.tag + ", " + item.count + (item.count === 1 ? " prompt" : " prompts"));
      var label = document.createElement("span");
      label.textContent = item.tag;
      var count = document.createElement("span");
      count.className = "tag-count";
      count.textContent = String(item.count);
      link.appendChild(label);
      link.appendChild(document.createTextNode(" "));
      link.appendChild(count);
      wrap.appendChild(link);
    });
  }

  function syncCurrent() {
    Array.prototype.forEach.call(document.querySelectorAll("#category-nav a"), function (link) {
      var value = link.getAttribute("data-category") || "";
      var active = value === state.category;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    Array.prototype.forEach.call(document.querySelectorAll("#trending-tags a"), function (link) {
      var value = link.getAttribute("data-tag") || "";
      var active = !!state.tag && value.toLowerCase() === state.tag.toLowerCase();
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function statusText(shown) {
    var text = shown.length + (shown.length === 1 ? " prompt" : " prompts");
    if (state.category) text += " in " + state.category;
    if (state.tag) text += " tagged " + state.tag;
    if (state.q) text += ' matching "' + state.q + '"';
    if (state.sort === "liked") text += " · most liked first";
    return text;
  }

  function updateHeading() {
    if (!heading) return;
    if (state.category) heading.textContent = state.category;
    else if (state.q || state.tag) heading.textContent = "Matching prompts";
    else heading.textContent = "Latest prompts";
    var base = PM.siteTitle || "Prompt Marketplace";
    if (state.category) document.title = state.category + " · " + base;
    else if (state.tag) document.title = state.tag + " · " + base;
    else if (state.q) document.title = "Search · " + base;
    else document.title = base;
  }

  function renderActive() {
    if (!filters) return;
    filters.textContent = "";
    var any = false;
    function addChip(label, type) {
      any = true;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "filter-chip";
      button.setAttribute("data-clear", type);
      var text = document.createElement("span");
      text.textContent = label;
      var x = document.createElement("span");
      x.className = "x";
      x.setAttribute("aria-hidden", "true");
      x.textContent = "\u00d7";
      button.appendChild(text);
      button.appendChild(x);
      button.setAttribute("aria-label", "Remove filter " + label);
      filters.appendChild(button);
    }
    if (state.category) addChip(state.category, "category");
    if (state.tag) addChip("#" + state.tag, "tag");
    if (state.q) addChip('"' + state.q + '"', "q");
    if (!any) return;
    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "text-btn";
    clear.textContent = "Clear all";
    clear.setAttribute("data-clear", "all");
    filters.appendChild(clear);
  }

  function render(options) {
    var opts = options || {};
    if (input && (opts.forceSearch || document.activeElement !== input) && input.value !== state.q) {
      input.value = state.q;
    }
    PM.refreshSearchClear();
    if (sortSelect && sortSelect.value !== state.sort) sortSelect.value = state.sort;
    updateHeading();
    syncCurrent();
    renderActive();

    var shown = prompts.filter(matches).sort(compare);
    if (status) status.textContent = statusText(shown);
    list.textContent = "";
    if (!shown.length) {
      var empty = document.createElement("div");
      empty.className = "card empty";
      var title = document.createElement("h2");
      title.textContent = "No prompts match";
      var copy = document.createElement("p");
      copy.textContent = "Try another category, tag, or search.";
      var button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary";
      button.textContent = "Clear filters";
      button.addEventListener("click", function () { clearAll(false); });
      empty.appendChild(title);
      empty.appendChild(copy);
      empty.appendChild(button);
      list.appendChild(empty);
      return;
    }
    shown.forEach(function (prompt) {
      list.appendChild(PM.createPostCard(prompt, {
        interactive: true,
        onLike: function () {
          if (state.sort === "liked") render();
        }
      }));
    });
    PM.paintAvatars(list);
    window.requestAnimationFrame(function () { PM.refreshClamps(list); });
  }

  function focusStatus() {
    if (status) status.focus();
  }

  function clearAll(replace) {
    state.category = "";
    state.tag = "";
    state.q = "";
    state.sort = "newest";
    if (input) input.value = "";
    if (sortSelect) sortSelect.value = "newest";
    writeUrl(replace);
    render({ forceSearch: true });
  }

  function setTag(value, fromFeed) {
    if (state.tag && value && state.tag.toLowerCase() === value.toLowerCase()) state.tag = "";
    else state.tag = value || "";
    writeUrl(false);
    render();
    if (fromFeed) focusStatus();
  }

  function bind() {
    var nav = document.getElementById("category-nav");
    if (nav) {
      nav.addEventListener("click", function (event) {
        var link = event.target.closest("a[data-category]");
        if (!link || modified(event)) return;
        event.preventDefault();
        var value = link.getAttribute("data-category") || "";
        if (value === "") state.category = "";
        else if (state.category.toLowerCase() === value.toLowerCase()) state.category = "";
        else state.category = value;
        writeUrl(false);
        render();
      });
    }

    var trending = document.getElementById("trending-tags");
    if (trending) {
      trending.addEventListener("click", function (event) {
        var link = event.target.closest("a[data-tag]");
        if (!link || modified(event)) return;
        event.preventDefault();
        setTag(link.getAttribute("data-tag") || "", false);
      });
    }

    list.addEventListener("click", function (event) {
      if (modified(event)) return;
      var tag = event.target.closest("a[data-tag]");
      if (tag && list.contains(tag)) {
        event.preventDefault();
        setTag(tag.getAttribute("data-tag") || "", true);
        return;
      }
      var cat = event.target.closest("a[data-category]");
      if (cat && list.contains(cat)) {
        event.preventDefault();
        state.category = cat.getAttribute("data-category") || "";
        writeUrl(false);
        render();
        focusStatus();
      }
    });

    if (filters) {
      filters.addEventListener("click", function (event) {
        var button = event.target.closest("[data-clear]");
        if (!button) return;
        var type = button.getAttribute("data-clear");
        if (type === "all") clearAll(false);
        else {
          if (type === "category") state.category = "";
          if (type === "tag") state.tag = "";
          if (type === "q") state.q = "";
          writeUrl(false);
          render({ forceSearch: true });
          focusStatus();
        }
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        state.sort = sortSelect.value === "liked" ? "liked" : "newest";
        writeUrl(false);
        render();
      });
    }

    function applySearch(replace) {
      state.q = input ? input.value.trim() : "";
      writeUrl(replace);
      render();
    }

    if (input) {
      input.addEventListener("input", function () {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(function () { applySearch(true); }, 200);
      });
    }
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        window.clearTimeout(searchTimer);
        applySearch(true);
      });
    }

    window.addEventListener("popstate", function () {
      state = readState();
      if (state.category) state.category = canonicalCategory(state.category);
      if (state.tag) state.tag = canonicalTag(state.tag);
      render({ forceSearch: true });
    });
  }

  function loadIndex() {
    var node = document.getElementById("prompt-index");
    if (node && node.textContent.trim()) {
      try {
        return Promise.resolve(JSON.parse(node.textContent));
      } catch (err) {
        /* Fetch the generated index if the embedded copy cannot be parsed. */
      }
    }
    return fetch(PM.promptsUrl, { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error("Could not load prompts");
      return response.json();
    });
  }

  loadIndex().then(function (data) {
    prompts = (data || []).map(normalize).filter(function (prompt) { return prompt.id; });
    if (state.category) state.category = canonicalCategory(state.category);
    if (state.tag) state.tag = canonicalTag(state.tag);
    if (input && state.q) input.value = state.q;
    if (sortSelect) sortSelect.value = state.sort;
    renderCategories();
    renderTrending();
    bind();
    writeUrl(true);
    render({ forceSearch: true });
    list.removeAttribute("aria-busy");
  }).catch(function () {
    if (status) status.textContent = "The prompt index could not be loaded. Reload the page to try again.";
    list.removeAttribute("aria-busy");
  });
})();
