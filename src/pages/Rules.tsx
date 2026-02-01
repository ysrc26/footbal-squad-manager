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
              <div className="space-y-2">
                {rules.split('\n').map((line, index) => {
                  // Parse inline bold text **text** -> <strong>
                  const parseInlineStyles = (text: string) => {
                    const parts = text.split(/(\*\*[^*]+\*\*)/g);
                    return parts.map((part, i) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
                      }
                      return part;
                    });
                  };

                  // Headers
                  if (line.startsWith('# ')) {
                    return <h1 key={index} className="text-2xl font-bold mb-4 text-primary">{parseInlineStyles(line.slice(2))}</h1>;
                  }
                  if (line.startsWith('## ')) {
                    return <h2 key={index} className="text-xl font-bold mt-6 mb-3">{parseInlineStyles(line.slice(3))}</h2>;
                  }
                  if (line.startsWith('### ')) {
                    return <h3 key={index} className="text-lg font-semibold mt-4 mb-2">{parseInlineStyles(line.slice(4))}</h3>;
                  }
                  // List items
                  if (line.startsWith('- ')) {
                    return (
                      <li key={index} className="mr-4 mb-1 list-disc list-inside">
                        {parseInlineStyles(line.slice(2))}
                      </li>
                    );
                  }
                  // Empty lines
                  if (line.trim() === '') {
                    return <br key={index} />;
                  }
                  // Regular paragraphs
                  return <p key={index} className="mb-2">{parseInlineStyles(line)}</p>;
                })}
              </div>
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
