import type { NextAuthConfig } from 'next-auth';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.escritorioId = user.escritorioId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.escritorioId = token.escritorioId;
      }
      return session;
    },
  },
};
