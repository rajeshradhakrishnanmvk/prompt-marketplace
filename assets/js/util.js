(function (global) {
  var PM = global.PM = global.PM || {};
  var LIKES_KEY = "pm.likes.v1";
  var PALETTE = ["#0f6e56", "#1d4e89", "#8a3e2a", "#3f4a2a", "#5c3d73", "#0e4d5c", "#7a3e5c", "#3d4f2f"];

  function readLikes() {
    try {
      var raw = global.localStorage.getItem(LIKES_KEY);
      var data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch (err) {
      return {};
    }
  }

  PM.isLiked = function (id) {
    return !!readLikes()[id];
  };

  PM.toggleLike = function (id) {
    var data = readLikes();
    if (data[id]) delete data[id];
    else data[id] = true;
    try {
      global.localStorage.setItem(LIKES_KEY, JSON.stringify(data));
    } catch (err) {
      return false;
    }
    return !!data[id];
  };

  PM.formatDate = function (iso) {
    var parts = String(iso || "").split("-");
    if (parts.length < 3) return iso || "";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var month = months[Number(parts[1]) - 1] || parts[1];
    return month + " " + Number(parts[2]) + ", " + parts[0];
  };

  PM.initials = function (name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  PM.avatarColor = function (name) {
    var hash = 0;
    var text = String(name || "");
    for (var i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return PALETTE[hash % PALETTE.length];
  };

  PM.promptText = function (html) {
    var doc = new DOMParser().parseFromString(html || "", "text/html");
    var node = doc.querySelector(".prompt-source");
    var text = node ? node.textContent : (doc.body ? doc.body.textContent : "");
    return String(text || "").replace(/^\uFEFF/, "").replace(/^[\r\n]+|[\r\n]+$/g, "");
  };

  PM.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        if (ok) resolve();
        else reject(new Error("copy failed"));
      } catch (err) {
        document.body.removeChild(area);
        reject(err);
      }
    });
  };

  PM.announce = function (message) {
    var live = document.getElementById("live-status");
    if (!live) return;
    live.textContent = "";
    global.setTimeout(function () { live.textContent = message; }, 30);
  };

  PM.absoluteUrl = function (path) {
    return new URL(path, global.location.origin).href;
  };

  PM.svg = function (name) {
    var paths = {
      copy: '<rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V6a1 1 0 0 1 1-1h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      like: '<path class="heart" d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z"/>',
      share: '<circle cx="6" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="6.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="17.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11.2l7-3.6M8 13l7 3.4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      open: '<path d="M14 5h5v5M19 5l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    };
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (paths[name] || "") + "</svg>";
  };

  PM.paintLike = function (button, id) {
    var liked = PM.isLiked(id);
    button.classList.toggle("is-liked", liked);
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    var label = button.querySelector(".action-label");
    if (label) label.textContent = liked ? "Liked" : "Like";
  };

  PM.paintAvatars = function (root) {
    var nodes = (root || document).querySelectorAll("[data-avatar]");
    Array.prototype.forEach.call(nodes, function (el) {
      el.style.background = PM.avatarColor(el.getAttribute("data-avatar") || el.textContent);
      el.style.color = "#fff";
    });
  };

  PM.refreshSearchClear = function () {
    var input = document.getElementById("site-search");
    var clearBtn = document.getElementById("search-clear");
    if (!input || !clearBtn) return;
    clearBtn.hidden = input.value.length === 0;
  };

  PM.refreshClamps = function (root) {
    var nodes = (root || document).querySelectorAll(".prompt-body");
    Array.prototype.forEach.call(nodes, function (body) {
      var btn = body.parentElement.querySelector(".see-more");
      if (!btn) return;
      body.classList.add("is-clamped");
      if (body.scrollHeight > body.clientHeight + 1) btn.hidden = false;
      else {
        btn.hidden = true;
        body.classList.remove("is-clamped");
      }
    });
  };

  function actionNode(tag, label, icon, className) {
    var el = document.createElement(tag);
    if (tag === "button") el.type = "button";
    el.className = "action" + (className ? " " + className : "");
    el.innerHTML = PM.svg(icon);
    var span = document.createElement("span");
    span.className = "action-label";
    span.textContent = label;
    el.appendChild(span);
    return el;
  }

  PM.createPostCard = function (post, options) {
    var opts = options || {};
    var interactive = opts.interactive !== false;
    var article = document.createElement("article");
    article.className = "card post";
    article.setAttribute("data-id", post.id || "");

    var head = document.createElement("header");
    head.className = "post-head";
    var avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.setAttribute("data-avatar", post.author || "");
    avatar.textContent = PM.initials(post.author);
    var who = document.createElement("div");
    var author = document.createElement("div");
    author.className = "author";
    author.textContent = post.author || "Anonymous";
    var time = document.createElement("time");
    if (post.date) time.dateTime = post.date;
    time.textContent = post.date ? PM.formatDate(post.date) : "";
    who.appendChild(author);
    who.appendChild(time);
    head.appendChild(avatar);
    head.appendChild(who);
    article.appendChild(head);

    var title = document.createElement("h2");
    title.className = "post-title";
    if (interactive && post.url) {
      var titleLink = document.createElement("a");
      titleLink.href = post.url;
      titleLink.textContent = post.title || "Untitled prompt";
      title.appendChild(titleLink);
    } else {
      title.textContent = post.title || "Untitled prompt";
    }
    article.appendChild(title);

    var meta = document.createElement("div");
    meta.className = "meta-row";
    if (post.category) {
      var chip = document.createElement(interactive ? "a" : "span");
      chip.className = "chip";
      chip.textContent = post.category;
      if (interactive) {
        chip.href = PM.home + "?category=" + encodeURIComponent(post.category);
        chip.setAttribute("data-category", post.category);
      }
      meta.appendChild(chip);
    }
    (post.tags || []).forEach(function (tag) {
      var tagEl = document.createElement(interactive ? "a" : "span");
      tagEl.className = "tag";
      tagEl.textContent = tag;
      if (interactive) {
        tagEl.href = PM.home + "?tag=" + encodeURIComponent(tag);
        tagEl.setAttribute("data-tag", tag);
      }
      meta.appendChild(tagEl);
    });
    if (meta.childNodes.length) article.appendChild(meta);

    if (post.description) {
      var lede = document.createElement("p");
      lede.className = "lede";
      lede.textContent = post.description;
      article.appendChild(lede);
    }

    var body = document.createElement("p");
    body.className = "prompt-body is-clamped";
    body.textContent = post.text || "";
    article.appendChild(body);

    var more = document.createElement("button");
    more.type = "button";
    more.className = "see-more";
    more.textContent = "See more";
    more.setAttribute("aria-expanded", "false");
    more.hidden = true;
    more.addEventListener("click", function () {
      var open = more.getAttribute("aria-expanded") === "true";
      if (open) {
        body.classList.add("is-clamped");
        more.textContent = "See more";
        more.setAttribute("aria-expanded", "false");
      } else {
        body.classList.remove("is-clamped");
        more.textContent = "See less";
        more.setAttribute("aria-expanded", "true");
      }
    });
    article.appendChild(more);

    var actions = document.createElement("div");
    actions.className = "actions";
    if (!interactive) actions.setAttribute("aria-hidden", "true");

    var copyBtn = actionNode(interactive ? "button" : "span", "Copy prompt", "copy", "copy-prompt");
    var likeBtn = actionNode(interactive ? "button" : "span", "Like", "like", "like-prompt");
    var shareBtn = actionNode(interactive ? "button" : "span", "Share", "share", "share-prompt");
    var openEl = actionNode(interactive ? "a" : "span", "Open", "open", "open-prompt");
    if (interactive && post.url) openEl.href = post.url;

    if (interactive && post.id) {
      likeBtn.setAttribute("aria-pressed", "false");
      PM.paintLike(likeBtn, post.id);
      copyBtn.addEventListener("click", function () {
        var label = copyBtn.querySelector(".action-label");
        PM.copyText(post.text || "").then(function () {
          label.textContent = "Copied";
          PM.announce("Prompt copied to clipboard");
          global.setTimeout(function () { label.textContent = "Copy prompt"; }, 1600);
        }).catch(function () {
          label.textContent = "Copy failed";
          PM.announce("Could not copy the prompt");
        });
      });
      likeBtn.addEventListener("click", function () {
        PM.toggleLike(post.id);
        PM.paintLike(likeBtn, post.id);
        PM.announce(PM.isLiked(post.id) ? "Saved like in this browser" : "Removed like");
        if (typeof opts.onLike === "function") opts.onLike(PM.isLiked(post.id));
      });
      shareBtn.addEventListener("click", function () {
        var label = shareBtn.querySelector(".action-label");
        PM.copyText(PM.absoluteUrl(post.url)).then(function () {
          label.textContent = "Link copied";
          PM.announce("Link copied to clipboard");
          global.setTimeout(function () { label.textContent = "Share"; }, 1600);
        }).catch(function () {
          label.textContent = "Share failed";
          PM.announce("Could not copy the link");
        });
      });
    }

    actions.appendChild(copyBtn);
    actions.appendChild(likeBtn);
    actions.appendChild(shareBtn);
    actions.appendChild(openEl);
    article.appendChild(actions);
    return article;
  };

  function bindChrome() {
    var params = new URLSearchParams(global.location.search);
    var input = document.getElementById("site-search");
    if (input && params.get("q") && !input.value) input.value = params.get("q");
    PM.refreshSearchClear();
    if (input) {
      input.addEventListener("input", PM.refreshSearchClear);
    }
    var clearBtn = document.getElementById("search-clear");
    if (clearBtn && input) {
      clearBtn.addEventListener("click", function () {
        input.value = "";
        PM.refreshSearchClear();
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    document.addEventListener("keydown", function (event) {
      var tag = (event.target && event.target.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (event.target && event.target.isContentEditable);
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!input) return;
        event.preventDefault();
        input.focus();
        input.select();
      }
    });

    var toggles = document.querySelectorAll(".collapse-toggle");
    Array.prototype.forEach.call(toggles, function (button) {
      button.addEventListener("click", function () {
        var card = button.closest(".side-card");
        if (!card) return;
        var open = card.classList.toggle("is-open");
        button.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });

    var mq = global.matchMedia("(max-width: 959px)");
    function applyLayout() {
      var narrow = mq.matches;
      document.documentElement.setAttribute("data-layout", narrow ? "narrow" : "wide");
      if (!narrow) {
        Array.prototype.forEach.call(document.querySelectorAll(".side-card"), function (card) {
          card.classList.remove("is-open");
        });
        Array.prototype.forEach.call(toggles, function (button) {
          button.setAttribute("aria-expanded", "false");
        });
      }
    }
    if (mq.addEventListener) mq.addEventListener("change", applyLayout);
    else if (mq.addListener) mq.addListener(applyLayout);

    PM.paintAvatars(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindChrome);
  } else {
    bindChrome();
  }
})(window);
