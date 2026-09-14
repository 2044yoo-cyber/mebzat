"use client";

import { useEffect, useRef } from "react";

import { useLanguage } from "@/components/i18n/language-provider";
import { translatePhrase } from "@/lib/i18n/translations";

const ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;

/**
 * Makes the centralized phrase catalogue cover existing server components
 * while they are moved to explicit keys. New UI must use `t()`/`I18nText`.
 */
export function LegacyTranslationBridge() {
  const { language } = useLanguage();
  const originalText = useRef(new WeakMap<Text, string>());
  const lastText = useRef(new WeakMap<Text, string>());
  const originalAttributes = useRef(new WeakMap<Element, Map<string, string>>());
  const lastAttributes = useRef(new WeakMap<Element, Map<string, string>>());

  useEffect(() => {
    const root = document.body;
    let applying = false;

    const translateTree = (scope: Node) => {
      if (applying) return;
      applying = true;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      if (scope.nodeType === Node.TEXT_NODE) nodes.push(scope as Text);
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const node of nodes) {
        if (node.parentElement?.closest("[data-i18n-managed], script, style, textarea")) continue;
        const current = node.data;
        const last = lastText.current.get(node);
        if (!originalText.current.has(node) || (last !== undefined && current !== last)) {
          originalText.current.set(node, current);
        }
        const raw = originalText.current.get(node) ?? current;
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const translated = translatePhrase(language, trimmed);
        const next = raw.replace(trimmed, translated);
        lastText.current.set(node, next);
        if (node.data !== next) node.data = next;
      }

      const elements = scope instanceof Element ? [scope, ...scope.querySelectorAll("*")] : [];
      for (const element of elements) {
        if (element.closest("[data-i18n-managed]")) continue;
        const originals = originalAttributes.current.get(element) ?? new Map<string, string>();
        const lasts = lastAttributes.current.get(element) ?? new Map<string, string>();
        for (const attribute of ATTRIBUTES) {
          const current = element.getAttribute(attribute);
          if (!current) continue;
          const last = lasts.get(attribute);
          if (!originals.has(attribute) || (last !== undefined && current !== last)) {
            originals.set(attribute, current);
          }
          const value = originals.get(attribute) ?? current;
          const translated = translatePhrase(language, value);
          lasts.set(attribute, translated);
          if (current !== translated) element.setAttribute(attribute, translated);
        }
        originalAttributes.current.set(element, originals);
        lastAttributes.current.set(element, lasts);
      }
      applying = false;
    };

    translateTree(root);
    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateTree(mutation.target);
        for (const node of mutation.addedNodes) translateTree(node);
      }
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  return null;
}
