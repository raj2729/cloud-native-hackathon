# Node.js backend standards

Apply these standards to Node.js backend code when it is added or changed. Fit recommendations to the repository's actual framework and dependencies; do not require a particular framework or database.

- Validate and normalize untrusted input at the boundary before using it. Reject invalid input clearly, and avoid trusting client-provided identifiers, roles, or other authorization claims.
- Keep authentication and authorization checks explicit and close to protected operations. Do not expose secrets, credentials, tokens, or sensitive personal data in responses or logs.
- Handle asynchronous failures deliberately. Ensure rejected promises and operational errors reach the project's error-handling path; do not silently swallow errors or return success-shaped fallback values.
- Use parameterized queries or the database client's safe query APIs for data access. Do not build query text by concatenating untrusted input.
- Read environment-specific configuration from the established configuration mechanism, validate required settings at startup, and never commit real credentials or silently substitute insecure production defaults.
- Keep request handlers non-blocking: avoid synchronous filesystem or other blocking work on the request path when an asynchronous API is available.
- For externally visible behavior changes, add or update focused tests for successful and invalid inputs, authorization boundaries where relevant, and failure handling. Use the repository's actual test and build commands; do not assume scripts that are not configured.
