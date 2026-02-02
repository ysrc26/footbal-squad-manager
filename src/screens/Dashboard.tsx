"use client";

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, User, Settings, FileText, Home } from 'lucide-react';
import Link from 'next/link';
import { GameRegistration } from '@/components/game/GameRegistration';

export default function Dashboard() {
  const { user, profile, isAdmin, signOut } = useAuth();

  return (
    <div className="min-h-screen gradient-dark pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16 px-4">
          <h1 className="text-xl font-bold neon-text">כדורגל נחלים</h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Badge variant="outline" className="border-primary text-primary">
                מנהל
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6 space-y-6">
        {/* Welcome Card */}
        <Card className="glass neon-border animate-fade-in">
          <CardHeader>
        <CardTitle className="flex items-center gap-3">
              {profile?.avatar_url ? (
                <img 
                  src={profile.avatar_url} 
                  alt="תמונת פרופיל"
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
              )}
              <div>
                <p className="text-lg">שלום,</p>
                <p className="text-2xl font-bold neon-text">
                  {profile?.full_name || 'משתמש חדש'}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile?.is_resident && (
              <Badge className="bg-primary/20 text-primary border border-primary">
                🏠 תושב נחלים
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Game Registration */}
        <GameRegistration />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/profile">
            <Card className="glass hover:neon-border transition-all cursor-pointer h-full">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <User className="h-8 w-8 text-primary mb-2" />
                <span className="font-medium">פרופיל</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/rules">
            <Card className="glass hover:neon-border transition-all cursor-pointer h-full">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <FileText className="h-8 w-8 text-primary mb-2" />
                <span className="font-medium">חוקים</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <Link href="/admin">
            <Card className="glass border-primary/50 hover:neon-border transition-all cursor-pointer">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-lg">ניהול מערכת</p>
                  <p className="text-sm text-muted-foreground">
                    הגדרות, משתמשים, QR
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 glass border-t border-border/50 backdrop-blur-xl">
        <div
          className={`container grid ${
            isAdmin ? "grid-cols-4" : "grid-cols-3"
          } items-center justify-items-center py-3`}
        >
          <Link
            href="/"
            className={`flex flex-col items-center gap-1 text-primary ${
              isAdmin ? "col-start-4" : "col-start-3"
            }`}
          >
            <Home className="h-6 w-6" />
            <span className="text-xs">ראשי</span>
          </Link>
          <Link
            href="/rules"
            className={`flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors ${
              isAdmin ? "col-start-3" : "col-start-2"
            }`}
          >
            <FileText className="h-6 w-6" />
            <span className="text-xs">חוקים</span>
          </Link>
          <Link
            href="/profile"
            className={`flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors ${
              isAdmin ? "col-start-2" : "col-start-1"
            }`}
          >
            <User className="h-6 w-6" />
            <span className="text-xs">הגדרות</span>
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="col-start-1 flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            >
              <Settings className="h-6 w-6" />
              <span className="text-xs">ניהול</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
