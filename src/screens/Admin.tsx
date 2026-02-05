"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Users, Settings, QrCode, FileText, Home, User, ChevronLeft, Calendar, Bell, LogOut } from 'lucide-react';
import { UserManagement } from '@/components/admin/UserManagement';
import { AppSettings } from '@/components/admin/AppSettings';
import { QrCodeGenerator } from '@/components/admin/QrCodeGenerator';
import { RulesEditor } from '@/components/admin/RulesEditor';
import { GameManagement } from '@/components/admin/GameManagement';
import { PushNotifications } from '@/components/admin/PushNotifications';
import BottomNav from '@/components/BottomNav';

type AdminView = 'menu' | 'users' | 'settings' | 'qr' | 'rules' | 'games' | 'push';

export default function Admin() {
  const router = useRouter();
  const { isAdmin, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<AdminView>('menu');

  const adminCards = [
    {
      id: 'games' as AdminView,
      icon: Calendar,
      title: 'ניהול משחקים',
      description: 'יצירת וניהול משחקים',
      disabled: false,
    },
    {
      id: 'users' as AdminView,
      icon: Users,
      title: 'ניהול משתמשים',
      description: 'צפייה והרשאות',
      disabled: false,
    },
    {
      id: 'settings' as AdminView,
      icon: Settings,
      title: 'הגדרות אפליקציה',
      description: 'GPS, מפתח QR',
      disabled: false,
    },
    {
      id: 'qr' as AdminView,
      icon: QrCode,
      title: 'יצירת קוד QR',
      description: "לצ'ק-אין",
      disabled: false,
    },
    {
      id: 'rules' as AdminView,
      icon: FileText,
      title: 'עריכת חוקים',
      description: 'תוכן חוקי המשחק',
      disabled: false,
    },
    {
      id: 'push' as AdminView,
      icon: Bell,
      title: 'התראות פוש',
      description: 'שליחה ידנית של התראות',
      disabled: false,
    },
  ];

  const handleBack = () => {
    if (currentView === 'menu') {
      router.back();
    } else {
      setCurrentView('menu');
    }
  };

  const getTitle = () => {
    switch (currentView) {
      case 'games':
        return 'ניהול משחקים';
      case 'users':
        return 'ניהול משתמשים';
      case 'settings':
        return 'הגדרות אפליקציה';
      case 'qr':
        return 'יצירת קוד QR';
      case 'rules':
        return 'עריכת חוקים';
      case 'push':
        return 'התראות פוש';
      default:
        return 'ניהול מערכת';
    }
  };

  const renderContent = () => {
    switch (currentView) {
      case 'games':
        return <GameManagement />;
      case 'users':
        return <UserManagement />;
      case 'settings':
        return <AppSettings />;
      case 'qr':
        return <QrCodeGenerator />;
      case 'rules':
        return <RulesEditor />;
      case 'push':
        return <PushNotifications />;
      case 'menu':
      default:
        return (
          <div className="space-y-4">
            {adminCards.map((card, index) => (
              <Card 
                key={index} 
                className={`glass animate-fade-in ${card.disabled ? 'opacity-60' : 'hover:neon-border cursor-pointer'}`}
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => !card.disabled && setCurrentView(card.id)}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <card.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-lg">{card.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                  {card.disabled ? (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      בקרוב
                    </span>
                  ) : (
                    <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen gradient-dark pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center h-16 px-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold mr-2">{getTitle()}</h1>
          <div className="mr-auto">
            <Button variant="ghost" onClick={signOut} className="gap-2">
              <LogOut className="h-5 w-5" />
              התנתק
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        {renderContent()}
      </main>
      <BottomNav />
    </div>
  );
}
