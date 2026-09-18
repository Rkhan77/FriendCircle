import {
  ArrowRight,
  ArrowUpRight,
  Coffee,
  Heart,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { appHref } from "@/lib/paths";

export default function Home() {
  return (
    <main className="home-screen">
      <header className="home-header">
        <a className="home-brand" href={appHref("/")} aria-label="FriendCircle home">
          <span className="home-brand-mark" aria-hidden="true"><i /><i /></span>
          <span>friend<span>circle</span></span>
        </a>
        <span className="home-header-line">Good people. Close by.</span>
        <nav className="home-account" aria-label="Account">
          <a className="home-login" href={appHref("/auth")}>Log in</a>
          <a className="home-signup" href={appHref("/auth")}>Sign up <ArrowUpRight size={17} /></a>
        </nav>
      </header>

      <section className="home-main" aria-labelledby="home-title">
        <div className="home-copy">
          <div className="home-kicker"><span className="home-kicker-icon"><Sparkles size={15} /></span> THE OUTSIDE IS CALLING <span className="home-kicker-star">✳</span></div>
          <h1 id="home-title">Less scrolling.<br /><em>More showing up.</em></h1>
          <p className="home-lede">Find your people nearby, make a plan and meet face to face. The best part of your circle happens in real life.</p>
          <div className="home-actions">
            <a className="home-primary" href={appHref("/auth")}>Join your circle <ArrowRight size={20} /></a>
            <a className="home-secondary" href={appHref("/app")}>Explore the demo <ArrowUpRight size={17} /></a>
          </div>
          <div className="home-promise"><ShieldCheck size={17} /> Friends appear by suburb, never by exact location.</div>
        </div>

        <div className="home-scene" aria-label="Illustration of friends making a real-life plan" role="img">
          <span className="home-scene-ray home-ray-one" />
          <span className="home-scene-ray home-ray-two" />
          <div className="home-scene-ring" />
          <div className="home-scene-disc" />
          <div className="home-friend home-friend-one"><span className="home-face"><i /><i /></span><span className="home-shirt" /></div>
          <div className="home-friend home-friend-two"><span className="home-face"><i /><i /></span><span className="home-shirt" /></div>
          <div className="home-coffee"><Coffee size={38} strokeWidth={2.2} /></div>
          <div className="home-scene-sticker home-sticker-top"><MapPin size={15} /> SAME SUBURB</div>
          <div className="home-scene-sticker home-sticker-side">IRL<br />&gt; URL <Heart size={16} fill="currentColor" /></div>
          <div className="home-scene-ticket"><span className="home-ticket-avatars"><i>A</i><i>J</i></span><span><strong>Catch up confirmed</strong><small>See you out there ✨</small></span><span className="home-ticket-check">✓</span></div>
        </div>
      </section>

      <section className="home-flow" aria-label="How FriendCircle works">
        <div className="home-flow-intro"><span>THE WHOLE IDEA</span><strong>Online to make plans.<br />Offline to make memories.</strong></div>
        <div className="home-flow-item"><span className="home-flow-icon"><UsersRound size={20} /></span><span><strong>Find your people</strong><small>Friends & shared interests nearby</small></span></div>
        <div className="home-flow-item"><span className="home-flow-icon"><MessageCircle size={20} /></span><span><strong>Make a plan</strong><small>Send the invite, then show up</small></span></div>
        <div className="home-flow-item"><span className="home-flow-icon"><Coffee size={20} /></span><span><strong>Meet for real</strong><small>Meals, moments & social credits</small></span></div>
      </section>
      <div className="home-preview-note">Demo uses fictional people and offers. Live actions need the local app.</div>
    </main>
  );
}
