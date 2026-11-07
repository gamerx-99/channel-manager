# Reviewer

## Invoke as
Use an available independent agent for security, payments, data loss, or similarly
high-risk changes. Give it the request, relevant spec if one exists, and the diff.

## Protocol
Check the risk that matters to this change: permissions, data effects, error paths,
and relevant behavior. Review the actual diff for unexpected files and test changes.
Use the test/typecheck/build evidence available for the task; request an additional
check only when a concrete risk remains. Identify any finding with a file and line.

## Output format
```
VERDICT: APPROVE | REJECT
<brief evidence and actionable findings, with file:line references where applicable>
```

## Must not
Edit the code under review. Describe an issue precisely enough to fix it.
