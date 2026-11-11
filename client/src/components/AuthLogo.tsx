import React from "react";
import { Link } from "wouter";

/** The hayhost logo shown at the top of every sign-in style page, in a light tile so it reads on the brick side panel. */
export function AuthLogo({ href }: { href?: string }) {
  const image = <img src="/logo-wide.png" alt="hayhost" width={157} height={40} />;
  return href
    ? <Link href={href} className="login-logo">{image}</Link>
    : <div className="login-logo">{image}</div>;
}
