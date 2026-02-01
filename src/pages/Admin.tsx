import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Users, Settings, QrCode, FileText, Home, User } from 'lucide-react';

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const adminCards = [
    {
      icon: Users,
      title: 'ניהול משתמשים',
      description: 'צפייה והרשאות',
      disabled: true,
    },
    {
      icon: Settings,
      title: 'הגדרות אפליקציה',
      description: 'GPS, מפתח QR',
      disabled: true,
    },
    {
      icon: QrCode,
      title: 'יצירת קוד QR',
      description: "לצ'ק-אין",
      disabled: true,
    },
    {
      icon: FileText,
      title: 'עריכת חוקים',
      description: 'תוכן חוקי המשחק',
      disabled: true,
    },
  ];

  return (
    <div className="min-h-screen gradient-dark pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center h-16 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold mr-2">ניהול מערכת</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6 space-y-4">
        {adminCards.map((card, index) => (
          <Card 
            key={index} 
            className={`glass animate-fade-in ${card.disabled ? 'opacity-60' : 'hover:neon-border cursor-pointer'}`}
            style={{ animationDelay: `${index * 100}ms` }}
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
              {card.disabled && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  בקרוב
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 glass border-t border-border/50 backdrop-blur-xl">
        <div className="container flex justify-around py-3">
          <Link to="/" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
            <Home className="h-6 w-6" />
            <span className="text-xs">ראשי</span>
          </Link>
          <Link to="/profile" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
            <User className="h-6 w-6" />
            <span className="text-xs">פרופיל</span>
          </Link>
          <Link to="/rules" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
            <FileText className="h-6 w-6" />
            <span className="text-xs">חוקים</span>
          </Link>
          {isAdmin && (
            <Link to="/admin" className="flex flex-col items-center gap-1 text-primary">
              <Settings className="h-6 w-6" />
              <span className="text-xs">ניהול</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
