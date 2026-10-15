---
layout: prompt
title: "Review a pull request for risk"
category: "Coding"
tags:
  - "review"
  - "risk"
  - "github"
author: "Priya Nair"
date: 2026-01-20
description: "A review that leads with what could break, not with style nits."
---
{% raw %}
<pre class="prompt-source">Review this pull request as a teammate who will be on call for it.

Lead with risk, not with style. Read the diff and the test changes before you comment.

Order your review like this:
1. What this change is trying to do, in two sentences.
2. Blocking issues: correctness, data loss, security, migrations, or a missing test for behavior that users can hit. Quote the relevant lines.
3. Non-blocking questions: assumptions you cannot check from the diff alone.
4. Test gaps: name the case, the input, and the expected result. Do not write a whole new framework.
5. Nitpicks, only if the list above is empty or the nit is hiding a real bug. Otherwise leave them out.

Rules:
- Do not praise the pull request in the summary.
- Do not suggest a rewrite unless the current approach cannot be made safe with a smaller change.
- If you are not sure, say what you would run or inspect to become sure.

Diff and context:
{{diff}}</pre>
{% endraw %}
