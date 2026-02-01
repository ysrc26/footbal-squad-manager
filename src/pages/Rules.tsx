import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, FileText, Loader2 } from 'lucide-react';

export default function Rules() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRules = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('rules_content')
        .limit(1)
        .maybeSingle();
      
      const rulesContent = data as { rules_content: string | null } | null;
      setRules(rulesContent?.rules_content ?? null);
      setLoading(false);
    };

    fetchRules();
  }, []);

  return (
    <div className="min-h-screen gradient-dark pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center h-16 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold mr-2">חוקי המשחק</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        <Card className="glass animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              חוקים והנחיות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : rules ? (
              <div 
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: rules }}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  חוקי המשחק יפורסמו בקרוב
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
