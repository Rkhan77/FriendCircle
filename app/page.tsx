import {
  ArrowRight,
  ArrowUpRight,
  Coffee,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Store,
  UsersRound,
} from "lucide-react";
import { appHref } from "@/lib/paths";
import BrandLogo from "@/components/BrandLogo";

export default function Home() {
  return (
    <main className="home-screen">
      <header className="home-header">
        <BrandLogo className="home-brand" href={appHref("/")} />
        <span className="home-header-line">Good people. Close by.</span>
        <nav className="home-account" aria-label="Account">
          <a className="home-login" href={appHref("/auth")}>Log in</a>
          <a className="home-signup" href={appHref("/auth")}>Sign up <ArrowUpRight size={17} /></a>
        </nav>
      </header>

      <section className="home-main" aria-labelledby="home-title">
        <div className="home-copy">
          <div className="home-kicker"><span className="home-kicker-icon"><Sparkles size={15} /></span> THE OUTSIDE IS CALLING <span className="home-kicker-star">✳</span></div>
          <h1 id="home-title">No scrolling.<br /><em>More showing up.</em></h1>
          <p className="home-lede">See who&apos;s in your suburb, make a plan and meet face to face. Bring the crew to a nearby meal and unlock a bigger group discount.</p>
          <div className="home-actions">
            <a className="home-primary" href={appHref("/auth")}>Join your circle <ArrowRight size={20} /></a>
            <a className="home-secondary" href={appHref("/app")}>Explore the demo <ArrowUpRight size={17} /></a>
          </div>
          <div className="home-promise"><ShieldCheck size={17} /> Friends appear by suburb, never by exact location.</div>
        </div>

        <div className="home-scene" aria-label="Illustration of the suburb map, friend presence and group meal offers" role="img">
          <div className="home-map-window">
            <div className="home-map-top"><span><span className="home-map-live" /> Nearby map</span><small>SUBURB VIEW</small></div>
            <div className="home-map-canvas">
              <span className="home-map-road home-road-one" /><span className="home-map-road home-road-two" /><span className="home-map-road home-road-three" />
              <span className="home-map-green home-green-one" /><span className="home-map-green home-green-two" />
              <span className="home-map-zone"><b>Kewdale</b></span>
              <span className="home-map-friends"><UsersRound size={17} /><b>Friends in your suburb</b></span>
              <span className="home-map-store"><Store size={19} /></span>
              <span className="home-map-you"><i /> You&apos;re here</span>
            </div>
            <div className="home-map-bottom"><span><MapPin size={15} /> Catch up · 5 km</span><strong>Deals worth getting together for</strong></div>
          </div>
          <div className="home-scene-sticker home-sticker-top"><MapPin size={15} /> YOUR CIRCLE, NEARBY</div>
          <div className="home-meal-card"><div className="home-meal-title"><span><Coffee size={18} /></span><strong>More friends. More off.</strong></div><div className="home-meal-tiers"><span><b>2 people</b><strong>10%</strong></span><span><b>3 people</b><strong>15%</strong></span><span><b>4+ people</b><strong>20%</strong></span></div><small>Example tiers at participating restaurants</small></div>
        </div>
      </section>

      <section className="home-flow" aria-label="How FriendCircle works">
        <div className="home-flow-intro"><span>THE WHOLE IDEA</span><strong>Online to make plans.<br />Offline to make memories.</strong></div>
        <div className="home-flow-item"><span className="home-flow-icon"><UsersRound size={20} /></span><span><strong>Find your people</strong><small>Friends & shared interests nearby</small></span></div>
        <div className="home-flow-item"><span className="home-flow-icon"><MessageCircle size={20} /></span><span><strong>Make a plan</strong><small>Send the invite, then show up</small></span></div>
        <div className="home-flow-item"><span className="home-flow-icon"><Coffee size={20} /></span><span><strong>More friends, more off</strong><small>Bigger group, bigger discount</small></span></div>
      </section>
      <div className="home-preview-note">Demo uses fictional people and offers. Live actions need the local app.</div>
    </main>
  );
}
