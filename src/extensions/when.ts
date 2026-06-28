/**
 * Tiny `when`-clause evaluator for declarative visibility gating of contributions.
 *
 * Deliberately **not** an expression language: a clause is a conjunction (`&&`) of
 * simple terms, each one either a boolean key check (`key` / `!key`) or an
 * equality/inequality against a literal (`key == value` / `key != value`). The
 * literals `true` / `false` coerce to booleans; everything else is compared as a
 * string. There is no precedence, grouping, `||`, or arithmetic — keep it boring.
 *
 * It runs against a small, host-owned, read-only UI-context (see `ui-context.tsx`),
 * so evaluating a `when` never executes extension code nor exposes extension data —
 * it only reads facts the host already derives for its own built-ins.
 */

/** Whitelisted, read-only facts a `when` clause may reference. */
export type WhenContext = Record<string, string | boolean>;

/** Coerce a literal token: `true`/`false` become booleans, otherwise a string. */
function coerceLiteral(literal: string): string | boolean {
  if (literal === "true") return true;
  if (literal === "false") return false;
  return literal;
}

/** A context value is "truthy" if it is boolean `true` or a non-empty string. */
function isTruthy(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  return typeof value === "string" && value.length > 0;
}

const COMPARISON = /^(\S+)\s*(==|!=)\s*(\S+)$/;

function evaluateTerm(term: string, context: WhenContext): boolean {
  const comparison = term.match(COMPARISON);
  if (comparison) {
    const [, key, op, literal] = comparison;
    const equal = context[key] === coerceLiteral(literal);
    return op === "==" ? equal : !equal;
  }
  if (term.startsWith("!")) {
    return !isTruthy(context[term.slice(1).trim()]);
  }
  return isTruthy(context[term]);
}

/**
 * Evaluate a `when` clause against the UI-context.
 *
 * An `undefined` or empty clause is always visible. Unknown keys are falsy (mirrors
 * VS Code), so a clause referencing a fact the host doesn't expose hides the item
 * rather than throwing.
 */
export function evaluateWhen(
  when: string | undefined,
  context: WhenContext,
): boolean {
  if (when === undefined) return true;
  const clause = when.trim();
  if (clause === "") return true;
  return clause.split("&&").every((term) => evaluateTerm(term.trim(), context));
}
