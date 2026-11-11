import React from "react";
import { Redirect } from "wouter";
import { emailTokenFromSearch, rememberEmailToken } from "@/lib/realEmailGate";

/**
 * The link in the add-email message lands here, signed in or not. The token is kept for the add-email screen, which
 * confirms it once the account is signed in (the private route sends a signed-out visitor to sign in first).
 */
export default function ConfirmEmailLink() {
  const token = emailTokenFromSearch(window.location.search);
  if (token) rememberEmailToken(token);
  return <Redirect to="/dashboard" replace />;
}
