/** Auth/tenant refusal. Message is safe to show the user. */
export class TenantError extends Error {}
/** Validation / business-rule refusal. Message is safe to show the user. */
export class ActionError extends Error {}
