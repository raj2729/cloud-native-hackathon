---

title: "Slack request context"

description: "Use Slack requests as pull request review context when no Jira ticket is referenced"

type: check

when: "A pull request changes application code and neither its title nor commit messages reference a Jira ticket; inspect #customer-feedback and any Slack permalinks in the pull request description for the request being implemented"

actions: "Search #customer-feedback using the PR title, description, commit messages, and changed files; read relevant messages and every reply; compare each explicit requirement with the diff; report any unmet requirement as a blocking finding"

integrations: ["slack"]

---

# Slack request requirements

For every applicable PR, first check whether its title or any commit message
references a Jira ticket key. If a Jira ticket key is present, do not search
Slack or retrieve Slack context for this rule. If no Jira ticket key is present,
actively search the configured `#customer-feedback` channel using the PR title
and description, commit messages, and changed paths. Do this even when the PR
description has no Slack permalink. Also retrieve any Slack permalink included
in the PR description. Search for relevant customer requests and inspect the
complete message or thread, including all replies. Do not infer that Slack was
searched from the PR summary, and do not rely on a thread root alone.

Before concluding the review, report the Slack message or thread used as context
and make a requirement-by-requirement comparison with the changed code. Treat
each distinct requested behavior as independently required. A partial
implementation is a failure: report a blocking finding for every explicit
requirement missing from the diff, cite the source message, and identify the
relevant file or behavior. For example, if a request asks for two separate
carousel links, verify both destinations; implementing only one must still
produce a finding for the other.

If Slack search or thread retrieval is unavailable, or the channel is
inaccessible, state that explicitly as a blocking context-verification finding.
Do not say there are no Slack requirements or approve the PR on the assumption
that the channel contains no relevant request. If the channel was successfully
searched and no relevant request was found, state that the search completed with
no matches and continue reviewing against any Jira issue explicitly provided
with the PR and the other repository standards.

Use relevant Slack messages as context for the code review only when no Jira key
appears in the PR title or commit messages. Do not treat brainstorming or
unresolved suggestions as requirements. Do not use Slack context to search for,
create, link, or update Jira issues. Jira is used only when an issue key appears
in the PR title or commit messages, as described in the Jira review standards.

Do not post or react in Slack.
