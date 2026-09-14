import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NAV_SECTIONS } from "../src/lib/workspace/navigation.ts";
import { STITCH_ERRORS } from "../src/lib/panorama/stitch.ts";
import {
  LANGUAGES,
  navigationKey,
  translate,
  translatePhrase,
  translations,
} from "../src/lib/i18n/translations.ts";

interface Tree {
  [key: string]: string | Tree;
}

function leafKeys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name;
    return typeof value === "string" ? [key] : leafKeys(value, key);
  });
}

function validateCatalog() {
  assert.deepEqual(LANGUAGES, ["en", "am", "om"]);
  const englishKeys = leafKeys(translations.en).sort();
  assert.ok(englishKeys.length >= 200, "the shared catalogue unexpectedly lost coverage");

  for (const language of LANGUAGES) {
    assert.deepEqual(
      leafKeys(translations[language]).sort(),
      englishKeys,
      `${language} must contain exactly the English catalogue keys`,
    );
    for (const key of englishKeys) {
      assert.notEqual(translate(language, key), key, `${language} is missing ${key}`);
    }
  }

  for (const section of NAV_SECTIONS) {
    for (const id of [section.id, ...section.items.map((item) => item.id)]) {
      for (const language of LANGUAGES) {
        assert.notEqual(translate(language, navigationKey(id)), navigationKey(id));
      }
    }
  }

  assert.equal(translate("am", "tours.create360"), "360° ፎቶ ፍጠር");
  assert.equal(translate("om", "navigation.property"), "Qabeenya");
  assert.equal(translatePhrase("am", "Publish tour"), "ቱሩን አትም");
  assert.equal(translatePhrase("om", "Add Property"), "Qabeenya Dabali");
  assert.equal(translatePhrase("am", "Medosha"), "Medosha", "brand names stay unchanged");
  for (const message of Object.values(STITCH_ERRORS)) {
    assert.notEqual(translatePhrase("am", message), message, `missing Amharic stitch error: ${message}`);
    assert.notEqual(translatePhrase("om", message), message, `missing Oromo stitch error: ${message}`);
  }
}

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

function validateIntegration() {
  const layout = source("src/app/layout.tsx");
  const provider = source("src/components/i18n/language-provider.tsx");
  const selector = source("src/components/i18n/language-selector.tsx");
  const topbar = source("src/components/shell/topbar.tsx");
  const secondary = source("src/components/i18n/i18n-text.tsx");
  const bridge = source("src/components/i18n/legacy-translation-bridge.tsx");

  assert.match(layout, /<LanguageProvider initialLanguage={language}>/);
  assert.match(layout, /cookies\(\)[\s\S]*medosha_language/);
  assert.match(topbar, /<LanguageSelector \/>/);
  assert.match(selector, /English/);
  assert.match(selector, /አማርኛ/);
  assert.match(selector, /Afaan Oromo/);
  assert.match(provider, /localStorage\.setItem\(STORAGE_KEY, next\)/);
  assert.match(provider, /document\.cookie/);
  assert.match(secondary, /language !== "en" \|\| !secondary/);
  assert.match(secondary, /translate\("am", textKey\)/);
  assert.match(bridge, /MutationObserver/);
  assert.match(bridge, /originalText/);
}

validateCatalog();
validateIntegration();

// Deliberate mutation check: removing one Oromo key must be rejected by the
// same catalogue validator instead of silently falling back to English.
const oromo = translations.om.common as Tree;
const saved = oromo.save;
delete oromo.save;
assert.throws(validateCatalog, /om must contain exactly the English catalogue keys/);
oromo.save = saved;
validateCatalog();

console.log("i18n check: 3 complete catalogues, navigation coverage, persistence, selector and bilingual rendering verified");
