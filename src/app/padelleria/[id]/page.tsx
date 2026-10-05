import { ArrowLeft, CalendarDays, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MediaFrame, publicStyles } from '@/components/public/PublicPrimitives';
import { safeCta, videoEmbed, type ContentMedia } from '@/lib/padelleria';
import { publicContentDetail } from '@/lib/padelleriaServer';
import styles from './PadelleriaDetail.module.css';

export const dynamic='force-dynamic';
export const revalidate=0;

function formatDate(value:string|null) {
  if(!value)return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',day:'numeric',month:'long',year:'numeric'}).format(date):null;
}

function embeds(media:ContentMedia[]) {
  return media.filter(item=>item.media_type==='video'&&item.external_url).flatMap(item=>{
    try{return [{...item,embedUrl:videoEmbed(item.external_url as string)}];}catch{return [];}
  });
}

export default async function PadelleriaDetailPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const item=await publicContentDetail(id);
  if(!item)notFound();
  const cover=item.media.find(media=>media.media_type==='image'&&media.role==='cover'&&media.url);
  const gallery=item.media.filter(media=>media.media_type==='image'&&media.role==='gallery'&&media.url);
  const videos=embeds(item.media);
  const date=formatDate(item.occurred_at??item.published_at);
  const cta=item.cta_label&&item.cta_url&&safeCta(item.cta_url)?{label:item.cta_label,url:item.cta_url}:null;
  const external=Boolean(cta?.url.startsWith('https://'));

  return <main className={styles.page}><article className={styles.article} aria-labelledby="padelleria-detail-title">
    <Link className={styles.back} href="/padelleria"><ArrowLeft size={18} aria-hidden />Torna alla Padelleria</Link>
    {cover?.url?<div className={styles.cover}><MediaFrame src={cover.url} alt={cover.caption||item.title} /></div>:null}
    <header className={styles.header}>
      <div className={styles.meta}><span>{item.kind==='succede'?'Succede':'È successo'}</span>{date?<span><CalendarDays size={15} aria-hidden />{date}</span>:null}</div>
      <h1 id="padelleria-detail-title">{item.title}</h1>
      {item.excerpt?<p className={styles.excerpt}>{item.excerpt}</p>:null}
    </header>
    {item.body?<div className={styles.body}>{item.body}</div>:null}
    {gallery.length?<section className={styles.section} aria-labelledby="padelleria-gallery-title"><h2 id="padelleria-gallery-title">Gallery</h2><div className={styles.gallery}>{gallery.map((media,index)=><figure key={media.id}><MediaFrame src={media.url??undefined} alt={media.caption||`Immagine ${index+1} di ${item.title}`} />{media.caption?<figcaption>{media.caption}</figcaption>:null}</figure>)}</div></section>:null}
    {videos.length?<section className={styles.section} aria-labelledby="padelleria-video-title"><h2 id="padelleria-video-title">Video</h2><div className={styles.videos}>{videos.map((video,index)=><figure key={video.id}><div className={styles.videoFrame}><iframe src={video.embedUrl} title={video.caption||`Video ${index+1} di ${item.title}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>{video.caption?<figcaption>{video.caption}</figcaption>:null}</figure>)}</div></section>:null}
    {cta?<div className={styles.cta}>{external?<a className={`${publicStyles.button} ${publicStyles.primary}`} href={cta.url} target="_blank" rel="noopener noreferrer">{cta.label}<ExternalLink size={17} aria-hidden /></a>:<Link className={`${publicStyles.button} ${publicStyles.primary}`} href={cta.url}>{cta.label}</Link>}</div>:null}
  </article></main>;
}
