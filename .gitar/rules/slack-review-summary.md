---
title: "Share Gitar review summary"
description: "Post a clear, polished summary to Slack after every completed pull request review"
type: automation
when: "After Gitar completes a review of a pull request, whether it finds issues or no issues"
actions: "Post a concise, well-formatted summary of the completed Gitar review to #deploy-notifications, including the PR link, review outcome, and key findings or a clear no-findings result"
integrations: ["slack"]
---

# Share the completed review

After every completed Gitar review, post one message in `#deploy-notifications`.
Include:

- The pull request title and link.
- A concise outcome (for example: approved/no actionable findings, or changes
  requested).
- The overall risk level, if Gitar reported one.
- A short, readable list of the most important findings, with severity and
  relevant file or location when available. If there are no findings, say so
  explicitly.
- A brief next step when the review requires changes.

Make the message polished and easy to scan using Slack formatting, a clear
heading, and restrained emoji only where they improve readability. Summarize
findings accurately; do not omit blocking issues, invent conclusions, or imply
approval when the review is blocked or incomplete. Do not copy entire review
reports or include secrets, credentials, or unrelated private data.

Post only after the review is complete, and do not post duplicate summaries for
the same review run. If Slack posting fails, report that failure rather than
claiming the summary was sent.
