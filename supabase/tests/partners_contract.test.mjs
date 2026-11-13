import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// Resolve the extensionless browser import when executing TypeScript directly in Node.
registerHooks({resolve(s,c,next){return next(c.parentURL?.endsWith('/partners.ts')&&['./padelleria','./partnerPhones'].includes(s)?`${s}.ts`:s,c);}});
const {parsePartner,slugify,partnerVisible,contactCtaLabel}=await import('../../src/lib/partners.ts');
const {romeToUtc,romeInput}=await import('../../src/lib/padelleria.ts');
const base={status:'active',name:'MÀSE Demo',slug:'mase-demo',category:'Ristorazione',short_description:'',full_description:'<script>text only</script>',benefit_title:'10%',benefit_description:'',conditions:'',website_url:null,contact_url:null,phone:'',address:'',locality:'',valid_from:null,valid_until:null,sort_order:0,featured:false};
test('partner fields, slug and category contract',()=>{assert.equal(slugify(' MÀSE & Demo '),'mase-demo');assert.equal(parsePartner(base).full_description,base.full_description);for(const v of [{name:''},{slug:'../bad'},{category:'arbitrary'},{status:'published'},{benefit_title:''},{sort_order:1.5},{phone:'javascript:bad'},{website_url:'javascript:alert(1)'},{contact_url:'https://user:pass@example.com'},{valid_from:'2027-01-01'}])assert.throws(()=>parsePartner({...base,...v}));});
test('eligibility matrix and inclusive millisecond boundaries',()=>{const now=Date.parse('2027-01-06T22:59:59Z');assert.ok(partnerVisible(base,now));for(const v of [{status:'draft'},{status:'inactive'},{deleted_at:'2026-01-01T00:00:00Z'},{valid_from:'2027-01-07T00:00:00Z'},{valid_until:'2027-01-05T00:00:00Z'}])assert.equal(partnerVisible({...base,...v},now),false);const p={...base,valid_from:new Date(now).toISOString(),valid_until:new Date(now).toISOString()};assert.ok(partnerVisible(p,now));assert.equal(partnerVisible(p,now-1),false);assert.equal(partnerVisible(p,now+1),false);assert.throws(()=>parsePartner({...p,valid_until:'2026-01-01T00:00:00Z'}));});
test('Rome winter summer and DST',()=>{assert.equal(romeToUtc('2027-01-06T23:59:59'),'2027-01-06T22:59:59.000Z');assert.equal(romeInput('2027-07-01T10:00:00Z'),'2027-07-01T12:00:00');assert.throws(()=>romeToUtc('2026-03-29T02:30:00'));assert.throws(()=>romeToUtc('2026-10-25T02:30:00'));});
test('Partner social links and contact CTA preserve legacy payloads',()=>{
 const legacy=parsePartner(base);
 assert.equal(legacy.instagram_url,null);assert.equal(legacy.facebook_url,null);assert.equal(legacy.contact_label,null);
 assert.equal(contactCtaLabel('https://example.com',legacy.contact_label),'Contatta');
 assert.equal(contactCtaLabel('https://example.com','Prenota ora'),'Prenota ora');
 assert.equal(contactCtaLabel(null,'Prenota ora'),null);
 const updated=parsePartner({...base,instagram_url:' https://www.instagram.com/movi/ ',facebook_url:'https://www.facebook.com/movi/',contact_url:'https://example.com/contact',contact_label:' Prenota ora '});
 assert.equal(updated.instagram_url,'https://www.instagram.com/movi/');assert.equal(updated.facebook_url,'https://www.facebook.com/movi/');assert.equal(updated.contact_label,'Prenota ora');
 assert.equal(parsePartner({...base,instagram_url:'',facebook_url:' ',contact_label:'  '}).contact_label,null);
 for(const value of ['http://www.instagram.com/movi','javascript:alert(1)','data:text/html,bad','https://user:pass@instagram.com/movi','/contact']){
  assert.throws(()=>parsePartner({...base,instagram_url:value}));assert.throws(()=>parsePartner({...base,facebook_url:value}));
 }
 for(const value of ['<b>Prenota</b>','A'.repeat(61),'Prenota\nora',42])assert.throws(()=>parsePartner({...base,contact_label:value}));
});
