import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../lib/prisma.js';

// Generates a username-safe, unique handle from a Google profile.
// Min length is 3 to satisfy the username validation rule.
const createUniqueUsername = async (email, displayName) => {
  const base = ((displayName || email.split('@')[0]) || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);

  const safeBase = base.length >= 3 ? base : `user${base || ''}`.slice(0, 20).padEnd(3, '0');

  let username = safeBase;
  let count = 1;

  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${safeBase}${count}`;
    count += 1;
  }

  return username;
};

// Registers the Google OAuth2 strategy.
// Deliberately tolerant of missing Google credentials: the strategy simply
// isn't registered and a warning is logged, so the rest of the API still
// boots for local dev without GOOGLE_* env vars.
export const configurePassport = () => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn(
      '⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google login disabled ' +
      '(email/password auth still works). See .env.example to enable it.'
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL:
          GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error('Google account email not found.'), null);
          }

          // Existing Google user?
          let user = await prisma.user.findUnique({
            where: { googleId: profile.id },
          });

          // Otherwise, link to an existing email/password account.
          if (!user) {
            user = await prisma.user.findUnique({ where: { email } });
          }

          if (user) {
            if (!user.googleId) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { googleId: profile.id },
              });
            }

            return done(null, user);
          }

          // Brand-new user via Google.
          const username = await createUniqueUsername(email, profile.displayName);

          user = await prisma.user.create({
            data: {
              email,
              username,
              googleId: profile.id,
            },
          });

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
};
