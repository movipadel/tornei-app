import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContent, safeCta, videoUrl, romeToUtc, romeInput, visible, pageBounds, ownedPath, imageExtension } from '../../src/lib/padelleria.ts';
const base={kind:'succede',status:'draft',title:'Test',excerpt:'',body:'<script>alert(1)</script>',featured:false,sort_order:0,cta_label:null,cta_url:null,occurred_at:null,visible_from:null,visible_until:null};
test('lifecycle, fields and archive constraints',()=>{
  assert.equal(parseContent(base).body,base.body);
  for(const change of [{title:''},{status:'other'},{kind:'other'},{sort_order:1.5},{featured:'true'},{cta_label:'Vai'},{visible_from:'2027-01-06'},{kind:'e_successo',visible_until:'2027-01-06T00:00:00Z'},{visible_from:'2027-01-07T00:00:00Z',visible_until:'2027-01-06T00:00:00Z'}])assert.throws(()=>parseContent({...base,...change}));
});
test('visibility inclusive boundary, dates optional and archive',()=>{
  const now=Date.parse('2027-01-06T22:59:59Z');
  assert.equal(visible(base,now),false);
  assert.equal(visible({...base,status:'published'},now),true);
  const item={...base,status:'published',visible_until:'2027-01-06T22:59:59Z'};
  assert.equal(visible(item,now),true);assert.equal(visible(item,now+1),false);
  assert.equal(visible({...item,visible_from:'2027-01-07T00:00:00Z'},now),false);
  assert.equal(visible({...base,kind:'e_successo',status:'published'},now),true);
});
test('Europe/Rome independent of host timezone, DST ambiguity rejected',()=>{
  assert.equal(romeToUtc('2027-01-06T23:59:59'),'2027-01-06T22:59:59.000Z');
  assert.equal(romeToUtc('2026-07-06T12:00'),'2026-07-06T10:00:00.000Z');
  assert.equal(romeInput('2027-01-06T22:59:59Z'),'2027-01-06T23:59:59');
  assert.throws(()=>romeToUtc('2026-03-29T02:30'));assert.throws(()=>romeToUtc('2026-10-25T02:30'));assert.throws(()=>romeToUtc('2026-02-30T12:00'));
});
test('CTA and video allowlist, no arbitrary server fetch target',()=>{
  for(const u of ['javascript:alert(1)','//evil.test','/\\evil.test','https://user:pass@host.test',' /tornei'])assert.equal(safeCta(u),false);
  assert.equal(safeCta('/tornei'),true);assert.equal(safeCta('https://example.invalid/test'),true);
  assert.equal(videoUrl('https://youtu.be/dQw4w9WgXcQ'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(videoUrl('https://vimeo.com/123456'),'https://vimeo.com/123456');
  for(const u of ['http://localhost:55021','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','file:///secret','https://example.com/video.mp4'])assert.throws(()=>videoUrl(u));
});
test('bounds and owned paths',()=>{
  assert.deepEqual(pageBounds(new URLSearchParams()),{limit:12,offset:0});
  for(const p of ['limit=100','limit=0','offset=-1','limit=nan'])assert.throws(()=>pageBounds(new URLSearchParams(p)));
  const id='11111111-1111-4111-8111-111111111111';
  assert.equal(ownedPath(id,`${id}/22222222-2222-4222-8222-222222222222.png`),true);
  assert.equal(ownedPath(id,'../other.png'),false);assert.equal(ownedPath(id,`other/${id}.png`),false);
});
test('MIME agrees with signature and max size',()=>{
  assert.equal(imageExtension(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'),'png');
  assert.throws(()=>imageExtension(new TextEncoder().encode('<svg/>'),'image/png'));
  assert.throws(()=>imageExtension(new Uint8Array([255,216,255]),'image/svg+xml'));
  assert.throws(()=>imageExtension(new Uint8Array(5*1024*1024+1),'image/png'));
});
