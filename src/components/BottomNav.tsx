"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Home, Settings, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const isActive = (pathname: string, href: string) => {
  if (href === '/') return pathname === '/' || pathname === '/dashboard';
  return pathname.startsWith(href);
};

export default function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass border-t border-border/50 backdrop-blur-xl">
      <div className="container flex justify-around py-3">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 transition-colors ${
            isActive(pathname, '/') ? 'text-primary' : 'text-muted-foreground hover:text-primary'
          }`}
        >
          <Home className="h-6 w-6" />
          <span className="text-xs">ראשי</span>
        </Link>
        <Link
          href="/profile"
          className={`flex flex-col items-center gap-1 transition-colors ${
            isActive(pathname, '/profile') ? 'text-primary' : 'text-muted-foreground hover:text-primary'
          }`}
        >
          <User className="h-6 w-6" />
          <span className="text-xs">פרופיל</span>
        </Link>
        <Link
          href="/rules"
          className={`flex flex-col items-center gap-1 transition-colors ${
            isActive(pathname, '/rules') ? 'text-primary' : 'text-muted-foreground hover:text-primary'
          }`}
        >
          <FileText className="h-6 w-6" />
          <span className="text-xs">חוקים</span>
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className={`flex flex-col items-center gap-1 transition-colors ${
              isActive(pathname, '/admin') ? 'text-primary' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <Settings className="h-6 w-6" />
            <span className="text-xs">ניהול</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
