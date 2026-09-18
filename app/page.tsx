import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  HeartHandshake,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Store,
  UsersRound,
} from "lucide-react";
import { appHref } from "@/lib/paths";

const features = [
  {
    icon: <MapPin size={23} strokeWidth={1.8} />,
    title: "Find your local circle",
    detail: "See who is in your suburb without sharing anyone's exact location.",
    tone: "peach",
  },
  {
    icon: <Sparkles size={23} strokeWidth={1.8} />,
    title: "Meet people like you",
    detail: "Discover public profiles nearby through shared hobbies, food and interests.",
    tone: "mint",
  },
  {
    icon: <MessageCircle size={23} strokeWidth={1.8} />,
    title: "Start a conversation",
    detail: "Send a chat request. Once accepted, you can talk and plan a real catch up.",
    tone: "lavender",
  },
  {
    icon: <HeartHandshake size={23} strokeWidth={1.8} />,
    title: "Make time together count",
    detail: "Time spent together earns chat characters and social credits in the app.",
    tone: "butter",
  },
  {
    icon: <Store size={23} strokeWidth={1.8} />,
    title: "Catch up over a meal",
    detail: "Explore nearby restaurant offers and invite friends. Group discounts grow with your table.",
    tone: "mint",
  },
  {
    icon: <ShieldCheck size={23} strokeWidth={1.8} />,
    title: "Share on your terms",
    detail: "Choose a public or private profile, add a photo and make your circle your own.",
    tone: "peach",
  },
];

export default function Home() {
  return (
    <main className="landing">
      <header className="landing-header">
        <a className="landing-logo" href={appHref("/")} aria-label="FriendCircle home">
          <span className="landing-logo-mark" aria-hidden="true"><i /><i /></span>
          <span>friend<span>circle</span></span>
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">What you can do</a>
        </nav>
        <div className="landing-header-actions">
          <a className="landing-login" href={appHref("/auth")}>Log in</a>
          <a className="landing-button landing-button-small" href={appHref("/auth")}>Sign up <ArrowUpRight size={17} /></a>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span className="landing-eyebrow-dot" /> A little closer, in real life</div>
          <h1 id="landing-title">Your people are <em>closer</em> than you think.</h1>
          <p>Meet friends and like-minded people in your neighbourhood. Turn a nearby hello into a conversation, a catch up and a circle that grows with you.</p>
          <div className="landing-hero-actions">
            <a className="landing-button" href={appHref("/auth")}>Sign up or log in <ArrowRight size={19} /></a>
            <a className="landing-demo-link" href={appHref("/app")}>Explore the demo <ArrowUpRight size={17} /></a>
          </div>
          <div className="landing-trust"><span className="landing-trust-icon"><ShieldCheck size={17} /></span> Your friends' exact locations stay private</div>
        </div>

        <div className="landing-hero-art" aria-label="Illustration of a local suburb and nearby friends" role="img">
          <div className="landing-orbit landing-orbit-one" />
          <div className="landing-orbit landing-orbit-two" />
          <div className="landing-map-card">
            <div className="landing-map-head"><span><span className="landing-map-live" /> Your local circle</span><span className="landing-map-menu">•••</span></div>
            <div className="landing-map-canvas">
              <div className="landing-map-road landing-road-one" />
              <div className="landing-map-road landing-road-two" />
              <div className="landing-map-road landing-road-three" />
              <div className="landing-map-park landing-park-one" />
              <div className="landing-map-park landing-park-two" />
              <div className="landing-neighbourhood"><span>Kewdale</span></div>
              <div className="landing-map-pin landing-pin-one"><UsersRound size={20} /><span>Friends nearby</span></div>
              <div className="landing-map-pin landing-pin-two"><Store size={17} /></div>
              <div className="landing-map-you"><span /> You&apos;re here</div>
            </div>
            <div className="landing-map-footer"><span><MapPin size={15} /> Your suburb</span><strong>Good things happen nearby</strong></div>
          </div>
          <div className="landing-floating landing-floating-friends"><span className="landing-floating-icon"><Bell size={17} /></span><span><strong>Friends in your area</strong><small>Time to say hello?</small></span></div>
          <div className="landing-floating landing-floating-meet"><span className="landing-avatars"><i>J</i><i>A</i><i>M</i></span><span><strong>Better together</strong><small>Make a moment of it</small></span></div>
          <div className="landing-spark landing-spark-one">✳</div>
          <div className="landing-spark landing-spark-two">✳</div>
        </div>
      </section>

      <section className="landing-how" id="how-it-works">
        <div className="landing-section-intro"><span className="landing-kicker">HOW IT WORKS</span><h2>From nearby to <em>know you.</em></h2><p>FriendCircle makes it easier to find each other, make a plan and spend more time together.</p></div>
        <div className="landing-steps">
          <div><span className="landing-step-number">01</span><h3>Find your people</h3><p>See friends in your suburb and discover public profiles that share your interests.</p></div>
          <div><span className="landing-step-number">02</span><h3>Say hello</h3><p>Start a chat, invite a friend to a meal or arrange your next catch up.</p></div>
          <div><span className="landing-step-number">03</span><h3>Make a memory</h3><p>Meet in person, earn social credits and unlock more ways to connect.</p></div>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-section-intro"><span className="landing-kicker">MADE FOR REAL CONNECTION</span><h2>A little more <em>together.</em></h2><p>Everything you need to turn the people around you into a circle that feels like yours.</p></div>
        <div className="landing-feature-grid">{features.map((feature) => <article className="landing-feature" key={feature.title}><span className={`landing-feature-icon ${feature.tone}`}>{feature.icon}</span><h3>{feature.title}</h3><p>{feature.detail}</p></article>)}</div>
      </section>

      <section className="landing-cta"><div className="landing-cta-copy"><span className="landing-kicker">YOUR CIRCLE STARTS HERE</span><h2>Good company is just <em>around the corner.</em></h2><p>Find your people, make a plan and see where a simple hello can lead.</p><div className="landing-cta-actions"><a className="landing-button" href={appHref("/auth")}>Sign up or log in <ArrowRight size={19} /></a><a href={appHref("/app")}>Explore the demo <ArrowUpRight size={17} /></a></div></div><div className="landing-cta-graphic" aria-hidden="true"><span /><span /><span /><span /></div></section>
      <footer className="landing-footer"><a className="landing-logo" href={appHref("/")}><span className="landing-logo-mark" aria-hidden="true"><i /><i /></span><span>friend<span>circle</span></span></a><span>A little closer, in real life.</span><small>Demo preview uses sample people and offers.</small></footer>
    </main>
  );
}
