---
layout: prompt
title: "Turn a bug report into a failing test"
category: "Coding"
tags:
  - "tests"
  - "debugging"
author: "Chris Dalton"
date: 2026-05-09
description: "Convert a messy report into a reproducible test plan and one failing test."
---
{% raw %}
<pre class="prompt-source">Turn the bug report below into a failing test we can check in before the fix.

Work in this order:
1. Restate the failure in one sentence: who does what, what they expected, what happened.
2. List the conditions that seem required to reproduce it. Mark each as "stated" or "guess".
3. Name the smallest unit that should fail: function, component, request, or job. Say why it is smaller than a full end-to-end run.
4. Write one test in the style of the snippet I include. The test should fail on the current behavior and pass on the expected behavior.
5. Note anything you refused to encode because the report does not say it.

Do not write the production fix. Do not invent logs, stack traces, or version numbers.

Bug report:
{{bug_report}}

Test style to copy:
{{test_style}}</pre>
{% endraw %}
