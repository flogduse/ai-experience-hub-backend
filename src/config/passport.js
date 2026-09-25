import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../index.js';

const createUniqueUsername = async (email, displayName) => {
  const baseUsername = (displayName || email.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20) || 'user';

  let username = baseUsername;
  let count = 1;

  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${baseUsername}${count}`;
    count += 1;
  }

  return username;
};

export const configurePassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          'http://localhost:5000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error('Google account email not found.'), null);
          }

          let user = await prisma.user.findUnique({
            where: { googleId: profile.id },
          });

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
