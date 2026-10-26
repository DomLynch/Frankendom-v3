// `?off=<name>[,<name>]`: the one way a shipped-on feature is switched off from the link (Strategy's legacy-link cleanup, 2026-10-08: ON by default, one opt-out per feature).
export const offFlag = (search: string, name: string): boolean => (new URLSearchParams(search).get('off') ?? '').split(',').includes(name);
