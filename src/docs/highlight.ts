/**
 * A small syntax highlighter for the code blocks of the documentation: JSON, JavaScript, Python,
 * shell and HTML. It only has to make examples readable, not parse them, so each language is a
 * list of token patterns tried in order at every position.
 */

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Rule = readonly [pattern: string, className: string];

const STRING = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'`;
const NUMBER = String.raw`\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`;

const JSON_RULES: Rule[] = [
  [String.raw`"(?:[^"\\\n]|\\.)*"(?=\s*:)`, "key"],
  [String.raw`"(?:[^"\\\n]|\\.)*"`, "str"],
  [String.raw`-?${NUMBER}`, "num"],
  [String.raw`\b(?:true|false|null)\b`, "lit"],
];

const JS_RULES: Rule[] = [
  [String.raw`//[^\n]*|/\*[\s\S]*?\*/`, "com"],
  [String.raw`${STRING}|` + "`(?:[^`\\\\]|\\\\.)*`", "str"],
  [NUMBER, "num"],
  [String.raw`\b(?:const|let|var|function|return|if|else|for|while|new|await|async|import|from|export|class|try|catch|throw|of|in|typeof|switch|case|break|continue)\b`, "kw"],
  [String.raw`\b(?:true|false|null|undefined)\b`, "lit"],
  [String.raw`\b[A-Za-z_$][\w$]*(?=\()`, "fn"],
];

const PYTHON_RULES: Rule[] = [
  [String.raw`#[^\n]*`, "com"],
  [STRING, "str"],
  [NUMBER, "num"],
  [String.raw`\b(?:import|from|def|return|if|elif|else|for|while|in|as|with|try|except|raise|class|lambda|not|and|or|is)\b`, "kw"],
  [String.raw`\b(?:True|False|None)\b`, "lit"],
  [String.raw`\b[A-Za-z_][\w]*(?=\()`, "fn"],
];

const SHELL_RULES: Rule[] = [
  [String.raw`#[^\n]*`, "com"],
  [STRING, "str"],
  [String.raw`(?<=\s)--?[A-Za-z][\w-]*`, "flag"],
  [String.raw`^(?:curl|npm|npx|cargo|git|node)\b`, "fn"],
  [NUMBER, "num"],
];

const compile = (rules: readonly Rule[]) => new RegExp(rules.map(([pattern]) => `(${pattern})`).join("|"), "gm");

const COMPILED = new Map<readonly Rule[], RegExp>();

function tokenize(code: string, rules: readonly Rule[]): string {
  let regex = COMPILED.get(rules);
  if (!regex) COMPILED.set(rules, (regex = compile(rules)));
  regex.lastIndex = 0;
  let out = "";
  let last = 0;
  for (let match = regex.exec(code); match; match = regex.exec(code)) {
    if (match[0] === "") {
      regex.lastIndex++;
      continue;
    }
    const group = match.findIndex((value, i) => i > 0 && value !== undefined) - 1;
    out += `${escapeHtml(code.slice(last, match.index))}<span class="tok-${rules[group][1]}">${escapeHtml(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

/** A tag with its name, attributes and quoted values coloured separately. */
function highlightTag(tag: string): string {
  return tag.replace(/^(<\/?)([\w-]+)([\s\S]*?)(\/?>)$/, (_, open: string, name: string, attrs: string, close: string) => {
    const body = attrs.replace(/([\w:-]+)(=)?("[^"]*"|'[^']*')?/g, (m, key: string, eq?: string, value?: string) =>
      m.trim() === "" ? m : `<span class="tok-attr">${key}</span>${eq ?? ""}${value ? `<span class="tok-str">${escapeHtml(value)}</span>` : ""}`,
    );
    return `${escapeHtml(open)}<span class="tok-tag">${name}</span>${body}${escapeHtml(close)}`;
  });
}

function highlightHtml(code: string): string {
  let out = "";
  let last = 0;
  const pattern = /<!--[\s\S]*?-->|<script[^>]*>[\s\S]*?<\/script>|<\/?[A-Za-z][^>]*>/g;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    out += escapeHtml(code.slice(last, match.index));
    const text = match[0];
    if (text.startsWith("<!--")) out += `<span class="tok-com">${escapeHtml(text)}</span>`;
    else if (/^<script/i.test(text)) {
      const open = /^<script[^>]*>/i.exec(text)?.[0] ?? "";
      const end = text.length - "</script>".length;
      out += `${highlightTag(open)}${tokenize(text.slice(open.length, end), JS_RULES)}${highlightTag(text.slice(end))}`;
    } else out += highlightTag(text);
    last = match.index + text.length;
  }
  return out + escapeHtml(code.slice(last));
}

const LANGUAGES: Record<string, (code: string) => string> = {
  json: (code) => tokenize(code, JSON_RULES),
  js: (code) => tokenize(code, JS_RULES),
  javascript: (code) => tokenize(code, JS_RULES),
  ts: (code) => tokenize(code, JS_RULES),
  python: (code) => tokenize(code, PYTHON_RULES),
  py: (code) => tokenize(code, PYTHON_RULES),
  bash: (code) => tokenize(code, SHELL_RULES),
  sh: (code) => tokenize(code, SHELL_RULES),
  html: highlightHtml,
};

/** `code` as HTML with `tok-*` spans; a language that is not known is only escaped. */
export function highlight(code: string, lang: string | undefined): string {
  const run = lang ? LANGUAGES[lang.toLowerCase()] : undefined;
  return run ? run(code) : escapeHtml(code);
}
