import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { partnerImageProfile, partnerImageSrcSet, partnerVariantPath, validPartnerVariants } from '../src/lib/partnerImageVariants.ts';

const owner='12345678-1234-4234-9234-123456789abc';
const image='abcdefab-1234-4234-9234-123456789abc';
const original=`${owner}/${image}.png`;
const variant=width=>({width,height:Math.round(width/2),bytes:1000,format:'webp',encoding:'lossless',path:partnerVariantPath(owner,image,width)});

test('Partner roles reuse explicit Sharp profiles',()=>{
 assert.equal(partnerImageProfile('logo'),'logo');
 assert.equal(partnerImageProfile('cover'),'poster');
 assert.equal(partnerImageProfile('cover','photo'),'photo');
});

test('private manifest accepts only owned versioned 0–3 variants',()=>{
 assert.deepEqual(validPartnerVariants(owner,original,{original_path:original,source_width:2000,variants:[]}),[]);
 const one=validPartnerVariants(owner,original,{original_path:original,source_width:2000,variants:[variant(480)]});
 assert.deepEqual(one.map(v=>v.width),[480]);
 const three=validPartnerVariants(owner,original,{original_path:original,source_width:2000,variants:[variant(1600),variant(480),variant(960)]});
 assert.deepEqual(three.map(v=>v.width),[480,960,1600]);
 assert.deepEqual(validPartnerVariants(owner,original,{original_path:original,source_width:2000,variants:[{...variant(480),path:`${owner}/other.webp`}]}),[]);
 assert.deepEqual(validPartnerVariants('00000000-0000-4000-8000-000000000000',original,{original_path:original,source_width:2000,variants:[variant(480)]}),[]);
});

test('signed srcSet includes original only as a wide fallback',()=>{
 const urls=new Map([[variant(480).path,'signed-480'],[variant(960).path,'signed-960']]);
 assert.equal(partnerImageSrcSet('signed-original',[],urls,2000),null);
 assert.equal(partnerImageSrcSet('signed-original',[variant(480),variant(960)],urls,2000),'signed-480 480w, signed-960 960w, signed-original 2000w');
 assert.equal(partnerImageSrcSet('signed-original',[variant(480)],new Map(),2000),null);
});

test('PartnerLogo samples browser-selected variant and pages keep existing crop/layout',()=>{
 const logo=readFileSync('src/components/partner/PartnerLogo.tsx','utf8');
 const directory=readFileSync('src/app/partner/page.tsx','utf8');
 const detail=readFileSync('src/app/partner/[slug]/page.tsx','utf8');
 assert.match(logo,/imageRef\.current\?\.currentSrc \|\| src/);
 assert.match(logo,/srcSet=\{srcSet \?\? undefined\}/);
 assert.match(directory,/srcSet=\{partner\.cover_srcset \?\? undefined\}/);
 assert.match(detail,/srcSet=\{partner\.cover_srcset \?\? undefined\}/);
 assert.match(directory,/fit="cover"/);
 assert.match(detail,/fit="cover"/);
});
