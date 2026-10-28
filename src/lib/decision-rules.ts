export function hardBlock(reasons: string[], condition: boolean, reason: string) {
  return condition ? [...reasons, reason] : null;
}

export function withinWindow(createdAt: Date, now: Date, days: number) {
  return now.getTime() - createdAt.getTime() <= days * 86_400_000;
}
