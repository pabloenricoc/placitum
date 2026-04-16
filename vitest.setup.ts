import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('next/navigation', () => {
  const routerFns = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => routerFns,
    useSearchParams: () => searchParams,
    usePathname: () => '/',
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});
