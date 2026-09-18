import type { QualityIssue } from "../types";

function issueIdentity(issue: QualityIssue): string {
  return JSON.stringify([
    issue.code,
    issue.field ?? null,
    issue.rawValue ?? null,
    issue.message,
  ]);
}

export function uniqueIssues(
  issues: readonly QualityIssue[],
): QualityIssue[] {
  const seen = new Set<string>();
  const result: QualityIssue[] = [];

  for (const issue of issues) {
    const key = issueIdentity(issue);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(issue);
  }

  return result;
}
