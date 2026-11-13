/** Return a callable Italian number only when the entire field contains one number. */
export function callablePhone(value:string,kind:'landline'|'mobile'|'legacy'){
 if(!value||!/^[+0-9(). -]+$/.test(value))return null;
 const normalized=value.replace(/[^+0-9]/g,'');
 const mobile=/^(?:\+39|0039)?3[0-9]{9}$/;
 const landline=/^(?:\+39|0039)?0[0-9]{5,12}$/;
 if(!(kind==='mobile'?mobile:kind==='landline'?landline:new RegExp(`(?:${mobile.source})|(?:${landline.source})`)).test(normalized))return null;
 return normalized.startsWith('0039')?`+39${normalized.slice(4)}`:normalized;
}
export function whatsappPhone(value:string){const phone=callablePhone(value,'mobile');if(!phone)return null;return `https://wa.me/${phone.startsWith('+39')?phone.slice(1):`39${phone}`}`;}
