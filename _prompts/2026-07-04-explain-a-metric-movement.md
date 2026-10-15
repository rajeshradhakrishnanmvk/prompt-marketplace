---
layout: prompt
title: "Explain a metric movement"
category: "Data"
tags:
  - "metrics"
  - "narrative"
author: "Hannah Berg"
date: 2026-07-04
description: "Separate what the numbers show from what they might mean."
---
{% raw %}
<pre class="prompt-source">Explain why this metric moved. Separate what the table shows from what it might mean.

Use this order:
1. The move, with the starting value, ending value, and window, copied from the notes.
2. The slices that account for most of the change. Show the arithmetic. If the slices do not add up, say they do not.
3. Two plausible explanations that fit the numbers, labeled as explanations, not findings.
4. One explanation the numbers do not support, and the comparison that rules it out.
5. The next cut I should pull, specific enough that an analyst can write the query.

Rules:
- Do not invent a campaign, outage, or seasonality that is not in the notes.
- If a segment is R&amp;D or a score is under 10, call that out as a slice only when the notes contain it. Do not treat a score &lt; 10 as a cause by itself.
- Say "not in the extract" when a number you want is missing.

Metric notes:
{{metric_notes}}</pre>
{% endraw %}
