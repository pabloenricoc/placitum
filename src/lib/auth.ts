import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { authConfig } from '@/lib/auth.config';
import { authenticateCredentials } from '@/lib/auth/credentials';
import { EscritorioInativoError } from '@/lib/auth/guards';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string' ? credentials.email : '';
        const password =
          typeof credentials?.password === 'string' ? credentials.password : '';

        try {
          return await authenticateCredentials(
            { email, password },
            {
              findUserByEmail: (e) =>
                prisma.user.findUnique({
                  where: { email: e },
                  include: { escritorio: true },
                }),
              verifyPassword: (plain, hash) => bcrypt.compare(plain, hash),
            },
          );
        } catch (err) {
          if (err instanceof EscritorioInativoError) return null;
          throw err;
        }
      },
    }),
  ],
});
