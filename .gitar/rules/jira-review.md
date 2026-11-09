---
title: "Jira Description Context Review"
description: "Verify the implementation matches the Jira ticket referenced in the PR title or commits"
when: "PR title or commit messages reference a Jira ticket key (e.g. KAN-6)"
actions: "Post a comment summarizing how well the changes satisfy the ticket and flag missing requirements or edge cases"
---

# Jira Description Context Review

Fetch the referenced Jira ticket, read its description and acceptance criteria, and compare them against the diff.
- Summarize how well the code changes satisfy the ticket.
- Flag requirements or edge cases from the ticket that the diff leaves out.
