---
title: "Assign the PR reviewer"
description: "Always assign the appropriate reviewer to every pull request"
type: automation
when: "Whenever a pull request is opened or its selected reviewer changes"
actions: "Inspect the pull request title, commit messages, and changed files; assign Isha Patel when the changes relate to the MCP server, otherwise assign Raj Sanghavi; send the selected reviewer a Slack direct message with the PR link and request for review"
integrations: ["slack"]
---

# Pull request reviewer assignment

For every pull request, inspect its title, commit messages, and changed files
and assign exactly one reviewer:

- Assign **Isha Patel** when the changes are related to the MCP server, including
  MCP server implementation, configuration, or integration.
- Otherwise, assign **Raj Sanghavi**.

Apply this rule whenever a pull request is opened, even if another review
process has already run. If a change to the PR means a different reviewer is
selected, update the assignment and notify the newly selected reviewer. Do not
send duplicate Slack messages for unrelated PR updates.

Resolve the selected person's Slack account by their exact name and send them a
direct message. Do not guess among ambiguous matches or notify a different
person. Use this message, filling in the PR title, link, and applicable reason:

> Hi {reviewer name} — could you please review this PR when you have a chance?
> **{PR title}**: {PR link}
> You’re assigned because {MCP-server-related changes / the default reviewer
> assignment}. Thanks!

If the selected reviewer cannot be assigned or their Slack account cannot be
uniquely resolved, report that failure explicitly. Do not silently substitute
another reviewer or claim a notification was sent when it was not.
