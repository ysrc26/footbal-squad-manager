import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, ArrowRight, User, Phone, Home } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isResident, setIsResident] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setIsResident(profile.is_resident || false);
    }
  }, [profile]);

  // Check if this is first time setup (no name set yet)
  const isFirstTimeSetup = !profile?.full_name;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    
    // Only include is_resident on first time setup
    const updateData: Record<string, unknown> = {
      id: user.id,
      full_name: fullName,
      phone_number: user.phone || null,
      updated_at: new Date().toISOString(),
    };
    
    // Only set is_resident on first time setup
    if (isFirstTimeSetup) {
      updateData.is_resident = isResident;
    }
    
    const { error } = await supabase
      .from('profiles')
      .upsert(updateData);
    
    if (error) {
      toast.error('שגיאה בשמירת הפרופיל', {
        description: error.message,
      });
    } else {
      toast.success('הפרופיל נשמר בהצלחה!');
      await refreshProfile();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen gradient-dark">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center h-16 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold mr-2">פרופיל</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        <Card className="glass neon-border animate-fade-in">
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <User className="w-10 h-10 text-primary" />
            </div>
            <CardTitle>פרטי המשתמש</CardTitle>
            <CardDescription>עדכן את הפרטים שלך</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  שם מלא
                </Label>
                <Input
                  id="fullName"
                  placeholder="הזן את שמך המלא"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  מספר טלפון
                </Label>
                <Input
                  value={user?.phone || ''}
                  disabled
                  className="h-12 bg-muted"
                  dir="ltr"
                />
              </div>

              {isFirstTimeSetup ? (
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <Home className="h-5 w-5 text-primary" />
                    <div>
                      <Label htmlFor="isResident" className="text-base font-medium cursor-pointer">
                        תושב נחלים
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        תושבים מקבלים עדיפות בהרשמה
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="isResident"
                    checked={isResident}
                    onCheckedChange={setIsResident}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Home className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <span className="text-base font-medium">תושב נחלים</span>
                      <p className="text-sm text-muted-foreground">
                        {profile?.is_resident ? 'כן' : 'לא'} - לשינוי פנה למנהל
                      </p>
                    </div>
                  </div>
                  <Badge variant={profile?.is_resident ? 'default' : 'secondary'}>
                    {profile?.is_resident ? 'תושב' : 'לא תושב'}
                  </Badge>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold neon-glow"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  'שמור שינויים'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
