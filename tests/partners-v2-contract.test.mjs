import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {callablePhone,whatsappPhone} from '../src/lib/partnerPhones.ts';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const expected=['Ristorazione','Sport','Benessere','Abbigliamento','Gioielleria','Tecnologia e Telefonia','Casa e Design','Salute','Automotive','Turismo','Servizi','Professionisti','Altro'];

test('Italian phone actions reject compound or malformed values',()=>{
 assert.equal(callablePhone('011 1234567','landline'),'0111234567');
 assert.equal(callablePhone('+39 011 1234567','landline'),'+390111234567');
 assert.equal(callablePhone('333 1234567','mobile'),'3331234567');
 assert.equal(callablePhone('0039 333 1234567','mobile'),'+393331234567');
 assert.equal(whatsappPhone('333 1234567'),'https://wa.me/393331234567');
 assert.equal(whatsappPhone('+39 333 1234567'),'https://wa.me/393331234567');
 assert.equal(callablePhone('011 1234567 / 333 1234567','legacy'),null);
 assert.equal(callablePhone('011 1234567; 333 1234567','legacy'),null);
 assert.equal(callablePhone('call me','legacy'),null);
 assert.equal(whatsappPhone('011 1234567'),null);
});

test('Partner categories match the additive DB constraint exactly',async()=>{
 const [source,migration]=await Promise.all([read('src/lib/partners.ts'),read('supabase/migrations/20261113125539_partner_v2_locations_categories.sql')]);
 const ts=source.match(/export const categories=\[([^\]]+)\] as const/)?.[1].match(/'([^']+)'/g)?.map(x=>x.slice(1,-1));
 const db=migration.match(/add constraint movi_partners_category_check check \(category in \(([\s\S]*?)\)\)/)?.[1].match(/'([^']+)'/g)?.map(x=>x.slice(1,-1));
 assert.deepEqual(ts,expected);assert.deepEqual(db,expected);
 assert.doesNotMatch(migration,/update\s+public\.movi_partners\s+set\s+category/i);
});

test('location writes are atomic and inaccessible to browser roles',async()=>{
 const [migration,create,update]=await Promise.all([read('supabase/migrations/20261113125539_partner_v2_locations_categories.sql'),read('src/app/api/admin/partners/route.ts'),read('src/app/api/admin/partners/[id]/route.ts')]);
 assert.match(migration,/slot in \(1,2\)/);assert.match(migration,/unique \(partner_id,slot\)/);
 assert.match(migration,/enable row level security/);assert.match(migration,/revoke all on public\.partner_locations from public,anon,authenticated/);
 assert.match(migration,/revoke all on function public\.movi_partner_save.*from public,anon,authenticated/);
 assert.match(migration,/where id=p_id and updated_at=p_expected_updated_at/);
 assert.match(create,/rpc\('movi_partner_save'/);assert.match(update,/rpc\('movi_partner_save'/);
 assert.match(migration,/insert into public\.partner_locations\(partner_id,slot,address,locality\)/);
 assert.doesNotMatch(migration,/insert into public\.partner_locations\(partner_id,slot,address,locality,landline_phone/);
});

test('Partner public display keeps safe legacy fallback and correct media geometry',async()=>{
 const [detail,css,editor,directory]=await Promise.all([read('src/app/partner/[slug]/page.tsx'),read('src/app/partner/[slug]/PartnerDetail.module.css'),read('src/app/admin/partners/PartnerEditor.tsx'),read('src/app/partner/page.tsx')]);
 assert.match(detail,/partner\.locations\.length \? partner\.locations/);
 assert.match(detail,/callablePhone\(legacyPhone,'legacy'\)/);
 assert.match(detail,/whatsappPhone\(location\.mobile_phone\)/);
 assert.match(css,/\.heroMedia>div\{width:100%;max-height:none/);
 assert.match(detail,/PartnerLogo src=\{partner\.logo_url\}/);
 assert.match(css,/\.logoHero\{border:0;box-shadow:none\}/);
 assert.match(editor,/1600×900 px \(16:9\), minimo 1200×675 px/);
 assert.match(editor,/Aggiungi seconda sede/);
 assert.match(directory,/const availableCategories = categories/);
});
