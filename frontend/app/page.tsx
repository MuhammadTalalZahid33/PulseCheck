import { redirect } from 'next/navigation';

/**
 * The proxy already bounces logged-out visitors to /login, so anyone reaching
 * here has a session cookie.
 */
export default function HomePage() {
  redirect('/dashboard');
}
