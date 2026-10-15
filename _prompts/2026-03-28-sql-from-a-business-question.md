---
layout: prompt
title: "SQL from a business question"
category: "Data"
tags:
  - "sql"
  - "analytics"
author: "Mateo Alvarez"
date: 2026-03-28
description: "Write a query, state assumptions, and flag the grain of the table."
---
{% raw %}
<pre class="prompt-source">Write one SQL query that answers the business question. Dialect: {{dialect}}.

Before the query, write:
- The grain of the result, one row equals what
- Filters you are applying, each marked "asked for" or "assumption"
- Tables you need and the join key you are assuming

Query rules:
- Name columns in plain words with aliases.
- Do not select star.
- Put the date filter in WHERE, not buried in a join, unless the notes say otherwise.
- If a metric can be double-counted because of the joins, stop and say so instead of returning a flattering number.

After the query, list:
1. How a wrong join would show up in the result
2. One row you would check by hand before sharing the number
3. Questions that would change the query

Schema notes:
{{schema}}

Question:
{{question}}</pre>
{% endraw %}
