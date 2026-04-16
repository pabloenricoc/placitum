import { normalizeEmail } from './email';
import { assertEscritorioAtivo } from './guards';

export interface UserWithEscritorio {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordHash: string;
  escritorioId: string;
  escritorio: { id: string; ativo: boolean };
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  escritorioId: string;
}

export interface AuthCredentialsInput {
  email: string;
  password: string;
}

export interface AuthCredentialsDeps {
  findUserByEmail: (email: string) => Promise<UserWithEscritorio | null>;
  verifyPassword: (plain: string, hash: string) => Promise<boolean>;
}

export async function authenticateCredentials(
  input: AuthCredentialsInput,
  deps: AuthCredentialsDeps,
): Promise<AuthenticatedUser | null> {
  const email = normalizeEmail(input.email);
  if (!email || !input.password) return null;

  const user = await deps.findUserByEmail(email);
  if (!user) return null;

  const valid = await deps.verifyPassword(input.password, user.passwordHash);
  if (!valid) return null;

  assertEscritorioAtivo(user.escritorio);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    escritorioId: user.escritorioId,
  };
}
