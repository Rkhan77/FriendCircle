type BrandLogoProps = {
  href?: string;
  markOnly?: boolean;
  className?: string;
};

export default function BrandLogo({ href, markOnly = false, className = "" }: BrandLogoProps) {
  const classes = ["brand-logo", markOnly && "brand-logo--mark-only", className]
    .filter(Boolean)
    .join(" ");
  const logo = <>
    <svg className="brand-logo-mark" viewBox="0 0 36 30" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <circle cx="24" cy="18" r="10" stroke="currentColor" strokeWidth="4" />
    </svg>
    {!markOnly && <span className="brand-logo-word">friend<span>circle</span></span>}
  </>;
  return href
    ? <a className={classes} href={href} aria-label="FriendCircle home">{logo}</a>
    : <span className={classes}>{logo}</span>;
}
