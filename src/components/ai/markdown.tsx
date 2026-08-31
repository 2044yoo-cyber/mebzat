"use client";

import { useMemo } from "react";

/**
 * Minimal Markdown renderer for assistant answers.
 *
 * Written rather than pulled in: the assistant emits a known, narrow subset —
 * headings, bold, inline code, fenced code, tables, lists and links — and a
 * full CommonMark parser plus sanitiser would add far more weight than the
 * subset costs. Nothing here interprets raw HTML, so model output cannot
 * inject markup: text reaches the DOM only as React children.
 */

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; language: string; code: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "rule" };

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  /**
   * The line at an index, or "" past the end.
   *
   * Every read below sits inside a `index < lines.length` loop and is provably
   * in bounds — but the compiler cannot see that, and sprinkling non-null
   * assertions through a parser is how an off-by-one becomes a crash on a
   * half-streamed answer. One accessor, no assertions, same behaviour.
   */
  const at = (position: number): string => lines[position] ?? "";
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = at(index);

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    // Fenced code. An unterminated fence still renders, so a streaming answer
    // shows its code block while it is being written.
    if (line.trimStart().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !at(index).trimStart().startsWith("```")) {
        code.push(at(index));
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", language, code: code.join("\n") });
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      // Both groups are mandatory in the pattern, so a match always has them;
      // the defaults exist to say so to the compiler rather than to assert it.
      const [, hashes = "#", text = ""] = heading;
      blocks.push({
        kind: "heading",
        level: hashes.length <= 2 ? 2 : 3,
        text,
      });
      index += 1;
      continue;
    }

    // Table: a header row followed by a separator of dashes.
    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      /^\s*\|?[\s:-]*\|[\s:|-]*$/.test(at(index + 1))
    ) {
      const header = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && at(index).includes("|")) {
        rows.push(splitRow(at(index)));
        index += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const bulletMatch = /^\s*[-*+]\s+/.test(line);
    const orderedMatch = /^\s*\d+[.)]\s+/.test(line);
    if (bulletMatch || orderedMatch) {
      const ordered = orderedMatch && !bulletMatch;
      const items: string[] = [];
      while (
        index < lines.length &&
        (ordered
          ? /^\s*\d+[.)]\s+/.test(at(index))
          : /^\s*[-*+]\s+/.test(at(index)))
      ) {
        items.push(at(index).replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      at(index).trim() !== "" &&
      !at(index).trimStart().startsWith("```") &&
      !/^(#{1,6})\s+/.test(at(index)) &&
      !/^\s*[-*+]\s+/.test(at(index)) &&
      !/^\s*\d+[.)]\s+/.test(at(index))
    ) {
      paragraph.push(at(index));
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

/** Renders bold, inline code and links inside a line of text. */
function Inline({ text }: { text: string }) {
  const parts = useMemo(() => {
    const pattern =
      /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\))/g;
    const out: React.ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > cursor) out.push(text.slice(cursor, match.index));
      const token = match[0];

      if (token.startsWith("**")) {
        out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
      } else if (token.startsWith("`")) {
        out.push(
          <code
            key={key++}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {token.slice(1, -1)}
          </code>,
        );
      } else {
        const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(token);
        if (link) {
          out.push(
            <a
              key={key++}
              href={link[2]}
              className="font-medium text-brand underline underline-offset-2"
            >
              {link[1]}
            </a>,
          );
        }
      }
      cursor = match.index + token.length;
    }

    if (cursor < text.length) out.push(text.slice(cursor));
    return out;
  }, [text]);

  return <>{parts}</>;
}

export function Markdown({ content }: { content: string }) {
  const blocks = useMemo(() => parse(content), [content]);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          const Tag = block.level === 2 ? "h2" : "h3";
          return (
            <Tag
              key={i}
              className={
                block.level === 2
                  ? "mt-2 text-base font-semibold"
                  : "mt-2 text-sm font-semibold"
              }
            >
              <Inline text={block.text} />
            </Tag>
          );
        }

        if (block.kind === "rule") {
          return <hr key={i} className="border-border" />;
        }

        if (block.kind === "code") {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-xs"
            >
              <code>{block.code}</code>
            </pre>
          );
        }

        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={i}
              className={
                block.ordered
                  ? "list-decimal space-y-1 pl-5"
                  : "list-disc space-y-1 pl-5"
              }
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </Tag>
          );
        }

        if (block.kind === "table") {
          return (
            <div key={i} className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    {block.header.map((cell, j) => (
                      <th key={j} className="px-3 py-2 text-left font-semibold">
                        <Inline text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j} className="border-t">
                      {row.map((cell, k) => (
                        <td key={k} className="px-3 py-2 align-top">
                          <Inline text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
