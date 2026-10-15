---
layout: prompt
title: "Meeting notes into a decision log"
category: "Productivity"
tags:
  - "meetings"
  - "decisions"
author: "Maya Chen"
date: 2026-09-30
description: "Pull decisions, owners, and open questions out of messy notes."
---
{% raw %}
<pre class="prompt-source">Turn messy meeting notes into a decision log the people in the room can correct.

Return only these sections:
- Decisions. One line each. Start with the decision, then "Owner:" and "Due:" or "no date".
- Still open. Questions that did not get a decision. Do not answer them yourself.
- Parked. Topics someone postponed.
- Exact names. A list of every person named in the notes, copied as written.

Rules:
- Do not invent owners, dates, or consensus. If the notes say "someone should", the owner is "unassigned".
- Do not merge two proposals into a decision unless the notes say which one was chosen.
- Keep disagreement visible. If two people disagreed and nothing was resolved, it belongs in Still open.
- Ignore greetings, tooling trouble, and scheduling chatter.

Notes:
{{notes}}</pre>
{% endraw %}
