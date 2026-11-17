import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { IMAGE_PROFILES, MAX_IMAGE_BYTES, imageProfileForPadelleriaRole, processPadelleriaImage } from '../../src/lib/padelleriaImageVariants.ts';

test('Padelleria role selects an internal compression profile', () => {
  assert.equal(imageProfileForPadelleriaRole('cover'),'poster');
  assert.equal(imageProfileForPadelleriaRole('gallery'),'photo');
  assert.throws(()=>imageProfileForPadelleriaRole('video'));
});

test('JPEG keeps original bytes, orientation and proportional private variants', async () => {
  const input=readFileSync('public/home/padel-court.jpg');
  const original=Buffer.from(input),before=process.memoryUsage().rss,start=performance.now();
  const result=await processPadelleriaImage(input,'image/jpeg');
  assert.deepEqual(input,original);
  assert.equal(result.sha256,createHash('sha256').update(original).digest('hex'));
  assert.equal(result.sourceBytes,input.length);
  assert.equal(result.profile,'photo');
  assert.deepEqual(result.variants.map(v=>v.width),[480,720]);
  for(const variant of result.variants){
    assert.equal(variant.format,'webp');assert.equal(variant.encoding,'lossy');
    assert.equal(variant.bytes,variant.buffer.length);
    assert.ok(variant.height>0 && variant.width<=result.sourceWidth);
    assert.equal((await sharp(variant.buffer).metadata()).exif,undefined);
  }
  console.log(`JPEG probe: ${input.length} -> ${result.variants.map(v=>v.bytes).join('/')} bytes; ${Math.round(performance.now()-start)} ms; RSS delta ${Math.round((process.memoryUsage().rss-before)/1024/1024)} MiB`);
});

test('PNG logo preserves alpha and chooses lossless WebP', async () => {
  const input=readFileSync('public/branding/movi-padelleria.png');
  const result=await processPadelleriaImage(input,'image/png',{profile:'logo'});
  assert.deepEqual(result.variants.map(v=>v.width),[480,960,1600]);
  for(const variant of result.variants){
    const metadata=await sharp(variant.buffer).metadata();
    assert.equal(metadata.hasAlpha,true);
    assert.equal(metadata.exif,undefined);
    assert.equal(variant.encoding,'lossless');
  }
  console.log(`PNG logo probe: ${input.length} -> ${result.variants.map(v=>v.bytes).join('/')} bytes`);
});

test('opaque PNG poster uses quality 90, while gallery photos use quality 82', async () => {
  const input=await sharp(readFileSync('public/home/padel-court.jpg')).png().toBuffer();
  const original=Buffer.from(input);
  const poster=await processPadelleriaImage(input,'image/png',{profile:'poster'});
  const photo=await processPadelleriaImage(input,'image/png',{profile:'photo'});
  assert.deepEqual(input,original);
  assert.equal(IMAGE_PROFILES.poster.quality,90);
  assert.equal(IMAGE_PROFILES.photo.quality,82);
  assert.equal(poster.profile,'poster');
  assert.equal(photo.profile,'photo');
  assert.ok(poster.variants.length>0);
  assert.deepEqual(poster.variants.map(v=>v.width),photo.variants.map(v=>v.width));
  assert.ok(poster.variants.every(v=>v.encoding==='lossy'));
  assert.ok(photo.variants.every(v=>v.encoding==='lossy'));
  assert.ok(poster.variants.some((v,i)=>v.bytes>photo.variants[i].bytes));
  assert.ok(poster.variants.every(v=>v.bytes<input.length));
});

test('transparent image stays lossless even in photo or poster context', async () => {
  const input=readFileSync('public/branding/movi-padelleria.png');
  for(const profile of ['photo','poster']){
    const result=await processPadelleriaImage(input,'image/png',{profile});
    assert.ok(result.variants.every(v=>v.encoding==='lossless'));
    assert.ok((await sharp(result.variants[0].buffer).metadata()).hasAlpha);
  }
});

test('explicit logo profile stays lossless without an alpha channel', async () => {
  const input=readFileSync('public/home/padel-court.jpg');
  const result=await processPadelleriaImage(input,'image/jpeg',{profile:'logo',encoding:'auto'});
  assert.deepEqual(result.variants,[]);
  assert.equal(result.sourceBytes,input.length);
  assert.equal(result.sha256,createHash('sha256').update(input).digest('hex'));
});

test('already optimized original keeps an empty manifest and exactly one useful variant is retained',async()=>{
  const source=readFileSync('public/home/padel-court.jpg');
  const optimized=await processPadelleriaImage(source,'image/jpeg',{profile:'logo'});
  assert.deepEqual(optimized.variants,[]);
  const smallPng=await sharp(source).resize(400).png().toBuffer();
  const one=await processPadelleriaImage(smallPng,'image/png',{profile:'photo'});
  assert.deepEqual(one.variants.map(v=>v.width),[400]);
  assert.ok(one.variants[0].bytes<smallPng.length);
  const three=await processPadelleriaImage(readFileSync('public/branding/movi-padelleria.png'),'image/png',{profile:'logo'});
  assert.deepEqual(three.variants.map(v=>v.width),[480,960,1600]);
  assert.ok(three.variants.every(v=>v.bytes<three.sourceBytes));
});

test('EXIF orientation is applied, metadata removed and small images never enlarged', async () => {
  const rotated=await sharp({create:{width:120,height:60,channels:3,background:'#2776bb'}})
    .jpeg().withMetadata({orientation:6}).toBuffer();
  const result=await processPadelleriaImage(rotated,'image/jpeg');
  assert.equal(result.variants.length,1);
  assert.equal(result.variants[0].width,60);
  assert.equal(result.variants[0].height,120);
  const metadata=await sharp(result.variants[0].buffer).metadata();
  assert.equal(metadata.orientation,undefined);
  assert.equal(metadata.exif,undefined);
});

test('spoofed, malformed, oversized, unsupported and excessive-pixel inputs fail', async () => {
  await assert.rejects(processPadelleriaImage(Buffer.from('<svg/>'),'image/svg+xml'));
  await assert.rejects(processPadelleriaImage(Buffer.from([137,80,78,71,13,10,26,10,1,2,3]),'image/png'));
  await assert.rejects(processPadelleriaImage(readFileSync('public/home/padel-court.jpg'),'image/png'));
  await assert.rejects(processPadelleriaImage(Buffer.alloc(MAX_IMAGE_BYTES+1),'image/png'));
  const huge=await sharp({create:{width:5000,height:5000,channels:3,background:'#ffffff'}}).jpeg().toBuffer();
  await assert.rejects(processPadelleriaImage(huge,'image/jpeg'));
  await assert.rejects(processPadelleriaImage(readFileSync('public/home/padel-court.jpg'),'image/jpeg',{quality:0}));
  await assert.rejects(processPadelleriaImage(readFileSync('public/home/padel-court.jpg'),'image/jpeg',{profile:'invalid'}));
});

test('aborted processing creates no variant result', async () => {
  const controller=new AbortController();controller.abort();
  await assert.rejects(processPadelleriaImage(readFileSync('public/home/padel-court.jpg'),'image/jpeg',{signal:controller.signal}),/interrotta/);
});
