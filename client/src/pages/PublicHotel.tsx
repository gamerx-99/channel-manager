import { ArrowRight, ChevronDown, MapPin, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function PublicHotel({ slug }: { slug: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const publicHotel = trpc.channelManager.publicHotel.useQuery(slug);

  if (publicHotel.isLoading) {
    return <div className="public-page"><main className="public-loading">Loading hotel details…</main></div>;
  }

  if (publicHotel.error || !publicHotel.data) {
    return <div className="public-page"><main className="public-loading"><h1>Hotel unavailable</h1><p>This property is not currently published or could not be found.</p><Link className="button public-button" href="/login">Hotel sign in</Link></main></div>;
  }

  const { hotel, roomTypes, media } = publicHotel.data;
  const heroImage = media.find(item => item.is_hero)?.url ?? media[0]?.url;

  return <div className="public-page">
    <header className="public-nav">
      <Link href={`/${hotel.slug}`} className="public-brand"><span className="brand-mark"><span /></span><span>{hotel.name}</span></Link>
      <nav className={menuOpen ? "is-open" : ""}><a href="#stay">Rooms</a><a href="#location">Location</a><a href="#book" className="public-nav-cta">Check dates <ArrowRight size={14} /></a></nav>
      <button className="public-menu" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="เปิดเมนู">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
    </header>
    <main>
      <section className="public-hero">
        {heroImage ? <img src={heroImage} alt={hotel.name} /> : <div className="public-hero-image-fallback" aria-hidden="true" />}
        <div className="public-hero-overlay" />
        <div className="public-hero-content"><div className="eyebrow light">Independent hotel</div><h1>{hotel.name}</h1><p>Explore room types, rates, and availability directly from this hotel.</p><a className="button public-button" href="#stay">View rooms <ArrowRight size={15} /></a></div>
        <div className="public-hero-caption"><span>Thailand</span><span>{hotel.address}</span></div>
      </section>
      <section className="public-intro" id="story"><div className="eyebrow">The hotel</div><div><h2>Stay at<br /><i>{hotel.name}.</i></h2><p>Current property information is published directly by the hotel through its secure Channel Manager dashboard.</p></div></section>
      <section className="public-rooms" id="stay">
        <div className="public-section-heading"><div><div className="eyebrow">Rooms</div><h2>Find your<br /><i>right room.</i></h2></div><p>Live room types and starting rates are managed by this property.</p></div>
        {roomTypes.length ? <div className="public-room-grid">{roomTypes.map((room, index) => <article className="public-room-card" key={room.id}><div className="public-room-image">{media[index + 1]?.url ? <img src={media[index + 1].url} alt={media[index + 1].caption ?? room.name} /> : heroImage ? <img src={heroImage} alt="" /> : <div className="public-room-image-fallback" />}<span>{String(index + 1).padStart(2, "0")}</span></div><div className="public-room-copy"><div><h3>{room.name}</h3><span>Up to {room.capacity} guests · From ฿{Number(room.base_price).toLocaleString()}</span></div><ArrowRight size={17} /></div></article>)}</div> : <div className="public-empty-state">Room details have not been published yet.</div>}
      </section>
      <section className="public-booking" id="book"><div><div className="eyebrow">Your stay</div><h2>Plan your<br /><i>next visit.</i></h2><p>Online checkout is not enabled in this MVP. Contact the property for booking assistance.</p></div><div className="booking-form"><label>Check in<div className="date-field">Select date <ChevronDown size={15} /></div></label><label>Check out<div className="date-field">Select date <ChevronDown size={15} /></div></label><a className="button public-button" href="#location">View location <ArrowRight size={15} /></a></div></section>
      <section className="public-details" id="location"><div><div className="eyebrow">Location</div><h2>Find<br /><i>the hotel.</i></h2></div><div className="location-card"><MapPin size={16} /><div><strong>{hotel.name}</strong><span>{hotel.address}</span></div></div></section>
    </main>
    <footer className="public-footer"><div className="public-brand"><span className="brand-mark"><span /></span><span>{hotel.name}</span></div><span>© {new Date().getFullYear()} {hotel.name}</span><span>Property information is managed securely.</span></footer>
  </div>;
}
