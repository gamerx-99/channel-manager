import type { Request, Response, NextFunction } from "express";

interface RateLimitStore {
  [ip: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const ip in store) {
    if (store[ip].resetTime < now) {
      delete store[ip];
    }
  }
}, 5 * 60 * 1000).unref();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Basic in-memory rate limiter middleware for Express.
 * Note: In a multi-instance production environment (e.g., serverless functions scaling up),
 * this only limits per-instance. For strict global limits, Redis/Upstash is recommended.
 */
export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    if (!store[ip]) {
      store[ip] = {
        count: 0,
        resetTime: now + options.windowMs,
      };
    }

    const record = store[ip];

    // Reset if window has passed
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + options.windowMs;
    }

    record.count++;

    if (record.count > options.max) {
      // 429 Too Many Requests
      return res.status(429).json({
        error: "Too Many Requests",
        message: options.message || "Too many requests from this IP, please try again later.",
      });
    }

    next();
  };
}
