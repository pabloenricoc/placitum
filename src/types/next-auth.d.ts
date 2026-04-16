import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    role: string;
    escritorioId: string;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      escritorioId: string;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: string;
    escritorioId: string;
  }
}
