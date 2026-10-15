(function () {
  var article = document.querySelector("[data-prompt-id]");
  if (!article || !window.PM) return;
  var PM = window.PM;
  var id = article.getAttribute("data-prompt-id");
  var source = article.querySelector(".prompt-source");
  var text = source ? String(source.textContent || "").replace(/^[\r\n]+|[\r\n]+$/g, "") : "";
  var copyBtn = document.getElementById("copy-prompt");
  var likeBtn = document.getElementById("like-prompt");
  var shareBtn = document.getElementById("share-prompt");

  function flash(button, next, restore) {
    var label = button.querySelector(".action-label");
    if (!label) return;
    label.textContent = next;
    window.setTimeout(function () { label.textContent = restore; }, 1600);
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      PM.copyText(text).then(function () {
        flash(copyBtn, "Copied", "Copy prompt");
        PM.announce("Prompt copied to clipboard");
      }).catch(function () {
        flash(copyBtn, "Copy failed", "Copy prompt");
        PM.announce("Could not copy the prompt");
      });
    });
  }

  if (likeBtn) {
    PM.paintLike(likeBtn, id);
    likeBtn.addEventListener("click", function () {
      PM.toggleLike(id);
      PM.paintLike(likeBtn, id);
      PM.announce(PM.isLiked(id) ? "Saved like in this browser" : "Removed like");
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var url = PM.absoluteUrl(article.getAttribute("data-url") || window.location.pathname);
      PM.copyText(url).then(function () {
        flash(shareBtn, "Link copied", "Share");
        PM.announce("Link copied to clipboard");
      }).catch(function () {
        flash(shareBtn, "Share failed", "Share");
        PM.announce("Could not copy the link");
      });
    });
  }
})();
