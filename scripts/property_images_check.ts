import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { propertyImage, propertyImageLabel } from '../src/lib/property/sample-images';
const id = (key: string) => createHash('md5').update('medosha:property-demo:' + key).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
const sample = {id: id('property:DEMO-001'), cover_image_url: '/images/projects/residential.svg', is_sample: true};
assert.equal(propertyImage(sample), '/images/property_samples/condominium.webp');
assert.equal(propertyImage({...sample, is_sample: false}), sample.cover_image_url);
assert.equal(propertyImage({...sample, id: 'real-user-property'}), sample.cover_image_url);
assert.equal(propertyImage({...sample, cover_image_url: '/uploads/owner.webp'}), '/uploads/owner.webp');
assert.equal(propertyImage({...sample, cover_image_url: 'https://storage.example/photo.jpg'}), 'https://storage.example/photo.jpg');
assert.equal(propertyImage({...sample, cover_image_url: null}), '/images/property_samples/condominium.webp');
assert.equal(propertyImage({...sample, id: id('rental:RENT-DEMO-001')}), '/images/property_samples/stock_apartment_1.webp');
const urls = new Set<string>();
for (const [prefix, count] of [['property:DEMO-', 50], ['rental:RENT-DEMO-', 100]] as const) {
  for(let i=1;i<=count;i++) {
    const url = propertyImage({id:id(prefix + String(i).padStart(3,'0')), cover_image_url: null});
    assert.ok(url, `No cover for ${prefix}${i}`);
    assert.ok(existsSync('public'+url), `Missing ${url}`);
    assert.ok(propertyImageLabel(url)?.includes('illustration'));
    urls.add(url);
  }
}
assert.equal(urls.size, 11);
assert.equal(propertyImageLabel('/uploads/owner.webp'), null);
assert.equal(propertyImageLabel('/images/property_samples/villa.webp'), 'Sample · AI illustration');
assert.equal(propertyImageLabel('/images/property_samples/stock_apartment_1.webp'), 'Sample · Stock illustration');
for(const file of ['property-card.tsx','hover-card.tsx','property-panel.tsx']) {
 const source=readFileSync('src/components/property/'+file,'utf8');
 assert.match(source,/propertyImage\((property|summary)\)/);
 assert.match(source,/<PropertyImageNote src=/);
}
console.log('150 sample covers, 11 assets, image labels and owner-photo preservation passed');
