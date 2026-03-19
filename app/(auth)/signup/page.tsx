import { redirect } from 'next/navigation';

// Signup is handled by the auth modal — redirect to login which can open it
export default function SignupPage() {
  redirect('/login');
}
