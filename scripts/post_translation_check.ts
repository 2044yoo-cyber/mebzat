import assert from "node:assert/strict";
import { translatedText, translationChunks, translationSlot } from "../src/lib/i18n/post-translation";
import { translatePhrase } from "../src/lib/i18n/translations";
import { KIND_LABEL } from "../src/lib/feed/constants";

async function main() {
  for (const label of [...Object.values(KIND_LABEL), 'Follow', 'Following', 'Show more', 'See translation', 'ARCHITECTURE', 'for you', 'Apartment']) {
    assert.match(translatePhrase('am', label), /[\u1200-\u137F]/, label);
    assert.equal(translatePhrase('en', label), label);
  }
  assert.equal(translatePhrase('am', 'Yise Tilahun'), 'Yise Tilahun');
  const source = 'Price ETB 42,000; width 2400.5 mm.\n'.repeat(600);
  const chunks = translationChunks(source);
  assert.equal(chunks.join(''), source);
  assert.ok(chunks.every(x=>x.length<=6000));
  let calls=0;
  const run=async (text:string)=>{calls++;return `am:${text}`;};
  const first=await translatedText('Unique post', 'am', run);
  assert.equal(await translatedText('Unique post', 'am', run), first);
  assert.equal(calls,1,'cached reads must not call paid provider again');
  await translatedText('Unique post edited','am',run);
  await translatedText('Unique post','om',run);
  assert.equal(calls,3,'language and source edits invalidate translation');
  await assert.rejects(translatedText('Failed request','am',async()=>undefined));
  assert.equal(await translatedText('Failed request','am',async()=>'ተሳክቷል'), 'ተሳክቷል');
  let active=0,max=0;
  await Promise.all(Array.from({length:8},()=>translationSlot(async()=>{
    max=Math.max(max,++active);
    await new Promise(resolve=>setTimeout(resolve,5));active--;
  })));
  assert.equal(max,2);
  await assert.rejects(translationSlot(async()=>{throw new Error('provider failure');}));
  assert.equal(await translationSlot(async()=>true),true);
  console.log('Amharic feed labels, long posts, cache invalidation, retry and bounded translation requests passed');
}
void main();
